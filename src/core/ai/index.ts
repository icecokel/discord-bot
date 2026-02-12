import AIService from "./ai-service";

// 싱글톤 인스턴스 생성 및 내보내기
export const aiService = new AIService();
export * from "./search-service";
