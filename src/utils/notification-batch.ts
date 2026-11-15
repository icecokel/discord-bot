import type { APIEmbed, Client, Message, MessageCreateOptions } from "discord.js";
import { enqueueNotifications } from "./notification-queue-store";
import { dispatchNotifications, notificationToText } from "./notification-dispatcher";
import type { DirectNotification } from "./notification-dispatcher";

export { notificationToText };

/**
 * Every notification goes into the notification queue and the dispatcher delivers it. The queue
 * — not each source — is held during quiet hours (23:00~06:00 KST) and retried after failures.
 */
export interface Notification {
  content?: string;
  embeds?: MessageCreateOptions["embeds"];
  /** Only for direct delivery: re-checked right before the DM is sent. */
  shouldSend?: () => boolean;
  /**
   * Queued: called once the notification is safely stored in the queue (`message` is undefined),
   * so the source can mark it done; the queue owns delivery from then on.
   * Direct: called with the delivered Discord message.
   */
  onSent?: (message: Message | undefined, content: string) => void;
  /**
   * "direct" skips the queue for sources that keep their own outbox and need the delivered
   * message (X). They follow quiet hours themselves through shouldSend.
   */
  delivery?: "queue" | "direct";
}

export type NotificationSender = (ownerId: string, messages: Notification[]) => Promise<void>;

export interface DeliveryOptions {
  now?: () => Date;
  /** Admin-requested results (manual commands) are delivered even during quiet hours. */
  immediate?: boolean;
}

const embedChars = (embeds: APIEmbed[]): number =>
  embeds.reduce((total, embed) => total + (embed.title?.length || 0) + (embed.description?.length || 0) +
    (embed.author?.name.length || 0) + (embed.footer?.text.length || 0) +
    (embed.fields || []).reduce((sum, field) => sum + field.name.length + field.value.length, 0), 0);

const toEmbedJson = (embeds: Notification["embeds"] = []): APIEmbed[] =>
  embeds.map((embed) => ("toJSON" in embed ? embed.toJSON() : embed) as APIEmbed);

interface Submission {
  direct: DirectNotification[];
  /** Settles when every direct notification is delivered (or skipped); queued ones are done already. */
  done: Promise<void>;
}

/**
 * Validates and queues one source's messages in a single write, then acknowledges them.
 * Throws if anything could not be queued, so the source keeps its state and retries.
 */
const submit = (
  ownerId: string,
  messages: Notification[],
  options: DeliveryOptions,
  order?: number,
): Submission => {
  const prepared = messages
    .filter((message) => message.content || message.embeds?.length)
    .map((message) => ({ message, content: message.content || "", embeds: toEmbedJson(message.embeds) }));
  if (prepared.some(({ content, embeds }) => content.length > 2_000 || embeds.length > 10 || embedChars(embeds) > 6_000)) {
    throw new Error("알림이 Discord 메시지 길이 제한을 초과했습니다.");
  }

  const queued = prepared.filter(({ message }) => message.delivery !== "direct");
  enqueueNotifications(
    queued.map(({ content, embeds }) => ({
      ownerId,
      content,
      embeds,
      ...(order !== undefined ? { order } : {}),
      ...(options.immediate ? { immediate: true as const } : {}),
    })),
    (options.now || (() => new Date()))(),
  );
  let acknowledgementError: unknown;
  for (const { message, content } of queued) {
    try {
      message.onSent?.(undefined, content);
    } catch (error) {
      acknowledgementError ??= error;
    }
  }
  if (acknowledgementError) throw acknowledgementError;

  const direct: DirectNotification[] = [];
  const pending: Promise<void>[] = [];
  for (const { message, content, embeds } of prepared.filter(({ message }) => message.delivery === "direct")) {
    pending.push(new Promise<void>((resolve, reject) => {
      direct.push({
        ownerId,
        content,
        embeds,
        shouldSend: () => {
          const send = message.shouldSend?.() !== false;
          if (!send) resolve();
          return send;
        },
        onDelivered: (delivered, sentContent) => {
          message.onSent?.(delivered, sentContent);
          resolve();
        },
        onFailed: reject,
      });
    }));
  }
  return { direct, done: Promise.all(pending).then(() => undefined) };
};

/** Queues one source's notifications and dispatches right away (manual commands, ad-hoc sends). */
export const sendNotifications = async (
  client: Client,
  ownerId: string,
  messages: Notification[],
  options: DeliveryOptions = {},
): Promise<void> => {
  const { direct, done } = submit(ownerId, messages, options);
  done.catch(() => undefined);
  await dispatchNotifications(client, { now: options.now, direct });
  await done;
};

/**
 * Runs one minute's scheduled tasks, then dispatches the queue once so everything produced in
 * the same minute shares DMs where it fits. Dispatch also runs with no tasks, which delivers
 * retries and releases the overnight hold at 06:00.
 */
export const runNotificationBatch = async (
  client: Client,
  tasks: ((send: NotificationSender) => Promise<unknown>)[],
  options: DeliveryOptions = {},
): Promise<void> => {
  // One timestamp for the whole minute, so the task index alone decides the order.
  const startedAt = new Date();
  const batchOptions: DeliveryOptions = { ...options, now: options.now || (() => startedAt) };
  const direct: DirectNotification[] = [];
  const ready: Promise<void>[] = [];
  const running = tasks.map((task, index) => {
    let markReady!: () => void;
    let submitted = false;
    ready.push(new Promise((resolve) => { markReady = resolve; }));
    const send: NotificationSender = async (ownerId, messages) => {
      if (submitted) throw new Error("스케줄 작업은 메시지 목록을 한 번만 제출해야 합니다.");
      submitted = true;
      try {
        // Same-minute entries share a timestamp; the task index keeps them in schedule order.
        const submission = submit(ownerId, messages, batchOptions, index);
        direct.push(...submission.direct);
        markReady();
        await submission.done;
      } finally {
        markReady();
      }
    };
    return Promise.resolve().then(() => task(send)).finally(markReady);
  });
  const completed = Promise.allSettled(running);
  await Promise.all(ready);
  try {
    // Dispatch on the real clock unless the caller pinned one (the scheduler passes its tick).
    await dispatchNotifications(client, { now: options.now, direct });
  } catch (error) {
    console.error("[Scheduler] 알림 발송 실패:", error);
    for (const item of direct) item.onFailed(error);
  }
  for (const result of await completed) {
    if (result.status === "rejected") console.error("[Scheduler] 알림 작업 실패:", result.reason);
  }
};
