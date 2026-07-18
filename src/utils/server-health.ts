import fs from "node:fs";
import os from "node:os";

const DEFAULT_DISK_WARNING_PERCENT = 85;
const DEFAULT_MEMORY_WARNING_PERCENT = 90;

export interface ServerHealthSnapshot {
  diskUsagePercent: number | null;
  memoryUsagePercent: number;
  warnings: string[];
}

const toPercent = (used: number, total: number): number => {
  if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) {
    return 0;
  }
  return Math.round((used / total) * 100);
};

export const collectServerHealth = (
  diskPath: string = process.cwd(),
): ServerHealthSnapshot => {
  const totalMemory = os.totalmem();
  const memoryUsagePercent = toPercent(totalMemory - os.freemem(), totalMemory);
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
  if (memoryUsagePercent >= DEFAULT_MEMORY_WARNING_PERCENT) {
    warnings.push(`메모리 ${memoryUsagePercent}%`);
  }

  return {
    diskUsagePercent,
    memoryUsagePercent,
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
  const resources = `${disk} · 메모리 ${snapshot.memoryUsagePercent}%`;

  if (snapshot.warnings.length === 0) {
    return `🖥️ 서버 | 정상 · ${resources}`;
  }

  return `🖥️ 서버 | 주의: ${snapshot.warnings.join(", ")} · ${resources}`;
};
