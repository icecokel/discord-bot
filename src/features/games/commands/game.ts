import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Message,
} from "discord.js";

export default {
  name: "game",
  keywords: ["game", "게임"],
  description: "게임 센터 링크를 보여줍니다.",
  execute(message: Message) {
    const embed = new EmbedBuilder()
      .setTitle("🎮 게임 센터")
      .setDescription("아래 버튼을 클릭하여 게임을 즐겨보세요!")
      .setColor("#00ff00")
      .setFooter({ text: "즐거운 시간 되세요!" });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel("Sky Drop 플레이")
        .setEmoji("🌤️")
        .setStyle(ButtonStyle.Link)
        .setURL("https://vscoke.vercel.app/ko-KR/game/sky-drop"),
      new ButtonBuilder()
        .setLabel("Wordle 플레이")
        .setEmoji("🧩")
        .setStyle(ButtonStyle.Link)
        .setURL("https://vscoke.vercel.app/ko-KR/game/wordle"),
    );

    message.reply({ embeds: [embed], components: [row] });
  },
};
