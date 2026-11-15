const mockCreate = jest.fn();
const mockClient = jest.fn();

jest.mock("@anthropic-ai/sdk", () => {
  const sdk = jest.requireActual("@anthropic-ai/sdk");
  return {
    __esModule: true,
    default: Object.assign(mockClient, {
      AuthenticationError: sdk.AuthenticationError,
      PermissionDeniedError: sdk.PermissionDeniedError,
      RateLimitError: sdk.RateLimitError,
      APIConnectionTimeoutError: sdk.APIConnectionTimeoutError,
    }),
  };
});

const { ClaudeProvider } = require("../src/core/ai/providers/claude-provider");
const sdk = jest.requireActual("@anthropic-ai/sdk");

describe("ClaudeProvider", () => {
  const originalEnv = process.env;
  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...originalEnv, ANTHROPIC_API_KEY: "test-key" };
    delete process.env.CLAUDE_MODEL;
    delete process.env.CLAUDE_TIMEOUT_MS;
    mockClient.mockImplementation(() => ({ messages: { create: mockCreate } }));
    mockCreate.mockResolvedValue({
      stop_reason: "end_turn", content: [{ type: "text", text: " 답변입니다. " }],
    });
  });
  afterAll(() => { process.env = originalEnv; });

  test("uses the official API with bounded timeout and no automatic retries", async () => {
    await expect(new ClaudeProvider().generateText("질문")).resolves.toBe("답변입니다.");
    expect(mockClient).toHaveBeenCalledWith({
      apiKey: "test-key", baseURL: "https://api.anthropic.com", timeout: 45_000, maxRetries: 0,
    });
    expect(mockCreate).toHaveBeenCalledWith({
      model: "claude-sonnet-5-5", max_tokens: 4096,
      messages: [{ role: "user", content: [{ type: "text", text: "질문" }] }],
    });
  });

  test("maps system instructions, output tokens, schemas and image blocks", async () => {
    const schema = { type: "object", properties: { result: { type: "string" } }, required: ["result"], additionalProperties: false };
    process.env.CLAUDE_TIMEOUT_MS = "12000";
    process.env.CLAUDE_MODEL = "configured-model";
    await new ClaudeProvider().generateText("입력", {
      systemInstruction: "번역하세요", responseMimeType: "application/json", responseJsonSchema: schema,
      config: { maxOutputTokens: 1200, temperature: 0.2 },
      imageUrls: ["https://cdn.discordapp.com/image.png"],
    });
    expect(mockClient.mock.calls[0][0].timeout).toBe(12000);
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      model: "configured-model", max_tokens: 1200,
      system: expect.stringContaining("번역하세요"),
      output_config: { format: { type: "json_schema", schema } },
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "url", url: "https://cdn.discordapp.com/image.png" } },
        { type: "text", text: "입력" },
      ] }],
    }));
    expect(mockCreate.mock.calls[0][0].system).toContain("valid JSON only");
    expect(mockCreate.mock.calls[0][0]).not.toHaveProperty("temperature");
    expect(mockCreate.mock.calls[0][0]).not.toHaveProperty("tools");
  });

  test("uses a request model override", async () => {
    process.env.CLAUDE_MODEL = "configured-model";
    await new ClaudeProvider().generateText("질문", { model: "request-model" });
    expect(mockCreate.mock.calls[0][0].model).toBe("request-model");
  });

  test("rejects missing credentials without sending a request", async () => {
    process.env.ANTHROPIC_API_KEY = "  ";
    await expect(new ClaudeProvider().generateText("질문")).rejects.toThrow("ANTHROPIC_API_KEY");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test.each(["max_tokens", "tool_use", "refusal", null])("rejects incomplete stop reason %s", async (stop_reason) => {
    mockCreate.mockResolvedValue({ stop_reason, content: [{ type: "text", text: "일부 답변" }] });
    await expect(new ClaudeProvider().generateText("질문")).rejects.toThrow("응답이 완료되지 않았습니다");
  });

  test("rejects empty text and combines text blocks only", async () => {
    mockCreate.mockResolvedValueOnce({ stop_reason: "end_turn", content: [{ type: "text", text: " " }] });
    await expect(new ClaudeProvider().generateText("질문")).rejects.toThrow("빈 응답");
    mockCreate.mockResolvedValueOnce({ stop_reason: "end_turn", content: [
      { type: "text", text: "첫" }, { type: "thinking", thinking: "비공개" }, { type: "text", text: " 답변" },
    ] });
    await expect(new ClaudeProvider().generateText("질문")).resolves.toBe("첫 답변");
  });

  test("runs client tools until Claude finishes and returns every result in one turn", async () => {
    const search = { name: "search_gmail", description: "검색", inputSchema: { type: "object", properties: {} },
      run: jest.fn().mockResolvedValue('{"messages":[]}') };
    const broken = { name: "read_gmail", description: "읽기", inputSchema: { type: "object", properties: {} },
      run: jest.fn().mockRejectedValue(new Error("Gmail 로그인 실패")) };
    const toolTurn = { stop_reason: "tool_use", content: [
      { type: "thinking", thinking: "", signature: "sig" },
      { type: "tool_use", id: "t1", name: "search_gmail", input: { query: "newer_than:1d" } },
      { type: "tool_use", id: "t2", name: "read_gmail", input: { uid: 3 } },
      { type: "tool_use", id: "t3", name: "unknown_tool", input: {} },
    ] };
    mockCreate.mockResolvedValueOnce(toolTurn)
      .mockResolvedValueOnce({ stop_reason: "end_turn", content: [{ type: "text", text: "새 메일 없음" }] });

    await expect(new ClaudeProvider().generateText("오늘 메일?", { tools: [search, broken] })).resolves.toBe("새 메일 없음");
    expect(search.run).toHaveBeenCalledWith({ query: "newer_than:1d" });
    const first = mockCreate.mock.calls[0][0];
    expect(first.tools).toEqual([
      { name: "search_gmail", description: "검색", input_schema: { type: "object", properties: {} } },
      { name: "read_gmail", description: "읽기", input_schema: { type: "object", properties: {} } },
    ]);
    expect(first.messages).toHaveLength(1);
    const second = mockCreate.mock.calls[1][0].messages;
    expect(second[1]).toEqual({ role: "assistant", content: toolTurn.content });
    expect(second[2]).toEqual({ role: "user", content: [
      { type: "tool_result", tool_use_id: "t1", content: '{"messages":[]}' },
      { type: "tool_result", tool_use_id: "t2", is_error: true, content: "Gmail 로그인 실패" },
      { type: "tool_result", tool_use_id: "t3", is_error: true, content: expect.stringContaining("unknown_tool") },
    ] });
  });

  test("stops a runaway tool loop", async () => {
    const tool = { name: "search_gmail", description: "검색", inputSchema: { type: "object", properties: {} },
      run: jest.fn().mockResolvedValue("[]") };
    mockCreate.mockResolvedValue({ stop_reason: "tool_use", content: [
      { type: "tool_use", id: "t", name: "search_gmail", input: {} },
    ] });
    await expect(new ClaudeProvider().generateText("질문", { tools: [tool] })).rejects.toThrow("도구 호출이 너무 많아");
    expect(mockCreate).toHaveBeenCalledTimes(8);
  });

  test.each([
    [new sdk.AuthenticationError(401, {}, "sensitive request", new Headers()), "인증에 실패"],
    [new sdk.RateLimitError(429, {}, "sensitive request", new Headers()), "요청 한도"],
    [new sdk.APIConnectionTimeoutError({ message: "sensitive request" }), "시간이 초과"],
    [new Error("sensitive request test-key"), "API 요청에 실패"],
  ])("replaces SDK error details with a safe message", async (error, message) => {
    mockCreate.mockRejectedValue(error);
    await expect(new ClaudeProvider().generateText("질문")).rejects.toThrow(message);
    await expect(new ClaudeProvider().generateText("질문")).rejects.not.toThrow(/sensitive request|test-key/);
  });
});
