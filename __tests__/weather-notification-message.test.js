require("ts-node/register/transpile-only");

const {
  buildTodayWeatherNotification,
  buildTomorrowWeatherNotification,
} = require("../src/features/tools/weather-notification-message");

describe("Weather notification message builder", () => {
  test("builds today notification with current condition, min/max and precipitation", () => {
    expect(
      buildTodayWeatherNotification("서울", {
        current: {
          temp: 12,
          sky: "흐림 ☁️",
          pty: "비 🌧️",
          pop: 60,
          desc: "흐림 ☁️/비 🌧️",
        },
        min: 8,
        max: 17,
        popMax: 30,
      }),
    ).toBe(
      "🌤️ 서울 오늘 | 흐림 ☁️/비 🌧️ · 강수 30% | 8~17°",
    );
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
      "🌙 부산 내일 | 구름많음 🌥️ · 강수 20% | 10~19°",
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
    ).toBe("🌙 제주 내일 | - · 강수 0% | 기온 -");
  });
});
