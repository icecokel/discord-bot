import type { ScheduleDefinition } from "../core/scheduler/schedule-definitions";
import { readJson, writeJson } from "./file-manager";

const FILE_NAME = "schedule-run-history.json";
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export type ScheduleRunStatus =
  | "never"
  | "running"
  | "success"
  | "partial"
  | "failure";

export interface ScheduleRunRecord {
  jobId: ScheduleDefinition["id"];
  label: string;
  cron: string;
  timezone: string;
  status: ScheduleRunStatus;
  lastAttemptAt?: string;
  lastCompletedAt?: string;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  nextRunAt: string;
  detail?: string;
}

interface ScheduleRunData {
  jobs: Partial<Record<ScheduleDefinition["id"], ScheduleRunRecord>>;
}

const loadData = (): ScheduleRunData => {
  const data = readJson<ScheduleRunData>(FILE_NAME, { jobs: {} });
  return data && typeof data.jobs === "object" && data.jobs !== null
    ? data
    : { jobs: {} };
};

const saveData = (data: ScheduleRunData): boolean => {
  const saved = writeJson(FILE_NAME, data);
  if (!saved) {
    console.error("[ScheduleRunStore] 실행 원장 저장에 실패했습니다.");
  }
  return saved;
};

export const getNextScheduleRunAt = (
  definition: Pick<ScheduleDefinition, "hour" | "minute">,
  from: Date = new Date(),
): string => {
  const kst = new Date(from.getTime() + KST_OFFSET_MS);
  let candidateTime =
    Date.UTC(
      kst.getUTCFullYear(),
      kst.getUTCMonth(),
      kst.getUTCDate(),
      definition.hour,
      definition.minute,
    ) - KST_OFFSET_MS;

  if (candidateTime <= from.getTime()) {
    candidateTime =
      Date.UTC(
        kst.getUTCFullYear(),
        kst.getUTCMonth(),
        kst.getUTCDate() + 1,
        definition.hour,
        definition.minute,
      ) - KST_OFFSET_MS;
  }

  return new Date(candidateTime).toISOString();
};

const createRecord = (
  definition: ScheduleDefinition,
  now: Date,
): ScheduleRunRecord => ({
  jobId: definition.id,
  label: definition.label,
  cron: definition.cron,
  timezone: definition.timezone,
  status: "never",
  nextRunAt: getNextScheduleRunAt(definition, now),
});

const upsertDefinition = (
  data: ScheduleRunData,
  definition: ScheduleDefinition,
  now: Date,
): ScheduleRunRecord => {
  const existing = data.jobs[definition.id];
  const record: ScheduleRunRecord = {
    ...(existing || createRecord(definition, now)),
    jobId: definition.id,
    label: definition.label,
    cron: definition.cron,
    timezone: definition.timezone,
    nextRunAt: getNextScheduleRunAt(definition, now),
  };
  data.jobs[definition.id] = record;
  return record;
};

export const registerScheduleDefinitions = (
  definitions: ScheduleDefinition[],
  now: Date = new Date(),
): boolean => {
  const data = loadData();
  for (const definition of definitions) {
    const record = upsertDefinition(data, definition, now);
    if (record.status === "running") {
      const interruptedAt = now.toISOString();
      data.jobs[definition.id] = {
        ...record,
        status: "failure",
        lastCompletedAt: interruptedAt,
        lastFailureAt: interruptedAt,
        detail: "프로세스 재시작으로 이전 실행이 중단된 것으로 추정됩니다.",
      };
    }
  }
  return saveData(data);
};

export const recordScheduleRunStart = (
  definition: ScheduleDefinition,
  now: Date = new Date(),
): boolean => {
  const data = loadData();
  const record = upsertDefinition(data, definition, now);
  data.jobs[definition.id] = {
    ...record,
    status: "running",
    lastAttemptAt: now.toISOString(),
    detail: undefined,
  };
  return saveData(data);
};

export const recordScheduleRunCompletion = (
  definition: ScheduleDefinition,
  status: "success" | "partial",
  detail: string | undefined,
  now: Date = new Date(),
): boolean => {
  const data = loadData();
  const record = upsertDefinition(data, definition, now);
  const completedAt = now.toISOString();
  data.jobs[definition.id] = {
    ...record,
    status,
    lastCompletedAt: completedAt,
    lastSuccessAt: completedAt,
    detail,
  };
  return saveData(data);
};

export const recordScheduleRunFailure = (
  definition: ScheduleDefinition,
  detail: string,
  now: Date = new Date(),
): boolean => {
  const data = loadData();
  const record = upsertDefinition(data, definition, now);
  const completedAt = now.toISOString();
  data.jobs[definition.id] = {
    ...record,
    status: "failure",
    lastCompletedAt: completedAt,
    lastFailureAt: completedAt,
    detail,
  };
  return saveData(data);
};

export const getScheduleRunRecords = (): ScheduleRunRecord[] => {
  const data = loadData();
  return Object.values(data.jobs).filter(
    (record): record is ScheduleRunRecord => Boolean(record),
  );
};
