import type { Client } from "discord.js";
import { saveXMonitorState } from "../../utils/x-monitor-store";
import type { XMonitorState } from "../../utils/x-monitor-store";
import { buildXMessages, isXQuietTime } from "./x-monitor-message";
import { sendNotifications } from "../../utils/notification-batch";
import type { NotificationSender } from "../../utils/notification-batch";

export const sendXNotifications = async (
  client: Client,
  ownerId: string,
  state: XMonitorState,
  now: () => Date,
  translationFailures: number,
  send: NotificationSender = (id, messages) => sendNotifications(client, id, messages),
): Promise<number> => {
  const messages = buildXMessages(state.pending.filter((post) => post.translatedText || post.originalOnly), now());
  if (translationFailures && messages.length) {
    messages[0].content = `⚠️ 티보 게시물 AI 번역 ${translationFailures}건 실패 · 원문 알림을 계속 전송합니다.\n\n${messages[0].content}`;
  }
  let sent = 0;
  await send(ownerId, messages.map(message => ({
    content: message.content,
    shouldSend: () => !isXQuietTime(now()),
    onSent: (delivered, content) => {
      (state.deliveries ??= []).push({
        sentAt: now().toISOString(), recipientId: ownerId,
        channelId: delivered.channelId, messageId: delivered.id,
        content,
        postIds: [...new Set(message.progress.map(part => part.id))],
        completedPostIds: [...message.ids],
      });
      for (const progress of message.progress) {
        const post = state.pending.find((post) => post.id === progress.id)!;
        post.sentParts = progress.sentParts;
      }
      const sentIds = new Set(message.ids);
      state.notifiedIds.push(...message.ids);
      state.pending = state.pending.filter((post) => !sentIds.has(post.id));
      saveXMonitorState(state);
      sent += message.ids.length;
    },
  })));
  return sent;
};
