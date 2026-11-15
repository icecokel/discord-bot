const {
  buildGitHubActionsEventMessage,
  buildGitHubActionsMessageChunks,
} = require("../src/features/github-actions-monitor/github-actions-message");

const run = (overrides = {}) => ({
  id: 43701950175,
  runAttempt: 1,
  name: "Production Chat Smoke",
  conclusion: "failure",
  headBranch: "main",
  headSha: "4641d2cf0123456789abcdef",
  event: "schedule",
  htmlUrl: "https://github.com/icecokel/VSCoke/actions/runs/43701950175",
  completedAt: "2026-11-15T00:24:00.000Z",
  ...overrides,
});

const event = (type, overrides = {}) => ({
  type,
  repo: "icecokel/VSCoke",
  workflow: "production-chat-smoke.yml",
  workflowKey: "icecokel/VSCoke/production-chat-smoke.yml",
  run: run(overrides),
});

describe("GitHub Actions 알림 메시지", () => {
  test("실패 알림에 워크플로·결과·브랜치·짧은 SHA·트리거·KST 완료 시각·링크를 담는다", () => {
    expect(buildGitHubActionsEventMessage(event("failure"))).toBe([
      "🚨 **GitHub Actions 실패** · VSCoke · Production Chat Smoke",
      "결과: 실패 (failure)",
      "브랜치: `main` · 커밋: `4641d2c` · 트리거: `schedule`",
      "완료: 11. 15. 09:24 KST",
      "<https://github.com/icecokel/VSCoke/actions/runs/43701950175>",
    ].join("\n"));
  });

  test("재실행 회차와 시간 초과·시작 실패 라벨을 표시한다", () => {
    const timedOut = buildGitHubActionsEventMessage(event("failure", {
      conclusion: "timed_out", runAttempt: 3, event: "workflow_dispatch",
    }));
    expect(timedOut).toContain("결과: 시간 초과 (timed_out) · 재실행 3회차");
    expect(timedOut).toContain("트리거: `workflow_dispatch`");
    expect(buildGitHubActionsEventMessage(event("failure", { conclusion: "startup_failure" })))
      .toContain("결과: 시작 실패 (startup_failure)");
  });

  test("복구 알림을 만든다", () => {
    const message = buildGitHubActionsEventMessage(event("recovered", {
      conclusion: "success", name: "Deploy API to OCI (native)", event: "push",
    }));
    expect(message.split("\n")[0]).toBe("✅ **GitHub Actions 복구** · VSCoke · Deploy API to OCI (native)");
    expect(message).toContain("결과: 성공 (success)");
  });

  test("이름이 없으면 파일명을 쓰고, 브랜치 없음·백틱·마크다운을 안전하게 표시한다", () => {
    const message = buildGitHubActionsEventMessage(event("failure", {
      name: "", headBranch: null, event: "pu`sh",
    }));
    expect(message).toContain("production-chat-smoke.yml");
    expect(message).toContain("브랜치: -");
    expect(message).toContain("트리거: `pu'sh`");
    expect(buildGitHubActionsEventMessage(event("failure", { name: "**bold**" }))).toContain("\\*\\*bold\\*\\*");
  });

  test("여러 알림을 Discord 길이 제한 안에서 묶고 각 묶음의 이벤트를 유지한다", () => {
    const events = Array.from({ length: 12 }, (_, index) => event("failure", { id: index + 1 }));
    const chunks = buildGitHubActionsMessageChunks(events);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every(chunk => chunk.content.length <= 1900)).toBe(true);
    expect(chunks.flatMap(chunk => chunk.events)).toEqual(events);
    expect(buildGitHubActionsMessageChunks([])).toEqual([]);
  });
});
