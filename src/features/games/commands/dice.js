module.exports = {
  name: "dice",
  keywords: ["!dice", "!주사위"],
  description: "주사위를 굴립니다.",
  execute(message) {
    const number = Math.floor(Math.random() * 6) + 1;
    message.reply(`🎲 주사위를 굴려 **${number}**가 나왔습니다!`);
  },
};
