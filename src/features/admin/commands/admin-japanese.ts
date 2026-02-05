/**
 * /japanese - 오늘의 일본어 표현 테스트 발송 (관리자 DM)
 * (이전: /admin japanese)
 */

import { registerAdminCommand } from "../../../core/adminMiddleware";
import japaneseService from "../../daily_japanese/JapaneseService";
import { EmbedBuilder, Message } from "discord.js";

const handleJapaneseTest = async (message: Message, args: string[]) => {
  try {
    const waitMsg = await message.reply(
      "🇯🇵 일본어 문장을 생성하고 있습니다...",
    );

    // 콘텐츠 생성
    const contentData = await japaneseService.generateDailyContent();

    // Embed 생성 (Service의 공통 로직 재사용)
    const embed = japaneseService.createEmbed(contentData);

    // 테스트용 커스텀 설정
    embed
      .setTitle(`[TEST] 🇯🇵 오늘의 왕초보 일본어 - ${contentData.category} 편`)
      .setFooter({ text: "Only visible to Admin" });

    // 관리자에게 DM 발송
    try {
      await message.author.send({ embeds: [embed] });
      await waitMsg.edit("✅ 관리자 DM으로 테스트 메시지를 발송했습니다.");
    } catch (dmError) {
      await waitMsg.edit("❌ DM을 보낼 수 없습니다. DM 설정을 확인해주세요.");
    }
  } catch (error) {
    console.error("[Admin] 일본어 테스트 실패:", error);
    await message.reply("❌ 생성 중 오류가 발생했습니다.");
  }
};

// 명령어 등록
registerAdminCommand("japanese", handleJapaneseTest);
registerAdminCommand("일본어", handleJapaneseTest);

export { handleJapaneseTest };
