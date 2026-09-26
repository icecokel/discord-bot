import fs from "node:fs";
import path from "node:path";
import type { Page } from "playwright";
import { isXPost, X_ACCOUNT, xPostUrl } from "../../utils/x-monitor-store";
import type { XPost } from "../../utils/x-monitor-store";

export interface XProfileResult {
  posts: XPost[];
  complete: boolean;
}

// Runs inside Chromium; keep this function self-contained for DOM regression checks.
export const readXArticles = (account: string) => {
  return [...document.querySelectorAll("main article")]
    .filter((article) => !article.parentElement?.closest("article"))
    .flatMap((article) => {
      const copy = article.cloneNode(true) as HTMLElement;
      copy.querySelectorAll('article, [data-testid="quoteTweet"], [data-href][role="link"]')
        .forEach((quote) => quote.remove());
      const links = [...copy.querySelectorAll<HTMLAnchorElement>("a[href]")];
      const permalink = links.find((link) => {
        const url = new URL(link.getAttribute("href")!, "https://x.com");
        return url.origin === "https://x.com" &&
          /^\/[^/]+\/status\/[1-9]\d{0,19}$/.test(url.pathname) &&
          !url.pathname.startsWith("/i/status/") &&
          (link.querySelector("time") || !link.getAttribute("aria-label"));
      });
      if (!permalink) throw new Error("parse-failed: 게시물 링크 없음");
      const [, author, , id] = new URL(permalink.getAttribute("href")!, "https://x.com").pathname.split("/");
      if (author.toLowerCase() !== account) return [];
      // Require a matching profile link before the permalink, outside the quote/body.
      const authorLink = links.slice(0, links.indexOf(permalink)).some((link) =>
        new URL(link.getAttribute("href")!, "https://x.com").pathname.toLowerCase() === `/${account}`);
      if (!authorLink) throw new Error("parse-failed: 작성자 확인 실패");
      if (copy.querySelector('[data-testid="socialContext"]')?.textContent?.match(/reposted|재게시/i)) return [];
      const body = copy.querySelector<HTMLElement>('[data-testid="tweetText"]') ||
        copy.querySelector<HTMLElement>('div[dir="auto"].whitespace-pre-wrap');
      const hasMedia = Boolean(copy.querySelector('video, [data-testid="tweetPhoto"], img[src*="/media/"]'));
      if (!body && !hasMedia) throw new Error("parse-failed: 본문 구조 확인 실패");
      const expanded = !body?.querySelector("button") &&
        !body?.className.match(/line-clamp-/) &&
        !copy.querySelector('[data-testid="tweet-text-show-more-link"]');
      body?.querySelectorAll("button").forEach((button) => button.remove());
      if (!body?.textContent?.trim() && !hasMedia) throw new Error("parse-failed: 빈 본문");
      const datetime = copy.querySelector("time[datetime]")?.getAttribute("datetime");
      return [{
        id,
        text: body?.textContent?.trim() || "미디어 게시물",
        textComplete: expanded,
        publishedAt: datetime && Number.isFinite(Date.parse(datetime)) ? datetime : undefined,
        pinned: Boolean(copy.querySelector('[data-testid="socialContext"]')?.textContent?.match(/pinned|고정/i)),
      }];
    });
};

const readPage = async (page: Page) => {
  try {
    return await page.evaluate(readXArticles, X_ACCOUNT);
  } catch {
    throw new Error("parse-failed: 게시물 DOM 확인 필요");
  }
};

export const fetchXProfile = async (checkpoint?: string): Promise<XProfileResult> => {
  const startedAt = Date.now();
  // Resolve before loading Playwright; its browser registry reads this at import time.
  process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.resolve(".local/ms-playwright");
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    // Headed Chromium works with this profile; headless is opt-in after local verification.
    headless: process.env.X_MONITOR_HEADLESS === "true",
    timeout: 30_000,
  });
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    void browser.close().catch(() => {});
  }, Math.max(1, 120_000 - (Date.now() - startedAt)));
  try {
    const authPath = path.resolve(".local/x-auth-state.json");
    const context = await browser.newContext({
      locale: "en-US",
      storageState: fs.existsSync(authPath) ? authPath : undefined,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    const response = await page.goto(`https://x.com/${X_ACCOUNT}`, { waitUntil: "domcontentloaded" });
    if (response && response.status() >= 400) throw new Error("blocked: X 접근 제한");
    try {
      await page.locator("main article").first().waitFor();
    } catch {
      const login = await page.locator('input[autocomplete="username"], input[type="password"]').count();
      throw new Error(login || /login|onboarding/.test(page.url())
        ? "auth-required: X 로그인 필요" : "fetch-failed: 게시물 로딩 실패");
    }
    if (new URL(page.url()).pathname.toLowerCase() !== `/${X_ACCOUNT}`) {
      throw new Error("fetch-failed: 대상 프로필에서 다른 페이지로 이동됨");
    }
    const posts = new Map<string, XPost>();
    const unpinnedIds = new Set<string>();
    let complete = false;
    let stalled = 0;
    for (let scroll = 0; scroll <= 10; scroll += 1) {
      const batch = await readPage(page);
      const previousSize = posts.size;
      for (const post of batch) {
        if (posts.size >= 100 && !posts.has(post.id)) break;
        if (!post.pinned) unpinnedIds.add(post.id);
        posts.set(post.id, {
          id: post.id, url: xPostUrl(post.id), text: post.text,
          textComplete: post.textComplete, publishedAt: post.publishedAt,
          observedAt: new Date().toISOString(),
        });
      }
      if (!posts.size) throw new Error("parse-failed: 대상 게시물 0건");
      // ponytail: bounded recent-feed crawl; expand the window if coverage gaps persist.
      const crossedCheckpoint = checkpoint && unpinnedIds.has(checkpoint) &&
        batch.some((post) => !post.pinned && BigInt(post.id) < BigInt(checkpoint));
      // The initial baseline is the successfully read recent window, not the entire history.
      // Empty/invalid/blocked responses still fail before reaching this point.
      if (!checkpoint || crossedCheckpoint) {
        complete = true;
        break;
      }
      stalled = posts.size === previousSize ? stalled + 1 : 0;
      if (stalled >= 2) {
        const loading = await page.locator('[role="progressbar"], [role="status"]').count();
        // A stalled loader is not a verified end of the feed.
        complete = loading === 0 && unpinnedIds.has(checkpoint);
        break;
      }
      await page.evaluate(() => {
        let node: Element | null = document.querySelector("main article");
        while (node && !(node.scrollHeight > node.clientHeight && /auto|scroll/.test(getComputedStyle(node).overflowY))) {
          node = node.parentElement;
        }
        if (node) node.scrollBy(0, Math.max(node.clientHeight, 800));
        else window.scrollBy(0, Math.max(window.innerHeight, 800));
      });
      await page.waitForTimeout(1_000);
    }
    // Read full text for the initial preview as well as newly discovered posts.
    for (const post of posts.values()) {
      if (timedOut) break;
      if (post.textComplete) continue;
      try {
        await page.goto(post.url, { waitUntil: "domcontentloaded", timeout: 8_000 });
        await page.locator("main article").first().waitFor({ timeout: 5_000 });
        const detail = (await readPage(page)).find((item) => item.id === post.id);
        if (detail && detail.text.length >= post.text.length) {
          post.text = detail.text;
          post.textComplete = detail.textComplete;
          post.publishedAt = detail.publishedAt;
        }
      } catch {
        // Keep the explicitly labelled excerpt when the detail page cannot be read.
      }
    }
    const result = [...posts.values()];
    if (!result.every(isXPost)) throw new Error("parse-failed: 게시물 데이터 형식 오류");
    return { posts: result, complete: complete && !timedOut };
  } finally {
    clearTimeout(timeout);
    await browser.close();
  }
};
