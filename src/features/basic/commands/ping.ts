import { EmbedBuilder, Message } from "discord.js";

export default {
  name: "핑",
  keywords: ["핑"],
  description: "봇의 응답 속도를 확인합니다.",
  async execute(message: Message, args: string[]) {
    // 0. 설명(Help) 기능
    if (
      args &&
      args[0] &&
      ["도움말", "설명", "규칙", "사용법", "가이드"].includes(args[0])
    ) {
      const embed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle("🏓 핑 명령어 사용법")
        .setDescription("봇의 응답 속도를 확인합니다.")
        .addFields({
          name: "사용법",
          value: "`!핑`",
        });
      return message.reply({ embeds: [embed] });
    }

    await message.reply("Pong! 🏓");
  },
};
