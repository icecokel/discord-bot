require("ts-node/register/transpile-only");

const englishService =
  require("../src/features/daily_english/english-service").default;

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
});
