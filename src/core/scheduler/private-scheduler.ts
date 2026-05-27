import cron from "node-cron";
import { Client } from "discord.js";
import { getAllUsersWithNotification } from "../../utils/user-store";
import { getShortTermForecast } from "../../utils/kma-helper";
import kmaData from "../../data/kma-data.json";
import geekNewsService from "../../features/daily_news/geek-news-service";
import {
  buildTodayWeatherNotification,
  buildTomorrowWeatherNotification,
} from "../../features/tools/weather-notification-message";

type WeatherNotificationTarget = "today" | "tomorrow";

export class PrivateScheduler {
  private client: Client;
  private readonly targetChannelId = process.env.PRIVATE_CHANNEL_ID;

  constructor(client: Client) {
    this.client = client;
  }

  public start() {
    this.scheduleWeather();
    this.scheduleNews();

    if (this.targetChannelId) {
      console.log(
        `[PrivateScheduler] 개인 스케줄러가 시작되었습니다. (채널: ${this.targetChannelId})`,
      );
    } else {
      console.log(
        "[PrivateScheduler] PRIVATE_CHANNEL_ID가 없어 긱뉴스 알림은 스킵합니다.",
      );
    }
  }

  private scheduleNews() {
    this.scheduleGeekNewsNotification("30 8 * * *", "오전 8시 30분");
    this.scheduleGeekNewsNotification("30 14 * * *", "오후 2시 30분");
    console.log(
      "[PrivateScheduler] 긱뉴스 알림 등록 완료 (매일 08:30 / 14:30 KST)",
    );
  }

  private scheduleGeekNewsNotification(
    cronExpression: string,
    scheduleLabel: string,
  ) {
    cron.schedule(
      cronExpression,
      async () => {
        if (!this.targetChannelId) {
          console.log(
            `[PrivateScheduler] PRIVATE_CHANNEL_ID 없음. ${scheduleLabel} 긱뉴스 스킵`,
          );
          return;
        }

        console.log(`[PrivateScheduler] ${scheduleLabel} 긱뉴스 알림 시작`);
        await geekNewsService.sendToChannel(this.client, this.targetChannelId);
        console.log(`[PrivateScheduler] ${scheduleLabel} 긱뉴스 알림 완료`);
      },
      { timezone: "Asia/Seoul" },
    );
  }

  private scheduleWeather() {
    this.scheduleWeatherNotification("30 6 * * *", "오전 6시 30분", "today");
    this.scheduleWeatherNotification(
      "30 22 * * *",
      "오후 10시 30분",
      "tomorrow",
    );
    console.log(
      "[PrivateScheduler] 날씨 알림 등록 완료 (매일 06:30 오늘 / 22:30 내일 KST)",
    );
  }

  private scheduleWeatherNotification(
    cronExpression: string,
    scheduleLabel: string,
    target: WeatherNotificationTarget,
  ) {
    cron.schedule(
      cronExpression,
      async () => {
        const targetLabel = target === "today" ? "오늘" : "내일";
        console.log(
          `[PrivateScheduler] ${scheduleLabel} ${targetLabel} 날씨 알림 시작`,
        );

        const users = getAllUsersWithNotification();
        console.log(
          `[PrivateScheduler] 날씨 알림 대상 유저: ${users.length}명`,
        );

        for (const { userId, region } of users) {
          await this.sendWeatherDM(userId, region, target);
        }

        console.log(
          `[PrivateScheduler] ${scheduleLabel} ${targetLabel} 날씨 알림 완료`,
        );
      },
      {
        timezone: "Asia/Seoul",
      },
    );
  }

  private async sendWeatherDM(
    userId: string,
    region: string,
    target: WeatherNotificationTarget,
  ) {
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

      const oneLinePreview =
        target === "today"
          ? buildTodayWeatherNotification(region, weatherData.today)
          : buildTomorrowWeatherNotification(region, weatherData.tomorrow);

      const user = await this.client.users.fetch(userId);
      await user.send(oneLinePreview);
      console.log(
        `[PrivateScheduler] ${user.tag}에게 ${target === "today" ? "오늘" : "내일"} 날씨 DM 전송 완료`,
      );
    } catch (error: any) {
      console.error(
        `[PrivateScheduler] ${userId} DM 전송 실패:`,
        error.message,
      );
    }
  }
}
