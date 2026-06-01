import { NaturalLanguageIntent } from "./ai/intent-service";

export interface PendingAction {
  userId: string;
  intent: NaturalLanguageIntent;
  summary: string;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 3 * 60 * 1000;
const pendingActions = new Map<string, PendingAction>();

export const setPendingAction = (
  userId: string,
  intent: NaturalLanguageIntent,
  summary: string,
  ttlMs: number = DEFAULT_TTL_MS,
): PendingAction => {
  const action: PendingAction = {
    userId,
    intent,
    summary,
    expiresAt: Date.now() + ttlMs,
  };
  pendingActions.set(userId, action);
  return action;
};

export const getPendingAction = (userId: string): PendingAction | null => {
  const action = pendingActions.get(userId);
  if (!action) return null;

  if (Date.now() > action.expiresAt) {
    pendingActions.delete(userId);
    return null;
  }

  return action;
};

export const clearPendingAction = (userId: string): boolean => {
  return pendingActions.delete(userId);
};

export const consumePendingAction = (userId: string): PendingAction | null => {
  const action = getPendingAction(userId);
  if (!action) return null;
  pendingActions.delete(userId);
  return action;
};

export const clearAllPendingActions = (): void => {
  pendingActions.clear();
};
