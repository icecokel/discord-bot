const mockRegisterAdminCommand = jest.fn();
const mockGetScheduleRunRecords = jest.fn();

jest.mock("../src/core/admin-middleware", () => ({
  registerAdminCommand: mockRegisterAdminCommand,
}));

jest.mock("../src/utils/schedule-run-store", () => ({
  getScheduleRunRecords: mockGetScheduleRunRecords,
  getNextScheduleRunAt: jest.fn(() => "2026-07-18T21:00:00.000Z"),
}));

const {
  formatScheduleRunRecord,
  handleScheduleStatus,
} = require("../src/features/admin/commands/admin-schedule");

describe("admin schedule status command", () => {
  test("registers the schedule status command", () => {
    expect(mockRegisterAdminCommand).toHaveBeenCalledWith(
      "스케줄상태",
      expect.any(Function),
      expect.any(String),
    );
  });

  test("formats status and next run in KST", () => {
    const text = formatScheduleRunRecord({
      jobId: "morning-briefing",
      label: "아침 브리핑",
      cron: "0 6 * * *",
      timezone: "Asia/Seoul",
      status: "success",
      lastAttemptAt: "2026-07-17T21:00:00.000Z",
      lastSuccessAt: "2026-07-17T21:03:00.000Z",
      nextRunAt: "2026-07-18T21:00:00.000Z",
      detail: "전송 완료",
    });

    expect(text).toContain("🟢 성공");
    expect(text).toContain("07. 18. 06:00");
    expect(text).toContain("07. 19. 06:00");
    expect(text).toContain("메모: 전송 완료");
  });

  test("shows every configured schedule", async () => {
    mockGetScheduleRunRecords.mockReturnValue([]);
    const reply = jest.fn().mockResolvedValue(undefined);

    await handleScheduleStatus({ reply });

    const embed = reply.mock.calls[0][0].embeds[0].toJSON();
    expect(embed.fields.map((field) => field.name)).toEqual([
      "아침 브리핑",
      "긱뉴스",
      "내일 날씨",
      "채용공고",
      "GitHub Actions 감시",
      "깃 트렌드",
      "알림 큐",
    ]);
  });
});

 test("shows the X schedule only when monitoring is enabled", async () => {
  const previous = process.env.X_MONITOR_ENABLED;
  process.env.X_MONITOR_ENABLED = "true";
  try {
    mockGetScheduleRunRecords.mockReturnValue([]);
    const reply = jest.fn();
    await handleScheduleStatus({ reply });
    expect(reply.mock.calls[0][0].embeds[0].toJSON().fields.map(f => f.name)).toContain("X 업데이트");
  } finally {
    if (previous === undefined) delete process.env.X_MONITOR_ENABLED;
    else process.env.X_MONITOR_ENABLED = previous;
  }
});

test("GitHub Actions 감시를 끄면 스케줄 상태에서 숨긴다", async () => {
  const previous = process.env.GITHUB_ACTIONS_MONITOR_ENABLED;
  process.env.GITHUB_ACTIONS_MONITOR_ENABLED = "false";
  try {
    mockGetScheduleRunRecords.mockReturnValue([]);
    const reply = jest.fn();
    await handleScheduleStatus({ reply });
    expect(reply.mock.calls[0][0].embeds[0].toJSON().fields.map(f => f.name)).not.toContain("GitHub Actions 감시");
  } finally {
    if (previous === undefined) delete process.env.GITHUB_ACTIONS_MONITOR_ENABLED;
    else process.env.GITHUB_ACTIONS_MONITOR_ENABLED = previous;
  }
});

test("summarizes the notification queue: holds, retries, last delivery and drops", () => {
  const { formatNotificationQueueStatus } = require("../src/features/admin/commands/admin-schedule");
  const previous = process.env.NOTIFICATION_QUIET_HOURS;
  delete process.env.NOTIFICATION_QUIET_HOURS;
  try {
    const entry = (extra = {}) => ({ id: "1", ownerId: "o", content: "a", embeds: [], enqueuedAt: "2026-11-15T16:00:00Z", attempts: 0, ...extra });
    const text = formatNotificationQueueStatus({
      version: 1,
      entries: [entry(), entry(), entry({ attempts: 2 })],
      lastDeliveredAt: "2026-11-15T13:00:00Z",
      lastFailureAt: "2026-11-15T16:10:00Z",
      lastError: "Cannot send messages to this user",
      droppedCount: 3,
    }, new Date("2026-11-15T17:00:00Z")); // 02:00 KST
    expect(text).toContain("대기: 3건 (야간 홀드 2건) · 재시도 대기 1건");
    expect(text).toContain("야간 홀드: 23:00~06:00 · 지금 홀드 중");
    expect(text).toContain("메모: Cannot send messages to this user");
    expect(text).toContain("한도 초과로 버린 알림: 3건");
    expect(formatNotificationQueueStatus({ version: 1, entries: [] }, new Date("2026-11-15T03:00:00Z")))
      .toMatch(/^대기: 0건\n야간 홀드: 23:00~06:00\n/);
  } finally {
    process.env.NOTIFICATION_QUIET_HOURS = previous;
  }
});
