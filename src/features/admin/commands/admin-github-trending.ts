import type { Message } from "discord.js";
import { registerAdminCommand } from "../../../core/admin-middleware";
import { sendNotifications } from "../../../utils/notification-batch";
import { sendGitHubTrending } from "../../github-trending/github-trending-service";

export const handleGitHubTrending = async (message: Message): Promise<void> => {
  const result = await sendGitHubTrending(
    process.env.ADMIN_ID,
    // The admin asked for it, so the digest is delivered now even during quiet hours.
    (ownerId, messages) => sendNotifications(message.client, ownerId, messages, { immediate: true }),
  );
  if (result.status !== "success") {
    await message.reply({ content: result.detail, allowedMentions: { parse: [] } });
  }
};

registerAdminCommand("깃트렌드", handleGitHubTrending, "GitHub 트렌딩 Top 10 즉시 받기 (매일 10:00 자동 발송)");
