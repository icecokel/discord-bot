const mockFetchUpdates = jest.fn();
const mockLoad = jest.fn();
const mockSave = jest.fn();
const mockStart = jest.fn(() => true);
const mockComplete = jest.fn(() => true);
const mockFailure = jest.fn(() => true);
jest.mock("../src/features/gmail-monitor/gmail-source", () => ({
  ...jest.requireActual("../src/features/gmail-monitor/gmail-source"),
  fetchGmailUpdates: (...args) => mockFetchUpdates(...args),
}));
jest.mock("../src/utils/gmail-monitor-store", () => ({
  loadGmailMonitorState: () => mockLoad(),
  saveGmailMonitorState: (state) => mockSave(state),
}));
jest.mock("../src/utils/schedule-run-store", () => ({
  recordScheduleRunStart: (...args) => mockStart(...args),
  recordScheduleRunCompletion: (...args) => mockComplete(...args),
  recordScheduleRunFailure: (...args) => mockFailure(...args),
}));

const { runGmailMonitor } = require("../src/features/gmail-monitor/gmail-monitor-service");
const { buildGmailNotificationChunks } = require("../src/features/gmail-monitor/gmail-message");
const { findTextPart, toSnippet, gmailMessageUrl, htmlToText, listAttachmentNames } = require("../src/features/gmail-monitor/gmail-source");

const ENV_KEYS = ["GMAIL_MONITOR_ENABLED", "GMAIL_ADDRESS", "GMAIL_APP_PASSWORD", "GMAIL_MONITOR_QUERY", "GMAIL_MONITOR_MAILBOX", "ADMIN_ID"];
const previousEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const clock = () => new Date("2026-11-15T03:00:00Z");
const mail = (uid, subject = `메일 ${uid}`) => ({
  uid, subject, from: "보낸이 <sender@example.com>",
  receivedAt: "2026-11-15T02:59:00Z", snippet: "본문 미리보기", url: `https://mail.google.com/mail/u/me%40gmail.com/#all/${uid.toString(16)}`,
});

let stored, send, client;
beforeEach(() => {
  jest.clearAllMocks();
  process.env.GMAIL_MONITOR_ENABLED = "true";
  process.env.GMAIL_ADDRESS = "me@gmail.com";
  process.env.GMAIL_APP_PASSWORD = "abcd efgh ijkl mnop";
  delete process.env.GMAIL_MONITOR_QUERY;
  delete process.env.GMAIL_MONITOR_MAILBOX;
  process.env.ADMIN_ID = "123";
  stored = {
    version: 1, address: "me@gmail.com", mailbox: "INBOX", query: "",
    uidValidity: "7", lastUid: 100,
    initializedAt: "2026-11-14T00:00:00Z", lastCheckedAt: "2026-11-15T02:50:00Z",
  };
  mockLoad.mockImplementation(() => (stored ? structuredClone(stored) : null));
  mockSave.mockImplementation((state) => { stored = structuredClone(state); });
  send = jest.fn().mockResolvedValue({ id: "456", channelId: "789" });
  client = { users: { fetch: jest.fn().mockResolvedValue({ send }) } };
});
afterAll(() => {
  for (const key of ENV_KEYS) {
    if (previousEnv[key] === undefined) delete process.env[key];
    else process.env[key] = previousEnv[key];
  }
});

test("is skipped unless explicitly enabled", async () => {
  delete process.env.GMAIL_MONITOR_ENABLED;
  expect((await runGmailMonitor(client)).status).toBe("skipped");
  expect(mockFetchUpdates).not.toHaveBeenCalled();
});

test("fails without credentials and never connects", async () => {
  delete process.env.GMAIL_APP_PASSWORD;
  const result = await runGmailMonitor(client);
  expect(result.status).toBe("failure");
  expect(mockFetchUpdates).not.toHaveBeenCalled();
});

test("first run stores a baseline without sending existing mail", async () => {
  stored = null;
  mockFetchUpdates.mockResolvedValue({ uidValidity: "7", uidNext: 501, maxUid: 500, messages: [], omittedCount: 0 });
  const result = await runGmailMonitor(client, clock);
  expect(result.status).toBe("success");
  expect(mockFetchUpdates).toHaveBeenCalledWith(
    expect.objectContaining({ address: "me@gmail.com", appPassword: "abcdefghijklmnop", mailbox: "INBOX" }),
    null, 10,
  );
  expect(stored).toMatchObject({ lastUid: 500, uidValidity: "7" });
  expect(send).not.toHaveBeenCalled();
});

test("re-baselines when the query or UIDVALIDITY changes", async () => {
  process.env.GMAIL_MONITOR_QUERY = "category:primary";
  mockFetchUpdates.mockResolvedValue({ uidValidity: "7", uidNext: 301, maxUid: 300, messages: [], omittedCount: 0 });
  await runGmailMonitor(client, clock);
  expect(mockFetchUpdates.mock.calls[0][1]).toBeNull();
  expect(stored).toMatchObject({ query: "category:primary", lastUid: 300 });

  mockFetchUpdates.mockResolvedValue({ uidValidity: "8", uidNext: 11, maxUid: 10, messages: [], omittedCount: 0 });
  await runGmailMonitor(client, clock);
  expect(stored).toMatchObject({ uidValidity: "8", lastUid: 10 });
  expect(send).not.toHaveBeenCalled();
});

test("sends new mail to the admin DM and advances the checkpoint", async () => {
  mockFetchUpdates.mockResolvedValue({ uidValidity: "7", uidNext: 103, maxUid: 102, messages: [mail(101), mail(102, "*굵게*")], omittedCount: 0 });
  const result = await runGmailMonitor(client, clock);
  expect(result).toEqual({ status: "success", detail: "새 메일 2건 DM 전송" });
  expect(mockFetchUpdates.mock.calls[0][1]).toMatchObject({ uidValidity: "7", lastUid: 100 });
  expect(client.users.fetch).toHaveBeenCalledWith("123");
  const { content, allowedMentions } = send.mock.calls[0][0];
  expect(allowedMentions).toEqual({ parse: [] });
  expect(content).toContain("📬 새 Gmail 2건");
  expect(content).toContain("\\*굵게\\*");
  expect(stored.lastUid).toBe(102);
  expect(stored.lastNotifiedAt).toBe("2026-11-15T03:00:00.000Z");
  expect(mockComplete).toHaveBeenCalled();
});

test("keeps the checkpoint when the DM fails so the mail is retried", async () => {
  send.mockRejectedValue(new Error("Cannot send messages to this user"));
  mockFetchUpdates.mockResolvedValue({ uidValidity: "7", uidNext: 102, maxUid: 101, messages: [mail(101)], omittedCount: 0 });
  const result = await runGmailMonitor(client, clock);
  expect(result.status).toBe("failure");
  expect(stored.lastUid).toBe(100);
  expect(mockFailure).toHaveBeenCalled();
});

test("reports login failures without leaking server details", async () => {
  mockFetchUpdates.mockRejectedValue(Object.assign(new Error("[AUTHENTICATIONFAILED] Invalid credentials me@gmail.com"), { authenticationFailed: true }));
  const result = await runGmailMonitor(client, clock);
  expect(result.status).toBe("failure");
  expect(result.detail).toContain("Gmail 로그인 실패");
  expect(result.detail).not.toContain("me@gmail.com");
});

test("chunks long batches under the Discord limit and closes the omitted range", () => {
  const messages = Array.from({ length: 10 }, (_, index) =>
    ({ ...mail(200 + index), snippet: "가".repeat(180), subject: "제목".repeat(100) }));
  const chunks = buildGmailNotificationChunks(messages, 5, 209);
  expect(chunks.length).toBeGreaterThan(1);
  expect(chunks.every((chunk) => chunk.content.length <= 2000)).toBe(true);
  expect(chunks[0].content).toContain("새 Gmail 15건");
  expect(chunks[chunks.length - 1].maxUid).toBe(209);
  expect(chunks.map((chunk) => chunk.maxUid)).toEqual([...chunks.map((chunk) => chunk.maxUid)].sort((a, b) => a - b));
});

test("parses message structure, previews and links", () => {
  const structure = { type: "multipart/mixed", childNodes: [
    { type: "multipart/alternative", childNodes: [{ part: "1.1", type: "text/plain" }, { part: "1.2", type: "text/html" }] },
    { part: "2", type: "text/plain", disposition: "attachment" },
  ] };
  expect(findTextPart(structure, "text/plain")).toBe("1.1");
  expect(findTextPart(structure, "text/html")).toBe("1.2");
  expect(findTextPart({ type: "text/plain" }, "text/plain")).toBe("1");
  expect(toSnippet("<style>p{}</style><p>안녕&nbsp;하세요</p>", true)).toBe("안녕 하세요");
  expect(toSnippet("a".repeat(300))).toHaveLength(181);
  expect(toSnippet("[image: Google] 확인 <https://accounts.google.com/x?y=1> 또는 https://a.b/c 참고")).toBe("확인 또는 참고");
  expect(gmailMessageUrl("me@gmail.com", "255")).toBe("https://mail.google.com/mail/u/me%40gmail.com/#all/ff");
  expect(gmailMessageUrl("me@gmail.com", undefined)).toBeUndefined();
});

test("converts HTML bodies to readable text and lists attachments", () => {
  expect(htmlToText("<div>첫 줄</div><p>둘째&nbsp;줄<br>셋째</p><script>x()</script>")).toBe("첫 줄\n둘째 줄\n셋째");
  expect(listAttachmentNames({ type: "multipart/mixed", childNodes: [
    { part: "1", type: "text/plain" },
    { part: "2", type: "application/pdf", disposition: "attachment", dispositionParameters: { filename: "영수증.pdf" } },
    { part: "3", type: "image/png", parameters: { name: "logo.png" } },
  ] })).toEqual(["영수증.pdf", "logo.png"]);
});
