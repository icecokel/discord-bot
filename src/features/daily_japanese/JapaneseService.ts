import { EmbedBuilder, ChannelType, Client, TextChannel } from "discord.js";
import { aiService } from "../../core/ai";
import historyManager from "../../utils/HistoryManager";

interface JapaneseContent {
  category: string;
  content: string;
  weekdayMsg: string;
}

interface JapaneseServiceResult {
  successCount: number;
  embed: EmbedBuilder;
}

class JapaneseService {
  private categories: string[];
  private weekdayMessages: { [key: number]: string };

  constructor() {
    // 왕초보 맞춤형 카테고리
    this.categories = [
      "기초 인사",
      "자기 소개",
      "쇼핑하기",
      "식당에서",
      "길 물어보기",
      "숫자와 시간",
      "기초 감정 표현",
    ];
    this.weekdayMessages = {
      0: "편안한 일요일! 😌 가볍게 일본어 단어 하나 외워볼까요?", // 일
      1: "새로운 한 주 시작! 💪 기초 일본어로 활기차게 출발해요!", // 월
      2: "화이팅 화요일! 🔥 오늘도 쉬운 표현으로 자신감 Up!", // 화
      3: "벌써 수요일! 🐪 지치지 말고 일본어 한 문장 챙겨가세요!", // 수
      4: "조금만 더 힘내요, 목요일! 🏃‍♂️ 오늘의 왕초보 일본어는?", // 목
      5: "신나는 금요일! 🎉 주말 여행을 위한 일본어 표현 어때요?", // 금
      6: "즐거운 토요일! 🎈 여유롭게 일본어 한 마디!", // 토
    };
  }

  /**
   * 오늘의 요일 멘트 가져오기 (KST 기준)
   */
  getWeekdayMessage(): string {
    const kstOffset = 9 * 60 * 60 * 1000;
    const now = new Date(new Date().getTime() + kstOffset);
    const day = now.getUTCDay();
    return this.weekdayMessages[day];
  }

  /**
   * 랜덤 카테고리 선택
   */
  getRandomCategory(): string {
    const randomIndex = Math.floor(Math.random() * this.categories.length);
    return this.categories[randomIndex];
  }

  /**
   * AI를 통해 오늘의 일본어 표현 생성 (왕초보 기준)
   */
  async generateDailyContent(): Promise<JapaneseContent> {
    const category = this.getRandomCategory();

    // 최근 사용된 문장 가져오기
    const recentHistory = historyManager.getRecentContents("japanese");
    const historyText =
      recentHistory.length > 0
        ? `\n**⛔ 제외할 표현들 (이미 사용됨, 절대 사용 금지):**\n${recentHistory.map((s: string, i: number) => `${i + 1}. ${s}`).join("\n")}\n`
        : "";

    const prompt = `당신은 초보자를 위한 친절한 일본어 선생님입니다.
'${category}' 상황에서 쓸 수 있는 **아주 간단하고 기초적인** 일본어 단어 또는 짧은 문장을 하나 알려주세요.

규칙:
1. **대상**: 일본어를 처음 배우는 왕초보 (복잡한 한자 금지, 쉬운 표현 위주)
${historyText}
2. **필수 표기**: 한자가 포함될 경우 반드시 후리가나(히라가나)를 괄호에 표기하거나 로마자 발음을 함께 적어주세요.
3. 내용은 다음 형식을 엄격히 따라주세요 (JSON 아님, 텍스트 형식):

   🇯🇵 **오늘의 기초 일본어**
   (일본어 단어 또는 문장 - 큰 글씨로 강조)
   
   🗣️ **발음**
   (한글 발음) / (로마자 표기 선택 사항)
   
   💡 **의미**
   (자연스러운 한국어 뜻)
   
   📘 **설명**
   (이 표현이 쓰이는 상황에 대한 아주 쉬운 설명 1줄)

   ✨ **따라 해보세요 (예시)**
   A: (아주 간단한 일본어 대화)
   B: (아주 간단한 일본어 대화)

4. 이모지를 적절히 사용하여 친근하게 꾸며주세요.
5. 전체 길이는 400자 이내로 해주세요.`;

    try {
      const content = await aiService.generateText(prompt, {
        config: { temperature: 0.8 }, // 너무 엉뚱하지 않게
      });

      // 생성된 문장에서 핵심 문장 추출 (첫 줄 또는 "오늘의 기초 일본어" 다음 줄)
      const lines = content.split("\n");
      let keySentence = "";
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("오늘의 기초 일본어") && lines[i + 1]) {
          keySentence = lines[i + 1].trim();
          break;
        }
      }

      // 파싱 실패시 내용의 앞부분 일부 사용
      if (!keySentence) {
        keySentence = content.substring(0, 50).replace(/\n/g, " ");
      }

      // 히스토리에 저장
      historyManager.addHistory("japanese", keySentence);

      const weekdayMsg = this.getWeekdayMessage();

      return {
        category,
        content,
        weekdayMsg,
      };
    } catch (error) {
      console.error("[JapaneseService] 생성 오류:", error);
      throw error;
    }
  }

  /**
   * 모든 길드의 'general' 또는 '일반' 채널에 메시지 전송
   */
  async sendToGeneralChannels(
    client: Client,
  ): Promise<JapaneseServiceResult | null> {
    console.log("[JapaneseService] 일일 일본어 알림 발송 시작...");

    try {
      // 콘텐츠 생성
      const { category, content, weekdayMsg } =
        await this.generateDailyContent();

      // Embed 생성
      const embed = new EmbedBuilder()
        .setColor(0xff69b4) // 핫핑크 (일본어 느낌?)
        .setTitle(`🇯🇵 오늘의 왕초보 일본어 - ${category} 편`)
        .setDescription(`${weekdayMsg}\n\n${content}`)
        .setFooter({ text: "Daily Japanese Helper" })
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
              channel.permissionsFor(guild.members.me!).has("SendMessages"),
          ) as TextChannel | undefined;

          if (targetChannel) {
            await targetChannel.send({ embeds: [embed] });
            console.log(
              `[JapaneseService] 발송 성공: ${guild.name} #${targetChannel.name}`,
            );
            successCount++;
          } else {
            console.log(
              `[JapaneseService] 스킵: ${guild.name} (적절한 채널 없음)`,
            );
          }
        } catch (err: any) {
          console.error(
            `[JapaneseService] 발송 실패 (${guild.name}):`,
            err.message,
          );
        }
      }

      console.log(
        `[JapaneseService] 발송 완료. 총 ${successCount}개 채널 전송.`,
      );

      return { successCount, embed };
    } catch (error) {
      console.error("[JapaneseService] 전체 발송 중 치명적 오류:", error);
      return null;
    }
  }
}

export default new JapaneseService();
