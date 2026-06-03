const {
  appendConversationTurn,
  buildConversationPrompt,
  clearAllConversationContexts,
  clearConversationContext,
  getConversationContext,
  getConversationTurns,
  replaceConversationWithSummary,
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

  test("keeps turns until the compression threshold", () => {
    for (let index = 1; index <= 7; index += 1) {
      appendConversationTurn("user-1", "channel-1", {
        user: `질문 ${index}`,
        assistant: `답변 ${index}`,
      });
    }

    const turns = getConversationTurns("user-1", "channel-1");

    expect(turns).toHaveLength(7);
    expect(turns[0]).toEqual({
      user: "질문 1",
      assistant: "답변 1",
    });
    expect(turns[6]).toEqual({
      user: "질문 7",
      assistant: "답변 7",
    });
  });

  test("replaces accumulated turns with a summary", () => {
    appendConversationTurn("user-1", "channel-1", {
      user: "첫 질문",
      assistant: "첫 답변",
    });

    replaceConversationWithSummary(
      "user-1",
      "channel-1",
      "요약된 대화 맥락",
    );

    const context = getConversationContext("user-1", "channel-1");
    expect(context.summary).toBe("요약된 대화 맥락");
    expect(context.turns).toEqual([]);
  });

  test("builds a prompt with summary and current turns", () => {
    replaceConversationWithSummary(
      "user-1",
      "channel-1",
      "리액트의 개념을 설명했고 사용자는 상태 관리가 궁금하다.",
    );
    appendConversationTurn("user-1", "channel-1", {
      user: "상태 관리는 뭐야?",
      assistant: "상태 관리는 UI 데이터 흐름을 다루는 방식입니다.",
    });

    const prompt = buildConversationPrompt(
      "user-1",
      "channel-1",
      "그럼 Redux는?",
    );

    expect(prompt).toContain("요약된 이전 대화");
    expect(prompt).toContain("리액트의 개념을 설명했고");
    expect(prompt).toContain("최근 대화");
    expect(prompt).toContain("사용자: 상태 관리는 뭐야?");
    expect(prompt).toContain("현재 사용자 메시지:\n그럼 Redux는?");
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
    expect(getConversationContext("user-1", "channel-1").summary).toBe("");
  });
});
