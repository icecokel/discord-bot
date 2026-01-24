/**
 * /admin reset <target> - 데이터 초기화
 * target: fortune (운세), list (목록 확인)
 */

const fs = require("fs");
const path = require("path");
const { EmbedBuilder } = require("discord.js");
const { registerAdminCommand } = require("../../../core/adminMiddleware");

// 데이터 디렉토리 설정 (process.cwd() 기반)
const { DATA_DIR } = require("../../../utils/userStore");

// 초기화 가능한 타겟 및 파일 매핑
const RESET_TARGETS = {
  fortune: {
    file: "daily_fortunes.json",
    desc: "오늘의 운세 데이터",
    defaultContent: {},
  },
  // 추후 user_preferences 등 추가 가능
};

/**
 * 초기화 명령어 핸들러
 */
const handleReset = async (message, args) => {
  const target = args[0]?.toLowerCase();

  // 1. 목록 조회
  if (!target || target === "list" || target === "help") {
    const embed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle("🗑️ 데이터 초기화 메뉴")
      .setDescription("초기화할 대상을 선택해주세요. (복구 불가)")
      .addFields({
        name: "사용법",
        value: "`/admin reset <target>`",
      });

    const targetList = Object.keys(RESET_TARGETS)
      .map(
        (key) =>
          `**${key}**: ${RESET_TARGETS[key].desc} (${RESET_TARGETS[key].file})`,
      )
      .join("\n");

    embed.addFields({
      name: "초기화 가능 대상",
      value: targetList || "없음",
    });

    await message.reply({ embeds: [embed] });
    return;
  }

  // 2. 타겟 유효성 검사
  const targetConfig = RESET_TARGETS[target];
  if (!targetConfig) {
    await message.reply(
      `❌ 유효하지 않은 대상입니다: \`${target}\`\n\`/admin reset list\`로 목록을 확인하세요.`,
    );
    return;
  }

  // 3. 파일 초기화 실행
  const filePath = path.join(DATA_DIR, targetConfig.file);
  try {
    // 디렉토리가 없으면 생성 (혹시 모르니)
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    // 파일 초기화 (빈 객체 또는 기본값으로 덮어쓰기)
    fs.writeFileSync(
      filePath,
      JSON.stringify(targetConfig.defaultContent, null, 2),
      "utf8",
    );

    const embed = new EmbedBuilder()
      .setColor(0x57f287) // Green
      .setTitle("✅ 초기화 완료")
      .setDescription(
        `**${target}** (${targetConfig.desc}) 데이터가 초기화되었습니다.`,
      )
      .setTimestamp();

    await message.reply({ embeds: [embed] });
    console.log(
      `[Admin] 데이터 초기화 수행: ${target} (${message.author.tag})`,
    );
  } catch (error) {
    console.error(`[Admin] 초기화 실패 (${target}):`, error);
    await message.reply(`❌ 초기화 중 오류가 발생했습니다: ${error.message}`);
  }
};

// 명령어 등록
registerAdminCommand("reset", handleReset);

module.exports = { handleReset };
