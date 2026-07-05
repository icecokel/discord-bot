const mockGetProviderStatus = jest.fn();
const mockSetPrimaryProvider = jest.fn();
const mockClearCodexThread = jest.fn();
const mockClearAdminConversationContext = jest.fn();
const mockResetHermesSession = jest.fn();

jest.mock("../src/core/ai", () => ({
  aiService: {
    getProviderStatus: mockGetProviderStatus,
    setPrimaryProvider: mockSetPrimaryProvider,
    clearCodexThread: mockClearCodexThread,
  },
}));

jest.mock("../src/core/admin-conversation-context-store", () => ({
  clearAdminConversationContext: mockClearAdminConversationContext,
}));

jest.mock("../src/core/hermes-session-store", () => ({
  resetHermesSession: mockResetHermesSession,
}));

const command = require("../src/features/tools/commands/hermes").default;

const createMessage = (userId = "owner-id") => ({
  author: {
    id: userId,
  },
  channel: {
    id: "channel-id",
  },
  reply: jest.fn(),
});

describe("hermes compatibility command", () => {
  const originalAdminId = process.env.ADMIN_ID;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ADMIN_ID = "owner-id";
    mockGetProviderStatus.mockReturnValue({
      providerName: "codex",
      fallbackProviderName: "gemini",
    });
  });

  afterAll(() => {
    process.env.ADMIN_ID = originalAdminId;
  });

  test("turns Codex on instead of enabling Hermes", async () => {
    const message = createMessage();

    await command.execute(message, ["켜기"]);

    expect(mockSetPrimaryProvider).toHaveBeenCalledWith("codex");
    expect(mockSetPrimaryProvider).not.toHaveBeenCalledWith("hermes");
    expect(message.reply).toHaveBeenCalledWith(
      expect.stringContaining("Codex를 켰습니다"),
    );
  });

  test("clears Codex context and legacy Hermes session", async () => {
    const message = createMessage();

    await command.execute(message, ["초기화"]);

    expect(mockClearAdminConversationContext).toHaveBeenCalledWith(
      "owner-id",
      "channel-id",
    );
    expect(mockClearCodexThread).toHaveBeenCalledWith("owner-id", "channel-id");
    expect(mockResetHermesSession).toHaveBeenCalledWith("owner-id", "channel-id");
    expect(message.reply).toHaveBeenCalledWith(
      "✅ 현재 채널의 Codex 관리자 대화 기억을 초기화했습니다.",
    );
  });
});
