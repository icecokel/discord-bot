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

registerAdminCommand("메일확인", handleGmailMonitor, "Gmail 새 메일 즉시 확인 (새 메일은 DM으로 전송)");
