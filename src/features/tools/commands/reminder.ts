import { Message, EmbedBuilder } from "discord.js";
import { reminderService } from "../reminderService";

/**
 * 리마인더 명령어
 * 사용법: !리마인더 <시간> <메시지>
 * 예: !리마인더 10분 뒤 운동하기
 * 예: !리마인더 12월 25일 크리스마스
 */
const execute = async (
  message: Message,
  args: string[],
): Promise<void | Message> => {
  if (args.length < 2) {
    return message.reply(
      "❌ 사용법: `!리마인더 <시간> <메시지>`\n예: `!리마인더 10분 뒤 라면 먹기`, `!리마인더 3월 1일 삼일절`",
    );
  }

  // 목록 조회
  if (args[0] === "목록" || args[0] === "list") {
    const reminders = reminderService.getRemindersByChannel(message.channel.id);

    if (reminders.length === 0) {
      return message.reply("📭 현재 채널에 등록된 리마인더가 없습니다.");
    }

    const embed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle(`📅 ${message.guild?.name || "현재 채널"} 리마인더 목록`)
      .setDescription("이 채널에 등록된 알림 목록입니다.")
      .setTimestamp();

    reminders.forEach((r, index) => {
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
        name: `#${index + 1}. ${date.toLocaleString()} (${timeLeftStr})`,
        value: `**"${r.message}"** (등록: <@${r.userId}>)`,
        inline: false,
      });
    });

    return message.reply({ embeds: [embed] });
  }

  // 시간과 메시지 분리
  // 시간은 공백을 포함할 수 있음 (예: "10분 뒤", "3월 1일 10시")
  // 파싱 가능한 최대 길이까지 시간으로 간주하고 나머지를 메시지로 처리하는 로직 필요
  // 하지만 여기서는 간단하게 첫 번째 인자를 시간으로 보고, 파싱 실패 시 두 번째까지 합쳐서 시도하는 방식으로 접근하거나,
  // 정규식으로 시간 부분을 추출하는 것이 더 정확함.

  // reminderService의 parseTargetTime이 문자열 전체에서 시간을 추출하도록 설계되었으므로,
  // 전체 문자열을 넘기고, 파싱된 시간과 나머지 메시지를 분리하는 것이 좋음.
  // 하지만 현재 parseTargetTime은 시간값만 반환함.

  // 전략: 앞에서부터 시간을 의미하는 단어들을 찾아서 시간으로 파싱하고, 나머지를 메시지로 사용.

  const fullContent = args.join(" ");
  let targetTime: number | null = null;
  let messageContent = "";

  // 1. "N분/시간/초 뒤" 패턴 확인
  const relativeMatch = fullContent.match(
    /^(\d+(?:분|시간|초))\s*(?:뒤|후)?\s+(.+)$/,
  );
  if (relativeMatch) {
    targetTime = reminderService.parseTargetTime(relativeMatch[1]);
    messageContent = relativeMatch[2];
  } else {
    // 2. "M월 d일 [H시 m분]" 패턴 확인
    const dateMatch = fullContent.match(
      /^(\d+월\s*\d+일(?:\s*\d+시(?:\s*\d+분)?)?)\s+(.+)$/,
    );
    if (dateMatch) {
      targetTime = reminderService.parseTargetTime(dateMatch[1]);
      messageContent = dateMatch[2];
    } else {
      // 3. "H시 m분" 패턴 확인
      const timeMatch = fullContent.match(/^(\d+시(?:\s*\d+분)?)\s+(.+)$/);
      if (timeMatch) {
        targetTime = reminderService.parseTargetTime(timeMatch[1]);
        messageContent = timeMatch[2];
      }
    }
  }

  if (!targetTime || isNaN(targetTime)) {
    return message.reply(
      "❌ 시간 형식을 이해하지 못했습니다. (예: 10분 뒤, 3월 1일, 10시 30분)",
    );
  }

  if (!messageContent) {
    return message.reply("❌ 알림 메시지를 입력해주세요.");
  }

  // 리마인더 등록
  reminderService.addReminder(
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
