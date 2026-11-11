import type { Client } from "discord.js";
import type { NotificationSender } from "../../utils/notification-batch";
import { translateXPost } from "./x-post-translation";
import { fetchXProfile } from "./x-profile-source";
import { isXQuietTime } from "./x-monitor-message";
import { sendXNotifications } from "./x-monitor-notifier";
import {
  isXPost, loadXMonitorState, saveXMonitorState, X_ACCOUNT,
} from "../../utils/x-monitor-store";
import type { XPost } from "../../utils/x-monitor-store";
import {
  recordScheduleRunStart, recordScheduleRunCompletion, recordScheduleRunFailure,
} from "../../utils/schedule-run-store";
import { X_PROFILE_SCHEDULE, isXMonitorEnabled } from "../../core/scheduler/schedule-definitions";

export interface XMonitorResult {
  status: "success" | "partial" | "failure" | "skipped";
  detail: string;
}

// ponytail: process-wide lock; use a shared lock before enabling multiple PM2 instances.
let running = false;

const safeError = (error: unknown): string => {
  // Do not send browser logs, URLs from errors, or authentication state to Discord.
  if (error instanceof Error && /^(X 감시|parse-failed:|auth-required:|blocked:|fetch-failed:)/.test(error.message)) {
    return error.message.slice(0, 160);
  }
  return "X 처리 실패: 브라우저 설치·인증·DM 권한 및 저장소 상태를 확인하세요.";
};

const record = (action: () => boolean): void => {
  try {
    if (!action()) console.error("[XMonitor] 실행 원장 저장 실패");
  } catch {
    console.error("[XMonitor] 실행 원장 저장 실패");
  }
};

export const runXMonitor = async (
  client: Client,
  now: () => Date = () => new Date(),
  send?: NotificationSender,
): Promise<XMonitorResult> => {
  if (!isXMonitorEnabled()) return { status: "skipped", detail: "X_MONITOR_ENABLED=true 설정이 필요합니다." };
  if (running) return { status: "skipped", detail: "X 확인이 이미 실행 중입니다." };
  const ownerId = process.env.ADMIN_ID;
  if (!ownerId) return { status: "failure", detail: "ADMIN_ID가 설정되지 않았습니다." };
  running = true;
  record(() => recordScheduleRunStart(X_PROFILE_SCHEDULE, now()));
  let result: XMonitorResult;
  try {
    let state = loadXMonitorState();
    let collectionError: string | undefined;
    let complete = false;
    let posts: XPost[] = [];
    try {
      const lastNotifiedId = state?.notifiedIds.reduce<string | undefined>((max, id) =>
        !max || BigInt(id) > BigInt(max) ? id : max, undefined);
      const fetched = await fetchXProfile(lastNotifiedId);
      if (!fetched.posts.length || !fetched.posts.every(isXPost)) {
        throw new Error("parse-failed: 유효한 게시물 없음");
      }
      posts = fetched.posts;
      complete = fetched.complete;
    } catch (error) {
      collectionError = safeError(error);
    }

    if (!state) {
      if (collectionError || !complete) {
        throw new Error(collectionError || "fetch-failed: 기준선 수집 범위 확인 필요");
      }
      const maxId = posts.reduce((max, post) => BigInt(post.id) > BigInt(max) ? post.id : max, "0");
      state = {
        version: 1, account: X_ACCOUNT, initializedAt: now().toISOString(),
        baselineMaxId: maxId, lastCompleteMaxId: maxId, notifiedIds: [], pending: [],
      };
    }
    if (posts.length) {
      const known = new Set([...state.notifiedIds, ...state.pending.map((post) => post.id)]);
      for (const post of posts) {
        if (!known.has(post.id)) {
          state.pending.push(post);
          known.add(post.id);
        }
      }
      if (complete) {
        state.lastCompleteMaxId = posts.reduce((max, post) =>
          BigInt(post.id) > BigInt(max) ? post.id : max, state.lastCompleteMaxId);
      }
      // Persist the outbox before any new notification is attempted.
      saveXMonitorState(state);
    }
    let sent = 0;
    let translationFailures = 0;
    if (state.pending.length && !isXQuietTime(now())) {
      for (const post of state.pending) {
        if (isXQuietTime(now())) break;
        if (post.translatedText || post.originalOnly) continue;
        try {
          post.translatedText = await translateXPost(post.text);
        } catch {
          translationFailures += 1;
          post.originalOnly = true;
        }
        saveXMonitorState(state);
      }
      sent = await sendXNotifications(client, ownerId, state, now, translationFailures, send);
    }
    const detail = isXQuietTime(now())
      ? `야간 보류 ${state.pending.length}건 · 06:00 발송 예정`
      : `전송 ${sent}건 · 대기 ${state.pending.length}건`;
    const issue = [collectionError || (!complete ? "coverage-gap: 수집 범위 연결 확인 필요" : ""),
      translationFailures ? `Claude 번역 실패 ${translationFailures}건 · 원문 전송${state.pending.some(post => post.originalOnly) ? " 대기" : " 완료"}` : "",
    ].filter(Boolean).join(" · ");
    result = {
      status: issue ? (sent > 0 || posts.length > 0 ? "partial" : "failure") : "success",
      detail: issue ? `${detail} · ${issue}` : detail,
    };
  } catch (error) {
    result = { status: "failure", detail: safeError(error) };
  } finally {
    running = false;
  }
  if (result.status === "failure") {
    record(() => recordScheduleRunFailure(X_PROFILE_SCHEDULE, result.detail, now()));
  } else {
    record(() => recordScheduleRunCompletion(X_PROFILE_SCHEDULE, result.status as "success" | "partial", result.detail, now()));
  }
  console.log(`[XMonitor] ${result.status} · ${result.detail}`);
  return result;
};
