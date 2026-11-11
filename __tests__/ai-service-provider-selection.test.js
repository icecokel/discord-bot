const mockClaudeGenerateText = jest.fn();
const mockClaudeProvider = jest.fn();

jest.mock("../src/core/ai/providers/claude-provider", () => ({
  ClaudeProvider: mockClaudeProvider,
}));

const mockCodexGenerateText = jest.fn();
const mockHermesGenerateText = jest.fn();
const mockCodexShutdown = jest.fn();
const mockCodexProvider = jest.fn();
const mockHermesProvider = jest.fn();

jest.mock("../src/core/ai/providers/codex-provider", () => ({
  CodexProvider: mockCodexProvider,
}));

jest.mock("../src/core/ai/providers/hermes-provider", () => ({
  HermesProvider: mockHermesProvider,
}));

const loadAiService = () => require("../src/core/ai/ai-service").default;

describe("AIService provider selection", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.resetAllMocks();
    mockClaudeProvider.mockImplementation(() => ({ generateText: mockClaudeGenerateText }));
    mockCodexProvider.mockImplementation(() => ({
      generateText: mockCodexGenerateText,
      shutdown: mockCodexShutdown,
    }));
    mockHermesProvider.mockImplementation(() => ({
      generateText: mockHermesGenerateText,
    }));
    process.env = { ...originalEnv };
    delete process.env.AI_PROVIDER;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test("defaults to Claude when AI_PROVIDER is not set", async () => {
    mockClaudeGenerateText.mockResolvedValueOnce("claude response");
    const AIService = loadAiService();
    const service = new AIService();

    await expect(service.generateText("prompt")).resolves.toBe(
      "claude response",
    );
    expect(service.getProviderStatus()).toEqual({ providerName: "claude" });
    expect(mockClaudeProvider).toHaveBeenCalledTimes(1);
    expect(mockCodexProvider).not.toHaveBeenCalled();
    expect(mockHermesProvider).not.toHaveBeenCalled();
  });

  test("uses explicitly configured Claude without starting a CLI provider", async () => {
    process.env.AI_PROVIDER = " CLAUDE ";
    mockClaudeGenerateText.mockResolvedValueOnce("claude response");
    const AIService = loadAiService();
    const service = new AIService();
    await expect(service.generateText("prompt")).resolves.toBe("claude response");
    expect(mockCodexProvider).not.toHaveBeenCalled();
    expect(mockHermesProvider).not.toHaveBeenCalled();
  });

  test("uses Hermes only when explicitly configured", async () => {
    process.env.AI_PROVIDER = " HERMES ";
    mockHermesGenerateText.mockResolvedValueOnce("hermes response");
    const AIService = loadAiService();
    const service = new AIService();

    await expect(service.generateText("prompt")).resolves.toBe(
      "hermes response",
    );
    expect(service.getProviderStatus()).toEqual({ providerName: "hermes" });
  });

  test("uses Claude for unsupported provider names", async () => {
    process.env.AI_PROVIDER = "unknown";
    mockClaudeGenerateText.mockResolvedValueOnce("claude response");
    const AIService = loadAiService();
    const service = new AIService();

    await expect(service.generateText("prompt")).resolves.toBe(
      "claude response",
    );
    expect(mockHermesProvider).not.toHaveBeenCalled();
  });

  test("retries a failed Hermes session as one-shot", async () => {
    process.env.AI_PROVIDER = "hermes";
    mockHermesGenerateText
      .mockRejectedValueOnce(new Error("session failed"))
      .mockResolvedValueOnce("one-shot response");
    const AIService = loadAiService();
    const service = new AIService();

    await expect(
      service.generateTextWithProvider("prompt", {
        hermesSessionName: "session",
        model: "test",
      }),
    ).resolves.toEqual({
      providerName: "hermes",
      text: "one-shot response",
      usedFallback: true,
    });
    expect(mockHermesGenerateText).toHaveBeenNthCalledWith(2, "prompt", {
      model: "test",
    });
  });

  test("does not switch providers when Claude fails", async () => {
    const error = new Error("claude failed");
    mockClaudeGenerateText.mockRejectedValueOnce(error);
    const AIService = loadAiService();
    const service = new AIService();

    await expect(service.generateText("prompt")).rejects.toThrow(error);
    expect(mockHermesProvider).not.toHaveBeenCalled();
  });

  test("shuts down the previous Codex provider when reconfigured", () => {
    process.env.AI_PROVIDER = "codex";
    const AIService = loadAiService();
    const service = new AIService();

    service.setPrimaryProvider("hermes");

    expect(mockCodexProvider).toHaveBeenCalledTimes(1);
    expect(mockHermesProvider).toHaveBeenCalledTimes(1);
    expect(mockCodexShutdown).toHaveBeenCalledTimes(1);
  });

  test("shuts down a provider-only Codex client after generation", async () => {
    mockCodexGenerateText.mockResolvedValueOnce("codex response");
    const AIService = loadAiService();
    const service = new AIService();

    await expect(
      service.generateTextWithProviderOnly("codex", "prompt"),
    ).resolves.toEqual({
      providerName: "codex",
      text: "codex response",
      usedFallback: false,
    });
    expect(mockCodexProvider).toHaveBeenCalledTimes(1);
    expect(mockCodexGenerateText).toHaveBeenCalledWith("prompt", {
      codexEphemeral: true,
    });
    expect(mockCodexShutdown).toHaveBeenCalledTimes(1);
  });

  test("shuts down a provider-only Codex client after failure", async () => {
    mockCodexGenerateText.mockRejectedValueOnce(new Error("codex failed"));
    const AIService = loadAiService();
    const service = new AIService();

    await expect(
      service.generateTextWithProviderOnly("codex", "prompt"),
    ).rejects.toThrow("codex failed");
    expect(mockCodexShutdown).toHaveBeenCalledTimes(1);
  });
});
