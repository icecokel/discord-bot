import Anthropic from "@anthropic-ai/sdk";
import { BaseProvider, IGenerationOptions } from "./base-provider";

export const DEFAULT_CLAUDE_MODEL = "claude-sonnet-5-5";

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

    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: options.model || process.env.CLAUDE_MODEL || DEFAULT_CLAUDE_MODEL,
        max_tokens: Number.isSafeInteger(maxTokens) && maxTokens > 0 ? maxTokens : 4096,
        ...(system ? { system } : {}),
        messages: [{ role: "user", content }],
        ...(options.responseJsonSchema ? {
          output_config: {
            format: { type: "json_schema", schema: options.responseJsonSchema },
          },
        } : {}),
      });
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
