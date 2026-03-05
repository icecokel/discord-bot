import { readJson, writeJson } from "./file-manager";

const FILE_NAME = "news-alert-channels.json";
const LEGACY_FILE_NAME = "news_alert_channels.json";
const DEFAULT_SCHEDULE_HOUR = 8;
const DEFAULT_SCHEDULE_MINUTE = 0;

export interface NewsAlertChannel {
  channelId: string;
  guildId: string;
  enabledAt: number;
  updatedAt: number;
  updatedBy?: string;
  scheduleHour: number;
  scheduleMinute: number;
  lastDispatchedKey?: string;
  lastDispatchedAt?: number;
}

export interface NewsAlertChannelMap {
  [channelId: string]: NewsAlertChannel;
}

const loadData = (): NewsAlertChannelMap => {
  const primary = readJson<Record<string, any>>(FILE_NAME, {});
  if (Object.keys(primary).length > 0) {
    return normalizeData(primary);
  }

  const legacy = readJson<Record<string, any>>(LEGACY_FILE_NAME, {});
  return normalizeData(legacy);
};

const saveData = (data: NewsAlertChannelMap): void => {
  writeJson(FILE_NAME, data);
};

const normalizeScheduleHour = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 23) {
    return DEFAULT_SCHEDULE_HOUR;
  }
  return parsed;
};

const normalizeScheduleMinute = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 59) {
    return DEFAULT_SCHEDULE_MINUTE;
  }
  return parsed;
};

const normalizeData = (raw: Record<string, any>): NewsAlertChannelMap => {
  const now = Date.now();
  const normalized: NewsAlertChannelMap = {};

  for (const [key, item] of Object.entries(raw || {})) {
    if (!item || typeof item !== "object") continue;

    const channelId =
      typeof item.channelId === "string" && item.channelId.length > 0
        ? item.channelId
        : key;
    const guildId =
      typeof item.guildId === "string" && item.guildId.length > 0
        ? item.guildId
        : "";
    if (!channelId || !guildId) continue;

    const enabledAt =
      typeof item.enabledAt === "number" && Number.isFinite(item.enabledAt)
        ? item.enabledAt
        : now;
    const updatedAt =
      typeof item.updatedAt === "number" && Number.isFinite(item.updatedAt)
        ? item.updatedAt
        : enabledAt;

    normalized[channelId] = {
      channelId,
      guildId,
      enabledAt,
      updatedAt,
      updatedBy:
        typeof item.updatedBy === "string" && item.updatedBy.length > 0
          ? item.updatedBy
          : undefined,
      scheduleHour: normalizeScheduleHour(item.scheduleHour),
      scheduleMinute: normalizeScheduleMinute(item.scheduleMinute),
      lastDispatchedKey:
        typeof item.lastDispatchedKey === "string" ? item.lastDispatchedKey : undefined,
      lastDispatchedAt:
        typeof item.lastDispatchedAt === "number" ? item.lastDispatchedAt : undefined,
    };
  }

  return normalized;
};

export interface NewsAlertChannelUpsertOptions {
  updatedBy?: string;
  scheduleHour?: number;
  scheduleMinute?: number;
}

export const enableNewsAlertChannel = (
  channelId: string,
  guildId: string,
  options: NewsAlertChannelUpsertOptions = {},
): NewsAlertChannel => {
  const data = loadData();
  const now = Date.now();
  const previous = data[channelId];

  const record: NewsAlertChannel = {
    channelId,
    guildId,
    enabledAt: previous?.enabledAt || now,
    updatedAt: now,
    updatedBy: options.updatedBy,
    scheduleHour: normalizeScheduleHour(
      options.scheduleHour ?? previous?.scheduleHour,
    ),
    scheduleMinute: normalizeScheduleMinute(
      options.scheduleMinute ?? previous?.scheduleMinute,
    ),
    lastDispatchedKey: previous?.lastDispatchedKey,
    lastDispatchedAt: previous?.lastDispatchedAt,
  };

  data[channelId] = record;
  saveData(data);
  return record;
};

export const disableNewsAlertChannel = (channelId: string): boolean => {
  const data = loadData();
  if (!data[channelId]) {
    return false;
  }
  delete data[channelId];
  saveData(data);
  return true;
};

export const isNewsAlertChannelEnabled = (channelId: string): boolean => {
  const data = loadData();
  return Boolean(data[channelId]);
};

export const getNewsAlertChannel = (
  channelId: string,
): NewsAlertChannel | null => {
  const data = loadData();
  return data[channelId] || null;
};

export const getEnabledNewsAlertChannels = (): NewsAlertChannel[] => {
  const data = loadData();
  return Object.values(data).sort((a, b) => a.enabledAt - b.enabledAt);
};

export const getEnabledNewsAlertChannelsByGuild = (
  guildId: string,
): NewsAlertChannel[] => {
  return getEnabledNewsAlertChannels().filter((item) => item.guildId === guildId);
};

export const setNewsAlertChannelLastDispatched = (
  channelId: string,
  dispatchedKey: string,
): boolean => {
  const data = loadData();
  const target = data[channelId];
  if (!target) return false;

  target.lastDispatchedKey = dispatchedKey;
  target.lastDispatchedAt = Date.now();
  data[channelId] = target;
  saveData(data);
  return true;
};

export const DEFAULT_NEWS_ALERT_SCHEDULE = {
  hour: DEFAULT_SCHEDULE_HOUR,
  minute: DEFAULT_SCHEDULE_MINUTE,
};
