const NAVER_BUS_API_BASE_URL = "https://svc-api.map.naver.com";
const API_TIMEOUT_MS = 8000;

export interface NaverBusRouteInterval {
  dayType: string;
  intervalTime?: string;
  intervalCount?: string;
}

export interface NaverBusRouteStop {
  id: number;
  name: string;
  arsId?: string | null;
  arsIds?: string[];
  isNonStop?: boolean;
  isTurningPoint?: boolean;
  type?: string;
}

export interface NaverBusRouteItem {
  id: number;
  name: string;
  displayName?: string;
  firstTimeAtStartPoint?: string;
  lastTimeAtStartPoint?: string;
  firstTimeAtEndPoint?: string;
  lastTimeAtEndPoint?: string;
  intervalList?: NaverBusRouteInterval[];
  busStopGraph?: NaverBusRouteStop[];
}

export interface NaverBusArrivalItem {
  busRouteId: number;
  remainingStops: number | null;
  estimatedTimeLeft: number | null;
  remainSeat: number | null;
  waitingForTurnaround: boolean;
  waitingInGarage: boolean;
  busServiceStatus?: string;
}

export interface NaverBusStopArrivals {
  updatedAt?: string;
  busArrivalItems: NaverBusArrivalItem[];
  arriveSoonBusRouteIds?: number[];
}

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const toStringValue = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return undefined;
};

const toArray = <T>(value: T | T[] | undefined): T[] => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

export class NaverBusApi {
  public async getRoute(routeId: number): Promise<NaverBusRouteItem> {
    const query = new URLSearchParams();
    query.append("includes", "graph");
    query.append("includes", "nonStop");
    query.append("includes", "path");

    const data = await this.request<{ item?: Record<string, unknown> }>(
      `/v1/bus/routes/${routeId}?${query.toString()}`,
    );

    const item = data?.item;
    if (!item) {
      throw new Error(`네이버 버스 노선(${routeId}) 정보를 찾을 수 없습니다.`);
    }

    return {
      id: toNumber(item.id) ?? routeId,
      name: toStringValue(item.name) || String(routeId),
      displayName: toStringValue(item.displayName),
      firstTimeAtStartPoint: toStringValue(item.firstTimeAtStartPoint),
      lastTimeAtStartPoint: toStringValue(item.lastTimeAtStartPoint),
      firstTimeAtEndPoint: toStringValue(item.firstTimeAtEndPoint),
      lastTimeAtEndPoint: toStringValue(item.lastTimeAtEndPoint),
      intervalList: toArray<Record<string, unknown>>(
        item.intervalList as Record<string, unknown> | undefined,
      ).map((interval) => ({
        dayType: toStringValue(interval.dayType) || "",
        intervalTime: toStringValue(interval.intervalTime),
        intervalCount: toStringValue(interval.intervalCount),
      })),
      busStopGraph: toArray<Record<string, unknown>>(
        item.busStopGraph as Record<string, unknown> | undefined,
      ).map((stop) => ({
        id: toNumber(stop.id) ?? 0,
        name: toStringValue(stop.name) || "",
        arsId: toStringValue(stop.arsId),
        arsIds: toArray<string>(stop.arsIds as string[] | undefined),
        isNonStop: Boolean(stop.isNonStop),
        isTurningPoint: Boolean(stop.isTurningPoint),
        type: toStringValue(stop.type),
      })),
    };
  }

  public async getStopArrivals(stopId: number): Promise<NaverBusStopArrivals> {
    const data = await this.request<Record<string, unknown>>(
      `/v2/bus/stops/${stopId}/arrivals`,
    );

    return {
      updatedAt: toStringValue(data.updatedAt),
      arriveSoonBusRouteIds: toArray<number>(
        data.arriveSoonBusRouteIds as number[] | undefined,
      )
        .map((value) => toNumber(value))
        .filter((value): value is number => value !== null),
      busArrivalItems: toArray<Record<string, unknown>>(
        data.busArrivalItems as Record<string, unknown> | undefined,
      ).map((item) => ({
        busRouteId: toNumber(item.busRouteId) ?? 0,
        remainingStops: toNumber(item.remainingStops),
        estimatedTimeLeft: toNumber(item.estimatedTimeLeft),
        remainSeat: toNumber(item.remainSeat),
        waitingForTurnaround: Boolean(item.waitingForTurnaround),
        waitingInGarage: Boolean(item.waitingInGarage),
        busServiceStatus: toStringValue(item.busServiceStatus),
      })),
    };
  }

  private async request<T>(path: string): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    try {
      const response = await fetch(`${NAVER_BUS_API_BASE_URL}${path}`, {
        method: "GET",
        signal: controller.signal,
      });

      const bodyText = await response.text();
      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status} ${response.statusText}: ${bodyText.slice(0, 140)}`,
        );
      }

      return JSON.parse(bodyText) as T;
    } catch (error: any) {
      if (error?.name === "AbortError") {
        throw new Error("네이버 버스 API 요청 시간 초과");
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export default NaverBusApi;
