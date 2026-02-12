require("dotenv").config();
require("ts-node/register/transpile-only");
const { aiService } = require("../src/core/ai");

async function verify() {
  console.log("🤖 AI 서비스 검증 시작...");

  try {
    const prompt = "안녕? 너는 누구니? 짧게 대답해줘.";
    console.log(`📝 프롬프트: "${prompt}"`);

    const response = await aiService.generateText(prompt);
    console.log("\n✅ 생성 성공!");
    console.log("----------------------------------------");
    console.log(response);
    console.log("----------------------------------------");

    console.log("🔍 검증 완료: AI 서비스가 정상적으로 동작합니다.");
  } catch (error) {
    console.error("\n❌ 검증 실패:");
    console.error(error);
    process.exit(1);
  }
}

verify();
