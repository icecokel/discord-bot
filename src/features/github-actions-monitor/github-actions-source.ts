const GITHUB_API_BASE_URL = "https://api.github.com";
const REQUEST_TIMEOUT_MS = 10_000;
const RUNS_PER_PAGE = 20;
const USER_AGENT = "discord-bot-github-actions-monitor";
// 토큰 없는 요청은 IP당 시간당 60회다. 10분 주기 × 5개 = 시간당 30회로 절반 이하만 사용한다.
const MAX_UNAUTHENTICATED_WORKFLOWS = 5;

export const DEFAULT_GITHUB_ACTIONS_REPO = "icecokel/VSCoke";
export const DEFAULT_GITHUB_ACTIONS_WORKFLOWS = [
  "production-chat-smoke.yml",
  "deploy-api.yml",
] as const;

const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const WORKFLOW_PATTERN = /^[A-Za-z0-9_.-]+$/;

export interface GitHubActionsMonitorConfig {
  repo: string;
  workflows: string[];
  token?: string;
}

export interface GitHubWorkflowRun {
  id: number;
  runAttempt: number;
  name: string;
  conclusion: string | null;
  headBranch: string | null;
  headSha: string;
  event: string;
  htmlUrl: string;
  completedAt: string;
}

export interface GitHubRateLimitInfo {
  remaining?: number;
  resetAt?: string;
}

export interface GitHubWorkflowRunsResult {
  runs: GitHubWorkflowRun[];
  rateLimit: GitHubRateLimitInfo;
}

export class GitHubRateLimitError extends Error {
  readonly retryAt: string;

  constructor(retryAt: string) {
    super(`GitHub API 속도 제한 · ${retryAt} 이후 재시도`);
    this.name = "GitHubRateLimitError";
    this.retryAt = retryAt;
  }
}

export const getGitHubActionsMonitorConfig = (
  env: NodeJS.ProcessEnv = process.env,
): GitHubActionsMonitorConfig => {
  const repo = env.GITHUB_ACTIONS_MONITOR_REPO?.trim() || DEFAULT_GITHUB_ACTIONS_REPO;
  if (!REPO_PATTERN.test(repo)) {
    throw new Error("GITHUB_ACTIONS_MONITOR_REPO는 owner/repo 형식이어야 합니다.");
  }

  const configured = env.GITHUB_ACTIONS_MONITOR_WORKFLOWS?.trim();
  const workflows = [
    ...new Set(
      (configured ? configured.split(/[\s,]+/) : [...DEFAULT_GITHUB_ACTIONS_WORKFLOWS])
        .map((workflow) => workflow.trim())
        .filter(Boolean),
    ),
  ];
  if (workflows.length === 0 || !workflows.every((workflow) => WORKFLOW_PATTERN.test(workflow))) {
    throw new Error(
      "GITHUB_ACTIONS_MONITOR_WORKFLOWS는 쉼표로 구분한 워크플로 파일명 또는 ID여야 합니다.",
    );
  }

  const token = env.GITHUB_TOKEN?.trim() || undefined;
  if (!token && workflows.length > MAX_UNAUTHENTICATED_WORKFLOWS) {
    throw new Error(
      `GITHUB_TOKEN 없이 감시할 수 있는 워크플로는 최대 ${MAX_UNAUTHENTICATED_WORKFLOWS}개입니다.`,
    );
  }

  return { repo, workflows, token };
};

const readHeaderNumber = (headers: Headers, name: string): number | undefined => {
  const value = headers.get(name);
  if (value === null || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const readRateLimitInfo = (headers: Headers): GitHubRateLimitInfo => {
  const remaining = readHeaderNumber(headers, "x-ratelimit-remaining");
  const reset = readHeaderNumber(headers, "x-ratelimit-reset");
  return {
    ...(remaining !== undefined ? { remaining } : {}),
    ...(reset !== undefined ? { resetAt: new Date(reset * 1000).toISOString() } : {}),
  };
};

// GitHub 문서 기준: retry-after가 있으면 그 초만큼, 남은 횟수가 0이면 reset 시각까지 기다린다.
export const getRateLimitRetryAt = (
  status: number,
  headers: Headers,
  now: Date,
): string | undefined => {
  if (status !== 403 && status !== 429) return undefined;
  const retryAfter = readHeaderNumber(headers, "retry-after");
  if (retryAfter !== undefined) {
    return new Date(now.getTime() + Math.max(retryAfter, 1) * 1000).toISOString();
  }
  const info = readRateLimitInfo(headers);
  if (info.remaining === 0 && info.resetAt) return info.resetAt;
  // 헤더 없는 429는 보조 제한으로 보고 최소 1분 기다린다.
  if (status === 429) return new Date(now.getTime() + 60_000).toISOString();
  return undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const parseRun = (value: unknown): GitHubWorkflowRun | null => {
  if (!isRecord(value)) return null;
  const {
    id, run_attempt: runAttempt, name, conclusion, status,
    head_branch: headBranch, head_sha: headSha, event, html_url: htmlUrl,
    updated_at: updatedAt,
  } = value;
  if (
    typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0 ||
    status !== "completed" ||
    (conclusion !== null && typeof conclusion !== "string") ||
    typeof headSha !== "string" ||
    typeof event !== "string" ||
    typeof htmlUrl !== "string" || !htmlUrl.startsWith("https://github.com/") ||
    typeof updatedAt !== "string" || !Number.isFinite(Date.parse(updatedAt))
  ) {
    return null;
  }
  return {
    id,
    runAttempt:
      typeof runAttempt === "number" && Number.isSafeInteger(runAttempt) && runAttempt > 0
        ? runAttempt
        : 1,
    name: typeof name === "string" && name.trim() ? name.trim() : "",
    conclusion: conclusion as string | null,
    headBranch: typeof headBranch === "string" ? headBranch : null,
    headSha,
    event,
    htmlUrl,
    completedAt: new Date(updatedAt).toISOString(),
  };
};

export const parseWorkflowRunsResponse = (body: unknown): GitHubWorkflowRun[] => {
  if (!isRecord(body) || !Array.isArray(body.workflow_runs)) {
    throw new Error("GitHub 응답 형식 오류: workflow_runs 없음");
  }
  return body.workflow_runs
    .map(parseRun)
    .filter((run): run is GitHubWorkflowRun => run !== null);
};

const describeHttpError = (status: number): string => {
  // 응답 본문에는 요청 IP 등이 포함될 수 있어 상태 코드만 남긴다.
  if (status === 404) return "HTTP 404 · 저장소 또는 워크플로 파일 확인 필요";
  if (status === 401) return "HTTP 401 · GITHUB_TOKEN 확인 필요";
  return `HTTP ${status}`;
};

export const fetchWorkflowRuns = async (
  config: Pick<GitHubActionsMonitorConfig, "repo" | "token">,
  workflow: string,
  now: Date = new Date(),
  fetchImpl: typeof fetch = fetch,
): Promise<GitHubWorkflowRunsResult> => {
  const url =
    `${GITHUB_API_BASE_URL}/repos/${config.repo}/actions/workflows/` +
    `${encodeURIComponent(workflow)}/runs?status=completed&per_page=${RUNS_PER_PAGE}`;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": USER_AGENT,
  };
  if (config.token) headers.Authorization = `Bearer ${config.token}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetchImpl(url, { headers, signal: controller.signal });
    if (!response.ok) {
      const retryAt = getRateLimitRetryAt(response.status, response.headers, now);
      if (retryAt) throw new GitHubRateLimitError(retryAt);
      throw new Error(describeHttpError(response.status));
    }
    const body = await response.json().catch(() => {
      throw new Error("GitHub 응답 형식 오류: JSON 아님");
    });
    return {
      runs: parseWorkflowRunsResponse(body),
      rateLimit: readRateLimitInfo(response.headers),
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`요청 시간 초과(${REQUEST_TIMEOUT_MS / 1000}초)`);
    }
    if (error instanceof Error) throw error;
    throw new Error("GitHub 요청 실패");
  } finally {
    clearTimeout(timeout);
  }
};
