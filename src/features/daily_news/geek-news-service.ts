import { Client, TextBasedChannel, EmbedBuilder } from "discord.js";
import { aiService } from "../../core/ai";

export interface GeekNewsItem {
  rank: number;
  title: string;
  link: string;
  points: number;
  description: string;
  summary?: string;
}

interface GeekNewsSummary {
  rank: number;
  summary: string;
}

interface RawGeekNewsSummary {
  rank?: number | string;
  summary?: string;
}

const GEEK_NEWS_URL = "https://news.hada.io/";
const TOPIC_ROW_REGEX =
  /<div class=['"]?topic_row['"]?[\s\S]*?<\/div>\s*(?=<div class=['"]?topic_row['"]?|<div class=['"]?next)/g;

const MAX_SUMMARY_LENGTH = 160;
const HANGUL_REGEX = /[가-힣]/;

const normalizeWhitespace = (text: string): string =>
  text.replace(/\s+/g, " ").trim();

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

export const isKoreanSummary = (text: string): boolean =>
  HANGUL_REGEX.test(text);

export const buildGeekNewsFallbackSummary = (
  description: string,
  title: string,
): string => {
  const source =
    cleanDescriptionText(description) ||
    cleanText(title) ||
    "요약 정보가 없습니다.";
  return truncateText(source, MAX_SUMMARY_LENGTH);
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

  async fetchTopItems(limit: number = 5): Promise<GeekNewsItem[]> {
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
      const items = parseGeekNewsTopItems(html, limit);
      return this.summarizeItems(items);
    } catch (error) {
      console.error("[GeekNewsService] Top 뉴스 조회 실패:", error);
      return [];
    }
  }

  createEmbed(items: GeekNewsItem[]): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setColor(0xff8a00)
      .setTitle("🧠 긱뉴스 Top 5 AI 요약")
      .setURL(this.url)
      .setFooter({ text: "Source: news.hada.io" })
      .setTimestamp();

    if (items.length === 0) {
      embed.setDescription("긱뉴스 데이터를 가져오지 못했습니다. 잠시 후 다시 시도해주세요.");
      return embed;
    }

    embed.setDescription("라이브 GeekNews 메인 Top 5를 AI로 요약했습니다.");

    items.forEach((item) => {
      embed.addFields({
        name: `${item.rank}. ${truncateText(item.title, 240)}`,
        value: [
          `[링크 열기](${item.link})`,
          truncateText(
            resolveGeekNewsSummary(
              item.summary,
              item.description,
              item.title,
            ),
            900,
          ),
        ].join("\n"),
      });
    });

    return embed;
  }

  async sendToChannel(client: Client, channelId: string): Promise<void> {
    try {
      const items = await this.fetchTopItems(5);
      if (!items || items.length === 0) {
        return;
      }
      const embed = this.createEmbed(items);

      const channel = await client.channels.fetch(channelId);
      if (!this.isSendableChannel(channel)) {
        return;
      }
      await channel.send({ embeds: [embed] });
    } catch (error) {
      console.error("[GeekNewsService] 특정 채널 발송 실패:", error);
    }
  }
}

export default new GeekNewsService();
