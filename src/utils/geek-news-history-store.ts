import { readJson, writeJson } from "./file-manager";

const FILE_NAME = "geek-news-history.json";
const MAX_HISTORY_SIZE = 200;
const TRACKING_QUERY_PARAM_REGEX =
  /^(utm_[\w-]+|fbclid|gclid|mc_cid|mc_eid|ref|ref_src)$/i;

export interface GeekNewsHistoryEntry {
  url: string;
  title?: string;
  savedAt: number;
}

interface GeekNewsHistoryData {
  entries: GeekNewsHistoryEntry[];
}

interface RawGeekNewsHistoryEntry {
  url?: unknown;
  title?: unknown;
  savedAt?: unknown;
}

const sortSearchParams = (url: URL): void => {
  const params = Array.from(url.searchParams.entries())
    .filter(([key]) => !TRACKING_QUERY_PARAM_REGEX.test(key))
    .sort(([keyA, valueA], [keyB, valueB]) => {
      if (keyA === keyB) {
        return valueA.localeCompare(valueB);
      }
      return keyA.localeCompare(keyB);
    });

  url.search = "";
  for (const [key, value] of params) {
    url.searchParams.append(key, value);
  }
};

export const normalizeGeekNewsHistoryUrl = (rawUrl: string): string => {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const url = new URL(trimmed);
    url.hash = "";
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();

    if (
      (url.protocol === "https:" && url.port === "443") ||
      (url.protocol === "http:" && url.port === "80")
    ) {
      url.port = "";
    }

    sortSearchParams(url);

    if (url.pathname !== "/") {
      url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    }

    return url.toString();
  } catch {
    return trimmed;
  }
};

const normalizeEntry = (
  entry: RawGeekNewsHistoryEntry,
): GeekNewsHistoryEntry | null => {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const url =
    typeof entry.url === "string" ? normalizeGeekNewsHistoryUrl(entry.url) : "";
  if (!url) {
    return null;
  }

  return {
    url,
    title:
      typeof entry.title === "string" && entry.title.trim().length > 0
        ? entry.title.trim()
        : undefined,
    savedAt:
      typeof entry.savedAt === "number" && Number.isFinite(entry.savedAt)
        ? entry.savedAt
        : Date.now(),
  };
};

const loadData = (): GeekNewsHistoryData => {
  const raw = readJson<Record<string, unknown> | RawGeekNewsHistoryEntry[]>(
    FILE_NAME,
    { entries: [] },
  );

  const rawEntries = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.entries)
      ? raw.entries
      : [];

  const deduped = new Map<string, GeekNewsHistoryEntry>();
  for (const item of rawEntries) {
    const normalized = normalizeEntry(item as RawGeekNewsHistoryEntry);
    if (!normalized) {
      continue;
    }
    deduped.set(normalized.url, normalized);
  }

  const entries = Array.from(deduped.values())
    .sort((a, b) => a.savedAt - b.savedAt)
    .slice(-MAX_HISTORY_SIZE);

  return { entries };
};

const saveData = (data: GeekNewsHistoryData): void => {
  writeJson(FILE_NAME, data);
};

export const getTrackedGeekNewsUrls = (): Set<string> => {
  return new Set(loadData().entries.map((entry) => entry.url));
};

export const hasTrackedGeekNewsUrl = (url: string): boolean => {
  const normalized = normalizeGeekNewsHistoryUrl(url);
  if (!normalized) {
    return false;
  }

  return getTrackedGeekNewsUrls().has(normalized);
};

export const trackGeekNewsUrl = (
  url: string,
  options: { title?: string } = {},
): GeekNewsHistoryEntry | null => {
  const normalized = normalizeGeekNewsHistoryUrl(url);
  if (!normalized) {
    return null;
  }

  const data = loadData();
  const entries = data.entries.filter((entry) => entry.url !== normalized);
  const record: GeekNewsHistoryEntry = {
    url: normalized,
    title:
      typeof options.title === "string" && options.title.trim().length > 0
        ? options.title.trim()
        : undefined,
    savedAt: Date.now(),
  };

  entries.push(record);

  saveData({
    entries: entries.slice(-MAX_HISTORY_SIZE),
  });

  return record;
};
