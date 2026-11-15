import Anthropic from "@anthropic-ai/sdk";
import { AiTool, BaseProvider, IGenerationOptions } from "./base-provider";

export const DEFAULT_CLAUDE_MODEL = "claude-sonnet-5-5";
// Each round is one API call; a mail question normally needs a search and a read or two.
const MAX_TOOL_ROUNDS = 8;
const MAX_TOOL_RESULT_LENGTH = 40_000;

const runTool = async (
  tools: AiTool[],
  block: Anthropic.ToolUseBlock,
): Promise<Anthropic.ToolResultBlockParam> => {
  const tool = tools.find((candidate) => candidate.name === block.name);
  try {
    if (!tool) throw new Error(`알 수 없는 도구입니다: ${block.name}`);
    const input = block.input && typeof block.input === "object" ? block.input as Record<string, unknown> : {};
    const output = await tool.run(input);
    console.log(`[ClaudeProvider] 도구 실행: ${block.name}`);
    return {
      type: "tool_result",
      tool_use_id: block.id,
      content: output.length > MAX_TOOL_RESULT_LENGTH
        ? `${output.slice(0, MAX_TOOL_RESULT_LENGTH)}\n...(결과가 길어 잘렸습니다)`
        : output,
    };
  } catch (error) {
    console.error(`[ClaudeProvider] 도구 실패: ${block.name}`);
    return {
      type: "tool_result",
      tool_use_id: block.id,
      is_error: true,
      content: error instanceof Error ? error.message.slice(0, 300) : "도구 실행에 실패했습니다.",
    };
  }
};

export class ClaudeProvider extends BaseProvider {
  constructor(config: any = {}) {
    super(config);
  }

  async generateText(
    prompt: string,
    options: IGenerationOptions = {},
  ): Promise<string> {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY가 설정되지 않았습니다.");

    const timeout = Number(process.env.CLAUDE_TIMEOUT_MS);
    const client = new Anthropic({
      apiKey,
      baseURL: "https://api.anthropic.com",
      timeout: Number.isFinite(timeout) && timeout > 0 ? timeout : 45_000,
      maxRetries: 0,
    });
    const maxTokens = options.config?.maxOutputTokens ?? 4096;
    const system = [
      options.systemInstruction,
      options.responseMimeType === "application/json"
        ? "Respond with valid JSON only. Do not include markdown, prose, or code fences."
        : undefined,
    ].filter(Boolean).join("\n\n");
    const content: Anthropic.ContentBlockParam[] = [
      ...(options.imageUrls || []).map((url): Anthropic.ImageBlockParam => ({
        type: "image",
        source: { type: "url", url },
      })),
      { type: "text", text: prompt },
    ];

    const tools = options.tools || [];
    const messages: Anthropic.MessageParam[] = [{ role: "user", content }];
    const request = {
      model: options.model || process.env.CLAUDE_MODEL || DEFAULT_CLAUDE_MODEL,
      max_tokens: Number.isSafeInteger(maxTokens) && maxTokens > 0 ? maxTokens : 4096,
      ...(system ? { system } : {}),
      ...(tools.length ? {
        tools: tools.map((tool): Anthropic.Tool => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema,
        })),
      } : {}),
      ...(options.responseJsonSchema ? {
        output_config: {
          format: { type: "json_schema" as const, schema: options.responseJsonSchema },
        },
      } : {}),
    };

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const response = await this.createMessage(client, { ...request, messages: [...messages] });
      if (response.stop_reason === "tool_use" && tools.length) {
        const toolUses = response.content.filter(
          (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
        );
        // Keep the whole assistant turn (thinking blocks included) and answer every call at once.
        messages.push({ role: "assistant", content: response.content });
        messages.push({
          role: "user",
          content: await Promise.all(toolUses.map((block) => runTool(tools, block))),
        });
        continue;
      }
      return this.readText(response);
    }
    throw new Error("Claude 도구 호출이 너무 많아 중단했습니다. 질문 범위를 좁혀 다시 시도해주세요.");
  }

  private async createMessage(
    client: Anthropic,
    body: Anthropic.MessageCreateParamsNonStreaming,
  ): Promise<Anthropic.Message> {
    try {
      return await client.messages.create(body);
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError ||
          error instanceof Anthropic.PermissionDeniedError) {
        throw new Error("Claude 인증에 실패했습니다. ANTHROPIC_API_KEY와 API 권한을 확인해주세요.");
      }
      if (error instanceof Anthropic.RateLimitError) {
        throw new Error("Claude 요청 한도에 도달했습니다. 잠시 후 다시 시도해주세요.");
      }
      if (error instanceof Anthropic.APIConnectionTimeoutError) {
        throw new Error("Claude 응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.");
      }
      // SDK 오류의 원문에는 요청 데이터나 인증 정보가 포함될 수 있다.
      throw new Error("Claude API 요청에 실패했습니다. 모델과 연결 상태를 확인해주세요.");
    }
  }

  private readText(response: Anthropic.Message): string {
    if (response.stop_reason !== "end_turn") {
      throw new Error("Claude 응답이 완료되지 않았습니다. 요청 범위를 줄여 다시 시도해주세요.");
    }
    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();
    if (!text) throw new Error("Claude가 빈 응답을 반환했습니다.");
    return text;
  }
}
