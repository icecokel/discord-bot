import { GeminiProvider } from "./providers/gemini-provider";
import { HermesProvider } from "./providers/hermes-provider";
import { BaseProvider, IGenerationOptions } from "./providers/base-provider";

type ProviderName = "gemini" | "hermes";

const DEFAULT_PROVIDER: ProviderName = "gemini";

function resolvePrimaryProviderName(name: string | undefined): ProviderName {
  const normalizedName = name?.trim().toLowerCase();

  if (normalizedName === "hermes") {
    return "hermes";
  }

  return DEFAULT_PROVIDER;
}

function resolveFallbackProviderName(
  name: string | undefined,
  primaryProviderName: ProviderName,
): ProviderName | undefined {
  const normalizedName = name?.trim().toLowerCase();

  if (normalizedName !== "gemini" && normalizedName !== "hermes") {
    return undefined;
  }

  if (normalizedName === primaryProviderName) {
    return undefined;
  }

  return normalizedName;
}

function createProvider(name: ProviderName): BaseProvider {
  if (name === "hermes") {
    return new HermesProvider();
  }

  return new GeminiProvider();
}

/**
 * AI 서비스를 관리하는 중앙 클래스
 * 환경 설정에 따라 AI 공급자를 전환합니다.
 */
class AIService {
  private provider: BaseProvider;
  private fallbackProvider?: BaseProvider;

  constructor() {
    const primaryProviderName = resolvePrimaryProviderName(
      process.env.AI_PROVIDER,
    );
    const fallbackProviderName = resolveFallbackProviderName(
      process.env.AI_FALLBACK_PROVIDER,
      primaryProviderName,
    );

    this.provider = createProvider(primaryProviderName);

    if (fallbackProviderName) {
      this.fallbackProvider = createProvider(fallbackProviderName);
    }
  }

  /**
   * 텍스트를 생성합니다.
   * @param {string} prompt - 입력 프롬프트
   * @param {IGenerationOptions} options - 추가 옵션
   * @returns {Promise<string>}
   */
  async generateText(
    prompt: string,
    options: IGenerationOptions = {},
  ): Promise<string> {
    try {
      return await this.provider.generateText(prompt, options);
    } catch (error) {
      if (!this.fallbackProvider) {
        throw error;
      }

      const primaryErrorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `[AIService] 기본 AI 공급자 실패, fallback 실행: ${primaryErrorMessage}`,
      );

      return this.fallbackProvider.generateText(prompt, options);
    }
  }
}

export default AIService;
