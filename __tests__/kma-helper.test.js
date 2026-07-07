require("ts-node/register/transpile-only");

const { getShortTermForecast } = require("../src/utils/kma-helper");

const createItem = (fcstDate, fcstTime, category, fcstValue) => ({
  baseDate: "20260708",
  baseTime: "0500",
  category,
  fcstDate,
  fcstTime,
  fcstValue: String(fcstValue),
  nx: 60,
  ny: 127,
});

const mockKmaResponse = (items) => ({
  ok: true,
  text: jest.fn().mockResolvedValue(
    JSON.stringify({
      response: {
        header: {
          resultCode: "00",
          resultMsg: "NORMAL_SERVICE",
        },
        body: {
          items: {
            item: items,
          },
        },
      },
    }),
  ),
});

describe("kma helper short term forecast", () => {
  const originalEnv = {
    WEATHER_SHORT_END_POINT: process.env.WEATHER_SHORT_END_POINT,
    WEATHER_SHORT_API_KRY: process.env.WEATHER_SHORT_API_KRY,
  };

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-07-08T00:30:00Z"));
    process.env.WEATHER_SHORT_END_POINT = "https://kma.example.test";
    process.env.WEATHER_SHORT_API_KRY = "test-key";
  });

  afterEach(() => {
    jest.useRealTimers();
    if (originalEnv.WEATHER_SHORT_END_POINT === undefined) {
      delete process.env.WEATHER_SHORT_END_POINT;
    } else {
      process.env.WEATHER_SHORT_END_POINT = originalEnv.WEATHER_SHORT_END_POINT;
    }
    if (originalEnv.WEATHER_SHORT_API_KRY === undefined) {
      delete process.env.WEATHER_SHORT_API_KRY;
    } else {
      process.env.WEATHER_SHORT_API_KRY = originalEnv.WEATHER_SHORT_API_KRY;
    }
    jest.restoreAllMocks();
  });

  test("uses precipitation type summary before sky summary for tomorrow", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(
      mockKmaResponse([
        createItem("20260708", "1000", "TMP", 26),
        createItem("20260708", "1000", "SKY", 1),
        createItem("20260708", "1000", "PTY", 0),
        createItem("20260708", "1000", "POP", 10),
        createItem("20260709", "0900", "TMP", 22),
        createItem("20260709", "0900", "SKY", 1),
        createItem("20260709", "0900", "PTY", 0),
        createItem("20260709", "0900", "POP", 30),
        createItem("20260709", "1200", "TMP", 27),
        createItem("20260709", "1200", "SKY", 1),
        createItem("20260709", "1200", "PTY", 1),
        createItem("20260709", "1200", "POP", 70),
        createItem("20260709", "1500", "TMP", 25),
        createItem("20260709", "1500", "SKY", 3),
        createItem("20260709", "1500", "PTY", 4),
        createItem("20260709", "1500", "POP", 80),
      ]),
    );

    const forecast = await getShortTermForecast(60, 127);

    expect(forecast.tomorrow.sky).toBe("비 🌧️");
  });
});
