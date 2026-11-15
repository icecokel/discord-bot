import { readJson, writeJson } from "../utils/file-manager";

interface ConversationTurn {
  user: string;
  assistant: string;
}

export type ConversationEntry =
  | { type: "turn"; user: string; assistant: string; at: string }
  /** A scheduled or manual notification the bot sent into this DM. */
  | { type: "notification"; content: string; at: string };

interface ConversationContext {
  entries: ConversationEntry[];
}

interface StoredConversations {
  version: 1;
  conversations: Record<string, ConversationContext>;
}

const FILE_NAME = "admin-conversation-history.json";

// Kept large on purpose: the admin Claude is the core of the bot and should remember the day.
// Roughly 40k characters is ~30k tokens per request; trimming drops the oldest entries first.
export const ADMIN_CONVERSATION_MAX_ENTRIES = 40;
export const ADMIN_CONVERSATION_MAX_CHARS = 40_000;
export const ADMIN_CONVERSATION_MAX_ENTRY_CHARS = 6_000;

let contexts: Map<string, ConversationContext> | null = null;

// Jest runs many suites that reach this store indirectly; keep them off the real data file.
// Persistence tests mock file-manager and opt in explicitly.
const shouldPersist = (): boolean =>
  process.env.NODE_ENV !== "test" || process.env.ADMIN_CONVERSATION_PERSIST === "true";

const isEntry = (value: unknown): value is ConversationEntry => {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  if (typeof entry.at !== "string") return false;
  if (entry.type === "turn") return typeof entry.user === "string" && typeof entry.assistant === "string";
  return entry.type === "notification" && typeof entry.content === "string";
};

const load = (): Map<string, ConversationContext> => {
  if (contexts) return contexts;
  contexts = new Map();
  if (!shouldPersist()) return contexts;
  try {
    const data = readJson<StoredConversations | null>(FILE_NAME, null);
    if (data && data.version === 1 && data.conversations && typeof data.conversations === "object") {
      for (const [key, context] of Object.entries(data.conversations)) {
        const entries = Array.isArray(context?.entries) ? context.entries.filter(isEntry) : [];
        if (entries.length) contexts.set(key, { entries });
      }
    }
  } catch (error) {
    // file-manager already kept a .corrupt copy; losing memory must not stop the bot from answering.
    console.error("[AdminConversation] 대화 기억을 불러오지 못해 빈 상태로 시작합니다.");
  }
  return contexts;
};

const save = (): void => {
  if (!shouldPersist() || !contexts) return;
  const data: StoredConversations = {
    version: 1,
    conversations: Object.fromEntries(contexts.entries()),
  };
  if (!writeJson(FILE_NAME, data)) {
    console.error("[AdminConversation] 대화 기억 저장에 실패했습니다.");
  }
};

const getContextKey = (userId: string, channelId: string): string => {
  return `${userId}:${channelId}`;
};

const clip = (text: string): string =>
  text.length > ADMIN_CONVERSATION_MAX_ENTRY_CHARS
    ? `${text.slice(0, ADMIN_CONVERSATION_MAX_ENTRY_CHARS)}…(생략)`
    : text;

const entryLength = (entry: ConversationEntry): number =>
  entry.type === "turn" ? entry.user.length + entry.assistant.length : entry.content.length;

export const trimConversationEntries = (entries: ConversationEntry[]): ConversationEntry[] => {
  const kept = entries.slice(-ADMIN_CONVERSATION_MAX_ENTRIES);
  let total = kept.reduce((sum, entry) => sum + entryLength(entry), 0);
  while (kept.length > 1 && total > ADMIN_CONVERSATION_MAX_CHARS) {
    total -= entryLength(kept.shift()!);
  }
  return kept;
};

const appendEntry = (userId: string, channelId: string, entry: ConversationEntry): void => {
  const all = load();
  const key = getContextKey(userId, channelId);
  const context = all.get(key) || { entries: [] };
  context.entries = trimConversationEntries([...context.entries, entry]);
  all.set(key, context);
  save();
};

export const appendAdminConversationTurn = (
  userId: string,
  channelId: string,
  turn: ConversationTurn,
  now: Date = new Date(),
): void => {
  appendEntry(userId, channelId, {
    type: "turn",
    user: clip(turn.user),
    assistant: clip(turn.assistant),
    at: now.toISOString(),
  });
};

/** Records a message the bot sent on its own (schedules, monitors) so later questions can refer to it. */
export const appendAdminNotification = (
  userId: string,
  channelId: string,
  content: string,
  now: Date = new Date(),
): void => {
  const text = content.trim();
  if (!text) return;
  appendEntry(userId, channelId, { type: "notification", content: clip(text), at: now.toISOString() });
};

export const getAdminConversationEntries = (
  userId: string,
  channelId: string,
): ConversationEntry[] => {
  return [...(load().get(getContextKey(userId, channelId))?.entries || [])];
};

export const getAdminConversationTurns = (
  userId: string,
  channelId: string,
): ConversationTurn[] => {
  return getAdminConversationEntries(userId, channelId)
    .filter((entry): entry is Extract<ConversationEntry, { type: "turn" }> => entry.type === "turn")
    .map(({ user, assistant }) => ({ user, assistant }));
};

const formatKst = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
};

export const buildAdminConversationPrompt = (
  userId: string,
  channelId: string,
  currentMessage: string,
  assistantLabel = "AI",
): string => {
  const entries = getAdminConversationEntries(userId, channelId);
  if (entries.length === 0) return currentMessage;

  const recentConversation = entries
    .map((entry) => {
      const time = `[${formatKst(entry.at)}]`;
      return entry.type === "turn"
        ? `${time} 관리자: ${entry.user}\n${time} ${assistantLabel}: ${entry.assistant}`
        : `${time} 봇 알림(자동 발송): ${entry.content}`;
    })
    .join("\n\n");

  return [
    "관리자 최근 대화 (오래된 순, 시각은 KST, '봇 알림'은 봇이 스케줄에 따라 먼저 보낸 메시지):",
    recentConversation,
    "",
    "현재 관리자 메시지:",
    currentMessage,
  ].join("\n");
};

export const clearAdminConversationContext = (
  userId: string,
  channelId: string,
): boolean => {
  const removed = load().delete(getContextKey(userId, channelId));
  if (removed) save();
  return removed;
};

export const clearAllAdminConversationContexts = (): void => {
  load().clear();
  save();
};

/** Test helper: forget the in-memory copy so the next access reloads from storage. */
export const resetAdminConversationCacheForTest = (): void => {
  contexts = null;
};
