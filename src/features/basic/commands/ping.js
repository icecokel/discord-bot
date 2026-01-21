module.exports = {
  name: "ping",
  keywords: ["ping", "!ping"], // ! 없이도 동작하게 하거나, 별칭으로 처리
  description: "봇의 응답 속도를 확인합니다.",
  execute(message) {
    message.reply("Pong! 🏓");
  },
};
