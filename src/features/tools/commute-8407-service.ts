import fs from "fs";
import path from "path";
import { Client, EmbedBuilder, User } from "discord.js";
import { DATA_DIR } from "../../utils/file-manager";
import {
  NaverBusApi,
  NaverBusArrivalItem,
  NaverBusRouteItem,
} from "./naver-bus-api";

export const COMMUTE_8407_ROUTE_ID = 20000876;
export const COMMUTE_8407_ROUTE_NAME = "8407";
export const COMMUTE_8407_STATION_ID = 159407;
export const COMMUTE_8407_STATION_NAME = "대동문고.댕리단길";

const CACHE_FILE = "commute-8407-cache.json";
const EVENTS_FILE = "commute-8407-events.jsonl";
const SUBSCRIPTIONS_FILE = "commute-8407-subscriptions.json";
const CHECK_INTERVAL_MS = 60 * 1000;
const ALERT_THRESHOLD_MS = 15 * 60 * 1000;
const CACHE_STALE_MS = 6 * 60 * 60 * 1000;
const EVENT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const EVENT_DEDUPE_WINDOW_MS = 5 * 60 * 1000;
const EVENT_PRUNE_INTERVAL_MS = 12 * 60 * 60 * 1000;
const DEFAULT_SCHEDULE_PREVIEW_COUNT = 8;
const KST_OFFSET = "+09:00";
const ALERT_KEY_WINDOW_MS = 10 * 60 * 1000;

export type CommuteDayType = "weekday" | "saturday" | "sunday";
export type CommuteEventSource = "naver" | "realtime" | "fallback-cache";
export type CommutePredictionSource = "realtime" | "historical" | "unavailable";

export interface Commute8407Interval {
  dayType: CommuteDayType;
  intervalText: string;
  intervalCount?: string;
}

export interface Commute8407Cache {
  fetchedAt: number;
  routeId: number;
  routeName: string;
  stationId: number;
  stationName: string;
  firstTimeAtStartPoint?: string;
  lastTimeAtStartPoint?: string;
  firstTimeAtEndPoint?: string;
  lastTimeAtEndPoint?: string;
  intervals: Commute8407Interval[];
}

export interface Commute8407Event {
  observedAt: number;
  serviceDate: string;
  dayType: CommuteDayType;
  source: CommuteEventSource;
  nextArrivalAt?: number;
  predictMinutes?: number | null;
  remainingStops?: number | null;
  scheduleTimes?: string[];
  note?: string;
}

export interface Commute8407Subscription {
  userId: string;
  enabledAt: number;
  updatedAt: number;
  lastAlertKey?: string | null;
  lastAlertAt?: number | null;
}

export interface Commute8407RealtimeArrival {
  updatedAt?: string;
  remainingStops: number | null;
  estimatedTimeLeftSeconds: number | null;
  remainSeat: number | null;
  predictMinutes: number | null;
  busServiceStatus?: string;
}

export interface Commute8407Snapshot {
  observedAt: number;
  serviceDate: string;
  dayType: CommuteDayType;
  routeCache: Commute8407Cache | null;
  realtimeArrival: Commute8407RealtimeArrival | null;
  historicalScheduleTimes: string[];
  nextHistoricalArrivalAt: number | null;
  targetArrivalAt: number | null;
  predictionSource: CommutePredictionSource;
  note: string;
}

export interface Commute8407ServiceOptions {
  busApi?: Pick<NaverBusApi, "getRoute" | "getStopArrivals">;
  dataDir?: string;
  now?: () => number;
}

const formatParts = (date: Date) => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const lookup = (type: string): string =>
    parts.find((part) => part.type === type)?.value || "";

  return {
    year: lookup("year"),
    month: lookup("month"),
    day: lookup("day"),
    hour: lookup("hour"),
    minute: lookup("minute"),
    weekday: lookup("weekday"),
  };
};

const getServiceDate = (timestamp: number): string => {
  const parts = formatParts(new Date(timestamp));
  return `${parts.year}-${parts.month}-${parts.day}`;
};

export const getCommuteDayType = (timestamp: number): CommuteDayType => {
  const weekday = formatParts(new Date(timestamp)).weekday.toLowerCase();
  if (weekday.startsWith("sat")) return "saturday";
  if (weekday.startsWith("sun")) return "sunday";
  return "weekday";
};

const formatTime = (timestamp: number): string => {
  const parts = formatParts(new Date(timestamp));
  return `${parts.hour}:${parts.minute}`;
};

const formatDateTime = (timestamp: number): string => {
  const parts = formatParts(new Date(timestamp));
  return `${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
};

const parseTimeOnServiceDate = (
  serviceDate: string,
  timeText: string,
): number | null => {
  if (!/^\d{2}:\d{2}$/.test(timeText)) return null;
  const target = new Date(`${serviceDate}T${timeText}:00${KST_OFFSET}`);
  const parsed = target.getTime();
  return Number.isFinite(parsed) ? parsed : null;
};

const toMinutesOfDay = (timestamp: number): number => {
  const parts = formatParts(new Date(timestamp));
  return Number(parts.hour) * 60 + Number(parts.minute);
};

const minutesOfDayToTimeText = (minutes: number): string => {
  const roundedMinutes = Math.min(23 * 60 + 55, Math.max(0, minutes));
  const hour = String(Math.floor(roundedMinutes / 60)).padStart(2, "0");
  const minute = String(roundedMinutes % 60).padStart(2, "0");
  return `${hour}:${minute}`;
};

const normalizeIntervalDayType = (value: string): CommuteDayType | null => {
  const upper = value.trim().toUpperCase();
  if (upper === "WEEKDAYS") return "weekday";
  if (upper === "SATURDAY") return "saturday";
  if (upper === "SUNDAY") return "sunday";
  return null;
};

export const buildHistoricalScheduleTimes = (
  events: Commute8407Event[],
  dayType: CommuteDayType,
): string[] => {
  const minuteBuckets = events
    .filter((event) => event.dayType === dayType)
    .filter((event) => event.source === "realtime")
    .map((event) => event.nextArrivalAt)
    .filter((value): value is number => typeof value === "number")
    .map((timestamp) => toMinutesOfDay(timestamp))
    .sort((a, b) => a - b);

  if (minuteBuckets.length === 0) {
    return [];
  }

  const clustered: number[] = [];
  let cluster: number[] = [minuteBuckets[0]];

  for (let i = 1; i < minuteBuckets.length; i++) {
    const current = minuteBuckets[i];
    const previous = cluster[cluster.length - 1];
    if (current - previous <= 5) {
      cluster.push(current);
      continue;
    }

    clustered.push(Math.floor(cluster[cluster.length - 1] / 5) * 5);
    cluster = [current];
  }

  clustered.push(Math.floor(cluster[cluster.length - 1] / 5) * 5);

  return [...new Set(clustered)].map(minutesOfDayToTimeText);
};

export const findNextHistoricalArrival = (
  scheduleTimes: string[],
  serviceDate: string,
  now: number,
): number | null => {
  for (const timeText of scheduleTimes) {
    const candidate = parseTimeOnServiceDate(serviceDate, timeText);
    if (candidate === null) continue;
    if (candidate >= now) {
      return candidate;
    }
  }

  return null;
};

export const pruneExpiredCommuteEvents = (
  events: Commute8407Event[],
  now: number,
): Commute8407Event[] => {
  const threshold = now - EVENT_RETENTION_MS;
  return events.filter((event) => event.observedAt >= threshold);
};

const createAlertKey = (userId: string, serviceDate: string, targetArrivalAt: number) =>
  `${userId}:${serviceDate}:${Math.round(targetArrivalAt / ALERT_KEY_WINDOW_MS)}`;

const buildRouteCacheFromItem = (
  item: NaverBusRouteItem,
  fetchedAt: number,
): Commute8407Cache => ({
  fetchedAt,
  routeId: item.id,
  routeName: item.displayName || item.name,
  stationId: COMMUTE_8407_STATION_ID,
  stationName: COMMUTE_8407_STATION_NAME,
  firstTimeAtStartPoint: item.firstTimeAtStartPoint,
  lastTimeAtStartPoint: item.lastTimeAtStartPoint,
  firstTimeAtEndPoint: item.firstTimeAtEndPoint,
  lastTimeAtEndPoint: item.lastTimeAtEndPoint,
  intervals: (item.intervalList || []).reduce<Commute8407Interval[]>(
    (list, interval) => {
      const dayType = normalizeIntervalDayType(interval.dayType);
      if (!dayType || !interval.intervalTime) return list;

      list.push({
        dayType,
        intervalText: interval.intervalTime,
        intervalCount: interval.intervalCount,
      });

      return list;
    },
    [],
  ),
});

const buildSchedulePreviewTimes = (
  scheduleTimes: string[],
  serviceDate: string,
  now: number,
  limit = DEFAULT_SCHEDULE_PREVIEW_COUNT,
): string[] => {
  const upcoming = scheduleTimes.filter((timeText) => {
    const candidate = parseTimeOnServiceDate(serviceDate, timeText);
    return candidate !== null && candidate >= now;
  });

  const targetList = upcoming.length > 0 ? upcoming : scheduleTimes;
  return targetList.slice(0, limit);
};

const selectRealtimeArrival = (
  arrivals: NaverBusArrivalItem[],
): Commute8407RealtimeArrival | null => {
  const candidates = arrivals
    .filter((arrival) => arrival.busRouteId === COMMUTE_8407_ROUTE_ID)
    .sort((a, b) => {
      const timeA = a.estimatedTimeLeft ?? Number.MAX_SAFE_INTEGER;
      const timeB = b.estimatedTimeLeft ?? Number.MAX_SAFE_INTEGER;
      return timeA - timeB;
    });

  const target = candidates[0];
  if (!target) return null;

  const predictMinutes =
    target.estimatedTimeLeft !== null
      ? Math.max(1, Math.round(target.estimatedTimeLeft / 60))
      : null;

  return {
    remainingStops: target.remainingStops,
    estimatedTimeLeftSeconds: target.estimatedTimeLeft,
    remainSeat: target.remainSeat,
    predictMinutes,
    busServiceStatus: target.busServiceStatus,
  };
};

export class Commute8407Service {
  private readonly busApi: Pick<NaverBusApi, "getRoute" | "getStopArrivals">;
  private readonly dataDir: string;
  private readonly now: () => number;
  private readonly cacheFilePath: string;
  private readonly eventsFilePath: string;
  private readonly subscriptionsFilePath: string;

  private client: Client | null = null;
  private timer: NodeJS.Timeout | null = null;
  private subscriptions: Commute8407Subscription[] = [];
  private routeCache: Commute8407Cache | null = null;
  private lastPrunedAt = 0;
  private isChecking = false;
  private inflightSnapshot: Promise<Commute8407Snapshot> | null = null;

  constructor(options: Commute8407ServiceOptions = {}) {
    this.busApi = options.busApi ?? new NaverBusApi();
    this.dataDir = options.dataDir ?? DATA_DIR;
    this.now = options.now ?? (() => Date.now());
    this.cacheFilePath = path.join(this.dataDir, CACHE_FILE);
    this.eventsFilePath = path.join(this.dataDir, EVENTS_FILE);
    this.subscriptionsFilePath = path.join(this.dataDir, SUBSCRIPTIONS_FILE);
    this.subscriptions = this.readJsonFile<Commute8407Subscription[]>(
      this.subscriptionsFilePath,
      [],
    );
    this.routeCache = this.readJsonFile<Commute8407Cache | null>(
      this.cacheFilePath,
      null,
    );
  }

  public initialize(client: Client): void {
    this.client = client;
    this.startLoop();
  }

  public isAlertEnabled(userId: string): boolean {
    return this.subscriptions.some((item) => item.userId === userId);
  }

  public enableAlert(userId: string): { alreadyEnabled: boolean } {
    const existing = this.subscriptions.find((item) => item.userId === userId);
    const now = this.now();

    if (existing) {
      existing.updatedAt = now;
      this.saveSubscriptions();
      return { alreadyEnabled: true };
    }

    this.subscriptions.push({
      userId,
      enabledAt: now,
      updatedAt: now,
      lastAlertKey: null,
      lastAlertAt: null,
    });
    this.saveSubscriptions();
    return { alreadyEnabled: false };
  }

  public disableAlert(userId: string): boolean {
    const before = this.subscriptions.length;
    this.subscriptions = this.subscriptions.filter((item) => item.userId !== userId);
    if (this.subscriptions.length === before) {
      return false;
    }

    this.saveSubscriptions();
    return true;
  }

  public async getSnapshot(): Promise<Commute8407Snapshot> {
    if (this.inflightSnapshot) {
      return this.inflightSnapshot;
    }

    this.inflightSnapshot = this.buildSnapshot();

    try {
      return await this.inflightSnapshot;
    } finally {
      this.inflightSnapshot = null;
    }
  }

  public createEmbed(snapshot: Commute8407Snapshot): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setColor(0x1abc9c)
      .setTitle("🚌 8407 통근버스")
      .setDescription(`정류장: **${COMMUTE_8407_STATION_NAME}**`)
      .setTimestamp(new Date(snapshot.observedAt))
      .setFooter({ text: "네이버 버스 공개 데이터를 기준으로 계산합니다." });

    if (snapshot.predictionSource === "realtime" && snapshot.targetArrivalAt) {
      const realtime = snapshot.realtimeArrival;
      const seatText =
        realtime?.remainSeat !== null && realtime?.remainSeat !== undefined
          ? ` | 잔여좌석 ${realtime.remainSeat}석`
          : "";
      const stopText =
        realtime?.remainingStops !== null && realtime?.remainingStops !== undefined
          ? `${realtime.remainingStops}정류장 전`
          : "정류장 정보 없음";
      embed.addFields({
        name: "현재 예측",
        value:
          `실시간 기준 **${formatDateTime(snapshot.targetArrivalAt)}** 도착 예정\n` +
          `${stopText}${seatText}`,
      });
    } else if (snapshot.predictionSource === "historical" && snapshot.targetArrivalAt) {
      embed.addFields({
        name: "현재 예측",
        value:
          `누적 기록 기준 **${formatDateTime(snapshot.targetArrivalAt)}** 도착 예상\n` +
          "실시간 도착 정보가 없어 최근 정류장 기록으로 계산했습니다.",
      });
    } else {
      embed.addFields({
        name: "현재 예측",
        value:
          "실시간 도착 정보와 누적된 정류장 기록이 아직 부족합니다.\n" +
          "아래 네이버 운행정보와 누적 시간표를 참고해주세요.",
      });
    }

    if (snapshot.historicalScheduleTimes.length > 0) {
      const preview = buildSchedulePreviewTimes(
        snapshot.historicalScheduleTimes,
        snapshot.serviceDate,
        snapshot.observedAt,
      ).join(" · ");
      embed.addFields({
        name: "과거시간표",
        value:
          `${preview}\n` +
          `누적 기록 ${snapshot.historicalScheduleTimes.length}개 시간대`,
      });
    } else {
      embed.addFields({
        name: "과거시간표",
        value: this.buildRouteInfoFallbackText(snapshot),
      });
    }

    embed.addFields({
      name: "판단 근거",
      value: snapshot.note,
    });

    return embed;
  }

  private startLoop(): void {
    if (this.timer) return;

    console.log("[Commute8407] 체크 루프 시작");
    this.timer = setInterval(() => {
      void this.runCheck();
    }, CHECK_INTERVAL_MS);

    void this.runCheck();
  }

  private async runCheck(): Promise<void> {
    if (this.isChecking) return;
    this.isChecking = true;

    try {
      const snapshot = await this.getSnapshot();
      await this.sendDueAlerts(snapshot);
    } catch (error: any) {
      console.error("[Commute8407] 체크 실패:", error?.message || error);
    } finally {
      this.isChecking = false;
    }
  }

  private async sendDueAlerts(snapshot: Commute8407Snapshot): Promise<void> {
    if (!this.client) return;
    if (!snapshot.targetArrivalAt) return;

    const now = snapshot.observedAt;
    const timeLeft = snapshot.targetArrivalAt - now;
    if (timeLeft < 0 || timeLeft > ALERT_THRESHOLD_MS) {
      return;
    }

    const updatedSubscriptions = [...this.subscriptions];
    let didUpdateSubscription = false;

    for (const subscription of updatedSubscriptions) {
      const alertKey = createAlertKey(
        subscription.userId,
        snapshot.serviceDate,
        snapshot.targetArrivalAt,
      );

      if (subscription.lastAlertKey === alertKey) {
        continue;
      }

      try {
        const user = await this.client.users.fetch(subscription.userId);
        await this.sendAlertMessage(user, snapshot);

        subscription.lastAlertKey = alertKey;
        subscription.lastAlertAt = now;
        subscription.updatedAt = now;
        didUpdateSubscription = true;
      } catch (error: any) {
        console.error(
          `[Commute8407] DM 전송 실패(${subscription.userId}):`,
          error?.message || error,
        );
      }
    }

    if (didUpdateSubscription) {
      this.subscriptions = updatedSubscriptions;
      this.saveSubscriptions();
    }
  }

  private async sendAlertMessage(
    user: User,
    snapshot: Commute8407Snapshot,
  ): Promise<void> {
    if (!snapshot.targetArrivalAt) return;

    const leadMinutes = Math.max(
      1,
      Math.round((snapshot.targetArrivalAt - snapshot.observedAt) / 60_000),
    );
    const basis =
      snapshot.predictionSource === "realtime"
        ? "실시간 도착 정보"
        : "누적 기록";
    const stopText =
      snapshot.realtimeArrival?.remainingStops !== null &&
      snapshot.realtimeArrival?.remainingStops !== undefined
        ? ` | ${snapshot.realtimeArrival.remainingStops}정류장 전`
        : "";

    await user.send(
      `🚌 **8407** 알림\n` +
        `정류장: **${COMMUTE_8407_STATION_NAME}**\n` +
        `예상 도착: **${formatDateTime(snapshot.targetArrivalAt)}**\n` +
        `${basis} 기준 약 **${leadMinutes}분 전**입니다${stopText}.`,
    );
  }

  private async buildSnapshot(): Promise<Commute8407Snapshot> {
    const now = this.now();
    const serviceDate = getServiceDate(now);
    const dayType = getCommuteDayType(now);

    await this.pruneEventsIfNeeded(now);

    let routeCache = await this.refreshRouteCacheIfNeeded(now);
    const events = this.readEvents();
    const historicalScheduleTimes = buildHistoricalScheduleTimes(events, dayType);
    const nextHistoricalArrivalAt = findNextHistoricalArrival(
      historicalScheduleTimes,
      serviceDate,
      now,
    );

    let realtimeArrival: Commute8407RealtimeArrival | null = null;
    try {
      const arrivals = await this.busApi.getStopArrivals(COMMUTE_8407_STATION_ID);
      realtimeArrival = selectRealtimeArrival(arrivals.busArrivalItems);
      if (realtimeArrival) {
        realtimeArrival.updatedAt = arrivals.updatedAt;
      }
    } catch (error: any) {
      console.error(
        "[Commute8407] 실시간 도착 정보 조회 실패:",
        error?.message || error,
      );
    }

    let targetArrivalAt: number | null = null;
    let predictionSource: CommutePredictionSource = "unavailable";
    let note = "네이버 운행정보를 확인했습니다.";

    if (
      realtimeArrival &&
      realtimeArrival.estimatedTimeLeftSeconds !== null &&
      realtimeArrival.estimatedTimeLeftSeconds >= 0
    ) {
      targetArrivalAt = now + realtimeArrival.estimatedTimeLeftSeconds * 1000;
      predictionSource = "realtime";
      const stopText =
        realtimeArrival.remainingStops !== null
          ? `${realtimeArrival.remainingStops}정류장 전`
          : "정류장 정보 없음";
      note =
        `실시간 도착 정보 우선 사용: ${stopText}` +
        (realtimeArrival.predictMinutes !== null
          ? `, 약 ${realtimeArrival.predictMinutes}분 후`
          : "");
    } else if (nextHistoricalArrivalAt) {
      targetArrivalAt = nextHistoricalArrivalAt;
      predictionSource = "historical";
      note = "실시간 정보가 없어 누적된 정류장 기록으로 다음 도착 시각을 계산했습니다.";
    } else if (routeCache) {
      note =
        "누적된 정류장 기록이 아직 없어 네이버 노선 운행정보(첫차/막차/배차간격)만 표시합니다.";
    } else {
      note = "네이버 데이터를 가져오지 못해 예측 가능한 도착 시각이 없습니다.";
    }

    const snapshot: Commute8407Snapshot = {
      observedAt: now,
      serviceDate,
      dayType,
      routeCache,
      realtimeArrival,
      historicalScheduleTimes,
      nextHistoricalArrivalAt,
      targetArrivalAt,
      predictionSource,
      note,
    };

    this.recordObservation(snapshot, historicalScheduleTimes);
    routeCache = this.routeCache;

    return {
      ...snapshot,
      routeCache,
    };
  }

  private async refreshRouteCacheIfNeeded(now: number): Promise<Commute8407Cache | null> {
    const isFresh =
      this.routeCache && now - this.routeCache.fetchedAt < CACHE_STALE_MS;
    if (isFresh) {
      return this.routeCache;
    }

    try {
      const route = await this.busApi.getRoute(COMMUTE_8407_ROUTE_ID);
      this.routeCache = buildRouteCacheFromItem(route, now);
      this.writeJsonFile(this.cacheFilePath, this.routeCache);
      this.recordNaverRefreshEvent(now);
    } catch (error: any) {
      console.error(
        "[Commute8407] 네이버 노선 정보 갱신 실패:",
        error?.message || error,
      );
    }

    return this.routeCache;
  }

  private recordObservation(
    snapshot: Commute8407Snapshot,
    historicalScheduleTimes: string[],
  ): void {
    const source =
      snapshot.predictionSource === "realtime"
        ? "realtime"
        : snapshot.predictionSource === "historical"
          ? "fallback-cache"
          : null;

    if (!source || !snapshot.targetArrivalAt) {
      return;
    }

    const candidate: Commute8407Event = {
      observedAt: snapshot.observedAt,
      serviceDate: snapshot.serviceDate,
      dayType: snapshot.dayType,
      source,
      nextArrivalAt: snapshot.targetArrivalAt,
      predictMinutes: snapshot.realtimeArrival?.predictMinutes ?? null,
      remainingStops: snapshot.realtimeArrival?.remainingStops ?? null,
      scheduleTimes: buildSchedulePreviewTimes(
        historicalScheduleTimes,
        snapshot.serviceDate,
        snapshot.observedAt,
      ),
      note: snapshot.note,
    };

    const events = this.readEvents();
    const isDuplicate = events.some((event) => {
      if (!event.nextArrivalAt || !candidate.nextArrivalAt) return false;
      if (event.serviceDate !== candidate.serviceDate) return false;
      return Math.abs(event.nextArrivalAt - candidate.nextArrivalAt) <= EVENT_DEDUPE_WINDOW_MS;
    });

    if (!isDuplicate) {
      this.appendEvent(candidate);
    }
  }

  private recordNaverRefreshEvent(now: number): void {
    const event: Commute8407Event = {
      observedAt: now,
      serviceDate: getServiceDate(now),
      dayType: getCommuteDayType(now),
      source: "naver",
      note: "네이버 노선 운행정보 캐시를 갱신했습니다.",
    };

    this.appendEvent(event);
  }

  private buildRouteInfoFallbackText(snapshot: Commute8407Snapshot): string {
    const cache = snapshot.routeCache;
    if (!cache) {
      return "누적된 정류장 기록과 네이버 노선 정보를 아직 가져오지 못했습니다.";
    }

    const interval =
      cache.intervals.find((item) => item.dayType === snapshot.dayType)?.intervalText ||
      "정보 없음";

    return (
      `누적된 정류장 기록이 아직 없습니다.\n` +
      `첫차 ${cache.firstTimeAtStartPoint || "-"} | 막차 ${cache.lastTimeAtStartPoint || "-"}\n` +
      `배차 ${interval}`
    );
  }

  private async pruneEventsIfNeeded(now: number): Promise<void> {
    if (now - this.lastPrunedAt < EVENT_PRUNE_INTERVAL_MS) {
      return;
    }

    const events = this.readEvents();
    const pruned = pruneExpiredCommuteEvents(events, now);
    if (pruned.length !== events.length) {
      this.writeEvents(pruned);
    }
    this.lastPrunedAt = now;
  }

  private readEvents(): Commute8407Event[] {
    if (!fs.existsSync(this.eventsFilePath)) {
      return [];
    }

    try {
      const raw = fs.readFileSync(this.eventsFilePath, "utf8");
      return raw
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Commute8407Event)
        .filter((event) => typeof event.observedAt === "number");
    } catch (error: any) {
      console.error("[Commute8407] 이벤트 로그 읽기 실패:", error?.message || error);
      return [];
    }
  }

  private appendEvent(event: Commute8407Event): void {
    try {
      this.ensureDataDir();
      fs.appendFileSync(this.eventsFilePath, `${JSON.stringify(event)}\n`, "utf8");
    } catch (error: any) {
      console.error("[Commute8407] 이벤트 로그 저장 실패:", error?.message || error);
    }
  }

  private writeEvents(events: Commute8407Event[]): void {
    try {
      this.ensureDataDir();
      const content =
        events.length > 0
          ? `${events.map((event) => JSON.stringify(event)).join("\n")}\n`
          : "";
      fs.writeFileSync(this.eventsFilePath, content, "utf8");
    } catch (error: any) {
      console.error("[Commute8407] 이벤트 로그 재작성 실패:", error?.message || error);
    }
  }

  private saveSubscriptions(): void {
    this.writeJsonFile(this.subscriptionsFilePath, this.subscriptions);
  }

  private ensureDataDir(): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  private readJsonFile<T>(filePath: string, fallback: T): T {
    try {
      if (!fs.existsSync(filePath)) {
        return fallback;
      }

      const raw = fs.readFileSync(filePath, "utf8");
      return JSON.parse(raw) as T;
    } catch (error: any) {
      console.error(
        `[Commute8407] JSON 읽기 실패(${path.basename(filePath)}):`,
        error?.message || error,
      );
      return fallback;
    }
  }

  private writeJsonFile(filePath: string, data: unknown): void {
    try {
      this.ensureDataDir();
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
    } catch (error: any) {
      console.error(
        `[Commute8407] JSON 저장 실패(${path.basename(filePath)}):`,
        error?.message || error,
      );
    }
  }
}

export const commute8407Service = new Commute8407Service();

export default commute8407Service;
