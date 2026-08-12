import { HermesProvider } from "./providers/hermes-provider";
import { CodexProvider } from "./providers/codex-provider";
import { BaseProvider, IGenerationOptions } from "./providers/base-provider";

export type ProviderName = "hermes" | "codex";

const DEFAULT_PROVIDER: ProviderName = "codex";

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

function createProvider(name: ProviderName): BaseProvider {
  if (name === "hermes") {
    return new HermesProvider();
  }

  return new CodexProvider();
}

/**
 * AI 서비스를 관리하는 중앙 클래스
 * 환경 설정에 따라 AI 공급자를 전환합니다.
 */
class AIService {
  private provider!: BaseProvider;
  private providerName!: ProviderName;

  constructor() {
    this.configureProvider(process.env.AI_PROVIDER);
  }

  private configureProvider(name: string | undefined): void {
    this.providerName = resolvePrimaryProviderName(name);
    this.provider = createProvider(this.providerName);
  }

  getProviderStatus(): { providerName: ProviderName } {
    return { providerName: this.providerName };
  }

  setPrimaryProvider(providerName: ProviderName): void {
    this.configureProvider(providerName);
  }

  clearCodexThread(userId: string, channelId: string): boolean {
    const threadKey = `${userId}:${channelId}`;
    const maybeCodexProvider = this.provider as Partial<CodexProvider>;
    return typeof maybeCodexProvider.clearThread === "function"
      ? maybeCodexProvider.clearThread(threadKey)
      : false;
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
    try {
      return {
        providerName: this.providerName,
        text: await this.provider.generateText(prompt, options),
        usedFallback: false,
      };
    } catch (error) {
      if (this.providerName === "hermes" && options.hermesSessionName) {
        const { hermesSessionName, ...oneshotOptions } = options;
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
      throw error;
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
