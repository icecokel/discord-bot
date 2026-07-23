import { Client } from "discord.js";
import { PrivateScheduler } from "./private-scheduler";

export const initializeSchedulers = (client: Client): void => {
  console.log("[Scheduler] 스케줄러 초기화 시작...");

  // 개인 스케줄러 (아침 브리핑, 긱뉴스, 내일 날씨)
  const privateScheduler = new PrivateScheduler(client);
  privateScheduler.start();

  console.log("[Scheduler] 모든 스케줄러 초기화 완료");
};
