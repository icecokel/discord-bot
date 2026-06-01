/**
 * /admin log - 최근 명령어 로그 조회
 */

import { EmbedBuilder, Message } from "discord.js";
import { registerAdminCommand } from "../../../core/admin-middleware";
import * as logger from "../../../utils/logger";

/**
 * 로그 명령어 핸들러
 */
const handleLog = async (message: Message, args: string[]) => {
  // 조회할 로그 개수 (기본 15개, 최대 30개)
  const count = Math.min(parseInt(args[0]) || 15, 30);
  const logs = logger.getRecentLogs(count);
  const totalCount = logger.getLogCount();

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("📜 최근 명령어 로그")
    .setDescription(`전체 ${totalCount}개 중 최근 ${logs.length}개`)
    .setTimestamp();

  if (logs.length === 0) {
    embed.addFields({
      name: "로그 없음",
      value:
        "아직 기록된 명령어가 없습니다.\n(봇 재시작 후 로그는 초기화됩니다)",
      inline: false,
    });
  } else {
    // 로그 포맷팅
    const logLines = logs.map((log) => {
      const time = new Date(log.timestamp).toLocaleString("ko-KR", {
        timeZone: "Asia/Seoul",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
      const argsStr = log.args?.length > 0 ? log.args.join(" ") : "";
      return `\`${time}\` **${log.command}** ${argsStr}\n└ ${log.userName}`;
    });

    // 필드 길이 제한 (1024자)으로 분할
    let currentValue = "";
    let fieldIndex = 1;

    for (const line of logLines) {
      if (currentValue.length + line.length + 1 > 1000) {
        embed.addFields({
          name: fieldIndex === 1 ? "로그 목록" : `로그 목록 (${fieldIndex})`,
          value: currentValue,
          inline: false,
        });
        currentValue = line;
        fieldIndex++;
      } else {
        currentValue += (currentValue ? "\n" : "") + line;
      }
    }

    if (currentValue) {
      embed.addFields({
        name: fieldIndex === 1 ? "로그 목록" : `로그 목록 (${fieldIndex})`,
        value: currentValue,
        inline: false,
      });
    }
  }

  embed.setFooter({ text: "사용법: /관리자 로그 [개수]" });

  await message.reply({ embeds: [embed] });
};

// 명령어 등록
registerAdminCommand("로그", handleLog, "로그 조회");

export { handleLog };
