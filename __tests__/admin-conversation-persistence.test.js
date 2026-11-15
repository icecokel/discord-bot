// Persistence is skipped under Jest by default; this suite opts in against a mocked file store.
describe("admin conversation persistence", () => {
  const previous = process.env.ADMIN_CONVERSATION_PERSIST;
  let stored;
  let readJson;
  let writeJson;

  beforeEach(() => {
    jest.resetModules();
    process.env.ADMIN_CONVERSATION_PERSIST = "true";
    stored = undefined;
    readJson = jest.fn((name, fallback) => (stored === undefined ? fallback : structuredClone(stored)));
    writeJson = jest.fn((name, data) => { stored = structuredClone(data); return true; });
    jest.doMock("../src/utils/file-manager", () => ({ readJson, writeJson }));
  });
  afterAll(() => {
    if (previous === undefined) delete process.env.ADMIN_CONVERSATION_PERSIST;
    else process.env.ADMIN_CONVERSATION_PERSIST = previous;
  });

  test("survives a restart by reloading the saved file", () => {
    let store = require("../src/core/admin-conversation-context-store");
    store.appendAdminConversationTurn("owner", "dm", { user: "기억해", assistant: "네" });
    store.appendAdminNotification("owner", "dm", "아침 브리핑");
    expect(writeJson).toHaveBeenLastCalledWith("admin-conversation-history.json", expect.objectContaining({ version: 1 }));

    // Simulate a new process: fresh module, same file.
    jest.resetModules();
    jest.doMock("../src/utils/file-manager", () => ({ readJson, writeJson }));
    store = require("../src/core/admin-conversation-context-store");
    expect(store.getAdminConversationEntries("owner", "dm").map((entry) => entry.type)).toEqual(["turn", "notification"]);

    store.clearAdminConversationContext("owner", "dm");
    expect(stored.conversations).toEqual({});
  });

  test("starts empty instead of crashing when the file is corrupt, and skips malformed entries", () => {
    readJson.mockImplementationOnce(() => { throw new SyntaxError("Unexpected token"); });
    const errors = jest.spyOn(console, "error").mockImplementation(() => undefined);
    let store = require("../src/core/admin-conversation-context-store");
    expect(store.getAdminConversationEntries("owner", "dm")).toEqual([]);
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();

    stored = { version: 1, conversations: { "owner:dm": { entries: [
      { type: "turn", user: "ok", assistant: "ok", at: "2026-11-15T00:00:00Z" },
      { type: "turn", user: 3 },
      null,
    ] } } };
    store.resetAdminConversationCacheForTest();
    expect(store.getAdminConversationTurns("owner", "dm")).toEqual([{ user: "ok", assistant: "ok" }]);
  });
});
