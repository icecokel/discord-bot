import { readJson, writeJson } from "./file-manager";

const FILE_NAME = "gmail-monitor-history.json";

export interface GmailMonitorState {
  version: 1;
  address: string;
  mailbox: string;
  query: string;
  uidValidity: string;
  lastUid: number;
  initializedAt: string;
  lastCheckedAt: string;
  lastNotifiedAt?: string;
}

const isDate = (value: unknown): value is string =>
  typeof value === "string" && Number.isFinite(Date.parse(value));

export const loadGmailMonitorState = (): GmailMonitorState | null => {
  const missing = {};
  const data = readJson<GmailMonitorState>(FILE_NAME, missing as GmailMonitorState);
  if (data === missing) return null;
  if (
    !data ||
    data.version !== 1 ||
    typeof data.address !== "string" ||
    typeof data.mailbox !== "string" ||
    typeof data.query !== "string" ||
    typeof data.uidValidity !== "string" ||
    !/^\d+$/.test(data.uidValidity) ||
    !Number.isInteger(data.lastUid) ||
    data.lastUid < 0 ||
    !isDate(data.initializedAt) ||
    !isDate(data.lastCheckedAt) ||
    (data.lastNotifiedAt !== undefined && !isDate(data.lastNotifiedAt))
  ) {
    throw new Error("Gmail 감시 이력 형식이 올바르지 않습니다.");
  }
  return data;
};

export const saveGmailMonitorState = (state: GmailMonitorState): void => {
  if (!writeJson(FILE_NAME, state)) {
    throw new Error("Gmail 감시 이력 저장에 실패했습니다.");
  }
};
