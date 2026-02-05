import "dotenv/config";
import { Client, GatewayIntentBits, Partials, Message } from "discord.js";
import { loadCommands, Command } from "./core/loader";
import { initializeSchedulers } from "./core/scheduler";
import { handleAdminCommand } from "./core/adminMiddleware";
import { handleCommand } from "./core/commandHandler";

// 어드민 명령어 모듈 로드 (자동 등록)
import "./features/admin/commands/admin-data";
import "./features/admin/commands/admin-log";
import "./features/admin/commands/admin-notice";
import "./features/admin/commands/admin-reset";
import "./features/admin/commands/admin-english";
import "./features/admin/commands/admin-japanese";
import "./features/admin/commands/admin-ai";
import "./features/admin/commands/admin-news";

// Client 인터페이스 확장 (commands 속성 추가)
declare module "discord.js" {
  export interface Client {
    commands: Map<string, Command>;
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages, // DM 감지 활성화
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel], // DM 채널 처리에 필요
});

// 명령어 로드
client.commands = loadCommands();

client.once("clientReady", () => {
  console.log(`Logged in as ${client.user?.tag}!`);

  // 스케줄러 초기화 (날씨, 영어 등)
  initializeSchedulers(client);
});

client.on("messageCreate", async (message: Message) => {
  if (message.author.bot) return;

  // 어드민 DM 명령어 우선 처리
  if (await handleAdminCommand(message)) return;

  // 명령어 매칭 및 실행 (중앙 핸들러 위임)
  await handleCommand(message, client.commands);
});

const token = process.env.DISCORD_BOT_TOKEN;

if (!token) {
  console.error("Error: DISCORD_TOKEN is missing in .env file.");
  process.exit(1);
}

client.login(token);
