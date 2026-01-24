/**
 * Gemini API 헬퍼 모듈
 * 운세 생성을 위한 AI 호출 로직을 제공합니다.
 */
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Gemini API 클라이언트 초기화
const genAI = new GoogleGenerativeAI(process.env.GEMINI_AI_API_KEY);

// 모델 설정 (gemini-2.0-flash 사용 - 빠르고 무료 할당량 충분)
const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash",
  generationConfig: {
    temperature: 1.2, // 창의성 높임
    topP: 0.95,
    topK: 40,
    maxOutputTokens: 500,
  },
});

// 운세 생성 시스템 프롬프트
const FORTUNE_SYSTEM_PROMPT = `당신은 신비롭고 유머러스한 점술가입니다.
사용자에게 오늘의 운세를 알려주세요.

규칙:
1. 반드시 한국어로 답변하세요.
2. 총운, 애정운, 금전운, 건강운을 각각 한 줄씩 작성하세요.
3. 행운의 숫자(1-99)와 행운의 색상도 알려주세요.
4. 긍정적이고 희망적인 톤을 유지하되, 가끔 유머를 섞어주세요.
5. 이모지를 적절히 사용해주세요.
6. 전체 길이는 200자 이내로 간결하게 작성하세요.

출력 형식:
🌟 총운: (한 줄)
💕 애정운: (한 줄)
💰 금전운: (한 줄)
💪 건강운: (한 줄)
🔢 행운의 숫자: (숫자)
🎨 행운의 색: (색상)`;

/**
 * 오늘의 운세를 생성합니다.
 * @returns {Promise<string>} 생성된 운세 텍스트
 */
const generateFortune = async () => {
  try {
    const today = new Date().toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long",
    });

    const prompt = `${FORTUNE_SYSTEM_PROMPT}\n\n오늘은 ${today}입니다. 오늘의 운세를 알려주세요.`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    return text;
  } catch (error) {
    console.error("[geminiHelper] 운세 생성 실패:", error.message);
    throw error;
  }
};

module.exports = {
  generateFortune,
};
