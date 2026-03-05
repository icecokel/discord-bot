import {
  ChannelType,
  EmbedBuilder,
  Message,
  PermissionFlagsBits,
} from "discord.js";
import {
  disableNewsAlertChannel,
  DEFAULT_NEWS_ALERT_SCHEDULE,
  enableNewsAlertChannel,
  getNewsAlertChannel,
  getEnabledNewsAlertChannelsByGuild,
} from "../../../utils/news-alert-store";

const HELP_ALIASES = ["help", "도움", "도움말", "가이드", "설명", "사용법"];
const ENABLE_ALIASES = ["설정", "등록", "추가", "on", "켜기"];
const DISABLE_ALIASES = ["해제", "삭제", "off", "끄기", "취소"];
const LIST_ALIASES = ["목록", "list", "조회", "상태", "확인"];

const pad2 = (value: number): string => value.toString().padStart(2, "0");
const formatSchedule = (hour: number, minute: number): string =>
  `${pad2(hour)}:${pad2(minute)}`;

const extractChannelId = (raw: string | undefined): string | null => {
  if (!raw) return null;

  const mentionMatch = raw.match(/^<#(\d+)>$/);
  if (mentionMatch) return mentionMatch[1];

  if (/^\d+$/.test(raw)) return raw;
  return null;
};

const parseTimeText = (
  raw: string,
): { hour: number; minute: number } | null => {
  const text = raw.trim().replace(/\s+/g, " ");
  if (!text) return null;

  const colonMatch = text.match(/^(\d{1,2}):(\d{1,2})$/);
  if (colonMatch) {
    const hour = Number(colonMatch[1]);
    const minute = Number(colonMatch[2]);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    return { hour, minute };
  }

  const meridiemMatch = text.match(
    /^(오전|오후)\s*(\d{1,2})시(?:\s*(\d{1,2})분?)?$/,
  );
  if (meridiemMatch) {
    const meridiem = meridiemMatch[1];
    const hour12 = Number(meridiemMatch[2]);
    const minute = Number(meridiemMatch[3] || "0");
    if (hour12 < 1 || hour12 > 12 || minute < 0 || minute > 59) return null;

    let hour = hour12;
    if (meridiem === "오후" && hour < 12) hour += 12;
    if (meridiem === "오전" && hour === 12) hour = 0;
    return { hour, minute };
  }

  const hourMatch = text.match(/^(\d{1,2})시(?:\s*(\d{1,2})분?)?$/);
  if (hourMatch) {
    const hour = Number(hourMatch[1]);
    const minute = Number(hourMatch[2] || "0");
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    return { hour, minute };
  }

  return null;
};

const hasManagePermission = (message: Message): boolean => {
  const isOwner = message.author.id === process.env.ADMIN_ID;
  const hasManageGuild =
    message.member?.permissions.has(PermissionFlagsBits.ManageGuild) || false;
  return isOwner || hasManageGuild;
};

const createHelpEmbed = (): EmbedBuilder => {
  return new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle("📰 뉴스 알림 채널 설정")
    .setDescription(
      "뉴스 알림 채널을 방(채널) 단위로 관리합니다. 기본 시간은 08:00이며 설정 시 원하는 시간을 지정할 수 있습니다.",
    )
    .addFields(
      {
        name: "현재 채널 알림 켜기",
        value: "`!뉴스알림 설정`\n`!뉴스알림 설정 06:30`",
      },
      {
        name: "특정 채널 알림 켜기",
        value:
          "`!뉴스알림 설정 #채널 06:30`\n`!뉴스알림 설정 06:30 #채널`\n`!뉴스알림 설정 <채널ID> 오전 6시 30분`",
      },
      {
        name: "알림 끄기",
        value: "`!뉴스알림 해제` 또는 `!뉴스알림 해제 #채널`",
      },
      {
        name: "현재 서버 설정 목록",
        value: "`!뉴스알림 목록`",
      },
    )
    .setFooter({
      text: "권한 필요: 서버 관리(Manage Server) 또는 봇 관리자 / 기본 시간 08:00",
    });
};

const resolveGuildTextChannel = async (
  message: Message,
  channelId: string,
): Promise<{ id: string } | null> => {
  if (!message.guild) return null;

  try {
    const channel = await message.guild.channels.fetch(channelId);
    if (!channel) return null;
    if (
      channel.type !== ChannelType.GuildText &&
      channel.type !== ChannelType.GuildAnnouncement
    ) {
      return null;
    }
    return { id: channel.id };
  } catch {
    return null;
  }
};

const execute = async (message: Message, args: string[]) => {
  const subcommand = args[0]?.toLowerCase();

  if (!subcommand || HELP_ALIASES.includes(subcommand)) {
    return message.reply({ embeds: [createHelpEmbed()] });
  }

  if (!message.guild) {
    return message.reply(
      "❌ 이 명령어는 서버 채널에서만 사용할 수 있습니다.\n대상 방에서 `!뉴스알림 설정` 또는 `!뉴스알림 해제`를 실행해주세요.",
    );
  }

  if (!hasManagePermission(message)) {
    return message.reply(
      "⛔ 이 작업을 수행할 권한이 없습니다.\n서버 관리 권한(Manage Server)이 필요합니다.",
    );
  }

  if (LIST_ALIASES.includes(subcommand)) {
    const channels = getEnabledNewsAlertChannelsByGuild(message.guild.id);
    if (channels.length === 0) {
      return message.reply(
        "📭 이 서버에 설정된 뉴스 알림 채널이 없습니다.\n`!뉴스알림 설정`으로 현재 채널에서 알림을 켜주세요.",
      );
    }

    const lines = channels.map(
      (item, index) =>
        `${index + 1}. <#${item.channelId}> · ${formatSchedule(item.scheduleHour, item.scheduleMinute)} (\`${item.channelId}\`)`,
    );

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle(`📰 ${message.guild.name} 뉴스 알림 채널`)
      .setDescription(lines.join("\n"))
      .setFooter({ text: "해제: !뉴스알림 해제 #채널" })
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  }

  const optionTokens = args.slice(1);
  let targetChannelId = message.channel.id;
  const timeTokens: string[] = [];

  for (const token of optionTokens) {
    const parsedChannelId = extractChannelId(token);
    if (parsedChannelId) {
      targetChannelId = parsedChannelId;
      continue;
    }
    timeTokens.push(token);
  }

  const targetChannel = await resolveGuildTextChannel(message, targetChannelId);

  if (!targetChannel) {
    return message.reply(
      "❌ 텍스트 채널을 찾지 못했습니다.\n`!뉴스알림 설정 #채널` 또는 정확한 채널 ID로 다시 시도해주세요.",
    );
  }

  const timeText = timeTokens.join(" ").trim();
  const parsedTime = timeText ? parseTimeText(timeText) : null;
  if (timeText && !parsedTime) {
    return message.reply(
      "❌ 시간 형식을 확인해주세요.\n예: `06:30`, `18시`, `오전 6시 30분`",
    );
  }

  if (ENABLE_ALIASES.includes(subcommand)) {
    const existing = getNewsAlertChannel(targetChannel.id);
    const nextHour =
      parsedTime?.hour ??
      existing?.scheduleHour ??
      DEFAULT_NEWS_ALERT_SCHEDULE.hour;
    const nextMinute =
      parsedTime?.minute ??
      existing?.scheduleMinute ??
      DEFAULT_NEWS_ALERT_SCHEDULE.minute;

    const saved = enableNewsAlertChannel(
      targetChannel.id,
      message.guild.id,
      {
        updatedBy: message.author.id,
        scheduleHour: nextHour,
        scheduleMinute: nextMinute,
      },
    );

    if (existing && !parsedTime) {
      return message.reply(
        `ℹ️ <#${targetChannel.id}> 채널은 이미 뉴스 알림이 켜져 있습니다.\n현재 발송 시간: **${formatSchedule(saved.scheduleHour, saved.scheduleMinute)}**\n시간 변경: \`!뉴스알림 설정 #채널 HH:MM\``,
      );
    }

    return message.reply(
      `✅ <#${targetChannel.id}> 채널 뉴스 알림을 ${existing ? "업데이트" : "설정"}했습니다.\n발송 시간: **${formatSchedule(saved.scheduleHour, saved.scheduleMinute)}**`,
    );
  }

  if (DISABLE_ALIASES.includes(subcommand)) {
    const removed = disableNewsAlertChannel(targetChannel.id);
    if (!removed) {
      return message.reply(
        `ℹ️ <#${targetChannel.id}> 채널은 이미 뉴스 알림이 꺼져 있습니다.`,
      );
    }

    return message.reply(
      `✅ <#${targetChannel.id}> 채널 뉴스 알림을 해제했습니다.`,
    );
  }

  return message.reply(
    "❌ 사용법: `!뉴스알림 설정 [#채널] [시간]`, `!뉴스알림 해제 [#채널]`, `!뉴스알림 목록`",
  );
};

export default {
  name: "뉴스알림",
  description: "뉴스 스케줄 알림 채널을 방 단위로 설정/해제합니다.",
  keywords: ["뉴스알림", "news-alert", "뉴스스케줄"],
  execute,
};
