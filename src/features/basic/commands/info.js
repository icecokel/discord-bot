const { EmbedBuilder } = require("discord.js");

module.exports = {
  name: "info",
  keywords: ["info", "정보"],
  description: "봇의 정보를 확인합니다.",
  execute(message, args) {
    // 0. 설명(Help) 기능
    if (
      args &&
      args[0] &&
      ["help", "설명", "규칙", "사용법", "가이드"].includes(args[0])
    ) {
      const helpEmbed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle("ℹ️ 정보 명령어 사용법")
        .setDescription("봇의 기본 정보를 확인합니다.")
        .addFields({
          name: "사용법",
          value: "`!info` 또는 `!정보`",
        });
      return message.reply({ embeds: [helpEmbed] });
    }

    const embed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle("🤖 봇 정보")
      .setDescription("이것은 Node.js로 만든 디스코드 봇입니다.")
      .addFields(
        { name: "제작자", value: "User", inline: true },
        { name: "버전", value: "1.0.0", inline: true },
        { name: "명령어 목록", value: "`!help` 또는 `!도움말`을 입력하세요." },
      )
      .setFooter({ text: "Discord Bot Tutorial" });

    message.channel.send({ embeds: [embed] });
  },
};
