import type { Message } from "discord.js";
import { registerAdminCommand } from "../../../core/admin-middleware";
import { runGmailMonitor } from "../../gmail-monitor/gmail-monitor-service";
import { sendNotifications } from "../../../utils/notification-batch";

export const handleGmailMonitor = async (message: Message): Promise<void> => {
  // The admin asked for it, so the result is delivered now even during quiet hours.
  const result = await runGmailMonitor(message.client, undefined, (ownerId, messages) =>
    sendNotifications(message.client, ownerId, messages, { immediate: true }));
  await message.reply({ content: result.detail, allowedMentions: { parse: [] } });
};

registerAdminCommand("메일확인", handleGmailMonitor, "Gmail 새 메일 즉시 확인 (채용 관련 메일만 DM으로 전송, 매시 정각 자동)");
