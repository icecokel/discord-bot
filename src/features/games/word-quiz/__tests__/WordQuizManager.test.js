const WordQuizManager = require("../WordQuizManager");

// random-words 모듈 모킹 (ESM 호환성 문제 해결 및 결정적 테스트를 위해)
jest.mock("random-words", () => ({
  generate: jest.fn().mockReturnValue("apple"), // 소문자 반환 (코드에서 toUpperCase로 변환함)
}));

describe("WordQuizManager", () => {
  const channelId = "test-channel-id";
  const initiatorId = "user-123";

  beforeEach(() => {
    // 각 테스트 전에 진행 중인 게임 초기화
    WordQuizManager.endGame(channelId);
    // 타이머 모킹
    jest.useFakeTimers();
    // random-words 모의 함수 초기화 (필요시)
    require("random-words").generate.mockClear();
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  describe("startGame", () => {
    test("should start a new game successfully", () => {
      const result = WordQuizManager.startGame(channelId, initiatorId);
      expect(result.success).toBe(true);

      const game = WordQuizManager.getGame(channelId);
      expect(game).toBeDefined();
      expect(game.targetWord).toBe("APPLE"); // Mocked value
      expect(game.initiatorId).toBe(initiatorId);
      expect(game.attempts).toBe(0);
    });

    test("should fail if game already exists in channel", () => {
      WordQuizManager.startGame(channelId, initiatorId);
      const result = WordQuizManager.startGame(channelId, initiatorId);
      expect(result.success).toBe(false);
      expect(result.message).toContain("이미 진행 중인 게임");
    });

    test("should reveal approximately 10% of characters (min 1)", () => {
      // Mocked word 'APPLE' (length 5) -> 10% is 0.5 -> round to 1. Max(1, 1) = 1.
      const result = WordQuizManager.startGame(channelId, initiatorId);
      const game = result.data;
      const revealedCount = game.revealedIndices.filter(Boolean).length;

      expect(revealedCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe("processGuess", () => {
    let targetWord;

    beforeEach(() => {
      const result = WordQuizManager.startGame(channelId, initiatorId);
      targetWord = result.data.targetWord; // 'APPLE'
    });

    test("should return INVALID_LENGTH if guess length is wrong", () => {
      const wrongLengthWord = "APPLEpie";
      const result = WordQuizManager.processGuess(
        channelId,
        initiatorId,
        wrongLengthWord,
      );

      expect(result.type).toBe("INVALID_LENGTH");
      expect(result.targetLength).toBe(5);
    });

    test("should return CORRECT if guess is correct", () => {
      const result = WordQuizManager.processGuess(
        channelId,
        initiatorId,
        "APPLE",
      );

      expect(result.type).toBe("CORRECT");
      expect(result.attempts).toBe(1);
    });

    test("should handle case-insensitive guessing", () => {
      const result = WordQuizManager.processGuess(
        channelId,
        initiatorId,
        "apple",
      );

      expect(result.type).toBe("CORRECT");
    });

    test("should provide correct feedback for incorrect guess", () => {
      // Target: APPLE
      // Guess:  AZPLE
      // A(exact), Z(none), P(exact), L(exact), E(exact)

      const result = WordQuizManager.processGuess(
        channelId,
        initiatorId,
        "AZPLE",
      );

      expect(result.type).toBe("INCORRECT");
      expect(result.feedback[0].status).toBe("exact"); // A
      expect(result.feedback[1].status).toBe("none"); // Z
      expect(result.feedback[2].status).toBe("exact"); // P
      expect(result.feedback[3].status).toBe("exact"); // L
      expect(result.feedback[4].status).toBe("exact"); // E

      expect(result.exactChars).toContain("A");
      expect(result.exactChars).toContain("P");
    });

    test("should handle duplicate characters logic (Yellow/Green)", () => {
      // Target: APPLE
      // Guess:  EEEEE
      // E[0]: Target has E? Yes. Status -> Included (Yellow) - (Simple logic check)
      // ...
      // E[4]: Target[4] is E. Status -> Exact (Green)

      const result = WordQuizManager.processGuess(
        channelId,
        initiatorId,
        "EEEEE",
      );

      expect(result.feedback[4].status).toBe("exact");
      expect(result.feedback[0].status).toBe("included");
    });
  });

  describe("endGame", () => {
    test("should remove game from memory", () => {
      WordQuizManager.startGame(channelId, initiatorId);
      WordQuizManager.endGame(channelId);

      expect(WordQuizManager.getGame(channelId)).toBeUndefined();
    });
  });
});
