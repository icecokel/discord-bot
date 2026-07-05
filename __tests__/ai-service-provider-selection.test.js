const mockGeminiGenerateText = jest.fn();
const mockCodexGenerateText = jest.fn();

const mockGeminiProvider = jest.fn();

const mockCodexProvider = jest.fn();

jest.mock("../src/core/ai/providers/gemini-provider", () => ({
  GeminiProvider: mockGeminiProvider,
}));

jest.mock("../src/core/ai/providers/codex-provider", () => ({
  CodexProvider: mockCodexProvider,
}));

const loadAiService = () => require("../src/core/ai/ai-service").default;

describe("AIService provider selection", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.resetAllMocks();
    mockGeminiProvider.mockImplementation(() => ({
      generateText: mockGeminiGenerateText,
    }));
    mockCodexProvider.mockImplementation(() => ({
      generateText: mockCodexGenerateText,
    }));
    process.env = { ...originalEnv };
    delete process.env.AI_PROVIDER;
    delete process.env.AI_FALLBACK_PROVIDER;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test("defaults to Gemini when AI_PROVIDER is not set", async () => {
    mockGeminiGenerateText.mockResolvedValueOnce("gemini response");
    const AIService = loadAiService();
    const service = new AIService();

    const result = await service.generateText("prompt", { model: "test" });

    expect(result).toBe("gemini response");
    expect(mockGeminiProvider).toHaveBeenCalledTimes(1);
    expect(mockCodexProvider).not.toHaveBeenCalled();
    expect(mockGeminiGenerateText).toHaveBeenCalledWith("prompt", {
      model: "test",
    });
  });

  test("uses Codex when AI_PROVIDER is codex", async () => {
    process.env.AI_PROVIDER = "codex";
    mockCodexGenerateText.mockResolvedValueOnce("codex response");
    const AIService = loadAiService();
    const service = new AIService();

    const result = await service.generateText("prompt");

    expect(result).toBe("codex response");
    expect(mockCodexProvider).toHaveBeenCalledTimes(1);
    expect(mockGeminiProvider).not.toHaveBeenCalled();
    expect(mockCodexGenerateText).toHaveBeenCalledWith("prompt", {});
  });

  test("reports Codex as the responding provider", async () => {
    process.env.AI_PROVIDER = "codex";
    mockCodexGenerateText.mockResolvedValueOnce("codex response");
    const AIService = loadAiService();
    const service = new AIService();

    const result = await service.generateTextWithProvider("prompt");

    expect(result).toEqual({
      providerName: "codex",
      text: "codex response",
      usedFallback: false,
    });
  });

  test("normalizes AI_PROVIDER casing and whitespace", async () => {
    process.env.AI_PROVIDER = " Codex ";
    mockCodexGenerateText.mockResolvedValueOnce("codex response");
    const AIService = loadAiService();
    const service = new AIService();

    const result = await service.generateText("prompt");

    expect(result).toBe("codex response");
    expect(mockCodexProvider).toHaveBeenCalledTimes(1);
    expect(mockGeminiProvider).not.toHaveBeenCalled();
  });

  test("falls back when primary throws and AI_FALLBACK_PROVIDER is different", async () => {
    process.env.AI_PROVIDER = "codex";
    process.env.AI_FALLBACK_PROVIDER = "gemini";
    jest.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("primary failed");
    mockCodexGenerateText.mockRejectedValueOnce(error);
    mockGeminiGenerateText.mockResolvedValueOnce("fallback response");
    const AIService = loadAiService();
    const service = new AIService();

    const result = await service.generateText("prompt", {
      responseMimeType: "application/json",
    });

    expect(result).toBe("fallback response");
    expect(mockCodexProvider).toHaveBeenCalledTimes(1);
    expect(mockGeminiProvider).toHaveBeenCalledTimes(1);
    expect(mockCodexGenerateText).toHaveBeenCalledWith("prompt", {
      responseMimeType: "application/json",
    });
    expect(mockGeminiGenerateText).toHaveBeenCalledWith("prompt", {
      responseMimeType: "application/json",
    });
  });

  test("reports fallback provider when fallback generates the response", async () => {
    process.env.AI_PROVIDER = "codex";
    process.env.AI_FALLBACK_PROVIDER = "gemini";
    jest.spyOn(console, "error").mockImplementation(() => {});
    mockCodexGenerateText.mockRejectedValueOnce(new Error("primary failed"));
    mockGeminiGenerateText.mockResolvedValueOnce("fallback response");
    const AIService = loadAiService();
    const service = new AIService();

    const result = await service.generateTextWithProvider("prompt");

    expect(result).toEqual({
      providerName: "gemini",
      text: "fallback response",
      usedFallback: true,
    });
  });

  test("does not use configured fallback when fallback is disabled", async () => {
    process.env.AI_PROVIDER = "codex";
    process.env.AI_FALLBACK_PROVIDER = "gemini";
    const error = new Error("primary failed");
    mockCodexGenerateText.mockRejectedValueOnce(error);
    const AIService = loadAiService();
    const service = new AIService();

    await expect(
      service.generateTextWithProvider("prompt", {
        disableProviderFallback: true,
      }),
    ).rejects.toThrow(error);

    expect(mockGeminiGenerateText).not.toHaveBeenCalled();
  });

  test("falls back directly to configured provider when Codex fails", async () => {
    process.env.AI_PROVIDER = "codex";
    process.env.AI_FALLBACK_PROVIDER = "gemini";
    jest.spyOn(console, "error").mockImplementation(() => {});
    mockCodexGenerateText.mockRejectedValueOnce(new Error("primary failed"));
    mockGeminiGenerateText.mockResolvedValueOnce("fallback response");
    const AIService = loadAiService();
    const service = new AIService();

    const result = await service.generateTextWithProvider("prompt", {
      codexSearch: true,
      model: "test",
    });

    expect(result).toEqual({
      providerName: "gemini",
      text: "fallback response",
      usedFallback: true,
    });
    expect(mockCodexGenerateText).toHaveBeenCalledWith("prompt", {
      codexSearch: true,
      model: "test",
    });
    expect(mockCodexGenerateText).toHaveBeenCalledTimes(1);
    expect(mockGeminiGenerateText).toHaveBeenCalledWith("prompt", {
      codexSearch: true,
      model: "test",
    });
  });

  test("normalizes AI_FALLBACK_PROVIDER casing and whitespace", async () => {
    process.env.AI_PROVIDER = "gemini";
    process.env.AI_FALLBACK_PROVIDER = " CODEX ";
    jest.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("primary failed");
    mockGeminiGenerateText.mockRejectedValueOnce(error);
    mockCodexGenerateText.mockResolvedValueOnce("fallback response");
    const AIService = loadAiService();
    const service = new AIService();

    const result = await service.generateText("prompt");

    expect(result).toBe("fallback response");
    expect(mockGeminiProvider).toHaveBeenCalledTimes(1);
    expect(mockCodexProvider).toHaveBeenCalledTimes(1);
  });

  test("does not instantiate fallback when fallback provider matches primary", async () => {
    process.env.AI_PROVIDER = "gemini";
    process.env.AI_FALLBACK_PROVIDER = "gemini";
    const error = new Error("primary failed");
    mockGeminiGenerateText.mockRejectedValueOnce(error);
    const AIService = loadAiService();
    const service = new AIService();

    await expect(service.generateText("prompt")).rejects.toThrow(error);

    expect(mockGeminiProvider).toHaveBeenCalledTimes(1);
    expect(mockCodexProvider).not.toHaveBeenCalled();
  });

  test("uses Gemini for unsupported provider names", async () => {
    process.env.AI_PROVIDER = "unknown";
    mockGeminiGenerateText.mockResolvedValueOnce("gemini response");
    const AIService = loadAiService();
    const service = new AIService();

    const result = await service.generateText("prompt");

    expect(result).toBe("gemini response");
    expect(mockGeminiProvider).toHaveBeenCalledTimes(1);
    expect(mockCodexProvider).not.toHaveBeenCalled();
  });

  test("does not instantiate fallback for unsupported fallback provider names", async () => {
    process.env.AI_PROVIDER = "codex";
    process.env.AI_FALLBACK_PROVIDER = "none";
    const error = new Error("primary failed");
    mockCodexGenerateText.mockRejectedValueOnce(error);
    const AIService = loadAiService();
    const service = new AIService();

    await expect(service.generateText("prompt")).rejects.toThrow(error);

    expect(mockCodexProvider).toHaveBeenCalledTimes(1);
    expect(mockGeminiProvider).not.toHaveBeenCalled();
  });

  test("logs primary failure message before fallback generation", async () => {
    process.env.AI_PROVIDER = "codex";
    process.env.AI_FALLBACK_PROVIDER = "gemini";
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const error = new Error("primary unavailable");
    mockCodexGenerateText.mockRejectedValueOnce(error);
    mockGeminiGenerateText.mockResolvedValueOnce("fallback response");
    const AIService = loadAiService();
    const service = new AIService();

    const result = await service.generateText("prompt");

    expect(result).toBe("fallback response");
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[AIService] 기본 AI 공급자 실패, fallback 실행: primary unavailable",
    );
    expect(mockGeminiGenerateText).toHaveBeenCalledTimes(1);
  });

  test("switches the primary provider at runtime", async () => {
    process.env.AI_PROVIDER = "codex";
    process.env.AI_FALLBACK_PROVIDER = "gemini";
    mockCodexGenerateText.mockResolvedValueOnce("codex response");
    mockGeminiGenerateText.mockResolvedValueOnce("gemini response");
    const AIService = loadAiService();
    const service = new AIService();

    expect(service.getProviderStatus()).toEqual({
      providerName: "codex",
      fallbackProviderName: "gemini",
    });

    await expect(service.generateText("before")).resolves.toBe(
      "codex response",
    );

    service.setPrimaryProvider("gemini");

    expect(service.getProviderStatus()).toEqual({
      providerName: "gemini",
      fallbackProviderName: undefined,
    });
    await expect(service.generateText("after")).resolves.toBe(
      "gemini response",
    );
    expect(mockGeminiProvider).toHaveBeenCalledTimes(2);
    expect(mockCodexProvider).toHaveBeenCalledTimes(1);
  });

  test("generates with one requested provider without fallback", async () => {
    process.env.AI_PROVIDER = "gemini";
    process.env.AI_FALLBACK_PROVIDER = "codex";
    mockCodexGenerateText.mockResolvedValueOnce("codex-only response");
    const AIService = loadAiService();
    const service = new AIService();

    const result = await service.generateTextWithProviderOnly(
      "codex",
      "prompt",
      { model: "test" },
    );

    expect(result).toEqual({
      providerName: "codex",
      text: "codex-only response",
      usedFallback: false,
    });
    expect(mockCodexGenerateText).toHaveBeenCalledWith("prompt", {
      model: "test",
    });
    expect(mockGeminiGenerateText).not.toHaveBeenCalled();
  });
});
