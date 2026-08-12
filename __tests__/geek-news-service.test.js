require("ts-node/register/transpile-only");

const dns = require("node:dns");
const https = require("node:https");
const { EventEmitter } = require("node:events");
const { Readable } = require("node:stream");

const {
  parseGeekNewsTopItems,
  buildGeekNewsFallbackSummary,
  buildGeekNewsFallbackTranslation,
  buildGeekNewsFallbackSelectionReason,
  isKoreanSummary,
  parseGeekNewsSummaryResponse,
  parseGeekNewsTranslationResponse,
  resolveGeekNewsSummary,
  resolveGeekNewsTranslatedBody,
  resolveGeekNewsSelectionReason,
  extractGeekNewsArticleText,
  pickUnreadGeekNewsItem,
} = require("../src/features/daily_news/geek-news-service");
const {
  normalizeGeekNewsHistoryUrl,
} = require("../src/utils/geek-news-history-store");
const { aiService } = require("../src/core/ai");
const geekNewsService =
  require("../src/features/daily_news/geek-news-service").default;

describe("GeekNews top parser", () => {
  test("parses top 5 items from topic rows", () => {
    const html = `
      <div class='topics'>
        <div class='topic_row'>
          <div class=votenum>1</div>
          <div class=topictitle><a href='https://example.com/a'><h1>첫 번째 뉴스</h1></a></div>
          <div class='topicdesc'><a href='topic?id=100'>첫 번째 설명입니다.</a></div>
          <div class='topicinfo'><span id='tp100'>50</span> points by tester</div>
        </div>
        <div class='topic_row'>
          <div class=votenum>2</div>
          <div class=topictitle><a href='topic?id=200'><h1>둘째 &amp; 소식</h1></a></div>
          <div class='topicdesc'><a href='topic?id=200'>둘째 설명 <b>강조</b></a></div>
          <div class='topicinfo'><span id='tp200'>40</span> points by tester</div>
        </div>
        <div class='topic_row'>
          <div class=votenum>3</div>
          <div class=topictitle><a href='https://example.com/c'><h1>세 번째</h1></a></div>
          <div class='topicdesc'><a href='topic?id=300'>세 번째 설명</a></div>
          <div class='topicinfo'><span id='tp300'>30</span> points by tester</div>
        </div>
        <div class='topic_row'>
          <div class=votenum>4</div>
          <div class=topictitle><a href='https://example.com/d'><h1>네 번째</h1></a></div>
          <div class='topicdesc'><a href='topic?id=400'>네 번째 설명</a></div>
          <div class='topicinfo'><span id='tp400'>20</span> points by tester</div>
        </div>
        <div class='topic_row'>
          <div class=votenum>5</div>
          <div class=topictitle><a href='https://example.com/e'><h1>다섯 번째</h1></a></div>
          <div class='topicdesc'><a href='topic?id=500'>다섯 번째 설명</a></div>
          <div class='topicinfo'><span id='tp500'>10</span> points by tester</div>
        </div>
        <div class='topic_row'>
          <div class=votenum>6</div>
          <div class=topictitle><a href='https://example.com/f'><h1>여섯 번째</h1></a></div>
          <div class='topicdesc'><a href='topic?id=600'>여섯 번째 설명</a></div>
          <div class='topicinfo'><span id='tp600'>5</span> points by tester</div>
        </div>
        <div class='next commentTD'>next</div>
      </div>
    `;

    const items = parseGeekNewsTopItems(html, 5);
    expect(items).toHaveLength(5);
    expect(items[0]).toMatchObject({
      rank: 1,
      title: "첫 번째 뉴스",
      link: "https://example.com/a",
      points: 50,
      description: "첫 번째 설명입니다.",
    });
    expect(items[1].title).toBe("둘째 & 소식");
    expect(items[1].link).toBe("https://news.hada.io/topic?id=200");
    expect(items[1].description).toBe("둘째 설명 강조");
    expect(items[4].rank).toBe(5);
  });

  test("skips malformed rows safely", () => {
    const html = `
      <div class='topic_row'>
        <div class=votenum>1</div>
        <div class='topicinfo'><span id='tp100'>50</span> points by tester</div>
      </div>
      <div class='topic_row'>
        <div class=votenum>2</div>
        <div class=topictitle><a href='https://example.com/ok'><h1>정상</h1></a></div>
        <div class='topicdesc'><a href='topic?id=200'>정상 설명</a></div>
        <div class='topicinfo'><span id='tp200'>20</span> points by tester</div>
      </div>
      <div class='next commentTD'>next</div>
    `;
    const items = parseGeekNewsTopItems(html, 5);
    expect(items).toHaveLength(1);
    expect(items[0].rank).toBe(2);
    expect(items[0].description).toBe("정상 설명");
  });

  test("parses singular point text from live markup", () => {
    const html = `
      <div class='topic_row'>
        <div class=votenum>20</div>
        <div class=topictitle><a href='https://example.com/solo'><h1>단수 포인트</h1></a></div>
        <div class='topicdesc'><a href='topic?id=999'>포인트 단수형 테스트</a></div>
        <div class='topicinfo'><span id='tp999'>1</span> point by tester</div>
      </div>
      <div class='next commentTD'>next</div>
    `;

    const items = parseGeekNewsTopItems(html, 5);
    expect(items).toHaveLength(1);
    expect(items[0].points).toBe(1);
  });

  test("parses title when marker span exists before anchor", () => {
    const html = `
      <div class='topic_row'>
        <div class=votenum>1</div>
        <div class=topictitle><span id='dead123'></span><a href='https://example.com/live'><h1>라이브 구조 제목</h1></a></div>
        <div class='topicdesc'><a href='topic?id=123'>라이브 구조 설명</a></div>
        <div class='topicinfo'><span id='tp123'>7</span> points by tester</div>
      </div>
      <div class='next commentTD'>next</div>
    `;

    const items = parseGeekNewsTopItems(html, 5);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      rank: 1,
      title: "라이브 구조 제목",
      link: "https://example.com/live",
      points: 7,
      description: "라이브 구조 설명",
    });
  });

  test("parses current live markup with h2 title heading", () => {
    const html = `
      <div class="topics">
        <div class='topic_row' data-topic-state-id='29613' data-topic-voteable='1'>
          <div class=votenum>1</div>
          <div class=vote><span id='vote29613'><a class=upvote href='javascript:vote(29613, "up");'><span>▲</span></a></span></div>
          <div class=topictitle><span id='dead29613'></span><a href='https://github.com/Andyyyy64/whichllm' rel='nofollow' id='tr1'><h2 class='topic-title-heading'>whichllm - 내 하드웨어에서 실제로 돌아가고 최고 성능을 내는 로컬 LLM 찾기</h2></a> <span class=topicurl>(github.com/Andyyyy64)</span></div>
          <div class='topicdesc'><a href='topic?id=29613' class='c99 breakall'>파라미터 수가 아닌 실측 벤치마크 기반으로 사용자 하드웨어에 맞는 로컬 LLM을 자동 추천하는 CLI 도구</a></div>
          <div class='topicinfo'><span id='tp29613'>4</span> points by <a href='/@xguru'>xguru</a> 12분전<span id='unvote29613'></span> | <a href='topic?id=29613&go=comments' class=u>댓글과 토론</a></div>
        </div>
        <div class='next commentTD'><a href='/?page=2' class=u>토픽 더 불러오기</a></div>
      </div>
    `;

    const items = parseGeekNewsTopItems(html, 5);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      rank: 1,
      title:
        "whichllm - 내 하드웨어에서 실제로 돌아가고 최고 성능을 내는 로컬 LLM 찾기",
      link: "https://github.com/Andyyyy64/whichllm",
      points: 4,
      description:
        "파라미터 수가 아닌 실측 벤치마크 기반으로 사용자 하드웨어에 맞는 로컬 LLM을 자동 추천하는 CLI 도구",
    });
  });
});

describe("GeekNews summary helpers", () => {
  test("parses JSON summary response", () => {
    const items = parseGeekNewsSummaryResponse(`
      [
        {"rank":1,"summary":"첫 번째 요약"},
        {"rank":2,"summary":"둘째 요약"}
      ]
    `);

    expect(items).toEqual([
      { rank: 1, summary: "첫 번째 요약" },
      { rank: 2, summary: "둘째 요약" },
    ]);
  });

  test("builds fallback summary from description", () => {
    expect(
      buildGeekNewsFallbackSummary("  핵심 설명을   간단히\n정리합니다.  ", "제목"),
    ).toBe("핵심 설명을 간단히 정리합니다.");
  });

  test("detects korean summary text", () => {
    expect(isKoreanSummary("한국어 요약입니다.")).toBe(true);
    expect(isKoreanSummary("English only summary")).toBe(false);
  });

  test("falls back when ai summary is not korean", () => {
    expect(
      resolveGeekNewsSummary(
        "English summary only",
        "긱뉴스 설명을 한국어로 제공합니다.",
        "제목",
      ),
    ).toBe("긱뉴스 설명을 한국어로 제공합니다.");
  });

  test("returns korean fallback message when source text is english only", () => {
    expect(
      resolveGeekNewsSummary(
        undefined,
        "English description only",
        "English title",
      ),
    ).toBe("한국어 요약을 생성하지 못했습니다. 링크에서 원문을 확인해주세요.");
  });

  test("uses korean title when description is english only", () => {
    expect(
      resolveGeekNewsSummary(
        undefined,
        "English description only",
        "한국어 제목",
      ),
    ).toBe("한국어 제목");
  });
});

describe("GeekNews translation helpers", () => {
  test("parses JSON translation response", () => {
    const item = parseGeekNewsTranslationResponse(`
      {"title":"번역된 제목","body":"첫 문단입니다.\\n\\n둘째 문단입니다.","reason":"핵심 이슈를 빠르게 파악할 수 있는 기사입니다."}
    `);

    expect(item).toEqual({
      title: "번역된 제목",
      body: "첫 문단입니다.\n\n둘째 문단입니다.",
      reason: "핵심 이슈를 빠르게 파악할 수 있는 기사입니다.",
    });
  });

  test("parses first JSON translation object when Codex adds trailing prose", () => {
    const item = parseGeekNewsTranslationResponse(`
      결과입니다.
      {"title":"번역된 제목","body":"한국어 본문입니다.","reason":"읽어볼 만한 이유입니다."}

      참고: {이 부분은 JSON이 아닙니다}
    `);

    expect(item).toEqual({
      title: "번역된 제목",
      body: "한국어 본문입니다.",
      reason: "읽어볼 만한 이유입니다.",
    });
  });

  test("extracts article text from article block", () => {
    const html = `
      <html>
        <body>
          <article>
            <h1>Original title</h1>
            <p>First paragraph with enough length to be treated as article content.</p>
            <p>Second paragraph continues the article body with more details.</p>
          </article>
        </body>
      </html>
    `;

    expect(extractGeekNewsArticleText(html)).toContain(
      "First paragraph with enough length to be treated as article content.",
    );
    expect(extractGeekNewsArticleText(html)).toContain(
      "Second paragraph continues the article body with more details.",
    );
  });

  test("builds fallback translation from korean source content", () => {
    expect(
      buildGeekNewsFallbackTranslation(
        "기사 본문이 이미 한국어로 제공됩니다.",
        "English description",
        "English title",
      ),
    ).toBe("기사 본문이 이미 한국어로 제공됩니다.");
  });

  test("falls back to korean description when translation is not korean", () => {
    expect(
      resolveGeekNewsTranslatedBody(
        "English body only",
        "",
        "한국어 설명입니다.",
        "English title",
      ),
    ).toBe("한국어 설명입니다.");
  });

  test("returns translation fallback message when no korean text exists", () => {
    expect(
      resolveGeekNewsTranslatedBody(
        undefined,
        "English source only",
        "English description",
        "English title",
      ),
    ).toBe("한국어 번역을 생성하지 못했습니다. 링크에서 원문을 확인해주세요.");
  });

  test("builds fallback selection reason from ranking metadata", () => {
    expect(
      buildGeekNewsFallbackSelectionReason({
        rank: 1,
        points: 120,
        description: "English description",
        title: "English title",
      }),
    ).toBe("긱뉴스 메인에서 현재 1위, 120점을 기록한 상단 기사입니다.");
  });

  test("falls back to metadata reason when ai reason is not korean", () => {
    expect(
      resolveGeekNewsSelectionReason("Must read today", {
        rank: 2,
        points: 87,
        description: "English description",
        title: "English title",
      }),
    ).toBe("긱뉴스 메인에서 현재 2위, 87점을 기록한 상단 기사입니다.");
  });
});

describe("GeekNews dedupe", () => {
  test("normalizes tracked url by removing hash and marketing params", () => {
    expect(
      normalizeGeekNewsHistoryUrl(
        "https://Example.com/post/?utm_source=discord&b=2&a=1#summary",
      ),
    ).toBe("https://example.com/post?a=1&b=2");
  });

  test("picks the first unread article from candidates", () => {
    const items = [
      {
        rank: 1,
        title: "이미 보낸 기사",
        link: "https://example.com/first?utm_source=discord",
        points: 100,
        description: "첫 번째 설명",
      },
      {
        rank: 2,
        title: "새 기사",
        link: "https://example.com/second",
        points: 90,
        description: "두 번째 설명",
      },
    ];

    const picked = pickUnreadGeekNewsItem(items, [
      "https://example.com/first",
    ]);

    expect(picked).toMatchObject({
      rank: 2,
      link: "https://example.com/second",
    });
  });

  test("returns null when every candidate was already tracked", () => {
    const items = [
      {
        rank: 1,
        title: "이미 보낸 기사",
        link: "https://example.com/first",
        points: 100,
        description: "첫 번째 설명",
      },
    ];

    expect(
      pickUnreadGeekNewsItem(items, ["https://example.com/first"]),
    ).toBeNull();
  });
});

describe("GeekNews embed", () => {
  test("renders translated geek news item", () => {
    const embed = geekNewsService.createEmbed({
      rank: 1,
      title: "Original featured story",
      link: "https://example.com/featured",
      points: 123,
      description: "기사 설명",
      translatedTitle: "번역된 제목",
      translatedBody: "한국어 본문 첫 문단입니다.\n\n한국어 본문 둘째 문단입니다.",
      selectionReason: "기술 변화의 핵심 배경을 빠르게 파악할 수 있는 기사입니다.",
    });

    const json = embed.toJSON();
    expect(json.title).toBe("🧠 오늘의 긱뉴스 번역");
    expect(json.url).toBe("https://example.com/featured");
    expect(json.description).toBe(
      "한국어 본문 첫 문단입니다.\n\n한국어 본문 둘째 문단입니다.",
    );
    expect(json.fields).toHaveLength(5);
    expect(json.fields[0]).toMatchObject({
      name: "🎯 선정 이유",
      value: "기술 변화의 핵심 배경을 빠르게 파악할 수 있는 기사입니다.",
    });
    expect(json.fields[1]).toMatchObject({
      name: "📰 번역 제목",
      value: "번역된 제목",
    });
    expect(json.fields[2]).toMatchObject({
      name: "🌐 원문 제목",
      value: "Original featured story",
    });
  });

  test("splits long translated body into multiple embeds", () => {
    const translatedBody = Array.from({ length: 80 }, (_, index) =>
      `문단 ${index + 1} 입니다. 이 문단은 임베드 분할 테스트를 위해 충분히 긴 내용을 포함합니다.`,
    ).join("\n\n");

    const embeds = geekNewsService.createEmbeds({
      rank: 1,
      title: "Original featured story",
      link: "https://example.com/featured",
      points: 123,
      description: "기사 설명",
      translatedTitle: "번역된 제목",
      translatedBody,
    });

    expect(embeds.length).toBeGreaterThan(1);
    expect(embeds[0].toJSON().title).toBe("🧠 오늘의 긱뉴스 번역");
    expect(embeds[1].toJSON().title).toBe("🧠 오늘의 긱뉴스 번역 (계속)");
  });

  test("renders fallback embed when featured item is missing", () => {
    const embed = geekNewsService.createEmbed(null);
    const json = embed.toJSON();

    expect(json.title).toBe("🧠 오늘의 긱뉴스 번역");
    expect(json.url).toBe("https://news.hada.io/");
    expect(json.description).toBe(
      "긱뉴스 메인 페이지 목록 조회에 실패했습니다. news.hada.io 응답 오류 또는 네트워크 문제일 수 있습니다. 잠시 후 다시 시도해주세요.",
    );
  });

  test("renders fallback embed with explicit reason", () => {
    const embed = geekNewsService.createEmbed(null, {
      fallbackDescription:
        "이번 회차는 새로 보낼 긱뉴스 기사가 없습니다. 현재 상단 후보는 모두 이미 발송한 기사입니다.",
    });
    const json = embed.toJSON();

    expect(json.description).toBe(
      "이번 회차는 새로 보낼 긱뉴스 기사가 없습니다. 현재 상단 후보는 모두 이미 발송한 기사입니다.",
    );
  });
});

describe("GeekNews channel delivery", () => {
  test("returns detailed reason when list request fails", async () => {
    const fetchListItemsSpy = jest
      .spyOn(geekNewsService, "fetchListItems")
      .mockResolvedValue({
        items: [],
        failureReason:
          "긱뉴스 메인 페이지 목록 조회에 실패했습니다. news.hada.io가 HTTP 503 상태로 응답했습니다. 잠시 후 다시 시도해주세요.",
      });

    const result = await geekNewsService.fetchFeaturedItemResult();

    expect(result).toEqual({
      status: "fetch-failed",
      item: null,
      reason:
        "긱뉴스 메인 페이지 목록 조회에 실패했습니다. news.hada.io가 HTTP 503 상태로 응답했습니다. 잠시 후 다시 시도해주세요.",
    });

    fetchListItemsSpy.mockRestore();
  });

  test("returns detailed reason when list parsing finds no topics", async () => {
    const fetchListItemsSpy = jest
      .spyOn(geekNewsService, "fetchListItems")
      .mockResolvedValue({
        items: [],
        failureReason:
          "긱뉴스 메인 페이지는 열렸지만 기사 항목을 찾지 못했습니다. 사이트 화면 구조가 바뀌었을 수 있습니다. 잠시 후 다시 시도해주세요.",
      });

    const result = await geekNewsService.fetchFeaturedItemResult();

    expect(result).toEqual({
      status: "fetch-failed",
      item: null,
      reason:
        "긱뉴스 메인 페이지는 열렸지만 기사 항목을 찾지 못했습니다. 사이트 화면 구조가 바뀌었을 수 있습니다. 잠시 후 다시 시도해주세요.",
    });

    fetchListItemsSpy.mockRestore();
  });

  test("sends fallback reason embed instead of returning silently", async () => {
    const send = jest.fn().mockResolvedValue(undefined);
    const fetchFeaturedItemResultSpy = jest
      .spyOn(geekNewsService, "fetchFeaturedItemResult")
      .mockResolvedValue({
        status: "already-sent",
        item: null,
        reason:
          "이번 회차는 새로 보낼 긱뉴스 기사가 없습니다. 현재 상단 후보는 모두 이미 발송한 기사입니다.",
      });

    const client = {
      channels: {
        fetch: jest.fn().mockResolvedValue({
          isTextBased: () => true,
          send,
        }),
      },
    };

    await geekNewsService.sendToChannel(client, "channel-id");

    expect(send).toHaveBeenCalledTimes(1);
    const payload = send.mock.calls[0][0];
    expect(payload.embeds).toHaveLength(1);
    expect(payload.embeds[0].toJSON().description).toBe(
      "이번 회차는 새로 보낼 긱뉴스 기사가 없습니다. 현재 상단 후보는 모두 이미 발송한 기사입니다.",
    );

    fetchFeaturedItemResultSpy.mockRestore();
  });

  test("translates featured item with Codex", async () => {
    const fetchListItemsSpy = jest
      .spyOn(geekNewsService, "fetchListItems")
      .mockResolvedValue({
        items: [
          {
            rank: 1,
            title: "Original title",
            link: "https://example.com/story",
            points: 42,
            description: "Original description",
          },
        ],
      });
    const fetchArticleSpy = jest
      .spyOn(geekNewsService, "fetchArticleContent")
      .mockResolvedValue({
        content:
          "Original article body with enough content to parse as article text. Second paragraph for the translation payload.",
        sourceUrl: "https://example.com/story",
      });
    const aiSpy = jest
      .spyOn(aiService, "generateTextWithProviderOnly")
      .mockResolvedValue({
        providerName: "codex",
        text: JSON.stringify({
          title: "번역된 제목",
          body: "한국어 번역 본문입니다.",
          reason: "오늘 살펴볼 만한 기술 변화입니다.",
        }),
        usedFallback: false,
      });

    try {
      const result = await geekNewsService.fetchFeaturedItemResult();

      expect(result.status).toBe("ok");
      expect(result.item).toMatchObject({
        translatedTitle: "번역된 제목",
        translatedBody: "한국어 번역 본문입니다.",
        selectionReason: "오늘 살펴볼 만한 기술 변화입니다.",
      });
      expect(aiSpy).toHaveBeenCalledWith(
        "codex",
        expect.any(String),
        expect.objectContaining({
          responseMimeType: "application/json",
        }),
      );
    } finally {
      fetchListItemsSpy.mockRestore();
      fetchArticleSpy.mockRestore();
      aiSpy.mockRestore();
    }
  });

  test("returns visible failure reason when Codex translation fails", async () => {
    const fetchListItemsSpy = jest
      .spyOn(geekNewsService, "fetchListItems")
      .mockResolvedValue({
        items: [
          {
            rank: 1,
            title: "Original title",
            link: "https://example.com/story",
            points: 42,
            description: "Original description",
          },
        ],
      });
    const fetchArticleSpy = jest
      .spyOn(geekNewsService, "fetchArticleContent")
      .mockResolvedValue({
        content: "Original body",
        sourceUrl: "https://example.com/story",
      });
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const consoleWarnSpy = jest
      .spyOn(console, "warn")
      .mockImplementation(() => {});
    const aiSpy = jest
      .spyOn(aiService, "generateTextWithProviderOnly")
      .mockRejectedValue(new Error("Codex unavailable"));

    try {
      const result = await geekNewsService.fetchFeaturedItemResult();

      expect(result).toEqual({
        status: "fetch-failed",
        item: null,
        reason:
          "긱뉴스 Codex 번역에 실패했습니다: Codex unavailable",
      });

      const embed = geekNewsService.createEmbed(null, {
        fallbackDescription: result.reason,
      });
      expect(embed.toJSON().description).toBe(
        "긱뉴스 Codex 번역에 실패했습니다: Codex unavailable",
      );
    } finally {
      fetchListItemsSpy.mockRestore();
      fetchArticleSpy.mockRestore();
      consoleSpy.mockRestore();
      consoleWarnSpy.mockRestore();
      aiSpy.mockRestore();
    }
  });

  test("retries translation with a compact prompt when Codex response is not JSON", async () => {
    const fetchListItemsSpy = jest
      .spyOn(geekNewsService, "fetchListItems")
      .mockResolvedValue({
        items: [
          {
            rank: 1,
            title: "Original title",
            link: "https://example.com/story",
            points: 42,
            description: "Original description",
          },
        ],
      });
    const fetchArticleSpy = jest
      .spyOn(geekNewsService, "fetchArticleContent")
      .mockResolvedValue({
        content: "Long original article body. ".repeat(260),
        sourceUrl: "https://example.com/story",
      });
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const consoleWarnSpy = jest
      .spyOn(console, "warn")
      .mockImplementation(() => {});
    const aiSpy = jest
      .spyOn(aiService, "generateTextWithProviderOnly")
      .mockResolvedValueOnce({
        providerName: "codex",
        text: "번역 결과를 만들었지만 JSON 객체는 아닙니다.",
        usedFallback: false,
      })
      .mockResolvedValueOnce({
        providerName: "codex",
        text: JSON.stringify({
          title: "재시도 번역 제목",
          body: "재시도 후 생성된 한국어 본문입니다.",
          reason: "재시도 후 선정 이유입니다.",
        }),
        usedFallback: false,
      });

    try {
      const result = await geekNewsService.fetchFeaturedItemResult();

      expect(result.status).toBe("ok");
      expect(result.item).toMatchObject({
        translatedTitle: "재시도 번역 제목",
        translatedBody: "재시도 후 생성된 한국어 본문입니다.",
        selectionReason: "재시도 후 선정 이유입니다.",
      });
      expect(aiSpy).toHaveBeenCalledTimes(2);
      const firstPrompt = aiSpy.mock.calls[0][1];
      const retryPrompt = aiSpy.mock.calls[1][1];
      expect(retryPrompt.length).toBeLessThan(firstPrompt.length);
    } finally {
      fetchListItemsSpy.mockRestore();
      fetchArticleSpy.mockRestore();
      consoleErrorSpy.mockRestore();
      consoleWarnSpy.mockRestore();
      aiSpy.mockRestore();
    }
  });
});

describe("GeekNews network safety", () => {
  const response = (chunks, statusCode = 200, headers = {}) =>
    Object.assign(Readable.from(chunks), { statusCode, headers });

  const mockHttpsResponses = (responses, onOptions = () => {}) => {
    let index = 0;
    return jest
      .spyOn(https, "request")
      .mockImplementation((_url, options, callback) => {
        const request = new EventEmitter();
        request.end = jest.fn(() =>
          queueMicrotask(() => callback(responses[index++])),
        );
        onOptions(options);
        return request;
      });
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test.each([
    "data:text/html,<article>private</article>",
    "file:///etc/passwd",
    "http://localhost/admin",
    "http://127.0.0.1/admin",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/admin",
  ])("rejects non-http or non-public article URL: %s", async (url) => {
    await expect(geekNewsService.fetchArticleContent(url)).rejects.toThrow(
      /허용하지 않습니다/,
    );
  });

  test("rejects a hostname when any resolved address is private", async () => {
    jest.spyOn(dns.promises, "lookup").mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.8", family: 4 },
    ]);
    const requestSpy = jest.spyOn(https, "request");

    await expect(
      geekNewsService.fetchArticleContent("https://public.example/story"),
    ).rejects.toThrow(/사설 또는 예약 주소/);
    expect(requestSpy).not.toHaveBeenCalled();
  });

  test("pins the validated DNS address for the actual connection", async () => {
    jest.spyOn(dns.promises, "lookup").mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ]);
    let connectedAddress;
    let requestSignal;
    mockHttpsResponses(
      [
        response([
          Buffer.from(
            `<article><p>${"Public article body for a safe request. ".repeat(8)}</p></article>`,
          ),
        ]),
      ],
      (options) => {
        requestSignal = options.signal;
        options.lookup("public.example", { all: true }, (_error, addresses) => {
          connectedAddress = addresses[0];
        });
      },
    );

    const result = await geekNewsService.fetchArticleContent(
      "https://public.example/story",
    );

    expect(connectedAddress).toEqual({ address: "93.184.216.34", family: 4 });
    expect(requestSignal).toBeInstanceOf(AbortSignal);
    expect(result.sourceUrl).toBe("https://public.example/story");
    expect(result.content).toContain("Public article body");
  });

  test("validates and blocks every redirect destination", async () => {
    const requestSpy = mockHttpsResponses([
      response([], 302, {
        location: "http://169.254.169.254/latest/meta-data/",
      }),
    ]);

    await expect(
      geekNewsService.fetchArticleContent("https://93.184.216.34/story"),
    ).rejects.toThrow(/사설 또는 예약 주소/);
    expect(requestSpy).toHaveBeenCalledTimes(1);
  });

  test("stops reading an article when the streamed body exceeds the limit", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockHttpsResponses([
      response([Buffer.alloc(2_000_001, "a")]),
    ]);

    const result = await geekNewsService.fetchArticleContent(
      "https://93.184.216.34/story",
    );

    expect(result).toEqual({
      content: "",
      sourceUrl: "https://93.184.216.34/story",
    });
    expect(consoleSpy).toHaveBeenCalledWith(
      "[GeekNewsService] 기사 본문 조회 실패:",
      expect.objectContaining({ message: expect.stringContaining("바이트 제한") }),
    );
  });

  test("limits the GeekNews list response and attaches a timeout signal", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue(
      new Response("too large", {
        status: 200,
        headers: { "content-length": "1000001" },
      }),
    );

    const result = await geekNewsService.fetchListItems(5);

    expect(result.items).toEqual([]);
    expect(result.failureReason).toContain("바이트 제한");
    expect(fetchSpy.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    expect(consoleSpy).toHaveBeenCalled();
  });
});
