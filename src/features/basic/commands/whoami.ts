import { EmbedBuilder, Message, GuildMember } from "discord.js";
import { getDisplayName } from "../../../utils/user-utils";

export default {
  name: "whoami",
  keywords: ["whoami", "내정보", "나"],
  description: "나의 디스코드 프로필 정보를 보여줍니다.",
  execute(message: Message, args: string[]) {
    // 0. 설명(Help) 기능
    if (
      args &&
      args[0] &&
      ["help", "설명", "규칙", "사용법", "가이드"].includes(args[0])
    ) {
      const helpEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle("👤 내 정보 명령어 사용법")
        .setDescription(
          "명령어를 입력한 사용자의 디스코드 프로필 정보를 보여줍니다.",
        )
        .addFields({
          name: "사용법",
          value: "`!whoami`, `!내정보`, `!나`",
        });
      return message.reply({ embeds: [helpEmbed] });
    }

    const user = message.author;
    const member = message.member as GuildMember | null; // 길드(서버) 내 멤버 정보

    // 유틸리티를 사용하여 표시 이름 가져오기
    const displayName = getDisplayName(message);

    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle(`👤 ${displayName}님의 정보`)
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
          value: member?.joinedAt
            ? member.joinedAt.toLocaleDateString()
            : "알 수 없음",
          inline: true,
        },
      )
      .setFooter({ text: "요청자 정보 확인 예제" });

    message.reply({ embeds: [embed] });
  },
};
