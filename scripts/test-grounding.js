require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

async function testGrounding() {
  console.log("🔍 Gemini Google Search Grounding 테스트 시작...");

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_AI_API_KEY);

  // Gemini 3.0 Flash Preview 모델 사용
  const model = genAI.getGenerativeModel({
    model: "gemini-3-flash-preview",
    tools: [
      {
        googleSearch: {},
      },
    ],
  });

  const prompt =
    "오늘(2026년 2월 5일)의 한국 주요 뉴스 헤드라인 3가지만 알려줘. 실제 검색 결과를 바탕으로 답변해.";
  console.log(`📝 질문: "${prompt}"`);

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    console.log("\n✅ 생성 결과:");
    console.log("----------------------------------------");
    console.log(text);
    console.log("----------------------------------------");

    // Grounding Metadata 확인 (검색이 실제로 수행되었는지)
    if (response.candidates && response.candidates[0].groundingMetadata) {
      console.log("\n🌐 Grounding Metadata 발견 (검색 수행됨):");
      console.log(
        JSON.stringify(response.candidates[0].groundingMetadata, null, 2),
      );
    } else {
      console.log("\n⚠️ 검색 메타데이터가 없습니다. (검색 안 됨 가능성 높음)");
    }
  } catch (error) {
    console.error("\n❌ 테스트 실패:");
    console.error(error);
  }
}

testGrounding();
