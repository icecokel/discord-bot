require("ts-node/register/transpile-only");
const englishService =
  require("../src/features/daily_english/EnglishService").default;
const { aiService } = require("../src/core/ai");

// Mocking AI Service to bypass API Key requirement
aiService.generateText = async () => {
  return `📝 **오늘의 문장**
This is a test sentence.

💡 **해석**
이것은 테스트 문장입니다.

📘 **설명**
테스트를 위해 생성된 예시 문장입니다.

✨ **활용 예시 1**
A: Is this only one example?
B: No, now we have two.

✨ **활용 예시 2**
A: Is this the second one?
B: Yes, exactly!`;
};

async function verify() {
  console.log("🇺🇸 영어 서비스 프롬프트 검증 시작 (Mock Mode)...");

  try {
    console.log("1. 문장 생성 테스트 중...");
    const result = await englishService.generateDailyContent();

    console.log("\n✅ 생성 성공!");
    console.log(`[카테고리]: ${result.category}`);
    console.log(`[요일 멘트]: ${result.weekdayMsg}`);
    console.log("[생성된 콘텐츠]:");
    console.log("----------------------------------------");
    console.log(result.content);
    console.log("----------------------------------------");

    // 추가 검증: 반환값 구조
    if (!result.category || !result.content || !result.weekdayMsg) {
      throw new Error("반환된 데이터 구조가 올바르지 않습니다.");
    }

    console.log("\n🔍 검증 완료: EnglishService 로직이 정상 동작합니다.");
  } catch (error) {
    console.error("\n❌ 검증 실패:");
    console.error(error);
    process.exit(1);
  }
}

verify();
