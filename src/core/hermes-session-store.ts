import { randomUUID } from "node:crypto";

const sessionNames = new Map<string, string>();

const getSessionKey = (userId: string, channelId: string): string => {
  return `${userId}:${channelId}`;
};

const sanitizeSessionPart = (value: string): string => {
  return value.replace(/[^a-zA-Z0-9.-]/g, "-");
};

const createSessionName = (userId: string, channelId: string): string => {
  return [
    "discord-admin",
    sanitizeSessionPart(userId),
    sanitizeSessionPart(channelId),
    randomUUID(),
  ].join("-");
};

export const getHermesSessionName = (
  userId: string,
  channelId: string,
): string => {
  const key = getSessionKey(userId, channelId);
  const existing = sessionNames.get(key);
  if (existing) return existing;

  const sessionName = createSessionName(userId, channelId);
  sessionNames.set(key, sessionName);
  return sessionName;
};

export const resetHermesSession = (
  userId: string,
  channelId: string,
): boolean => {
  return sessionNames.delete(getSessionKey(userId, channelId));
};

export const clearAllHermesSessions = (): void => {
  sessionNames.clear();
};
