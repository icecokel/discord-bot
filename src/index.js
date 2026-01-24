require("dotenv").config();

const { Client, GatewayIntentBits, Partials } = require("discord.js");
const { loadCommands } = require("./core/loader");
const { startWeatherScheduler } = require("./core/scheduler");
const { handleAdminCommand } = require("./core/adminMiddleware");
const logger = require("./utils/logger");

// 어드민 명령어 모듈 로드 (자동 등록)
require("./features/admin/commands/admin-data");
require("./features/admin/commands/admin-log");
require("./features/admin/commands/admin-notice");

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

  // 명령어 매칭 찾기
  // 메시지의 첫 단어를 추출하여 명령어로 확인
  const args = content.split(/ +/);
  const commandName = args[0];

  const command = [...client.commands.values()].find(
    (cmd) =>
      cmd.keywords &&
      cmd.keywords.some((keyword) => commandName === keyword.toLowerCase()),
  );

  if (command) {
    try {
      // 명령어 로그 기록
      logger.log({
        userId: message.author.id,
        userName: message.author.tag,
        command: command.name,
        args: args.slice(1),
      });

      console.log(
        `[Command] ${command.name} executed by ${message.author.tag} (${message.author.id})`,
      );
      command.execute(message, args.slice(1));
    } catch (error) {
      console.error(error);
      message.reply("명령어를 실행하는 중에 오류가 발생했습니다.");
    }
  }
});

const token = process.env.DISCORD_BOT_TOKEN;

if (!token) {
  console.error("Error: DISCORD_TOKEN is missing in .env file.");
  process.exit(1);
}

client.login(token);
