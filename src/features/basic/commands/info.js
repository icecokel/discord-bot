const { EmbedBuilder } = require("discord.js");

module.exports = {
  name: "info",
  keywords: ["!info", "!정보"],
  description: "봇의 정보를 확인합니다.",
  execute(message) {
    const embed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle("🤖 봇 정보")
      .setDescription("이것은 Node.js로 만든 디스코드 봇입니다.")
      .addFields(
        { name: "제작자", value: "User", inline: true },
        { name: "버전", value: "1.0.0", inline: true },
        { name: "기능", value: "대화, 주사위, 정보 확인" },
      )
      .setFooter({ text: "Discord Bot Tutorial" });

    message.channel.send({ embeds: [embed] });
  },
};
