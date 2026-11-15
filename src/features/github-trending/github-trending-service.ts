import type { NotificationSender } from "../../utils/notification-batch";
import { buildTrendingMessages } from "./github-trending-message";
import type { TrendingRepoView } from "./github-trending-message";
import { fetchContributionStatus, fetchTrendingRepos } from "./github-trending-source";
import { summarizeTrendingRepos } from "./github-trending-summary";

export const GITHUB_TRENDING_LIMIT = 10;

export interface GitHubTrendingResult {
  status: "success" | "partial" | "failure";
  detail: string;
}

const errorMessage = (error: unknown): string =>
  error instanceof Error && error.message.trim() ? error.message.slice(0, 160) : "알 수 없는 오류";

/** Collects today's trending repos with contribution status and Korean summaries. */
export const collectGitHubTrending = async (): Promise<{ repos: TrendingRepoView[]; issues: string[] }> => {
  const trending = await fetchTrendingRepos(GITHUB_TRENDING_LIMIT);
  const issues: string[] = [];

  const [contributions, summaries] = await Promise.all([
    Promise.all(trending.map((repo) => fetchContributionStatus(repo.fullName))),
    summarizeTrendingRepos(trending).catch((error) => {
      issues.push(`Claude 요약 실패(원문 설명 사용): ${errorMessage(error)}`);
      return new Map<string, string>();
    }),
  ]);

  const unknown = contributions.filter((status) => status.kind === "unknown");
  if (unknown.length) {
    const rateLimited = unknown.some((status) => status.kind === "unknown" && status.reason.includes("속도 제한"));
    issues.push(`기여 여부 확인 실패 ${unknown.length}건` +
      (rateLimited ? " (GitHub API 속도 제한 · GITHUB_TOKEN 설정 권장)" : ""));
  }
  if (summaries.size && summaries.size < trending.length) {
    issues.push(`요약 누락 ${trending.length - summaries.size}건(원문 설명 사용)`);
  }

  return {
    repos: trending.map((repo, index) => ({
      ...repo,
      summary: summaries.get(repo.fullName),
      contribution: contributions[index],
    })),
    issues,
  };
};

export const sendGitHubTrending = async (
  ownerId: string | undefined,
  send: NotificationSender,
  now: () => Date = () => new Date(),
): Promise<GitHubTrendingResult> => {
  if (!ownerId) return { status: "failure", detail: "ADMIN_ID가 설정되지 않았습니다." };

  let collected: Awaited<ReturnType<typeof collectGitHubTrending>>;
  try {
    collected = await collectGitHubTrending();
  } catch (error) {
    return { status: "failure", detail: errorMessage(error) };
  }

  try {
    await send(ownerId, buildTrendingMessages(collected.repos, now()).map((content) => ({ content })));
  } catch (error) {
    return { status: "failure", detail: `DM 전송 실패: ${errorMessage(error)}` };
  }

  const detail = [`트렌딩 ${collected.repos.length}개 DM 전송`, ...collected.issues].join(" · ");
  return { status: collected.issues.length ? "partial" : "success", detail };
};
