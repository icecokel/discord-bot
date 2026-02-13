import { XMLParser } from "fast-xml-parser";

const GYEONGGI_BUS_API_BASE_URL = "http://openapi.gbis.go.kr/ws/rest";
const API_TIMEOUT_MS = 8000;

interface ApiMsgHeader {
  resultCode?: string;
  resultMessage?: string;
}

interface ApiResponseShape {
  response?: {
    msgHeader?: ApiMsgHeader;
    msgBody?: Record<string, unknown>;
  };
}

const xmlParser = new XMLParser({
  ignoreAttributes: true,
  trimValues: true,
});

const toArray = <T>(value: T | T[] | undefined): T[] => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
};

const toStringValue = (value: unknown): string | null => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number") return String(value);
  return null;
};

const normalizeServiceKey = (rawKey: string): string => {
  const trimmed = rawKey.trim();
  if (!trimmed) return trimmed;

  try {
    const decoded = decodeURIComponent(trimmed);
    return decoded || trimmed;
  } catch {
    return trimmed;
  }
};

export interface GyeonggiBusRoute {
  routeId: string;
  routeName: string;
  routeTypeName?: string;
  companyName?: string;
}

export interface GyeonggiBusStation {
  stationId: string;
  stationName: string;
  regionName?: string;
  mobileNo?: string;
}

export interface GyeonggiBusArrival {
  routeId: string;
  routeName: string;
  stationId: string;
  stationName?: string;
  remainingStops: number | null;
  predictMinutes: number | null;
  plateNo?: string;
}

export interface GyeonggiBusRouteStation {
  stationId: string;
  stationName: string;
  stationSeq: number | null;
}

export class GyeonggiBusApi {
  private readonly serviceKey: string | null;

  constructor(serviceKey: string | undefined) {
    const normalized = serviceKey ? normalizeServiceKey(serviceKey) : "";
    this.serviceKey = normalized || null;
  }

  public isConfigured(): boolean {
    return Boolean(this.serviceKey);
  }

  public async searchRoutes(keyword: string): Promise<GyeonggiBusRoute[]> {
    const data = await this.request("busrouteservice", {
      keyword,
    });

    const rows = toArray<Record<string, unknown>>(
      data.msgBody?.busRouteList as Record<string, unknown> | undefined,
    );

    const routes: GyeonggiBusRoute[] = [];
    rows.forEach((row) => {
      const routeId = toStringValue(row.routeId);
      const routeName = toStringValue(row.routeName);
      if (!routeId || !routeName) return;

      const route: GyeonggiBusRoute = {
        routeId,
        routeName,
      };

      const routeTypeName = toStringValue(row.routeTypeName);
      const companyName = toStringValue(row.companyName);
      if (routeTypeName) route.routeTypeName = routeTypeName;
      if (companyName) route.companyName = companyName;

      routes.push(route);
    });

    return routes;
  }

  public async searchStations(keyword: string): Promise<GyeonggiBusStation[]> {
    const data = await this.request("busstationservice", {
      keyword,
    });

    const rows = toArray<Record<string, unknown>>(
      data.msgBody?.busStationList as Record<string, unknown> | undefined,
    );

    const stations: GyeonggiBusStation[] = [];
    rows.forEach((row) => {
      const stationId = toStringValue(row.stationId);
      const stationName =
        toStringValue(row.stationName) || toStringValue(row.stationNm);
      if (!stationId || !stationName) return;

      const station: GyeonggiBusStation = {
        stationId,
        stationName,
      };

      const regionName = toStringValue(row.regionName);
      const mobileNo = toStringValue(row.mobileNo);
      if (regionName) station.regionName = regionName;
      if (mobileNo) station.mobileNo = mobileNo;

      stations.push(station);
    });

    return stations;
  }

  public async getRouteStations(
    routeId: string,
  ): Promise<GyeonggiBusRouteStation[]> {
    const data = await this.request("busrouteservice/station", {
      routeId,
    });

    const rows = toArray<Record<string, unknown>>(
      data.msgBody?.busRouteStationList as Record<string, unknown> | undefined,
    );

    const stations: GyeonggiBusRouteStation[] = [];
    rows.forEach((row) => {
      const stationId = toStringValue(row.stationId);
      const stationName =
        toStringValue(row.stationName) || toStringValue(row.stationNm);
      if (!stationId || !stationName) return;

      stations.push({
        stationId,
        stationName,
        stationSeq: toNumber(row.stationSeq),
      });
    });

    return stations;
  }

  public async getArrivals(stationId: string): Promise<GyeonggiBusArrival[]> {
    const data = await this.request("busarrivalservice", {
      stationId,
    });

    const rows = toArray<Record<string, unknown>>(
      data.msgBody?.busArrivalList as Record<string, unknown> | undefined,
    );

    const arrivals: GyeonggiBusArrival[] = [];
    rows.forEach((row) => {
      const routeId = toStringValue(row.routeId);
      const routeName = toStringValue(row.routeName);
      const itemStationId =
        toStringValue(row.stationId) || toStringValue(row.stationNo);
      if (!routeId || !routeName || !itemStationId) return;

      const arrival: GyeonggiBusArrival = {
        routeId,
        routeName,
        stationId: itemStationId,
        remainingStops: toNumber(row.locationNo1) ?? toNumber(row.locationNo),
        predictMinutes: toNumber(row.predictTime1) ?? toNumber(row.predictTime),
      };

      const stationName =
        toStringValue(row.stationName) || toStringValue(row.stationNm);
      const plateNo = toStringValue(row.plateNo1) || toStringValue(row.plateNo);

      if (stationName) arrival.stationName = stationName;
      if (plateNo) arrival.plateNo = plateNo;

      arrivals.push(arrival);
    });

    return arrivals;
  }

  private async request(
    path: string,
    params: Record<string, string>,
  ): Promise<{
    msgHeader?: ApiMsgHeader;
    msgBody?: Record<string, unknown>;
  }> {
    if (!this.serviceKey) {
      throw new Error(
        "경기버스 API 키가 없습니다. .env에 GYEONGGI_BUS_API_KEY를 설정해주세요.",
      );
    }

    const url = new URL(`${GYEONGGI_BUS_API_BASE_URL}/${path}`);
    url.searchParams.set("serviceKey", this.serviceKey);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    let bodyText = "";
    try {
      const res = await fetch(url.toString(), {
        method: "GET",
        signal: controller.signal,
      });

      bodyText = await res.text();

      if (!res.ok) {
        throw new Error(
          `HTTP ${res.status} ${res.statusText}: ${bodyText.slice(0, 140)}`,
        );
      }

      const parsed = xmlParser.parse(bodyText) as ApiResponseShape;
      const msgHeader = parsed.response?.msgHeader || {};
      const msgBody = parsed.response?.msgBody || {};
      const resultCode = Number(msgHeader.resultCode ?? -1);
      const resultMessage = msgHeader.resultMessage || "알 수 없는 오류";

      if (resultCode !== 0) {
        if (resultCode === 4) {
          return { msgHeader, msgBody: {} };
        }
        throw new Error(
          `API 오류 (code=${resultCode}): ${resultMessage}`,
        );
      }

      return { msgHeader, msgBody };
    } catch (error: any) {
      if (error?.name === "AbortError") {
        throw new Error("경기버스 API 요청 시간 초과");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
