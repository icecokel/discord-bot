/**
 * /admin notice <메시지> - 등록된 유저들에게 공지 발송
 */

const { EmbedBuilder } = require("discord.js");
const { registerAdminCommand } = require("../../../core/adminMiddleware");
const userStore = require("../../../utils/userStore");
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(process.cwd(), "src/data");
const PREFS_FILE = path.join(DATA_DIR, "user_preferences.json");

/**
 * 등록된 모든 유저 ID 가져오기
 * @returns {string[]}
 */
const getAllUserIds = () => {
  try {
    if (!fs.existsSync(PREFS_FILE)) return [];
    const data = fs.readFileSync(PREFS_FILE, "utf8");
    const prefs = JSON.parse(data);
    return Object.keys(prefs);
  } catch (e) {
    console.error("[Admin] 유저 목록 조회 오류:", e);
    return [];
  }
};

/**
 * 공지 명령어 핸들러
 */
const handleNotice = async (message, args) => {
  // 메시지 내용 확인
  const noticeContent = args.join(" ").trim();

  if (!noticeContent) {
    await message.reply(
      "❌ 공지 내용을 입력해주세요.\n사용법: `/admin notice <공지 내용>`",
    );
    return;
  }

  // 대상 유저 목록
  const userIds = getAllUserIds();

  if (userIds.length === 0) {
    await message.reply("❌ 등록된 유저가 없습니다.");
    return;
  }

  // 발송 시작 알림
  const startEmbed = new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle("📢 공지 발송 시작")
    .setDescription(`대상: **${userIds.length}**명\n잠시만 기다려주세요...`)
    .setTimestamp();

  await message.reply({ embeds: [startEmbed] });

  // 공지 Embed 생성
  const noticeEmbed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle("📢 공지사항")
    .setDescription(noticeContent)
    .setTimestamp()
    .setFooter({ text: "관리자 공지" });

  // 발송 결과 추적
  let successCount = 0;
  let failCount = 0;
  const failedUsers = [];

  // 유저별 DM 발송
  for (const userId of userIds) {
    try {
      const user = await message.client.users.fetch(userId);
      await user.send({ embeds: [noticeEmbed] });
      successCount++;
      console.log(`[Admin] 공지 발송 성공: ${user.tag}`);
    } catch (error) {
      failCount++;
      failedUsers.push(userId);
      console.error(`[Admin] 공지 발송 실패 (${userId}):`, error.message);
    }

    // Rate limit 방지를 위한 딜레이
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  // 결과 리포트
  const resultEmbed = new EmbedBuilder()
    .setColor(failCount === 0 ? 0x57f287 : 0xfee75c)
    .setTitle("📢 공지 발송 완료")
    .addFields(
      { name: "✅ 성공", value: `${successCount}명`, inline: true },
      { name: "❌ 실패", value: `${failCount}명`, inline: true },
    )
    .setTimestamp();

  if (failedUsers.length > 0) {
    const failedList = failedUsers.slice(0, 10).join("\n");
    resultEmbed.addFields({
      name: "실패한 유저 ID",
      value:
        `\`\`\`\n${failedList}\n\`\`\`` +
        (failedUsers.length > 10
          ? `\n... 외 ${failedUsers.length - 10}명`
          : ""),
      inline: false,
    });
  }

  await message.channel.send({ embeds: [resultEmbed] });
};

// 명령어 등록
registerAdminCommand("notice", handleNotice);

module.exports = { handleNotice };
