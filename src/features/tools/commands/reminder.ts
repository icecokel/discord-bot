import { Message, EmbedBuilder } from "discord.js";
import { reminderService } from "../reminder-service";

/**
 * 리마인더 명령어
 * 사용법: !리마인더 <시간> <메시지>
 * 예: !리마인더 10분 뒤 운동하기
 * 예: !리마인더 12월 25일 크리스마스
 * 예: !리마인더 삭제 a1b2
 */
const execute = async (
  message: Message,
  args: string[],
): Promise<void | Message> => {
  const subcommand = args[0];

  // 목록 조회
  if (subcommand === "목록" || subcommand === "list") {
    const reminders = reminderService.getRemindersByChannel(message.channel.id);

    if (reminders.length === 0) {
      return message.reply("📭 현재 채널에 등록된 리마인더가 없습니다.");
    }

    const embed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle(`📅 ${message.guild?.name || "현재 채널"} 리마인더 목록`)
      .setDescription("이 채널에 등록된 알림 목록입니다.")
      .setTimestamp();

    reminders.forEach((r) => {
      const date = new Date(r.targetTime);
      const now = new Date();
      const diff = r.targetTime - now.getTime();

      let timeLeftStr = "";
      if (diff < 0) {
        timeLeftStr = "알림 발송 중...";
      } else {
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor(
          (diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
        );
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

        if (days > 0) timeLeftStr += `${days}일 `;
        if (hours > 0) timeLeftStr += `${hours}시간 `;
        if (minutes > 0) timeLeftStr += `${minutes}분 `;
        if (timeLeftStr === "") timeLeftStr = "곧";
        timeLeftStr += " 후";
      }

      embed.addFields({
        name: `[${r.shortId}] ${date.toLocaleString()} (${timeLeftStr})`,
        value: `**"${r.message}"** (등록: <@${r.userId}>)`,
        inline: false,
      });
    });

    return message.reply({ embeds: [embed] });
  }

  // 삭제
  if (
    subcommand === "삭제" ||
    subcommand === "remove" ||
    subcommand === "delete"
  ) {
    const shortId = args[1];
    if (!shortId) {
      return message.reply(
        "❌ 삭제할 리마인더 ID를 입력해주세요. (예: `!리마인더 삭제 a1b2`)",
      );
    }

    const isAdmin = message.author.id === process.env.ADMIN_ID;
    const result = reminderService.removeReminderByShortId(
      shortId,
      message.author.id,
      { isAdmin },
    );

    if (result.ok) {
      return message.reply(
        `✅ 리마인더 삭제 완료: **[${result.reminder.shortId}] ${result.reminder.message}**`,
      );
    }

    if (result.reason === "FORBIDDEN") {
      return message.reply(
        "⛔ 본인이 등록한 리마인더만 삭제할 수 있습니다.",
      );
    }

    if (result.reason === "NOT_FOUND") {
      return message.reply(
        `❌ 해당 ID(${shortId})를 가진 리마인더를 찾을 수 없습니다. 목록을 확인해주세요.`,
      );
    }
  }

  if (args.length < 2) {
    return message.reply(
      "❌ 사용법: `!리마인더 <시간> <메시지>` 또는 `!리마인더 목록`, `!리마인더 삭제 <ID>`\n" +
        "예: `!리마인더 10분 뒤 라면`, `!리마인더 내일 점심 약속`, `!리마인더 오후 5시 퇴근`",
    );
  }

  const fullContent = args.join(" ");
  let targetTime: number | null = null;
  let messageContent = "";
  let timeStr = "";

  // 1. "N분/시간/초 뒤" 패턴
  const relativeMatch = fullContent.match(
    /^(\d+(?:분|시간|초))\s*(?:뒤|후)?\s+(.+)$/,
  );
  if (relativeMatch) {
    timeStr = relativeMatch[1];
    messageContent = relativeMatch[2];
  } else {
    // 2. "M월 d일 [오전/오후] [H시 m분]" 패턴
    const dateMatch = fullContent.match(
      /^(\d+월\s*\d+일(?:\s*(?:오전|오후)?\s*\d+시(?:\s*\d+분)?)?)\s+(.+)$/,
    );
    if (dateMatch) {
      timeStr = dateMatch[1];
      messageContent = dateMatch[2];
    } else {
      // 3. "내일/모레/글피 [오전/오후] [H시 m분]" 패턴
      const naturalDateMatch = fullContent.match(
        /^((?:내일|모레|글피)(?:\s*(?:오전|오후)?\s*\d+시(?:\s*\d+분)?)?)\s+(.+)$/,
      );
      if (naturalDateMatch) {
        timeStr = naturalDateMatch[1];
        messageContent = naturalDateMatch[2];
      } else {
        // 4. "[오전/오후] H시 m분" 패턴 (시간만)
        const timeMatch = fullContent.match(
          /^((?:오전|오후)?\s*\d+시(?:\s*\d+분)?)\s+(.+)$/,
        );
        if (timeMatch) {
          timeStr = timeMatch[1];
          messageContent = timeMatch[2];
        }
      }
    }
  }

  if (timeStr) {
    targetTime = reminderService.parseTargetTime(timeStr);
  }

  if (!targetTime || isNaN(targetTime)) {
    return message.reply(
      "❌ 시간 형식을 이해하지 못했습니다.\n" +
        "가능한 형식:\n" +
        "- `10분 뒤`, `1시간 후`\n" +
        "- `내일`, `내일 10시`, `모레 오후 2시`\n" +
        "- `3월 1일`, `오후 5시 30분`",
    );
  }

  if (!messageContent) {
    return message.reply("❌ 알림 메시지를 입력해주세요.");
  }

  // 리마인더 등록
  const reminder = reminderService.addReminder(
    message.author.id,
    message.channel.id,
    targetTime,
    messageContent,
  );

  const date = new Date(targetTime);
  const now = new Date();
  const diff = targetTime - now.getTime();

  // 남은 시간 계산 (일, 시간, 분)
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  let timeLeftStr = "";
  if (days > 0) timeLeftStr += `${days}일 `;
  if (hours > 0) timeLeftStr += `${hours}시간 `;
  if (minutes > 0) timeLeftStr += `${minutes}분 `;
  if (timeLeftStr === "") timeLeftStr = "곧"; // 1분 미만

  const embed = new EmbedBuilder()
    .setColor(0x00ff00)
    .setTitle("✅ 리마인더 등록 완료")
    .setDescription(`**"${messageContent}"**`)
    .addFields(
      { name: "ID", value: reminder.shortId, inline: true },
      { name: "알림 시간", value: date.toLocaleString(), inline: true },
      { name: "남은 시간", value: `${timeLeftStr} 후`, inline: true },
    )
    .setFooter({
      text: message.author.username,
      iconURL: message.author.displayAvatarURL(),
    })
    .setTimestamp();

  return message.reply({ embeds: [embed] });
};

export default {
  name: "리마인더",
  description: "지정된 시간에 알림을 보냅니다.",
  keywords: ["리마인더", "remind", "알림"],
  execute,
};
