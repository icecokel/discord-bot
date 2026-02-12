/**
 * /admin data - 저장된 데이터 열람
 */

import { EmbedBuilder, Message } from "discord.js";
import { registerAdminCommand } from "../../../core/admin-middleware";
import { readJson } from "../../../utils/file-manager";

interface UserPrefs {
  [id: string]: {
    defaultRegion?: string;
    notificationEnabled?: boolean;
  };
}

interface Fortunes {
  [id: string]: {
    date?: string;
    content?: string;
  };
}

const USER_PREFS_FILE = "user-preferences.json";
const LEGACY_USER_PREFS_FILE = "user_preferences.json";

/**
 * 데이터 명령어 핸들러
 */
const handleData = async (message: Message) => {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("📊 저장된 데이터 현황")
    .setTimestamp();

  // 1. user-preferences.json
  const latestUserPrefs = readJson<UserPrefs>(USER_PREFS_FILE, {});
  const userPrefs =
    Object.keys(latestUserPrefs).length > 0
      ? latestUserPrefs
      : readJson<UserPrefs>(LEGACY_USER_PREFS_FILE, {});
  if (userPrefs && Object.keys(userPrefs).length > 0) {
    const userIds = Object.keys(userPrefs);
    const usersWithRegion = userIds.filter(
      (id) => userPrefs[id]?.defaultRegion,
    );
    const usersWithNotification = userIds.filter(
      (id) => userPrefs[id]?.notificationEnabled,
    );

    let userDetails = userIds
      .map((id) => {
        const pref = userPrefs[id];
        const region = pref.defaultRegion || "-";
        const notify = pref.notificationEnabled ? "🔔" : "🔕";
        return `\`${id}\`: ${region} ${notify}`;
      })
      .join("\n");

    if (userDetails.length > 1000) {
      userDetails = userDetails.slice(0, 1000) + "\n...";
    }

    embed.addFields({
      name: "👥 유저 설정 (user-preferences.json)",
      value:
        `총 **${userIds.length}**명 등록\n` +
        `지역 설정: **${usersWithRegion.length}**명 | 알림 ON: **${usersWithNotification.length}**명\n\n` +
        (userDetails || "데이터 없음"),
      inline: false,
    });
  } else {
    embed.addFields({
      name: "👥 유저 설정 (user-preferences.json)",
      value: "파일 없음 또는 읽기 오류",
      inline: false,
    });
  }

  // 2. daily-fortunes.json
  const fortunes = readJson<Fortunes>("daily-fortunes.json", {});
  if (fortunes && Object.keys(fortunes).length > 0) {
    const fortuneCount = Object.keys(fortunes).length;
    let fortuneDetails = "";

    if (fortuneCount > 0) {
      const entries = Object.entries(fortunes).slice(0, 5);
      fortuneDetails = entries
        .map(([userId, data]) => {
          const date = data.date || "-";
          return `\`${userId}\`: ${date}`;
        })
        .join("\n");

      if (fortuneCount > 5) {
        fortuneDetails += `\n... 외 ${fortuneCount - 5}건`;
      }
    } else {
      fortuneDetails = "저장된 운세 없음";
    }

    embed.addFields({
      name: "🔮 오늘의 운세 (daily-fortunes.json)",
      value: `총 **${fortuneCount}**건\n${fortuneDetails}`,
      inline: false,
    });
  } else {
    embed.addFields({
      name: "🔮 오늘의 운세 (daily-fortunes.json)",
      value: "파일 없음 또는 읽기 오류",
      inline: false,
    });
  }

  // 3. Guilds (Server List)
  const guilds = message.client.guilds.cache;
  if (guilds.size > 0) {
    let guildDetails = guilds
      .map((guild) => {
        return `- **${guild.name}** (ID: \`${guild.id}\`) - 👤 ${guild.memberCount}명`;
      })
      .join("\n");

    if (guildDetails.length > 1000) {
      guildDetails = guildDetails.slice(0, 1000) + "\n...";
    }

    embed.addFields({
      name: "🏰 참여 중인 서버 현황",
      value: `총 **${guilds.size}**개 서버\n${guildDetails}`,
      inline: false,
    });
  } else {
    embed.addFields({
      name: "🏰 참여 중인 서버 현황",
      value: "참여 중인 서버가 없습니다.",
      inline: false,
    });
  }

  await message.reply({ embeds: [embed] });
};

// 명령어 등록
registerAdminCommand("data", handleData, "데이터 확인");

export { handleData };
