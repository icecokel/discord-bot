import cron from "node-cron";
import { Client } from "discord.js";
import newsService from "../../features/daily_news/NewsService";

export class GlobalScheduler {
  private client: Client;

  constructor(client: Client) {
    this.client = client;
  }

  public start() {
    this.scheduleNews();
    console.log("[GlobalScheduler] 공용 스케줄러가 시작되었습니다.");
  }

  private scheduleNews() {
    // 매일 오전 8시 (KST) 뉴스 알림
    cron.schedule(
      "0 8 * * *",
      async () => {
        console.log("[GlobalScheduler] 08시 뉴스 알림 시작");
        await newsService.sendToGeneralChannels(this.client);
        console.log("[GlobalScheduler] 08시 뉴스 알림 완료");
      },
      {
        timezone: "Asia/Seoul",
      },
    );
    console.log("[GlobalScheduler] 뉴스 알림 등록 완료 (매일 08:00 KST)");
  }
}
