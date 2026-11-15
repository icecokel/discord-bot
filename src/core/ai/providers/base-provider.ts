/**
 * A client-side tool the model may call while answering. Only the Claude provider runs tools;
 * other providers ignore this option.
 */
export interface AiTool {
  name: string;
  description: string;
  inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  /** Returns the text handed back to the model. Throwing reports the error message to the model. */
  run(input: Record<string, unknown>): Promise<string>;
}

/** A group of related tools plus the system-prompt guidance on when and how to use them. */
export interface AiToolset {
  name: string;
  guidance: string;
  tools: AiTool[];
}

export interface IGenerationOptions {
  tools?: AiTool[];
  model?: string;
  config?: any;
  systemInstruction?: string;
  responseMimeType?: string;
  responseJsonSchema?: Record<string, unknown>;
  imageUrls?: string[];
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
