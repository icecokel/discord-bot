import type { Client } from "discord.js";
import { sendNotifications } from "../../utils/notification-batch";
import type { NotificationSender } from "../../utils/notification-batch";
import {
  loadGmailMonitorState,
  saveGmailMonitorState,
} from "../../utils/gmail-monitor-store";
import type { GmailMonitorState } from "../../utils/gmail-monitor-store";
import {
  recordScheduleRunCompletion,
  recordScheduleRunFailure,
  recordScheduleRunStart,
} from "../../utils/schedule-run-store";
import {
  GMAIL_SCHEDULE,
  isGmailMonitorEnabled,
} from "../../core/scheduler/schedule-definitions";
import { fetchGmailUpdates } from "./gmail-source";
import type { GmailConfig } from "./gmail-source";
import { buildGmailNotificationChunks } from "./gmail-message";

export interface GmailMonitorResult {
  status: "success" | "partial" | "failure" | "skipped";
  detail: string;
}

const MAX_MESSAGES_PER_RUN = 10;
const DEFAULT_MAILBOX = "INBOX";

// Process-wide lock, same as the X monitor; a single bot process is assumed.
let running = false;

export const getGmailConfig = (): GmailConfig | null => {
  const address = process.env.GMAIL_ADDRESS?.trim();
  // Google shows app passwords in groups of four separated by spaces.
  const appPassword = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");
  if (!address || !appPassword) return null;
  return {
    address,
    appPassword,
    mailbox: process.env.GMAIL_MONITOR_MAILBOX?.trim() || DEFAULT_MAILBOX,
    query: process.env.GMAIL_MONITOR_QUERY?.trim() || "",
  };
};

export const describeGmailError = (error: unknown): string => {
  // Never forward raw IMAP responses: they can echo account details.
  const err = error as {
    authenticationFailed?: boolean; mailboxMissing?: boolean; code?: string; message?: string;
  } | undefined;
  if (err?.authenticationFailed) {
    return "Gmail 로그인 실패: GMAIL_ADDRESS와 앱 비밀번호, IMAP 사용 설정을 확인하세요.";
  }
  if (err?.mailboxMissing) {
    return "Gmail 메일함을 찾지 못했습니다: GMAIL_MONITOR_MAILBOX 값을 확인하세요.";
  }
  if (err?.message?.startsWith("Gmail ")) return err.message.slice(0, 160);
  const code = typeof err?.code === "string" && /^[A-Za-z_]{2,40}$/.test(err.code) ? ` (${err.code})` : "";
  return `Gmail 확인 실패${code}: 네트워크와 IMAP 설정을 확인하세요.`;
};

const record = (action: () => boolean): void => {
  try {
    if (!action()) console.error("[GmailMonitor] 실행 원장 저장 실패");
  } catch {
    console.error("[GmailMonitor] 실행 원장 저장 실패");
  }
};

const isSameTarget = (state: GmailMonitorState, config: GmailConfig): boolean =>
  state.address === config.address &&
  state.mailbox === config.mailbox &&
  state.query === config.query;

const checkGmail = async (
  client: Client,
  ownerId: string,
  config: GmailConfig,
  now: () => Date,
  send: NotificationSender,
): Promise<GmailMonitorResult> => {
  const stored = loadGmailMonitorState();
  const previous = stored && isSameTarget(stored, config) ? stored : null;
  const updates = await fetchGmailUpdates(config, previous, MAX_MESSAGES_PER_RUN);
  const checkedAt = now().toISOString();

  if (!previous || previous.uidValidity !== updates.uidValidity) {
    saveGmailMonitorState({
      version: 1,
      address: config.address,
      mailbox: config.mailbox,
      query: config.query,
      uidValidity: updates.uidValidity,
      lastUid: updates.maxUid,
      initializedAt: checkedAt,
      lastCheckedAt: checkedAt,
    });
    return {
      status: "success",
      detail: "기준선 생성 · 지금 이후 도착하는 메일부터 알립니다.",
    };
  }

  const state: GmailMonitorState = { ...previous, lastCheckedAt: checkedAt };
  const chunks = buildGmailNotificationChunks(
    updates.messages,
    updates.omittedCount,
    updates.maxUid,
  );
  if (!chunks.length) {
    state.lastUid = Math.max(state.lastUid, updates.maxUid);
    saveGmailMonitorState(state);
    return { status: "success", detail: "새 메일 없음" };
  }

  const total = updates.messages.length + updates.omittedCount;
  try {
    await send(ownerId, chunks.map((chunk) => ({
      content: chunk.content,
      onSent: () => {
        // Advance per delivered chunk so a failed later chunk is retried next run.
        state.lastUid = Math.max(state.lastUid, chunk.maxUid);
        state.lastNotifiedAt = now().toISOString();
        saveGmailMonitorState(state);
      },
    })));
  } catch (error) {
    saveGmailMonitorState(state);
    const sentAny = state.lastUid > previous.lastUid;
    return {
      status: sentAny ? "partial" : "failure",
      detail: `새 메일 ${total}건 중 DM 전송 실패: ${error instanceof Error ? error.message.slice(0, 120) : "알 수 없는 오류"}`,
    };
  }
  return { status: "success", detail: `새 메일 ${total}건 DM 전송` };
};

export const runGmailMonitor = async (
  client: Client,
  now: () => Date = () => new Date(),
  send?: NotificationSender,
): Promise<GmailMonitorResult> => {
  if (!isGmailMonitorEnabled()) {
    return { status: "skipped", detail: "GMAIL_MONITOR_ENABLED=true 설정이 필요합니다." };
  }
  if (running) return { status: "skipped", detail: "Gmail 확인이 이미 실행 중입니다." };
  const ownerId = process.env.ADMIN_ID;
  if (!ownerId) return { status: "failure", detail: "ADMIN_ID가 설정되지 않았습니다." };
  const config = getGmailConfig();
  if (!config) {
    return { status: "failure", detail: "GMAIL_ADDRESS와 GMAIL_APP_PASSWORD 설정이 필요합니다." };
  }

  running = true;
  record(() => recordScheduleRunStart(GMAIL_SCHEDULE, now()));
  let result: GmailMonitorResult;
  try {
    result = await checkGmail(
      client,
      ownerId,
      config,
      now,
      send || ((id, messages) => sendNotifications(client, id, messages)),
    );
  } catch (error) {
    result = { status: "failure", detail: describeGmailError(error) };
  } finally {
    running = false;
  }

  if (result.status === "failure") {
    record(() => recordScheduleRunFailure(GMAIL_SCHEDULE, result.detail, now()));
  } else {
    record(() =>
      recordScheduleRunCompletion(GMAIL_SCHEDULE, result.status as "success" | "partial", result.detail, now()),
    );
  }
  console.log(`[GmailMonitor] ${result.status} · ${result.detail}`);
  return result;
};
