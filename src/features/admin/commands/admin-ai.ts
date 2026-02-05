import { Message } from "discord.js";
import { registerAdminCommand } from "../../../core/adminMiddleware";
import { aiService, searchService } from "../../../core/ai"; // aiService, searchService 둘 다 필요

/**
 * 관리자 전용 AI 채팅 명령어
 * 사용법: /ai <질문>
 */
const aiHandler = async (message: Message, args: string[]) => {
  if (args.length === 0) {
    return message.reply("💡 사용법: `/ai <질문>` 형태로 입력해주세요.");
  }

  const question = args.join(" ");

  // 대기 메시지
  const waitMsg = await message.reply("💬 답변을 생성하고 있습니다...");

  try {
    // AI 응답 생성 (기본 AI 서비스 + 검색 도구 장착)
    const response = await aiService.generateText(question, {
      tools: searchService.getTools(),
    });

    // 디스코드 메시지 길이 제한(2000자) 처리
    if (response.length > 1900) {
      // 1900자씩 끊어서 전송
      const chunks = response.match(/.{1,1900}/g) || [];

      if (chunks.length > 0 && chunks[0]) {
        await waitMsg.edit(chunks[0]);
      }

      for (let i = 1; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (chunk) {
          await (message.channel as any).send(chunk);
        }
      }
    } else {
      // 단일 메시지로 전송
      await waitMsg.edit(response);
    }
  } catch (error: any) {
    console.error("[Admin AI] Error:", error);
    await waitMsg.edit("❌ 답변 생성 중 오류가 발생했습니다.");
  }
};

// 명령어 등록
registerAdminCommand("ai", aiHandler);
