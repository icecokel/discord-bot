export interface GeekNewsItem {
  rank: number;
  title: string;
  link: string;
  points: number;
}

const GEEK_NEWS_URL = "https://news.hada.io/";
const TOPIC_ROW_REGEX =
  /<div class=['"]topic_row['"][\s\S]*?<\/div>\s*(?=<div class=['"]topic_row['"]|<div class=['"]next)/g;

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

export const parseGeekNewsTopItems = (
  html: string,
  limit: number = 5,
): GeekNewsItem[] => {
  const rows = html.match(TOPIC_ROW_REGEX) || [];
  const items: GeekNewsItem[] = [];

  for (const row of rows) {
    if (items.length >= limit) break;

    const rankMatch = row.match(/<div class=votenum>(\d+)<\/div>/);
    const titleLinkMatch = row.match(
      /<div class=topictitle><a href=['"]([^'"]+)['"][^>]*>\s*<h1>([\s\S]*?)<\/h1>\s*<\/a>/,
    );
    const pointsMatch = row.match(/<span id=['"]tp\d+['"]>(\d+)<\/span>\s*points/);

    if (!rankMatch || !titleLinkMatch) {
      continue;
    }

    const rank = Number(rankMatch[1]);
    const rawHref = titleLinkMatch[1];
    const rawTitle = titleLinkMatch[2];
    const points = pointsMatch ? Number(pointsMatch[1]) : 0;
    const title = decodeHtmlEntities(rawTitle.replace(/<[^>]*>/g, "").trim());
    const link = normalizeLink(rawHref);

    items.push({ rank, title, link, points });
  }

  return items;
};

class GeekNewsService {
  private readonly url = GEEK_NEWS_URL;

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
      return parseGeekNewsTopItems(html, limit);
    } catch (error) {
      console.error("[GeekNewsService] Top 뉴스 조회 실패:", error);
      return [];
    }
  }
}

export default new GeekNewsService();
