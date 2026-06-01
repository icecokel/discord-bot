require("ts-node/register/transpile-only");

const {
  normalizeCommandArgs,
  joinRegionTokens,
  resolveWeatherRegion,
} = require("../src/features/tools/weather-command-utils");
const kmaData = require("../src/data/kma-data.json");

describe("Weather command args parsing", () => {
  test("normalizes empty tokens", () => {
    expect(normalizeCommandArgs(["", "  ", "서울", " 강남구 "])).toEqual([
      "서울",
      "강남구",
    ]);
  });

  test("joins multi-word region name", () => {
    expect(joinRegionTokens(["부산", "해운대구"])).toBe("부산 해운대구");
    expect(joinRegionTokens(["서울"])).toBe("서울");
  });

  test("resolves region aliases without matching generic short suffixes", () => {
    expect(resolveWeatherRegion(kmaData, "안양동").name).toBe("안양");
    expect(resolveWeatherRegion(kmaData, "광교").name).toBe("광교1동");
  });
});
