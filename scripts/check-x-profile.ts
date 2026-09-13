import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fetchXProfile, readXArticles } from "../src/features/x-monitor/x-profile-source";

async function main(): Promise<void> {
  process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.resolve(".local/ms-playwright");
  process.env.TMPDIR = path.resolve(".local/browser-tmp");
  fs.mkdirSync(process.env.TMPDIR, { recursive: true });
  if (process.argv.includes("--live")) {
    const result = await fetchXProfile();
    const previewPath = path.resolve(".local/x-profile-preview.json");
    fs.writeFileSync(previewPath, JSON.stringify({ checkedAt: new Date().toISOString(), ...result }, null, 2) + "\n");
    console.log(JSON.stringify({ count: result.posts.length, complete: result.complete,
      fullTextCount: result.posts.filter((post) => post.textComplete).length, previewPath }));
    assert(result.complete, "기준선 수집 범위 미확인");
    return;
  }
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.route("**/*", (route) => route.abort());
    const header = (id: string, account = "thsottiaux") =>
      `<a href="/${account}">@${account}</a><a href="/${account}/status/${id}">Sep 14</a>`;
    await page.setContent(`<main>
      <article>${header("101")}<div dir="auto" class="whitespace-pre-wrap">Outer post</div>
        <article>${header("999", "other")}<div dir="auto" class="whitespace-pre-wrap">Quoted post</div></article>
        <button aria-label="Like">999 likes</button></article>
      <article>${header("102")}<div dir="auto" class="whitespace-pre-wrap">Long excerpt<button>Show more</button></div></article>
      <article>${header("103")}<img src="https://pbs.twimg.com/media/example.jpg"></article>
      <article>${header("104", "other")}<div data-testid="tweetText">Other author</div></article>
      <article>${header("105")}<div data-testid="socialContext">You reposted</div><div data-testid="tweetText">Repost</div></article>
      <article>${header("106")}<div data-testid="tweetText">Standard DOM</div><time datetime="2026-09-14T00:00:00Z"></time></article>
    </main>`);
    const posts = await page.evaluate(readXArticles, "thsottiaux");
    assert.deepEqual(posts.map(p => p.id), ["101", "102", "103", "106"]);
    assert.equal(posts[0].text, "Outer post");
    assert.equal(posts[1].text, "Long excerpt");
    assert.equal(posts[1].textComplete, false);
    assert.equal(posts[2].text, "미디어 게시물");
    assert.equal(posts[3].publishedAt, "2026-09-14T00:00:00Z");
    await page.setContent(`<main><article>${header("107")}<div>Unknown layout</div></article></main>`);
    await assert.rejects(page.evaluate(readXArticles, "thsottiaux"), /parse-failed/);
    console.log("X DOM checks passed: nested quote, author, excerpt, media, repost, time, unknown layout");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "X profile check failed");
  process.exitCode = 1;
});
