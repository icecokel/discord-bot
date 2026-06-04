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

const createAttachment = ({
  id = "attachment-id",
  name = "image.png",
  contentType = "image/png",
  size = 128,
  url = "https://cdn.discordapp.com/attachments/image.png",
} = {}) => ({
  id,
  name,
  contentType,
  size,
  url,
});

const createMessage = (content, attachments = []) => {
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
      type: 1,
      send: jest.fn(),
    },
    attachments: new Map(
      attachments.map((attachment) => [attachment.id, attachment]),
    ),
    reply: jest.fn().mockResolvedValue({
      delete: deleteMessage,
      edit,
    }),
    edit,
  };
};

describe("natural language router AI answer prefix", () => {
  const originalAdminId = process.env.ADMIN_ID;

  beforeEach(() => {
    jest.clearAllMocks();
    clearAllConversationContexts();
    delete process.env.ADMIN_ID;
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

  afterAll(() => {
    process.env.ADMIN_ID = originalAdminId;
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
      "필요한 정보를 찾고 있습니다...",
    );
    expect(waitMessage.edit).toHaveBeenCalledWith("답변을 정리하고 있습니다...");
    expect(waitMessage.edit).toHaveBeenCalledWith("[Hermes] 답변입니다.");
  });

  test("shows an extended wait message when AI answer takes longer", async () => {
    const setTimeoutSpy = jest
      .spyOn(global, "setTimeout")
      .mockImplementation((callback) => {
        callback();
        return 0;
      });
    const clearTimeoutSpy = jest
      .spyOn(global, "clearTimeout")
      .mockImplementation(() => undefined);

    try {
      let resolveAnswer;
      aiService.generateTextWithProvider.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveAnswer = resolve;
          }),
      );
      const message = createMessage("시간이 걸리는 질문이 있어");

      const handling = handleNaturalLanguageMessage(message, new Map());
      for (let index = 0; index < 10; index += 1) {
        await Promise.resolve();
      }

      expect(aiService.generateTextWithProvider).toHaveBeenCalled();

      const waitMessage = await message.reply.mock.results[0].value;
      await Promise.resolve();

      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 10000);
      expect(waitMessage.edit).toHaveBeenCalledWith(
        "조금만 더 확인해보겠습니다...",
      );

      resolveAnswer({
        providerName: "hermes",
        text: "늦은 답변입니다.",
        usedFallback: false,
      });
      await handling;
    } finally {
      setTimeoutSpy.mockRestore();
      clearTimeoutSpy.mockRestore();
    }
  });

  test("prefixes non-Gemini fallback AI answers", async () => {
    aiService.generateTextWithProvider.mockResolvedValue({
      providerName: "hermes",
      text: "세션 대체 답변입니다.",
      usedFallback: true,
    });
    const message = createMessage("질문이 있어");

    await handleNaturalLanguageMessage(message, new Map());

    const waitMessage = await message.reply.mock.results[0].value;
    expect(waitMessage.edit).toHaveBeenCalledWith(
      "[hermes fallback] 세션 대체 답변입니다.",
    );
  });

  test("disables configured provider fallback for public Hermes answers", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    aiService.generateTextWithProvider.mockRejectedValue(
      new Error("Hermes unavailable"),
    );
    const message = createMessage("질문이 있어");

    await handleNaturalLanguageMessage(message, new Map());

    expect(aiService.generateTextWithProvider).toHaveBeenCalledWith(
      "질문이 있어",
      expect.objectContaining({
        disableProviderFallback: true,
      }),
    );
    const waitMessage = await message.reply.mock.results[0].value;
    expect(waitMessage.edit).toHaveBeenCalledWith(
      "답변 생성 중 오류가 발생했습니다.",
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

  test("passes current Discord image attachment context to Hermes answers", async () => {
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      headers: {
        get: jest.fn(() => "128"),
      },
      arrayBuffer: jest.fn().mockResolvedValue(Buffer.from("png-bytes")),
    });
    aiService.generateTextWithProvider.mockResolvedValue({
      providerName: "hermes",
      text: "이미지를 확인했습니다.",
      usedFallback: false,
    });
    const message = createMessage("이 이미지 봐줘", [
      createAttachment({
        name: "sample.png",
        contentType: "image/png",
        size: 128,
        url: "https://cdn.discordapp.com/attachments/sample.png",
      }),
    ]);

    try {
      await handleNaturalLanguageMessage(message, new Map());
    } finally {
      fetchSpy.mockRestore();
    }

    const prompt = aiService.generateTextWithProvider.mock.calls[0][0];
    expect(prompt).toContain("Discord bridge context");
    expect(prompt).toContain("현재 메시지");
    expect(prompt).toContain("첨부 1");
    expect(prompt).toContain("sample.png");
    expect(prompt).toContain("content_type: image/png");
    expect(prompt).toContain("primary_image_reference: discord_cdn_url");
    expect(prompt).toContain("fallback_image_reference: local_file");
    expect(prompt).toContain("Discord 쓰기/삭제/관리 도구는 제공되지 않습니다.");
  });

  test("handles image-only Discord messages as Hermes answers", async () => {
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      headers: {
        get: jest.fn(() => "128"),
      },
      arrayBuffer: jest.fn().mockResolvedValue(Buffer.from("png-bytes")),
    });
    aiService.generateTextWithProvider.mockResolvedValue({
      providerName: "hermes",
      text: "이미지만 보고 답했습니다.",
      usedFallback: false,
    });
    const message = createMessage("", [
      createAttachment({
        name: "only-image.jpg",
        contentType: "image/jpeg",
        size: 128,
        url: "https://cdn.discordapp.com/attachments/only-image.jpg",
      }),
    ]);

    try {
      const handled = await handleNaturalLanguageMessage(message, new Map());

      expect(handled).toBe(true);
      expect(intentService.classify).not.toHaveBeenCalled();
      expect(aiService.generateTextWithProvider).toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
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

  test("uses Hermes session context for admin DM without bot-managed conversation compression", async () => {
    process.env.ADMIN_ID = "owner-id";
    aiService.generateTextWithProvider.mockResolvedValue({
      providerName: "hermes",
      text: "세션 답변입니다.",
      usedFallback: false,
    });

    for (let index = 1; index <= 10; index += 1) {
      await handleNaturalLanguageMessage(
        createMessage(`관리자 질문 ${index}`),
        new Map(),
      );
    }

    const firstOptions = aiService.generateTextWithProvider.mock.calls[0][1];
    const secondPrompt = aiService.generateTextWithProvider.mock.calls[1][0];
    const secondOptions = aiService.generateTextWithProvider.mock.calls[1][1];

    expect(firstOptions.hermesSessionName).toEqual(
      expect.stringContaining("discord-admin-owner-id-channel-id"),
    );
    expect(secondOptions.hermesSessionName).toBe(firstOptions.hermesSessionName);
    expect(secondPrompt).not.toContain("최근 대화");
    expect(aiService.generateText).not.toHaveBeenCalled();
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

  test("passes unknown natural language requests to Hermes answers", async () => {
    intentService.classify.mockResolvedValueOnce({
      intent: "unknown",
      confidence: 0,
      args: {},
      requiresConfirmation: false,
      replyMode: "answer",
    });
    aiService.generateTextWithProvider.mockResolvedValue({
      providerName: "hermes",
      text: "요청을 다시 해석해서 답했습니다.",
      usedFallback: false,
    });
    const message = createMessage("이건 라우터가 모를만한 질문");

    const handled = await handleNaturalLanguageMessage(message, new Map());

    expect(handled).toBe(true);
    expect(aiService.generateTextWithProvider).toHaveBeenCalledWith(
      "이건 라우터가 모를만한 질문",
      expect.any(Object),
    );
    const waitMessage = await message.reply.mock.results[0].value;
    expect(waitMessage.edit).toHaveBeenCalledWith(
      "[Hermes] 요청을 다시 해석해서 답했습니다.",
    );
    expect(waitMessage.edit).not.toHaveBeenCalledWith(
      expect.stringContaining("요청을 정확히 이해하지 못했습니다"),
    );
  });

  test("passes low-confidence routed requests to Hermes answers", async () => {
    intentService.classify.mockResolvedValueOnce({
      intent: "weather.today",
      confidence: 0.4,
      args: { region: "서울" },
      requiresConfirmation: false,
      replyMode: "answer",
    });
    aiService.generateTextWithProvider.mockResolvedValue({
      providerName: "hermes",
      text: "애매한 요청을 확인해서 답했습니다.",
      usedFallback: false,
    });
    const message = createMessage("서울 이거 뭐였지");

    const handled = await handleNaturalLanguageMessage(message, new Map());

    expect(handled).toBe(true);
    expect(aiService.generateTextWithProvider).toHaveBeenCalledWith(
      "서울 이거 뭐였지",
      expect.any(Object),
    );
    const waitMessage = await message.reply.mock.results[0].value;
    expect(waitMessage.edit).toHaveBeenCalledWith(
      "[Hermes] 애매한 요청을 확인해서 답했습니다.",
    );
    expect(waitMessage.edit).not.toHaveBeenCalledWith(
      expect.stringContaining("요청을 확실히 이해하지 못했습니다"),
    );
  });

  test("compresses Hermes conversation context after ten turns", async () => {
    aiService.generateTextWithProvider.mockResolvedValue({
      providerName: "hermes",
      text: "답변입니다.",
      usedFallback: false,
    });
    aiService.generateText.mockResolvedValue("압축된 대화 요약");
    let lastMessage;

    for (let index = 1; index <= 10; index += 1) {
      lastMessage = createMessage(`질문 ${index}`);
      await handleNaturalLanguageMessage(lastMessage, new Map());
    }

    expect(aiService.generateText).toHaveBeenCalledWith(
      expect.stringContaining("사용자: 질문 1"),
      expect.objectContaining({
        systemInstruction: expect.stringContaining("대화 맥락 압축기"),
      }),
    );
    expect(lastMessage.channel.send).toHaveBeenCalledWith(
      "대화 기억을 요약해서 정리했습니다.",
    );
  });
});
