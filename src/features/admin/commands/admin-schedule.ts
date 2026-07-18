import { EmbedBuilder, Message } from "discord.js";
import { registerAdminCommand } from "../../../core/admin-middleware";
import { SCHEDULE_DEFINITIONS } from "../../../core/scheduler/schedule-definitions";
import {
  getNextScheduleRunAt,
  getScheduleRunRecords,
} from "../../../utils/schedule-run-store";
import type {
  ScheduleRunRecord,
  ScheduleRunStatus,
} from "../../../utils/schedule-run-store";

const STATUS_LABELS: Record<ScheduleRunStatus, string> = {
  never: "⚪ 실행 전",
  running: "🔵 실행 중",
  success: "🟢 성공",
  partial: "🟡 일부 성공",
  failure: "🔴 실패",
};

const formatKstDateTime = (value: string | undefined): string => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
};

export const formatScheduleRunRecord = (
  record: ScheduleRunRecord,
): string => {
  const lines = [
    `상태: ${STATUS_LABELS[record.status]}`,
    `최근 시도: ${formatKstDateTime(record.lastAttemptAt)}`,
    `최근 성공: ${formatKstDateTime(record.lastSuccessAt)}`,
    `최근 실패: ${formatKstDateTime(record.lastFailureAt)}`,
    `다음 실행: ${formatKstDateTime(record.nextRunAt)}`,
  ];

  if (record.detail) {
    lines.push(`메모: ${record.detail.slice(0, 500)}`);
  }

  return lines.join("\n");
};

const handleScheduleStatus = async (message: Message): Promise<void> => {
  const storedRecords = new Map(
    getScheduleRunRecords().map((record) => [record.jobId, record]),
  );
  const now = new Date();
  const records = SCHEDULE_DEFINITIONS.map(
    (definition): ScheduleRunRecord =>
      storedRecords.get(definition.id) || {
        jobId: definition.id,
        label: definition.label,
        cron: definition.cron,
        timezone: definition.timezone,
        status: "never",
        nextRunAt: getNextScheduleRunAt(definition, now),
      },
  );

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("⏱️ 스케줄 실행 상태")
    .setDescription("시간은 Asia/Seoul 기준입니다.")
    .setTimestamp();

  for (const record of records) {
    embed.addFields({
      name: record.label,
      value: formatScheduleRunRecord(record),
      inline: false,
    });
  }

  await message.reply({ embeds: [embed] });
};

registerAdminCommand(
  "스케줄상태",
  handleScheduleStatus,
  "최근 스케줄 실행 결과와 다음 실행 시간 확인",
);

export { handleScheduleStatus };
