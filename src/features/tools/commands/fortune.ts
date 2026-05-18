import { EmbedBuilder, Message } from "discord.js";
import { readJson, writeJson } from "../../../utils/file-manager";
import { aiService } from "../../../core/ai";
import { getDisplayName } from "../../../utils/user-utils";

/**
 * 오늘의 운세 명령어
 * Gemini API를 사용하여 하루에 한 번 운세를 생성하고,
 * 당일 재호출 시 동일한 운세를 반환합니다.
 */

const FORTUNES_FILE_NAME = "daily-fortunes.json";

interface FortuneData {
  date: string;
  content: string;
}

interface FortuneMap {
  [userId: string]: FortuneData;
}

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
 * 오늘 날짜를 KST 기준 YYYY-MM-DD 형식으로 반환
 */
const getTodayKST = (): string => {
  const now = new Date();
  // KST는 UTC+9
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstDate = new Date(now.getTime() + kstOffset);
  return kstDate.toISOString().split("T")[0];
};

/**
 * 저장된 운세 데이터 로드
 */
const loadFortunes = (): FortuneMap => {
  return readJson<FortuneMap>(FORTUNES_FILE_NAME, {});
};

/**
 * 운세 데이터 저장
 */
const saveFortunes = (data: FortuneMap): void => {
  writeJson(FORTUNES_FILE_NAME, data);
};

/**
 * 명령어 실행
 */
const execute = async (message: Message): Promise<void | Message> => {
  const userId = message.author.id;
  const displayName = getDisplayName(message);
  const today = getTodayKST();

  // 저장된 데이터 로드
  const fortunes = loadFortunes();

  // 오늘 이미 운세를 뽑았는지 확인
  if (fortunes[userId] && fortunes[userId].date === today) {
    const embed = new EmbedBuilder()
      .setColor(0x9b59b6) // 보라색
      .setTitle("🔮 오늘의 운세")
      .setDescription(fortunes[userId].content)
      .setFooter({ text: `${displayName}님의 운세 • 이미 오늘 확인하셨네요!` })
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  }

  // 새로운 운세 생성
  try {
    // 대기 메시지 전송
    const waitMessage = await message.reply(
      "🔮 별들의 목소리를 듣고 있습니다...",
    );

    // AI 서비스를 통해 운세 생성
    const prompt = `오늘은 ${today}입니다. 오늘의 운세를 알려주세요.`;

    // 운세 생성에 맞춘 창의성 파라미터 적용
    const fortuneContent = await aiService.generateText(prompt, {
      systemInstruction: FORTUNE_SYSTEM_PROMPT,
      config: {
        temperature: 1.2,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 2000,
      },
    });

    // 데이터 저장
    fortunes[userId] = {
      date: today,
      content: fortuneContent,
    };
    saveFortunes(fortunes);

    // 운세 Embed 생성
    const embed = new EmbedBuilder()
      .setColor(0xe91e63) // 핑크색
      .setTitle("🔮 오늘의 운세")
      .setDescription(fortuneContent)
      .setFooter({ text: `${displayName}님의 운세 • ${today}` })
      .setTimestamp();

    // 대기 메시지 수정
    await waitMessage.edit({ content: null, embeds: [embed] });
  } catch (error: any) {
    console.error("[fortune] 실행 오류:", error.message);
    return message.reply(
      "❌ 운세를 불러오는 데 실패했습니다. 잠시 후 다시 시도해주세요.",
    );
  }
};

export default {
  name: "운세",
  description: "오늘의 운세를 확인합니다 (하루에 한 번 생성)",
  keywords: ["운세", "fortune", "오늘운세"],
  execute,
};
