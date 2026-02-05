import { GoogleGenerativeAI } from "@google/generative-ai";
import { BaseProvider, IGenerationOptions } from "./BaseProvider";

/**
 * Google Gemini API 공급자 구현
 */
export class GeminiProvider extends BaseProvider {
  private apiKey: string | undefined;
  private genAI: GoogleGenerativeAI;
  private defaultModel: string;
  private defaultConfig: any;

  constructor(config: any = {}) {
    super(config);
    this.apiKey = process.env.GEMINI_AI_API_KEY;

    if (!this.apiKey) {
      console.warn(
        "⚠️ GEMINI_AI_API_KEY가 설정되지 않았습니다. Gemini 기능을 사용할 수 없습니다.",
      );
    }

    // API Key가 없어도 인스턴스는 생성되도록 함 (실제 호출 시 에러 처리)
    this.genAI = new GoogleGenerativeAI(this.apiKey || "");
    this.defaultModel = "gemini-3-flash-preview";

    // 기본 생성 설정
    this.defaultConfig = {
      temperature: 1.0,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 1000,
    };
  }

  /**
   * 텍스트를 생성합니다.
   */
  async generateText(
    prompt: string,
    options: IGenerationOptions = {},
  ): Promise<string> {
    try {
      if (!this.apiKey) {
        throw new Error("Gemini API 키가 유효하지 않습니다.");
      }

      const modelName = options.model || this.defaultModel;
      const model = this.genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: options.systemInstruction,
        tools: options.tools,
        generationConfig: {
          ...this.defaultConfig,
          ...options.config,
          responseMimeType: options.responseMimeType,
        },
      });

      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (error: any) {
      console.error(`[GeminiProvider] 생성 오류: ${error.message}`);
      throw error;
    }
  }
}
