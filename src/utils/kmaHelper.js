const getSky = (code) => {
  if (code == 1) return "맑음 ☀️";
  if (code == 3) return "구름많음 🌥️";
  if (code == 4) return "흐림 ☁️";
  return "-";
};

const getPty = (code) => {
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
    for (let t of baseTimes) {
      if (hours >= t) baseTime = t;
    }
  }

  const baseTimeStr = String(baseTime).padStart(2, "0") + "00";
  return { baseDate, baseTimeStr, kstTime };
};

const getShortTermForecast = async (nx, ny) => {
  try {
    const { baseDate, baseTimeStr, kstTime } = getBaseDateTime();
    const shortEndPoint = process.env.WEATHER_SHORT_END_POINT;
    const shortApiKey = process.env.WEATHER_SHORT_API_KRY; // Typo in env maintained

    const url = `${shortEndPoint}/getVilageFcst?serviceKey=${shortApiKey}&pageNo=1&numOfRows=1000&dataType=JSON&base_date=${baseDate}&base_time=${baseTimeStr}&nx=${nx}&ny=${ny}`;

    const res = await fetch(url);
    const data = await res.json();

    if (data.response?.header?.resultCode !== "00") {
      throw new Error(`KMA API Error: ${data.response?.header?.resultMsg}`);
    }

    const items = data.response.body.items.item;

    // 날짜 문자열 생성 (YYYYMMDD)
    const yyyymmdd = (d) =>
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
    let current = null;
    let todayMax = -100;
    let todayMin = 100;
    let todayPops = [];

    // 2. 내일/모레 요약
    let tomorrowMin = 100,
      tomorrowMax = -100,
      tomorrowSky = {},
      tomorrowPty = {};
    let dayAfterMin = 100,
      dayAfterMax = -100,
      dayAfterSky = {},
      dayAfterPty = {};

    items.forEach((item) => {
      const val = Number(item.fcstValue);

      // 오늘 데이터 집계
      if (item.fcstDate === todayStr) {
        // 현재 날씨 (현재 시간과 가장 가까운 fcstTime)
        if (!current && item.fcstTime >= currentHourStr) {
          // 여기서는 정확한 매칭보다, 카테고리별로 수집해야함.
          // 구조 변경: category별로 Map에 저장 후 조합하는게 나음.
        }

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
    // items는 (Date, Time, Category) unique key
    // Filter items for today & nearest future from now
    const currentItems = items.filter(
      (i) => i.fcstDate === todayStr && i.fcstTime >= currentHourStr,
    );
    // Sort by time
    currentItems.sort((a, b) => Number(a.fcstTime) - Number(b.fcstTime));

    if (currentItems.length > 0) {
      const nearestTime = currentItems[0].fcstTime;
      const nearestSet = currentItems.filter((i) => i.fcstTime === nearestTime);

      const getVal = (cat) => {
        const found = nearestSet.find((i) => i.category === cat);
        return found ? Number(found.fcstValue) : null;
      };

      const sky = getVal("SKY");
      const pty = getVal("PTY");
      const tmp = getVal("TMP");
      const pop = getVal("POP");

      current = {
        temp: tmp,
        sky: getSky(sky),
        pty: getPty(pty),
        pop: pop,
        desc: `${getSky(sky)}${getPty(pty) ? "/" + getPty(pty) : ""}`,
      };
    }

    // 최빈값 계산 헬퍼
    const getMode = (obj) => {
      let maxKey = null;
      let maxVal = -1;
      for (let [k, v] of Object.entries(obj)) {
        if (v > maxVal) {
          maxVal = v;
          maxKey = k;
        }
      }
      return maxKey;
    };

    const result = {
      today: {
        current: current,
        min: todayMin === 100 ? null : todayMin, // 이미 지난 시간의 최저는 알 수 없을 수도 있음 (TMN은 06시 발표라..) -> TMP로 대략 집계
        max: todayMax === -100 ? null : todayMax,
        popMax: todayPops.length > 0 ? Math.max(...todayPops) : 0,
      },
      tomorrow: {
        min: tomorrowMin,
        max: tomorrowMax,
        sky: getSky(getMode(tomorrowSky)),
      },
      dayAfter: {
        min: dayAfterMin,
        max: dayAfterMax,
        sky: getSky(getMode(dayAfterSky)),
      },
    };

    return result;
  } catch (error) {
    console.error("ShortTerm API Error:", error);
    return null;
  }
};

const getMidTermForecast = async (regId) => {
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
    const data = await res.json();

    if (data.response?.header?.resultCode !== "00") return null;

    const item = data.response.body.items.item[0];
    return item; // 3~10일 정보 포함
  } catch (error) {
    console.error("MidTerm API Error:", error);
    return null;
  }
};

module.exports = {
  getShortTermForecast,
  getMidTermForecast,
};
