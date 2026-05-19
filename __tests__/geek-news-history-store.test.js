require("ts-node/register/transpile-only");

describe("GeekNews history store", () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test("stores full geek news item content for sent history", () => {
    let stored = { entries: [] };
    jest.doMock("../src/utils/file-manager", () => ({
      readJson: jest.fn(() => stored),
      writeJson: jest.fn((filename, data) => {
        stored = data;
        return true;
      }),
    }));

    const {
      getGeekNewsHistoryEntries,
      trackGeekNewsUrl,
    } = require("../src/utils/geek-news-history-store");

    const record = trackGeekNewsUrl("https://Example.com/post?utm_source=bot", {
      title: "원문 제목",
      item: {
        rank: 1,
        points: 42,
        title: "원문 제목",
        link: "https://example.com/post?utm_source=bot",
        description: "목록 설명",
        sourceUrl: "https://example.com/post",
        sourceContent: "원문 본문 전체",
        translatedTitle: "번역 제목",
        translatedBody: "번역 본문 전체",
        selectionReason: "선정 이유",
      },
    });

    expect(record.content).toMatchObject({
      rank: 1,
      points: 42,
      title: "원문 제목",
      link: "https://example.com/post",
      description: "목록 설명",
      sourceUrl: "https://example.com/post",
      sourceContent: "원문 본문 전체",
      translatedTitle: "번역 제목",
      translatedBody: "번역 본문 전체",
      selectionReason: "선정 이유",
    });
    expect(getGeekNewsHistoryEntries()[0].content.translatedBody).toBe(
      "번역 본문 전체",
    );
  });
});
