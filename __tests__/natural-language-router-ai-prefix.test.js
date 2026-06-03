jest.mock("../src/core/ai/intent-service", () => ({
  intentService: {
    classify: jest.fn(),
  },
}));

jest.mock("../src/core/ai", () => ({
  aiService: {
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

  test("uses only Hermes when a message mentions Hermes and Hermes is enabled", async () => {
    aiService.generateTextWithProviderOnly.mockResolvedValue({
      providerName: "hermes",
      text: "헤르메스 전용 답변입니다.",
      usedFallback: false,
    });
    const message = createMessage("헤르메스 오늘 주요 뉴스 알려줘");

    const handled = await handleNaturalLanguageMessage(message, new Map());

    expect(handled).toBe(true);
    expect(intentService.classify).not.toHaveBeenCalled();
    expect(aiService.generateTextWithProviderOnly).toHaveBeenCalledWith(
      "hermes",
      "헤르메스 오늘 주요 뉴스 알려줘",
      expect.objectContaining({
        systemInstruction: expect.stringContaining("정확한 답변"),
        tools: [],
      }),
    );
    expect(aiService.generateTextWithProvider).not.toHaveBeenCalled();
    const waitMessage = await message.reply.mock.results[0].value;
    expect(waitMessage.edit).toHaveBeenCalledWith(
      "[Hermes] 헤르메스 전용 답변입니다.",
    );
  });

  test("passes recent conversation context to Hermes mention replies", async () => {
    aiService.generateTextWithProviderOnly
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
    const firstMessage = createMessage("헤르메스 리액트가 뭐야?");
    const secondMessage = createMessage("헤르메스 그럼 상태 관리는?");

    await handleNaturalLanguageMessage(firstMessage, new Map());
    await handleNaturalLanguageMessage(secondMessage, new Map());

    const secondPrompt = aiService.generateTextWithProviderOnly.mock.calls[1][1];
    expect(secondPrompt).toContain("최근 대화");
    expect(secondPrompt).toContain("사용자: 헤르메스 리액트가 뭐야?");
    expect(secondPrompt).toContain("비서: 첫 답변입니다.");
    expect(secondPrompt).toContain(
      "현재 사용자 메시지:\n헤르메스 그럼 상태 관리는?",
    );
  });

  test("asks the user to turn Hermes on when a message mentions Hermes while disabled", async () => {
    aiService.getProviderStatus.mockReturnValue({
      providerName: "gemini",
      fallbackProviderName: undefined,
    });
    const message = createMessage("헤르메스 이거 확인해줘");

    const handled = await handleNaturalLanguageMessage(message, new Map());

    expect(handled).toBe(true);
    expect(intentService.classify).not.toHaveBeenCalled();
    expect(aiService.generateTextWithProviderOnly).not.toHaveBeenCalled();
    expect(message.reply).toHaveBeenCalledWith(
      "헤르메스가 꺼져 있습니다. `!헤르메스 켜기` 후 다시 확인해주세요.",
    );
  });
});
