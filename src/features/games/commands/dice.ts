import { EmbedBuilder, Message } from "discord.js";

export default {
  name: "dice",
  keywords: ["dice", "주사위"],
  description: "주사위를 굴립니다.",
  execute(message: Message, args: string[]) {
    // 0. 설명(Help) 기능
    if (
      args[0] &&
      ["help", "설명", "규칙", "사용법", "가이드"].includes(args[0])
    ) {
      const embed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle("🎲 주사위 사용법")
        .setDescription("1부터 6까지의 무작위 숫자를 뽑습니다.")
        .addFields({
          name: "사용법",
          value: "`!주사위` 또는 `!dice`",
        });
      return message.reply({ embeds: [embed] });
    }

    const number = Math.floor(Math.random() * 6) + 1;
    message.reply(`🎲 주사위를 굴려 **${number}**가 나왔습니다!`);
  },
};
