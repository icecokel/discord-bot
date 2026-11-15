export interface ScheduleDefinition {
  id:
    | "morning-briefing"
    | "geek-news"
    | "tomorrow-weather"
    | "job-postings"
    | "x-profile"
    | "github-actions";
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
  cron: "0 6 * * *",
  hour: 6,
  minute: 0,
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
  cron: "*/20 * * * *",
  hour: 0,
  hours: Array.from({ length: 24 }, (_, hour) => hour),
  minute: 0,
  minutes: [0, 20, 40],
  timezone: "Asia/Seoul",
};

// 실패 알림이 늦으면 다음 배포·smoke까지 문제가 이어지므로 10분마다 확인한다.
// 워크플로 2개 기준 시간당 12회로, 토큰 없는 GitHub API 한도(시간당 60회)의 1/5이다.
export const GITHUB_ACTIONS_SCHEDULE: ScheduleDefinition = {
  id: "github-actions",
  label: "GitHub Actions 감시",
  cron: "*/10 * * * *",
  hour: 0,
  hours: Array.from({ length: 24 }, (_, hour) => hour),
  minute: 0,
  minutes: [0, 10, 20, 30, 40, 50],
  timezone: "Asia/Seoul",
};

export const isXMonitorEnabled = (): boolean => process.env.X_MONITOR_ENABLED === "true";

// 공개 저장소라 토큰 없이 동작하므로 기본 활성화하고, 명시적으로 끌 때만 비활성화한다.
export const isGitHubActionsMonitorEnabled = (): boolean =>
  !/^(false|0|off|no)$/i.test(process.env.GITHUB_ACTIONS_MONITOR_ENABLED?.trim() || "");

export const getEnabledScheduleDefinitions = (): ScheduleDefinition[] => [
  ...SCHEDULE_DEFINITIONS,
  ...(isXMonitorEnabled() ? [X_PROFILE_SCHEDULE] : []),
  ...(isGitHubActionsMonitorEnabled() ? [GITHUB_ACTIONS_SCHEDULE] : []),
];
