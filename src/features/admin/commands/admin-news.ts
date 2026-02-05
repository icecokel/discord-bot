import { Message } from "discord.js";
import { registerAdminCommand } from "../../../core/adminMiddleware";
import newsService from "../../daily_news/NewsService";

/**
 * 관리자 전용 뉴스 테스트 명령어
 * 사용법: /뉴스
 */
const newsHandler = async (message: Message, args: string[]) => {
  await newsService.sendTestNews(message.channel);
};

// 명령어 등록
registerAdminCommand("news", newsHandler);
