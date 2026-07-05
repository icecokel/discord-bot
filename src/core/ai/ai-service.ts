import { GeminiProvider } from "./providers/gemini-provider";
import { HermesProvider } from "./providers/hermes-provider";
import { CodexProvider } from "./providers/codex-provider";
import { BaseProvider, IGenerationOptions } from "./providers/base-provider";

export type ProviderName = "gemini" | "hermes" | "codex";

const DEFAULT_PROVIDER: ProviderName = "gemini";

export interface GeneratedTextResult {
  providerName: ProviderName;
  text: string;
  usedFallback: boolean;
}

function resolvePrimaryProviderName(name: string | undefined): ProviderName {
  const normalizedName = name?.trim().toLowerCase();

  if (normalizedName === "hermes") {
    return "hermes";
  }

  if (normalizedName === "codex") {
    return "codex";
  }

  return DEFAULT_PROVIDER;
}

function resolveFallbackProviderName(
  name: string | undefined,
  primaryProviderName: ProviderName,
): ProviderName | undefined {
  const normalizedName = name?.trim().toLowerCase();

  if (
    normalizedName !== "gemini" &&
    normalizedName !== "hermes" &&
    normalizedName !== "codex"
  ) {
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

  if (name === "codex") {
    return new CodexProvider();
  }

  return new GeminiProvider();
}

/**
 * AI 서비스를 관리하는 중앙 클래스
 * 환경 설정에 따라 AI 공급자를 전환합니다.
 */
class AIService {
  private provider!: BaseProvider;
  private providerName!: ProviderName;
  private fallbackProvider?: BaseProvider;
  private fallbackProviderName?: ProviderName;

  constructor() {
    this.configureProviders(
      process.env.AI_PROVIDER,
      process.env.AI_FALLBACK_PROVIDER,
    );
  }

  private configureProviders(
    primaryProvider: string | undefined,
    fallbackProvider: string | undefined,
  ): void {
    const primaryProviderName = resolvePrimaryProviderName(
      primaryProvider,
    );
    const fallbackProviderName = resolveFallbackProviderName(
      fallbackProvider,
      primaryProviderName,
    );

    this.providerName = primaryProviderName;
    this.provider = createProvider(primaryProviderName);

    if (fallbackProviderName) {
      this.fallbackProviderName = fallbackProviderName;
      this.fallbackProvider = createProvider(fallbackProviderName);
    } else {
      this.fallbackProviderName = undefined;
      this.fallbackProvider = undefined;
    }
  }

  getProviderStatus(): {
    providerName: ProviderName;
    fallbackProviderName?: ProviderName;
  } {
    return {
      providerName: this.providerName,
      fallbackProviderName: this.fallbackProviderName,
    };
  }

  setPrimaryProvider(providerName: ProviderName): void {
    this.configureProviders(providerName, process.env.AI_FALLBACK_PROVIDER);
  }

  clearCodexThread(userId: string, channelId: string): boolean {
    const threadKey = `${userId}:${channelId}`;
    let cleared = false;

    for (const provider of [this.provider, this.fallbackProvider]) {
      const maybeCodexProvider = provider as Partial<CodexProvider> | undefined;
      if (typeof maybeCodexProvider?.clearThread === "function") {
        cleared = maybeCodexProvider.clearThread(threadKey) || cleared;
      }
    }

    return cleared;
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
    const result = await this.generateTextWithProvider(prompt, options);
    return result.text;
  }

  async generateTextWithProvider(
    prompt: string,
    options: IGenerationOptions = {},
  ): Promise<GeneratedTextResult> {
    const { disableProviderFallback, ...providerOptions } = options;
    try {
      return {
        providerName: this.providerName,
        text: await this.provider.generateText(prompt, providerOptions),
        usedFallback: false,
      };
    } catch (error) {
      if (this.providerName === "hermes" && providerOptions.hermesSessionName) {
        const { hermesSessionName, ...oneshotOptions } = providerOptions;
        try {
          return {
            providerName: "hermes",
            text: await this.provider.generateText(prompt, oneshotOptions),
            usedFallback: true,
          };
        } catch (oneshotError) {
          const oneshotErrorMessage =
            oneshotError instanceof Error
              ? oneshotError.message
              : String(oneshotError);
          console.error(
            `[AIService] Hermes session fallback 실패: ${oneshotErrorMessage}`,
          );
        }
      }

      if (
        disableProviderFallback ||
        !this.fallbackProvider ||
        !this.fallbackProviderName
      ) {
        throw error;
      }

      const primaryErrorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `[AIService] 기본 AI 공급자 실패, fallback 실행: ${primaryErrorMessage}`,
      );

      return {
        providerName: this.fallbackProviderName,
        text: await this.fallbackProvider.generateText(prompt, providerOptions),
        usedFallback: true,
      };
    }
  }

  async generateTextWithProviderOnly(
    providerName: ProviderName,
    prompt: string,
    options: IGenerationOptions = {},
  ): Promise<GeneratedTextResult> {
    const provider = createProvider(providerName);

    return {
      providerName,
      text: await provider.generateText(prompt, options),
      usedFallback: false,
    };
  }
}

export default AIService;
