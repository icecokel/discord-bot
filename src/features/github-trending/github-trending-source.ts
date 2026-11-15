const TRENDING_URL = "https://github.com/trending?since=daily";
const GITHUB_API_BASE_URL = "https://api.github.com";
const REQUEST_TIMEOUT_MS = 15_000;
const USER_AGENT = "discord-bot-github-trending";
// Recent open issues scanned per repo for beginner-friendly labels; one API call per repo.
const ISSUES_SCAN_LIMIT = 50;
const BEGINNER_LABEL_PATTERN = /good[\s_-]*first|first[\s_-]*timers?|beginner|help[\s_-]*wanted|easy|starter|입문/i;
const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export interface TrendingRepo {
  rank: number;
  fullName: string;
  url: string;
  description?: string;
  language?: string;
  starsToday?: number;
}

export type ContributionStatus =
  | { kind: "beginner"; beginnerIssues: number; openIssues: number }
  | { kind: "open"; openIssues: number }
  | { kind: "no-open-issues" }
  | { kind: "archived" }
  | { kind: "issues-disabled" }
  | { kind: "unknown"; reason: string };

const decodeEntities = (text: string): string =>
  text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

const stripTags = (html: string): string =>
  decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

/** Parses github.com/trending. There is no official trending API, so this follows the page markup. */
export const parseTrendingPage = (html: string, limit = 10): TrendingRepo[] => {
  const repos: TrendingRepo[] = [];
  for (const article of html.split(/<article\b[^>]*class="[^"]*Box-row[^"]*"[^>]*>/).slice(1)) {
    const href = article.match(/<h2\b[^>]*>[\s\S]*?<a\b[^>]*href="\/([^"?#]+)"/)?.[1];
    const fullName = href ? decodeEntities(href).replace(/\/+$/, "") : undefined;
    if (!fullName || !REPO_PATTERN.test(fullName) || repos.some((repo) => repo.fullName === fullName)) continue;
    const description = article.match(/<p\b[^>]*class="[^"]*col-9[^"]*"[^>]*>([\s\S]*?)<\/p>/)?.[1];
    const language = article.match(/itemprop="programmingLanguage"[^>]*>([^<]+)</)?.[1];
    const starsToday = article.match(/([\d,]+)\s+stars?\s+today/i)?.[1];
    repos.push({
      rank: repos.length + 1,
      fullName,
      url: `https://github.com/${fullName}`,
      ...(description && stripTags(description) ? { description: stripTags(description) } : {}),
      ...(language?.trim() ? { language: language.trim() } : {}),
      ...(starsToday ? { starsToday: Number(starsToday.replace(/,/g, "")) } : {}),
    });
    if (repos.length >= limit) break;
  }
  return repos;
};

const fetchWithTimeout = async (
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

export const fetchTrendingRepos = async (
  limit = 10,
  fetchImpl: typeof fetch = fetch,
): Promise<TrendingRepo[]> => {
  const response = await fetchWithTimeout(TRENDING_URL, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
  }, fetchImpl);
  if (!response.ok) throw new Error(`GitHub 트렌딩 페이지 조회 실패 (HTTP ${response.status})`);
  const repos = parseTrendingPage(await response.text(), limit);
  if (!repos.length) throw new Error("GitHub 트렌딩 페이지에서 저장소를 찾지 못했습니다. 페이지 구조를 확인하세요.");
  return repos;
};

const githubApi = async (
  path: string,
  token: string | undefined,
  fetchImpl: typeof fetch,
): Promise<unknown> => {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": USER_AGENT,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetchWithTimeout(`${GITHUB_API_BASE_URL}${path}`, { headers }, fetchImpl);
  if (response.status === 403 || response.status === 429) throw new Error("GitHub API 속도 제한");
  if (!response.ok) throw new Error(`GitHub API HTTP ${response.status}`);
  return response.json();
};

interface RepoResponse {
  archived?: boolean;
  has_issues?: boolean;
}

interface IssueResponse {
  pull_request?: unknown;
  labels?: (string | { name?: string })[];
}

const labelName = (label: string | { name?: string }): string =>
  typeof label === "string" ? label : label.name || "";

export const judgeContribution = (repo: RepoResponse, issues: IssueResponse[]): ContributionStatus => {
  if (repo.archived) return { kind: "archived" };
  if (repo.has_issues === false) return { kind: "issues-disabled" };
  // The issues endpoint also lists pull requests; only real issues are contribution entry points.
  const openIssues = issues.filter((issue) => !issue.pull_request);
  const beginnerIssues = openIssues.filter((issue) =>
    (issue.labels || []).some((label) => BEGINNER_LABEL_PATTERN.test(labelName(label)))).length;
  if (beginnerIssues > 0) return { kind: "beginner", beginnerIssues, openIssues: openIssues.length };
  if (openIssues.length > 0) return { kind: "open", openIssues: openIssues.length };
  return { kind: "no-open-issues" };
};

export const fetchContributionStatus = async (
  fullName: string,
  token: string | undefined = process.env.GITHUB_TOKEN?.trim() || undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<ContributionStatus> => {
  try {
    const repo = await githubApi(`/repos/${fullName}`, token, fetchImpl) as RepoResponse;
    if (repo.archived || repo.has_issues === false) return judgeContribution(repo, []);
    const issues = await githubApi(
      `/repos/${fullName}/issues?state=open&per_page=${ISSUES_SCAN_LIMIT}`,
      token,
      fetchImpl,
    );
    return judgeContribution(repo, Array.isArray(issues) ? issues as IssueResponse[] : []);
  } catch (error) {
    return { kind: "unknown", reason: error instanceof Error ? error.message : "확인 실패" };
  }
};
