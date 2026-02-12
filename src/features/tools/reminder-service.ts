import { Client, TextChannel, Message } from "discord.js";
import { readJson, writeJson } from "../../utils/file-manager";

const REMINDERS_FILE = "reminders.json";
const CHECK_INTERVAL = 60 * 1000; // 1분

export interface Reminder {
  id: string; // userId-timestamp (Internal ID)
  shortId: string; // User-facing Short ID (e.g. "a1b2")
  userId: string;
  channelId: string;
  targetTime: number; // timestamp
  message: string;
  createdAt: number;
}

export type RemoveReminderResult =
  | { ok: true; reminder: Reminder }
  | { ok: false; reason: "NOT_FOUND" | "FORBIDDEN"; reminder?: Reminder };

class ReminderService {
  private reminders: Reminder[] = [];
  private checkTimeout: NodeJS.Timeout | null = null;
  private client: Client | null = null;

  constructor() {
    this.reminders = readJson<Reminder[]>(REMINDERS_FILE, []);
    this.migrateReminders();
  }

  // 봇 시작 시 초기화
  public initialize(client: Client) {
    this.client = client;
    if (this.reminders.length > 0) {
      console.log(
        `[Reminder] ${this.reminders.length}개의 리마인더 로드됨. 체크 루프 시작.`,
      );
      this.startCheckLoop();
    }
  }

  // 기존 데이터 마이그레이션 (shortId 없는 경우 생성)
  private migrateReminders() {
    let modified = false;
    this.reminders = this.reminders.map((r) => {
      if (!r.shortId) {
        r.shortId = this.generateShortId();
        modified = true;
      }
      return r;
    });

    if (modified) {
      console.log(
        "[Reminder] 기존 리마인더에 Short ID를 할당하고 저장했습니다.",
      );
      this.saveReminders();
    }
  }

  // Short ID 생성 (4자리 영동문/숫자)
  private generateShortId(): string {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let id = "";
    while (true) {
      id = "";
      for (let i = 0; i < 4; i++) {
        id += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      // 중복 체크
      if (!this.reminders.some((r) => r.shortId === id)) {
        break;
      }
    }
    return id;
  }

  // 리마인더 추가
  public addReminder(
    userId: string,
    channelId: string,
    targetTime: number,
    messageContent: string,
  ): Reminder {
    const reminder: Reminder = {
      id: `${userId}-${Date.now()}`,
      shortId: this.generateShortId(),
      userId,
      channelId,
      targetTime,
      message: messageContent,
      createdAt: Date.now(),
    };

    this.reminders.push(reminder);
    this.saveReminders();

    console.log(
      `[Reminder] 새 리마인더 등록: [${reminder.shortId}] ${messageContent} (${new Date(targetTime).toLocaleString()})`,
    );

    // 루프가 멈춰있으면 시작
    if (!this.checkTimeout) {
      this.startCheckLoop();
    }

    return reminder;
  }

  // 채널별 리마인더 목록 조회
  public getRemindersByChannel(channelId: string): Reminder[] {
    return this.reminders
      .filter((r) => r.channelId === channelId)
      .sort((a, b) => a.targetTime - b.targetTime);
  }

  // 리마인더 삭제 (Short ID 기준)
  public removeReminderByShortId(
    shortId: string,
    requesterId?: string,
    options: { isAdmin?: boolean } = {},
  ): RemoveReminderResult {
    const target = this.reminders.find((r) => r.shortId === shortId);
    if (!target) {
      return { ok: false, reason: "NOT_FOUND" };
    }

    const canRemove =
      !requesterId ||
      requesterId === target.userId ||
      options.isAdmin === true;

    if (!canRemove) {
      return { ok: false, reason: "FORBIDDEN", reminder: target };
    }

    const index = this.reminders.findIndex((r) => r.shortId === shortId);
    const removed = this.reminders.splice(index, 1)[0];
    this.saveReminders();

    // 리마인더가 없으면 루프 중지
    if (this.reminders.length === 0) {
      this.stopCheckLoop();
    }
    return { ok: true, reminder: removed };
  }

  // 리마인더 삭제 (Internal ID 기준 - 발송 후 삭제용)
  public removeReminder(id: string) {
    this.reminders = this.reminders.filter((r) => r.id !== id);
    this.saveReminders();

    // 리마인더가 없으면 루프 중지
    if (this.reminders.length === 0) {
      this.stopCheckLoop();
    }
  }

  // 체크 루프 시작
  private startCheckLoop() {
    if (this.checkTimeout) return;

    console.log("[Reminder] 체크 루프 시작");

    const runCheck = async () => {
      await this.checkReminders();

      // 리마인더가 남아있으면 다음 분 정각에 다시 실행
      if (this.reminders.length > 0) {
        const now = new Date();
        const delay = 60000 - (now.getSeconds() * 1000 + now.getMilliseconds());
        this.checkTimeout = setTimeout(runCheck, delay);
      } else {
        this.stopCheckLoop();
      }
    };

    // 첫 실행 (즉시 실행하지 않고 다음 정각에 실행)
    const now = new Date();
    const delay = 60000 - (now.getSeconds() * 1000 + now.getMilliseconds());
    this.checkTimeout = setTimeout(runCheck, delay);
  }

  // 체크 루프 중지
  private stopCheckLoop() {
    if (this.checkTimeout) {
      clearTimeout(this.checkTimeout);
      this.checkTimeout = null;
      console.log("[Reminder] 대기 중인 리마인더 없음. 루프 정지.");
    }
  }

  // 리마인더 체크 및 발송
  private async checkReminders() {
    if (!this.client) return;

    const now = Date.now();
    // 1분 오차 허용 (이미 지난 것도 포함)
    const pendingReminders = this.reminders.filter((r) => r.targetTime <= now);

    if (pendingReminders.length === 0) {
      // 남은 리마인더가 없으면 루프 중지 체크
      if (this.reminders.length === 0) {
        this.stopCheckLoop();
      }
      return;
    }

    console.log(`[Reminder] ${pendingReminders.length}개의 리마인더 발송 시작`);

    for (const reminder of pendingReminders) {
      try {
        const channel = (await this.client.channels.fetch(
          reminder.channelId,
        )) as TextChannel;
        if (channel) {
          await channel.send({
            content: `⏰ <@${reminder.userId}>님, 리마인더 도착!\n> **${reminder.message}**`,
          });
        }

        // 발송 성공 시 삭제
        this.removeReminder(reminder.id);
      } catch (error) {
        console.error(`[Reminder] 발송 실패 (ID: ${reminder.id}):`, error);
        // 에러 발생 시에도 일단 삭제할지, 재시도할지 결정 필요.
        // 여기서는 삭제하여 무한 루프 방지 (또는 재시도 로직 추가 가능)
        this.removeReminder(reminder.id);
      }
    }
  }

  // 시간 파싱 유틸리티 (개선된 버전)
  public parseTargetTime(input: string): number | null {
    const now = new Date();

    // 1. 상대 시간 (분, 시간)
    const relativeMatch = input.match(/(\d+)(분|시간|초)\s*(뒤|후)?/);
    if (relativeMatch) {
      const value = parseInt(relativeMatch[1]);
      const unit = relativeMatch[2];

      let additionalMs = 0;
      if (unit === "초") additionalMs = value * 1000;
      if (unit === "분") additionalMs = value * 60 * 1000;
      if (unit === "시간") additionalMs = value * 60 * 60 * 1000;

      return now.getTime() + additionalMs;
    }

    // 2. 자연어 날짜 (내일, 모레, 글피)
    let targetDate = new Date(now);
    let dateFound = false;

    if (input.includes("내일")) {
      targetDate.setDate(targetDate.getDate() + 1);
      dateFound = true;
    } else if (input.includes("모레")) {
      targetDate.setDate(targetDate.getDate() + 2);
      dateFound = true;
    } else if (input.includes("글피")) {
      targetDate.setDate(targetDate.getDate() + 3);
      dateFound = true;
    }

    // 3. 절대 날짜 (월/일)
    const dateMatch = input.match(/(\d+)월\s*(\d+)일/);
    if (dateMatch) {
      const month = parseInt(dateMatch[1]) - 1; // 0-based
      const day = parseInt(dateMatch[2]);
      targetDate.setMonth(month);
      targetDate.setDate(day);
      dateFound = true;
    }

    // 시간 파싱 (오후/오전 지원 추가)
    const timeMatch = input.match(/(오전|오후)?\s*(\d+)시\s*(\d+)?분?/);

    if (timeMatch) {
      let hour = parseInt(timeMatch[2]);
      const minute = timeMatch[3] ? parseInt(timeMatch[3]) : 0;
      const meridiem = timeMatch[1];

      // 오후/오전 처리
      if (meridiem === "오후" && hour < 12) {
        hour += 12;
      } else if (meridiem === "오전" && hour === 12) {
        hour = 0;
      }

      targetDate.setHours(hour, minute, 0, 0);

      // 날짜가 지정되지 않고 시간만 있는 경우
      if (!dateFound) {
        // 이미 지난 시간이라면 내일로 설정
        if (targetDate.getTime() <= now.getTime()) {
          targetDate.setDate(targetDate.getDate() + 1);
        }
      }
    } else if (dateFound) {
      // 날짜만 있고 시간은 없는 경우 -> 오전 9시 기본
      targetDate.setHours(9, 0, 0, 0);
    } else {
      // 날짜도 시간도 파싱되지 않음 -> 실패
      return null;
    }

    // 최종 검증: 과거 시간인 경우 (날짜 지정 시)
    if (dateFound && targetDate.getTime() < now.getTime()) {
      // 만약 월/일 지정했는데 이미 지났다면 내년으로
      if (dateMatch) {
        targetDate.setFullYear(targetDate.getFullYear() + 1);
      }
      // 내일/모레인데 지난 시간일 수는 없음 (시간만 과거면 위에서 처리했어야 함)
      // 하지만 날짜+시간 조합에서 현재보다 과거면... 그대로 반환하거나 에러.
      // 여기서는 그냥 반환 (과거 알림은 즉시 발송됨)
    }

    return targetDate.getTime();
  }

  private saveReminders() {
    writeJson(REMINDERS_FILE, this.reminders);
  }
}

export const reminderService = new ReminderService();
