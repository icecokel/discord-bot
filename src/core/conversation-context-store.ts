export interface ConversationTurn {
  user: string;
  assistant: string;
}

const MAX_TURNS = 8;
const conversationContexts = new Map<string, ConversationTurn[]>();

const getContextKey = (userId: string, channelId: string): string => {
  return `${userId}:${channelId}`;
};

export const appendConversationTurn = (
  userId: string,
  channelId: string,
  turn: ConversationTurn,
): void => {
  const key = getContextKey(userId, channelId);
  const turns = conversationContexts.get(key) || [];
  turns.push(turn);
  conversationContexts.set(key, turns.slice(-MAX_TURNS));
};

export const getConversationTurns = (
  userId: string,
  channelId: string,
): ConversationTurn[] => {
  const key = getContextKey(userId, channelId);
  return [...(conversationContexts.get(key) || [])];
};

export const buildConversationPrompt = (
  userId: string,
  channelId: string,
  currentMessage: string,
): string => {
  const turns = getConversationTurns(userId, channelId);
  if (turns.length === 0) return currentMessage;

  const context = turns
    .map((turn) => `사용자: ${turn.user}\n비서: ${turn.assistant}`)
    .join("\n\n");

  return `최근 대화:
${context}

현재 사용자 메시지:
${currentMessage}`;
};

export const clearConversationContext = (
  userId: string,
  channelId: string,
): boolean => {
  return conversationContexts.delete(getContextKey(userId, channelId));
};

export const clearAllConversationContexts = (): void => {
  conversationContexts.clear();
};
