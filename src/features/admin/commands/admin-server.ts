import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { EmbedBuilder, Message } from "discord.js";
import { registerAdminCommand } from "../../../core/admin-middleware";

const execFile = promisify(execFileCallback);
const COMMAND_TIMEOUT_MS = 5000;
const MAX_FIELD_VALUE_LENGTH = 1000;
const PM2_APP_NAME = "discord-bot";

type Pm2App = {
  name?: string;
  pid?: number;
  monit?: {
    memory?: number;
    cpu?: number;
  };
  pm2_env?: {
    status?: string;
    restart_time?: number;
    pm_uptime?: number;
  };
};

const truncate = (value: string, maxLength = MAX_FIELD_VALUE_LENGTH): string => {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
};

const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes < 0) return "unknown";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)}${units[unitIndex]}`;
};

const formatDuration = (milliseconds: number): string => {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return "unknown";
  const totalSeconds = Math.floor(milliseconds / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(" ");
};

const getDefaultDiskPaths = (): string[] => {
  const candidates = [
    process.cwd(),
    os.homedir(),
    "/home/icenux/hdd",
    "/home/icenux/projects",
    "/",
  ];

  return candidates.filter(Boolean);
};

export const resolveAllowedDiskPaths = (_args: string[] = []): string[] => {
  const configured = process.env.ADMIN_DISK_PATHS?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const candidates = configured && configured.length > 0
    ? configured
    : getDefaultDiskPaths();
  const uniquePaths = new Set<string>();

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (existsSync(resolved)) {
      uniquePaths.add(resolved);
    }
  }

  return Array.from(uniquePaths);
};

export const redactEnvSummary = (): string => {
  return [
    `AI_PROVIDER=${process.env.AI_PROVIDER || "unset"}`,
    `AI_FALLBACK_PROVIDER=${process.env.AI_FALLBACK_PROVIDER || "unset"}`,
    `CODEX_MODEL=${process.env.CODEX_MODEL || "unset"}`,
    `CODEX_SANDBOX=${process.env.CODEX_SANDBOX || "unset"}`,
    `CODEX_APPROVAL_POLICY=${process.env.CODEX_APPROVAL_POLICY || "unset"}`,
    `CODEX_ADMIN_SANDBOX=${process.env.CODEX_ADMIN_SANDBOX || "unset"}`,
    `CODEX_ADMIN_SEARCH=${process.env.CODEX_ADMIN_SEARCH || "unset"}`,
    `CODEX_BIN_SET=${Boolean(process.env.CODEX_BIN)}`,
    `CODEX_WORKDIR_SET=${Boolean(process.env.CODEX_WORKDIR)}`,
    `ADMIN_ID_SET=${Boolean(process.env.ADMIN_ID)}`,
    `DISCORD_TOKEN_SET=${Boolean(process.env.DISCORD_BOT_TOKEN)}`,
  ].join("\n");
};

export const formatPm2AppStatus = (apps: Pm2App[]): string => {
  const app = apps.find((item) => item.name === PM2_APP_NAME);
  if (!app) {
    return `${PM2_APP_NAME} PM2 프로세스를 찾지 못했습니다.`;
  }

  const uptime = app.pm2_env?.pm_uptime
    ? formatDuration(Date.now() - app.pm2_env.pm_uptime)
    : "unknown";

  return [
    `${PM2_APP_NAME}: ${app.pm2_env?.status || "unknown"}`,
    `pid=${app.pid || "unknown"}`,
    `restart=${app.pm2_env?.restart_time ?? "unknown"}`,
    `uptime=${uptime}`,
    `memory=${formatBytes(app.monit?.memory || 0)}`,
    `cpu=${app.monit?.cpu ?? "unknown"}%`,
  ].join("\n");
};

const getPm2Binary = (): string => {
  if (process.env.PM2_BIN) return process.env.PM2_BIN;

  const localPm2 = path.join(os.homedir(), ".local", "npm-global", "bin", "pm2");
  if (existsSync(localPm2)) return localPm2;

  return "pm2";
};

const createBaseEmbed = (title: string): EmbedBuilder => {
  return new EmbedBuilder()
    .setColor(0x2b90d9)
    .setTitle(title)
    .setTimestamp()
    .setFooter({ text: "Admin Server Console" });
};

const getPackageVersion = (): string => {
  try {
    const packageJsonPath = path.resolve(process.cwd(), "package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      version?: string;
    };
    return packageJson.version || "unknown";
  } catch {
    return "unknown";
  }
};

const hashFile = (filePath: string): string | null => {
  try {
    if (!existsSync(filePath)) return null;
    return createHash("sha256")
      .update(readFileSync(filePath))
      .digest("hex");
  } catch {
    return null;
  }
};

const parseDfOutput = (stdout: string, diskPath: string): string => {
  const lines = stdout.trim().split("\n").filter(Boolean);
  const row = lines[lines.length - 1];
  if (!row) return `${diskPath}: df 결과 없음`;

  const columns = row.trim().split(/\s+/);
  if (columns.length < 5) return `${diskPath}: ${row}`;

  const [filesystem, size, used, available, usePercent] = columns;
  const mountedOn = columns.slice(5).join(" ") || diskPath;

  return [
    `path=${diskPath}`,
    `fs=${filesystem}`,
    `size=${size}, used=${used}, avail=${available}, use=${usePercent}`,
    `mount=${mountedOn}`,
  ].join("\n");
};

const handleServerStatus = async (message: Message) => {
  const memory = process.memoryUsage();
  const embed = createBaseEmbed("서버 상태")
    .addFields(
      {
        name: "런타임",
        value: [
          `node=${process.version}`,
          `platform=${process.platform}/${process.arch}`,
          `pid=${process.pid}`,
          `process_uptime=${formatDuration(process.uptime() * 1000)}`,
          `system_uptime=${formatDuration(os.uptime() * 1000)}`,
        ].join("\n"),
      },
      {
        name: "메모리",
        value: [
          `rss=${formatBytes(memory.rss)}`,
          `heap=${formatBytes(memory.heapUsed)} / ${formatBytes(memory.heapTotal)}`,
          `system_free=${formatBytes(os.freemem())} / ${formatBytes(os.totalmem())}`,
        ].join("\n"),
      },
      {
        name: "환경",
        value: redactEnvSummary(),
      },
    );

  await message.reply({ embeds: [embed] });
};

const handleDisk = async (message: Message, args: string[]) => {
  const diskPaths = resolveAllowedDiskPaths(args);
  const embed = createBaseEmbed("디스크 상태");

  if (diskPaths.length === 0) {
    embed.setDescription("조회 가능한 디스크 경로가 없습니다.");
    await message.reply({ embeds: [embed] });
    return;
  }

  for (const diskPath of diskPaths.slice(0, 5)) {
    try {
      const { stdout } = await execFile("df", ["-h", diskPath], {
        timeout: COMMAND_TIMEOUT_MS,
        maxBuffer: 100_000,
      });
      embed.addFields({
        name: diskPath,
        value: truncate(parseDfOutput(stdout, diskPath)),
      });
    } catch (error: any) {
      embed.addFields({
        name: diskPath,
        value: truncate(`조회 실패: ${error?.message || "unknown error"}`),
      });
    }
  }

  await message.reply({ embeds: [embed] });
};

const handleProcess = async (message: Message) => {
  const embed = createBaseEmbed("프로세스 상태");

  try {
    const { stdout } = await execFile(getPm2Binary(), ["jlist"], {
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: 1_000_000,
    });
    const apps = JSON.parse(stdout) as Pm2App[];
    embed.addFields({
      name: PM2_APP_NAME,
      value: truncate(formatPm2AppStatus(apps)),
    });
  } catch (error: any) {
    embed.addFields({
      name: "PM2",
      value: truncate(`조회 실패: ${error?.message || "unknown error"}`),
    });
  }

  await message.reply({ embeds: [embed] });
};

const handleDeployStatus = async (message: Message) => {
  const bundlePath = path.resolve(process.cwd(), "dist", "index.js");
  const bundleHash = hashFile(bundlePath);
  const embed = createBaseEmbed("배포 상태")
    .addFields(
      {
        name: "애플리케이션",
        value: [
          `cwd=${process.cwd()}`,
          `package_version=${getPackageVersion()}`,
          `main=${bundlePath}`,
          `bundle_sha256=${bundleHash || "missing"}`,
        ].join("\n"),
      },
      {
        name: "PM2",
        value: `app=${PM2_APP_NAME}\npm2=${getPm2Binary()}`,
      },
    );

  await message.reply({ embeds: [embed] });
};

registerAdminCommand("서버상태", handleServerStatus, "서버 런타임 상태 확인");
registerAdminCommand("디스크", handleDisk, "허용된 디스크 사용량 확인");
registerAdminCommand("프로세스", handleProcess, "discord-bot PM2 상태 확인");
registerAdminCommand("배포상태", handleDeployStatus, "배포 번들 상태 확인");

export {
  handleDeployStatus,
  handleDisk,
  handleProcess,
  handleServerStatus,
};
