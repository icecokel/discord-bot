/**
 * /admin - 어드민 명령어 목록 조회
 */

import { EmbedBuilder, Message } from "discord.js";
import {
  registerAdminCommand,
  getAdminCommands,
} from "../../../core/admin-middleware";

/**
 * 어드민 도움말 핸들러
 */
const handleHelp = async (message: Message, args: string[]) => {
  const commands = getAdminCommands();

  const embed = new EmbedBuilder()
    .setColor(0x5865f2) // Blurple
    .setTitle("🛡️ 관리자 명령어 목록")
    .setDescription(
      "사용 가능한 관리자 전용 명령어입니다.\nDM에서 `/admin <명령어>` 형태로 사용하세요.",
    )
    .setTimestamp()
    .setFooter({ text: "Admin Console" });

  // 명령어 목록을 필드로 추가
  // 설명이 길어질 수 있으므로 한 줄에 하나씩 표기하거나, 적절히 포맷팅
  const commandList = commands
    .map((cmd) => `**${cmd.name}**: ${cmd.description}`)
    .join("\n");

  embed.addFields({
    name: "명령어 목록",
    value: commandList || "등록된 명령어가 없습니다.",
  });

  await message.reply({ embeds: [embed] });
};

// 명령어 등록
registerAdminCommand("admin", handleHelp, "관리자 명령어 목록 조회");

export { handleHelp };
