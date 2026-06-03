const {
  appendConversationTurn,
  buildConversationPrompt,
  clearAllConversationContexts,
  clearConversationContext,
  getConversationTurns,
} = require("../src/core/conversation-context-store");

describe("conversation context store", () => {
  beforeEach(() => {
    clearAllConversationContexts();
  });

  test("stores recent turns by user and channel", () => {
    appendConversationTurn("user-1", "channel-1", {
      user: "첫 질문",
      assistant: "첫 답변",
    });
    appendConversationTurn("user-1", "channel-2", {
      user: "다른 채널 질문",
      assistant: "다른 채널 답변",
    });

    expect(getConversationTurns("user-1", "channel-1")).toEqual([
      {
        user: "첫 질문",
        assistant: "첫 답변",
      },
    ]);
  });

  test("keeps only the latest eight turns", () => {
    for (let index = 1; index <= 10; index += 1) {
      appendConversationTurn("user-1", "channel-1", {
        user: `질문 ${index}`,
        assistant: `답변 ${index}`,
      });
    }

    const turns = getConversationTurns("user-1", "channel-1");

    expect(turns).toHaveLength(8);
    expect(turns[0]).toEqual({
      user: "질문 3",
      assistant: "답변 3",
    });
    expect(turns[7]).toEqual({
      user: "질문 10",
      assistant: "답변 10",
    });
  });

  test("builds a prompt with prior context and the current message", () => {
    appendConversationTurn("user-1", "channel-1", {
      user: "리액트에 대해 알려줘",
      assistant: "리액트는 UI 라이브러리입니다.",
    });

    const prompt = buildConversationPrompt(
      "user-1",
      "channel-1",
      "그럼 상태 관리는?",
    );

    expect(prompt).toContain("최근 대화");
    expect(prompt).toContain("사용자: 리액트에 대해 알려줘");
    expect(prompt).toContain("비서: 리액트는 UI 라이브러리입니다.");
    expect(prompt).toContain("현재 사용자 메시지:\n그럼 상태 관리는?");
  });

  test("returns the current message when no context exists", () => {
    expect(buildConversationPrompt("user-1", "channel-1", "새 질문")).toBe(
      "새 질문",
    );
  });

  test("clears a conversation context", () => {
    appendConversationTurn("user-1", "channel-1", {
      user: "질문",
      assistant: "답변",
    });

    clearConversationContext("user-1", "channel-1");

    expect(getConversationTurns("user-1", "channel-1")).toEqual([]);
  });
});
