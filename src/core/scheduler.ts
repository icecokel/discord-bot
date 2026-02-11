import cron from "node-cron";
import { getAllUsersWithNotification } from "../utils/userStore";
import { getShortTermForecast } from "../utils/kmaHelper";
import kmaData from "../data/kma_data.json";
import { EmbedBuilder, Client } from "discord.js";
import englishService from "../features/daily_english/EnglishService";
import japaneseService from "../features/daily_japanese/JapaneseService";
import newsService from "../features/daily_news/NewsService";
import { reminderService } from "../features/tools/reminderService";

// 통합 스케줄러 초기화 (날씨 + 영어 학습)
export const initializeSchedulers = (client: Client): void => {
  // 리마인더 서비스 초기화
  reminderService.initialize(client);

  // 매일 오전 9시 (KST) 실행
  cron.schedule(
    "0 9 * * *",
    async () => {
      console.log("[Scheduler] 오전 9시 날씨 알림 시작");

      const users = getAllUsersWithNotification();
      console.log(`[Scheduler] 알림 대상 유저: ${users.length}명`);

      for (const { userId, region } of users) {
        try {
          // 지역 좌표 조회 (JSON 데이터를 any로 캐스팅하여 접근)
          const kmaAny = kmaData as any;
          let targetData = kmaAny[region];
          if (!targetData) {
            const foundKey = Object.keys(kmaAny).find(
              (key) => key.includes(region) || region.includes(key),
            );
            if (foundKey) targetData = kmaAny[foundKey];
          }

          if (!targetData) {
            console.log(`[Scheduler] ${userId}: 지역 "${region}" 좌표 없음`);
            continue;
          }

          const { nx, ny } = targetData;

          // 날씨 데이터 조회
          const weatherData = await getShortTermForecast(nx, ny);
          if (!weatherData) {
            console.log(`[Scheduler] ${userId}: 날씨 데이터 조회 실패`);
            continue;
          }

          const { today } = weatherData;
          const { current, min, max, popMax } = today;

          // Embed 생성
          const embed = new EmbedBuilder()
            .setColor(0x0099ff)
            .setTitle(`🌤️ ${region} 오늘의 날씨`)
            .setDescription("좋은 하루 보내세요! ☀️")
            .setTimestamp();

          if (current) {
            embed.addFields({
              name: "현재 날씨",
              value: `${current.desc} **${current.temp}°C**`,
              inline: false,
            });
          }

          let tempStr = "";
          if (min !== null) tempStr += `최저 **${min}°**`;
          if (max !== null) tempStr += ` / 최고 **${max}°**`;

          embed.addFields({
            name: "오늘 예보",
            value: `${tempStr}\n☔ 최대 강수확률: **${popMax}%**`,
            inline: false,
          });

          // DM 전송
          const user = await client.users.fetch(userId);
          await user.send({ embeds: [embed] });
          console.log(`[Scheduler] ${user.tag}에게 날씨 DM 전송 완료`);
        } catch (error: any) {
          console.error(`[Scheduler] ${userId} DM 전송 실패:`, error.message);
        }
      }

      console.log("[Scheduler] 오전 9시 날씨 알림 완료");
    },
    {
      timezone: "Asia/Seoul",
    },
  );

  console.log("[Scheduler] 날씨 알림 스케줄러 등록 완료 (매일 오전 9시 KST)");

  // 매일 오후 1시 (KST) 영어 표현 알림
  cron.schedule(
    "0 13 * * *",
    async () => {
      console.log("[Scheduler] 오후 1시 영어 알림 시작");
      await englishService.sendToGeneralChannels(client);
      console.log("[Scheduler] 오후 1시 영어 알림 완료");
    },
    {
      timezone: "Asia/Seoul",
    },
  );
  console.log("[Scheduler] 영어 알림 스케줄러 등록 완료 (매일 오후 1시 KST)");

  // 매일 오후 2시 (KST) 일본어 표현 알림
  cron.schedule(
    "0 14 * * *",
    async () => {
      console.log("[Scheduler] 오후 2시 일본어 알림 시작");
      await japaneseService.sendToGeneralChannels(client);
      console.log("[Scheduler] 오후 2시 일본어 알림 완료");
    },
    {
      timezone: "Asia/Seoul",
    },
  );
  console.log("[Scheduler] 일본어 알림 스케줄러 등록 완료 (매일 오후 2시 KST)");

  // === 뉴스 알림 (하루 3회: 08, 13, 21시) ===
  const newsTimes = [8];
  newsTimes.forEach((hour) => {
    cron.schedule(
      `0 ${hour} * * *`,
      async () => {
        console.log(`[Scheduler] ${hour}시 뉴스 알림 시작`);
        await newsService.sendToGeneralChannels(client);
        console.log(`[Scheduler] ${hour}시 뉴스 알림 완료`);
      },
      {
        timezone: "Asia/Seoul",
      },
    );
  });
  console.log(
    `[Scheduler] 뉴스 알림 스케줄러 등록 완료 (매일 ${newsTimes.join(", ")}시 KST)`,
  );
};
