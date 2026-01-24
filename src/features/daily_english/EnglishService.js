const { EmbedBuilder, ChannelType } = require("discord.js");
const { aiService } = require("../../core/ai");

class EnglishService {
  constructor() {
    this.categories = ["일상", "비즈니스", "여행", "감정 표현", "음식/주문"];
    this.weekdayMessages = {
      0: "편안한 일요일입니다! 😌 내일을 위해 가볍게 영어 표현 하나 익혀볼까요?", // 일
      1: "활기찬 월요일입니다! 💪 새로운 한 주를 영어와 함께 시작해요!", // 월
      2: "화이팅 넘치는 화요일! 🔥 오늘도 유용한 표현을 준비했어요.", // 화
      3: "벌써 수요일이네요! 🐪 지치지 말고 영어 한 문장 충전하세요!", // 수
      4: "조금만 더 힘내요, 목요일! 🏃‍♂️ 오늘의 표현은 무엇일까요?", // 목
      5: "신나는 금요일입니다! 🎉 주말을 기다리며 영어 표현 하나 챙겨가세요!", // 금
      6: "즐거운 토요일! 🎈 여유로운 마음으로 영어 한 마디 어때요?", // 토
    };
  }

  /**
   * 오늘의 요일 멘트 가져오기 (KST 기준)
   */
  getWeekdayMessage() {
    const kstOffset = 9 * 60 * 60 * 1000;
    const now = new Date(new Date().getTime() + kstOffset);
    const day = now.getUTCDay();
    return this.weekdayMessages[day];
  }

  /**
   * 랜덤 카테고리 선택
   */
  getRandomCategory() {
    const randomIndex = Math.floor(Math.random() * this.categories.length);
    return this.categories[randomIndex];
  }

  /**
   * AI를 통해 오늘의 영어 문장 생성
   */
  async generateDailyContent() {
    const category = this.getRandomCategory();
    const prompt = `당신은 친절한 영어 선생님입니다.
'${category}' 상황에서 유용하게 쓸 수 있는 영어 문장을 하나 알려주세요.

규칙:
1. 한국어 독자를 위해 작성하세요.
2. 내용은 다음 형식을 엄격히 따라주세요 (JSON 아님, 텍스트 형식):
   
   📝 **오늘의 문장**
   (영어 문장)
   
   🗣️ **발음**
   (한글 발음 표기, 예: 렛츠 고)
   
   💡 **해석**
   (자연스러운 한국어 해석)
   
   📘 **설명**
   (이 표현이 쓰이는 상황이나 뉘앙스에 대한 1~2줄 설명)

   ✨ **활용 예시**
   A: (영어 대화)
   B: (영어 대화)

3. 이모지를 적절히 사용하여 예쁘게 꾸며주세요.
4. 전체 길이는 400자 이내로 해주세요.`;

    try {
      const content = await aiService.generateText(prompt, {
        config: { temperature: 0.9 }, // 약간의 창의성 허용
      });

      const weekdayMsg = this.getWeekdayMessage();

      return {
        category,
        content,
        weekdayMsg,
      };
    } catch (error) {
      console.error("[EnglishService] 생성 오류:", error);
      throw error;
    }
  }

  /**
   * 모든 길드의 'general' 또는 '일반' 채널에 메시지 전송
   * @param {Client} client
   */
  async sendToGeneralChannels(client) {
    console.log("[EnglishService] 일일 영어 문장 발송 시작...");

    try {
      // 콘텐츠 생성
      const { category, content, weekdayMsg } =
        await this.generateDailyContent();

      // Embed 생성
      const embed = new EmbedBuilder()
        .setColor(0x00b0f4) // 하늘색
        .setTitle(`🇺🇸 오늘의 영어 표현 - ${category} 편`)
        .setDescription(`${weekdayMsg}\n\n${content}`)
        .setFooter({ text: "Daily English Helper" })
        .setTimestamp();

      let successCount = 0;

      // 모든 길드 순회
      for (const guild of client.guilds.cache.values()) {
        try {
          // 'general' 또는 '일반'이 포함된 텍스트 채널 찾기
          const targetChannel = guild.channels.cache.find(
            (channel) =>
              channel.type === ChannelType.GuildText &&
              (channel.name.toLowerCase().includes("general") ||
                channel.name.includes("일반")) &&
              channel.permissionsFor(guild.members.me).has("SendMessages"),
          );

          if (targetChannel) {
            await targetChannel.send({ embeds: [embed] });
            console.log(
              `[EnglishService] 발송 성공: ${guild.name} #${targetChannel.name}`,
            );
            successCount++;
          } else {
            console.log(
              `[EnglishService] 스킵: ${guild.name} (적절한 채널 없음)`,
            );
          }
        } catch (err) {
          console.error(
            `[EnglishService] 발송 실패 (${guild.name}):`,
            err.message,
          );
        }
      }

      console.log(
        `[EnglishService] 발송 완료. 총 ${successCount}개 채널 전송.`,
      );

      // 테스트용 리턴 (Admin 커맨드 등에서 사용 가능)
      return { successCount, embed };
    } catch (error) {
      console.error("[EnglishService] 전체 발송 중 치명적 오류:", error);
      return null;
    }
  }
}

module.exports = new EnglishService();
