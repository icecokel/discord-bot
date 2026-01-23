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
    console.log(word);
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
    let positionMatch = 0; // Strike
    let charMatch = 0; // Ball (위치는 다르지만 문자가 있는 경우)

    // 단순화된 로직: 정확한 위치, 그 외 포함 여부만 판단
    // (정확한 Bulls/Cows 복잡한 로직보다는 직관적으로)
    const targetChars = target.split("");
    const guessChars = guess.split("");

    // 1. 위치 일치 확인 (Strike) 및 공개 처리
    for (let i = 0; i < target.length; i++) {
      if (targetChars[i] === guessChars[i]) {
        positionMatch++;
        game.revealedIndices[i] = true; // 위치 맞으면 공개
      }
    }

    // 2. 문자 포함 확인 (Ball) - 중복 처리 등은 간단하게 포함 여부만
    // 정답에 포함된 모든 문자 집합
    const targetSet = new Set(targetChars);
    // 추측한 문자 중 위치 일치하지 않는 것들
    let includingChars = 0;
    for (let i = 0; i < guess.length; i++) {
      if (targetChars[i] !== guessChars[i] && targetSet.has(guessChars[i])) {
        includingChars++;
      }
    }
    charMatch = includingChars;

    return {
      type: "INCORRECT",
      positionMatch,
      charMatch,
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
