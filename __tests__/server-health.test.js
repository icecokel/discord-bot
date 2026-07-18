require("ts-node/register/transpile-only");

const {
  buildServerHealthBriefingLine,
  collectServerHealth,
} = require("../src/utils/server-health");

describe("server health briefing", () => {
  test("formats a healthy resource snapshot", () => {
    expect(
      buildServerHealthBriefingLine({
        diskUsagePercent: 42,
        memoryUsagePercent: 61,
        warnings: [],
      }),
    ).toBe("🖥️ 서버 | 정상 · 디스크 42% · 메모리 61%");
  });

  test("formats warning details", () => {
    expect(
      buildServerHealthBriefingLine({
        diskUsagePercent: 91,
        memoryUsagePercent: 93,
        warnings: ["디스크 91%", "메모리 93%"],
      }),
    ).toContain("주의: 디스크 91%, 메모리 93%");
  });

  test("collects disk and memory usage for the current workspace", () => {
    const snapshot = collectServerHealth(process.cwd());

    expect(snapshot.diskUsagePercent).toEqual(expect.any(Number));
    expect(snapshot.memoryUsagePercent).toBeGreaterThanOrEqual(0);
    expect(snapshot.memoryUsagePercent).toBeLessThanOrEqual(100);
  });
});
