import type { CompanyId } from "../features/job-monitor/company-job-sources";
import { readJson, writeJson } from "./file-manager";

const FILE_NAME = "job-monitor-history.json";
const MAX_SEEN_IDS_PER_COMPANY = 5_000;

export interface CompanyJobMonitorState {
  seenIds: string[];
  initializedAt: string;
  lastCheckedAt: string;
  lastNotifiedAt?: string;
  lastPostingCount: number;
}

export interface JobMonitorState {
  companies: Partial<Record<CompanyId, CompanyJobMonitorState>>;
}

const createEmptyState = (): JobMonitorState => ({ companies: {} });

export const getJobMonitorState = (): JobMonitorState => {
  const data = readJson<JobMonitorState>(FILE_NAME, createEmptyState());
  if (!data || typeof data.companies !== "object" || data.companies === null) {
    return createEmptyState();
  }
  return data;
};

export const saveJobMonitorState = (state: JobMonitorState): void => {
  if (!writeJson(FILE_NAME, state)) {
    throw new Error("채용공고 이력 저장에 실패했습니다.");
  }
};

export const mergeSeenJobIds = (
  existingIds: string[],
  newIds: string[],
): string[] =>
  [...new Set([...existingIds, ...newIds])]
    .filter(Boolean)
    .slice(-MAX_SEEN_IDS_PER_COMPANY);
