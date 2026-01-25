import { EmbedBuilder, Message } from "discord.js";
import { Command } from "../../../core/loader";

export default {
  name: "help",
  keywords: ["help", "도움말", "명령어", "사용법"],
  description: "사용 가능한 모든 명령어와 설명을 보여줍니다.",
  execute(message: Message, args: string[]) {
    // 0. 설명(Help) 기능
    if (
      args &&
      args[0] &&
      ["help", "설명", "규칙", "사용법", "가이드"].includes(args[0])
    ) {
      const helpEmbed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle("📘 도움말 명령어 사용법")
        .setDescription("등록된 모든 명령어의 목록과 설명을 확인합니다.")
        .addFields({
          name: "사용법",
          value: "`!help` 또는 `!도움말`",
        });
      return message.reply({ embeds: [helpEmbed] });
    }

    // message.client.commands 접근을 위해 any 사용 또는 client 확장 필요
    // 여기서는 간단히 client.commands가 있다고 가정하고 any로 접근
    const client = message.client as any;
    const commands = client.commands as Map<string, Command>;

    const embed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle("📘 명령어 목록")
      .setDescription("사용 가능한 명령어들과 간단한 설명입니다.")
      .setTimestamp();

    const fields: any[] = [];

    commands.forEach((cmd: Command) => {
      // keywords가 없는 명령어(어드민 등)는 스킵
      if (!cmd.keywords || cmd.keywords.length === 0) return;

      // 대표 명령어 (첫 번째 키워드)
      const primaryKeyword = cmd.keywords[0];

      const desc = cmd.description || "설명이 없습니다.";

      fields.push({
        name: primaryKeyword,
        value: desc,
        inline: false, // 설명이 길 수 있으므로 한 줄씩
      });
    });

    // 가독성을 위해 이름순 정렬
    fields.sort((a, b) => a.name.localeCompare(b.name));

    embed.addFields(fields);
    embed.setFooter({ text: "자세한 사용법은 각 명령어 설명을 참고하세요." });

    message.reply({ embeds: [embed] });
  },
};
