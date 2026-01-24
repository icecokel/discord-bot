/**
 * AI 공급자(Provider)를 위한 추상 기본 클래스
 * 모든 AI 공급자는 이 클래스를 상속받아야 합니다.
 */
class BaseProvider {
  constructor(config) {
    this.config = config;
  }

  /**
   * 텍스트 생성을 수행합니다.
   * @param {string} prompt - 프롬프트 텍스트
   * @param {Object} options - 생성 옵션 (선택 사항)
   * @returns {Promise<string>} 생성된 텍스트
   */
  async generateText(prompt, options = {}) {
    throw new Error("generateText method must be implemented");
  }
}

module.exports = BaseProvider;
