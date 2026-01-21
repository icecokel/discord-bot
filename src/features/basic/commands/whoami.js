const { EmbedBuilder } = require("discord.js");

module.exports = {
  name: "whoami",
  keywords: ["!whoami", "!내정보", "!나"],
  description: "나의 디스코드 프로필 정보를 보여줍니다.",
  execute(message) {
    const user = message.author;
    const member = message.member; // 길드(서버) 내 멤버 정보

    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle(`👤 ${user.username}님의 정보`)
      .setThumbnail(user.displayAvatarURL())
      .addFields(
        { name: "사용자 태그", value: user.tag, inline: true },
        { name: "ID", value: user.id, inline: true },
        {
          name: "계정 생성일",
          value: user.createdAt.toLocaleDateString(),
          inline: false,
        },
        {
          name: "서버 가입일",
          value: member.joinedAt
            ? member.joinedAt.toLocaleDateString()
            : "알 수 없음",
          inline: true,
        },
      )
      .setFooter({ text: "요청자 정보 확인 예제" });

    message.reply({ embeds: [embed] });
  },
};
