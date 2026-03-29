import { Client, TextBasedChannel, EmbedBuilder } from "discord.js";
import { aiService } from "../../core/ai";
import {
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
const MAX_EMBED_DESCRIPTION_LENGTH = 3800;
const MAX_EMBED_COUNT = 8;
const FEATURED_CANDIDATE_LIMIT = 20;
const HANGUL_REGEX = /[가-힣]/;
const NON_KOREAN_FALLBACK_SUMMARY =
  "한국어 요약을 생성하지 못했습니다. 링크에서 원문을 확인해주세요.";
const NON_KOREAN_FALLBACK_TRANSLATION =
  "한국어 번역을 생성하지 못했습니다. 링크에서 원문을 확인해주세요.";

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

const normalizeLink = (href: string): string => {
  try {
    return new URL(href, GEEK_NEWS_URL).toString();
  } catch {
    return GEEK_NEWS_URL;
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

  const jsonCandidate = trimmed.match(/\{[\s\S]*\}/)?.[0] || trimmed;

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
      /<div class=['"]?topictitle['"]?>\s*<a href=['"]([^'"]+)['"][^>]*>\s*<h1>([\s\S]*?)<\/h1>\s*<\/a>/,
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

    items.push({ rank, title, link, points, description });
  }

  return items;
};

class GeekNewsService {
  private readonly url = GEEK_NEWS_URL;

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
  ): string {
    const payload = {
      title: item.title,
      description: item.description,
      body: truncateText(
        sourceContent || item.description || item.title,
        MAX_SOURCE_CONTENT_LENGTH,
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
      "- body는 기사 본문을 한국어로 번역",
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

    if (!process.env.GEMINI_AI_API_KEY) {
      return items.map((item) => ({
        ...item,
        summary: buildGeekNewsFallbackSummary(item.description, item.title),
      }));
    }

    try {
      const rawResponse = await aiService.generateText(
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

      const summaryMap = new Map(
        parseGeekNewsSummaryResponse(rawResponse).map((item) => [
          item.rank,
          item.summary,
        ]),
      );

      return items.map((item) => ({
        ...item,
        summary: resolveGeekNewsSummary(
          summaryMap.get(item.rank),
          item.description,
          item.title,
        ),
      }));
    } catch (error) {
      console.error("[GeekNewsService] AI 요약 실패:", error);
      return items.map((item) => ({
        ...item,
        summary: resolveGeekNewsSummary(
          undefined,
          item.description,
          item.title,
        ),
      }));
    }
  }

  private async fetchListItems(limit: number): Promise<GeekNewsItem[]> {
    try {
      const response = await fetch(this.url, {
        headers: {
          "User-Agent": "daily-english-helper-bot/1.0 (+https://news.hada.io/)",
        },
      });

      if (!response.ok) {
        throw new Error(`GeekNews HTTP ${response.status}`);
      }

      const html = await response.text();
      return parseGeekNewsTopItems(html, limit);
    } catch (error) {
      console.error("[GeekNewsService] Top 뉴스 조회 실패:", error);
      return [];
    }
  }

  private async fetchArticleContent(
    url: string,
  ): Promise<{ content: string; sourceUrl: string }> {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "daily-english-helper-bot/1.0 (+https://news.hada.io/)",
          Accept: "text/html,application/xhtml+xml",
        },
        redirect: "follow",
      });

      if (!response.ok) {
        throw new Error(`Article HTTP ${response.status}`);
      }

      const html = await response.text();
      if (!html || html.startsWith("%PDF")) {
        return {
          content: "",
          sourceUrl: normalizeGeekNewsHistoryUrl(response.url || url),
        };
      }

      return {
        content: extractGeekNewsArticleText(html),
        sourceUrl: normalizeGeekNewsHistoryUrl(response.url || url),
      };
    } catch (error) {
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

    if (!process.env.GEMINI_AI_API_KEY) {
      return {
        ...item,
        sourceUrl,
        sourceContent,
        translatedTitle: cleanText(item.title),
        translatedBody: buildGeekNewsFallbackTranslation(
          sourceContent,
          item.description,
          item.title,
        ),
      };
    }

    try {
      const rawResponse = await aiService.generateText(
        this.buildTranslationPrompt(item, sourceContent),
        {
          systemInstruction:
            "당신은 한국어 기술 기사 번역기입니다. title, body, reason은 반드시 자연스러운 한국어로 작성하고 JSON 외 텍스트는 출력하지 마세요.",
          responseMimeType: "application/json",
          config: {
            temperature: 0.2,
            maxOutputTokens: 3200,
          },
        },
      );

      const translation = parseGeekNewsTranslationResponse(rawResponse);

      return {
        ...item,
        sourceUrl,
        sourceContent,
        translatedTitle: resolveGeekNewsTranslatedTitle(
          translation?.title,
          item.title,
        ),
        translatedBody: resolveGeekNewsTranslatedBody(
          translation?.body,
          sourceContent,
          item.description,
          item.title,
        ),
        selectionReason: resolveGeekNewsSelectionReason(translation?.reason, item),
      };
    } catch (error) {
      console.error("[GeekNewsService] 본문 번역 실패:", error);
      return {
        ...item,
        sourceUrl,
        sourceContent,
        translatedTitle: cleanText(item.title),
        translatedBody: resolveGeekNewsTranslatedBody(
          undefined,
          sourceContent,
          item.description,
          item.title,
        ),
        selectionReason: resolveGeekNewsSelectionReason(undefined, item),
      };
    }
  }

  async fetchTopItems(limit: number = 5): Promise<GeekNewsItem[]> {
    const items = await this.fetchListItems(limit);
    return this.summarizeItems(items);
  }

  async fetchFeaturedItem(): Promise<GeekNewsItem | null> {
    const items = await this.fetchListItems(FEATURED_CANDIDATE_LIMIT);
    if (items.length === 0) {
      return null;
    }

    const featuredItem = pickUnreadGeekNewsItem(items, getTrackedGeekNewsUrls());
    if (!featuredItem) {
      console.log("[GeekNewsService] 이미 발송한 기사만 있어 오늘 항목을 건너뜁니다.");
      return null;
    }

    return this.translateFeaturedItem(featuredItem);
  }

  markItemAsSent(item: Pick<GeekNewsItem, "link" | "title" | "sourceUrl">): void {
    const trackedUrls = [item.link, item.sourceUrl].filter(
      (url): url is string => typeof url === "string" && url.trim().length > 0,
    );

    const saved = trackedUrls
      .map((url) => trackGeekNewsUrl(url, { title: item.title }))
      .filter((record): record is NonNullable<typeof record> => record !== null);

    if (saved.length > 0) {
      console.log(
        `[GeekNewsService] 긱뉴스 이력 저장 완료 (${saved.map((entry) => entry.url).join(", ")})`,
      );
    }
  }

  createEmbeds(item: GeekNewsItem | null): EmbedBuilder[] {
    const buildBaseEmbed = (title: string): EmbedBuilder =>
      new EmbedBuilder()
        .setColor(0xff8a00)
        .setTitle(title)
        .setFooter({ text: "Source: news.hada.io" })
        .setTimestamp();

    if (!item) {
      return [
        buildBaseEmbed("🧠 오늘의 긱뉴스 번역")
          .setURL(this.url)
          .setDescription(
            "긱뉴스 데이터를 가져오지 못했습니다. 잠시 후 다시 시도해주세요.",
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
      const embed = buildBaseEmbed(
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

  createEmbed(item: GeekNewsItem | null): EmbedBuilder {
    return this.createEmbeds(item)[0];
  }

  async sendToChannel(client: Client, channelId: string): Promise<void> {
    try {
      const item = await this.fetchFeaturedItem();
      if (!item) {
        return;
      }
      const embeds = this.createEmbeds(item);

      const channel = await client.channels.fetch(channelId);
      if (!this.isSendableChannel(channel)) {
        return;
      }
      await channel.send({ embeds });
      this.markItemAsSent(item);
    } catch (error) {
      console.error("[GeekNewsService] 특정 채널 발송 실패:", error);
    }
  }
}

export default new GeekNewsService();
