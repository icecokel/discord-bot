import cron from "node-cron";
import { Client } from "discord.js";
import { getUserRegion } from "../../utils/user-store";
import { getShortTermForecast } from "../../utils/kma-helper";
import kmaData from "../../data/kma-data.json";
import {
  buildTodayWeatherNotification,
  buildTomorrowWeatherNotification,
} from "../../features/tools/weather-notification-message";
import { buildMorningBriefingContent } from "../../features/tools/morning-briefing-message";
import geekNewsService from "../../features/daily_news/geek-news-service";
import {
  checkForNewJobPostings,
  markJobPostingsAsNotified,
} from "../../features/job-monitor/job-monitor-service";
import type { JobMonitorCheckResult } from "../../features/job-monitor/job-monitor-service";
import { buildJobPostingNotificationChunks } from "../../features/job-monitor/job-notification-message";
import {
  buildServerHealthBriefingLine,
  collectServerHealth,
} from "../../utils/server-health";
import {
  recordScheduleRunCompletion,
  recordScheduleRunFailure,
  recordScheduleRunStart,
  registerScheduleDefinitions,
} from "../../utils/schedule-run-store";
import {
  GEEK_NEWS_SCHEDULE,
  JOB_POSTINGS_SCHEDULE,
  MORNING_BRIEFING_SCHEDULE,
  SCHEDULE_DEFINITIONS,
  TOMORROW_WEATHER_SCHEDULE,
} from "./schedule-definitions";
import type { ScheduleDefinition } from "./schedule-definitions";

type WeatherNotificationTarget = "today" | "tomorrow";
type ScheduleTaskResult = {
  status: "success" | "partial" | "failure";
  detail?: string;
};

const DEFAULT_ADMIN_WEATHER_REGION = "서울";
const GEEK_NEWS_FALLBACK_MESSAGE =
  "긱뉴스 알림을 생성하지 못했습니다. 잠시 후 다시 시도해주세요.";

const normalizeRegion = (region: string | undefined): string | null => {
  const trimmed = region?.trim();
  return trimmed ? trimmed : null;
};

const getErrorMessage = (error: unknown): string =>
  error instanceof Error && error.message.trim()
    ? error.message
    : String(error || "알 수 없는 오류");

export const resolveAdminWeatherNotificationUsers = (
  users: { userId: string; region: string }[],
  ownerId: string | undefined = process.env.ADMIN_ID,
  configuredRegion: string | undefined = process.env.WEATHER_ADMIN_REGION,
): { userId: string; region: string }[] => {
  if (!ownerId) return [];

  const configured = normalizeRegion(configuredRegion);
  if (configured) {
    return [{ userId: ownerId, region: configured }];
  }

  const ownerPreference = users.find((user) => user.userId === ownerId);
  return [
    {
      userId: ownerId,
      region:
        normalizeRegion(ownerPreference?.region) || DEFAULT_ADMIN_WEATHER_REGION,
    },
  ];
};

const resolveWeatherCoordinates = (
  region: string,
): { nx: number; ny: number } | null => {
  const regions = kmaData as Record<string, { nx: number; ny: number }>;
  return regions[region.trim()] || null;
};

export class PrivateScheduler {
  private client: Client;

  constructor(client: Client) {
    this.client = client;
  }

  public start(): void {
    try {
      if (!registerScheduleDefinitions(SCHEDULE_DEFINITIONS)) {
        console.error("[PrivateScheduler] 스케줄 실행 원장 초기화에 실패했습니다.");
      }
    } catch (error) {
      console.error("[PrivateScheduler] 스케줄 실행 원장 초기화에 실패했습니다.");
    }
    this.scheduleMorningBriefing();
    this.scheduleGeekNews();
    this.scheduleTomorrowWeather();
    this.scheduleJobPostings();
    console.log(
      "[PrivateScheduler] 어드민 DM 전용 스케줄러가 시작되었습니다. 서버 채널 알림은 등록하지 않습니다.",
    );
  }

  private scheduleGeekNews(): void {
    cron.schedule(
      GEEK_NEWS_SCHEDULE.cron,
      async () => {
        await this.runTrackedJob(GEEK_NEWS_SCHEDULE, () =>
          this.sendGeekNewsDM(),
        );
      },
      { timezone: GEEK_NEWS_SCHEDULE.timezone },
    );
    console.log("[PrivateScheduler] 긱뉴스 알림 등록 완료 (매일 07:50 KST)");
  }

  private scheduleMorningBriefing(): void {
    cron.schedule(
      MORNING_BRIEFING_SCHEDULE.cron,
      async () => {
        await this.runTrackedJob(MORNING_BRIEFING_SCHEDULE, () =>
          this.sendMorningBriefing(),
        );
      },
      { timezone: MORNING_BRIEFING_SCHEDULE.timezone },
    );
    console.log("[PrivateScheduler] 아침 브리핑 등록 완료 (매일 06:30 KST)");
  }

  private scheduleTomorrowWeather(): void {
    cron.schedule(
      TOMORROW_WEATHER_SCHEDULE.cron,
      async () => {
        await this.runTrackedJob(TOMORROW_WEATHER_SCHEDULE, () =>
          this.sendTomorrowWeatherDM(),
        );
      },
      { timezone: TOMORROW_WEATHER_SCHEDULE.timezone },
    );
    console.log("[PrivateScheduler] 내일 날씨 알림 등록 완료 (매일 22:30 KST)");
  }

  private scheduleJobPostings(): void {
    cron.schedule(
      JOB_POSTINGS_SCHEDULE.cron,
      async () => {
        await this.runTrackedJob(JOB_POSTINGS_SCHEDULE, () =>
          this.sendJobPostingNotifications(),
        );
      },
      { timezone: JOB_POSTINGS_SCHEDULE.timezone },
    );
    console.log(
      "[PrivateScheduler] 채용공고 확인 등록 완료 (매일 07:00, 13:00, 19:00 KST)",
    );
  }

  private async runTrackedJob(
    definition: ScheduleDefinition,
    task: () => Promise<ScheduleTaskResult>,
  ): Promise<void> {
    let runRecorded = false;

    try {
      try {
        runRecorded = recordScheduleRunStart(definition);
      } catch (error) {
        console.error(
          `[PrivateScheduler] ${definition.label} 시작 기록 저장 실패:`,
          getErrorMessage(error),
        );
      }
      if (!runRecorded) {
        console.error(
          `[PrivateScheduler] ${definition.label} 시작 기록 저장 실패`,
        );
      }
      console.log(`[PrivateScheduler] ${definition.label} 시작`);

      const result = await task();
      if (result.status === "failure") {
        throw new Error(result.detail || `${definition.label} 실행 실패`);
      }

      try {
        if (
          !recordScheduleRunCompletion(definition, result.status, result.detail)
        ) {
          console.error(
            `[PrivateScheduler] ${definition.label} 완료 기록 저장 실패`,
          );
        }
      } catch (error) {
        console.error(
          `[PrivateScheduler] ${definition.label} 완료 기록 저장 실패:`,
          getErrorMessage(error),
        );
      }
      console.log(
        `[PrivateScheduler] ${definition.label} ${result.status === "partial" ? "일부 성공" : "완료"}`,
      );
    } catch (error) {
      const detail = getErrorMessage(error);
      if (runRecorded) {
        try {
          if (!recordScheduleRunFailure(definition, detail)) {
            console.error(
              `[PrivateScheduler] ${definition.label} 실패 기록 저장 실패`,
            );
          }
        } catch (recordError) {
          console.error(
            `[PrivateScheduler] ${definition.label} 실패 기록 저장 실패:`,
            getErrorMessage(recordError),
          );
        }
      }
      console.error(`[PrivateScheduler] ${definition.label} 실패:`, detail);
    }
  }

  private resolveAdminWeatherTarget(ownerId: string):
    | { userId: string; region: string }
    | undefined {
    const configuredRegion = normalizeRegion(process.env.WEATHER_ADMIN_REGION);
    const storedRegion = configuredRegion ? null : getUserRegion(ownerId);
    return resolveAdminWeatherNotificationUsers(
      storedRegion ? [{ userId: ownerId, region: storedRegion }] : [],
      ownerId,
      configuredRegion || undefined,
    )[0];
  }

  private async buildWeatherLine(
    region: string,
    target: WeatherNotificationTarget,
  ): Promise<{ line: string; error?: string }> {
    const coordinates = resolveWeatherCoordinates(region);
    if (!coordinates) {
      return {
        line: `🌤️ ${region} 날씨 | 지역 좌표를 찾지 못했습니다.`,
        error: `지역 \"${region}\" 좌표 없음`,
      };
    }

    try {
      const weatherData = await getShortTermForecast(
        coordinates.nx,
        coordinates.ny,
      );
      if (!weatherData) {
        return {
          line: `🌤️ ${region} 날씨 | 예보를 불러오지 못했습니다.`,
          error: "날씨 데이터 조회 실패",
        };
      }

      return {
        line:
          target === "today"
            ? buildTodayWeatherNotification(region, weatherData.today)
            : buildTomorrowWeatherNotification(region, weatherData.tomorrow),
      };
    } catch (error) {
      const detail = getErrorMessage(error);
      return {
        line: `🌤️ ${region} 날씨 | 예보를 불러오지 못했습니다.`,
        error: detail,
      };
    }
  }

  public async sendMorningBriefing(
    ownerId: string | undefined = process.env.ADMIN_ID,
  ): Promise<ScheduleTaskResult> {
    if (!ownerId) {
      return { status: "failure", detail: "ADMIN_ID가 설정되지 않았습니다." };
    }

    const weatherTarget = this.resolveAdminWeatherTarget(ownerId);
    if (!weatherTarget) {
      return { status: "failure", detail: "날씨 알림 대상을 찾지 못했습니다." };
    }

    const unavailableSections: string[] = [];
    const partialDetails: string[] = [];
    const weather = await this.buildWeatherLine(weatherTarget.region, "today");

    if (weather.error) {
      unavailableSections.push("날씨");
      partialDetails.push(weather.error);
    }

    const serverHealth = collectServerHealth();
    if (serverHealth.diskUsagePercent === null) {
      unavailableSections.push("서버 디스크");
      partialDetails.push("서버 디스크 상태 확인 실패");
    }

    const content = buildMorningBriefingContent(
      weather.line,
      serverHealth.warnings.length > 0
        ? buildServerHealthBriefingLine(serverHealth)
        : undefined,
      unavailableSections,
    );

    try {
      const user = await this.client.users.fetch(ownerId);
      await user.send({ content });

      const serverWarnings = serverHealth.warnings.length;
      const details = [...partialDetails];
      if (serverWarnings > 0) {
        details.push(`서버 주의 ${serverWarnings}건`);
      }

      return {
        status: partialDetails.length > 0 ? "partial" : "success",
        detail:
          details.length > 0
            ? details.join(" · ")
            : "오늘 날씨 전송 완료",
      };
    } catch (error) {
      return {
        status: "failure",
        detail: `DM 전송 실패: ${getErrorMessage(error)}`,
      };
    }
  }

  public async sendGeekNewsDM(
    ownerId: string | undefined = process.env.ADMIN_ID,
  ): Promise<ScheduleTaskResult> {
    if (!ownerId) {
      return { status: "failure", detail: "ADMIN_ID가 설정되지 않았습니다." };
    }

    const geekNewsResult = await geekNewsService
      .fetchFeaturedItemResult()
      .catch((error) => ({
        status: "fetch-failed" as const,
        item: null,
        reason: getErrorMessage(error),
      }));
    const embeds = geekNewsResult.item
      ? geekNewsService.createEmbeds(geekNewsResult.item)
      : geekNewsService.createEmbeds(null, {
          fallbackDescription:
            geekNewsResult.reason || GEEK_NEWS_FALLBACK_MESSAGE,
        });

    try {
      const user = await this.client.users.fetch(ownerId);
      await user.send({ embeds });
      if (geekNewsResult.item) {
        geekNewsService.markItemAsSent(geekNewsResult.item);
      }

      return {
        status:
          geekNewsResult.status === "fetch-failed" ? "partial" : "success",
        detail:
          geekNewsResult.status === "ok"
            ? "긱뉴스 DM 전송 완료"
            : geekNewsResult.reason || GEEK_NEWS_FALLBACK_MESSAGE,
      };
    } catch (error) {
      return {
        status: "failure",
        detail: `DM 전송 실패: ${getErrorMessage(error)}`,
      };
    }
  }

  public async sendJobPostingNotifications(
    ownerId: string | undefined = process.env.ADMIN_ID,
  ): Promise<ScheduleTaskResult> {
    if (!ownerId) {
      return { status: "failure", detail: "ADMIN_ID가 설정되지 않았습니다." };
    }

    let result: JobMonitorCheckResult;
    try {
      result = await checkForNewJobPostings();
    } catch (error) {
      return {
        status: "failure",
        detail: `채용공고 확인 실패: ${getErrorMessage(error)}`,
      };
    }

    const failedCompanies = result.failures.map(
      (failure) => failure.companyName,
    );
    const failureDetail =
      failedCompanies.length > 0
        ? ` · 조회 실패: ${failedCompanies.join(", ")}`
        : "";

    if (result.successfulCompanyCount === 0) {
      return {
        status: "failure",
        detail: `모든 채용 사이트 조회에 실패했습니다.${failureDetail}`,
      };
    }

    if (result.newPostings.length === 0) {
      const initializedDetail =
        result.initializedCompanies.length > 0
          ? ` · 기준선 생성: ${result.initializedCompanies.join(", ")}`
          : "";
      return {
        status: result.failures.length > 0 ? "partial" : "success",
        detail:
          `${result.successfulCompanyCount}개 회사 ${result.totalPostingCount}개 공고 확인 · 신규 없음` +
          initializedDetail +
          failureDetail,
      };
    }

    try {
      const user = await this.client.users.fetch(ownerId);
      const messages = buildJobPostingNotificationChunks(result.newPostings);
      for (const { content, postings } of messages) {
        await user.send({ content });
        markJobPostingsAsNotified(postings);
      }

      return {
        status: result.failures.length > 0 ? "partial" : "success",
        detail:
          `신규 채용공고 ${result.newPostings.length}건 DM 전송 완료` +
          failureDetail,
      };
    } catch (error) {
      return {
        status: "failure",
        detail: `채용공고 DM 전송 또는 이력 저장 실패: ${getErrorMessage(error)}`,
      };
    }
  }

  public async sendTomorrowWeatherDM(
    ownerId: string | undefined = process.env.ADMIN_ID,
  ): Promise<ScheduleTaskResult> {
    if (!ownerId) {
      return { status: "failure", detail: "ADMIN_ID가 설정되지 않았습니다." };
    }

    const target = this.resolveAdminWeatherTarget(ownerId);
    if (!target) {
      return { status: "failure", detail: "날씨 알림 대상을 찾지 못했습니다." };
    }

    const weather = await this.buildWeatherLine(target.region, "tomorrow");
    if (weather.error) {
      return { status: "failure", detail: weather.error };
    }

    try {
      const user = await this.client.users.fetch(ownerId);
      await user.send(weather.line);
      return { status: "success", detail: "내일 날씨 DM 전송 완료" };
    } catch (error) {
      return {
        status: "failure",
        detail: `DM 전송 실패: ${getErrorMessage(error)}`,
      };
    }
  }
}
