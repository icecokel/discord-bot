import { aiService } from "./index";

/**
 * AI 웹 검색 서비스
 * Google Search 도구를 사용하여 최신 정보를 검색하고 요약합니다.
 */
class SearchService {
  /**
   * 질문에 대한 답변을 검색하여 생성합니다.
   * @param query 검색할 질문
   * @returns AI가 생성한 답변
   */
  async search(query: string): Promise<string> {
    try {
      const response = await aiService.generateText(query, {
        tools: this.getTools(),
      });
      return response;
    } catch (error: any) {
      console.error(`[SearchService] 검색 오류: ${error.message}`);
      throw error;
    }
  }

  /**
   * Google 검색 도구 설정을 반환합니다.
   * 다른 서비스에서 검색 기능을 사용하고 싶을 때 이 설정을 가져가서 사용할 수 있습니다.
   */
  getTools(): any[] {
    return [{ googleSearch: {} }];
  }
}

export const searchService = new SearchService();
