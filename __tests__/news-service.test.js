require("ts-node/register/transpile-only");

describe("NewsService daily news helpers", () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  const loadNewsService = () => {
    jest.resetModules();
    return require("../src/features/daily_news/news-service").default;
  };

  beforeEach(() => {
    jest.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  test("generateDailyNews returns cleaned items and prefers originallink", async () => {
    process.env.NAVER_APP_CLIENT_ID = "client-id";
    process.env.NAVER_APP_CLIENT_SECRET = "client-secret";

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        items: [
          {
            title: "첫 번째 <b>뉴스</b> &amp; 소식",
            originallink: "https://example.com/original",
            link: "https://example.com/fallback",
            description: "설명 &lt;b&gt;강조&lt;/b&gt; &quot;인용&quot; &#39;테스트&#39;",
            pubDate: "Wed, 01 Jan 2026 00:00:00 +0900",
          },
          {
            title: "두 번째 뉴스",
            originallink: "",
            link: "https://example.com/fallback-2",
            description: "두 번째 설명",
            pubDate: "Wed, 01 Jan 2026 01:00:00 +0900",
          },
        ],
      }),
    });

    const newsService = loadNewsService();
    const items = await newsService.generateDailyNews();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(items).toEqual([
      {
        title: "첫 번째 뉴스 & 소식",
        description: `설명 강조 "인용" '테스트'`,
        link: "https://example.com/original",
        pubDate: "Wed, 01 Jan 2026 00:00:00 +0900",
      },
      {
        title: "두 번째 뉴스",
        description: "두 번째 설명",
        link: "https://example.com/fallback-2",
        pubDate: "Wed, 01 Jan 2026 01:00:00 +0900",
      },
    ]);
  });

  test("generateDailyNews keeps angle bracket text that is not an html tag", async () => {
    process.env.NAVER_APP_CLIENT_ID = "client-id";
    process.env.NAVER_APP_CLIENT_SECRET = "client-secret";

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        items: [
          {
            title: "C++ 템플릿",
            originallink: "",
            link: "https://example.com/template",
            description:
              "a &lt; b 와 &lt;T&gt; 표기 유지, &lt;div&gt; 예시와 &lt;b&gt;강조&lt;/b&gt;",
            pubDate: "Wed, 01 Jan 2026 02:00:00 +0900",
          },
        ],
      }),
    });

    const newsService = loadNewsService();
    const items = await newsService.generateDailyNews();

    expect(items[0].description).toBe(
      "a < b 와 <T> 표기 유지, <div> 예시와 강조",
    );
  });

  test("generateDailyNews returns empty array without Naver credentials", async () => {
    delete process.env.NAVER_APP_CLIENT_ID;
    delete process.env.NAVER_APP_CLIENT_SECRET;

    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    global.fetch = jest.fn();

    const newsService = loadNewsService();
    await expect(newsService.generateDailyNews()).resolves.toEqual([]);

    expect(global.fetch).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      "[NewsService] NAVER_APP_CLIENT_ID or NAVER_APP_CLIENT_SECRET is missing.",
    );
  });

  test("createEmbed renders fallback and item fields", () => {
    const newsService = loadNewsService();
    const fallbackEmbed = newsService.createEmbed([]);
    const fallbackJson = fallbackEmbed.toJSON();

    expect(fallbackJson.title).toBe("📰 오늘의 주요 IT/과학 뉴스");
    expect(fallbackJson.description).toBe(
      "뉴스를 가져오지 못했습니다. 잠시 후 다시 시도해주세요.",
    );

    const longDescription = "A".repeat(120);
    const longTitle = "긴제목".repeat(90);
    const embed = newsService.createEmbed([
      {
        title: longTitle,
        description: longDescription,
        link: "https://example.com/article",
        pubDate: "Wed, 01 Jan 2026 00:00:00 +0900",
      },
    ]);

    const json = embed.toJSON();
    expect(json.fields).toHaveLength(1);
    expect(json.fields[0]).toMatchObject({
      value: `📄 ${"A".repeat(100)}...\n[기사 보기](https://example.com/article)`,
    });
    expect(json.fields[0].name.startsWith("1. ")).toBe(true);
    expect(json.fields[0].name.length).toBeLessThanOrEqual(256);
    expect(json.fields[0].name.endsWith("...")).toBe(true);
  });
});
