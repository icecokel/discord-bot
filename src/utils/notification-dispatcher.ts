import { MessageFlags } from "discord.js";
import type { APIEmbed, Client, Message } from "discord.js";
import { appendAdminNotification } from "../core/admin-conversation-context-store";
import {
  loadNotificationQueue,
  markNotificationsDelivered,
  markNotificationsFailed,
} from "./notification-queue-store";
import type { QueuedNotification } from "./notification-queue-store";
import { formatQuietHours, isQuietHours } from "./quiet-hours";

const MAX_CONTENT = 2_000;
const MAX_EMBEDS = 10;
const MAX_EMBED_CHARS = 6_000;
// Entries that waited longer than this (overnight hold, retries) show when they were produced.
const LABEL_DELAY_MS = 5 * 60 * 1000;

/**
 * A notification that bypasses the queue because its source keeps its own outbox and needs the
 * delivered Discord message (X records message IDs). It still shares DMs with queued entries.
 */
export interface DirectNotification {
  ownerId: string;
  content: string;
  embeds: APIEmbed[];
  shouldSend?: () => boolean;
  onDelivered: (message: Message, content: string) => void;
  onFailed: (error: unknown) => void;
}

interface Item {
  ownerId: string;
  text: string;
  embeds: APIEmbed[];
  queued?: QueuedNotification;
  direct?: DirectNotification;
}

interface Pack {
  content: string;
  embeds: APIEmbed[];
  items: Item[];
}

export interface DispatchResult {
  delivered: number;
  failed: number;
  /** Entries still waiting: held for quiet hours or backing off after a failure. */
  waiting: number;
}

const embedChars = (embeds: APIEmbed[]): number =>
  embeds.reduce((total, embed) => total + (embed.title?.length || 0) + (embed.description?.length || 0) +
    (embed.author?.name.length || 0) + (embed.footer?.text.length || 0) +
    (embed.fields || []).reduce((sum, field) => sum + field.name.length + field.value.length, 0), 0);

const formatKstTime = (iso: string): string =>
  new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));

/** Plain-text view of a delivered DM, as the admin Claude will see it in later turns. */
export const notificationToText = (content: string, embeds: APIEmbed[] = []): string =>
  [
    content,
    ...embeds.map((embed) =>
      [embed.title, embed.description, ...(embed.fields || []).map((field) => `${field.name}: ${field.value}`), embed.url]
        .filter(Boolean).join("\n")),
  ].filter(Boolean).join("\n\n");

const queuedItem = (entry: QueuedNotification, now: Date): Item => {
  const labelled = now.getTime() - Date.parse(entry.enqueuedAt) >= LABEL_DELAY_MS
    ? `🕐 ${formatKstTime(entry.enqueuedAt)}\n${entry.content}`.trim()
    : entry.content;
  // A label must never push an entry that was valid when queued over the Discord limit.
  return { ownerId: entry.ownerId, text: labelled.length <= MAX_CONTENT ? labelled : entry.content, embeds: entry.embeds, queued: entry };
};

/** Greedily packs items, in order, into as few Discord messages as the limits allow. */
export const packItems = (items: Item[], header?: string): Pack[] => {
  const packs: Pack[] = [];
  let current: Pack = { content: header || "", embeds: [], items: [] };
  for (const item of items) {
    const content = [current.content, item.text].filter(Boolean).join("\n\n");
    const fits = content.length <= MAX_CONTENT &&
      current.embeds.length + item.embeds.length <= MAX_EMBEDS &&
      embedChars(current.embeds) + embedChars(item.embeds) <= MAX_EMBED_CHARS;
    if (fits) {
      current = { content, embeds: [...current.embeds, ...item.embeds], items: [...current.items, item] };
    } else {
      // Start a new message; before the first item this only drops the header line.
      if (current.items.length) packs.push(current);
      current = { content: item.text, embeds: [...item.embeds], items: [item] };
    }
  }
  if (current.items.length) packs.push(current);
  return packs;
};

const remember = (ownerId: string, delivered: Message | undefined, pack: Pack): void => {
  try {
    if (delivered?.channelId) appendAdminNotification(ownerId, delivered.channelId, notificationToText(pack.content, pack.embeds));
  } catch {
    // Conversation memory is best-effort and must never fail a delivered notification.
    console.error("[NotificationDispatcher] 대화 기억에 알림 기록 실패");
  }
};

const errorText = (error: unknown): string =>
  error instanceof Error && error.message ? error.message : String(error || "알 수 없는 오류");

const deliverOwner = async (
  client: Client,
  ownerId: string,
  packs: Pack[],
  now: Date,
  result: DispatchResult,
): Promise<void> => {
  const failFrom = (index: number, error: unknown) => {
    // Everything not yet delivered backs off together; the next try keeps the original order.
    const remaining = packs.slice(index);
    const attempted = remaining.flatMap((pack) => pack.items.flatMap((item) => (item.queued ? [item.queued.id] : [])));
    if (attempted.length) {
      try {
        markNotificationsFailed(attempted, errorText(error), now);
      } catch (storeError) {
        console.error("[NotificationDispatcher] 실패 기록 저장 실패:", errorText(storeError));
      }
    }
    for (const item of remaining.flatMap((pack) => pack.items)) item.direct?.onFailed(error);
    result.failed += remaining.reduce((sum, pack) => sum + pack.items.length, 0);
  };

  let user;
  try {
    user = await client.users.fetch(ownerId);
  } catch (error) {
    failFrom(0, error);
    return;
  }

  let sent = 0;
  for (const [index, original] of packs.entries()) {
    // A direct source can cross its own quiet boundary mid-run; drop it and keep the rest.
    const items = original.items.filter((item) => item.direct?.shouldSend?.() !== false);
    if (!items.length) continue;
    const pack = items.length === original.items.length ? original : packItems(items)[0];
    let delivered: Message;
    try {
      delivered = await user.send({
        ...(pack.content ? { content: pack.content } : {}),
        ...(pack.embeds.length ? { embeds: pack.embeds } : {}),
        allowedMentions: { parse: [] },
        // Only the first DM of a dispatch makes a sound.
        ...(sent > 0 ? { flags: MessageFlags.SuppressNotifications } : {}),
      });
    } catch (error) {
      failFrom(index, error);
      return;
    }
    sent += 1;
    remember(ownerId, delivered, pack);
    const queuedIds = pack.items.flatMap((item) => (item.queued ? [item.queued.id] : []));
    if (queuedIds.length) {
      try {
        markNotificationsDelivered(queuedIds, now);
      } catch (error) {
        // The DM went out; a failed removal can only cause a duplicate later, never a loss.
        console.error("[NotificationDispatcher] 발송 완료 기록 실패:", errorText(error));
      }
    }
    for (const item of pack.items) {
      if (!item.direct) continue;
      try {
        item.direct.onDelivered(delivered, pack.content);
      } catch (error) {
        item.direct.onFailed(error);
      }
    }
    result.delivered += pack.items.length;
  }
};

const runDispatch = async (
  client: Client,
  now: Date,
  direct: DirectNotification[],
): Promise<DispatchResult> => {
  const result: DispatchResult = { delivered: 0, failed: 0, waiting: 0 };
  let entries: QueuedNotification[] = [];
  try {
    entries = loadNotificationQueue().entries;
  } catch (error) {
    console.error("[NotificationDispatcher] 알림 큐를 읽지 못했습니다:", errorText(error));
  }

  // The one quiet-hours rule: the queue is held, not the sources.
  const quiet = isQuietHours(now);
  const ready = entries
    .filter((entry) => (entry.immediate || !quiet) &&
      (!entry.nextAttemptAt || Date.parse(entry.nextAttemptAt) <= now.getTime()))
    .sort((a, b) => a.enqueuedAt.localeCompare(b.enqueuedAt) || (a.order ?? 0) - (b.order ?? 0));
  result.waiting = entries.length - ready.length;

  const owners = new Map<string, { queued: QueuedNotification[]; direct: DirectNotification[] }>();
  const slot = (ownerId: string) => {
    if (!owners.has(ownerId)) owners.set(ownerId, { queued: [], direct: [] });
    return owners.get(ownerId)!;
  };
  for (const entry of ready) slot(entry.ownerId).queued.push(entry);
  for (const item of direct) {
    if (item.shouldSend?.() === false) continue;
    slot(item.ownerId).direct.push(item);
  }

  for (const [ownerId, { queued, direct: directItems }] of owners) {
    const overnight = queued.filter((entry) => !entry.immediate && isQuietHours(new Date(entry.enqueuedAt))).length;
    const header = overnight ? `🌙 야간(${formatQuietHours()})에 쌓인 알림 ${overnight}건` : undefined;
    const items: Item[] = [
      ...queued.map((entry) => queuedItem(entry, now)),
      ...directItems.map((item): Item => ({ ownerId, text: item.content, embeds: item.embeds, direct: item })),
    ];
    if (!items.length) continue;
    await deliverOwner(client, ownerId, packItems(items, header), now, result);
  }
  return result;
};

let chain: Promise<unknown> = Promise.resolve();

/**
 * Drains the notification queue (plus any direct notifications) into Discord DMs.
 * Runs one at a time so a minute tick and a manual command never send the same entry twice.
 */
export const dispatchNotifications = (
  client: Client,
  options: { now?: () => Date; direct?: DirectNotification[] } = {},
): Promise<DispatchResult> => {
  const run = chain.then(() => runDispatch(client, (options.now || (() => new Date()))(), options.direct || []));
  chain = run.catch(() => undefined);
  return run;
};
