jest.mock("../src/core/admin-middleware", () => ({
  getAdminCommands: jest.fn(),
  registerAdminCommand: jest.fn(),
}));

jest.mock("../src/core/ai", () => ({
  aiService: {
    generateText: jest.fn(),
  },
}));

jest.mock("../src/features/daily_news/news-service", () => ({
  __esModule: true,
  default: {
    generateDailyNews: jest.fn(),
  },
}));

jest.mock("../src/utils/kma-helper", () => ({
  getShortTermForecast: jest.fn(),
  getMidTermForecast: jest.fn(),
}));

const {
  getAdminCommands,
} = require("../src/core/admin-middleware");
const { aiService } = require("../src/core/ai");
const newsService = require("../src/features/daily_news/news-service").default;
const {
  getMidTermForecast,
  getShortTermForecast,
} = require("../src/utils/kma-helper");
const {
  handleAdminTest,
} = require("../src/features/admin/commands/admin-test");

const createCommand = (name, keywords = []) => ({
  name,
  keywords,
  execute: jest.fn(),
});

const createMessage = () => {
  const edit = jest.fn();

  return {
    client: {
      commands: new Map([
        ["날씨", createCommand("날씨", ["오늘날씨"])],
        ["주간날씨", createCommand("주간날씨", ["주간"])],
        ["운세", createCommand("운세", ["오늘운세"])],
        ["긱뉴스", createCommand("긱뉴스", ["하다뉴스"])],
      ]),
    },
    reply: jest.fn().mockResolvedValue({ edit }),
  };
};

describe("admin test command", () => {
  const originalGeminiKey = process.env.GEMINI_AI_API_KEY;
  const originalNaverClientId = process.env.NAVER_APP_CLIENT_ID;
  const originalNaverSecret = process.env.NAVER_APP_CLIENT_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GEMINI_AI_API_KEY = "gemini-key";
    process.env.NAVER_APP_CLIENT_ID = "naver-client";
    process.env.NAVER_APP_CLIENT_SECRET = "naver-secret";
    getAdminCommands.mockReturnValue([
      { name: "관리자" },
      { name: "뉴스" },
      { name: "질문" },
      { name: "테스트" },
    ]);
    getShortTermForecast.mockResolvedValue({ forecast: "short" });
    getMidTermForecast.mockResolvedValue({ forecast: "mid" });
    aiService.generateText.mockResolvedValue("health-check");
    newsService.generateDailyNews.mockResolvedValue([{ title: "news" }]);
  });

  afterAll(() => {
    process.env.GEMINI_AI_API_KEY = originalGeminiKey;
    process.env.NAVER_APP_CLIENT_ID = originalNaverClientId;
    process.env.NAVER_APP_CLIENT_SECRET = originalNaverSecret;
  });

  test("checks only short-term weather in the admin test report", async () => {
    const message = createMessage();

    await handleAdminTest(message, []);

    expect(getShortTermForecast).toHaveBeenCalledTimes(1);
    expect(getMidTermForecast).not.toHaveBeenCalled();

    const progressMessage = await message.reply.mock.results[0].value;
    const finalEdit = progressMessage.edit.mock.calls.at(-1)[0];
    const embed = finalEdit.embeds[0].toJSON();
    const details = embed.fields.map((field) => field.value).join("\n");

    expect(details).toContain("날씨 API (단기)");
    expect(details).not.toContain("날씨 API (단기/중기)");
    expect(details).not.toContain("중기 예보");
  });
});
