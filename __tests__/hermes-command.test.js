const mockGetProviderStatus = jest.fn();
const mockSetPrimaryProvider = jest.fn();
const mockClearAdminConversationContext = jest.fn();

jest.mock("../src/core/ai", () => ({
  aiService: {
    getProviderStatus: mockGetProviderStatus,
    setPrimaryProvider: mockSetPrimaryProvider,
  },
}));

jest.mock("../src/core/admin-conversation-context-store", () => ({
  clearAdminConversationContext: mockClearAdminConversationContext,
}));

const mockResetHermesSession = jest.fn();

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

describe("hermes command", () => {
  const originalAdminId = process.env.ADMIN_ID;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ADMIN_ID = "owner-id";
  });

  afterAll(() => {
    process.env.ADMIN_ID = originalAdminId;
  });

  test("shows the current AI provider status to the admin", async () => {
    mockGetProviderStatus.mockReturnValue({
      providerName: "hermes",
      fallbackProviderName: "gemini",
    });
    const message = createMessage();

    await command.execute(message, []);

    expect(message.reply).toHaveBeenCalledWith(
      expect.stringContaining("현재 AI 공급자: hermes"),
    );
    expect(message.reply).toHaveBeenCalledWith(
      expect.stringContaining("fallback: gemini"),
    );
  });

  test("turns Hermes on for the admin", async () => {
    const message = createMessage();

    await command.execute(message, ["켜기"]);

    expect(mockSetPrimaryProvider).toHaveBeenCalledWith("hermes");
    expect(message.reply).toHaveBeenCalledWith(
      expect.stringContaining("Hermes를 켰습니다"),
    );
  });

  test("turns Hermes off for the admin", async () => {
    const message = createMessage();

    await command.execute(message, ["끄기"]);

    expect(mockSetPrimaryProvider).toHaveBeenCalledWith("gemini");
    expect(message.reply).toHaveBeenCalledWith(
      expect.stringContaining("Hermes를 껐습니다"),
    );
  });

  test("rejects non-admin users", async () => {
    const message = createMessage("other-id");

    await command.execute(message, ["끄기"]);

    expect(mockSetPrimaryProvider).not.toHaveBeenCalled();
    expect(message.reply).toHaveBeenCalledWith("⛔ 관리자 권한이 없습니다.");
  });

  test("clears Hermes session for the admin", async () => {
    const message = createMessage();

    await command.execute(message, ["초기화"]);

    expect(mockResetHermesSession).toHaveBeenCalledWith(
      "owner-id",
      "channel-id",
    );
    expect(mockClearAdminConversationContext).toHaveBeenCalledWith(
      "owner-id",
      "channel-id",
    );
    expect(message.reply).toHaveBeenCalledWith(
      "✅ 현재 채널의 Hermes 세션과 관리자 대화 기억을 초기화했습니다.",
    );
  });
});
