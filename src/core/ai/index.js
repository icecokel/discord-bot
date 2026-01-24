const AIService = require("./AIService");

// 싱글톤 인스턴스 생성 및 내보내기
const aiService = new AIService();

module.exports = {
  aiService,
};
