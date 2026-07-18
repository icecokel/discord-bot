require("ts-node/register/transpile-only");

const { buildMorningBriefingContent } = require("../src/features/tools/morning-briefing-message");

describe("morning briefing message", () => {
  test("combines weather and server health into one briefing", () => {
    expect(
      buildMorningBriefingContent(
        "🌤️ 서울 오늘 | 맑음",
        "🖥️ 서버 | 정상",
      ),
    ).toBe(
      "☀️ 좋은 아침입니다. 오늘의 브리핑입니다.\n" +
        "🌤️ 서울 오늘 | 맑음\n" +
        "🖥️ 서버 | 정상",
    );
  });

  test("lists unavailable sections without hiding the remaining briefing", () => {
    const content = buildMorningBriefingContent(
      "🌤️ 서울 날씨 | 예보를 불러오지 못했습니다.",
      "🖥️ 서버 | 정상",
      ["날씨", "긱뉴스"],
    );

    expect(content).toContain("일부 정보 확인 실패: 날씨, 긱뉴스");
    expect(content).toContain("서버 | 정상");
  });
});
