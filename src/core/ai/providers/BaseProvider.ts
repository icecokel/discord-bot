export interface IGenerationOptions {
  model?: string;
  config?: any;
  systemInstruction?: string;
  responseMimeType?: string;
  [key: string]: any;
}

/**
 * AI 공급자(Provider)를 위한 추상 기본 클래스
 * 모든 AI 공급자는 이 클래스를 상속받아야 합니다.
 */
export abstract class BaseProvider {
  protected config: any;

  constructor(config: any) {
    this.config = config;
  }

  /**
   * 텍스트 생성을 수행합니다.
   * @param {string} prompt - 프롬프트 텍스트
   * @param {IGenerationOptions} options - 생성 옵션 (선택 사항)
   * @returns {Promise<string>} 생성된 텍스트
   */
  abstract generateText(
    prompt: string,
    options?: IGenerationOptions,
  ): Promise<string>;
}
