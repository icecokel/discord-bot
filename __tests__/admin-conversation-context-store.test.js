const {
  ADMIN_CONVERSATION_MAX_ENTRIES,
  ADMIN_CONVERSATION_MAX_CHARS,
  appendAdminConversationTurn,
  appendAdminNotification,
  buildAdminConversationPrompt,
  getAdminConversationEntries,
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
    for (let index = 1; index <= ADMIN_CONVERSATION_MAX_ENTRIES + 2; index += 1) {
      appendAdminConversationTurn("user-1", "channel-1", {
        user: `질문 ${index}`,
        assistant: `답변 ${index}`,
      });
    }

    const turns = getAdminConversationTurns("user-1", "channel-1");
    expect(turns).toHaveLength(ADMIN_CONVERSATION_MAX_ENTRIES);
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
    expect(prompt).toMatch(/\] 관리자: 이전 질문/);
    expect(prompt).toMatch(/\] AI: 이전 답변/);
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

  test("mixes bot notifications into the conversation in order", () => {
    appendAdminConversationTurn("user-1", "channel-1", { user: "질문", assistant: "답변" }, new Date("2026-11-15T01:00:00Z"));
    appendAdminNotification("user-1", "channel-1", "📬 새 Gmail 1건\n📧 **영수증**", new Date("2026-11-15T02:00:00Z"));
    appendAdminNotification("user-1", "channel-1", "   ");

    expect(getAdminConversationEntries("user-1", "channel-1").map((entry) => entry.type)).toEqual(["turn", "notification"]);
    expect(getAdminConversationTurns("user-1", "channel-1")).toEqual([{ user: "질문", assistant: "답변" }]);
    const prompt = buildAdminConversationPrompt("user-1", "channel-1", "방금 온 메일 뭐야?", "Claude");
    expect(prompt).toContain("[11. 15. 10:00] 관리자: 질문");
    expect(prompt).toContain("[11. 15. 11:00] 봇 알림(자동 발송): 📬 새 Gmail 1건");
    expect(prompt.indexOf("관리자: 질문")).toBeLessThan(prompt.indexOf("봇 알림(자동 발송)"));
  });

  test("drops the oldest entries to stay within the character budget and clips huge entries", () => {
    for (let index = 0; index < 12; index += 1) {
      appendAdminNotification("user-1", "channel-1", `${index}:${"가".repeat(5_000)}`);
    }
    const entries = getAdminConversationEntries("user-1", "channel-1");
    const total = entries.reduce((sum, entry) => sum + entry.content.length, 0);
    expect(total).toBeLessThanOrEqual(ADMIN_CONVERSATION_MAX_CHARS);
    expect(entries[entries.length - 1].content.startsWith("11:")).toBe(true);
    expect(entries[0].content.startsWith("0:")).toBe(false);

    appendAdminConversationTurn("user-1", "channel-2", { user: "a".repeat(10_000), assistant: "짧은 답" });
    expect(getAdminConversationTurns("user-1", "channel-2")[0].user).toHaveLength(6_000 + "…(생략)".length);
  });
});
