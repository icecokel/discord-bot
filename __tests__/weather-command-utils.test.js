require("ts-node/register/transpile-only");

const {
  normalizeCommandArgs,
  joinRegionTokens,
} = require("../src/features/tools/weather-command-utils");

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
});
