export interface ScheduleDefinition {
  id: "morning-briefing" | "geek-news" | "tomorrow-weather";
  label: string;
  cron: string;
  hour: number;
  minute: number;
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

export const SCHEDULE_DEFINITIONS: ScheduleDefinition[] = [
  MORNING_BRIEFING_SCHEDULE,
  GEEK_NEWS_SCHEDULE,
  TOMORROW_WEATHER_SCHEDULE,
];
