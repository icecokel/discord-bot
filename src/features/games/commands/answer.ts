import WordQuizManager, { GuessResult } from "../word-quiz/WordQuizManager";
import { getDisplayName } from "../../../utils/userUtils";
import { EmbedBuilder, Message } from "discord.js";

export default {
  name: "answer",
  keywords: ["answer", "정답", "a", "ㅈㄷ"],
  description: "단어 퀴즈의 정답을 제출합니다.",
  execute(message: Message, args: string[]) {
    // 0. 설명(Help) 기능
    if (
      args[0] &&
      ["help", "설명", "규칙", "사용법", "가이드"].includes(args[0])
    ) {
      const embed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle("📝 정답 제출 사용법")
        .setDescription("진행 중인 단어 퀴즈의 정답을 제출합니다.")
        .addFields(
          {
            name: "사용법",
            value: "`!정답 [단어]`\n예: `!정답 apple`",
          },
          {
            name: "주의사항",
            value: "게임이 진행 중일 때만 사용할 수 있습니다.",
          },
        );
      return message.reply({ embeds: [embed] });
    }

    if (!args[0]) {
      return message.reply("⚠️ 정답을 입력해주세요! 예: `!정답 apple`");
    }

    const channelId = message.channel.id;
    const game = WordQuizManager.getGame(channelId);

    if (!game) {
      return message.reply(
        "❌ 현재 진행 중인 퀴즈가 없습니다. `!단어퀴즈 시작`으로 게임을 시작해보세요!",
      );
    }

    console.log(message.author);

    const userInput = args[0];

    // WordQuizManager.processGuess가 GuessResult 타입을 반환하도록 기대
    const result = WordQuizManager.processGuess(
      channelId,
      message.author.id,
      userInput,
    );

    if (!result) return;

    if (result.type === "INVALID_LENGTH") {
      return message.reply(
        `⚠️ 글자 수가 맞지 않습니다! (**${result.targetLength}**글자)`,
      );
    }

    if (result.type === "CORRECT") {
      WordQuizManager.endGame(channelId, message.author.id);
      const displayName = getDisplayName(message);

      const winEmbed = new EmbedBuilder()
        .setColor("#FFD700") // Gold color
        .setTitle("🎉 정답입니다! 🎉")
        .setDescription(`**${displayName}**님이 정답을 맞추셨습니다!`)
        .addFields(
          {
            name: "정답",
            value: `**${userInput.toUpperCase()}**`,
            inline: true,
          },
          { name: "총 시도", value: `${result.attempts}회`, inline: true },
          {
            name: "나의 시도",
            value: `${result.userAttempts}회`,
            inline: true,
          },
        );

      return message.reply({ embeds: [winEmbed] });
    }

    if (result.type === "INCORRECT") {
      // 상태별 이모지 매핑
      const statusEmoji: { [key: string]: string } = {
        exact: "🟢",
        included: "🟡",
        none: "⬜",
      };

      // 시각적 피드백 생성
      const feedback = result.feedback || [];
      const inputLine = feedback.map((f) => f.char).join(" ");
      const emojiLine = feedback.map((f) => statusEmoji[f.status]).join(" ");

      const exactText =
        result.exactChars && result.exactChars.length > 0
          ? result.exactChars.join(", ")
          : "없음";
      const includedText =
        result.includedChars && result.includedChars.length > 0
          ? result.includedChars.join(", ")
          : "없음";

      return message.reply(
        `❌ **틀렸습니다!**\n` +
          `입력: ${inputLine}\n` +
          `      ${emojiLine}\n\n` +
          `🟢 위치 일치: ${exactText}\n` +
          `🟡 포함됨: ${includedText}\n\n` +
          `현재 힌트: \`${result.maskedWord}\``,
      );
    }
  },
};
