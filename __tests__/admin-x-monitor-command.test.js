const mockRun = jest.fn();
const mockRegister = jest.fn();
jest.mock("../src/features/x-monitor/x-monitor-service", () => ({ runXMonitor: (...args) => mockRun(...args) }));
jest.mock("../src/core/admin-middleware", () => ({ registerAdminCommand: (...args) => mockRegister(...args) }));
const { handleXMonitor } = require("../src/features/admin/commands/admin-x-monitor");
test("registers an admin command and uses the common quiet-hours service", async () => {
  expect(mockRegister).toHaveBeenCalledWith("X확인", handleXMonitor, expect.any(String));
  const client = {};
  const reply = jest.fn();
  mockRun.mockResolvedValue({ status: "success", detail: "야간 보류 2건 · 07:00 발송 예정" });
  await handleXMonitor({ client, reply });
  expect(mockRun).toHaveBeenCalledWith(client);
  expect(reply).toHaveBeenCalledWith({ content: "야간 보류 2건 · 07:00 발송 예정", allowedMentions: { parse: [] } });
});
