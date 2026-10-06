require("ts-node/register/transpile-only");
const fs = require("node:fs");
const os = require("node:os");
const childProcess = require("node:child_process");

const {
  buildServerHealthBriefingLine,
  collectServerHealth,
} = require("../src/utils/server-health");

describe("server health briefing", () => {
  afterEach(() => jest.restoreAllMocks());

  const mockMacStats = (freePercent) => {
    jest.spyOn(os, "platform").mockReturnValue("darwin");
    jest.spyOn(childProcess, "execFileSync").mockReturnValue(
      `System-wide memory free percentage: ${freePercent}%`,
    );
    jest.spyOn(fs, "statfsSync").mockReturnValue({
      bsize: 1,
      blocks: 100,
      bavail: 40,
    });
  };

  test("formats a healthy resource snapshot", () => {
    expect(
      buildServerHealthBriefingLine({
        diskUsagePercent: 42,
        memoryAvailablePercent: 75,
        warnings: [],
      }),
    ).toBe("🖥️ 서버 | 정상 · 디스크 42% · 메모리 여유 75%");
  });

  test("formats warning details", () => {
    expect(
      buildServerHealthBriefingLine({
        diskUsagePercent: 91,
        memoryAvailablePercent: 7,
        warnings: ["디스크 91%", "메모리 여유 7%"],
      }),
    ).toBe("🖥️ 서버 | 주의 · 디스크 91% · 메모리 여유 7%");
  });

  test("uses macOS available memory instead of raw free memory", () => {
    mockMacStats(75);
    jest.spyOn(os, "freemem").mockReturnValue(0);

    const snapshot = collectServerHealth(process.cwd());

    expect(snapshot).toEqual({
      diskUsagePercent: 60,
      memoryAvailablePercent: 75,
      warnings: [],
    });
    expect(childProcess.execFileSync).toHaveBeenCalledWith(
      "memory_pressure",
      ["-Q"],
      expect.objectContaining({ timeout: 3000 }),
    );
  });

  test("warns when macOS available memory reaches 10%", () => {
    mockMacStats(10);

    expect(collectServerHealth(process.cwd()).warnings).toEqual([
      "메모리 여유 10%",
    ]);
  });

  test("reports an unavailable memory reading without a fake usage warning", () => {
    mockMacStats(75);
    childProcess.execFileSync.mockReturnValue("unexpected output");
    jest.spyOn(console, "error").mockImplementation(() => {});

    const snapshot = collectServerHealth(process.cwd());

    expect(snapshot.memoryAvailablePercent).toBeNull();
    expect(snapshot.warnings).toEqual(["메모리 확인 실패"]);
  });

  test("collects disk and memory availability for the current workspace", () => {
    const snapshot = collectServerHealth(process.cwd());

    expect(snapshot.diskUsagePercent).toEqual(expect.any(Number));
    expect(snapshot.memoryAvailablePercent).toBeGreaterThanOrEqual(0);
    expect(snapshot.memoryAvailablePercent).toBeLessThanOrEqual(100);
  });
});
