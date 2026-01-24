/**
 * 오늘의 운세 명령어
 * Gemini API를 사용하여 하루에 한 번 운세를 생성하고,
 * 당일 재호출 시 동일한 운세를 반환합니다.
 */
const { EmbedBuilder } = require("discord.js");
const { readJson, writeJson } = require("../../../utils/fileManager");
const { generateFortune } = require("../../../utils/geminiHelper");
const { getDisplayName } = require("../../../utils/userUtils");

const FORTUNES_FILE_NAME = "daily_fortunes.json";

/**
 * 오늘 날짜를 KST 기준 YYYY-MM-DD 형식으로 반환
 */
const getTodayKST = () => {
  const now = new Date();
  // KST는 UTC+9
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstDate = new Date(now.getTime() + kstOffset);
  return kstDate.toISOString().split("T")[0];
};

/**
 * 저장된 운세 데이터 로드
 */
const loadFortunes = () => {
  return readJson(FORTUNES_FILE_NAME, {});
};

/**
 * 운세 데이터 저장
 */
const saveFortunes = (data) => {
  writeJson(FORTUNES_FILE_NAME, data);
};

/**
 * 명령어 실행
 */
const execute = async (message) => {
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

    // Gemini API 호출
    const fortuneContent = await generateFortune();

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
  } catch (error) {
    console.error("[fortune] 실행 오류:", error.message);
    return message.reply(
      "❌ 운세를 불러오는 데 실패했습니다. 잠시 후 다시 시도해주세요.",
    );
  }
};

module.exports = {
  name: "운세",
  description: "오늘의 운세를 확인합니다 (하루에 한 번 생성)",
  keywords: ["!운세", "!fortune", "!오늘운세"],
  execute,
};
