import { Message } from "discord.js";
import { registerAdminCommand } from "../../../core/admin-middleware";
import newsService from "../../daily_news/news-service";

/**
 * 관리자 전용 뉴스 테스트 명령어
 * 사용법: /뉴스
 */
const newsHandler = async (message: Message) => {
  await newsService.sendTestNews(message.channel);
};

// 명령어 등록
registerAdminCommand("news", newsHandler, "뉴스 콘텐츠 테스트");
