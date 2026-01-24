const { EmbedBuilder } = require("discord.js");
const kmaHelper = require("../../../utils/kmaHelper");
const kmaData = require("../../../data/kma_data.json");
const userStore = require("../../../utils/userStore");

module.exports = {
  name: "weather",
  keywords: ["!weather", "!날씨", "!오늘날씨"],
  description: "오늘의 상세 날씨 정보를 확인하거나 기본 지역을 설정합니다.",
  async execute(message) {
    const args = message.content.split(/ +/);
    // args[0]: !날씨, args[1]: 지역명 or "설정"

    // 0. 설명(Help) 기능
    if (
      ["help", "설명", "규칙", "사용법", "가이드", "정보"].includes(args[1])
    ) {
      const embed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle("📘 날씨 명령어 사용법")
        .setDescription(
          "현재 날씨와 오늘 예보를 조회하거나 기본 지역을 설정합니다.",
        )
        .addFields(
          {
            name: "📍 지역 날씨 조회",
            value:
              "`!날씨 [지역명]`\n예: `!날씨 서울`, `!날씨 부산 해운대구`\n국내 주요 시/군/구 단위를 지원합니다.",
          },
          {
            name: "💾 기본 지역 설정",
            value:
              "`!날씨 설정 [지역명]`\n기본 지역을 등록하면 `!날씨`만 입력해도 해당 지역 날씨를 보여줍니다.",
          },
          {
            name: "🗑️ 설정 해제",
            value: "`!날씨 해제`\n등록된 기본 지역 정보를 삭제합니다.",
          },
          {
            name: "🔔 알림 설정 (Beta)",
            value:
              "`!날씨 알림`, `!날씨 알림해제`\n매일 오전 9시에 기본 지역 날씨를 DM으로 보내드립니다. (설정 필요)",
          },
        )
        .setFooter({ text: "기상청 데이터를 제공합니다." });
      return message.reply({ embeds: [embed] });
    }

    // 1. 설정 기능 (!날씨 설정 [지역])
    if (args[1] === "설정") {
      const newRegion = args[2];
      if (!newRegion) {
        return message.reply(
          "❗ 설정할 지역명을 입력해주세요. (예: `!날씨 설정 서울`)",
        );
      }

      // 지역명 유효성 검사 (kmaData에 있는지)
      let isValid = kmaData[newRegion];
      if (!isValid) {
        const foundKey = Object.keys(kmaData).find(
          (key) => key.includes(newRegion) || newRegion.includes(key),
        );
        if (foundKey) isValid = true;
      }

      if (!isValid) {
        return message.reply(
          `❌ **${newRegion}**은(는) 지원되지 않는 지역명입니다. 정확한 도시/구/군 이름을 입력해주세요.`,
        );
      }

      userStore.setUserRegion(message.author.id, newRegion);
      return message.reply(
        `✅ 기본 지역이 **${newRegion}**(으)로 설정되었습니다! 이제 지역명 없이 \`!날씨\`만 입력해도 됩니다.`,
      );
    }

    // 2. 지역 설정 해제 (!날씨 해제)
    if (["해제", "삭제", "취소"].includes(args[1])) {
      const cleared = userStore.clearUserRegion(message.author.id);
      userStore.disableNotification(message.author.id);
      if (cleared) {
        return message.reply("✅ 기본 지역 설정이 해제되었습니다.");
      } else {
        return message.reply("❌ 설정된 지역이 없습니다.");
      }
    }

    // 3. 알림 설정 ON (!날씨 알림)
    if (["알림", "구독", "알림설정"].includes(args[1])) {
      const region = userStore.getUserRegion(message.author.id);
      if (!region) {
        return message.reply(
          "❗ 먼저 지역을 설정해주세요! (예: `!날씨 설정 서울`)",
        );
      }
      userStore.enableNotification(message.author.id);
      return message.reply(
        `🔔 날씨 알림이 활성화되었습니다!\n매일 오전 9시에 **${region}** 날씨를 DM으로 받아보실 수 있습니다.`,
      );
    }

    // 4. 알림 설정 OFF (!날씨 알림해제)
    if (["알림해제", "구독해제", "알림끄기"].includes(args[1])) {
      userStore.disableNotification(message.author.id);
      return message.reply("🔕 날씨 알림이 해제되었습니다.");
    }

    // 2. 조회 기능
    let regionName = args[1];

    // 지역명이 없으면 저장된 기본값 조회
    if (!regionName) {
      regionName = userStore.getUserRegion(message.author.id);
      if (!regionName) {
        return message.reply(
          "❗ 지역명을 입력하거나 기본 지역을 설정해주세요.\n(사용법: `!날씨 서울` 또는 `!날씨 설정 서울`)",
        );
      }
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
