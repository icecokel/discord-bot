interface CurrentWeather {
  temp: number | null;
  sky: string;
  pty: string;
  pop: number | null;
  desc: string;
}

interface DailySummary {
  min: number | null;
  max: number | null;
  sky: string;
}

interface TodaySummary {
  current: CurrentWeather | null;
  min: number | null;
  max: number | null;
  popMax: number;
}

export interface ShortTermForecastResult {
  today: TodaySummary;
  tomorrow: DailySummary;
  dayAfter: DailySummary;
}

interface KmaResponse<T> {
  response?: {
    header?: {
      resultCode: string;
      resultMsg: string;
    };
    body?: {
      items?: {
        item: T[];
      };
    };
  };
}

interface ShortTermItem {
  baseDate: string;
  baseTime: string;
  category: string; // TMP, SKY, PTY, POP, ...
  fcstDate: string;
  fcstTime: string;
  fcstValue: string;
  nx: number;
  ny: number;
}

const MAX_ERROR_BODY_LENGTH = 180;

const getErrorBodyPreview = (body: string): string => {
  const cleaned = body.replace(/\s+/g, " ").trim();
  return cleaned.length > MAX_ERROR_BODY_LENGTH
    ? `${cleaned.slice(0, MAX_ERROR_BODY_LENGTH)}...`
    : cleaned;
};

const parseKmaJsonResponse = async <T>(
  res: Response,
  apiName: string,
): Promise<KmaResponse<T> | null> => {
  const bodyText = await res.text();

  if (!res.ok) {
    console.error(
      `[${apiName}] HTTP ${res.status} ${res.statusText}: ${getErrorBodyPreview(bodyText)}`,
    );
    return null;
  }

  try {
    return JSON.parse(bodyText) as KmaResponse<T>;
  } catch (error: any) {
    console.error(
      `[${apiName}] JSON 파싱 실패: ${getErrorBodyPreview(bodyText)} (${error.message})`,
    );
    return null;
  }
};

const getSky = (code: number): string => {
  if (code == 1) return "맑음 ☀️";
  if (code == 3) return "구름많음 🌥️";
  if (code == 4) return "흐림 ☁️";
  return "-";
};

const getPty = (code: number): string => {
  // 0(없음), 1(비), 2(비/눈), 3(눈), 4(소나기)
  if (code == 1) return "비 🌧️";
  if (code == 2) return "비/눈 🌨️";
  if (code == 3) return "눈 ❄️";
  if (code == 4) return "소나기 ☔";
  return "";
};

const getBaseDateTime = () => {
  // 단기예보 Base_time: 02, 05, 08, 11, 14, 17, 20, 23 (3시간 간격)
  // API 제공은 발표 후 약 10분 뒤
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const kstTime = new Date(utc + 9 * 60 * 60 * 1000);

  const year = kstTime.getFullYear();
  const month = String(kstTime.getMonth() + 1).padStart(2, "0");
  const date = String(kstTime.getDate()).padStart(2, "0");
  const todayStr = `${year}${month}${date}`;

  let hours = kstTime.getHours();
  let minutes = kstTime.getMinutes();

  const baseTimes = [2, 5, 8, 11, 14, 17, 20, 23];
  let baseTime = 23;
  let baseDate = todayStr;

  // 02:10 이전이면 어제 23시 데이터 사용
  if (hours < 2 || (hours === 2 && minutes < 10)) {
    const yesterday = new Date(kstTime);
    yesterday.setDate(yesterday.getDate() - 1);
    baseDate = `${yesterday.getFullYear()}${String(yesterday.getMonth() + 1).padStart(2, "0")}${String(yesterday.getDate()).padStart(2, "0")}`;
    baseTime = 23;
  } else {
    if (minutes < 10) hours -= 1;
    for (const t of baseTimes) {
      if (hours >= t) baseTime = t;
    }
  }

  const baseTimeStr = String(baseTime).padStart(2, "0") + "00";
  return { baseDate, baseTimeStr, kstTime };
};

export const getShortTermForecast = async (
  nx: number,
  ny: number,
): Promise<ShortTermForecastResult | null> => {
  try {
    const { baseDate, baseTimeStr, kstTime } = getBaseDateTime();
    const shortEndPoint = process.env.WEATHER_SHORT_END_POINT;
    const shortApiKey = process.env.WEATHER_SHORT_API_KRY; // Typo in env maintained

    const url = `${shortEndPoint}/getVilageFcst?serviceKey=${shortApiKey}&pageNo=1&numOfRows=1000&dataType=JSON&base_date=${baseDate}&base_time=${baseTimeStr}&nx=${nx}&ny=${ny}`;

    const res = await fetch(url);
    const data = await parseKmaJsonResponse<ShortTermItem>(
      res,
      "ShortTerm API",
    );
    if (!data) return null;

    if (data.response?.header?.resultCode !== "00") {
      throw new Error(`KMA API Error: ${data.response?.header?.resultMsg}`);
    }

    const items = data.response?.body?.items?.item || [];

    // 날짜 문자열 생성 (YYYYMMDD)
    const yyyymmdd = (d: Date) =>
      `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

    const today = new Date(kstTime);
    const tomorrow = new Date(kstTime);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfter = new Date(kstTime);
    dayAfter.setDate(dayAfter.getDate() + 2);

    const todayStr = yyyymmdd(today);
    const tomorrowStr = yyyymmdd(tomorrow);
    const dayAfterStr = yyyymmdd(dayAfter);
    const currentHour = kstTime.getHours();
    const currentHourStr = String(currentHour).padStart(2, "0") + "00";

    // 데이터 가공
    // 1. 현재 상태 (가장 가까운 미래)
    let current: CurrentWeather | null = null;
    let todayMax = -100;
    let todayMin = 100;
    const todayPops: number[] = [];

    // 2. 내일/모레 요약
    let tomorrowMin = 100,
      tomorrowMax = -100;
    const tomorrowSky: { [key: number]: number } = {};

    let dayAfterMin = 100,
      dayAfterMax = -100;
    const dayAfterSky: { [key: number]: number } = {};

    items.forEach((item) => {
      const val = Number(item.fcstValue);

      // 오늘 데이터 집계
      if (item.fcstDate === todayStr) {
        if (item.category === "TMP") {
          if (val > todayMax) todayMax = val;
          if (val < todayMin) todayMin = val;
        }
        if (item.category === "POP") {
          todayPops.push(val);
        }
      }

      // 내일 데이터
      if (item.fcstDate === tomorrowStr) {
        if (item.category === "TMP") {
          if (val > tomorrowMax) tomorrowMax = val;
          if (val < tomorrowMin) tomorrowMin = val;
        }
        if (item.category === "SKY") {
          tomorrowSky[val] = (tomorrowSky[val] || 0) + 1;
        }
      }

      // 모레 데이터
      if (item.fcstDate === dayAfterStr) {
        if (item.category === "TMP") {
          if (val > dayAfterMax) dayAfterMax = val;
          if (val < dayAfterMin) dayAfterMin = val;
        }
        if (item.category === "SKY") {
          dayAfterSky[val] = (dayAfterSky[val] || 0) + 1;
        }
      }
    });

    // 현재 날씨 찾기 (TMP, SKY, PTY, POP 따로 찾아서 조합)
    const currentItems = items.filter(
      (i) => i.fcstDate === todayStr && i.fcstTime >= currentHourStr,
    );
    // Sort by time
    currentItems.sort((a, b) => Number(a.fcstTime) - Number(b.fcstTime));

    if (currentItems.length > 0) {
      const nearestTime = currentItems[0].fcstTime;
      const nearestSet = currentItems.filter((i) => i.fcstTime === nearestTime);

      const getVal = (cat: string): number | null => {
        const found = nearestSet.find((i) => i.category === cat);
        return found ? Number(found.fcstValue) : null;
      };

      const sky = getVal("SKY");
      const pty = getVal("PTY");
      const tmp = getVal("TMP");
      const pop = getVal("POP");

      if (sky !== null && pty !== null) {
        current = {
          temp: tmp,
          sky: getSky(sky),
          pty: getPty(pty),
          pop: pop,
          desc: `${getSky(sky)}${getPty(pty) ? "/" + getPty(pty) : ""}`,
        };
      }
    }

    // 최빈값 계산 헬퍼
    const getMode = (obj: { [key: number]: number }): number => {
      let maxKey: string | null = null;
      let maxVal = -1;
      for (const [k, v] of Object.entries(obj)) {
        if (v > maxVal) {
          maxVal = v;
          maxKey = k;
        }
      }
      return maxKey ? Number(maxKey) : 0;
    };

    const result: ShortTermForecastResult = {
      today: {
        current: current,
        min: todayMin === 100 ? null : todayMin,
        max: todayMax === -100 ? null : todayMax,
        popMax: todayPops.length > 0 ? Math.max(...todayPops) : 0,
      },
      tomorrow: {
        min: tomorrowMin === 100 ? null : tomorrowMin,
        max: tomorrowMax === -100 ? null : tomorrowMax,
        sky: getSky(getMode(tomorrowSky)),
      },
      dayAfter: {
        min: dayAfterMin === 100 ? null : dayAfterMin,
        max: dayAfterMax === -100 ? null : dayAfterMax,
        sky: getSky(getMode(dayAfterSky)),
      },
    };

    return result;
  } catch (error) {
    console.error("ShortTerm API Error:", error);
    return null;
  }
};

export const getMidTermForecast = async (regId: string): Promise<any> => {
  if (!regId) return null;
  try {
    // 발표 시각(tmFc) 계산 (중기: 06, 18시)
    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    const kstTime = new Date(utc + 9 * 60 * 60 * 1000);
    const year = kstTime.getFullYear();
    const month = String(kstTime.getMonth() + 1).padStart(2, "0");
    const day = String(kstTime.getDate()).padStart(2, "0");
    const hours = kstTime.getHours();

    let tmFc = "";
    if (hours >= 18) tmFc = `${year}${month}${day}1800`;
    else if (hours >= 6) tmFc = `${year}${month}${day}0600`;
    else {
      const yesterday = new Date(kstTime);
      yesterday.setDate(yesterday.getDate() - 1);
      const yYear = yesterday.getFullYear();
      const yMonth = String(yesterday.getMonth() + 1).padStart(2, "0");
      const yDay = String(yesterday.getDate()).padStart(2, "0");
      tmFc = `${yYear}${yMonth}${yDay}1800`;
    }

    const midEndPoint = process.env.WEATHER_MIDDLE_END_POINT;
    const midApiKey = process.env.WEATHER_MIDDLE_API_KEY;

    const url = `${midEndPoint}/getMidLandFcst?serviceKey=${midApiKey}&pageNo=1&numOfRows=10&dataType=JSON&regId=${regId}&tmFc=${tmFc}`;

    const res = await fetch(url);
    const data = await parseKmaJsonResponse<any>(res, "MidTerm API");
    if (!data) return null;

    if (data.response?.header?.resultCode !== "00") {
      console.error(
        `MidTerm API Error: ${data.response?.header?.resultMsg || "Unknown"}`,
      );
      return null;
    }

    const item = data.response?.body?.items?.item
      ? data.response.body.items.item[0]
      : null;
    return item; // 3~10일 정보 포함
  } catch (error) {
    console.error("MidTerm API Error:", error);
    return null;
  }
};
