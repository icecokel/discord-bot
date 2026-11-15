const {
  DEFAULT_GITHUB_ACTIONS_REPO,
  fetchWorkflowRuns,
  getGitHubActionsMonitorConfig,
  getRateLimitRetryAt,
  GitHubRateLimitError,
  parseWorkflowRunsResponse,
} = require("../src/features/github-actions-monitor/github-actions-source");

const NOW = new Date("2026-11-15T01:00:00.000Z");

const apiRun = (overrides = {}) => ({
  id: 1001,
  run_attempt: 1,
  name: "Production Chat Smoke",
  status: "completed",
  conclusion: "failure",
  head_branch: "main",
  head_sha: "4641d2cf0123456789abcdef0123456789abcdef",
  event: "schedule",
  html_url: "https://github.com/icecokel/VSCoke/actions/runs/1001",
  created_at: "2026-11-15T00:17:00Z",
  updated_at: "2026-11-15T00:24:00Z",
  ...overrides,
});

const response = ({ status = 200, body = { total_count: 1, workflow_runs: [apiRun()] }, headers = {} } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers(headers),
  json: jest.fn().mockResolvedValue(body),
});

describe("GitHub Actions 감시 설정", () => {
  test("기본값은 VSCoke 저장소의 smoke·API 배포 워크플로다", () => {
    expect(getGitHubActionsMonitorConfig({})).toEqual({
      repo: DEFAULT_GITHUB_ACTIONS_REPO,
      workflows: ["production-chat-smoke.yml", "deploy-api.yml"],
      token: undefined,
    });
    expect(DEFAULT_GITHUB_ACTIONS_REPO).toBe("icecokel/VSCoke");
  });

  test("저장소·워크플로 목록과 토큰을 env로 바꿀 수 있다", () => {
    expect(getGitHubActionsMonitorConfig({
      GITHUB_ACTIONS_MONITOR_REPO: " owner/repo ",
      GITHUB_ACTIONS_MONITOR_WORKFLOWS: "a.yml, b.yaml  a.yml,123",
      GITHUB_TOKEN: " secret ",
    })).toEqual({ repo: "owner/repo", workflows: ["a.yml", "b.yaml", "123"], token: "secret" });
  });

  test.each([
    [{ GITHUB_ACTIONS_MONITOR_REPO: "no-slash" }, /owner\/repo/],
    [{ GITHUB_ACTIONS_MONITOR_REPO: "a/b/c" }, /owner\/repo/],
    [{ GITHUB_ACTIONS_MONITOR_WORKFLOWS: "../evil.yml" }, /워크플로/],
    [{ GITHUB_ACTIONS_MONITOR_WORKFLOWS: "1,2,3,4,5,6" }, /최대 5개/],
  ])("잘못된 설정 %p는 거부한다", (env, message) => {
    expect(() => getGitHubActionsMonitorConfig(env)).toThrow(message);
  });

  test("토큰이 있으면 워크플로 6개 이상도 허용한다", () => {
    expect(getGitHubActionsMonitorConfig({
      GITHUB_ACTIONS_MONITOR_WORKFLOWS: "1,2,3,4,5,6",
      GITHUB_TOKEN: "t",
    }).workflows).toHaveLength(6);
  });
});

describe("GitHub Actions 응답 파싱", () => {
  test("완료된 실행을 내부 형식으로 바꾼다", () => {
    expect(parseWorkflowRunsResponse({ workflow_runs: [apiRun({ run_attempt: 2 })] })).toEqual([{
      id: 1001,
      runAttempt: 2,
      name: "Production Chat Smoke",
      conclusion: "failure",
      headBranch: "main",
      headSha: "4641d2cf0123456789abcdef0123456789abcdef",
      event: "schedule",
      htmlUrl: "https://github.com/icecokel/VSCoke/actions/runs/1001",
      completedAt: "2026-11-15T00:24:00.000Z",
    }]);
  });

  test("형식이 깨지거나 완료되지 않았거나 GitHub 외 링크인 실행은 건너뛴다", () => {
    const runs = parseWorkflowRunsResponse({
      workflow_runs: [
        apiRun({ id: "1" }),
        apiRun({ id: 2, status: "in_progress" }),
        apiRun({ id: 3, html_url: "https://evil.example/runs/3" }),
        apiRun({ id: 4, updated_at: "not-a-date" }),
        null,
        apiRun({ id: 5, run_attempt: undefined, head_branch: null, name: "" }),
      ],
    });
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ id: 5, runAttempt: 1, headBranch: null, name: "" });
  });

  test("workflow_runs가 없으면 오류로 본다", () => {
    expect(() => parseWorkflowRunsResponse({ message: "x" })).toThrow("workflow_runs 없음");
    expect(() => parseWorkflowRunsResponse(null)).toThrow("workflow_runs 없음");
  });
});

describe("GitHub Actions 조회", () => {
  test("완료 실행 목록 API를 호출하고 토큰은 Authorization 헤더로만 보낸다", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response({
      headers: { "x-ratelimit-remaining": "57", "x-ratelimit-reset": "1763170000" },
    }));
    const result = await fetchWorkflowRuns(
      { repo: "icecokel/VSCoke", token: "secret-token" }, "deploy-api.yml", NOW, fetchImpl,
    );
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(
      "https://api.github.com/repos/icecokel/VSCoke/actions/workflows/deploy-api.yml/runs?status=completed&per_page=20",
    );
    expect(url).not.toContain("secret-token");
    expect(init.headers).toMatchObject({
      Accept: "application/vnd.github+json",
      Authorization: "Bearer secret-token",
      "User-Agent": expect.any(String),
    });
    expect(init.signal).toBeDefined();
    expect(result.runs).toHaveLength(1);
    expect(result.rateLimit).toEqual({ remaining: 57, resetAt: new Date(1763170000 * 1000).toISOString() });
  });

  test("토큰이 없으면 Authorization 헤더를 보내지 않는다", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response());
    await fetchWorkflowRuns({ repo: "icecokel/VSCoke" }, "deploy-api.yml", NOW, fetchImpl);
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  test("HTTP 오류는 본문 없이 상태 코드만 알린다", async () => {
    const notFound = response({ status: 404, body: { message: "Not Found from 1.2.3.4" } });
    await expect(fetchWorkflowRuns({ repo: "a/b" }, "x.yml", NOW, jest.fn().mockResolvedValue(notFound)))
      .rejects.toThrow("HTTP 404 · 저장소 또는 워크플로 파일 확인 필요");
    const serverError = response({ status: 502 });
    await expect(fetchWorkflowRuns({ repo: "a/b" }, "x.yml", NOW, jest.fn().mockResolvedValue(serverError)))
      .rejects.toThrow(/^HTTP 502$/);
  });

  test("네트워크 오류와 JSON 오류를 전파한다", async () => {
    await expect(fetchWorkflowRuns({ repo: "a/b" }, "x.yml", NOW, jest.fn().mockRejectedValue(new TypeError("fetch failed"))))
      .rejects.toThrow("fetch failed");
    const bad = response();
    bad.json.mockRejectedValue(new SyntaxError("Unexpected token"));
    await expect(fetchWorkflowRuns({ repo: "a/b" }, "x.yml", NOW, jest.fn().mockResolvedValue(bad)))
      .rejects.toThrow("JSON 아님");
  });

  test("시간 초과(AbortError)는 한국어 오류로 바꾼다", async () => {
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    await expect(fetchWorkflowRuns({ repo: "a/b" }, "x.yml", NOW, jest.fn().mockRejectedValue(abort)))
      .rejects.toThrow("요청 시간 초과(10초)");
  });

  test("403 + 남은 횟수 0이면 reset 시각까지 기다리는 속도 제한 오류를 낸다", async () => {
    const limited = response({
      status: 403,
      headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1763172000" },
    });
    const error = await fetchWorkflowRuns({ repo: "a/b" }, "x.yml", NOW, jest.fn().mockResolvedValue(limited))
      .catch(caught => caught);
    expect(error).toBeInstanceOf(GitHubRateLimitError);
    expect(error.retryAt).toBe(new Date(1763172000 * 1000).toISOString());
  });
});

describe("속도 제한 재시도 시각", () => {
  test("retry-after를 우선한다", () => {
    expect(getRateLimitRetryAt(429, new Headers({ "retry-after": "120" }), NOW))
      .toBe("2026-11-15T01:02:00.000Z");
    expect(getRateLimitRetryAt(403, new Headers({
      "retry-after": "30", "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1763172000",
    }), NOW)).toBe("2026-11-15T01:00:30.000Z");
  });

  test("헤더 없는 429는 1분 뒤, 헤더 없는 403과 다른 상태는 속도 제한이 아니다", () => {
    expect(getRateLimitRetryAt(429, new Headers(), NOW)).toBe("2026-11-15T01:01:00.000Z");
    expect(getRateLimitRetryAt(403, new Headers({ "x-ratelimit-remaining": "10" }), NOW)).toBeUndefined();
    expect(getRateLimitRetryAt(500, new Headers({ "retry-after": "5" }), NOW)).toBeUndefined();
  });
});
