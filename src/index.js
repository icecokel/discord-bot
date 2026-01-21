require("dotenv").config();

const { Client, GatewayIntentBits } = require("discord.js");
const { loadCommands } = require("./core/loader");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// 명령어 로드
client.commands = loadCommands();

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on("messageCreate", (message) => {
  if (message.author.bot) return;

  const content = message.content.toLowerCase();

  // 명령어 매칭 찾기
  // commands 맵을 순회하며 keywords 배열에 content가 포함되는지 확인
  const command = [...client.commands.values()].find(
    (cmd) =>
      cmd.keywords &&
      cmd.keywords.some((keyword) => content === keyword.toLowerCase()),
  );

  if (command) {
    try {
      console.log(
        `[Command] ${command.name} executed by ${message.author.tag} (${message.author.id})`,
      );
      command.execute(message);
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
