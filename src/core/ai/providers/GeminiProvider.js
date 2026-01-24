const { GoogleGenerativeAI } = require("@google/generative-ai");
const BaseProvider = require("./BaseProvider");

/**
 * Google Gemini API 공급자 구현
 */
class GeminiProvider extends BaseProvider {
  constructor(config = {}) {
    super(config);
    this.apiKey = process.env.GEMINI_AI_API_KEY;

    if (!this.apiKey) {
      console.warn(
        "⚠️ GEMINI_AI_API_KEY가 설정되지 않았습니다. Gemini 기능을 사용할 수 없습니다.",
      );
    }

    this.genAI = new GoogleGenerativeAI(this.apiKey);
    this.defaultModel = "gemini-2.0-flash";

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
   * @param {string} prompt - 입력 프롬프트
   * @param {Object} options - 추가 옵션
   * @returns {Promise<string>} 생성된 텍스트
   */
  async generateText(prompt, options = {}) {
    try {
      if (!this.apiKey) {
        throw new Error("Gemini API 키가 유효하지 않습니다.");
      }

      const modelName = options.model || this.defaultModel;
      const model = this.genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          ...this.defaultConfig,
          ...options.config,
        },
      });

      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (error) {
      console.error(`[GeminiProvider] 생성 오류: ${error.message}`);
      throw error;
    }
  }
}

module.exports = GeminiProvider;
