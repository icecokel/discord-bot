const { EmbedBuilder } = require("discord.js");
const kmaHelper = require("../../../utils/kmaHelper");
const kmaData = require("../../../data/kma_data.json");
const userStore = require("../../../utils/userStore");

module.exports = {
  name: "weather-weekly",
  keywords: ["!주간날씨", "!주간", "!weekly"],
  description: "내일부터 7일 후까지의 주간 예보를 확인합니다.",
  async execute(message) {
    const args = message.content.split(/ +/);
    let regionName = args[1];

    // 0. 설명(Help) 기능
    if (["help", "설명", "규칙", "사용법", "가이드"].includes(args[1])) {
      const embed = new EmbedBuilder()
        .setColor(0xffa500)
        .setTitle("📘 주간 날씨 사용법")
        .setDescription("내일부터 7일 후까지의 장기 예보를 확인합니다.")
        .addFields(
          {
            name: "📅 주간 날씨 조회",
            value:
              "`!주간날씨 [지역명]`\n예: `!주간날씨 서울`\n내일/모레는 상세 예보(오전/오후), 3일 후부터는 개황을 제공합니다.",
          },
          {
            name: "💡 팁",
            value:
              "`!날씨 설정`으로 기본 지역을 등록해두면 지역명을 입력하지 않아도 바로 조회할 수 있습니다.",
          },
        )
        .setFooter({ text: "단기예보 + 중기예보 데이터" });
      return message.reply({ embeds: [embed] });
    }

    if (!regionName) {
      regionName = userStore.getUserRegion(message.author.id);
      if (!regionName) {
        return message.reply(
          "❗ 지역명을 입력해주세요. (예: `!주간날씨 서울`)\n(또는 `!날씨 설정 [지역]`으로 기본 지역을 등록하세요)",
        );
      }
    }

    let targetData = kmaData[regionName];
    if (!targetData) {
      const foundKey = Object.keys(kmaData).find(
        (key) => key.includes(regionName) || regionName.includes(key),
      );
      if (foundKey) targetData = kmaData[foundKey];
    }

    if (!targetData) {
      return message.reply(`❌ **${regionName}** 지역을 찾을 수 없습니다.`);
    }

    const { nx, ny, midCode } = targetData;

    // API 호출 (단기 + 중기 병행)
    const [shortData, midData] = await Promise.all([
      kmaHelper.getShortTermForecast(nx, ny),
      midCode ? kmaHelper.getMidTermForecast(midCode) : null,
    ]);

    if (!shortData) {
      return message.reply("⚠️ 단기 예보 정보를 가져오는데 실패했습니다.");
    }

    const embed = new EmbedBuilder()
      .setColor(0xffa500) // 주간은 오렌지색
      .setTitle(`🗓️ ${regionName} 주간 날씨 예보`)
      .setDescription("내일부터 7일간의 날씨 전망입니다.")
      .setTimestamp()
      .setFooter({ text: "기상청 단기/중기예보 제공" });

    // 1. 단기 예보 구간 (내일, 모레)
    const { tomorrow, dayAfter } = shortData;
    embed.addFields(
      {
        name: "내일 (D+1)",
        value: `${tomorrow.sky} (${tomorrow.min}° / ${tomorrow.max}°)`,
        inline: true,
      },
      {
        name: "모레 (D+2)",
        value: `${dayAfter.sky} (${dayAfter.min}° / ${dayAfter.max}°)`,
        inline: true,
      },
    );

    // 2. 중기 예보 구간 (3일~7일)
    if (midData) {
      // inline 정렬을 위해 빈 필드 하나 추가하거나, 줄바꿈 처리
      embed.addFields({ name: "\u200B", value: "\u200B", inline: false });

      const midFields = [];
      // 3일후
      if (midData.wf3Am)
        midFields.push(`**3일 후**: ${midData.wf3Am}/${midData.wf3Pm}`);
      // 4일후
      if (midData.wf4Am)
        midFields.push(`**4일 후**: ${midData.wf4Am}/${midData.wf4Pm}`);
      // 5일후
      if (midData.wf5Am)
        midFields.push(`**5일 후**: ${midData.wf5Am}/${midData.wf5Pm}`);
      // 6일후
      if (midData.wf6Am)
        midFields.push(`**6일 후**: ${midData.wf6Am}/${midData.wf6Pm}`);
      // 7일후
      if (midData.wf7Am)
        midFields.push(`**7일 후**: ${midData.wf7Am}/${midData.wf7Pm}`);

      embed.addFields({
        name: "중기 예보 (3일 ~ 7일)",
        value: midFields.join("\n") || "정보 없음",
        inline: false,
      });
    } else {
      embed.addFields({
        name: "중기 예보",
        value:
          "(해당 지역의 중기 예보 코드가 없거나 데이터를 불러올 수 없습니다.)",
        inline: false,
      });
    }

    message.reply({ embeds: [embed] });
  },
};
