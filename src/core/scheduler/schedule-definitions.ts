export interface ScheduleDefinition {
  id:
    | "morning-briefing"
    | "geek-news"
    | "tomorrow-weather"
    | "job-postings"
    | "x-profile";
  label: string;
  cron: string;
  hour: number;
  hours?: readonly number[];
  minute: number;
  minutes?: readonly number[];
  timezone: "Asia/Seoul";
}

export const MORNING_BRIEFING_SCHEDULE: ScheduleDefinition = {
  id: "morning-briefing",
  label: "아침 브리핑",
  cron: "30 6 * * *",
  hour: 6,
  minute: 30,
  timezone: "Asia/Seoul",
};

export const GEEK_NEWS_SCHEDULE: ScheduleDefinition = {
  id: "geek-news",
  label: "긱뉴스",
  cron: "50 7 * * *",
  hour: 7,
  minute: 50,
  timezone: "Asia/Seoul",
};

export const TOMORROW_WEATHER_SCHEDULE: ScheduleDefinition = {
  id: "tomorrow-weather",
  label: "내일 날씨",
  cron: "30 22 * * *",
  hour: 22,
  minute: 30,
  timezone: "Asia/Seoul",
};

export const JOB_POSTINGS_SCHEDULE: ScheduleDefinition = {
  id: "job-postings",
  label: "채용공고",
  cron: "0 7,13,19 * * *",
  hour: 7,
  hours: [7, 13, 19],
  minute: 0,
  timezone: "Asia/Seoul",
};

export const SCHEDULE_DEFINITIONS: ScheduleDefinition[] = [
  MORNING_BRIEFING_SCHEDULE,
  GEEK_NEWS_SCHEDULE,
  TOMORROW_WEATHER_SCHEDULE,
  JOB_POSTINGS_SCHEDULE,
];

export const X_PROFILE_SCHEDULE: ScheduleDefinition = {
  id: "x-profile",
  label: "X 업데이트",
  cron: "*/30 * * * *",
  hour: 0,
  hours: Array.from({ length: 24 }, (_, hour) => hour),
  minute: 0,
  minutes: [0, 30],
  timezone: "Asia/Seoul",
};

export const isXMonitorEnabled = (): boolean => process.env.X_MONITOR_ENABLED === "true";

export const getEnabledScheduleDefinitions = (): ScheduleDefinition[] =>
  isXMonitorEnabled() ? [...SCHEDULE_DEFINITIONS, X_PROFILE_SCHEDULE] : SCHEDULE_DEFINITIONS;
