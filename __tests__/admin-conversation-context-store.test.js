const {
  ADMIN_CONVERSATION_TURN_COUNT,
  appendAdminConversationTurn,
  buildAdminConversationPrompt,
  clearAdminConversationContext,
  clearAllAdminConversationContexts,
  getAdminConversationTurns,
} = require("../src/core/admin-conversation-context-store");

describe("admin conversation context store", () => {
  beforeEach(() => {
    clearAllAdminConversationContexts();
  });

  test("stores turns per user and channel", () => {
    appendAdminConversationTurn("user-1", "channel-1", {
      user: "질문 1",
      assistant: "답변 1",
    });
    appendAdminConversationTurn("user-1", "channel-2", {
      user: "질문 2",
      assistant: "답변 2",
    });

    expect(getAdminConversationTurns("user-1", "channel-1")).toEqual([
      { user: "질문 1", assistant: "답변 1" },
    ]);
  });

  test("keeps only recent admin turns", () => {
    for (let index = 1; index <= ADMIN_CONVERSATION_TURN_COUNT + 2; index += 1) {
      appendAdminConversationTurn("user-1", "channel-1", {
        user: `질문 ${index}`,
        assistant: `답변 ${index}`,
      });
    }

    const turns = getAdminConversationTurns("user-1", "channel-1");
    expect(turns).toHaveLength(ADMIN_CONVERSATION_TURN_COUNT);
    expect(turns[0].user).toBe("질문 3");
  });

  test("builds prompt with recent admin turns", () => {
    appendAdminConversationTurn("user-1", "channel-1", {
      user: "이전 질문",
      assistant: "이전 답변",
    });

    const prompt = buildAdminConversationPrompt(
      "user-1",
      "channel-1",
      "현재 질문",
    );

    expect(prompt).toContain("관리자 최근 대화");
    expect(prompt).toContain("관리자: 이전 질문");
    expect(prompt).toContain("AI: 이전 답변");
    expect(prompt).toContain("현재 관리자 메시지");
    expect(prompt).toContain("현재 질문");
  });

  test("clears context for a user and channel", () => {
    appendAdminConversationTurn("user-1", "channel-1", {
      user: "질문",
      assistant: "답변",
    });

    clearAdminConversationContext("user-1", "channel-1");

    expect(getAdminConversationTurns("user-1", "channel-1")).toEqual([]);
  });
});
