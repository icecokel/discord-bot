const mockSearch = jest.fn();
const mockRead = jest.fn();
jest.mock("../src/features/gmail-monitor/gmail-source", () => ({
  ...jest.requireActual("../src/features/gmail-monitor/gmail-source"),
  searchGmail: (...args) => mockSearch(...args),
  readGmail: (...args) => mockRead(...args),
}));

const { getGmailAiTools } = require("../src/features/gmail-monitor/gmail-ai-tools");
const { buildClaudeAdminOptions } = require("../src/core/natural-language-router");

const ENV_KEYS = ["GMAIL_ADDRESS", "GMAIL_APP_PASSWORD", "GMAIL_AI_ENABLED", "GMAIL_MONITOR_ENABLED"];
const previousEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
beforeEach(() => {
  jest.clearAllMocks();
  process.env.GMAIL_ADDRESS = "me@gmail.com";
  process.env.GMAIL_APP_PASSWORD = "abcd efgh ijkl mnop";
  delete process.env.GMAIL_AI_ENABLED;
  delete process.env.GMAIL_MONITOR_ENABLED;
});
afterAll(() => {
  for (const key of ENV_KEYS) {
    if (previousEnv[key] === undefined) delete process.env[key];
    else process.env[key] = previousEnv[key];
  }
});

const tool = (name) => getGmailAiTools().find((candidate) => candidate.name === name);

test("offers read-only mail tools whenever credentials exist, independent of the DM monitor", () => {
  expect(getGmailAiTools().map((candidate) => candidate.name)).toEqual(["search_gmail", "read_gmail"]);
  process.env.GMAIL_AI_ENABLED = "false";
  expect(getGmailAiTools()).toEqual([]);
  delete process.env.GMAIL_AI_ENABLED;
  delete process.env.GMAIL_APP_PASSWORD;
  expect(getGmailAiTools()).toEqual([]);
});

test("search clamps the limit and returns JSON for the model", async () => {
  mockSearch.mockResolvedValue({ mailbox: "[Gmail]/전체보관함", totalMatches: 1, messages: [{ uid: 9, subject: "영수증" }] });
  const output = await tool("search_gmail").run({ query: " from:toss.im ", limit: 500 });
  expect(mockSearch).toHaveBeenCalledWith(expect.objectContaining({ appPassword: "abcdefghijklmnop" }), "from:toss.im", 20);
  expect(JSON.parse(output).messages[0].uid).toBe(9);
  await tool("search_gmail").run({ query: "" });
  expect(mockSearch.mock.calls[1][2]).toBe(10);
});

test("read validates the uid and hides raw IMAP errors", async () => {
  await expect(tool("read_gmail").run({ uid: "abc" })).rejects.toThrow("uid");
  expect(mockRead).not.toHaveBeenCalled();
  mockRead.mockResolvedValueOnce(null);
  expect(JSON.parse(await tool("read_gmail").run({ uid: 5 }))).toHaveProperty("error");
  mockRead.mockRejectedValueOnce(Object.assign(new Error("NO [AUTHENTICATIONFAILED] me@gmail.com"), { authenticationFailed: true }));
  const failure = tool("read_gmail").run({ uid: 5 });
  await expect(failure).rejects.toThrow("Gmail 로그인 실패");
  await expect(tool("read_gmail").run({ uid: 5 })).resolves.toBeDefined();
});

test("admin Claude gets the mail tools and untrusted-content guidance only when available", () => {
  const withTools = buildClaudeAdminOptions();
  expect(withTools.tools.map((candidate) => candidate.name)).toEqual(["search_gmail", "read_gmail"]);
  expect(withTools.systemInstruction).toContain("외부인이 쓴 데이터");
  expect(withTools.systemInstruction).toContain("현재 시각(KST)");
  delete process.env.GMAIL_ADDRESS;
  const withoutTools = buildClaudeAdminOptions();
  expect(withoutTools.tools).toBeUndefined();
  expect(withoutTools.systemInstruction).not.toContain("search_gmail");
});
