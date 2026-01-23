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

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}!`);

  // 관리자에게 재시작 알림 DM 전송
  const adminId = process.env.ADMIN_ID;
  if (adminId) {
    try {
      const admin = await client.users.fetch(adminId);
      await admin.send(
        `🔄 **봇이 재시작되었습니다!**\n시간: ${new Date().toLocaleString("ko-KR")}`,
      );
      console.log(`[Startup] Admin DM sent to ${admin.tag}`);
    } catch (error) {
      console.error("[Startup] Failed to send admin DM:", error.message);
    }
  }
});

client.on("messageCreate", (message) => {
  if (message.author.bot) return;

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
