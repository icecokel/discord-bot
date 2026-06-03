const mockGeminiGenerateText = jest.fn();
const mockHermesGenerateText = jest.fn();

const mockGeminiProvider = jest.fn();

const mockHermesProvider = jest.fn();

jest.mock("../src/core/ai/providers/gemini-provider", () => ({
  GeminiProvider: mockGeminiProvider,
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
    mockGeminiProvider.mockImplementation(() => ({
      generateText: mockGeminiGenerateText,
    }));
    mockHermesProvider.mockImplementation(() => ({
      generateText: mockHermesGenerateText,
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
    expect(mockHermesProvider).not.toHaveBeenCalled();
    expect(mockGeminiGenerateText).toHaveBeenCalledWith("prompt", {
      model: "test",
    });
  });

  test("uses Hermes when AI_PROVIDER is hermes", async () => {
    process.env.AI_PROVIDER = "hermes";
    mockHermesGenerateText.mockResolvedValueOnce("hermes response");
    const AIService = loadAiService();
    const service = new AIService();

    const result = await service.generateText("prompt");

    expect(result).toBe("hermes response");
    expect(mockHermesProvider).toHaveBeenCalledTimes(1);
    expect(mockGeminiProvider).not.toHaveBeenCalled();
    expect(mockHermesGenerateText).toHaveBeenCalledWith("prompt", {});
  });

  test("reports Hermes as the responding provider", async () => {
    process.env.AI_PROVIDER = "hermes";
    mockHermesGenerateText.mockResolvedValueOnce("hermes response");
    const AIService = loadAiService();
    const service = new AIService();

    const result = await service.generateTextWithProvider("prompt");

    expect(result).toEqual({
      providerName: "hermes",
      text: "hermes response",
      usedFallback: false,
    });
  });

  test("normalizes AI_PROVIDER casing and whitespace", async () => {
    process.env.AI_PROVIDER = " Hermes ";
    mockHermesGenerateText.mockResolvedValueOnce("hermes response");
    const AIService = loadAiService();
    const service = new AIService();

    const result = await service.generateText("prompt");

    expect(result).toBe("hermes response");
    expect(mockHermesProvider).toHaveBeenCalledTimes(1);
    expect(mockGeminiProvider).not.toHaveBeenCalled();
  });

  test("falls back when primary throws and AI_FALLBACK_PROVIDER is different", async () => {
    process.env.AI_PROVIDER = "hermes";
    process.env.AI_FALLBACK_PROVIDER = "gemini";
    jest.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("primary failed");
    mockHermesGenerateText.mockRejectedValueOnce(error);
    mockGeminiGenerateText.mockResolvedValueOnce("fallback response");
    const AIService = loadAiService();
    const service = new AIService();

    const result = await service.generateText("prompt", {
      responseMimeType: "application/json",
    });

    expect(result).toBe("fallback response");
    expect(mockHermesProvider).toHaveBeenCalledTimes(1);
    expect(mockGeminiProvider).toHaveBeenCalledTimes(1);
    expect(mockHermesGenerateText).toHaveBeenCalledWith("prompt", {
      responseMimeType: "application/json",
    });
    expect(mockGeminiGenerateText).toHaveBeenCalledWith("prompt", {
      responseMimeType: "application/json",
    });
  });

  test("reports fallback provider when fallback generates the response", async () => {
    process.env.AI_PROVIDER = "hermes";
    process.env.AI_FALLBACK_PROVIDER = "gemini";
    jest.spyOn(console, "error").mockImplementation(() => {});
    mockHermesGenerateText.mockRejectedValueOnce(new Error("primary failed"));
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

  test("normalizes AI_FALLBACK_PROVIDER casing and whitespace", async () => {
    process.env.AI_PROVIDER = "gemini";
    process.env.AI_FALLBACK_PROVIDER = " HERMES ";
    jest.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("primary failed");
    mockGeminiGenerateText.mockRejectedValueOnce(error);
    mockHermesGenerateText.mockResolvedValueOnce("fallback response");
    const AIService = loadAiService();
    const service = new AIService();

    const result = await service.generateText("prompt");

    expect(result).toBe("fallback response");
    expect(mockGeminiProvider).toHaveBeenCalledTimes(1);
    expect(mockHermesProvider).toHaveBeenCalledTimes(1);
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
    expect(mockHermesProvider).not.toHaveBeenCalled();
  });

  test("uses Gemini for unsupported provider names", async () => {
    process.env.AI_PROVIDER = "unknown";
    mockGeminiGenerateText.mockResolvedValueOnce("gemini response");
    const AIService = loadAiService();
    const service = new AIService();

    const result = await service.generateText("prompt");

    expect(result).toBe("gemini response");
    expect(mockGeminiProvider).toHaveBeenCalledTimes(1);
    expect(mockHermesProvider).not.toHaveBeenCalled();
  });

  test("does not instantiate fallback for unsupported fallback provider names", async () => {
    process.env.AI_PROVIDER = "hermes";
    process.env.AI_FALLBACK_PROVIDER = "none";
    const error = new Error("primary failed");
    mockHermesGenerateText.mockRejectedValueOnce(error);
    const AIService = loadAiService();
    const service = new AIService();

    await expect(service.generateText("prompt")).rejects.toThrow(error);

    expect(mockHermesProvider).toHaveBeenCalledTimes(1);
    expect(mockGeminiProvider).not.toHaveBeenCalled();
  });

  test("logs primary failure message before fallback generation", async () => {
    process.env.AI_PROVIDER = "hermes";
    process.env.AI_FALLBACK_PROVIDER = "gemini";
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const error = new Error("primary unavailable");
    mockHermesGenerateText.mockRejectedValueOnce(error);
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
    process.env.AI_PROVIDER = "hermes";
    process.env.AI_FALLBACK_PROVIDER = "gemini";
    mockHermesGenerateText.mockResolvedValueOnce("hermes response");
    mockGeminiGenerateText.mockResolvedValueOnce("gemini response");
    const AIService = loadAiService();
    const service = new AIService();

    expect(service.getProviderStatus()).toEqual({
      providerName: "hermes",
      fallbackProviderName: "gemini",
    });

    await expect(service.generateText("before")).resolves.toBe(
      "hermes response",
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
    expect(mockHermesProvider).toHaveBeenCalledTimes(1);
  });
});
