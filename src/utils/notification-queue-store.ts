import type { APIEmbed } from "discord.js";
import { readJson, writeJson } from "./file-manager";

const FILE_NAME = "notification-queue.json";
// A DM that keeps failing must not grow the queue forever; the oldest entries go first.
export const MAX_QUEUE_ENTRIES = 300;
export const MAX_QUEUE_AGE_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_RETRY_DELAY_MS = 30 * 60 * 1000;

/** One notification waiting for delivery, stored exactly as it will be sent. */
export interface QueuedNotification {
  id: string;
  ownerId: string;
  content: string;
  embeds: APIEmbed[];
  enqueuedAt: string;
  /** Tie-breaker for entries queued in the same instant (a minute's tasks, in schedule order). */
  order?: number;
  /** Requested by the admin (manual command): delivered even during quiet hours. */
  immediate?: true;
  attempts: number;
  nextAttemptAt?: string;
  lastError?: string;
}

export interface NotificationQueueState {
  version: 1;
  entries: QueuedNotification[];
  lastDeliveredAt?: string;
  lastFailureAt?: string;
  lastError?: string;
  droppedCount?: number;
}

export type NewQueuedNotification = Pick<QueuedNotification, "ownerId" | "content" | "embeds" | "immediate" | "order">;

let sequence = 0;
// Under Jest the queue lives on the test file's global so a setup hook can reset it without
// importing (and thereby pre-loading) any module before the suite's own mocks apply.
const MEMORY_KEY = "__discordBotNotificationQueue";
const memory = globalThis as unknown as Record<typeof MEMORY_KEY, NotificationQueueState | undefined>;

// Many suites reach the queue indirectly; under Jest it lives in memory unless a suite opts in.
const usesFile = (): boolean =>
  process.env.NODE_ENV !== "test" || process.env.NOTIFICATION_QUEUE_PERSIST === "true";

const emptyState = (): NotificationQueueState => ({ version: 1, entries: [] });

const isEntry = (value: unknown): value is QueuedNotification => {
  if (!value || typeof value !== "object") return false;
  const entry = value as QueuedNotification;
  return typeof entry.id === "string" && typeof entry.ownerId === "string" &&
    typeof entry.content === "string" && Array.isArray(entry.embeds) &&
    typeof entry.enqueuedAt === "string" && Number.isInteger(entry.attempts);
};

export const loadNotificationQueue = (): NotificationQueueState => {
  if (!usesFile()) return structuredClone(memory[MEMORY_KEY] || emptyState());
  const data = readJson<NotificationQueueState | null>(FILE_NAME, null);
  if (data === null) return emptyState();
  if (!data || data.version !== 1 || !Array.isArray(data.entries) || !data.entries.every(isEntry)) {
    throw new Error("알림 큐 형식이 올바르지 않습니다.");
  }
  return data;
};

const save = (state: NotificationQueueState): void => {
  if (!usesFile()) {
    memory[MEMORY_KEY] = structuredClone(state);
    return;
  }
  if (!writeJson(FILE_NAME, state)) throw new Error("알림 큐 저장에 실패했습니다.");
};

const prune = (state: NotificationQueueState, now: Date): void => {
  const fresh = state.entries.filter((entry) => now.getTime() - Date.parse(entry.enqueuedAt) <= MAX_QUEUE_AGE_MS);
  const kept = fresh.slice(-MAX_QUEUE_ENTRIES);
  const dropped = state.entries.length - kept.length;
  if (dropped > 0) {
    state.droppedCount = (state.droppedCount || 0) + dropped;
    console.error(`[NotificationQueue] 오래되었거나 한도를 넘은 알림 ${dropped}건을 큐에서 버렸습니다.`);
  }
  state.entries = kept;
};

/** Appends all entries in one write; throws when they could not be persisted. */
export const enqueueNotifications = (
  entries: NewQueuedNotification[],
  now: Date = new Date(),
): QueuedNotification[] => {
  if (!entries.length) return [];
  const state = loadNotificationQueue();
  const queued = entries.map(({ ownerId, content, embeds, immediate, order }): QueuedNotification => ({
    id: `${now.getTime()}-${process.pid}-${(sequence += 1)}`,
    ownerId,
    content,
    embeds,
    enqueuedAt: now.toISOString(),
    attempts: 0,
    ...(order !== undefined ? { order } : {}),
    ...(immediate ? { immediate: true as const } : {}),
  }));
  state.entries.push(...queued);
  prune(state, now);
  save(state);
  return queued;
};

export const markNotificationsDelivered = (ids: string[], now: Date = new Date()): void => {
  const remove = new Set(ids);
  const state = loadNotificationQueue();
  state.entries = state.entries.filter((entry) => !remove.has(entry.id));
  state.lastDeliveredAt = now.toISOString();
  save(state);
};

export const retryDelayMs = (attempts: number): number =>
  Math.min(MAX_RETRY_DELAY_MS, 60_000 * 2 ** Math.max(0, attempts - 1));

export const markNotificationsFailed = (ids: string[], error: string, now: Date = new Date()): void => {
  const failed = new Set(ids);
  const state = loadNotificationQueue();
  for (const entry of state.entries) {
    if (!failed.has(entry.id)) continue;
    entry.attempts += 1;
    entry.lastError = error.slice(0, 200);
    entry.nextAttemptAt = new Date(now.getTime() + retryDelayMs(entry.attempts)).toISOString();
  }
  state.lastFailureAt = now.toISOString();
  state.lastError = error.slice(0, 200);
  save(state);
};

/** Test helper: clears the in-memory queue between tests. */
export const resetNotificationQueueForTest = (): void => {
  delete memory[MEMORY_KEY];
};
