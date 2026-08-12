const mockCodexGenerateText = jest.fn();
const mockHermesGenerateText = jest.fn();
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
    mockCodexProvider.mockImplementation(() => ({
      generateText: mockCodexGenerateText,
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

  test("defaults to Codex when AI_PROVIDER is not set", async () => {
    mockCodexGenerateText.mockResolvedValueOnce("codex response");
    const AIService = loadAiService();
    const service = new AIService();

    await expect(service.generateText("prompt")).resolves.toBe(
      "codex response",
    );
    expect(service.getProviderStatus()).toEqual({ providerName: "codex" });
    expect(mockCodexProvider).toHaveBeenCalledTimes(1);
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

  test("uses Codex for unsupported provider names", async () => {
    process.env.AI_PROVIDER = "unknown";
    mockCodexGenerateText.mockResolvedValueOnce("codex response");
    const AIService = loadAiService();
    const service = new AIService();

    await expect(service.generateText("prompt")).resolves.toBe(
      "codex response",
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

  test("does not switch providers when Codex fails", async () => {
    const error = new Error("codex failed");
    mockCodexGenerateText.mockRejectedValueOnce(error);
    const AIService = loadAiService();
    const service = new AIService();

    await expect(service.generateText("prompt")).rejects.toThrow(error);
    expect(mockHermesProvider).not.toHaveBeenCalled();
  });
});
