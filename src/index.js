require("dotenv").config();

const { Client, GatewayIntentBits, Partials } = require("discord.js");
const { loadCommands } = require("./core/loader");
const { startWeatherScheduler } = require("./core/scheduler");
const { handleAdminCommand } = require("./core/adminMiddleware");
const { handleCommand } = require("./core/commandHandler");
const logger = require("./utils/logger");

// 어드민 명령어 모듈 로드 (자동 등록)
require("./features/admin/commands/admin-data");
require("./features/admin/commands/admin-log");
require("./features/admin/commands/admin-notice");
require("./features/admin/commands/admin-reset");

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
  console.log(`Logged in as ${client.user.tag}!`);

  // 날씨 스케줄러 시작
  startWeatherScheduler(client);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  // 어드민 DM 명령어 우선 처리
  if (await handleAdminCommand(message)) return;

  const content = message.content.toLowerCase();

  // 명령어 매칭 및 실행 (중앙 핸들러 위임)
  await handleCommand(message, client.commands);
});

const token = process.env.DISCORD_BOT_TOKEN;

if (!token) {
  console.error("Error: DISCORD_TOKEN is missing in .env file.");
  process.exit(1);
}

client.login(token);
