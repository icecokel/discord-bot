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

describe("natural language router admin Codex answer", () => {
  const originalAdminId = process.env.ADMIN_ID;
  const originalCodexAdminSearch = process.env.CODEX_ADMIN_SEARCH;
  const originalCodexAdminSandbox = process.env.CODEX_ADMIN_SANDBOX;

  beforeEach(() => {
    jest.clearAllMocks();
    clearAllAdminConversationContexts();
    process.env.ADMIN_ID = "owner-id";
    delete process.env.CODEX_ADMIN_SEARCH;
    delete process.env.CODEX_ADMIN_SANDBOX;
    aiService.getProviderStatus.mockReturnValue({
      providerName: "codex",
      fallbackProviderName: "gemini",
    });
  });

  afterAll(() => {
    process.env.ADMIN_ID = originalAdminId;
    process.env.CODEX_ADMIN_SEARCH = originalCodexAdminSearch;
    process.env.CODEX_ADMIN_SANDBOX = originalCodexAdminSandbox;
  });

  test("prefixes admin Codex AI answers", async () => {
    aiService.generateTextWithProvider.mockResolvedValue({
      providerName: "codex",
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
    expect(waitMessage.edit).toHaveBeenCalledWith("[Codex] 답변입니다.");
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

  test("uses Codex admin execution options", async () => {
    aiService.generateTextWithProvider.mockResolvedValue({
      providerName: "codex",
      text: "세션 답변입니다.",
      usedFallback: false,
    });

    await handleNaturalLanguageMessage(
      createMessage({ content: "서버 상태 확인해줘" }),
    );

    const [, options] = aiService.generateTextWithProvider.mock.calls[0];

    expect(options.codexSearch).toBe(true);
    expect(options.codexSandbox).toBe("workspace-write");
    expect(options.disableProviderFallback).toBe(true);
    expect(options.systemInstruction).toContain("관리자 DM");
    expect(options.systemInstruction).toContain("위험 작업");
    expect(options.systemInstruction).toContain("사용자에게 질문");
  });

  test("passes recent admin conversation context to Codex", async () => {
    aiService.generateTextWithProvider
      .mockResolvedValueOnce({
        providerName: "codex",
        text: "첫 답변입니다.",
        usedFallback: false,
      })
      .mockResolvedValueOnce({
        providerName: "codex",
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
    expect(secondPrompt).toContain("Codex: 첫 답변입니다.");
    expect(secondPrompt).toContain("현재 관리자 메시지");
    expect(secondPrompt).toContain("방금 질문 뭐였지?");
  });

  test("uses configured Codex admin options when provided", async () => {
    process.env.CODEX_ADMIN_SEARCH = "false";
    process.env.CODEX_ADMIN_SANDBOX = "read-only";
    aiService.generateTextWithProvider.mockResolvedValue({
      providerName: "codex",
      text: "설정된 도구 답변입니다.",
      usedFallback: false,
    });

    await handleNaturalLanguageMessage(
      createMessage({ content: "브라우저로 확인해줘" }),
    );

    const [, options] = aiService.generateTextWithProvider.mock.calls[0];
    expect(options.codexSearch).toBe(false);
    expect(options.codexSandbox).toBe("read-only");
  });

  test("passes current Discord image attachment context to Codex", async () => {
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      headers: {
        get: jest.fn(() => "128"),
      },
      arrayBuffer: jest.fn().mockResolvedValue(Buffer.from("png-bytes")),
    });
    aiService.generateTextWithProvider.mockResolvedValue({
      providerName: "codex",
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

  test("sends a follow-up message when admin Codex answer takes longer", async () => {
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
      providerName: "codex",
      text: "늦은 답변입니다.",
      usedFallback: false,
    });
    for (let index = 0; index < 10; index += 1) {
      await Promise.resolve();
    }

    expect(message.channel.send).toHaveBeenCalledWith("[Codex] 늦은 답변입니다.");
    jest.useRealTimers();
  });
});
