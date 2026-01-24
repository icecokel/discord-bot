require("dotenv").config();
const englishService = require("../src/features/daily_english/EnglishService");

async function verify() {
  console.log("🇺🇸 영어 서비스 검증 시작...");

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

    console.log("\n🔍 검증 완료: EnglishService가 정상 동작합니다.");
  } catch (error) {
    console.error("\n❌ 검증 실패:");
    console.error(error);
    process.exit(1);
  }
}

verify();
