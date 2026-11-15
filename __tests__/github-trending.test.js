const mockGenerate = jest.fn();
jest.mock("../src/core/ai", () => ({
  aiService: { generateTextWithProviderOnly: (...args) => mockGenerate(...args) },
}));

const {
  parseTrendingPage, judgeContribution, fetchContributionStatus, fetchTrendingRepos,
} = require("../src/features/github-trending/github-trending-source");
const { summarizeTrendingRepos } = require("../src/features/github-trending/github-trending-summary");
const { buildTrendingMessages, formatTrendingRepo } = require("../src/features/github-trending/github-trending-message");
const { sendGitHubTrending } = require("../src/features/github-trending/github-trending-service");

// Mirrors the markup of github.com/trending (2026-11) with only the parts the parser reads.
const row = ({ owner, name, description, language = "TypeScript", stars = "1,234" }) => `
<article class="Box-row">
  <div class="float-right d-flex"><a href="/login?return_to=%2F${owner}%2F${name}">Star</a></div>
  <h2 class="h3 lh-condensed">
    <a data-hydro-click="{}" href="/${owner}/${name}" class="Link"><svg></svg>
      <span class="text-normal">${owner} /</span>
      ${name}</a>  </h2>
  ${description === undefined ? "" : `<p class="col-9 color-fg-muted my-1 tmp-pr-4">\n      ${description}\n    </p>`}
  <div class="f6 color-fg-muted mt-2">
    <span itemprop="programmingLanguage">${language}</span>
    <a href="/${owner}/${name}/stargazers">99,999</a>
    <span class="d-inline-block float-sm-right"><svg></svg>
        ${stars} stars today</span>
  </div>
</article>`;

const page = (rows) => `<html><body><div>${rows.join("\n")}</div></body></html>`;

const jsonResponse = (body, status = 200) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });

describe("trending page parsing", () => {
  test("reads rank, repo, decoded description, language and stars today", () => {
    const repos = parseTrendingPage(page([
      row({ owner: "backnotprop", name: "plannotator", description: "Plan &amp; review with <g-emoji>🚀</g-emoji> agents" }),
      row({ owner: "foo", name: "no-desc.js", description: undefined, stars: "87" }),
    ]));
    expect(repos).toEqual([
      { rank: 1, fullName: "backnotprop/plannotator", url: "https://github.com/backnotprop/plannotator",
        description: "Plan & review with 🚀 agents", language: "TypeScript", starsToday: 1234 },
      { rank: 2, fullName: "foo/no-desc.js", url: "https://github.com/foo/no-desc.js", language: "TypeScript", starsToday: 87 },
    ]);
  });

  test("limits to the requested count and skips duplicates", () => {
    const rows = Array.from({ length: 15 }, (_, i) => row({ owner: "o", name: `r${i % 12}`, description: "d" }));
    const repos = parseTrendingPage(page(rows), 10);
    expect(repos).toHaveLength(10);
    expect(new Set(repos.map((repo) => repo.fullName)).size).toBe(10);
    expect(repos.map((repo) => repo.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  test("fails loudly when the page structure changes", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "<html>new layout</html>" });
    await expect(fetchTrendingRepos(10, fetchImpl)).rejects.toThrow("페이지 구조");
    fetchImpl.mockResolvedValue({ ok: false, status: 429, text: async () => "" });
    await expect(fetchTrendingRepos(10, fetchImpl)).rejects.toThrow("HTTP 429");
  });
});

describe("contribution status", () => {
  test.each([
    [{ archived: true }, [], { kind: "archived" }],
    [{ has_issues: false }, [], { kind: "issues-disabled" }],
    [{}, [{ pull_request: {} }], { kind: "no-open-issues" }],
    [{}, [{ labels: [{ name: "bug" }] }, { pull_request: {}, labels: [{ name: "good first issue" }] }], { kind: "open", openIssues: 1 }],
    [{}, [{ labels: [{ name: "Good First Issue" }] }, { labels: ["help wanted"] }, { labels: [] }],
      { kind: "beginner", beginnerIssues: 2, openIssues: 3 }],
  ])("judges %j", (repo, issues, expected) => {
    expect(judgeContribution(repo, issues)).toEqual(expected);
  });

  test("uses one repo call plus one issues call and sends the token when configured", async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ archived: false, has_issues: true }))
      .mockResolvedValueOnce(jsonResponse([{ labels: [{ name: "good-first-issue" }] }]));
    await expect(fetchContributionStatus("o/r", "tkn", fetchImpl)).resolves.toEqual({ kind: "beginner", beginnerIssues: 1, openIssues: 1 });
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      "https://api.github.com/repos/o/r",
      "https://api.github.com/repos/o/r/issues?state=open&per_page=50",
    ]);
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe("Bearer tkn");
  });

  test("skips the issues call for archived repos and reports API failures as unknown", async () => {
    const archived = jest.fn().mockResolvedValue(jsonResponse({ archived: true }));
    await expect(fetchContributionStatus("o/r", undefined, archived)).resolves.toEqual({ kind: "archived" });
    expect(archived).toHaveBeenCalledTimes(1);
    expect(archived.mock.calls[0][1].headers).not.toHaveProperty("Authorization");
    const limited = jest.fn().mockResolvedValue(jsonResponse({}, 403));
    await expect(fetchContributionStatus("o/r", undefined, limited)).resolves.toEqual({ kind: "unknown", reason: "GitHub API 속도 제한" });
  });
});

describe("Korean summaries", () => {
  test("keeps only Korean summaries for known repos", async () => {
    mockGenerate.mockResolvedValue({ text: JSON.stringify({ summaries: [
      { repo: "a/one", summary: "  에이전트 작업을   계획하고 리뷰하는 도구 " },
      { repo: "b/two", summary: "English only" },
      { repo: "evil/injected", summary: "주입된 항목" },
    ] }) });
    const summaries = await summarizeTrendingRepos([
      { rank: 1, fullName: "a/one", url: "", description: "Plan agents" },
      { rank: 2, fullName: "b/two", url: "" },
    ]);
    expect([...summaries]).toEqual([["a/one", "에이전트 작업을 계획하고 리뷰하는 도구"]]);
    const [provider, prompt, options] = mockGenerate.mock.calls[0];
    expect(provider).toBe("claude");
    expect(JSON.parse(prompt).repos).toEqual([
      { repo: "a/one", description: "Plan agents" }, { repo: "b/two" },
    ]);
    expect(options.systemInstruction).toContain("untrusted data");
  });
});

describe("message format", () => {
  const view = (rank, overrides = {}) => ({
    rank, fullName: `o/r${rank}`, url: `https://github.com/o/r${rank}`,
    description: "Original *desc*", contribution: { kind: "beginner", beginnerIssues: 3, openIssues: 20 }, ...overrides,
  });

  test("renders the requested numbered layout with contribution status and summary", () => {
    expect(formatTrendingRepo(view(1, { summary: "한국어 요약" }))).toBe(
      "1. <https://github.com/o/r1> (✅ 기여 가능 · 입문 이슈 3개)\n - 한국어 요약",
    );
    expect(formatTrendingRepo(view(2, { contribution: { kind: "archived" } }))).toBe(
      "2. <https://github.com/o/r2> (⛔ 기여 불가 · 보관된 저장소)\n - Original \\*desc\\*",
    );
    expect(formatTrendingRepo(view(3, { description: undefined, contribution: { kind: "open", openIssues: 50 } })))
      .toBe("3. <https://github.com/o/r3> (✅ 기여 가능 · 열린 이슈 50개+)\n - 설명 없음");
  });

  test("starts with a dated header and splits under the Discord limit", () => {
    const repos = Array.from({ length: 10 }, (_, i) => view(i + 1, { summary: "가".repeat(150) }));
    const messages = buildTrendingMessages(repos, new Date("2026-11-16T01:00:00Z"));
    expect(messages[0]).toMatch(/^🔥 \*\*GitHub 트렌딩 Top 10\*\* · 11\. 16\. \(월\)/);
    expect(messages.every((message) => message.length <= 2000)).toBe(true);
    expect(messages.join("\n\n").match(/^\d+\. </gm)).toHaveLength(10);
  });
});

describe("daily digest", () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  test("sends the digest and reports partial results when summaries or checks fail", async () => {
    global.fetch = jest.fn(async (url) => {
      if (url.startsWith("https://github.com/trending")) {
        return { ok: true, status: 200, text: async () => page([row({ owner: "a", name: "one", description: "x" }), row({ owner: "b", name: "two", description: "y" })]) };
      }
      if (url.includes("/repos/b/two")) return jsonResponse({}, 500);
      return jsonResponse(url.endsWith("/issues?state=open&per_page=50") ? [] : { has_issues: true });
    });
    mockGenerate.mockRejectedValue(new Error("Claude 응답 시간이 초과되었습니다."));
    const send = jest.fn().mockResolvedValue(undefined);

    const result = await sendGitHubTrending("admin", send, () => new Date("2026-11-16T01:00:00Z"));

    expect(result.status).toBe("partial");
    expect(result.detail).toContain("트렌딩 2개 DM 전송");
    expect(result.detail).toContain("Claude 요약 실패");
    expect(result.detail).toContain("기여 여부 확인 실패 1건");
    const content = send.mock.calls[0][1][0].content;
    expect(content).toContain("1. <https://github.com/a/one> (🟡 기여 어려움 · 열린 이슈 없음)\n - x");
    expect(content).toContain("2. <https://github.com/b/two> (❔ 기여 여부 확인 실패)\n - y");
  });

  test("fails without sending when the trending page cannot be read", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503, text: async () => "" });
    const send = jest.fn();
    await expect(sendGitHubTrending("admin", send)).resolves.toEqual({
      status: "failure", detail: "GitHub 트렌딩 페이지 조회 실패 (HTTP 503)",
    });
    expect(send).not.toHaveBeenCalled();
    await expect(sendGitHubTrending(undefined, send)).resolves.toMatchObject({ status: "failure" });
  });
});
