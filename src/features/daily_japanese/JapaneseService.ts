import {
  EmbedBuilder,
  ChannelType,
  Client,
  TextChannel,
  Colors,
} from "discord.js";
import { aiService } from "../../core/ai";
import historyManager from "../../utils/HistoryManager";

interface DailyJapaneseData {
  content: string; // 일본어 문장/단어
  pronunciation: string; // 발음 (한글/로마자)
  meaning: string; // 의미
  description: string; // 설명
  examples: Array<{ a: string; b: string }>; // 대화 예시
}

export interface JapaneseContent {
  category: string;
  // 구조화된 데이터
  data: DailyJapaneseData | null;
  // 원본 텍스트 (Fallback)
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
   * AI를 통해 오늘의 일본어 표현 생성 (Structured Output)
   */
  async generateDailyContent(): Promise<JapaneseContent> {
    const category = this.getRandomCategory();
    const recentHistory = historyManager.getRecentContents("japanese");

    // System Prompt
    const systemPrompt = `당신은 왕초보를 위한 친절한 일본어 선생님입니다.
일본어를 처음 배우는 한국인 학습자를 위해 아주 기초적이고 쉬운 단어나 문장을 가르쳐주세요.

# 필수 규칙
1. 응답은 반드시 아래 JSON 포맷을 준수해야 합니다.
2. 한자에는 반드시 발음(후리가나 또는 로마자)을 포함하세요.
3. 예시는 아주 간단한 대화(A, B)로 2개를 작성하세요.
4. 어려운 한자는 피하고 히라가나 위주로 작성하세요.

# JSON 포맷 예시
{
  "content": "ありがとうございます",
  "pronunciation": "아리가토- 고자이마스",
  "meaning": "감사합니다",
  "description": "가장 기본적이고 정중한 감사 인사입니다.",
  "examples": [
    { "a": "プレゼントです。", "b": "ありがとうございます！" },
    { "a": "座ってください。", "b": "ありがとうございます。" }
  ]
}`;

    // User Prompt
    const userPrompt = `주제: '${category}'
${recentHistory.length > 0 ? `제외할 표현(중복 금지): ${recentHistory.join(", ")}` : ""}`;

    try {
      const rawResponse = await aiService.generateText(userPrompt, {
        systemInstruction: systemPrompt,
        config: {
          temperature: 0.8,
          responseMimeType: "application/json", // Native JSON Mode
        },
      });

      let parsedData: DailyJapaneseData | null = null;
      let finalContent = rawResponse;

      try {
        parsedData = JSON.parse(rawResponse);
        if (parsedData?.content) {
          finalContent = parsedData.content;
        }
      } catch (e) {
        console.error("[JapaneseService] JSON Parsing Failed:", e);
      }

      // 히스토리에 저장
      historyManager.addHistory("japanese", finalContent);

      return {
        category,
        data: parsedData,
        content: finalContent,
        weekdayMsg: this.getWeekdayMessage(),
      };
    } catch (error) {
      console.error("[JapaneseService] 생성 오류:", error);
      throw error;
    }
  }

  /**
   * Embed 생성 헬퍼
   */
  createEmbed(contentData: JapaneseContent): EmbedBuilder {
    const { category, data, content, weekdayMsg } = contentData;

    const embed = new EmbedBuilder()
      .setColor(0xff69b4) // 핫핑크
      .setTitle(`🇯🇵 오늘의 왕초보 일본어 - ${category} 편`)
      .setTimestamp()
      .setFooter({ text: "Daily Japanese Helper" });

    if (data) {
      embed.setDescription(weekdayMsg);

      // 1. 오늘의 기초 일본어
      embed.addFields({
        name: "🇯🇵 오늘의 기초 일본어",
        value: `### ${data.content}`,
      });

      // 2. 발음 & 의미 (나란히 배치 시도, 줄바꿈 사용)
      embed.addFields(
        {
          name: "🗣️ 발음",
          value: data.pronunciation,
          inline: true,
        },
        {
          name: "💡 의미",
          value: data.meaning,
          inline: true,
        },
      );

      // 3. 설명
      embed.addFields({
        name: "📘 설명",
        value: data.description,
      });

      // 4. 예시
      if (data.examples && data.examples.length > 0) {
        const exampleText = data.examples
          .map((ex) => `**A:** ${ex.a}\n**B:** ${ex.b}`)
          .join("\n\n");
        embed.addFields({
          name: "✨ 따라 해보세요 (예시)",
          value: exampleText,
        });
      }
    } else {
      // Fallback
      embed.setDescription(`${weekdayMsg}\n\n${content}`);
    }

    return embed;
  }

  /**
   * 모든 길드의 'general' 또는 '일반' 채널에 메시지 전송
   */
  async sendToGeneralChannels(
    client: Client,
  ): Promise<JapaneseServiceResult | null> {
    console.log("[JapaneseService] 일일 일본어 알림 발송 시작...");

    try {
      const contentData = await this.generateDailyContent();
      const embed = this.createEmbed(contentData);

      let successCount = 0;

      for (const guild of client.guilds.cache.values()) {
        try {
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
