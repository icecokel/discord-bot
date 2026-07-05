import { Message } from "discord.js";
import { clearAdminConversationContext } from "../../../core/admin-conversation-context-store";
import { aiService } from "../../../core/ai";
import { resetHermesSession } from "../../../core/hermes-session-store";

const ADMIN_ONLY_MESSAGE = "⛔ 관리자 권한이 없습니다.";

const isAdmin = (message: Message): boolean => {
  return Boolean(
    process.env.ADMIN_ID && message.author.id === process.env.ADMIN_ID,
  );
};

const getAction = (
  args: string[],
): "on" | "off" | "status" | "clear" | "help" => {
  const action = args[0]?.trim().toLowerCase();

  if (!action || ["상태", "status", "확인"].includes(action)) return "status";
  if (["켜기", "켜", "on", "enable", "활성화"].includes(action)) return "on";
  if (["끄기", "꺼", "off", "disable", "비활성화"].includes(action)) {
    return "off";
  }
  if (["초기화", "리셋", "reset", "clear"].includes(action)) return "clear";

  return "help";
};

const buildStatusMessage = (): string => {
  const status = aiService.getProviderStatus();
  const fallback = status.fallbackProviderName
    ? `, fallback: ${status.fallbackProviderName}`
    : "";

  return `현재 AI 공급자: ${status.providerName}${fallback}`;
};

export default {
  name: "헤르메스",
  keywords: ["헤르메스", "hermes"],
  description: "관리자 전용 Codex AI 공급자 호환 명령",
  async execute(message: Message, args: string[]) {
    if (!isAdmin(message)) {
      await message.reply(ADMIN_ONLY_MESSAGE);
      return;
    }

    const action = getAction(args);

    if (action === "on") {
      aiService.setPrimaryProvider("codex");
      await message.reply(`✅ Codex를 켰습니다.\n${buildStatusMessage()}`);
      return;
    }

    if (action === "off") {
      aiService.setPrimaryProvider("gemini");
      await message.reply(`✅ Codex를 껐습니다.\n${buildStatusMessage()}`);
      return;
    }

    if (action === "status") {
      await message.reply(buildStatusMessage());
      return;
    }

    if (action === "clear") {
      clearAdminConversationContext(message.author.id, message.channel.id);
      aiService.clearCodexThread?.(message.author.id, message.channel.id);
      resetHermesSession(message.author.id, message.channel.id);
      await message.reply(
        "✅ 현재 채널의 Codex 관리자 대화 기억을 초기화했습니다.",
      );
      return;
    }

    await message.reply(
      "사용법: `!헤르메스 상태`, `!헤르메스 켜기`, `!헤르메스 끄기`, `!헤르메스 초기화`",
    );
  },
};
