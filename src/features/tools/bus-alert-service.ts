import { Client, TextBasedChannel } from "discord.js";
import { readJson, writeJson } from "../../utils/file-manager";
import {
  GyeonggiBusApi,
  GyeonggiBusArrival,
  GyeonggiBusRoute,
  GyeonggiBusStation,
} from "./gyeonggi-bus-api";

const BUS_ALERT_FILE = "bus-alert-subscriptions.json";
const DEFAULT_THRESHOLD_STOPS = 3;
const CHECK_INTERVAL_MS = 60 * 1000;
const MAX_CANDIDATE_COUNT = 5;

export interface BusAlertSubscription {
  id: string;
  shortId: string;
  userId: string;
  channelId: string;
  routeId: string;
  routeName: string;
  stationId: string;
  stationName: string;
  thresholdStops: number;
  createdAt: number;
}

type RuntimeState = {
  lastRemainingStops: number | null;
  lastPlateNo: string | null;
};

export type AddBusAlertResult =
  | { ok: true; subscription: BusAlertSubscription }
  | { ok: false; reason: "MISSING_API_KEY" }
  | { ok: false; reason: "ROUTE_NOT_FOUND" }
  | {
      ok: false;
      reason: "ROUTE_AMBIGUOUS";
      candidates: GyeonggiBusRoute[];
    }
  | { ok: false; reason: "STATION_NOT_FOUND"; route: GyeonggiBusRoute }
  | {
      ok: false;
      reason: "STATION_AMBIGUOUS";
      route: GyeonggiBusRoute;
      candidates: GyeonggiBusStation[];
    }
  | {
      ok: false;
      reason: "STATION_NOT_ON_ROUTE";
      route: GyeonggiBusRoute;
      candidates: GyeonggiBusStation[];
    }
  | { ok: false; reason: "DUPLICATE"; subscription: BusAlertSubscription }
  | { ok: false; reason: "API_ERROR"; message: string };

export type RemoveBusAlertResult =
  | { ok: true; subscription: BusAlertSubscription }
  | { ok: false; reason: "NOT_FOUND" }
  | { ok: false; reason: "FORBIDDEN"; subscription: BusAlertSubscription };

class BusAlertService {
  private readonly busApi = new GyeonggiBusApi(process.env.GYEONGGI_BUS_API_KEY);
  private subscriptions: BusAlertSubscription[] = [];
  private client: Client | null = null;
  private timer: NodeJS.Timeout | null = null;
  private isChecking = false;
  private readonly runtimeStates = new Map<string, RuntimeState>();

  constructor() {
    this.subscriptions = readJson<BusAlertSubscription[]>(BUS_ALERT_FILE, []);
    this.subscriptions.forEach((subscription) => {
      this.runtimeStates.set(subscription.id, {
        lastRemainingStops: null,
        lastPlateNo: null,
      });
    });
  }

  public initialize(client: Client): void {
    this.client = client;
    if (!this.busApi.isConfigured()) {
      console.log(
        "[BusAlert] GYEONGGI_BUS_API_KEY가 없어 버스 알림 기능을 비활성화합니다.",
      );
      return;
    }

    if (this.subscriptions.length > 0) {
      this.startLoop();
      console.log(
        `[BusAlert] ${this.subscriptions.length}개 구독을 로드했습니다.`,
      );
    }
  }

  public isApiConfigured(): boolean {
    return this.busApi.isConfigured();
  }

  public getSubscriptionsByUser(userId: string): BusAlertSubscription[] {
    return this.subscriptions
      .filter((item) => item.userId === userId)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  public async addSubscription(
    userId: string,
    channelId: string,
    routeInput: string,
    stationInput: string,
    thresholdStops = DEFAULT_THRESHOLD_STOPS,
  ): Promise<AddBusAlertResult> {
    if (!this.busApi.isConfigured()) {
      return { ok: false, reason: "MISSING_API_KEY" };
    }

    try {
      const routeResult = await this.resolveRoute(routeInput);
      if (!routeResult.ok) return routeResult;
      const route = routeResult.route;

      const stationResult = await this.resolveStation(stationInput, route);
      if (!stationResult.ok) return stationResult;
      const station = stationResult.station;

      const duplicate = this.subscriptions.find(
        (item) =>
          item.userId === userId &&
          item.channelId === channelId &&
          item.routeId === route.routeId &&
          item.stationId === station.stationId,
      );

      if (duplicate) {
        return { ok: false, reason: "DUPLICATE", subscription: duplicate };
      }

      const subscription: BusAlertSubscription = {
        id: `${userId}-${Date.now()}`,
        shortId: this.generateShortId(),
        userId,
        channelId,
        routeId: route.routeId,
        routeName: route.routeName,
        stationId: station.stationId,
        stationName: station.stationName,
        thresholdStops: Math.max(1, Math.floor(thresholdStops)),
        createdAt: Date.now(),
      };

      this.subscriptions.push(subscription);
      this.runtimeStates.set(subscription.id, {
        lastRemainingStops: null,
        lastPlateNo: null,
      });
      this.saveSubscriptions();
      this.startLoop();

      return { ok: true, subscription };
    } catch (error: any) {
      console.error("[BusAlert] 구독 등록 실패:", error);
      return {
        ok: false,
        reason: "API_ERROR",
        message: error?.message || "알 수 없는 오류",
      };
    }
  }

  public removeSubscriptionByShortId(
    shortId: string,
    requesterId?: string,
    options: { isAdmin?: boolean } = {},
  ): RemoveBusAlertResult {
    const target = this.subscriptions.find((item) => item.shortId === shortId);
    if (!target) return { ok: false, reason: "NOT_FOUND" };

    const canRemove =
      !requesterId ||
      requesterId === target.userId ||
      options.isAdmin === true;

    if (!canRemove) {
      return { ok: false, reason: "FORBIDDEN", subscription: target };
    }

    this.removeSubscriptionById(target.id);
    return { ok: true, subscription: target };
  }

  private removeSubscriptionById(id: string): void {
    this.subscriptions = this.subscriptions.filter((item) => item.id !== id);
    this.runtimeStates.delete(id);
    this.saveSubscriptions();

    if (this.subscriptions.length === 0) {
      this.stopLoop();
    }
  }

  private async resolveRoute(
    routeInput: string,
  ): Promise<
    | { ok: true; route: GyeonggiBusRoute }
    | { ok: false; reason: "ROUTE_NOT_FOUND" }
    | { ok: false; reason: "ROUTE_AMBIGUOUS"; candidates: GyeonggiBusRoute[] }
  > {
    const candidates = await this.busApi.searchRoutes(routeInput);
    const uniqueCandidates = this.uniqueByRouteId(candidates);

    if (uniqueCandidates.length === 0) {
      return { ok: false, reason: "ROUTE_NOT_FOUND" };
    }

    const exactMatches = uniqueCandidates.filter(
      (item) => item.routeName === routeInput || item.routeId === routeInput,
    );

    if (exactMatches.length === 1) {
      return { ok: true, route: exactMatches[0] };
    }

    if (exactMatches.length > 1) {
      return {
        ok: false,
        reason: "ROUTE_AMBIGUOUS",
        candidates: exactMatches.slice(0, MAX_CANDIDATE_COUNT),
      };
    }

    if (uniqueCandidates.length === 1) {
      return { ok: true, route: uniqueCandidates[0] };
    }

    return {
      ok: false,
      reason: "ROUTE_AMBIGUOUS",
      candidates: uniqueCandidates.slice(0, MAX_CANDIDATE_COUNT),
    };
  }

  private async resolveStation(
    stationInput: string,
    route: GyeonggiBusRoute,
  ): Promise<
    | { ok: true; station: GyeonggiBusStation }
    | { ok: false; reason: "STATION_NOT_FOUND"; route: GyeonggiBusRoute }
    | {
        ok: false;
        reason: "STATION_AMBIGUOUS";
        route: GyeonggiBusRoute;
        candidates: GyeonggiBusStation[];
      }
    | {
        ok: false;
        reason: "STATION_NOT_ON_ROUTE";
        route: GyeonggiBusRoute;
        candidates: GyeonggiBusStation[];
      }
  > {
    let routeStations: Array<{ stationId: string; stationName: string }> = [];
    try {
      const fetchedRouteStations = await this.busApi.getRouteStations(route.routeId);
      routeStations = fetchedRouteStations.map((item) => ({
        stationId: item.stationId,
        stationName: item.stationName,
      }));
    } catch (error: any) {
      console.error(
        `[BusAlert] 노선 정류장 조회 실패(routeId=${route.routeId}):`,
        error?.message || error,
      );
    }

    const stationInputTrimmed = stationInput.trim();
    if (/^\d+$/.test(stationInputTrimmed) && routeStations.length > 0) {
      const matchedRouteStation = routeStations.find(
        (item) => item.stationId === stationInputTrimmed,
      );
      if (matchedRouteStation) {
        return {
          ok: true,
          station: {
            stationId: matchedRouteStation.stationId,
            stationName: matchedRouteStation.stationName,
          },
        };
      }
    }

    const stations = await this.busApi.searchStations(stationInput);
    const uniqueStations = this.uniqueByStationId(stations);
    if (uniqueStations.length === 0) {
      return { ok: false, reason: "STATION_NOT_FOUND", route };
    }

    const exactIdMatch = uniqueStations.find(
      (item) => item.stationId === stationInput.trim(),
    );
    if (exactIdMatch) {
      return { ok: true, station: exactIdMatch };
    }

    if (routeStations.length > 0) {
      const routeStationSet = new Set(routeStations.map((item) => item.stationId));
      const stationsOnRoute = uniqueStations.filter((item) =>
        routeStationSet.has(item.stationId),
      );

      if (stationsOnRoute.length === 1) {
        return { ok: true, station: stationsOnRoute[0] };
      }

      if (stationsOnRoute.length > 1) {
        return {
          ok: false,
          reason: "STATION_AMBIGUOUS",
          route,
          candidates: stationsOnRoute.slice(0, MAX_CANDIDATE_COUNT),
        };
      }

      return {
        ok: false,
        reason: "STATION_NOT_ON_ROUTE",
        route,
        candidates: uniqueStations.slice(0, MAX_CANDIDATE_COUNT),
      };
    }

    if (uniqueStations.length === 1) {
      return { ok: true, station: uniqueStations[0] };
    }

    return {
      ok: false,
      reason: "STATION_AMBIGUOUS",
      route,
      candidates: uniqueStations.slice(0, MAX_CANDIDATE_COUNT),
    };
  }

  private uniqueByRouteId(routes: GyeonggiBusRoute[]): GyeonggiBusRoute[] {
    const seen = new Set<string>();
    const deduped: GyeonggiBusRoute[] = [];
    routes.forEach((route) => {
      if (seen.has(route.routeId)) return;
      seen.add(route.routeId);
      deduped.push(route);
    });
    return deduped;
  }

  private uniqueByStationId(stations: GyeonggiBusStation[]): GyeonggiBusStation[] {
    const seen = new Set<string>();
    const deduped: GyeonggiBusStation[] = [];
    stations.forEach((station) => {
      if (seen.has(station.stationId)) return;
      seen.add(station.stationId);
      deduped.push(station);
    });
    return deduped;
  }

  private startLoop(): void {
    if (this.timer || this.subscriptions.length === 0) return;

    console.log("[BusAlert] 체크 루프 시작");

    this.timer = setInterval(() => {
      void this.runCheck();
    }, CHECK_INTERVAL_MS);

    void this.runCheck();
  }

  private stopLoop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    console.log("[BusAlert] 활성 구독 없음. 체크 루프 정지.");
  }

  private async runCheck(): Promise<void> {
    if (!this.client || this.isChecking) return;
    this.isChecking = true;

    try {
      await this.checkSubscriptions();
    } finally {
      this.isChecking = false;
    }
  }

  private async checkSubscriptions(): Promise<void> {
    if (!this.client || this.subscriptions.length === 0) return;

    for (const subscription of this.subscriptions) {
      try {
        const arrivals = await this.busApi.getArrivals(subscription.stationId);
        const targetArrival = arrivals.find(
          (item) =>
            item.routeId === subscription.routeId ||
            item.routeName === subscription.routeName,
        );

        const runtimeState = this.runtimeStates.get(subscription.id) || {
          lastRemainingStops: null,
          lastPlateNo: null,
        };

        if (targetArrival && this.shouldSendAlert(subscription, runtimeState, targetArrival)) {
          await this.sendAlert(subscription, targetArrival);
        }

        this.runtimeStates.set(subscription.id, {
          lastRemainingStops: targetArrival?.remainingStops ?? null,
          lastPlateNo: targetArrival?.plateNo ?? null,
        });
      } catch (error: any) {
        if (this.isUnknownChannelError(error)) {
          console.error(
            `[BusAlert] 채널을 찾을 수 없어 구독 자동 해제: ${subscription.shortId}`,
          );
          this.removeSubscriptionById(subscription.id);
          continue;
        }

        console.error(
          `[BusAlert] 구독 체크 실패 (${subscription.shortId}):`,
          error?.message || error,
        );
      }
    }
  }

  private shouldSendAlert(
    subscription: BusAlertSubscription,
    state: RuntimeState,
    arrival: GyeonggiBusArrival,
  ): boolean {
    const remainingStops = arrival.remainingStops;
    if (remainingStops === null) return false;
    if (remainingStops < 1 || remainingStops > subscription.thresholdStops) {
      return false;
    }

    const wasInRange =
      state.lastRemainingStops !== null &&
      state.lastRemainingStops >= 1 &&
      state.lastRemainingStops <= subscription.thresholdStops;

    if (!wasInRange) {
      return true;
    }

    if (arrival.plateNo && state.lastPlateNo && arrival.plateNo !== state.lastPlateNo) {
      return true;
    }

    return false;
  }

  private async sendAlert(
    subscription: BusAlertSubscription,
    arrival: GyeonggiBusArrival,
  ): Promise<void> {
    if (!this.client) return;

    const channel = (await this.client.channels.fetch(
      subscription.channelId,
    )) as TextBasedChannel | null;

    if (!channel || !("send" in channel)) {
      throw new Error("버스 알림 채널을 찾을 수 없습니다.");
    }

    const remainingStops = arrival.remainingStops ?? "?";
    const predictText =
      arrival.predictMinutes !== null
        ? `${arrival.predictMinutes}분 후 도착 예정`
        : "도착 예정 시간 정보 없음";
    const plateText = arrival.plateNo ? `\n차량번호: ${arrival.plateNo}` : "";

    await channel.send({
      content:
        `🚌 <@${subscription.userId}> ` +
        `**${subscription.routeName}** 버스가 **${remainingStops}정거장 전**입니다!\n` +
        `정류장: **${subscription.stationName}** (\`${subscription.stationId}\`)\n` +
        `${predictText}${plateText}`,
    });
  }

  private isUnknownChannelError(error: any): boolean {
    return (
      error?.code === 10003 || String(error?.message || "").includes("Unknown Channel")
    );
  }

  private generateShortId(): string {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let id = "";

    while (true) {
      id = "";
      for (let i = 0; i < 4; i++) {
        id += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      if (!this.subscriptions.some((item) => item.shortId === id)) {
        break;
      }
    }

    return id;
  }

  private saveSubscriptions(): void {
    writeJson(BUS_ALERT_FILE, this.subscriptions);
  }
}

export const busAlertService = new BusAlertService();
