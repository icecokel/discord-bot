import "dotenv/config";
import { Client, GatewayIntentBits, Partials, Message } from "discord.js";
import { loadCommands, Command } from "./core/loader";
import { initializeSchedulers } from "./core/scheduler";
import { notifyServerReady } from "./core/server-ready-notifier";
import { handleAdminCommand } from "./core/admin-middleware";
import { handleCommand } from "./core/command-handler";
import {
  shouldProcessMessage,
  shouldProcessNaturalLanguageMessage,
} from "./core/message-guard";
import { handleNaturalLanguageMessage } from "./core/natural-language-router";

// 관리자 명령어 모듈 로드 (자동 등록)
import "./features/admin/commands/admin-data";
import "./features/admin/commands/admin-log";
import "./features/admin/commands/admin-notice";
import "./features/admin/commands/admin-reset";
import "./features/admin/commands/admin-ai";
import "./features/admin/commands/admin-news";
import "./features/admin/commands/admin-help";
import "./features/admin/commands/admin-server";

// Discord Client에 prefix 명령어 레지스트리를 연결한다.
declare module "discord.js" {
  export interface Client {
    commands: Map<string, Command>;
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

// 명령어 로드
client.commands = loadCommands();

client.once("clientReady", async () => {
  console.log(`Logged in as ${client.user?.tag}!`);

  // 스케줄러 초기화 (날씨, 긱뉴스)
  initializeSchedulers(client);
  await notifyServerReady(client);
});

client.on("messageCreate", async (message: Message) => {
  if (!shouldProcessMessage(message, process.env.ADMIN_ID)) return;

  // 관리자 DM 명령어 우선 처리
  if (await handleAdminCommand(message)) return;

  // Prefix 명령어 매칭 및 실행
  if (await handleCommand(message, client.commands)) return;

  // 관리자 DM의 prefix 없는 요청은 Hermes 세션으로 처리
  if (shouldProcessNaturalLanguageMessage(message, process.env.ADMIN_ID)) {
    await handleNaturalLanguageMessage(message);
  }
});

const token = process.env.DISCORD_BOT_TOKEN;

if (!token) {
  console.error("Error: DISCORD_BOT_TOKEN is missing in .env file.");
  process.exit(1);
}

client.login(token);
