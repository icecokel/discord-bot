import {
  COMPANY_JOB_SOURCES,
  fetchCompanyJobPostings,
} from "./company-job-sources";
import type {
  CompanyId,
  JobPosting,
} from "./company-job-sources";
import {
  getJobMonitorState,
  mergeSeenJobIds,
  saveJobMonitorState,
} from "../../utils/job-monitor-store";
import { TRACKED_JOB_FILTER_VERSION } from "./tracked-job-roles";

export interface JobSourceFailure {
  companyId: CompanyId;
  companyName: string;
  reason: string;
}

export interface JobMonitorCheckResult {
  newPostings: JobPosting[];
  initializedCompanies: string[];
  successfulCompanyCount: number;
  totalPostingCount: number;
  failures: JobSourceFailure[];
}

const getErrorMessage = (error: unknown): string =>
  error instanceof Error && error.message.trim()
    ? error.message
    : String(error || "알 수 없는 오류");

const sortNewestFirst = (postings: JobPosting[]): JobPosting[] =>
  [...postings].sort((a, b) => {
    const aTime = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const bTime = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    return bTime - aTime;
  });

export const checkForNewJobPostings = async (
  now: Date = new Date(),
): Promise<JobMonitorCheckResult> => {
  const results = await Promise.allSettled(
    COMPANY_JOB_SOURCES.map(async (source) => ({
      source,
      postings: await fetchCompanyJobPostings(source),
    })),
  );
  const state = getJobMonitorState();
  const checkedAt = now.toISOString();
  const initializedCompanies: string[] = [];
  const newPostings: JobPosting[] = [];
  const failures: JobSourceFailure[] = [];
  let successfulCompanyCount = 0;
  let totalPostingCount = 0;

  results.forEach((result, index) => {
    const source = COMPANY_JOB_SOURCES[index];
    if (result.status === "rejected") {
      failures.push({
        companyId: source.id,
        companyName: source.name,
        reason: getErrorMessage(result.reason),
      });
      return;
    }

    successfulCompanyCount += 1;
    totalPostingCount += result.value.postings.length;
    const existing = state.companies[source.id];

    if (!existing) {
      initializedCompanies.push(source.name);
      state.companies[source.id] = {
        seenIds: mergeSeenJobIds(
          [],
          result.value.postings.map((posting) => posting.id),
        ),
        roleFilterVersion: TRACKED_JOB_FILTER_VERSION,
        initializedAt: checkedAt,
        lastCheckedAt: checkedAt,
        lastPostingCount: result.value.postings.length,
      };
      return;
    }

    const currentIds = new Set(
      result.value.postings.map((posting) => posting.id),
    );
    const retainedSeenIds =
      existing.roleFilterVersion === TRACKED_JOB_FILTER_VERSION
        ? existing.seenIds
        : existing.seenIds.filter((id) => currentIds.has(id));
    const seenIds = new Set(retainedSeenIds);
    newPostings.push(
      ...result.value.postings.filter((posting) => !seenIds.has(posting.id)),
    );
    state.companies[source.id] = {
      ...existing,
      seenIds: retainedSeenIds,
      roleFilterVersion: TRACKED_JOB_FILTER_VERSION,
      lastCheckedAt: checkedAt,
      lastPostingCount: result.value.postings.length,
    };
  });

  if (successfulCompanyCount > 0) {
    saveJobMonitorState(state);
  }

  return {
    newPostings: sortNewestFirst(newPostings),
    initializedCompanies,
    successfulCompanyCount,
    totalPostingCount,
    failures,
  };
};

export const markJobPostingsAsNotified = (
  postings: JobPosting[],
  now: Date = new Date(),
): void => {
  if (postings.length === 0) return;

  const state = getJobMonitorState();
  const notifiedAt = now.toISOString();
  const idsByCompany = new Map<CompanyId, string[]>();
  for (const posting of postings) {
    const ids = idsByCompany.get(posting.companyId) || [];
    ids.push(posting.id);
    idsByCompany.set(posting.companyId, ids);
  }

  for (const [companyId, ids] of idsByCompany) {
    const existing = state.companies[companyId];
    if (!existing) continue;
    state.companies[companyId] = {
      ...existing,
      seenIds: mergeSeenJobIds(existing.seenIds, ids),
      lastNotifiedAt: notifiedAt,
    };
  }

  saveJobMonitorState(state);
};
