import { MessageFlags } from "discord.js";
import type { Client, Message, MessageCreateOptions } from "discord.js";

export interface Notification {
  content?: string;
  embeds?: MessageCreateOptions["embeds"];
  shouldSend?: () => boolean;
  onSent?: (message: Message, content: string) => void;
}

export type NotificationSender = (ownerId: string, messages: Notification[]) => Promise<void>;

interface Batch {
  ownerId: string;
  messages: Notification[];
  failed?: boolean;
  error?: unknown;
}

const embedLength = (embeds: Notification["embeds"] = []): number =>
  embeds.reduce((total, embed) => {
    const data = "toJSON" in embed ? embed.toJSON() : embed;
    return total + (data.title?.length || 0) + (data.description?.length || 0) +
      (data.author?.name.length || 0) + (data.footer?.text.length || 0) +
      (data.fields || []).reduce((sum, field) => sum + field.name.length + field.value.length, 0);
  }, 0);

const deliverBatches = async (client: Client, batches: Batch[]): Promise<void> => {
  const notifiedOwners = new Set<string>();
  const pending = batches.flatMap(batch => batch.messages.map(message => ({ batch, message })));
  while (pending.length) {
    const first = pending.shift()!;
    if (first.batch.failed || first.message.shouldSend?.() === false) continue;
    const group = [first];
    let content = first.message.content || "";
    const embeds = [...(first.message.embeds || [])];
    if (content.length > 2000 || embeds.length > 10 || embedLength(embeds) > 6000) {
      first.batch.failed = true;
      first.batch.error = new Error("알림이 Discord 메시지 길이 제한을 초과했습니다.");
      continue;
    }
    // Keep each source's chunk boundaries so its delivery progress is saved before the next chunk.
    const seen = new Set([first.batch]);
    for (let index = 0; index < pending.length;) {
      const next = pending[index];
      if (next.batch.failed || next.message.shouldSend?.() === false) {
        pending.splice(index, 1);
        continue;
      }
      if (seen.has(next.batch)) {
        index += 1;
        continue;
      }
      seen.add(next.batch);
      const combined = [content, next.message.content].filter(Boolean).join("\n\n");
      const nextEmbeds = next.message.embeds || [];
      if (next.batch.ownerId !== first.batch.ownerId ||
          combined.length > 2000 || embeds.length + nextEmbeds.length > 10 ||
          embedLength(embeds) + embedLength(nextEmbeds) > 6000) {
        index += 1;
        continue;
      }
      content = combined;
      embeds.push(...nextEmbeds);
      group.push(next);
      pending.splice(index, 1);
    }
    try {
      const user = await client.users.fetch(first.batch.ownerId);
      // Fetching a recipient can cross the quiet-time boundary; rebuild without deferred sources.
      if (group.some(item => item.message.shouldSend?.() === false)) {
        pending.unshift(...group);
        continue;
      }
      const delivered = await user.send({
        ...(content ? { content } : {}),
        ...(embeds.length ? { embeds } : {}),
        allowedMentions: { parse: [] },
        ...(notifiedOwners.has(first.batch.ownerId) ? { flags: MessageFlags.SuppressNotifications } : {}),
      });
      notifiedOwners.add(first.batch.ownerId);
      for (const item of group) {
        try {
          item.message.onSent?.(delivered, content);
        } catch (error) {
          item.batch.failed = true;
          item.batch.error = error;
        }
      }
    } catch (error) {
      for (const item of group) {
        item.batch.failed = true;
        item.batch.error = error;
      }
    }
  }
};

export const sendNotifications = async (client: Client, ownerId: string, messages: Notification[]): Promise<void> => {
  const batch: Batch = { ownerId, messages };
  await deliverBatches(client, [batch]);
  if (batch.failed) throw batch.error;
};

// Each task submits one complete message list and awaits actual delivery before recording success.
export const runNotificationBatch = async (
  client: Client,
  tasks: ((send: NotificationSender) => Promise<unknown>)[],
): Promise<void> => {
  const batches: Batch[] = [];
  const ready: Promise<void>[] = [];
  const settlements: (() => void)[] = [];
  const running = tasks.map((task, index) => {
    let markReady!: () => void;
    ready.push(new Promise(resolve => { markReady = resolve; }));
    const send: NotificationSender = (ownerId, messages) => {
      if (batches[index]) return Promise.reject(new Error("스케줄 작업은 메시지 목록을 한 번만 제출해야 합니다."));
      const batch: Batch = { ownerId, messages };
      batches[index] = batch;
      const delivery = new Promise<void>((resolve, reject) => {
        settlements.push(() => batch.failed ? reject(batch.error) : resolve());
      });
      markReady();
      return delivery;
    };
    return Promise.resolve().then(() => task(send)).finally(markReady);
  });
  const completed = Promise.allSettled(running);
  await Promise.all(ready);
  try {
    await deliverBatches(client, batches.filter(Boolean));
  } catch (error) {
    for (const batch of batches.filter(Boolean)) {
      batch.failed = true;
      batch.error = error;
    }
  } finally {
    settlements.forEach(settle => settle());
  }
  const results = await completed;
  for (const result of results) {
    if (result.status === "rejected") console.error("[Scheduler] 알림 작업 실패:", result.reason);
  }
};
