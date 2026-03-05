import cron from "node-cron";
import { Client } from "discord.js";
import newsService from "../../features/daily_news/news-service";

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
    // 매분 실행하며 채널별 설정 시간(KST)에 맞춰 뉴스 알림
    cron.schedule(
      "* * * * *",
      async () => {
        await newsService.sendScheduledChannels(this.client);
      },
      {
        timezone: "Asia/Seoul",
      },
    );
    console.log(
      "[GlobalScheduler] 뉴스 알림 등록 완료 (매분 체크, 채널별 시간 적용)",
    );
  }
}
