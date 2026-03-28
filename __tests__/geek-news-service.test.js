require("ts-node/register/transpile-only");

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
} = require("../src/features/daily_news/geek-news-service");
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
      "긱뉴스 데이터를 가져오지 못했습니다. 잠시 후 다시 시도해주세요.",
    );
  });
});
