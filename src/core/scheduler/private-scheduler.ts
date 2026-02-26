import cron from "node-cron";
import { Client } from "discord.js";
import { getAllUsersWithNotification } from "../../utils/user-store";
import { getShortTermForecast } from "../../utils/kma-helper";
import kmaData from "../../data/kma-data.json";
import { reminderService } from "../../features/tools/reminder-service"; // 리마인더는 전역이나 PrivateScheduler에서 초기화
import englishService from "../../features/daily_english/english-service";
import japaneseService from "../../features/daily_japanese/japanese-service";
import { busAlertService } from "../../features/tools/bus-alert-service";
import geekNewsService from "../../features/daily_news/geek-news-service";
import newsService from "../../features/daily_news/news-service";

export class PrivateScheduler {
  private client: Client;
  private readonly targetChannelId = process.env.PRIVATE_CHANNEL_ID;

  constructor(client: Client) {
    this.client = client;
  }

  public start() {
    this.scheduleReminder(); // 리마인더는 별도 루프지만 여기서 init
    this.scheduleBusAlert();
    this.scheduleWeather();
    this.scheduleNews();

    if (this.targetChannelId) {
      this.scheduleEnglish();
      this.scheduleJapanese();
      console.log(
        `[PrivateScheduler] 개인 스케줄러가 시작되었습니다. (채널: ${this.targetChannelId})`,
      );
    } else {
      console.log(
        "[PrivateScheduler] PRIVATE_CHANNEL_ID가 없어 영어/일본어 알림은 스킵합니다.",
      );
    }
  }

  private scheduleReminder() {
    reminderService.initialize(this.client);
  }

  private scheduleBusAlert() {
    busAlertService.initialize(this.client);
  }

  private scheduleNews() {
    cron.schedule(
      "0 8 * * *",
      async () => {
        if (!this.targetChannelId) {
          console.log(
            "[PrivateScheduler] PRIVATE_CHANNEL_ID 없음. 08시 뉴스/긱뉴스 스킵",
          );
          return;
        }

        console.log("[PrivateScheduler] 오전 8시 뉴스/긱뉴스 알림 시작");
        await Promise.all([
          newsService.sendToChannel(this.client, this.targetChannelId),
          geekNewsService.sendToChannel(this.client, this.targetChannelId),
        ]);
        console.log("[PrivateScheduler] 오전 8시 뉴스/긱뉴스 알림 완료");
      },
      { timezone: "Asia/Seoul" },
    );
    console.log("[PrivateScheduler] 뉴스/긱뉴스 알림 등록 완료 (매일 08:00 KST)");
  }

  private scheduleWeather() {
    // 매일 오전 7시 (KST) 날씨 알림 (기존 로직 유지 - DM 발송)
    cron.schedule(
      "0 7 * * *",
      async () => {
        console.log("[PrivateScheduler] 오전 7시 날씨 알림 시작");

        const users = getAllUsersWithNotification();
        console.log(
          `[PrivateScheduler] 날씨 알림 대상 유저: ${users.length}명`,
        );

        for (const { userId, region } of users) {
          await this.sendWeatherDM(userId, region);
        }

        console.log("[PrivateScheduler] 오전 7시 날씨 알림 완료");
      },
      {
        timezone: "Asia/Seoul",
      },
    );
    console.log("[PrivateScheduler] 날씨 알림 등록 완료 (매일 07:00 KST)");
  }

  private async sendWeatherDM(userId: string, region: string) {
    try {
      const kmaAny = kmaData as any;
      let targetData = kmaAny[region];
      if (!targetData) {
        const foundKey = Object.keys(kmaAny).find(
          (key) => key.includes(region) || region.includes(key),
        );
        if (foundKey) targetData = kmaAny[foundKey];
      }

      if (!targetData) {
        console.log(`[PrivateScheduler] ${userId}: 지역 "${region}" 좌표 없음`);
        return;
      }

      const { nx, ny } = targetData;
      const weatherData = await getShortTermForecast(nx, ny);
      if (!weatherData) {
        console.log(`[PrivateScheduler] ${userId}: 날씨 데이터 조회 실패`);
        return;
      }

      const { today } = weatherData;
      const { min, max, popMax } = today;
      const minText = min !== null ? `${min}°` : "-";
      const maxText = max !== null ? `${max}°` : "-";
      const oneLinePreview =
        `🌤️ ${region} | 최저 ${minText} | 최고 ${maxText} | 비/눈 ${popMax}%`;

      const user = await this.client.users.fetch(userId);
      await user.send(oneLinePreview);
      console.log(`[PrivateScheduler] ${user.tag}에게 날씨 DM 전송 완료`);
    } catch (error: any) {
      console.error(
        `[PrivateScheduler] ${userId} DM 전송 실패:`,
        error.message,
      );
    }
  }

  private scheduleEnglish() {
    // 매일 오후 1시 (KST) 영어 표현 알림
    cron.schedule(
      "0 13 * * *",
      async () => {
        if (!this.targetChannelId) return;
        console.log("[PrivateScheduler] 오후 1시 영어 알림 시작");
        await englishService.sendToChannel(this.client, this.targetChannelId);
        console.log("[PrivateScheduler] 오후 1시 영어 알림 완료");
      },
      { timezone: "Asia/Seoul" },
    );
    console.log("[PrivateScheduler] 영어 알림 등록 완료 (매일 13:00 KST)");
  }

  private scheduleJapanese() {
    // 매일 오후 2시 (KST) 일본어 표현 알림
    cron.schedule(
      "0 14 * * *",
      async () => {
        if (!this.targetChannelId) return;
        console.log("[PrivateScheduler] 오후 2시 일본어 알림 시작");
        await japaneseService.sendToChannel(this.client, this.targetChannelId);
        console.log("[PrivateScheduler] 오후 2시 일본어 알림 완료");
      },
      { timezone: "Asia/Seoul" },
    );
    console.log("[PrivateScheduler] 일본어 알림 등록 완료 (매일 14:00 KST)");
  }
}
