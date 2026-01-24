const GeminiProvider = require("./providers/GeminiProvider");

/**
 * AI 서비스를 관리하는 중앙 클래스
 * 현재는 Gemini만 지원하지만, 추후 다른 공급자도 쉽게 전환 가능하도록 설계
 */
class AIService {
  constructor() {
    this.provider = new GeminiProvider();
  }

  /**
   * 텍스트를 생성합니다.
   * @param {string} prompt - 입력 프롬프트
   * @param {Object} options - 추가 옵션
   * @returns {Promise<string>}
   */
  async generateText(prompt, options = {}) {
    return this.provider.generateText(prompt, options);
  }
}

module.exports = AIService;
