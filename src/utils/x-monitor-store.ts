import { readJson, writeJson } from "./file-manager";

export const X_ACCOUNT = "thsottiaux";
export const xPostUrl = (id: string): string =>
  `https://x.com/${X_ACCOUNT}/status/${id}`;

export interface XPost {
  id: string;
  url: string;
  text: string;
  textComplete: boolean;
  observedAt: string;
  publishedAt?: string;
  translatedText?: string;
  sentParts?: number;
}

export interface XMonitorState {
  version: 1;
  account: typeof X_ACCOUNT;
  initializedAt: string;
  baselineMaxId: string;
  lastCompleteMaxId: string;
  notifiedIds: string[];
  pending: XPost[];
}

const FILE_NAME = "x-profile-history.json";
const isId = (value: unknown): value is string =>
  typeof value === "string" && /^[1-9]\d{0,19}$/.test(value);
const isDate = (value: unknown): value is string =>
  typeof value === "string" && Number.isFinite(Date.parse(value));

export const isXPost = (value: unknown): value is XPost => {
  if (!value || typeof value !== "object") return false;
  const post = value as XPost;
  return isId(post.id) && post.url === xPostUrl(post.id) &&
    typeof post.text === "string" && post.text.length <= 100_000 &&
    typeof post.textComplete === "boolean" && isDate(post.observedAt) &&
    (post.publishedAt === undefined || isDate(post.publishedAt)) &&
    (post.translatedText === undefined || (typeof post.translatedText === "string" &&
      post.translatedText.length <= 200_000 && /[가-힣]/.test(post.translatedText))) &&
    (post.sentParts === undefined || (Number.isInteger(post.sentParts) && post.sentParts >= 0 &&
      post.sentParts <= 1000 && (post.sentParts === 0 || post.translatedText !== undefined)));
};

export const loadXMonitorState = (): XMonitorState | null => {
  const missing = {};
  const data = readJson<XMonitorState>(FILE_NAME, missing as XMonitorState);
  if (data === missing) return null;
  if (!data || data.version !== 1 || data.account !== X_ACCOUNT ||
      !isDate(data.initializedAt) || !isId(data.baselineMaxId) ||
      !isId(data.lastCompleteMaxId) ||
      !Array.isArray(data.notifiedIds) || !data.notifiedIds.every(isId) ||
      !Array.isArray(data.pending) || !data.pending.every(isXPost) ||
      new Set(data.notifiedIds).size !== data.notifiedIds.length ||
      new Set(data.pending.map((post) => post.id)).size !== data.pending.length ||
      data.pending.some((post) => data.notifiedIds.includes(post.id))) {
    throw new Error("X 감시 이력 형식이 올바르지 않습니다.");
  }
  return data;
};

export const saveXMonitorState = (state: XMonitorState): void => {
  if (!writeJson(FILE_NAME, state)) {
    throw new Error("X 감시 이력 저장에 실패했습니다.");
  }
};
