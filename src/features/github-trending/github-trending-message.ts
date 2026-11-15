import { escapeMarkdown } from "discord.js";
import type { ContributionStatus, TrendingRepo } from "./github-trending-source";

const SAFE_MESSAGE_LIMIT = 1_900;
const MAX_DESCRIPTION_LENGTH = 160;

export interface TrendingRepoView extends TrendingRepo {
  summary?: string;
  contribution: ContributionStatus;
}

const countLabel = (count: number, scanLimit = 50): string =>
  count >= scanLimit ? `${scanLimit}개+` : `${count}개`;

export const formatContribution = (status: ContributionStatus): string => {
  switch (status.kind) {
    case "beginner": return `✅ 기여 가능 · 입문 이슈 ${countLabel(status.beginnerIssues)}`;
    case "open": return `✅ 기여 가능 · 열린 이슈 ${countLabel(status.openIssues)}`;
    case "no-open-issues": return "🟡 기여 어려움 · 열린 이슈 없음";
    case "issues-disabled": return "🟡 기여 어려움 · 이슈 비활성";
    case "archived": return "⛔ 기여 불가 · 보관된 저장소";
    case "unknown": return "❔ 기여 여부 확인 실패";
  }
};

const describe = (repo: TrendingRepoView): string => {
  const text = repo.summary || repo.description || "설명 없음";
  return escapeMarkdown(text.length > MAX_DESCRIPTION_LENGTH ? `${text.slice(0, MAX_DESCRIPTION_LENGTH)}…` : text);
};

export const formatTrendingRepo = (repo: TrendingRepoView): string =>
  // <url> keeps Discord from expanding ten link previews.
  `${repo.rank}. <${repo.url}> (${formatContribution(repo.contribution)})\n - ${describe(repo)}`;

export const buildTrendingMessages = (repos: TrendingRepoView[], now: Date = new Date()): string[] => {
  const date = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(now);
  const messages: string[] = [];
  let current = `🔥 **GitHub 트렌딩 Top ${repos.length}** · ${date}`;
  for (const repo of repos) {
    const block = formatTrendingRepo(repo);
    if (`${current}\n\n${block}`.length > SAFE_MESSAGE_LIMIT) {
      messages.push(current);
      current = block;
    } else {
      current = `${current}\n\n${block}`;
    }
  }
  messages.push(current);
  return messages;
};
