const mockRegisterAdminCommand = jest.fn();
const mockGetScheduleRunRecords = jest.fn();

jest.mock("../src/core/admin-middleware", () => ({
  registerAdminCommand: mockRegisterAdminCommand,
}));

jest.mock("../src/utils/schedule-run-store", () => ({
  getScheduleRunRecords: mockGetScheduleRunRecords,
  getNextScheduleRunAt: jest.fn(() => "2026-07-18T21:30:00.000Z"),
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
      cron: "30 6 * * *",
      timezone: "Asia/Seoul",
      status: "success",
      lastAttemptAt: "2026-07-17T21:30:00.000Z",
      lastSuccessAt: "2026-07-17T21:33:00.000Z",
      nextRunAt: "2026-07-18T21:30:00.000Z",
      detail: "전송 완료",
    });

    expect(text).toContain("🟢 성공");
    expect(text).toContain("07. 18. 06:30");
    expect(text).toContain("07. 19. 06:30");
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
    ]);
  });
});
