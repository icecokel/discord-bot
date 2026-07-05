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

const command = require("../src/features/tools/commands/codex").default;

const createMessage = (userId = "owner-id") => ({
  author: {
    id: userId,
  },
  channel: {
    id: "channel-id",
  },
  reply: jest.fn(),
});

describe("codex command", () => {
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
      providerName: "codex",
      fallbackProviderName: "gemini",
    });
    const message = createMessage();

    await command.execute(message, []);

    expect(message.reply).toHaveBeenCalledWith(
      expect.stringContaining("현재 AI 공급자: codex"),
    );
    expect(message.reply).toHaveBeenCalledWith(
      expect.stringContaining("fallback: gemini"),
    );
  });

  test("turns Codex on for the admin", async () => {
    const message = createMessage();

    await command.execute(message, ["켜기"]);

    expect(mockSetPrimaryProvider).toHaveBeenCalledWith("codex");
    expect(message.reply).toHaveBeenCalledWith(
      expect.stringContaining("Codex를 켰습니다"),
    );
  });

  test("turns Codex off for the admin", async () => {
    const message = createMessage();

    await command.execute(message, ["끄기"]);

    expect(mockSetPrimaryProvider).toHaveBeenCalledWith("gemini");
    expect(message.reply).toHaveBeenCalledWith(
      expect.stringContaining("Codex를 껐습니다"),
    );
  });

  test("rejects non-admin users", async () => {
    const message = createMessage("other-id");

    await command.execute(message, ["끄기"]);

    expect(mockSetPrimaryProvider).not.toHaveBeenCalled();
    expect(message.reply).toHaveBeenCalledWith("⛔ 관리자 권한이 없습니다.");
  });

  test("clears Codex admin context for the admin", async () => {
    const message = createMessage();

    await command.execute(message, ["초기화"]);

    expect(mockClearAdminConversationContext).toHaveBeenCalledWith(
      "owner-id",
      "channel-id",
    );
    expect(message.reply).toHaveBeenCalledWith(
      "✅ 현재 채널의 Codex 관리자 대화 기억을 초기화했습니다.",
    );
  });
});
