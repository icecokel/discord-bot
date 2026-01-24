const { generate } = require("random-words");
const { EmbedBuilder } = require("discord.js");

class WordQuizManager {
  constructor() {
    this.games = new Map(); // channelId -> GameState
  }

  startGame(channelId, initiatorId, onTimeout) {
    if (this.games.has(channelId)) {
      return { success: false, message: "이미 진행 중인 게임이 있습니다." };
    }

    const word = generate({ minLength: 5, maxLength: 8 });

    const gameState = {
      targetWord: word.toUpperCase(),
      revealedIndices: new Array(word.length).fill(false),
      attempts: 0,
      startTime: Date.now(),
      participantCounts: new Map(), // userId -> count
      timer: null,
      initiatorId: initiatorId,
    };

    // 랜덤 글자 공개 (길이의 10%, 반올림, 최소 1개)
    const revealCount = Math.max(1, Math.round(word.length * 0.1));
    const indices = new Set();
    while (indices.size < revealCount) {
      indices.add(Math.floor(Math.random() * word.length));
    }
    indices.forEach((idx) => {
      gameState.revealedIndices[idx] = true;
    });

    // 3분 후 자동 종료
    gameState.timer = setTimeout(() => {
      if (onTimeout) onTimeout(gameState.targetWord);
      this.endGame(channelId, null);
    }, 180 * 1000);

    this.games.set(channelId, gameState);

    return {
      success: true,
      data: gameState,
    };
  }

  getGame(channelId) {
    return this.games.get(channelId);
  }

  processGuess(channelId, userId, guessWord) {
    const game = this.games.get(channelId);
    if (!game) return null;

    const guess = guessWord.toUpperCase();
    const target = game.targetWord;

    if (guess.length !== target.length) {
      return {
        type: "INVALID_LENGTH",
        targetLength: target.length,
      };
    }

    // 기록 업데이트
    game.attempts++;
    const currentCount = game.participantCounts.get(userId) || 0;
    game.participantCounts.set(userId, currentCount + 1);

    if (guess === target) {
      return {
        type: "CORRECT",
        attempts: game.attempts,
        userAttempts: currentCount + 1,
      };
    }

    // 피드백 계산
    const targetChars = target.split("");
    const guessChars = guess.split("");
    const targetSet = new Set(targetChars);

    // 각 문자별 상세 피드백
    const feedback = [];
    const exactChars = [];
    const includedChars = [];
    let positionMatch = 0;
    let charMatch = 0;

    for (let i = 0; i < guess.length; i++) {
      const char = guessChars[i];

      if (targetChars[i] === char) {
        // 위치 일치 (🟢)
        feedback.push({ char, status: "exact" });
        if (!exactChars.includes(char)) exactChars.push(char);
        positionMatch++;
        game.revealedIndices[i] = true;
      } else if (targetSet.has(char)) {
        // 포함됨 (🟡)
        feedback.push({ char, status: "included" });
        if (!includedChars.includes(char)) includedChars.push(char);
        charMatch++;
      } else {
        // 없음 (⬜)
        feedback.push({ char, status: "none" });
      }
    }

    return {
      type: "INCORRECT",
      positionMatch,
      charMatch,
      feedback,
      exactChars,
      includedChars,
      maskedWord: this.getMaskedWord(game),
    };
  }

  getMaskedWord(game) {
    return game.targetWord
      .split("")
      .map((char, index) => (game.revealedIndices[index] ? char : "❓"))
      .join(" ");
  }

  endGame(channelId, winnerId = null) {
    const game = this.games.get(channelId);
    if (!game) return null;

    clearTimeout(game.timer);
    this.games.delete(channelId);
    return game;
  }

  getRuleEmbed() {
    return new EmbedBuilder()
      .setColor("#00FF00")
      .setTitle("📚 단어 퀴즈 규칙 설명")
      .setDescription("영단어를 맞추는 게임입니다! 🕵️‍♂️")
      .addFields(
        {
          name: "1. 게임 시작",
          value:
            "`!단어퀴즈 시작` 명령어로 시작시 **단어 길이의 약 10% (최소 1개)** 글자가 공개된 상태로 시작합니다.",
        },
        {
          name: "2. 정답 제출",
          value: "`!정답 [단어]` 로 정답을 입력하세요. (예: `!정답 apple`)",
        },
        {
          name: "3. 힌트 시스템",
          value:
            "단어의 길이와 자릿수가 맞으면 해당 글자가 공개됩니다!\n- **위치 일치**: 해당 글자가 공개됩니다.\n- **문자 포함**: 위치는 다르지만 단어에 포함된 글자 개수를 알려줍니다.",
        },
        {
          name: "4. 게임 종료",
          value:
            "**승리**: 단어를 먼저 맞추면 즉시 종료됩니다. 🏆\n**중지**: `!단어퀴즈 중지` 명령어로 언제든 게임을 끝낼 수 있습니다.\n**타임아웃**: 180초(3분) 동안 정답자가 없으면 자동 종료됩니다.",
        },
      )
      .setFooter({ text: "즐거운 퀴즈 시간 되세요!" });
  }
}

module.exports = new WordQuizManager();
