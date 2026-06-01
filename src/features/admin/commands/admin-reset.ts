/**
 * /관리자 초기화 <target> - 데이터 초기화
 * target: 운세, 목록
 */

import { EmbedBuilder, Message } from "discord.js";
import { registerAdminCommand } from "../../../core/admin-middleware";
import { writeJson } from "../../../utils/file-manager";

interface ResetTarget {
  file: string;
  desc: string;
  defaultContent: any;
}

// 초기화 가능한 타겟 및 파일 매핑
const RESET_TARGETS: { [key: string]: ResetTarget } = {
  운세: {
    file: "daily-fortunes.json",
    desc: "오늘의 운세 데이터",
    defaultContent: {},
  },
  // 추후 user-preferences 등 추가 가능
};

/**
 * 초기화 명령어 핸들러
 */
const handleReset = async (message: Message, args: string[]) => {
  const target = args[0]?.toLowerCase();

  // 1. 목록 조회
  if (!target || target === "목록" || target === "도움말") {
    const embed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle("🗑️ 데이터 초기화 메뉴")
      .setDescription("초기화할 대상을 선택해주세요. (복구 불가)")
      .addFields({
        name: "사용법",
        value: "`/관리자 초기화 <대상>`",
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
      `❌ 유효하지 않은 대상입니다: \`${target}\`\n\`/관리자 초기화 목록\`으로 목록을 확인하세요.`,
    );
    return;
  }

  // 3. 파일 초기화 실행
  try {
    // 파일 초기화 (빈 객체 또는 기본값으로 덮어쓰기)
    writeJson(targetConfig.file, targetConfig.defaultContent);

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
  } catch (error: any) {
    console.error(`[Admin] 초기화 실패 (${target}):`, error);
    await message.reply(`❌ 초기화 중 오류가 발생했습니다: ${error.message}`);
  }
};

// 명령어 등록
registerAdminCommand("초기화", handleReset, "데이터 초기화");

export { handleReset };
