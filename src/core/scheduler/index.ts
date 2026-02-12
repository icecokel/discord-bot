import { Client } from "discord.js";
import { PrivateScheduler } from "./privateScheduler";
import { GlobalScheduler } from "./globalScheduler";

export const initializeSchedulers = (client: Client): void => {
  console.log("[Scheduler] 스케줄러 초기화 시작...");

  // 개인 스케줄러 (날씨, 영어/일본어, 리마인더)
  const privateScheduler = new PrivateScheduler(client);
  privateScheduler.start();

  // 공용 스케줄러 (뉴스)
  const globalScheduler = new GlobalScheduler(client);
  globalScheduler.start();

  console.log("[Scheduler] 모든 스케줄러 초기화 완료");
};
