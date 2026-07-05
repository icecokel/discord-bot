interface ConversationTurn {
  user: string;
  assistant: string;
}

interface ConversationContext {
  turns: ConversationTurn[];
}

export const ADMIN_CONVERSATION_TURN_COUNT = 10;

const contexts = new Map<string, ConversationContext>();

const getContextKey = (userId: string, channelId: string): string => {
  return `${userId}:${channelId}`;
};

export const appendAdminConversationTurn = (
  userId: string,
  channelId: string,
  turn: ConversationTurn,
): void => {
  const key = getContextKey(userId, channelId);
  const context = contexts.get(key) || { turns: [] };
  context.turns = [...context.turns, turn].slice(-ADMIN_CONVERSATION_TURN_COUNT);
  contexts.set(key, context);
};

export const getAdminConversationTurns = (
  userId: string,
  channelId: string,
): ConversationTurn[] => {
  return [...(contexts.get(getContextKey(userId, channelId))?.turns || [])];
};

export const buildAdminConversationPrompt = (
  userId: string,
  channelId: string,
  currentMessage: string,
  assistantLabel = "Hermes",
): string => {
  const turns = getAdminConversationTurns(userId, channelId);
  if (turns.length === 0) return currentMessage;

  const recentConversation = turns
    .map((turn) => `관리자: ${turn.user}\n${assistantLabel}: ${turn.assistant}`)
    .join("\n\n");

  return [
    "관리자 최근 대화:",
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
  return contexts.delete(getContextKey(userId, channelId));
};

export const clearAllAdminConversationContexts = (): void => {
  contexts.clear();
};
