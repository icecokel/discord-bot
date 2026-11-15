import { readJson, writeJson } from "./file-manager";

const FILE_NAME = "github-actions-monitor-history.json";
// 목록 조회는 워크플로마다 최근 20건이므로 500건이면 재실행 이력까지 충분히 덮는다.
const MAX_SEEN_RUN_KEYS_PER_WORKFLOW = 500;

export interface GitHubWorkflowMonitorState {
  initializedAt: string;
  lastCheckedAt: string;
  // `${run.id}:${run.run_attempt}` 형식. 알림을 보냈거나 알림 없이 확인한 완료 실행이다.
  seenRunKeys: string[];
  // 실패 알림을 보낸 뒤 아직 성공으로 복구되지 않은 실행 키
  failingRunKey?: string;
  lastNotifiedAt?: string;
}

export interface GitHubActionsMonitorState {
  version: 1;
  // 키: `${repo}/${workflow}` (예: icecokel/VSCoke/deploy-api.yml)
  workflows: Record<string, GitHubWorkflowMonitorState>;
  rateLimitedUntil?: string;
}

const createEmptyState = (): GitHubActionsMonitorState => ({
  version: 1,
  workflows: {},
});

const isDate = (value: unknown): value is string =>
  typeof value === "string" && Number.isFinite(Date.parse(value));

const isWorkflowState = (value: unknown): value is GitHubWorkflowMonitorState => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const workflow = value as GitHubWorkflowMonitorState;
  return (
    isDate(workflow.initializedAt) &&
    isDate(workflow.lastCheckedAt) &&
    Array.isArray(workflow.seenRunKeys) &&
    workflow.seenRunKeys.every((key) => typeof key === "string") &&
    (workflow.failingRunKey === undefined || typeof workflow.failingRunKey === "string") &&
    (workflow.lastNotifiedAt === undefined || isDate(workflow.lastNotifiedAt))
  );
};

export const loadGitHubActionsMonitorState = (): GitHubActionsMonitorState => {
  const data = readJson<GitHubActionsMonitorState>(FILE_NAME, createEmptyState());
  if (
    !data ||
    typeof data !== "object" ||
    data.version !== 1 ||
    !data.workflows ||
    typeof data.workflows !== "object" ||
    Array.isArray(data.workflows) ||
    !Object.values(data.workflows).every(isWorkflowState) ||
    (data.rateLimitedUntil !== undefined && !isDate(data.rateLimitedUntil))
  ) {
    throw new Error("GitHub Actions 감시 이력 형식이 올바르지 않습니다.");
  }
  return data;
};

export const saveGitHubActionsMonitorState = (
  state: GitHubActionsMonitorState,
): void => {
  if (!writeJson(FILE_NAME, state)) {
    throw new Error("GitHub Actions 감시 이력 저장에 실패했습니다.");
  }
};

export const mergeSeenRunKeys = (existing: string[], added: string[]): string[] => {
  const addedSet = new Set(added);
  // 다시 확인한 키는 뒤로 옮겨 최근 항목이 잘리지 않게 한다.
  return [...existing.filter((key) => !addedSet.has(key)), ...addedSet]
    .filter(Boolean)
    .slice(-MAX_SEEN_RUN_KEYS_PER_WORKFLOW);
};
