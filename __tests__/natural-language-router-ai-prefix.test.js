jest.mock("../src/core/ai/intent-service", () => ({
  intentService: {
    classify: jest.fn(),
  },
}));

jest.mock("../src/core/ai", () => ({
  aiService: {
    generateText: jest.fn(),
    generateTextWithProvider: jest.fn(),
    generateTextWithProviderOnly: jest.fn(),
    getProviderStatus: jest.fn(),
  },
  searchService: {
    getTools: jest.fn(() => []),
  },
}));

const {
  handleNaturalLanguageMessage,
} = require("../src/core/natural-language-router");
const { aiService } = require("../src/core/ai");
const { intentService } = require("../src/core/ai/intent-service");
const {
  clearAllConversationContexts,
} = require("../src/core/conversation-context-store");

const createMessage = (content) => {
  const edit = jest.fn();
  const deleteMessage = jest.fn();

  return {
    content,
    author: {
      id: "owner-id",
      tag: "owner#0001",
    },
    channel: {
      id: "channel-id",
      send: jest.fn(),
    },
    reply: jest.fn().mockResolvedValue({
      delete: deleteMessage,
      edit,
    }),
    edit,
  };
};

describe("natural language router AI answer prefix", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearAllConversationContexts();
    aiService.getProviderStatus.mockReturnValue({
      providerName: "hermes",
      fallbackProviderName: "gemini",
    });
    intentService.classify.mockResolvedValue({
      intent: "ai.answer",
      confidence: 0.95,
      args: {},
      requiresConfirmation: false,
      replyMode: "answer",
    });
  });

  test("prefixes Hermes AI answers", async () => {
    aiService.generateTextWithProvider.mockResolvedValue({
      providerName: "hermes",
      text: "답변입니다.",
      usedFallback: false,
    });
    const message = createMessage("질문이 있어");

    const handled = await handleNaturalLanguageMessage(message, new Map());

    expect(handled).toBe(true);
    const waitMessage = await message.reply.mock.results[0].value;
    expect(message.reply).toHaveBeenCalledWith("요청을 확인하고 있습니다...");
    expect(waitMessage.edit).toHaveBeenNthCalledWith(
      1,
      "생각하고 있습니다...",
    );
    expect(waitMessage.edit).toHaveBeenCalledWith("[Hermes] 답변입니다.");
  });

  test("prefixes fallback AI answers", async () => {
    aiService.generateTextWithProvider.mockResolvedValue({
      providerName: "gemini",
      text: "대체 답변입니다.",
      usedFallback: true,
    });
    const message = createMessage("질문이 있어");

    await handleNaturalLanguageMessage(message, new Map());

    const waitMessage = await message.reply.mock.results[0].value;
    expect(waitMessage.edit).toHaveBeenCalledWith(
      "[Gemini fallback] 대체 답변입니다.",
    );
  });

  test("passes the Discord assistant persona as system instruction", async () => {
    aiService.generateTextWithProvider.mockResolvedValue({
      providerName: "hermes",
      text: "답변입니다.",
      usedFallback: false,
    });
    const message = createMessage("질문이 있어");

    await handleNaturalLanguageMessage(message, new Map());

    expect(aiService.generateTextWithProvider).toHaveBeenCalledWith(
      "질문이 있어",
      expect.objectContaining({
        systemInstruction: expect.stringContaining("정확한 답변"),
        tools: [],
      }),
    );

    const [, options] = aiService.generateTextWithProvider.mock.calls[0];
    expect(options.systemInstruction).toContain("코딩 도우미가 아니다");
  });

  test("passes recent conversation context to Hermes AI answers", async () => {
    aiService.generateTextWithProvider
      .mockResolvedValueOnce({
        providerName: "hermes",
        text: "첫 답변입니다.",
        usedFallback: false,
      })
      .mockResolvedValueOnce({
        providerName: "hermes",
        text: "이전 답변을 바탕으로 한 두 번째 답변입니다.",
        usedFallback: false,
      });
    const firstMessage = createMessage("리액트가 뭐야?");
    const secondMessage = createMessage("그럼 상태 관리는?");

    await handleNaturalLanguageMessage(firstMessage, new Map());
    await handleNaturalLanguageMessage(secondMessage, new Map());

    const secondPrompt = aiService.generateTextWithProvider.mock.calls[1][0];
    expect(secondPrompt).toContain("최근 대화");
    expect(secondPrompt).toContain("사용자: 리액트가 뭐야?");
    expect(secondPrompt).toContain("비서: 첫 답변입니다.");
    expect(secondPrompt).toContain("현재 사용자 메시지:\n그럼 상태 관리는?");
  });

  test("does not force Hermes only just because the message mentions Hermes", async () => {
    aiService.generateTextWithProvider.mockResolvedValue({
      providerName: "hermes",
      text: "헤르메스 전용 답변입니다.",
      usedFallback: false,
    });
    const message = createMessage("헤르메스 오늘 주요 뉴스 알려줘");

    const handled = await handleNaturalLanguageMessage(message, new Map());

    expect(handled).toBe(true);
    expect(intentService.classify).toHaveBeenCalledWith(
      "헤르메스 오늘 주요 뉴스 알려줘",
    );
    expect(aiService.generateTextWithProvider).toHaveBeenCalledWith(
      "헤르메스 오늘 주요 뉴스 알려줘",
      expect.any(Object),
    );
    expect(aiService.generateTextWithProviderOnly).not.toHaveBeenCalled();
  });

  test("compresses Hermes conversation context after seven turns", async () => {
    aiService.generateTextWithProvider.mockResolvedValue({
      providerName: "hermes",
      text: "답변입니다.",
      usedFallback: false,
    });
    aiService.generateText.mockResolvedValue("압축된 대화 요약");

    for (let index = 1; index <= 7; index += 1) {
      await handleNaturalLanguageMessage(
        createMessage(`질문 ${index}`),
        new Map(),
      );
    }

    expect(aiService.generateText).toHaveBeenCalledWith(
      expect.stringContaining("사용자: 질문 1"),
      expect.objectContaining({
        systemInstruction: expect.stringContaining("대화 맥락 압축기"),
      }),
    );
  });
});
