const WordQuizManager = require("../word-quiz/WordQuizManager");
const { EmbedBuilder } = require("discord.js");

module.exports = {
  name: "answer",
  keywords: ["!answer", "!정답", "!a", "!ㅈㄷ"],
  description: "단어 퀴즈의 정답을 제출합니다.",
  execute(message, args) {
    if (!args[0]) {
      return message.reply("⚠️ 정답을 입력해주세요! 예: `!정답 apple`");
    }

    const channelId = message.channel.id;
    const game = WordQuizManager.getGame(channelId);

    // 게임이 없으면 조용히 무시 (혹은 일반 채팅 방해 안 되게)
    // 하지만 명시적으로 명령어를 쳤으므로 안내 메시지 주는 게 나을 수도 있음.
    // 여기서는 기획에 따라 무시하거나 알림. 사용자 피드백 위해 "게임 중 아님" 알림.
    if (!game) {
      return message.reply(
        "❌ 현재 진행 중인 퀴즈가 없습니다. `!단어퀴즈 시작`으로 게임을 시작해보세요!",
      );
    }

    console.log(message.author);

    const userInput = args[0];

    const result = WordQuizManager.processGuess(
      channelId,
      message.author.id,
      userInput,
    );

    if (result.type === "INVALID_LENGTH") {
      return message.reply(
        `⚠️ 글자 수가 맞지 않습니다! (**${result.targetLength}**글자)`,
      );
    }

    if (result.type === "CORRECT") {
      WordQuizManager.endGame(channelId, message.author.id);

      const winEmbed = new EmbedBuilder()
        .setColor("#FFD700") // Gold color
        .setTitle("🎉 정답입니다! 🎉")
        .setDescription(
          `**${message.author.username}**님이 정답을 맞추셨습니다!`,
        )
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
      return message.reply(
        `❌ **틀렸습니다!**\n` +
          `입력: **${userInput.toUpperCase()}**\n` +
          `위치 일치(Strike): **${result.positionMatch}**\n` +
          `문자 포함(Ball): **${result.charMatch}**\n` +
          `현재 힌트: \`${result.maskedWord}\``,
      );
    }
  },
};
