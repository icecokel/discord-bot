require("ts-node/register/transpile-only");

const {
  buildTodayWeatherNotification,
  buildTomorrowWeatherNotification,
} = require("../src/features/tools/weather-notification-message");

describe("Weather notification message builder", () => {
  test("builds today notification with min/max and precipitation", () => {
    expect(
      buildTodayWeatherNotification("서울", {
        current: null,
        min: 8,
        max: 17,
        popMax: 30,
      }),
    ).toBe("🌤️ 오늘 서울 날씨 | 최저 8° | 최고 17° | 강수확률 30%");
  });

  test("builds tomorrow notification with sky summary", () => {
    expect(
      buildTomorrowWeatherNotification("부산", {
        min: 10,
        max: 19,
        sky: "구름많음 🌥️",
        popMax: 20,
      }),
    ).toBe(
      "🌙 내일 부산 날씨 | 구름많음 🌥️ | 최저 10° | 최고 19° | 강수확률 20%",
    );
  });

  test("falls back to placeholder when temperatures are missing", () => {
    expect(
      buildTomorrowWeatherNotification("제주", {
        min: null,
        max: null,
        sky: "",
        popMax: 0,
      }),
    ).toBe("🌙 내일 제주 날씨 | - | 최저 - | 최고 - | 강수확률 0%");
  });
});
