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
  if (
    !data ||
    typeof data !== "object" ||
    typeof data.companies !== "object" ||
    data.companies === null ||
    Array.isArray(data.companies) ||
    Object.values(data.companies).some(
      (company) =>
        !company ||
        typeof company !== "object" ||
        !Array.isArray(company.seenIds) ||
        company.seenIds.some((id) => typeof id !== "string") ||
        typeof company.initializedAt !== "string" ||
        typeof company.lastCheckedAt !== "string" ||
        typeof company.lastPostingCount !== "number",
    )
  ) {
    throw new Error("채용공고 이력 형식이 올바르지 않습니다.");
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
