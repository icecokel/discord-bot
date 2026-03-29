import type { ShortTermForecastResult } from "../../utils/kma-helper";

type TodaySummary = ShortTermForecastResult["today"];
type DailySummary = ShortTermForecastResult["tomorrow"];

const formatTemperature = (value: number | null): string =>
  value !== null ? `${value}°` : "-";

export const buildTodayWeatherNotification = (
  region: string,
  today: TodaySummary,
): string => {
  return [
    `🌤️ 오늘 ${region} 날씨`,
    `최저 ${formatTemperature(today.min)}`,
    `최고 ${formatTemperature(today.max)}`,
    `강수확률 ${today.popMax}%`,
  ].join(" | ");
};

export const buildTomorrowWeatherNotification = (
  region: string,
  tomorrow: DailySummary,
): string => {
  return [
    `🌙 내일 ${region} 날씨`,
    tomorrow.sky || "-",
    `최저 ${formatTemperature(tomorrow.min)}`,
    `최고 ${formatTemperature(tomorrow.max)}`,
    `강수확률 ${tomorrow.popMax}%`,
  ].join(" | ");
};
