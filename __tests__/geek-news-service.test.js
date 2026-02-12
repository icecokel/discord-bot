require("ts-node/register/transpile-only");

const {
  parseGeekNewsTopItems,
} = require("../src/features/daily_news/geek-news-service");

describe("GeekNews top parser", () => {
  test("parses top 5 items from topic rows", () => {
    const html = `
      <div class='topics'>
        <div class='topic_row'>
          <div class=votenum>1</div>
          <div class=topictitle><a href='https://example.com/a'><h1>첫 번째 뉴스</h1></a></div>
          <div class='topicinfo'><span id='tp100'>50</span> points by tester</div>
        </div>
        <div class='topic_row'>
          <div class=votenum>2</div>
          <div class=topictitle><a href='topic?id=200'><h1>둘째 &amp; 소식</h1></a></div>
          <div class='topicinfo'><span id='tp200'>40</span> points by tester</div>
        </div>
        <div class='topic_row'>
          <div class=votenum>3</div>
          <div class=topictitle><a href='https://example.com/c'><h1>세 번째</h1></a></div>
          <div class='topicinfo'><span id='tp300'>30</span> points by tester</div>
        </div>
        <div class='topic_row'>
          <div class=votenum>4</div>
          <div class=topictitle><a href='https://example.com/d'><h1>네 번째</h1></a></div>
          <div class='topicinfo'><span id='tp400'>20</span> points by tester</div>
        </div>
        <div class='topic_row'>
          <div class=votenum>5</div>
          <div class=topictitle><a href='https://example.com/e'><h1>다섯 번째</h1></a></div>
          <div class='topicinfo'><span id='tp500'>10</span> points by tester</div>
        </div>
        <div class='topic_row'>
          <div class=votenum>6</div>
          <div class=topictitle><a href='https://example.com/f'><h1>여섯 번째</h1></a></div>
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
    });
    expect(items[1].title).toBe("둘째 & 소식");
    expect(items[1].link).toBe("https://news.hada.io/topic?id=200");
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
        <div class='topicinfo'><span id='tp200'>20</span> points by tester</div>
      </div>
      <div class='next commentTD'>next</div>
    `;
    const items = parseGeekNewsTopItems(html, 5);
    expect(items).toHaveLength(1);
    expect(items[0].rank).toBe(2);
  });
});
