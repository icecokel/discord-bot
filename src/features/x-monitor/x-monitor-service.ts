import { escapeMarkdown } from "discord.js";
import type { Client } from "discord.js";
import { fetchXProfile } from "./x-profile-source";
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
export const getKstHour = (now: Date): number =>
  new Date(now.getTime() + 9 * 60 * 60 * 1000).getUTCHours();
export const isXQuietTime = (now: Date): boolean => {
  const hour = getKstHour(now);
  return hour >= 20 || hour < 7;
};

export const buildXMessages = (posts: XPost[], now: Date) => {
  const title = getKstHour(now) === 7 && new Date(now.getTime() + 9 * 3600_000).getUTCMinutes() < 30
    ? "🌅 X 야간 업데이트" : "🆕 X 미전송 업데이트 모음";
  const header = `${title} · @${X_ACCOUNT} · ${posts.length}건`;
  const chunks: { content: string; ids: string[] }[] = [];
  for (const post of [...posts].sort((a, b) => BigInt(a.id) < BigInt(b.id) ? -1 : 1)) {
    const escaped = escapeMarkdown(post.text);
    const excerpt = escaped.slice(0, 1_200).replace(/[\uD800-\uDBFF]$/, "");
    const partial = !post.textComplete || escaped.length > excerpt.length ? " (원문 일부)" : "";
    const observed = new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).format(new Date(post.observedAt));
    const block = `\n\n${excerpt}${partial}\n원문: <${post.url}>\n확인: ${observed} KST`;
    let chunk = chunks[chunks.length - 1];
    if (!chunk || chunk.content.length + block.length > 1_760) {
      chunk = { content: header, ids: [] };
      chunks.push(chunk);
    }
    chunk.content += block;
    chunk.ids.push(post.id);
  }
  return chunks.map((chunk, index) => ({
    ...chunk,
    content: chunks.length > 1 ? `${chunk.content}\n(${index + 1}/${chunks.length})` : chunk.content,
  }));
};

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
      const fetched = await fetchXProfile(state?.lastCompleteMaxId);
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
      saveXMonitorState(state);
      result = { status: "success", detail: `기준선 생성: ${posts.length}건 · 발송 없음` };
    } else {
      if (posts.length) {
        const known = new Set([...state.notifiedIds, ...state.pending.map((post) => post.id)]);
        for (const post of posts) {
          if (BigInt(post.id) > BigInt(state.baselineMaxId) && !known.has(post.id)) {
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
      if (state.pending.length && !isXQuietTime(now())) {
        const messages = buildXMessages(state.pending, now());
        const user = await client.users.fetch(ownerId);
        for (const message of messages) {
          if (isXQuietTime(now())) break;
          await user.send({ content: message.content, allowedMentions: { parse: [] } });
          const sentIds = new Set(message.ids);
          state.notifiedIds.push(...message.ids);
          state.pending = state.pending.filter((post) => !sentIds.has(post.id));
          saveXMonitorState(state);
          sent += message.ids.length;
        }
      }
      const detail = isXQuietTime(now())
        ? `야간 보류 ${state.pending.length}건 · 07:00 발송 예정`
        : `전송 ${sent}건 · 대기 ${state.pending.length}건`;
      const issue = collectionError || (!complete ? "coverage-gap: 수집 범위 연결 확인 필요" : "");
      result = {
        status: issue ? (sent > 0 || posts.length > 0 ? "partial" : "failure") : "success",
        detail: issue ? `${detail} · ${issue}` : detail,
      };
    }
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
