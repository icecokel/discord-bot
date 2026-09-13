import type { Message } from "discord.js";
import { registerAdminCommand } from "../../../core/admin-middleware";
import { runXMonitor } from "../../x-monitor/x-monitor-service";

export const handleXMonitor = async (message: Message): Promise<void> => {
  const result = await runXMonitor(message.client);
  await message.reply({ content: result.detail, allowedMentions: { parse: [] } });
};

registerAdminCommand("X확인", handleXMonitor, "X 새 게시물 확인 (야간에는 07:00까지 알림 보류)");
