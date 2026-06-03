export interface ConversationTurn {
  user: string;
  assistant: string;
}

export interface ConversationContext {
  summary: string;
  turns: ConversationTurn[];
}

export const CONVERSATION_COMPRESSION_TURN_COUNT = 10;
const conversationContexts = new Map<string, ConversationContext>();

const getContextKey = (userId: string, channelId: string): string => {
  return `${userId}:${channelId}`;
};

export const appendConversationTurn = (
  userId: string,
  channelId: string,
  turn: ConversationTurn,
): void => {
  const key = getContextKey(userId, channelId);
  const context = conversationContexts.get(key) || { summary: "", turns: [] };
  const turns = [...context.turns, turn].slice(
    -CONVERSATION_COMPRESSION_TURN_COUNT,
  );
  conversationContexts.set(key, { ...context, turns });
};

export const getConversationContext = (
  userId: string,
  channelId: string,
): ConversationContext => {
  const context = conversationContexts.get(getContextKey(userId, channelId));
  return {
    summary: context?.summary || "",
    turns: [...(context?.turns || [])],
  };
};

export const getConversationTurns = (
  userId: string,
  channelId: string,
): ConversationTurn[] => {
  return getConversationContext(userId, channelId).turns;
};

export const buildConversationPrompt = (
  userId: string,
  channelId: string,
  currentMessage: string,
): string => {
  const context = getConversationContext(userId, channelId);
  if (!context.summary && context.turns.length === 0) return currentMessage;

  const parts: string[] = [];

  if (context.summary) {
    parts.push(`요약된 이전 대화:\n${context.summary}`);
  }

  if (context.turns.length > 0) {
    const recentTurns = context.turns
      .map((turn) => `사용자: ${turn.user}\n비서: ${turn.assistant}`)
      .join("\n\n");
    parts.push(`최근 대화:\n${recentTurns}`);
  }

  parts.push(`현재 사용자 메시지:\n${currentMessage}`);
  return parts.join("\n\n");
};

export const replaceConversationWithSummary = (
  userId: string,
  channelId: string,
  summary: string,
): void => {
  conversationContexts.set(getContextKey(userId, channelId), {
    summary,
    turns: [],
  });
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
