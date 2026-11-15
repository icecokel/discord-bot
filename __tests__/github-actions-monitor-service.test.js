let stored;
let writeResult = true;

jest.mock("../src/utils/file-manager", () => ({
  readJson: jest.fn((_filename, defaultValue) => (stored === undefined ? defaultValue : JSON.parse(JSON.stringify(stored)))),
  writeJson: jest.fn((_filename, data) => {
    if (!writeResult) return false;
    stored = JSON.parse(JSON.stringify(data));
    return true;
  }),
}));

const {
  BASELINE_LOOKBACK_MS,
  checkGitHubActionsRuns,
  markGitHubActionsEventsNotified,
  runGitHubActionsMonitor,
} = require("../src/features/github-actions-monitor/github-actions-monitor-service");
const { readJson, writeJson } = require("../src/utils/file-manager");

const NOW = new Date("2026-11-15T03:00:00.000Z");
const SMOKE_KEY = "icecokel/VSCoke/production-chat-smoke.yml";
const DEPLOY_KEY = "icecokel/VSCoke/deploy-api.yml";
const CONFIG = {
  repo: "icecokel/VSCoke",
  workflows: ["production-chat-smoke.yml", "deploy-api.yml"],
};

const hoursAgo = hours => new Date(NOW.getTime() - hours * 3600_000).toISOString();

const apiRun = (id, conclusion, completedHoursAgo, overrides = {}) => ({
  id,
  run_attempt: 1,
  name: "Production Chat Smoke",
  status: "completed",
  conclusion,
  head_branch: "main",
  head_sha: `${id}abcdef0123456789`,
  event: "schedule",
  html_url: `https://github.com/icecokel/VSCoke/actions/runs/${id}`,
  updated_at: hoursAgo(completedHoursAgo),
  ...overrides,
});

const okResponse = (runs, headers = {}) => ({
  ok: true,
  status: 200,
  headers: new Headers(headers),
  json: async () => ({ total_count: runs.length, workflow_runs: runs }),
});

const errorResponse = (status, headers = {}) => ({
  ok: false,
  status,
  headers: new Headers(headers),
  json: async () => ({ message: "error" }),
});

// 워크플로 파일명별로 응답을 지정한다.
const fetchByWorkflow = responses => jest.fn(async url => {
  const workflow = decodeURIComponent(url.split("/workflows/")[1].split("/runs")[0]);
  const value = responses[workflow];
  if (value instanceof Error) throw value;
  return value || okResponse([]);
});

const workflowState = (seenRunKeys, extra = {}) => ({
  initializedAt: hoursAgo(100),
  lastCheckedAt: hoursAgo(1),
  seenRunKeys,
  ...extra,
});

beforeEach(() => {
  stored = undefined;
  writeResult = true;
  jest.clearAllMocks();
  delete process.env.GITHUB_ACTIONS_MONITOR_REPO;
  delete process.env.GITHUB_ACTIONS_MONITOR_WORKFLOWS;
  delete process.env.GITHUB_TOKEN;
});

describe("기준선(첫 확인)", () => {
  test("이력이 없으면 가장 최근 완료 실행이 24시간 안의 실패일 때 그 한 건만 알린다", async () => {
    const fetchImpl = fetchByWorkflow({
      "production-chat-smoke.yml": okResponse([
        apiRun(30, "failure", 2),
        apiRun(20, "failure", 26),
        apiRun(10, "failure", 50),
      ]),
      "deploy-api.yml": okResponse([apiRun(40, "success", 5, { name: "Deploy API to OCI (native)" })]),
    });

    const result = await checkGitHubActionsRuns(CONFIG, NOW, fetchImpl);

    expect(result.initializedWorkflows).toEqual(["production-chat-smoke.yml", "deploy-api.yml"]);
    expect(result.events.map(event => [event.type, event.run.id])).toEqual([["failure", 30]]);
    expect(stored.workflows[SMOKE_KEY].seenRunKeys).toEqual(["10:1", "20:1"]);
    expect(stored.workflows[DEPLOY_KEY].seenRunKeys).toEqual(["40:1"]);
    expect(BASELINE_LOOKBACK_MS).toBe(24 * 3600_000);
  });

  test("24시간 안의 실패라도 뒤에 성공한 실행이 있으면 해결된 것으로 보고 실패·복구 DM을 보내지 않는다", async () => {
    const config = { ...CONFIG, workflows: ["deploy-api.yml"] };
    const fetchImpl = fetchByWorkflow({
      "deploy-api.yml": okResponse([
        apiRun(43, "success", 1),
        apiRun(42, "failure", 3),
        apiRun(41, "timed_out", 5),
      ]),
    });

    const result = await checkGitHubActionsRuns(config, NOW, fetchImpl);
    expect(result.events).toEqual([]);
    expect(stored.workflows[DEPLOY_KEY].seenRunKeys).toEqual(["41:1", "42:1", "43:1"]);
    expect(stored.workflows[DEPLOY_KEY].failingRunKey).toBeUndefined();

    // 이후 새 성공이 와도 알림을 보낸 적 없는 실패이므로 복구 DM이 없다.
    const next = await checkGitHubActionsRuns(config, NOW, fetchByWorkflow({
      "deploy-api.yml": okResponse([apiRun(44, "success", 0.1), apiRun(43, "success", 1), apiRun(42, "failure", 3)]),
    }));
    expect(next.events).toEqual([]);
  });

  test("최근 실패가 여러 건이어도 가장 최근 실행 한 건만 알린다", async () => {
    const fetchImpl = fetchByWorkflow({
      "production-chat-smoke.yml": okResponse([
        apiRun(32, "failure", 1),
        apiRun(31, "startup_failure", 3),
        apiRun(30, "failure", 5),
      ]),
    });
    const result = await checkGitHubActionsRuns({ ...CONFIG, workflows: ["production-chat-smoke.yml"] }, NOW, fetchImpl);
    expect(result.events.map(event => [event.type, event.run.id])).toEqual([["failure", 32]]);
    expect(stored.workflows[SMOKE_KEY].seenRunKeys).toEqual(["30:1", "31:1"]);
  });

  test("가장 최근 실패가 24시간보다 오래됐거나 최근 실행이 취소면 알리지 않는다", async () => {
    const old = await checkGitHubActionsRuns({ ...CONFIG, workflows: ["production-chat-smoke.yml"] }, NOW, fetchByWorkflow({
      "production-chat-smoke.yml": okResponse([apiRun(20, "failure", 25), apiRun(10, "failure", 49)]),
    }));
    expect(old.events).toEqual([]);

    stored = undefined;
    const cancelled = await checkGitHubActionsRuns({ ...CONFIG, workflows: ["deploy-api.yml"] }, NOW, fetchByWorkflow({
      "deploy-api.yml": okResponse([apiRun(51, "cancelled", 1), apiRun(50, "failure", 2)]),
    }));
    expect(cancelled.events).toEqual([]);
    expect(stored.workflows[DEPLOY_KEY].seenRunKeys).toEqual(["50:1", "51:1"]);
  });

  test("기준선에서 알린 실패가 전송된 뒤 성공하면 복구 DM을 보낸다", async () => {
    const config = { ...CONFIG, workflows: ["production-chat-smoke.yml"] };
    const first = await checkGitHubActionsRuns(config, NOW, fetchByWorkflow({
      "production-chat-smoke.yml": okResponse([apiRun(30, "failure", 1), apiRun(29, "success", 30)]),
    }));
    expect(first.events.map(event => event.run.id)).toEqual([30]);
    markGitHubActionsEventsNotified(first.events, NOW);

    const next = await checkGitHubActionsRuns(config, NOW, fetchByWorkflow({
      "production-chat-smoke.yml": okResponse([apiRun(31, "success", 0.1), apiRun(30, "failure", 1)]),
    }));
    expect(next.events.map(event => [event.type, event.run.id])).toEqual([["recovered", 31]]);
  });

  test("기준선 조회가 실패하면 이력을 만들지 않아 다음 확인에서 다시 기준선을 잡는다", async () => {
    const fetchImpl = fetchByWorkflow({
      "production-chat-smoke.yml": errorResponse(502),
      "deploy-api.yml": errorResponse(502),
    });
    const result = await checkGitHubActionsRuns(CONFIG, NOW, fetchImpl);
    expect(result.checkedWorkflows).toEqual([]);
    expect(writeJson).not.toHaveBeenCalled();
  });
});

describe("중복 방지와 이력", () => {
  test("이미 본 실행은 다시 알리지 않고 새 실패만 알린다", async () => {
    stored = { version: 1, workflows: { [SMOKE_KEY]: workflowState(["10:1"]) } };
    const fetchImpl = fetchByWorkflow({
      "production-chat-smoke.yml": okResponse([apiRun(11, "timed_out", 0.5), apiRun(10, "failure", 30)]),
    });
    const result = await checkGitHubActionsRuns({ ...CONFIG, workflows: ["production-chat-smoke.yml"] }, NOW, fetchImpl);
    expect(result.events.map(event => event.run.id)).toEqual([11]);
    // 알림 대상은 DM 전송 전까지 확인 완료로 저장하지 않는다.
    expect(stored.workflows[SMOKE_KEY].seenRunKeys).toEqual(["10:1"]);
  });

  test("전송 후 기록하면 재시작 뒤에도 같은 실행을 다시 보내지 않는다", async () => {
    stored = { version: 1, workflows: { [SMOKE_KEY]: workflowState([]) } };
    const config = { ...CONFIG, workflows: ["production-chat-smoke.yml"] };
    const fetchImpl = fetchByWorkflow({ "production-chat-smoke.yml": okResponse([apiRun(11, "failure", 0.5)]) });

    const first = await checkGitHubActionsRuns(config, NOW, fetchImpl);
    markGitHubActionsEventsNotified(first.events, NOW);
    expect(stored.workflows[SMOKE_KEY]).toMatchObject({
      seenRunKeys: ["11:1"], failingRunKey: "11:1", lastNotifiedAt: NOW.toISOString(),
    });

    jest.resetModules();
    const reloaded = require("../src/features/github-actions-monitor/github-actions-monitor-service");
    const second = await reloaded.checkGitHubActionsRuns(config, NOW, fetchImpl);
    expect(second.events).toEqual([]);
  });

  test("같은 실행의 재실행(run_attempt 2)이 다시 실패하면 새로 알린다", async () => {
    stored = { version: 1, workflows: { [SMOKE_KEY]: workflowState(["11:1"], { failingRunKey: "11:1" }) } };
    const fetchImpl = fetchByWorkflow({
      "production-chat-smoke.yml": okResponse([apiRun(11, "failure", 0.2, { run_attempt: 2 })]),
    });
    const result = await checkGitHubActionsRuns({ ...CONFIG, workflows: ["production-chat-smoke.yml"] }, NOW, fetchImpl);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({ type: "failure", run: { id: 11, runAttempt: 2 } });
  });

  test("cancelled·skipped는 알리지 않고 startup_failure는 알린다", async () => {
    stored = { version: 1, workflows: { [DEPLOY_KEY]: workflowState([]) } };
    const fetchImpl = fetchByWorkflow({
      "deploy-api.yml": okResponse([
        apiRun(1, "cancelled", 3), apiRun(2, "skipped", 2), apiRun(3, "startup_failure", 1),
        apiRun(4, "neutral", 0.5), apiRun(5, null, 0.4),
      ]),
    });
    const result = await checkGitHubActionsRuns({ ...CONFIG, workflows: ["deploy-api.yml"] }, NOW, fetchImpl);
    expect(result.events.map(event => [event.type, event.run.conclusion])).toEqual([["failure", "startup_failure"]]);
    expect(stored.workflows[DEPLOY_KEY].seenRunKeys).toEqual(["1:1", "2:1", "4:1", "5:1"]);
  });
});

describe("복구 알림", () => {
  test("실패 알림을 보낸 워크플로가 성공하면 복구 알림을 한 번만 보낸다", async () => {
    stored = { version: 1, workflows: { [SMOKE_KEY]: workflowState(["11:1"], { failingRunKey: "11:1" }) } };
    const config = { ...CONFIG, workflows: ["production-chat-smoke.yml"] };
    const fetchImpl = fetchByWorkflow({
      "production-chat-smoke.yml": okResponse([apiRun(13, "success", 0.1), apiRun(12, "success", 0.3), apiRun(11, "failure", 5)]),
    });
    const result = await checkGitHubActionsRuns(config, NOW, fetchImpl);
    expect(result.events.map(event => [event.type, event.run.id])).toEqual([["recovered", 12]]);
    markGitHubActionsEventsNotified(result.events, NOW);
    expect(stored.workflows[SMOKE_KEY].failingRunKey).toBeUndefined();
    expect(stored.workflows[SMOKE_KEY].seenRunKeys).toEqual(["11:1", "13:1", "12:1"]);

    const next = await checkGitHubActionsRuns(config, NOW, fetchImpl);
    expect(next.events).toEqual([]);
  });

  test("알림을 보낸 적 없는 실패 뒤의 성공은 복구 알림을 보내지 않는다", async () => {
    stored = { version: 1, workflows: { [SMOKE_KEY]: workflowState(["11:1"]) } };
    const fetchImpl = fetchByWorkflow({ "production-chat-smoke.yml": okResponse([apiRun(12, "success", 0.1)]) });
    const result = await checkGitHubActionsRuns({ ...CONFIG, workflows: ["production-chat-smoke.yml"] }, NOW, fetchImpl);
    expect(result.events).toEqual([]);
  });

  test("같은 확인에서 새 실패 뒤 성공이 오면 실패와 복구를 시간순으로 보낸다", async () => {
    stored = { version: 1, workflows: { [SMOKE_KEY]: workflowState([]) } };
    const fetchImpl = fetchByWorkflow({
      "production-chat-smoke.yml": okResponse([apiRun(12, "success", 0.1), apiRun(11, "failure", 0.5, { run_attempt: 1 })]),
    });
    const result = await checkGitHubActionsRuns({ ...CONFIG, workflows: ["production-chat-smoke.yml"] }, NOW, fetchImpl);
    expect(result.events.map(event => [event.type, event.run.id])).toEqual([["failure", 11], ["recovered", 12]]);
  });
});

describe("속도 제한과 오류", () => {
  test("403 속도 제한이면 남은 워크플로를 건너뛰고 reset 전까지 요청하지 않는다", async () => {
    const reset = Math.floor(NOW.getTime() / 1000) + 1800;
    const fetchImpl = fetchByWorkflow({
      "production-chat-smoke.yml": errorResponse(403, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(reset) }),
    });
    const result = await checkGitHubActionsRuns(CONFIG, NOW, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.failures.map(failure => failure.workflow)).toEqual(["production-chat-smoke.yml", "deploy-api.yml"]);
    expect(stored.rateLimitedUntil).toBe(new Date(reset * 1000).toISOString());

    const blocked = await checkGitHubActionsRuns(CONFIG, new Date(NOW.getTime() + 600_000), fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(blocked.rateLimitedUntil).toBe(stored.rateLimitedUntil);

    const fetchAfterReset = fetchByWorkflow({});
    await checkGitHubActionsRuns(CONFIG, new Date((reset + 1) * 1000), fetchAfterReset);
    expect(fetchAfterReset).toHaveBeenCalledTimes(2);
    expect(stored.rateLimitedUntil).toBeUndefined();
  });

  test("429 retry-after를 지킨다", async () => {
    const fetchImpl = fetchByWorkflow({ "production-chat-smoke.yml": errorResponse(429, { "retry-after": "90" }) });
    await checkGitHubActionsRuns(CONFIG, NOW, fetchImpl);
    expect(stored.rateLimitedUntil).toBe(new Date(NOW.getTime() + 90_000).toISOString());
  });

  test("성공 응답에서 남은 횟수가 0이면 응답은 처리하고 이후 요청을 미룬다", async () => {
    const reset = Math.floor(NOW.getTime() / 1000) + 600;
    stored = { version: 1, workflows: { [SMOKE_KEY]: workflowState([]) } };
    const fetchImpl = fetchByWorkflow({
      "production-chat-smoke.yml": okResponse([apiRun(11, "failure", 0.5)], {
        "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(reset),
      }),
    });
    const result = await checkGitHubActionsRuns({ ...CONFIG, workflows: ["production-chat-smoke.yml"] }, NOW, fetchImpl);
    expect(result.events).toHaveLength(1);
    expect(stored.rateLimitedUntil).toBe(new Date(reset * 1000).toISOString());
  });

  test("한 워크플로 조회가 실패해도 다른 워크플로는 확인한다", async () => {
    stored = { version: 1, workflows: { [DEPLOY_KEY]: workflowState([]) } };
    const fetchImpl = fetchByWorkflow({
      "production-chat-smoke.yml": new TypeError("fetch failed"),
      "deploy-api.yml": okResponse([apiRun(50, "failure", 0.2, { name: "Deploy API to OCI (native)", event: "push" })]),
    });
    const result = await checkGitHubActionsRuns(CONFIG, NOW, fetchImpl);
    expect(result.failures).toEqual([{ workflow: "production-chat-smoke.yml", reason: "fetch failed" }]);
    expect(result.events.map(event => event.run.id)).toEqual([50]);
  });

  test("이력 파일 형식이 깨졌으면 조회하지 않고 오류를 낸다", async () => {
    stored = { version: 1, workflows: { [SMOKE_KEY]: { seenRunKeys: "bad" } } };
    const fetchImpl = fetchByWorkflow({});
    await expect(checkGitHubActionsRuns(CONFIG, NOW, fetchImpl)).rejects.toThrow("이력 형식");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("runGitHubActionsMonitor", () => {
  test("ADMIN_ID가 없으면 조회하지 않는다", async () => {
    const fetchImpl = fetchByWorkflow({});
    const send = jest.fn();
    await expect(runGitHubActionsMonitor(send, undefined, () => NOW, fetchImpl))
      .resolves.toEqual({ status: "failure", detail: "ADMIN_ID가 설정되지 않았습니다." });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(readJson).not.toHaveBeenCalled();
  });

  test("새 실패를 관리자 DM으로 한 번에 제출하고 전송 뒤 이력을 저장한다", async () => {
    stored = { version: 1, workflows: { [SMOKE_KEY]: workflowState([]), [DEPLOY_KEY]: workflowState([]) } };
    const fetchImpl = fetchByWorkflow({
      "production-chat-smoke.yml": okResponse([apiRun(11, "failure", 0.5)]),
      "deploy-api.yml": okResponse([apiRun(50, "timed_out", 0.2, { name: "Deploy API to OCI (native)", event: "push" })]),
    });
    const send = jest.fn(async (_ownerId, messages) => messages.forEach(message => message.onSent()));

    const result = await runGitHubActionsMonitor(send, "admin-id", () => NOW, fetchImpl);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toBe("admin-id");
    const content = send.mock.calls[0][1].map(message => message.content).join("\n");
    expect(content).toContain("Production Chat Smoke");
    expect(content).toContain("Deploy API to OCI (native)");
    expect(result).toEqual({
      status: "success",
      detail: "워크플로 2개 확인 · 실패 알림 2건 · 복구 알림 0건",
    });
    expect(stored.workflows[SMOKE_KEY].seenRunKeys).toEqual(["11:1"]);
    expect(stored.workflows[DEPLOY_KEY].seenRunKeys).toEqual(["50:1"]);
  });

  test("DM 전송이 실패하면 이력을 남기지 않아 다음 주기에 다시 보낸다", async () => {
    stored = { version: 1, workflows: { [SMOKE_KEY]: workflowState([]) } };
    process.env.GITHUB_ACTIONS_MONITOR_WORKFLOWS = "production-chat-smoke.yml";
    const fetchImpl = fetchByWorkflow({ "production-chat-smoke.yml": okResponse([apiRun(11, "failure", 0.5)]) });
    const send = jest.fn().mockRejectedValue(new Error("Cannot send messages to this user"));

    const result = await runGitHubActionsMonitor(send, "admin-id", () => NOW, fetchImpl);
    expect(result.status).toBe("failure");
    expect(result.detail).toContain("DM 전송 또는 이력 저장 실패");
    expect(stored.workflows[SMOKE_KEY].seenRunKeys).toEqual([]);

    const retrySend = jest.fn().mockResolvedValue(undefined);
    await runGitHubActionsMonitor(retrySend, "admin-id", () => NOW, fetchImpl);
    expect(retrySend).toHaveBeenCalledTimes(1);
  });

  test("새 실패가 없으면 DM을 보내지 않고 성공으로 기록한다", async () => {
    process.env.GITHUB_ACTIONS_MONITOR_WORKFLOWS = "production-chat-smoke.yml";
    const fetchImpl = fetchByWorkflow({ "production-chat-smoke.yml": okResponse([apiRun(11, "success", 0.5)]) });
    const send = jest.fn();
    const result = await runGitHubActionsMonitor(send, "admin-id", () => NOW, fetchImpl);
    expect(send).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: "success",
      detail: "워크플로 1개 확인 · 새 실패 없음 · 기준선 생성: production-chat-smoke.yml",
    });
  });

  test("일부 조회 실패는 partial, 전부 실패하면 failure이며 DM은 보내지 않는다", async () => {
    const send = jest.fn();
    const partial = await runGitHubActionsMonitor(send, "admin-id", () => NOW, fetchByWorkflow({
      "production-chat-smoke.yml": errorResponse(404),
    }));
    expect(partial.status).toBe("partial");
    expect(partial.detail).toContain("production-chat-smoke.yml(HTTP 404 · 저장소 또는 워크플로 파일 확인 필요)");

    const failure = await runGitHubActionsMonitor(send, "admin-id", () => NOW, fetchByWorkflow({
      "production-chat-smoke.yml": new TypeError("fetch failed"),
      "deploy-api.yml": new TypeError("fetch failed"),
    }));
    expect(failure.status).toBe("failure");
    expect(send).not.toHaveBeenCalled();
  });

  test("속도 제한 대기 중이면 요청 없이 재시도 시각을 기록한다", async () => {
    stored = { version: 1, workflows: {}, rateLimitedUntil: "2026-11-15T03:30:00.000Z" };
    const fetchImpl = fetchByWorkflow({});
    const result = await runGitHubActionsMonitor(jest.fn(), "admin-id", () => NOW, fetchImpl);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.status).toBe("failure");
    expect(result.detail).toContain("GitHub 속도 제한 · 12:30 KST 이후 재시도");
  });

  test("잘못된 env 설정은 조회 없이 실패로 기록한다", async () => {
    process.env.GITHUB_ACTIONS_MONITOR_REPO = "invalid";
    const fetchImpl = fetchByWorkflow({});
    const result = await runGitHubActionsMonitor(jest.fn(), "admin-id", () => NOW, fetchImpl);
    expect(result.status).toBe("failure");
    expect(result.detail).toContain("owner/repo");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("오류 메시지와 기록에 토큰을 남기지 않는다", async () => {
    process.env.GITHUB_TOKEN = "ghp_secretvalue";
    const logs = [];
    const spies = ["log", "error", "warn"].map(method =>
      jest.spyOn(console, method).mockImplementation((...args) => logs.push(args.join(" "))));
    const fetchImpl = fetchByWorkflow({
      "production-chat-smoke.yml": errorResponse(401),
      "deploy-api.yml": errorResponse(401),
    });
    const result = await runGitHubActionsMonitor(jest.fn(), "admin-id", () => NOW, fetchImpl);
    spies.forEach(spy => spy.mockRestore());
    expect(result.detail).toContain("GITHUB_TOKEN 확인 필요");
    expect(JSON.stringify(result) + logs.join("\n") + JSON.stringify(stored || {})).not.toContain("ghp_secretvalue");
  });
});
