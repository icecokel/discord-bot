import fs from "node:fs";
import os from "node:os";
import { execFileSync } from "node:child_process";

const DEFAULT_DISK_WARNING_PERCENT = 85;
const DEFAULT_MEMORY_AVAILABLE_WARNING_PERCENT = 10;

export interface ServerHealthSnapshot {
  diskUsagePercent: number | null;
  memoryAvailablePercent: number | null;
  warnings: string[];
}

const toPercent = (used: number, total: number): number => {
  if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) {
    return 0;
  }
  return Math.round((used / total) * 100);
};

const getMemoryAvailablePercent = (): number | null => {
  if (os.platform() !== "darwin") {
    return toPercent(os.freemem(), os.totalmem());
  }

  try {
    const output = execFileSync("memory_pressure", ["-Q"], {
      encoding: "utf8",
      timeout: 3000,
    });
    const match = output.match(/System-wide memory free percentage:\s*(\d+)%/);
    const percent = match ? Number(match[1]) : NaN;
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      throw new Error("memory_pressure output has no valid free percentage");
    }
    return percent;
  } catch (error) {
    console.error("[ServerHealth] 메모리 상태 확인 실패:", error);
    return null;
  }
};

export const collectServerHealth = (
  diskPath: string = process.cwd(),
): ServerHealthSnapshot => {
  const memoryAvailablePercent = getMemoryAvailablePercent();
  let diskUsagePercent: number | null = null;
  const warnings: string[] = [];

  try {
    const stats = fs.statfsSync(diskPath);
    const blockSize = Number(stats.bsize);
    const totalDisk = Number(stats.blocks) * blockSize;
    const availableDisk = Number(stats.bavail) * blockSize;
    diskUsagePercent = toPercent(totalDisk - availableDisk, totalDisk);
  } catch (error) {
    console.error("[ServerHealth] 디스크 상태 확인 실패:", error);
    warnings.push("디스크 확인 실패");
  }

  if (
    diskUsagePercent !== null &&
    diskUsagePercent >= DEFAULT_DISK_WARNING_PERCENT
  ) {
    warnings.push(`디스크 ${diskUsagePercent}%`);
  }
  if (memoryAvailablePercent === null) {
    warnings.push("메모리 확인 실패");
  } else if (
    memoryAvailablePercent <= DEFAULT_MEMORY_AVAILABLE_WARNING_PERCENT
  ) {
    warnings.push(`메모리 여유 ${memoryAvailablePercent}%`);
  }

  return {
    diskUsagePercent,
    memoryAvailablePercent,
    warnings,
  };
};

export const buildServerHealthBriefingLine = (
  snapshot: ServerHealthSnapshot,
): string => {
  const disk =
    snapshot.diskUsagePercent === null
      ? "디스크 확인 불가"
      : `디스크 ${snapshot.diskUsagePercent}%`;
  const memory =
    snapshot.memoryAvailablePercent === null
      ? "메모리 확인 불가"
      : `메모리 여유 ${snapshot.memoryAvailablePercent}%`;
  const resources = `${disk} · ${memory}`;

  if (snapshot.warnings.length === 0) {
    return `🖥️ 서버 | 정상 · ${resources}`;
  }

  return `🖥️ 서버 | 주의 · ${resources}`;
};
