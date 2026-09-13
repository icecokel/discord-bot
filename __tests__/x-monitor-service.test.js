const mockFetch = jest.fn();
const mockLoad = jest.fn();
const mockSave = jest.fn();
const mockStart = jest.fn(() => true);
const mockComplete = jest.fn(() => true);
const mockFailure = jest.fn(() => true);
jest.mock("../src/features/x-monitor/x-profile-source", () => ({ fetchXProfile: (...args) => mockFetch(...args) }));
jest.mock("../src/utils/x-monitor-store", () => ({
  ...jest.requireActual("../src/utils/x-monitor-store"),
  loadXMonitorState: () => mockLoad(), saveXMonitorState: (s) => mockSave(s),
}));
jest.mock("../src/utils/schedule-run-store", () => ({
  recordScheduleRunStart: (...args) => mockStart(...args),
  recordScheduleRunCompletion: (...args) => mockComplete(...args),
  recordScheduleRunFailure: (...args) => mockFailure(...args),
}));
const { runXMonitor, isXQuietTime, buildXMessages } = require("../src/features/x-monitor/x-monitor-service");
const post = (id, text = `Post ${id}`) => ({
  id, text, url: `https://x.com/thsottiaux/status/${id}`,
  textComplete: true, observedAt: "2026-09-14T11:00:00Z",
});
const clock = (value) => () => new Date(value);
let stored, send, client;
const previousEnabled = process.env.X_MONITOR_ENABLED;
const previousAdmin = process.env.ADMIN_ID;
beforeEach(() => {
  jest.clearAllMocks();
  process.env.X_MONITOR_ENABLED = "true";
  process.env.ADMIN_ID = "owner";
  stored = { version: 1, account: "thsottiaux", initializedAt: "2026-09-14T01:00:00Z",
    baselineMaxId: "100", lastCompleteMaxId: "100", notifiedIds: [], pending: [] };
  mockLoad.mockImplementation(() => structuredClone(stored));
  mockSave.mockImplementation((state) => { stored = structuredClone(state); });
  mockFetch.mockResolvedValue({ posts: [post("100")], complete: true });
  send = jest.fn().mockResolvedValue({ id: "dm" });
  client = { users: { fetch: jest.fn().mockResolvedValue({ send }) } };
});
afterAll(() => {
  if (previousEnabled === undefined) delete process.env.X_MONITOR_ENABLED;
  else process.env.X_MONITOR_ENABLED = previousEnabled;
  if (previousAdmin === undefined) delete process.env.ADMIN_ID;
  else process.env.ADMIN_ID = previousAdmin;
});

test.each([
  ["2026-09-14T10:59:59Z", false], ["2026-09-14T11:00:00Z", true],
  ["2026-09-14T21:59:59Z", true], ["2026-09-14T22:00:00Z", false],
])("KST quiet boundary %s", (time, quiet) => expect(isXQuietTime(new Date(time))).toBe(quiet));

test("initializes a baseline without sending historical posts", async () => {
  stored = null;
  mockFetch.mockResolvedValue({ posts: [post("99"), post("101")], complete: true });
  expect((await runXMonitor(client)).status).toBe("success");
  expect(stored.baselineMaxId).toBe("101");
  expect(send).not.toHaveBeenCalled();
});

test("does not initialize on an incomplete or empty crawl", async () => {
  stored = null;
  mockFetch.mockResolvedValue({ posts: [post("100")], complete: false });
  expect((await runXMonitor(client)).status).toBe("failure");
  mockFetch.mockResolvedValue({ posts: [], complete: true });
  expect((await runXMonitor(client)).status).toBe("failure");
  expect(mockSave).not.toHaveBeenCalled();
});

test("persists night posts, batches at 07:00 and never sends the same IDs again", async () => {
  mockFetch.mockResolvedValue({ posts: [post("102"), post("101"), post("99")], complete: true });
  await runXMonitor(client, clock("2026-09-14T11:00:00Z"));
  await runXMonitor(client, clock("2026-09-14T11:30:00Z"));
  expect(send).not.toHaveBeenCalled();
  expect(stored.pending).toHaveLength(2);
  mockFetch.mockResolvedValue({ posts: [post("103"), post("102")], complete: true });
  await runXMonitor(client, clock("2026-09-14T22:00:00Z"));
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0][0]).toMatchObject({ allowedMentions: { parse: [] } });
  expect(send.mock.calls[0][0].content).toContain("야간 업데이트");
  expect(stored.notifiedIds).toEqual(["101", "102", "103"]);
  expect(stored.pending).toEqual([]);
  await runXMonitor(client, clock("2026-09-14T22:30:00Z"));
  expect(send).toHaveBeenCalledTimes(1);
});

test("drains saved posts at 07:00 even when X fails", async () => {
  stored.pending = [post("101")];
  mockFetch.mockRejectedValue(new Error("auth-required: X 로그인 필요"));
  const result = await runXMonitor(client, clock("2026-09-14T22:00:00Z"));
  expect(result.status).toBe("partial");
  expect(result.detail).toContain("로그인 필요");
  expect(stored.pending).toEqual([]);
  expect(send).toHaveBeenCalledTimes(1);
});

test("night failures retain the outbox and cannot send", async () => {
  stored.pending = [post("101")];
  mockFetch.mockRejectedValue(new Error("blocked: X 접근 제한"));
  expect((await runXMonitor(client, clock("2026-09-14T12:00:00Z"))).status).toBe("failure");
  expect(stored.pending).toHaveLength(1);
  expect(send).not.toHaveBeenCalled();
});

test("only commits successful chunks, retrying even if posts disappear from X", async () => {
  stored.pending = [post("101", "a".repeat(1300)), post("102", "b".repeat(1300))];
  send.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("DM failed"));
  expect((await runXMonitor(client, clock("2026-09-14T22:00:00Z"))).status).toBe("failure");
  expect(stored.notifiedIds).toEqual(["101"]);
  expect(stored.pending.map(p => p.id)).toEqual(["102"]);
  await runXMonitor(client, clock("2026-09-14T22:30:00Z"));
  expect(stored.notifiedIds).toEqual(["101", "102"]);
});

test("does not send new posts if persisting the outbox fails", async () => {
  mockFetch.mockResolvedValue({ posts: [post("101")], complete: true });
  mockSave.mockImplementation(() => { throw new Error("X 감시 이력 저장 실패"); });
  expect((await runXMonitor(client, clock("2026-09-14T01:00:00Z"))).status).toBe("failure");
  expect(send).not.toHaveBeenCalled();
});

test("does not reset corrupt state or even start a crawl", async () => {
  mockLoad.mockImplementation(() => { throw new Error("X 감시 이력 손상"); });
  expect((await runXMonitor(client)).status).toBe("failure");
  expect(mockFetch).not.toHaveBeenCalled();
  expect(mockSave).not.toHaveBeenCalled();
});

test("skips concurrent manual/scheduled runs without overwriting the ledger", async () => {
  let resolve;
  mockFetch.mockReturnValue(new Promise(r => { resolve = r; }));
  const first = runXMonitor(client);
  expect((await runXMonitor(client)).status).toBe("skipped");
  expect(mockStart).toHaveBeenCalledTimes(1);
  resolve({ posts: [post("100")], complete: true });
  await first;
});

test("rechecks 20:00 before every chunk", async () => {
  let time = "2026-09-14T10:59:59Z";
  stored.pending = [post("101", "a".repeat(1300)), post("102", "b".repeat(1300))];
  send.mockImplementation(async () => { time = "2026-09-14T11:00:00Z"; });
  await runXMonitor(client, () => new Date(time));
  expect(send).toHaveBeenCalledTimes(1);
  expect(stored.pending.map(p => p.id)).toEqual(["102"]);
});

test("keeps the checkpoint on incomplete coverage while sending observed new posts", async () => {
  mockFetch.mockResolvedValue({ posts: [post("105")], complete: false });
  expect((await runXMonitor(client, clock("2026-09-14T01:00:00Z"))).status).toBe("partial");
  expect(stored.lastCompleteMaxId).toBe("100");
  expect(stored.notifiedIds).toEqual(["105"]);
});

test("disabled monitoring neither crawls nor writes state", async () => {
  delete process.env.X_MONITOR_ENABLED;
  expect((await runXMonitor(client)).status).toBe("skipped");
  expect(mockFetch).not.toHaveBeenCalled();
  expect(mockStart).not.toHaveBeenCalled();
});

test("keeps Unicode, mention-like text and long posts within Discord limits", () => {
  const messages = buildXMessages([post("101", "😀 @everyone *".repeat(400)), post("102")], new Date("2026-09-14T22:00:00Z"));
  expect(messages.flatMap(m => m.ids)).toEqual(["101", "102"]);
  for (const m of messages) expect(m.content.length).toBeLessThanOrEqual(1800);
  expect(messages[0].content).toContain("원문 일부");
});
