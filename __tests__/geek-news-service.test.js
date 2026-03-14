require("ts-node/register/transpile-only");

const {
  parseGeekNewsTopItems,
  buildGeekNewsFallbackSummary,
  parseGeekNewsSummaryResponse,
} = require("../src/features/daily_news/geek-news-service");

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
});
