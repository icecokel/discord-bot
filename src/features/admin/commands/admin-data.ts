/**
 * /admin data - 저장된 데이터 열람
 */

import { ChannelType, EmbedBuilder, Message } from "discord.js";
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
const EMBED_FIELD_VALUE_LIMIT = 1000;

const truncateForEmbed = (value: string): string => {
  if (value.length <= EMBED_FIELD_VALUE_LIMIT) return value;
  return value.slice(0, EMBED_FIELD_VALUE_LIMIT) + "\n...";
};

const getChannelTypeLabel = (type: ChannelType): string => {
  switch (type) {
    case ChannelType.GuildText:
      return "텍스트";
    case ChannelType.GuildAnnouncement:
      return "공지";
    case ChannelType.DM:
      return "DM";
    case ChannelType.GroupDM:
      return "그룹 DM";
    case ChannelType.GuildVoice:
      return "음성";
    case ChannelType.GuildStageVoice:
      return "스테이지";
    case ChannelType.PublicThread:
      return "공개 스레드";
    case ChannelType.PrivateThread:
      return "비공개 스레드";
    case ChannelType.AnnouncementThread:
      return "공지 스레드";
    case ChannelType.GuildForum:
      return "포럼";
    default:
      return `기타(${type})`;
  }
};

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

    const userDetails = userIds
      .map((id) => {
        const pref = userPrefs[id];
        const region = pref.defaultRegion || "-";
        const notify = pref.notificationEnabled ? "🔔" : "🔕";
        return `\`${id}\`: ${region} ${notify}`;
      })
      .join("\n");

    embed.addFields({
      name: "👥 유저 설정 (user-preferences.json)",
      value: truncateForEmbed(
        `총 **${userIds.length}**명 등록\n` +
          `지역 설정: **${usersWithRegion.length}**명 | 알림 ON: **${usersWithNotification.length}**명\n\n` +
          (userDetails || "데이터 없음"),
      ),
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

  // 3. PRIVATE_CHANNEL_ID 해석
  const privateChannelId = process.env.PRIVATE_CHANNEL_ID;
  if (!privateChannelId) {
    embed.addFields({
      name: "🎯 스케줄 발송 채널 (PRIVATE_CHANNEL_ID)",
      value: "설정 안됨",
      inline: false,
    });
  } else {
    let channelInfo = `설정값: \`${privateChannelId}\`\n`;

    try {
      const targetChannel = await message.client.channels.fetch(privateChannelId);

      if (!targetChannel) {
        channelInfo += "조회 결과: 채널 없음";
      } else {
        channelInfo += "조회 결과: ✅ 채널 ID로 정상 인식\n";
        channelInfo += `채널: <#${targetChannel.id}> (\`${targetChannel.id}\`)\n`;
        channelInfo += `채널 타입: ${getChannelTypeLabel(targetChannel.type)}\n`;

        if ("guild" in targetChannel) {
          channelInfo += `소속 서버: **${targetChannel.guild.name}** (\`${targetChannel.guild.id}\`)`;
        }
      }
    } catch (error) {
      channelInfo += "조회 결과: ❌ 채널 조회 실패\n";
      channelInfo += "원인 후보: 잘못된 ID / 봇 미참여 서버 / 권한 부족\n";

      const sameGuild = message.client.guilds.cache.get(privateChannelId);
      if (sameGuild) {
        channelInfo +=
          `추정: 이 값은 서버 ID일 가능성이 높습니다.\n` +
          `서버: **${sameGuild.name}** (\`${sameGuild.id}\`)`;
      }
    }

    embed.addFields({
      name: "🎯 스케줄 발송 채널 (PRIVATE_CHANNEL_ID)",
      value: truncateForEmbed(channelInfo),
      inline: false,
    });
  }

  // 4. Guilds (Server List)
  const guilds = message.client.guilds.cache;
  if (guilds.size > 0) {
    const totalMembers = guilds.reduce((sum, guild) => sum + guild.memberCount, 0);
    const guildDetails = guilds
      .map((guild) => {
        const textChannels = guild.channels.cache.filter(
          (channel) => channel.type === ChannelType.GuildText,
        );
        const representativeChannel =
          textChannels.find(
            (channel) =>
              channel.name.toLowerCase().includes("general") ||
              channel.name.includes("일반"),
          ) ?? textChannels.first();

        const representativeText = representativeChannel
          ? `<#${representativeChannel.id}> (\`${representativeChannel.id}\`)`
          : "없음";

        return (
          `• **${guild.name}**\n` +
          `서버ID: \`${guild.id}\` | 인원: 👤 ${guild.memberCount}명 | 텍스트채널: ${textChannels.size}개\n` +
          `대표 채널ID: ${representativeText}`
        );
      })
      .join("\n\n");

    embed.addFields({
      name: "🏰 참여 중인 서버 현황",
      value: truncateForEmbed(
        `총 **${guilds.size}**개 서버 | 총 인원: **${totalMembers}**명\n` +
          "(아래는 서버 ID와 대표 텍스트 채널 ID)\n\n" +
          guildDetails,
      ),
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
