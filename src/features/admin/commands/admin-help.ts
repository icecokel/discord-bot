/**
 * /admin - 어드민 명령어 목록 조회
 */

import { EmbedBuilder, Message } from "discord.js";
import {
  registerAdminCommand,
  getAdminCommands,
} from "../../../core/adminMiddleware";

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
    .addFields({
      name: "명령어 목록",
      value: commands.map((cmd) => `\`${cmd}\``).join(", "),
    })
    .setTimestamp()
    .setFooter({ text: "Admin Console" });

  await message.reply({ embeds: [embed] });
};

// 명령어 등록
registerAdminCommand("admin", handleHelp);

export { handleHelp };
