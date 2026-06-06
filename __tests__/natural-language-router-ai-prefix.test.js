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
const {
  clearAllAdminConversationContexts,
} = require("../src/core/admin-conversation-context-store");

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

const createMessage = ({
  content = "관리자 질문",
  userId = "owner-id",
  channelType = 1,
  attachments = [],
} = {}) => {
  const edit = jest.fn();
  const deleteMessage = jest.fn();

  return {
    content,
    author: {
      id: userId,
      tag: `${userId}#0001`,
    },
    channel: {
      id: "channel-id",
      type: channelType,
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

describe("natural language router admin Hermes answer", () => {
  const originalAdminId = process.env.ADMIN_ID;
  const originalHermesAdminToolsets = process.env.HERMES_ADMIN_TOOLSETS;

  beforeEach(() => {
    jest.clearAllMocks();
    clearAllAdminConversationContexts();
    process.env.ADMIN_ID = "owner-id";
    delete process.env.HERMES_ADMIN_TOOLSETS;
    aiService.getProviderStatus.mockReturnValue({
      providerName: "hermes",
      fallbackProviderName: "gemini",
    });
  });

  afterAll(() => {
    process.env.ADMIN_ID = originalAdminId;
    process.env.HERMES_ADMIN_TOOLSETS = originalHermesAdminToolsets;
  });

  test("prefixes admin Hermes AI answers", async () => {
    aiService.generateTextWithProvider.mockResolvedValue({
      providerName: "hermes",
      text: "답변입니다.",
      usedFallback: false,
    });
    const message = createMessage({ content: "질문이 있어" });

    const handled = await handleNaturalLanguageMessage(message);

    expect(handled).toBe(true);
    const waitMessage = await message.reply.mock.results[0].value;
    expect(message.reply).toHaveBeenCalledWith("필요한 정보를 찾고 있습니다...");
    expect(waitMessage.edit).toHaveBeenNthCalledWith(
      1,
      "필요한 정보를 찾고 있습니다...",
    );
    expect(waitMessage.edit).toHaveBeenCalledWith("답변을 정리하고 있습니다...");
    expect(waitMessage.edit).toHaveBeenCalledWith("[Hermes] 답변입니다.");
  });

  test("ignores non-admin natural language messages", async () => {
    const message = createMessage({
      content: "일반 사용자 질문",
      userId: "other-id",
    });

    const handled = await handleNaturalLanguageMessage(message);

    expect(handled).toBe(false);
    expect(message.reply).not.toHaveBeenCalled();
    expect(aiService.generateTextWithProvider).not.toHaveBeenCalled();
  });

  test("uses Hermes session and admin toolsets", async () => {
    aiService.generateTextWithProvider.mockResolvedValue({
      providerName: "hermes",
      text: "세션 답변입니다.",
      usedFallback: false,
    });

    await handleNaturalLanguageMessage(
      createMessage({ content: "서버 상태 확인해줘" }),
    );

    const [, options] = aiService.generateTextWithProvider.mock.calls[0];

    expect(options.hermesSessionName).toEqual(
      expect.stringContaining("discord-admin-owner-id-channel-id"),
    );
    expect(options.hermesToolsets).toBe(
      "web,browser,terminal,file,code_execution,discord-bot-fs",
    );
    expect(options.disableProviderFallback).toBe(true);
    expect(options.systemInstruction).toContain("관리자 DM");
    expect(options.systemInstruction).toContain("위험 작업");
    expect(options.systemInstruction).toContain("사용자에게 질문");
  });

  test("passes recent admin conversation context to Hermes", async () => {
    aiService.generateTextWithProvider
      .mockResolvedValueOnce({
        providerName: "hermes",
        text: "첫 답변입니다.",
        usedFallback: false,
      })
      .mockResolvedValueOnce({
        providerName: "hermes",
        text: "이전 내용을 기억한 답변입니다.",
        usedFallback: false,
      });

    await handleNaturalLanguageMessage(
      createMessage({ content: "첫 번째 관리자 질문" }),
    );
    await handleNaturalLanguageMessage(
      createMessage({ content: "방금 질문 뭐였지?" }),
    );

    const secondPrompt = aiService.generateTextWithProvider.mock.calls[1][0];
    expect(secondPrompt).toContain("관리자 최근 대화");
    expect(secondPrompt).toContain("관리자: 첫 번째 관리자 질문");
    expect(secondPrompt).toContain("Hermes: 첫 답변입니다.");
    expect(secondPrompt).toContain("현재 관리자 메시지");
    expect(secondPrompt).toContain("방금 질문 뭐였지?");
  });

  test("uses configured admin toolsets when provided", async () => {
    process.env.HERMES_ADMIN_TOOLSETS = "web,browser";
    aiService.generateTextWithProvider.mockResolvedValue({
      providerName: "hermes",
      text: "설정된 도구 답변입니다.",
      usedFallback: false,
    });

    await handleNaturalLanguageMessage(
      createMessage({ content: "브라우저로 확인해줘" }),
    );

    const [, options] = aiService.generateTextWithProvider.mock.calls[0];
    expect(options.hermesToolsets).toBe("web,browser");
  });

  test("passes current Discord image attachment context to Hermes", async () => {
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
    const message = createMessage({
      content: "이 이미지 봐줘",
      attachments: [
        createAttachment({
          name: "sample.png",
          contentType: "image/png",
          size: 128,
          url: "https://cdn.discordapp.com/attachments/sample.png",
        }),
      ],
    });

    try {
      await handleNaturalLanguageMessage(message);
    } finally {
      fetchSpy.mockRestore();
    }

    const prompt = aiService.generateTextWithProvider.mock.calls[0][0];
    expect(prompt).toContain("Discord bridge context");
    expect(prompt).toContain("sample.png");
    expect(prompt).toContain("primary_image_reference: discord_cdn_url");
    expect(prompt).toContain("fallback_image_reference: local_file");
  });

  test("sends a follow-up message when admin Hermes answer takes longer", async () => {
    jest.useFakeTimers();

    let resolveAnswer;
    aiService.generateTextWithProvider.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAnswer = resolve;
        }),
    );
    const message = createMessage({ content: "시간이 걸리는 질문" });

    const handling = handleNaturalLanguageMessage(message);
    for (let index = 0; index < 10; index += 1) {
      await Promise.resolve();
    }

    const waitMessage = await message.reply.mock.results[0].value;
    jest.advanceTimersByTime(60000);
    await handling;

    expect(waitMessage.edit).toHaveBeenCalledWith(
      "요청 확인했습니다. 작업이 길어지고 있어 완료되면 따로 보고드리겠습니다.",
    );
    expect(message.channel.send).not.toHaveBeenCalled();

    resolveAnswer({
      providerName: "hermes",
      text: "늦은 답변입니다.",
      usedFallback: false,
    });
    for (let index = 0; index < 10; index += 1) {
      await Promise.resolve();
    }

    expect(message.channel.send).toHaveBeenCalledWith("[Hermes] 늦은 답변입니다.");
    jest.useRealTimers();
  });
});
