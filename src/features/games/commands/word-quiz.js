const WordQuizManager = require("../word-quiz/WordQuizManager");

module.exports = {
  name: "wordquiz",
  keywords: ["!wordquiz", "!단어퀴즈"],
  description: "단어 퀴즈 게임을 시작하거나 관리합니다.",
  execute(message, args) {
    const subCommand = args[0] ? args[0].toLowerCase() : "";

    // 시작 명령어
    if (["start", "시작"].includes(subCommand)) {
      const onTimeout = (answer) => {
        message.channel.send(
          `⏰ **시간 초과!** 게임이 종료되었습니다.\n정답은 **${answer}**였습니다.`,
        );
      };

      const result = WordQuizManager.startGame(
        message.channel.id,
        message.author.id,
        onTimeout,
      );

      if (!result.success) {
        return message.reply(`⚠️ ${result.message}`);
      }

      const game = result.data;
      message.reply(
        `🎮 **단어 퀴즈 시작!** (영어 단어)\n` +
          `글자 수: **${game.targetWord.length}**글자\n` +
          `힌트: ${WordQuizManager.getMaskedWord(game)}\n` +
          `정답을 아시겠다면 \`!정답 <단어>\`를 입력해주세요! (제한시간 3분)`,
      );
      return;
    }

    // 종료 명령어
    if (["stop", "중지", "종료", "그만"].includes(subCommand)) {
      const game = WordQuizManager.getGame(message.channel.id);
      if (!game) {
        return message.reply("❌ 현재 진행 중인 게임이 없습니다.");
      }

      // 시작한 유저만 종료 가능
      if (game.initiatorId !== message.author.id) {
        return message.reply("⚠️ 게임을 시작한 유저만 종료할 수 있습니다.");
      }

      WordQuizManager.endGame(message.channel.id);
      message.reply(
        `🛑 게임이 취소되었습니다. 정답은 **${game.targetWord}**였습니다.`,
      );
      return;
    }

    // 룰 설명
    if (["rule", "설명", "규칙", "룰", "도움말"].includes(subCommand)) {
      const embed = WordQuizManager.getRuleEmbed();
      return message.reply({ embeds: [embed] });
    }

    // 기본 안내
    message.reply(
      "❓ 올바른 명령어를 입력해주세요.\n" +
        "- 시작: `!단어퀴즈 시작`\n" +
        "- 종료: `!단어퀴즈 종료`\n" +
        "- 설명: `!단어퀴즈 설명`",
    );
  },
};
