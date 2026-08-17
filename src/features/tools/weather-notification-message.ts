import type { ShortTermForecastResult } from "../../utils/kma-helper";

type TodaySummary = ShortTermForecastResult["today"];
type DailySummary = ShortTermForecastResult["tomorrow"];

const formatTemperatureRange = (
  min: number | null,
  max: number | null,
): string => {
  if (min === null && max === null) return "기온 -";
  if (min === null) return `최저 - / 최고 ${max}°`;
  if (max === null) return `최저 ${min}° / 최고 -`;
  return `${min}~${max}°`;
};

const formatCondition = (condition: string | undefined, popMax: number): string =>
  `${condition || "-"} · 강수 ${popMax}%`;

const formatForecastDate = (date: string): string =>
  `${Number(date.slice(4, 6))}월 ${Number(date.slice(6, 8))}일`;

export const buildTodayWeatherNotification = (
  region: string,
  today: TodaySummary,
): string => {
  return [
    `🌤️ ${region} 오늘 (${formatForecastDate(today.date)})`,
    formatCondition(today.current?.desc, today.popMax),
    formatTemperatureRange(today.min, today.max),
  ].join(" | ");
};

export const buildTomorrowWeatherNotification = (
  region: string,
  tomorrow: DailySummary,
): string => {
  return [
    `🌙 ${region} 내일 (${formatForecastDate(tomorrow.date)})`,
    formatCondition(tomorrow.sky, tomorrow.popMax),
    formatTemperatureRange(tomorrow.min, tomorrow.max),
  ].join(" | ");
};
