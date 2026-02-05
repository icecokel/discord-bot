import {
  EmbedBuilder,
  ChannelType,
  Client,
  TextChannel,
  Colors,
} from "discord.js";
import { aiService } from "../../core/ai";
import historyManager from "../../utils/HistoryManager";

interface DailyEnglishData {
  content: string;
  meaning: string;
  pronunciation?: string; // 영어는 보통 필요 없지만 일관성을 위해
  description: string;
  examples: Array<{ a: string; b: string }>;
}

export interface EnglishContent {
  category: string;
  // 구조화된 데이터 (성공 시)
  data: DailyEnglishData | null;
  // 원본 텍스트 (실패 시 또는 레거시 호환용)
  content: string;
  weekdayMsg: string;
}

interface EnglishServiceResult {
  successCount: number;
  embed: EmbedBuilder;
}

class EnglishService {
  private categories: string[];
  private weekdayMessages: { [key: number]: string };

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
   * AI를 통해 오늘의 영어 문장 생성 (Structured Output)
   */
  async generateDailyContent(): Promise<EnglishContent> {
    const category = this.getRandomCategory();
    const recentHistory = historyManager.getRecentContents("english");

    // System Prompt: 역할 및 규칙 정의
    const systemPrompt = `당신은 한국인을 위한 친절한 영어 선생님입니다.
초보자도 이해하기 쉬운 실용적인 영어 문장을 가르쳐주세요.

# 필수 규칙
1. 응답은 반드시 아래 JSON 포맷을 준수해야 합니다.
2. 예시는 대화체(A, B)로 2개를 작성하세요.
3. 이모지를 적절히 사용하여 친근하게 만드세요.

# JSON 포맷 예시
{
  "content": "Make yourself at home.",
  "meaning": "편하게 계세요.",
  "description": "손님이 방문했을 때 긴장을 풀어주기 위해 쓰는 표현입니다.",
  "examples": [
    { "a": "Thank you for inviting me.", "b": "You're welcome. Please make yourself at home." },
    { "a": "Can I use the restroom?", "b": "Sure! Make yourself at home." }
  ]
}`;

    // User Prompt: 동적 데이터 전달
    const userPrompt = `주제: '${category}'
${recentHistory.length > 0 ? `제외할 표현(중복 금지): ${recentHistory.join(", ")}` : ""}`;

    try {
      const rawResponse = await aiService.generateText(userPrompt, {
        systemInstruction: systemPrompt,
        config: {
          temperature: 0.9,
          responseMimeType: "application/json", // Native JSON Mode
        },
      });

      let parsedData: DailyEnglishData | null = null;
      let finalContent = rawResponse;

      try {
        parsedData = JSON.parse(rawResponse);
        // 파싱 성공 시 content 필드 업데이트 (히스토리 저장용)
        if (parsedData?.content) {
          finalContent = parsedData.content;
        }
      } catch (e) {
        console.error("[EnglishService] JSON Parsing Failed:", e);
        // 실패 시 rawResponse를 그대로 사용 (Fallback)
      }

      // 히스토리에 저장 (핵심 문장)
      historyManager.addHistory("english", finalContent);

      return {
        category,
        data: parsedData, // 성공 시 객체, 실패 시 null
        content: finalContent, // 문자열 (Fallback 지원)
        weekdayMsg: this.getWeekdayMessage(),
      };
    } catch (error) {
      console.error("[EnglishService] 생성 오류:", error);
      throw error;
    }
  }

  /**
   * Embed 생성 헬퍼
   */
  createEmbed(contentData: EnglishContent): EmbedBuilder {
    const { category, data, content, weekdayMsg } = contentData;

    const embed = new EmbedBuilder()
      .setColor(0x00b0f4) // 하늘색
      .setTitle(`🇺🇸 오늘의 영어 표현 - ${category} 편`)
      .setTimestamp()
      .setFooter({ text: "Daily English Helper" });

    if (data) {
      // JSON 파싱 성공 -> 예쁜 카드 뷰
      embed.setDescription(weekdayMsg); // 요일 멘트는 상단에

      // 1. 오늘의 문장 (가장 크게)
      embed.addFields({
        name: "📝 오늘의 문장",
        value: `### ${data.content}\n${data.meaning}`, // Markdown Heading 활용
      });

      // 2. 설명
      embed.addFields({
        name: "📘 설명",
        value: data.description,
      });

      // 3. 예시
      if (data.examples && data.examples.length > 0) {
        const exampleText = data.examples
          .map((ex) => `**A:** ${ex.a}\n**B:** ${ex.b}`)
          .join("\n\n");
        embed.addFields({
          name: "✨ 활용 예시",
          value: exampleText,
        });
      }
    } else {
      // Fallback -> 기존 통짜 텍스트 뷰
      embed.setDescription(`${weekdayMsg}\n\n${content}`);
    }

    return embed;
  }

  /**
   * 모든 길드의 'general' 또는 '일반' 채널에 메시지 전송
   */
  async sendToGeneralChannels(
    client: Client,
  ): Promise<EnglishServiceResult | null> {
    console.log("[EnglishService] 일일 영어 문장 발송 시작...");

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
              `[EnglishService] 발송 성공: ${guild.name} #${targetChannel.name}`,
            );
            successCount++;
          }
        } catch (err: any) {
          console.error(
            `[EnglishService] 발송 실패 (${guild.name}):`,
            err.message,
          );
        }
      }

      console.log(
        `[EnglishService] 발송 완료. 총 ${successCount}개 채널 전송.`,
      );

      return { successCount, embed };
    } catch (error) {
      console.error("[EnglishService] 전체 발송 중 치명적 오류:", error);
      return null;
    }
  }
}

export default new EnglishService();
