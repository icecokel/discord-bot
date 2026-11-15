import type { Message } from "discord.js";
import { registerAdminCommand } from "../../../core/admin-middleware";
import { runGmailMonitor } from "../../gmail-monitor/gmail-monitor-service";

export const handleGmailMonitor = async (message: Message): Promise<void> => {
  const result = await runGmailMonitor(message.client);
  await message.reply({ content: result.detail, allowedMentions: { parse: [] } });
};

registerAdminCommand("메일확인", handleGmailMonitor, "Gmail 새 메일 즉시 확인 (새 메일은 DM으로 전송)");
