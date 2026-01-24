import cron from "node-cron";
import { getAllUsersWithNotification } from "../utils/userStore";
import { getShortTermForecast } from "../utils/kmaHelper";
import kmaData from "../data/kma_data.json";
import { EmbedBuilder, Client } from "discord.js";

// 날씨 알림 스케줄러 시작
export const startWeatherScheduler = (client: Client): void => {
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

  // 매일 오후 12시 (KST) 영어 표현 알림
  cron.schedule(
    "0 12 * * *",
    async () => {
      console.log("[Scheduler] 오후 12시 영어 알림 시작");
      // require 유지 (Features는 아직 JS이므로 직접 require)
      const englishService = require("../features/daily_english/EnglishService");
      await englishService.sendToGeneralChannels(client);
      console.log("[Scheduler] 오후 12시 영어 알림 완료");
    },
    {
      timezone: "Asia/Seoul",
    },
  );
  console.log("[Scheduler] 영어 알림 스케줄러 등록 완료 (매일 오후 12시 KST)");
};
