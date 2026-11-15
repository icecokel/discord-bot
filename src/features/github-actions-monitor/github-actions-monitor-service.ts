import type { NotificationSender } from "../../utils/notification-batch";
import {
  loadGitHubActionsMonitorState,
  mergeSeenRunKeys,
  saveGitHubActionsMonitorState,
} from "../../utils/github-actions-monitor-store";
import type { GitHubWorkflowMonitorState } from "../../utils/github-actions-monitor-store";
import {
  fetchWorkflowRuns,
  getGitHubActionsMonitorConfig,
  GitHubRateLimitError,
} from "./github-actions-source";
import type { GitHubActionsMonitorConfig, GitHubWorkflowRun } from "./github-actions-source";
import { buildGitHubActionsMessageChunks } from "./github-actions-message";
import type { GitHubActionsEvent } from "./github-actions-message";

// failure·timed_out은 실제 실패, startup_failure는 워크플로가 시작조차 못 한 상태라 알린다.
// cancelled는 사람이 취소했거나 동시성 정책으로 밀린 경우라 알리지 않는다.
export const ALERT_CONCLUSIONS = new Set(["failure", "timed_out", "startup_failure"]);
// 첫 확인(기준선) 때도 최근 24시간 안에 끝난 실패는 알린다. 하루 한 번 도는 smoke의
// 마지막 실패가 배포 직전에 있었다면 놓치지 않고, 그보다 오래된 실패는 쏟아내지 않는다.
export const BASELINE_LOOKBACK_MS = 24 * 60 * 60 * 1000;

export interface GitHubActionsWorkflowFailure {
  workflow: string;
  reason: string;
}

export interface GitHubActionsCheckResult {
  events: GitHubActionsEvent[];
  checkedWorkflows: string[];
  initializedWorkflows: string[];
  failures: GitHubActionsWorkflowFailure[];
  rateLimitedUntil?: string;
}

export interface GitHubActionsMonitorResult {
  status: "success" | "partial" | "failure";
  detail: string;
}

const getErrorMessage = (error: unknown): string =>
  error instanceof Error && error.message.trim()
    ? error.message.slice(0, 200)
    : "알 수 없는 오류";

export const getRunKey = (run: Pick<GitHubWorkflowRun, "id" | "runAttempt">): string =>
  `${run.id}:${run.runAttempt}`;

export const getWorkflowKey = (repo: string, workflow: string): string =>
  `${repo}/${workflow}`;

const byCompletion = (a: GitHubWorkflowRun, b: GitHubWorkflowRun): number =>
  Date.parse(a.completedAt) - Date.parse(b.completedAt) || a.id - b.id || a.runAttempt - b.runAttempt;

export const checkGitHubActionsRuns = async (
  config: GitHubActionsMonitorConfig,
  now: Date = new Date(),
  fetchImpl: typeof fetch = fetch,
): Promise<GitHubActionsCheckResult> => {
  const state = loadGitHubActionsMonitorState();
  const checkedAt = now.toISOString();
  const result: GitHubActionsCheckResult = {
    events: [],
    checkedWorkflows: [],
    initializedWorkflows: [],
    failures: [],
  };

  if (state.rateLimitedUntil && Date.parse(state.rateLimitedUntil) > now.getTime()) {
    result.rateLimitedUntil = state.rateLimitedUntil;
    result.failures = config.workflows.map((workflow) => ({
      workflow,
      reason: "속도 제한 대기 중",
    }));
    return result;
  }

  let stateChanged = Boolean(state.rateLimitedUntil);
  delete state.rateLimitedUntil;

  for (const [index, workflow] of config.workflows.entries()) {
    let runs: GitHubWorkflowRun[];
    try {
      const response = await fetchWorkflowRuns(config, workflow, now, fetchImpl);
      runs = response.runs;
      if (response.rateLimit.remaining === 0 && response.rateLimit.resetAt) {
        // 이번 응답은 처리하되 다음 요청은 reset 이후로 미룬다.
        state.rateLimitedUntil = response.rateLimit.resetAt;
      }
    } catch (error) {
      if (error instanceof GitHubRateLimitError) {
        state.rateLimitedUntil = error.retryAt;
        stateChanged = true;
        for (const skipped of config.workflows.slice(index)) {
          result.failures.push({ workflow: skipped, reason: "속도 제한" });
        }
        break;
      }
      result.failures.push({ workflow, reason: getErrorMessage(error) });
      continue;
    }

    stateChanged = true;
    result.checkedWorkflows.push(workflow);
    const workflowKey = getWorkflowKey(config.repo, workflow);
    const existing = state.workflows[workflowKey];
    const workflowState: GitHubWorkflowMonitorState = existing || {
      initializedAt: checkedAt,
      lastCheckedAt: checkedAt,
      seenRunKeys: [],
    };
    if (!existing) result.initializedWorkflows.push(workflow);

    const seen = new Set(workflowState.seenRunKeys);
    const newRuns = runs.filter((run) => !seen.has(getRunKey(run))).sort(byCompletion);
    const silentKeys: string[] = [];
    let failing = Boolean(workflowState.failingRunKey);

    for (const run of newRuns) {
      if (!existing && now.getTime() - Date.parse(run.completedAt) > BASELINE_LOOKBACK_MS) {
        silentKeys.push(getRunKey(run));
        continue;
      }
      const event = { repo: config.repo, workflow, workflowKey, run };
      if (run.conclusion && ALERT_CONCLUSIONS.has(run.conclusion)) {
        result.events.push({ ...event, type: "failure" });
        failing = true;
      } else if (run.conclusion === "success" && failing) {
        // 실패 알림을 보낸 워크플로가 다시 성공하면 복구 알림을 한 번만 보낸다.
        result.events.push({ ...event, type: "recovered" });
        failing = false;
      } else {
        silentKeys.push(getRunKey(run));
      }
    }

    // 알림 대상 실행은 실제 DM 전송 뒤에 기록하고, 나머지는 바로 확인 완료로 저장한다.
    state.workflows[workflowKey] = {
      ...workflowState,
      seenRunKeys: mergeSeenRunKeys(workflowState.seenRunKeys, silentKeys),
      lastCheckedAt: checkedAt,
    };
  }

  if (state.rateLimitedUntil) result.rateLimitedUntil = state.rateLimitedUntil;
  if (stateChanged) saveGitHubActionsMonitorState(state);
  return result;
};

export const markGitHubActionsEventsNotified = (
  events: GitHubActionsEvent[],
  now: Date = new Date(),
): void => {
  if (events.length === 0) return;
  const state = loadGitHubActionsMonitorState();
  const notifiedAt = now.toISOString();
  for (const event of events) {
    const workflowState = state.workflows[event.workflowKey];
    if (!workflowState) continue;
    const runKey = getRunKey(event.run);
    state.workflows[event.workflowKey] = {
      ...workflowState,
      seenRunKeys: mergeSeenRunKeys(workflowState.seenRunKeys, [runKey]),
      failingRunKey: event.type === "failure" ? runKey : undefined,
      lastNotifiedAt: notifiedAt,
    };
  }
  saveGitHubActionsMonitorState(state);
};

const formatKstTime = (value: string): string =>
  new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));

export const runGitHubActionsMonitor = async (
  send: NotificationSender,
  ownerId: string | undefined = process.env.ADMIN_ID,
  now: () => Date = () => new Date(),
  fetchImpl: typeof fetch = fetch,
): Promise<GitHubActionsMonitorResult> => {
  if (!ownerId) {
    // 수신자가 없을 때 기준선을 만들면 그 사이 실패를 영영 못 보내므로 조회하지 않는다.
    return { status: "failure", detail: "ADMIN_ID가 설정되지 않았습니다." };
  }

  let result: GitHubActionsCheckResult;
  try {
    result = await checkGitHubActionsRuns(getGitHubActionsMonitorConfig(), now(), fetchImpl);
  } catch (error) {
    return { status: "failure", detail: `GitHub Actions 확인 실패: ${getErrorMessage(error)}` };
  }

  const failedCount = result.events.filter((event) => event.type === "failure").length;
  const recoveredCount = result.events.length - failedCount;
  const details = [
    `워크플로 ${result.checkedWorkflows.length}개 확인`,
    result.events.length > 0
      ? `실패 알림 ${failedCount}건 · 복구 알림 ${recoveredCount}건`
      : "새 실패 없음",
  ];
  if (result.initializedWorkflows.length > 0) {
    details.push(`기준선 생성: ${result.initializedWorkflows.join(", ")}`);
  }
  if (result.failures.length > 0) {
    details.push(
      `조회 실패: ${result.failures.map(({ workflow, reason }) => `${workflow}(${reason})`).join(", ")}`,
    );
  }
  if (result.rateLimitedUntil) {
    details.push(`GitHub 속도 제한 · ${formatKstTime(result.rateLimitedUntil)} KST 이후 재시도`);
  }

  if (result.events.length > 0) {
    try {
      const chunks = buildGitHubActionsMessageChunks(result.events);
      await send(ownerId, chunks.map(({ content, events }) => ({
        content,
        onSent: () => markGitHubActionsEventsNotified(events, now()),
      })));
    } catch (error) {
      return {
        status: "failure",
        detail: `GitHub Actions DM 전송 또는 이력 저장 실패: ${getErrorMessage(error)} · ${details.join(" · ")}`,
      };
    }
  }

  const detail = details.join(" · ");
  if (result.checkedWorkflows.length === 0) return { status: "failure", detail };
  return { status: result.failures.length > 0 ? "partial" : "success", detail };
};
