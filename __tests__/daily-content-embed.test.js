require("ts-node/register/transpile-only");

const englishService =
  require("../src/features/daily_english/english-service").default;
const japaneseService =
  require("../src/features/daily_japanese/japanese-service").default;

describe("Daily content embed formatting", () => {
  test("english embed renders structured fields", () => {
    const embed = englishService.createEmbed({
      category: "일상",
      data: {
        content: "How are you?",
        meaning: "잘 지내?",
        description: "친근하게 안부를 묻는 표현입니다.",
        rawExamples: "A: How are you?\nB: I'm good.",
      },
      content: "How are you?",
      weekdayMsg: "테스트 요일 멘트",
    });

    const fields = (embed.toJSON().fields || []).map((field) => field.name);
    expect(fields).toContain("📝 오늘의 문장");
    expect(fields).toContain("📘 설명");
    expect(fields).toContain("✨ 활용 예시");
  });

  test("japanese embed renders structured fields", () => {
    const embed = japaneseService.createEmbed({
      category: "기초 인사",
      data: {
        content: "ありがとうございます (아리가토)",
        meaning: "감사합니다",
        description: "정중하게 감사 인사를 전할 때 사용합니다.",
        rawExamples: "A: ありがとうございます\nB: どういたしまして",
      },
      content: "ありがとうございます (아리가토)",
      weekdayMsg: "테스트 요일 멘트",
    });

    const fields = (embed.toJSON().fields || []).map((field) => field.name);
    expect(fields).toContain("🇯🇵 오늘의 기초 일본어");
    expect(fields).toContain("💡 의미");
    expect(fields).toContain("📘 설명");
    expect(fields).toContain("✨ 따라 해보세요 (예시)");
  });
});
