import { Client, TextChannel, Message } from "discord.js";
import { readJson, writeJson } from "../../utils/fileManager";

const REMINDERS_FILE = "reminders.json";
const CHECK_INTERVAL = 60 * 1000; // 1분

export interface Reminder {
  id: string; // userId-timestamp
  userId: string;
  channelId: string;
  targetTime: number; // timestamp
  message: string;
  createdAt: number;
}

class ReminderService {
  private reminders: Reminder[] = [];
  private checkTimeout: NodeJS.Timeout | null = null;
  private client: Client | null = null;

  constructor() {
    this.reminders = readJson<Reminder[]>(REMINDERS_FILE, []);
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

  // 리마인더 추가
  public addReminder(
    userId: string,
    channelId: string,
    targetTime: number,
    messageContent: string,
  ): Reminder {
    const reminder: Reminder = {
      id: `${userId}-${Date.now()}`,
      userId,
      channelId,
      targetTime,
      message: messageContent,
      createdAt: Date.now(),
    };

    this.reminders.push(reminder);
    this.saveReminders();

    console.log(
      `[Reminder] 새 리마인더 등록: ${messageContent} (${new Date(targetTime).toLocaleString()})`,
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

  // 리마인더 삭제
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

  // 시간 파싱 유틸리티 (간단 버전)
  // 입력 예시: "10분 뒤", "1시간 후", "3월 1일", "12시 30분"
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

    // 2. 절대 시간 (월/일 시:분)
    // 예: "3월 1일", "12월 25일 10시 30분"
    const dateMatch = input.match(/(\d+)월\s*(\d+)일/);
    if (dateMatch) {
      const month = parseInt(dateMatch[1]) - 1; // 0-based
      const day = parseInt(dateMatch[2]);

      const targetDate = new Date(now.getFullYear(), month, day);

      // 시간 파싱 ("H시 m분" 또는 "H시")
      const timeMatch = input.match(/(\d+)시\s*(\d+)?분?/);
      if (timeMatch) {
        targetDate.setHours(parseInt(timeMatch[1]));
        targetDate.setMinutes(timeMatch[2] ? parseInt(timeMatch[2]) : 0);
        targetDate.setSeconds(0);
        targetDate.setMilliseconds(0);
      } else {
        // 시간 미입력 시 오전 9시 기본값
        targetDate.setHours(9, 0, 0, 0);
      }

      // 이미 지난 날짜라면 내년으로 설정 (단, 시간만 지난 오늘인 경우는 제외)
      if (targetDate.getTime() < now.getTime()) {
        // 만약 오늘 날짜인데 시간이 지난 경우라면? 내년 같은 날짜로 넘기는 게 맞음 (또는 에러 처리)
        // 여기서는 단순히 미래의 가장 가까운 날짜를 찾도록 1년 추가
        targetDate.setFullYear(now.getFullYear() + 1);
      }

      return targetDate.getTime();
    }

    // 3. 시간만 입력 ("10시 30분") -> 오늘 10시 30분 (지난 시간이면 내일)
    const timeOnlyMatch = input.match(/^(\d+)시\s*(\d+)?분?$/);
    if (timeOnlyMatch) {
      const targetDate = new Date();
      targetDate.setHours(parseInt(timeOnlyMatch[1]));
      targetDate.setMinutes(timeOnlyMatch[2] ? parseInt(timeOnlyMatch[2]) : 0);
      targetDate.setSeconds(0);
      targetDate.setMilliseconds(0);

      if (targetDate.getTime() <= now.getTime()) {
        targetDate.setDate(targetDate.getDate() + 1);
      }
      return targetDate.getTime();
    }

    return null;
  }

  private saveReminders() {
    writeJson(REMINDERS_FILE, this.reminders);
  }
}

export const reminderService = new ReminderService();
