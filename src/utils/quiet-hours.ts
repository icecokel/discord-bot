/**
 * The one quiet-hours rule for every automatic notification: nothing is sent between
 * 23:00 and 06:00 KST; notifications produced then are held and delivered together at 06:00.
 * NOTIFICATION_QUIET_HOURS overrides the window as "START-END" in KST hours, or "off".
 */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
export const DEFAULT_QUIET_HOURS = { start: 23, end: 6 } as const;

export interface QuietHoursWindow {
  start: number;
  end: number;
}

export const getQuietHoursWindow = (
  value: string | undefined = process.env.NOTIFICATION_QUIET_HOURS,
): QuietHoursWindow | null => {
  const raw = value?.trim();
  if (!raw) return { ...DEFAULT_QUIET_HOURS };
  if (/^(off|false|0|no|none)$/i.test(raw)) return null;
  const match = raw.match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
  const start = match ? Number(match[1]) : NaN;
  const end = match ? Number(match[2]) : NaN;
  if (!(start >= 0 && start <= 23 && end >= 0 && end <= 23 && start !== end)) {
    console.error("[QuietHours] NOTIFICATION_QUIET_HOURS 형식이 올바르지 않아 기본값 23-6을 사용합니다.");
    return { ...DEFAULT_QUIET_HOURS };
  }
  return { start, end };
};

export const getKstHour = (now: Date): number =>
  new Date(now.getTime() + KST_OFFSET_MS).getUTCHours();

export const isQuietHours = (
  now: Date = new Date(),
  window: QuietHoursWindow | null = getQuietHoursWindow(),
): boolean => {
  if (!window) return false;
  const hour = getKstHour(now);
  return window.start < window.end
    ? hour >= window.start && hour < window.end
    : hour >= window.start || hour < window.end;
};

export const formatQuietHours = (window: QuietHoursWindow | null = getQuietHoursWindow()): string =>
  window
    ? `${String(window.start).padStart(2, "0")}:00~${String(window.end).padStart(2, "0")}:00`
    : "꺼짐";
