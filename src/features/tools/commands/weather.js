const { EmbedBuilder } = require("discord.js");
const kmaHelper = require("../../../utils/kmaHelper");
const kmaData = require("../../../data/kma_data.json");

module.exports = {
  name: "weather",
  keywords: ["!weather", "!날씨", "!오늘날씨"],
  description: "오늘의 상세 날씨 정보를 확인합니다.",
  async execute(message) {
    const args = message.content.split(/ +/);
    const regionName = args[1];

    if (!regionName) {
      return message.reply("❗ 지역명을 입력해주세요. (예: `!날씨 서울`)");
    }

    // 데이터 조회
    let targetData = kmaData[regionName];
    if (!targetData) {
      const foundKey = Object.keys(kmaData).find(
        (key) => key.includes(regionName) || regionName.includes(key),
      );
      if (foundKey) {
        targetData = kmaData[foundKey];
        // 사용자가 "안양" 입력 -> 실제 키가 "안양시"일 경우 등을 위해 편의상 이름 업데이트
        // 하지만 여기선 그냥 사용자 입력값을 제목으로 쓰거나 foundKey를 쓸 수 있음.
      }
    }

    if (!targetData) {
      return message.reply(`❌ **${regionName}** 지역을 찾을 수 없습니다.`);
    }

    const { nx, ny } = targetData;

    // API 호출
    const shortTermData = await kmaHelper.getShortTermForecast(nx, ny);

    if (!shortTermData) {
      return message.reply("⚠️ 기상청 API에서 정보를 가져오는데 실패했습니다.");
    }

    const { today } = shortTermData;
    const { current, min, max, popMax } = today;

    const embed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle(`🌤️ ${regionName} 오늘 날씨`)
      .setTimestamp()
      .setFooter({ text: "기상청 단기예보 제공" });

    // 1. 현재 날씨 섹션
    if (current) {
      embed.addFields({
        name: "현재 날씨",
        value: `${current.desc} **${current.temp}°C**\n(강수확률 ${current.pop}%)`,
        inline: false,
      });
    } else {
      embed.addFields({
        name: "현재 날씨",
        value: "데이터를 불러오는 중...",
        inline: false,
      });
    }

    // 2. 오늘 예보 요약
    // 최저/최고 기온이 유효한지 체크
    let tempStr = "";
    if (min !== null) tempStr += `최저 **${min}°**`;
    if (max !== null) tempStr += ` / 최고 **${max}°**`;

    embed.addFields({
      name: "오늘 예보",
      value: `${tempStr}\n☔ 최대 강수확률: **${popMax}%**`,
      inline: false,
    });

    message.reply({ embeds: [embed] });
  },
};
