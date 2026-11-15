import { escapeMarkdown } from "discord.js";
import type { GitHubWorkflowRun } from "./github-actions-source";

const SAFE_MESSAGE_LIMIT = 1_900;

export type GitHubActionsEventType = "failure" | "recovered";

export interface GitHubActionsEvent {
  type: GitHubActionsEventType;
  repo: string;
  workflow: string;
  workflowKey: string;
  run: GitHubWorkflowRun;
}

export interface GitHubActionsMessageChunk {
  content: string;
  events: GitHubActionsEvent[];
}

const CONCLUSION_LABELS: Record<string, string> = {
  failure: "실패",
  timed_out: "시간 초과",
  startup_failure: "시작 실패",
  success: "성공",
};

const formatKst = (value: string): string =>
  `${new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value))} KST`;

const inlineCode = (value: string): string =>
  `\`${value.replace(/`/g, "'").slice(0, 80)}\``;

export const buildGitHubActionsEventMessage = (event: GitHubActionsEvent): string => {
  const { run } = event;
  const repoName = event.repo.split("/")[1] || event.repo;
  const workflowName = escapeMarkdown((run.name || event.workflow).slice(0, 100));
  const conclusion = run.conclusion || "unknown";
  const conclusionLabel = CONCLUSION_LABELS[conclusion] || conclusion;
  const title =
    event.type === "failure"
      ? `🚨 **GitHub Actions 실패** · ${escapeMarkdown(repoName)} · ${workflowName}`
      : `✅ **GitHub Actions 복구** · ${escapeMarkdown(repoName)} · ${workflowName}`;
  const result =
    `결과: ${conclusionLabel}${conclusionLabel === conclusion ? "" : ` (${conclusion})`}` +
    (run.runAttempt > 1 ? ` · 재실행 ${run.runAttempt}회차` : "");
  const source = [
    `브랜치: ${run.headBranch ? inlineCode(run.headBranch) : "-"}`,
    `커밋: ${inlineCode(run.headSha.slice(0, 7))}`,
    `트리거: ${inlineCode(run.event)}`,
  ].join(" · ");
  return [title, result, source, `완료: ${formatKst(run.completedAt)}`, `<${run.htmlUrl}>`].join("\n");
};

export const buildGitHubActionsMessageChunks = (
  events: GitHubActionsEvent[],
): GitHubActionsMessageChunk[] => {
  const chunks: GitHubActionsMessageChunk[] = [];
  for (const event of events) {
    const block = buildGitHubActionsEventMessage(event);
    const last = chunks[chunks.length - 1];
    if (last && last.content.length + 2 + block.length <= SAFE_MESSAGE_LIMIT) {
      last.content = `${last.content}\n\n${block}`;
      last.events.push(event);
    } else {
      chunks.push({ content: block, events: [event] });
    }
  }
  return chunks;
};
