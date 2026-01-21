module.exports = {
  name: "weather",
  keywords: ["!weather", "!날씨"],
  description: "날씨 정보를 확인합니다. (준비 중)",
  execute(message) {
    console.log(JSON.stringify(message, null, 2));
    const username = message.author.username;
    message.reply(
      `☁️ **${username}**님, 현재 계신 지역의 날씨는... (아직 데이터를 못 가져오고 있어요 �)`,
    );
  },
};
