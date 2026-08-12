import { Client, TextBasedChannel, EmbedBuilder } from "discord.js";
import * as dns from "node:dns";
import * as http from "node:http";
import * as https from "node:https";
import * as net from "node:net";
import { aiService } from "../../core/ai";
import {
  GeekNewsHistoryContent,
  getTrackedGeekNewsUrls,
  normalizeGeekNewsHistoryUrl,
  trackGeekNewsUrl,
} from "../../utils/geek-news-history-store";

export interface GeekNewsItem {
  rank: number;
  title: string;
  link: string;
  points: number;
  description: string;
  sourceUrl?: string;
  summary?: string;
  sourceContent?: string;
  translatedTitle?: string;
  translatedBody?: string;
  selectionReason?: string;
}

export interface GeekNewsFeaturedItemResult {
  status: "ok" | "fetch-failed" | "already-sent";
  item: GeekNewsItem | null;
  reason?: string;
}

interface GeekNewsListItemsResult {
  items: GeekNewsItem[];
  failureReason?: string;
}

interface GeekNewsSummary {
  rank: number;
  summary: string;
}

interface RawGeekNewsSummary {
  rank?: number | string;
  summary?: string;
}

interface GeekNewsTranslation {
  title: string;
  body: string;
  reason: string;
}

interface RawGeekNewsTranslation {
  title?: string;
  body?: string;
  reason?: string;
  translatedTitle?: string;
  translatedBody?: string;
  selectionReason?: string;
}

const GEEK_NEWS_URL = "https://news.hada.io/";
const TOPIC_ROW_REGEX =
  /<div class=['"]?topic_row['"]?[\s\S]*?<\/div>\s*(?=<div class=['"]?topic_row['"]?|<div class=['"]?next)/g;
const ARTICLE_BLOCK_REGEXES = [
  /<article\b[^>]*>[\s\S]*?<\/article>/gi,
  /<main\b[^>]*>[\s\S]*?<\/main>/gi,
  /<(?:section|div)\b[^>]*(?:id|class)=['"][^'"]*(?:article|content|entry|post|story|main|body)[^'"]*['"][^>]*>[\s\S]{200,}?<\/(?:section|div)>/gi,
];

const MAX_SUMMARY_LENGTH = 160;
const MAX_SOURCE_CONTENT_LENGTH = 12000;
const MAX_TRANSLATION_PROMPT_SOURCE_LENGTH = 6000;
const MAX_TRANSLATION_RETRY_SOURCE_LENGTH = 2500;
const MAX_EMBED_DESCRIPTION_LENGTH = 3800;
const MAX_EMBED_COUNT = 8;
const FEATURED_CANDIDATE_LIMIT = 20;
const GEEK_NEWS_REQUEST_TIMEOUT_MS = 20_000;
const MAX_GEEK_NEWS_LIST_BYTES = 1_000_000;
const MAX_GEEK_NEWS_ARTICLE_BYTES = 2_000_000;
const MAX_ARTICLE_REDIRECTS = 5;
const HANGUL_REGEX = /[가-힣]/;
const NON_KOREAN_FALLBACK_SUMMARY =
  "한국어 요약을 생성하지 못했습니다. 링크에서 원문을 확인해주세요.";
const NON_KOREAN_FALLBACK_TRANSLATION =
  "한국어 번역을 생성하지 못했습니다. 링크에서 원문을 확인해주세요.";
const GEEK_NEWS_FETCH_FAILED_MESSAGE =
  "긱뉴스 메인 페이지 목록 조회에 실패했습니다. news.hada.io 응답 오류 또는 네트워크 문제일 수 있습니다. 잠시 후 다시 시도해주세요.";
const GEEK_NEWS_PARSE_FAILED_MESSAGE =
  "긱뉴스 메인 페이지는 열렸지만 기사 항목을 찾지 못했습니다. 사이트 화면 구조가 바뀌었을 수 있습니다. 잠시 후 다시 시도해주세요.";
const GEEK_NEWS_ALREADY_SENT_MESSAGE =
  "이번 회차는 새로 보낼 긱뉴스 기사가 없습니다. 현재 상단 후보는 모두 이미 발송한 기사입니다.";
const GEEK_NEWS_AI_FAILED_MESSAGE =
  "긱뉴스 Codex 번역에 실패했습니다. Codex 상태를 확인한 뒤 다시 시도해주세요.";

const blockedIpv4 = new net.BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blockedIpv4.addSubnet(network, prefix, "ipv4");
}

const blockedIpv6 = new net.BlockList();
for (const [network, prefix] of [
  ["::", 96],
  ["::ffff:0.0.0.0", 96],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
] as const) {
  blockedIpv6.addSubnet(network, prefix, "ipv6");
}

class UnsafeGeekNewsUrlError extends Error {}

const stripIpv6Brackets = (hostname: string): string =>
  hostname.replace(/^\[|\]$/g, "");

const isPublicIpAddress = (address: string): boolean => {
  const family = net.isIP(address);
  if (family === 4) return !blockedIpv4.check(address, "ipv4");
  if (family === 6) return !blockedIpv6.check(address, "ipv6");
  return false;
};

const parsePublicHttpUrl = (rawUrl: string): URL => {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeGeekNewsUrlError("유효하지 않은 기사 URL입니다.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeGeekNewsUrlError("HTTP(S)가 아닌 기사 URL은 허용하지 않습니다.");
  }
  if (url.username || url.password) {
    throw new UnsafeGeekNewsUrlError("인증 정보가 포함된 기사 URL은 허용하지 않습니다.");
  }

  const hostname = stripIpv6Brackets(url.hostname)
    .toLowerCase()
    .replace(/\.$/, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new UnsafeGeekNewsUrlError("로컬 주소는 기사 URL로 허용하지 않습니다.");
  }

  const family = net.isIP(hostname);
  if (family && !isPublicIpAddress(hostname)) {
    throw new UnsafeGeekNewsUrlError("사설 또는 예약 주소는 기사 URL로 허용하지 않습니다.");
  }

  return url;
};

const raceWithSignal = async <T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> => {
  if (signal.aborted) throw signal.reason;

  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", abort);
    });
  });
};

const resolvePublicAddress = async (
  url: URL,
  signal: AbortSignal,
): Promise<{ address: string; family: 4 | 6 }> => {
  const hostname = stripIpv6Brackets(url.hostname);
  const directFamily = net.isIP(hostname);
  const addresses = directFamily
    ? [{ address: hostname, family: directFamily as 4 | 6 }]
    : await raceWithSignal(
        dns.promises.lookup(hostname, { all: true, verbatim: true }),
        signal,
      );

  if (addresses.length === 0) {
    throw new Error("기사 호스트의 IP 주소를 찾지 못했습니다.");
  }
  if (addresses.some(({ address }) => !isPublicIpAddress(address))) {
    throw new UnsafeGeekNewsUrlError(
      "사설 또는 예약 주소로 연결되는 기사 URL은 허용하지 않습니다.",
    );
  }

  return addresses[0] as { address: string; family: 4 | 6 };
};

const assertContentLength = (
  value: string | string[] | null | undefined,
  maxBytes: number,
): void => {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return;
  const length = Number(raw);
  if (Number.isFinite(length) && length > maxBytes) {
    throw new Error(`응답 본문이 ${maxBytes}바이트 제한을 초과했습니다.`);
  }
};

const readLimitedFetchText = async (
  response: Response,
  maxBytes: number,
): Promise<string> => {
  assertContentLength(response.headers?.get?.("content-length"), maxBytes);

  const reader = response.body?.getReader?.();
  if (!reader) {
    const text = await response.text();
    if (Buffer.byteLength(text) > maxBytes) {
      throw new Error(`응답 본문이 ${maxBytes}바이트 제한을 초과했습니다.`);
    }
    return text;
  }

  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new Error(`응답 본문이 ${maxBytes}바이트 제한을 초과했습니다.`);
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks).toString("utf8");
};

const requestArticlePage = async (
  url: URL,
  address: { address: string; family: 4 | 6 },
  signal: AbortSignal,
): Promise<
  | { type: "redirect"; location: string }
  | { type: "success"; html: string }
> =>
  new Promise((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    const request = transport.request(
      url,
      {
        method: "GET",
        headers: {
          "User-Agent": "discord-bot/1.0 (+https://news.hada.io/)",
          Accept: "text/html,application/xhtml+xml",
        },
        signal,
        lookup: (_hostname: string, options: any, callback?: any) => {
          const done = typeof options === "function" ? options : callback;
          if (typeof options !== "function" && options.all) {
            done(null, [address]);
            return;
          }
          done(null, address.address, address.family);
        },
      },
      (response) => {
        const status = response.statusCode || 0;
        const location = response.headers.location;
        if ([301, 302, 303, 307, 308].includes(status) && location) {
          response.destroy();
          resolve({ type: "redirect", location });
          return;
        }
        if (status < 200 || status >= 300) {
          response.destroy();
          reject(new Error(`Article HTTP ${status}`));
          return;
        }

        try {
          assertContentLength(
            response.headers["content-length"],
            MAX_GEEK_NEWS_ARTICLE_BYTES,
          );
        } catch (error) {
          response.destroy();
          reject(error);
          return;
        }

        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer | string) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          size += buffer.length;
          if (size > MAX_GEEK_NEWS_ARTICLE_BYTES) {
            response.destroy(
              new Error(
                `응답 본문이 ${MAX_GEEK_NEWS_ARTICLE_BYTES}바이트 제한을 초과했습니다.`,
              ),
            );
            return;
          }
          chunks.push(buffer);
        });
        response.once("end", () =>
          resolve({
            type: "success",
            html: Buffer.concat(chunks).toString("utf8"),
          }),
        );
        response.once("error", reject);
      },
    );
    request.once("error", reject);
    request.end();
  });

const fetchArticlePage = async (
  rawUrl: string,
): Promise<{ html: string; sourceUrl: string }> => {
  const signal = AbortSignal.timeout(GEEK_NEWS_REQUEST_TIMEOUT_MS);
  let currentUrl = parsePublicHttpUrl(rawUrl);

  for (let redirects = 0; redirects <= MAX_ARTICLE_REDIRECTS; redirects += 1) {
    const address = await resolvePublicAddress(currentUrl, signal);
    const result = await requestArticlePage(currentUrl, address, signal);
    if (result.type === "success") {
      return { html: result.html, sourceUrl: currentUrl.toString() };
    }
    if (redirects === MAX_ARTICLE_REDIRECTS) {
      throw new Error("기사 리디렉션 횟수가 제한을 초과했습니다.");
    }
    currentUrl = parsePublicHttpUrl(
      new URL(result.location, currentUrl).toString(),
    );
  }

  throw new Error("기사 페이지를 불러오지 못했습니다.");
};

const normalizeWhitespace = (text: string): string =>
  text.replace(/\s+/g, " ").trim();

const normalizeMultilineWhitespace = (text: string): string =>
  text
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const decodeHtmlEntities = (text: string): string => {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
};

const formatGeekNewsFetchFailureReason = (error: unknown): string => {
  if (error instanceof Error) {
    const httpStatusMatch = error.message.match(/^GeekNews HTTP (\d{3})$/);
    if (httpStatusMatch) {
      return `긱뉴스 메인 페이지 목록 조회에 실패했습니다. news.hada.io가 HTTP ${httpStatusMatch[1]} 상태로 응답했습니다. 잠시 후 다시 시도해주세요.`;
    }

    const normalizedMessage = error.message.trim();
    if (normalizedMessage) {
      return `긱뉴스 메인 페이지 목록 조회에 실패했습니다. 네트워크 또는 요청 처리 중 오류가 발생했습니다: ${normalizedMessage}. 잠시 후 다시 시도해주세요.`;
    }
  }

  return GEEK_NEWS_FETCH_FAILED_MESSAGE;
};

const formatGeekNewsAiFailureReason = (
  stage: "요약" | "번역",
  error: unknown,
): string => {
  const candidate = error as {
    killed?: boolean;
    signal?: string;
    message?: string;
  };

  if (candidate?.killed && candidate?.signal === "SIGTERM") {
    return `긱뉴스 Codex ${stage}에 실패했습니다. Codex 실행 시간이 초과되었습니다.`;
  }

  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  const firstLine = rawMessage
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) {
    return `긱뉴스 Codex ${stage}에 실패했습니다. Codex가 오류를 반환했습니다.`;
  }

  return `긱뉴스 Codex ${stage}에 실패했습니다: ${truncateText(firstLine, 500)}`;
};

const normalizeLink = (href: string): string => {
  try {
    return parsePublicHttpUrl(new URL(href, GEEK_NEWS_URL).toString()).toString();
  } catch {
    return "";
  }
};

const cleanText = (text: string): string =>
  normalizeWhitespace(decodeHtmlEntities(text.replace(/<[^>]*>/g, " ")));

const cleanDescriptionText = (text: string): string =>
  normalizeWhitespace(
    decodeHtmlEntities(text)
      .replace(/<[^>]*>/g, " ")
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/^#{1,6}\s*/gm, "")
      .replace(/^[*-]\s+/gm, "")
      .replace(/^\d+\.\s+/gm, ""),
  );

const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3).trimEnd()}...`;
};

const formatErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const extractFirstJsonObject = (text: string): string | null => {
  const start = text.indexOf("{");
  if (start < 0) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = inString;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return null;
};

const cleanSummaryText = (text: string): string =>
  truncateText(
    normalizeWhitespace(
      text
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/^#{1,6}\s*/gm, "")
        .replace(/^[*-]\s+/gm, "")
        .replace(/^\d+\.\s+/gm, ""),
    ),
    MAX_SUMMARY_LENGTH,
  );

const cleanTranslatedBodyText = (text: string): string =>
  normalizeMultilineWhitespace(
    decodeHtmlEntities(text)
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/^#{1,6}\s*/gm, ""),
  );

const cleanReasonText = (text: string): string =>
  truncateText(
    normalizeWhitespace(
      decodeHtmlEntities(text)
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/^#{1,6}\s*/gm, "")
        .replace(/^[*-]\s+/gm, "")
        .replace(/^\d+\.\s+/gm, ""),
    ),
    220,
  );

const cleanArticleHtmlToText = (html: string): string =>
  normalizeMultilineWhitespace(
    decodeHtmlEntities(
      html
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
        .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
        .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ")
        .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, " ")
        .replace(/<img\b[^>]*>/gi, " ")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n\n")
        .replace(/<\/div>/gi, "\n")
        .replace(/<\/section>/gi, "\n")
        .replace(/<\/article>/gi, "\n")
        .replace(/<\/main>/gi, "\n")
        .replace(/<\/li>/gi, "\n")
        .replace(/<\/blockquote>/gi, "\n\n")
        .replace(/<\/h[1-6]>/gi, "\n\n")
        .replace(/<li\b[^>]*>/gi, "- ")
        .replace(/<[^>]*>/g, " "),
    ),
  );

const splitTextByLength = (text: string, maxLength: number): string[] => {
  if (text.length <= maxLength) {
    return [text];
  }

  const parts: string[] = [];
  let remaining = text.trim();

  while (remaining.length > maxLength) {
    let splitIndex = remaining.lastIndexOf("\n", maxLength);
    if (splitIndex < Math.floor(maxLength * 0.6)) {
      splitIndex = remaining.lastIndexOf(" ", maxLength);
    }
    if (splitIndex < Math.floor(maxLength * 0.6)) {
      splitIndex = maxLength;
    }

    parts.push(remaining.slice(0, splitIndex).trim());
    remaining = remaining.slice(splitIndex).trim();
  }

  if (remaining) {
    parts.push(remaining);
  }

  return parts;
};

const splitTextIntoChunks = (text: string, maxLength: number): string[] => {
  const normalized = cleanTranslatedBodyText(text);
  if (!normalized) {
    return [];
  }

  const paragraphs = normalized.split(/\n{2,}/).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  const pushCurrent = () => {
    if (current.trim()) {
      chunks.push(current.trim());
      current = "";
    }
  };

  for (const paragraph of paragraphs) {
    const pieces = splitTextByLength(paragraph, maxLength);
    for (const piece of pieces) {
      const candidate = current ? `${current}\n\n${piece}` : piece;
      if (candidate.length > maxLength) {
        pushCurrent();
        current = piece;
      } else {
        current = candidate;
      }
    }
  }

  pushCurrent();
  return chunks;
};

const uniqueTexts = (items: string[]): string[] => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const normalized = item.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });
};

export const pickUnreadGeekNewsItem = (
  items: GeekNewsItem[],
  trackedUrls: Iterable<string>,
): GeekNewsItem | null => {
  const trackedUrlSet = new Set(
    Array.from(trackedUrls)
      .map((item) => normalizeGeekNewsHistoryUrl(item))
      .filter(Boolean),
  );

  return (
    items.find((item) => {
      const candidates = [
        normalizeGeekNewsHistoryUrl(item.sourceUrl || ""),
        normalizeGeekNewsHistoryUrl(item.link),
      ].filter(Boolean);

      return candidates.every((candidate) => !trackedUrlSet.has(candidate));
    }) || null
  );
};

export const isKoreanSummary = (text: string): boolean =>
  HANGUL_REGEX.test(text);

export const buildGeekNewsFallbackSummary = (
  description: string,
  title: string,
): string => {
  const normalizedDescription = cleanDescriptionText(description);
  const normalizedTitle = cleanText(title);

  if (!normalizedDescription && !normalizedTitle) {
    return "요약 정보가 없습니다.";
  }

  const source = [normalizedDescription, normalizedTitle].find(
    (candidate) => candidate && isKoreanSummary(candidate),
  );

  if (!source) {
    return NON_KOREAN_FALLBACK_SUMMARY;
  }

  return truncateText(source, MAX_SUMMARY_LENGTH);
};

export const buildGeekNewsFallbackTranslation = (
  sourceContent: string,
  description: string,
  title: string,
): string => {
  const normalizedSourceContent = cleanTranslatedBodyText(sourceContent);
  const normalizedDescription = cleanDescriptionText(description);
  const normalizedTitle = cleanText(title);

  const source = [
    normalizedSourceContent,
    normalizedDescription,
    normalizedTitle,
  ].find((candidate) => candidate && isKoreanSummary(candidate));

  if (!source) {
    return NON_KOREAN_FALLBACK_TRANSLATION;
  }

  return source;
};

export const resolveGeekNewsSummary = (
  summary: string | undefined,
  description: string,
  title: string,
): string => {
  const normalizedSummary = summary ? cleanSummaryText(summary) : "";
  if (normalizedSummary && isKoreanSummary(normalizedSummary)) {
    return normalizedSummary;
  }

  return buildGeekNewsFallbackSummary(description, title);
};

export const resolveGeekNewsTranslatedTitle = (
  translatedTitle: string | undefined,
  originalTitle: string,
): string => {
  const normalizedTitle = translatedTitle ? cleanText(translatedTitle) : "";
  if (normalizedTitle && isKoreanSummary(normalizedTitle)) {
    return normalizedTitle;
  }

  return cleanText(originalTitle);
};

export const resolveGeekNewsTranslatedBody = (
  translatedBody: string | undefined,
  sourceContent: string,
  description: string,
  title: string,
): string => {
  const normalizedBody = translatedBody
    ? cleanTranslatedBodyText(translatedBody)
    : "";
  if (normalizedBody && isKoreanSummary(normalizedBody)) {
    return normalizedBody;
  }

  return buildGeekNewsFallbackTranslation(sourceContent, description, title);
};

export const buildGeekNewsFallbackSelectionReason = (
  item: Pick<GeekNewsItem, "rank" | "points" | "description" | "title">,
): string => {
  const baseReason = resolveGeekNewsSummary(
    undefined,
    item.description,
    item.title,
  );

  if (
    baseReason &&
    baseReason !== NON_KOREAN_FALLBACK_SUMMARY &&
    baseReason !== "요약 정보가 없습니다."
  ) {
    return truncateText(
      `${baseReason} 현재 긱뉴스 메인에서 ${item.rank}위, ${item.points}점을 기록한 상단 기사입니다.`,
      220,
    );
  }

  return `긱뉴스 메인에서 현재 ${item.rank}위, ${item.points}점을 기록한 상단 기사입니다.`;
};

export const resolveGeekNewsSelectionReason = (
  reason: string | undefined,
  item: Pick<GeekNewsItem, "rank" | "points" | "description" | "title">,
): string => {
  const normalizedReason = reason ? cleanReasonText(reason) : "";
  if (normalizedReason && isKoreanSummary(normalizedReason)) {
    return normalizedReason;
  }

  return buildGeekNewsFallbackSelectionReason(item);
};

export const parseGeekNewsSummaryResponse = (
  raw: string,
): GeekNewsSummary[] => {
  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }

  const jsonCandidate =
    trimmed.match(/\[[\s\S]*\]/)?.[0] ||
    trimmed.match(/\{[\s\S]*\}/)?.[0] ||
    trimmed;

  try {
    const parsed = JSON.parse(jsonCandidate);
    const items = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.items)
        ? parsed.items
        : Array.isArray(parsed.summaries)
          ? parsed.summaries
          : [];

    return (items as RawGeekNewsSummary[])
      .map((item: RawGeekNewsSummary) => {
        const rank = Number(item?.rank);
        const summary =
          typeof item?.summary === "string"
            ? cleanSummaryText(item.summary)
            : "";

        if (!Number.isFinite(rank) || rank <= 0 || !summary) {
          return null;
        }

        return { rank, summary };
      })
      .filter((item: GeekNewsSummary | null): item is GeekNewsSummary => item !== null);
  } catch {
    return [];
  }
};

export const parseGeekNewsTranslationResponse = (
  raw: string,
): GeekNewsTranslation | null => {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const jsonCandidate = extractFirstJsonObject(trimmed) || trimmed;

  try {
    const parsed = JSON.parse(jsonCandidate) as RawGeekNewsTranslation;
    const title =
      typeof parsed.title === "string"
        ? cleanText(parsed.title)
        : typeof parsed.translatedTitle === "string"
          ? cleanText(parsed.translatedTitle)
          : "";
    const body =
      typeof parsed.body === "string"
        ? cleanTranslatedBodyText(parsed.body)
        : typeof parsed.translatedBody === "string"
          ? cleanTranslatedBodyText(parsed.translatedBody)
          : "";
    const reason =
      typeof parsed.reason === "string"
        ? cleanReasonText(parsed.reason)
        : typeof parsed.selectionReason === "string"
          ? cleanReasonText(parsed.selectionReason)
          : "";

    if (!title && !body && !reason) {
      return null;
    }

    return { title, body, reason };
  } catch {
    return null;
  }
};

export const extractGeekNewsArticleText = (html: string): string => {
  const candidates: string[] = [];

  for (const regex of ARTICLE_BLOCK_REGEXES) {
    const matches = html.match(regex);
    if (!matches) {
      continue;
    }
    candidates.push(...matches.map((match) => cleanArticleHtmlToText(match)));
  }

  const paragraphText = uniqueTexts(
    Array.from(html.matchAll(/<(p|li|blockquote|h2|h3)\b[^>]*>([\s\S]*?)<\/\1>/gi))
      .map((match) => cleanArticleHtmlToText(match[2]))
      .filter((text) => text.length >= 40),
  ).join("\n\n");

  if (paragraphText) {
    candidates.push(paragraphText);
  }

  const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch?.[1]) {
    candidates.push(cleanArticleHtmlToText(bodyMatch[1]));
  }

  const best = uniqueTexts(
    candidates
      .map((text) => normalizeMultilineWhitespace(text))
      .filter((text) => text.length >= 100),
  ).sort((a, b) => b.length - a.length)[0];

  return best ? truncateText(best, MAX_SOURCE_CONTENT_LENGTH) : "";
};

export const parseGeekNewsTopItems = (
  html: string,
  limit: number = 5,
): GeekNewsItem[] => {
  const rows = html.match(TOPIC_ROW_REGEX) || [];
  const items: GeekNewsItem[] = [];

  for (const row of rows) {
    if (items.length >= limit) break;

    const rankMatch = row.match(/<div class=['"]?votenum['"]?>(\d+)<\/div>/);
    const titleLinkMatch = row.match(
      /<div\b[^>]*class=['"]?topictitle['"]?[^>]*>[\s\S]*?<a\b[^>]*href=['"]([^'"]+)['"][^>]*>\s*<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>\s*<\/a>/,
    );
    const descriptionMatch = row.match(
      /<div class=['"]topicdesc['"]>\s*<a [^>]*>([\s\S]*?)<\/a>\s*<\/div>/,
    );
    const pointsMatch = row.match(
      /<span id=['"]tp\d+['"]>(\d+)<\/span>\s*point(?:s)?\b/,
    );

    if (!rankMatch || !titleLinkMatch) {
      continue;
    }

    const rank = Number(rankMatch[1]);
    const rawHref = titleLinkMatch[1];
    const rawTitle = titleLinkMatch[2];
    const rawDescription = descriptionMatch?.[1] || "";
    const points = pointsMatch ? Number(pointsMatch[1]) : 0;
    const title = cleanText(rawTitle);
    const link = normalizeLink(rawHref);
    const description = cleanDescriptionText(rawDescription);

    if (!link) {
      continue;
    }

    items.push({ rank, title, link, points, description });
  }

  return items;
};

class GeekNewsService {
  private readonly url = GEEK_NEWS_URL;

  private buildBaseEmbed(title: string): EmbedBuilder {
    return new EmbedBuilder()
      .setColor(0xff8a00)
      .setTitle(title)
      .setFooter({ text: "Source: news.hada.io" })
      .setTimestamp();
  }

  private createStatusEmbed(description: string): EmbedBuilder {
    return this.buildBaseEmbed("🧠 오늘의 긱뉴스 번역")
      .setURL(this.url)
      .setDescription(description);
  }

  private isSendableChannel(
    channel: unknown,
  ): channel is TextBasedChannel & {
    send: (options: any) => Promise<unknown>;
  } {
    if (!channel) return false;
    const candidate = channel as any;
    return (
      typeof candidate.isTextBased === "function" &&
      candidate.isTextBased() &&
      typeof candidate.send === "function"
    );
  }

  private buildSummaryPrompt(items: GeekNewsItem[]): string {
    const payload = items.map((item) => ({
      rank: item.rank,
      title: item.title,
      description: truncateText(item.description || item.title, 600),
    }));

    return [
      "당신은 디스코드용 기술 뉴스 요약기입니다.",
      "입력으로 받은 제목과 설명만 사용해 각 항목의 핵심을 한국어로 짧게 요약하세요.",
      "summary는 반드시 자연스러운 한국어 문장으로 작성하세요.",
      "영어 문장을 그대로 복사하거나 영문만으로 답하지 마세요.",
      "반드시 JSON 배열만 응답하세요.",
      '형식: [{"rank":1,"summary":"..."}]',
      "규칙:",
      "- summary는 1~2문장, 최대 160자",
      "- 링크, 순위, 제목을 그대로 반복하지 말 것",
      "- 입력에 없는 사실을 추측하거나 추가하지 말 것",
      "",
      JSON.stringify(payload, null, 2),
    ].join("\n");
  }

  private buildTranslationPrompt(
    item: GeekNewsItem,
    sourceContent: string,
    sourceLength: number = MAX_TRANSLATION_PROMPT_SOURCE_LENGTH,
  ): string {
    const payload = {
      title: item.title,
      description: item.description,
      body: truncateText(
        sourceContent || item.description || item.title,
        sourceLength,
      ),
    };

    return [
      "당신은 디스코드용 기술 기사 번역기입니다.",
      "입력으로 받은 제목, 설명, 본문만 사용해 기사 내용을 자연스러운 한국어로 번역하세요.",
      "또한 왜 이 기사가 오늘 소개할 만한지 선정 이유를 한국어로 짧게 작성하세요.",
      "광고, 내비게이션, 댓글 유도, 구독 유도 문구는 제외하세요.",
      "고유명사, 제품명, 코드, 명령어는 필요하면 원문을 유지하세요.",
      "반드시 JSON 객체만 응답하세요.",
      '형식: {"title":"한국어 제목","body":"한국어 번역 본문","reason":"선정 이유"}',
      "규칙:",
      "- title은 기사 제목을 한국어 한 줄로 번역",
      "- body는 기사 본문의 핵심 내용을 한국어로 번역하되 최대 2200자로 작성",
      "- reason은 1~2문장, 왜 읽을 만한 기사인지 한국어로 설명",
      "- 문단 구분은 유지",
      "- 입력에 없는 사실을 추측하거나 추가하지 말 것",
      "",
      JSON.stringify(payload, null, 2),
    ].join("\n");
  }

  private async summarizeItems(items: GeekNewsItem[]): Promise<GeekNewsItem[]> {
    if (items.length === 0) {
      return items;
    }

    try {
      const result = await aiService.generateTextWithProviderOnly(
        "codex",
        this.buildSummaryPrompt(items),
        {
          systemInstruction:
            "당신은 한국어 기술 뉴스 요약기입니다. 모든 summary는 반드시 자연스러운 한국어로만 작성하고 JSON 외 텍스트는 출력하지 마세요.",
          responseMimeType: "application/json",
          config: {
            temperature: 0.2,
            maxOutputTokens: 1200,
          },
        },
      );
      const rawResponse = result.text;

      const summaryMap = new Map(
        parseGeekNewsSummaryResponse(rawResponse).map((item) => [
          item.rank,
          item.summary,
        ]),
      );

      if (summaryMap.size === 0) {
        throw new Error("Codex 요약 응답을 JSON으로 파싱하지 못했습니다.");
      }

      return items.map((item) => ({
        ...item,
        summary: resolveGeekNewsSummary(
          summaryMap.get(item.rank),
          item.description,
          item.title,
        ),
      }));
    } catch (error) {
      console.error("[GeekNewsService] Codex 요약 실패:", error);
      throw new Error(formatGeekNewsAiFailureReason("요약", error));
    }
  }

  private async fetchListItems(limit: number): Promise<GeekNewsListItemsResult> {
    try {
      const response = await fetch(this.url, {
        headers: {
          "User-Agent": "discord-bot/1.0 (+https://news.hada.io/)",
        },
        signal: AbortSignal.timeout(GEEK_NEWS_REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        throw new Error(`GeekNews HTTP ${response.status}`);
      }

      const html = await readLimitedFetchText(
        response,
        MAX_GEEK_NEWS_LIST_BYTES,
      );
      const items = parseGeekNewsTopItems(html, limit);
      if (items.length === 0) {
        console.warn("[GeekNewsService] Top 뉴스 파싱 결과가 비어 있습니다.");
        return {
          items: [],
          failureReason: GEEK_NEWS_PARSE_FAILED_MESSAGE,
        };
      }

      return { items };
    } catch (error) {
      console.error("[GeekNewsService] Top 뉴스 조회 실패:", error);
      return {
        items: [],
        failureReason: formatGeekNewsFetchFailureReason(error),
      };
    }
  }

  private async fetchArticleContent(
    url: string,
  ): Promise<{ content: string; sourceUrl: string }> {
    try {
      const { html, sourceUrl } = await fetchArticlePage(url);
      if (!html || html.startsWith("%PDF")) {
        return {
          content: "",
          sourceUrl: normalizeGeekNewsHistoryUrl(sourceUrl),
        };
      }

      return {
        content: extractGeekNewsArticleText(html),
        sourceUrl: normalizeGeekNewsHistoryUrl(sourceUrl),
      };
    } catch (error) {
      if (error instanceof UnsafeGeekNewsUrlError) {
        throw error;
      }
      console.error("[GeekNewsService] 기사 본문 조회 실패:", error);
      return {
        content: "",
        sourceUrl: normalizeGeekNewsHistoryUrl(url),
      };
    }
  }

  private async translateFeaturedItem(
    item: GeekNewsItem,
  ): Promise<GeekNewsItem> {
    const { content: sourceContent, sourceUrl } = await this.fetchArticleContent(
      item.link,
    );
    const attempts = [
      {
        label: "initial",
        sourceLength: MAX_TRANSLATION_PROMPT_SOURCE_LENGTH,
        maxOutputTokens: 2600,
      },
      {
        label: "compact",
        sourceLength: MAX_TRANSLATION_RETRY_SOURCE_LENGTH,
        maxOutputTokens: 2200,
      },
    ];
    let lastError: unknown = new Error("Codex 번역을 실행하지 못했습니다.");

    for (const [index, attempt] of attempts.entries()) {
      try {
        const result = await aiService.generateTextWithProviderOnly(
          "codex",
          this.buildTranslationPrompt(
            item,
            sourceContent,
            attempt.sourceLength,
          ),
          {
            systemInstruction:
              "당신은 한국어 기술 기사 번역기입니다. title, body, reason은 반드시 자연스러운 한국어로 작성하고 JSON 외 텍스트는 출력하지 마세요.",
            responseMimeType: "application/json",
            config: {
              temperature: 0.2,
              maxOutputTokens: attempt.maxOutputTokens,
            },
          },
        );
        const rawResponse = result.text;

        const translation = parseGeekNewsTranslationResponse(rawResponse);
        if (!translation) {
          throw new Error("Codex 번역 응답을 JSON으로 파싱하지 못했습니다.");
        }

        const translatedTitle = cleanText(translation.title);
        const translatedBody = cleanTranslatedBodyText(translation.body);
        const selectionReason = cleanReasonText(translation.reason);

        if (!isKoreanSummary(translatedTitle)) {
          throw new Error("Codex 번역 제목이 한국어가 아닙니다.");
        }

        if (!isKoreanSummary(translatedBody)) {
          throw new Error("Codex 번역 본문이 한국어가 아닙니다.");
        }

        if (!isKoreanSummary(selectionReason)) {
          throw new Error("Codex 선정 이유가 한국어가 아닙니다.");
        }

        return {
          ...item,
          sourceUrl,
          sourceContent,
          translatedTitle,
          translatedBody,
          selectionReason,
        };
      } catch (error) {
        lastError = error;
        if (index < attempts.length - 1) {
          console.warn(
            `[GeekNewsService] Codex 본문 번역 재시도 (${attempt.label} 실패): ${formatErrorMessage(error)}`,
          );
        }
      }
    }

    console.error("[GeekNewsService] Codex 본문 번역 실패:", lastError);
    throw new Error(formatGeekNewsAiFailureReason("번역", lastError));
  }

  async fetchTopItems(limit: number = 5): Promise<GeekNewsItem[]> {
    const result = await this.fetchListItems(limit);
    return this.summarizeItems(result.items);
  }

  async fetchFeaturedItemResult(): Promise<GeekNewsFeaturedItemResult> {
    const listResult = await this.fetchListItems(FEATURED_CANDIDATE_LIMIT);
    if (listResult.items.length === 0) {
      return {
        status: "fetch-failed",
        item: null,
        reason: listResult.failureReason || GEEK_NEWS_FETCH_FAILED_MESSAGE,
      };
    }

    const featuredItem = pickUnreadGeekNewsItem(
      listResult.items,
      getTrackedGeekNewsUrls(),
    );
    if (!featuredItem) {
      console.log("[GeekNewsService] 이미 발송한 기사만 있어 오늘 항목을 건너뜁니다.");
      return {
        status: "already-sent",
        item: null,
        reason: GEEK_NEWS_ALREADY_SENT_MESSAGE,
      };
    }

    try {
      return {
        status: "ok",
        item: await this.translateFeaturedItem(featuredItem),
      };
    } catch (error) {
      return {
        status: "fetch-failed",
        item: null,
        reason:
          error instanceof Error && error.message.trim()
            ? error.message
            : GEEK_NEWS_AI_FAILED_MESSAGE,
      };
    }
  }

  async fetchFeaturedItem(): Promise<GeekNewsItem | null> {
    const result = await this.fetchFeaturedItemResult();
    return result.item;
  }

  markItemAsSent(item: GeekNewsItem): void {
    const trackedUrls = [item.link, item.sourceUrl].filter(
      (url): url is string => typeof url === "string" && url.trim().length > 0,
    );

    const content: GeekNewsHistoryContent = {
      rank: item.rank,
      points: item.points,
      title: item.title,
      link: item.link,
      description: item.description,
      sourceUrl: item.sourceUrl,
      sourceContent: item.sourceContent,
      translatedTitle: item.translatedTitle,
      translatedBody: item.translatedBody,
      selectionReason: item.selectionReason,
    };

    const saved = trackedUrls
      .map((url) => trackGeekNewsUrl(url, { title: item.title, item: content }))
      .filter((record): record is NonNullable<typeof record> => record !== null);

    if (saved.length > 0) {
      console.log(
        `[GeekNewsService] 긱뉴스 이력 저장 완료 (${saved.map((entry) => entry.url).join(", ")})`,
      );
    }
  }

  createEmbeds(
    item: GeekNewsItem | null,
    options: { fallbackDescription?: string } = {},
  ): EmbedBuilder[] {
    if (!item) {
      return [
        this.createStatusEmbed(
          options.fallbackDescription || GEEK_NEWS_FETCH_FAILED_MESSAGE,
        ),
      ];
    }

    const translatedTitle = resolveGeekNewsTranslatedTitle(
      item.translatedTitle,
      item.title,
    );
    const translatedBody = resolveGeekNewsTranslatedBody(
      item.translatedBody,
      item.sourceContent || "",
      item.description,
      item.title,
    );
    const selectionReason = resolveGeekNewsSelectionReason(
      item.selectionReason,
      item,
    );

    const allChunks = splitTextIntoChunks(
      translatedBody,
      MAX_EMBED_DESCRIPTION_LENGTH,
    );
    const truncated = allChunks.length > MAX_EMBED_COUNT;
    const chunks = (allChunks.length > 0 ? allChunks : [translatedBody]).slice(
      0,
      MAX_EMBED_COUNT,
    );

    if (truncated) {
      const lastIndex = chunks.length - 1;
      chunks[lastIndex] = truncateText(
        `${chunks[lastIndex]}\n\n(이후 번역은 길이 제한으로 생략되었습니다.)`,
        MAX_EMBED_DESCRIPTION_LENGTH,
      );
    }

    return chunks.map((chunk, index) => {
      const embed = this.buildBaseEmbed(
        index === 0
          ? "🧠 오늘의 긱뉴스 번역"
          : "🧠 오늘의 긱뉴스 번역 (계속)",
      )
        .setURL(item.link)
        .setDescription(chunk);

      if (index === 0) {
        embed.addFields(
          {
            name: "🎯 선정 이유",
            value: truncateText(selectionReason, 1024),
          },
          {
            name: "📰 번역 제목",
            value: truncateText(translatedTitle, 1024),
          },
          {
            name: "🌐 원문 제목",
            value: truncateText(item.title, 1024),
          },
          {
            name: "🔗 링크",
            value: `[원문 보기](${item.link})`,
          },
          {
            name: "📊 정보",
            value: `랭킹 ${item.rank}위 · ${item.points}점`,
          },
        );
      }

      return embed;
    });
  }

  createEmbed(
    item: GeekNewsItem | null,
    options: { fallbackDescription?: string } = {},
  ): EmbedBuilder {
    return this.createEmbeds(item, options)[0];
  }

  async sendToChannel(client: Client, channelId: string): Promise<void> {
    try {
      const result = await this.fetchFeaturedItemResult();
      const channel = await client.channels.fetch(channelId);
      if (!this.isSendableChannel(channel)) {
        console.warn(
          `[GeekNewsService] 채널 ${channelId}은(는) 텍스트 발송이 불가능해 긱뉴스 알림을 보내지 못했습니다.`,
        );
        return;
      }
      const embeds = result.item
        ? this.createEmbeds(result.item)
        : this.createEmbeds(null, {
            fallbackDescription:
              result.reason || GEEK_NEWS_FETCH_FAILED_MESSAGE,
          });

      await channel.send({ embeds });
      if (result.item) {
        this.markItemAsSent(result.item);
      }
    } catch (error) {
      console.error("[GeekNewsService] 특정 채널 발송 실패:", error);
    }
  }
}

export default new GeekNewsService();
