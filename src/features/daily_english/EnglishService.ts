import { EmbedBuilder, ChannelType, Client, TextChannel } from "discord.js";
import { aiService } from "../../core/ai";
import historyManager from "../../utils/HistoryManager";

interface DailyEnglishData {
  content: string;
  meaning: string;
  pronunciation?: string;
  description: string;
  examples?: Array<{ a: string; b: string }>;
  rawExamples?: string; // Text parsing fallback
}

export interface EnglishContent {
  category: string;
  data: DailyEnglishData | null;
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

    // System Prompt: 역할 및 규칙 정의 (JSON 제거, 텍스트 포맷 강조)
    const systemPrompt = `당신은 한국인을 위한 친절한 영어 선생님입니다.
초보자도 이해하기 쉬운 실용적인 영어 문장을 가르쳐주세요.

# 필수 규칙
1. **반드시 아래 텍스트 포맷을 지켜주세요.** (JSON 아님)
2. 각 항목의 제목은 '### ' 뒤에 알맞은 이모지를 넣어 작성하세요.
3. 예시는 대화체(A, B)로 2개를 작성하세요.
4. 이모지를 적절히 사용하여 친근하게 만드세요.

# 응답 포맷 예시
### 📝 오늘의 문장
Make yourself at home. (편하게 계세요.)

### 📘 설명
손님이 방문했을 때 긴장을 풀어주기 위해 쓰는 표현입니다.

### ✨ 활용 예시
A: Thank you for inviting me.
B: You're welcome. Please make yourself at home.

A: Can I use the restroom?
B: Sure! Make yourself at home.`;

    // User Prompt: 동적 데이터 전달
    const userPrompt = `주제: '${category}'
${recentHistory.length > 0 ? `제외할 표현(중복 금지): ${recentHistory.join(", ")}` : ""}`;

    try {
      // 1. AI 생성 (Text Mode)
      const rawResponse = await aiService.generateText(userPrompt, {
        systemInstruction: systemPrompt,
        config: {
          temperature: 0.9,
          // JSON 모드 제거 (기본 텍스트 모드)
        },
      });

      // 2. Robust Text Parsing (Regex)
      // '### 제목' 패턴을 기준으로 텍스트를 나눔
      const sections = rawResponse.split(/###\s+/);
      const data: any = {};

      sections.forEach((section: string) => {
        const lines = section.trim().split("\n");
        if (lines.length < 1) return;

        const title = lines[0].trim(); // 첫 줄은 제목
        const content = lines.slice(1).join("\n").trim(); // 나머지는 내용

        if (title.includes("오늘의 문장")) {
          // 문장과 뜻이 같이 있는 경우 분리 시도 (줄바꿈 또는 괄호)
          const parts = content.split(/\n|\(/);
          data.content = parts[0].trim();
          data.meaning = content
            .replace(data.content, "")
            .replace(/^\(/, "")
            .replace(/\)$/, "")
            .trim();
          // 괄호 안에 뜻이 있다면 괄호 제거

          // 만약 분리가 잘 안됐다면 통째로 넣음
          if (!data.meaning) data.meaning = content;
        } else if (title.includes("설명")) {
          data.description = content;
        } else if (title.includes("활용 예시")) {
          // 예시는 텍스트 그대로 저장 (나중에 알아서 포맷팅됨)
          data.examplesRaw = content;
        }
      });

      // 파싱 실패 시 원본 텍스트 사용 (Fallback)
      const finalContent = data.content || rawResponse;

      // 히스토리에 저장
      historyManager.addHistory("english", finalContent);

      return {
        category,
        data: {
          content: data.content || rawResponse, // 실패하면 전체 다 넣음
          meaning: data.meaning || "",
          description: data.description || "",
          examples: [], // Text 모드에서는 examples 배열 구조화 포기 (복잡도 낮춤)
          rawExamples: data.examplesRaw || "", // 대신 원본 텍스트 저장
        },
        content: finalContent,
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

    // 파싱된 데이터가 조금이라도 있으면 Embed 구성
    if (data && data.content && data.content !== content) {
      embed.setDescription(weekdayMsg);

      embed.addFields({
        name: "📝 오늘의 문장",
        value: `### ${data.content}\n${data.meaning}`,
      });

      if (data.description) {
        embed.addFields({
          name: "📘 설명",
          value: data.description,
        });
      }

      if (data.rawExamples) {
        embed.addFields({
          name: "✨ 활용 예시",
          value: data.rawExamples,
        });
      }
    } else {
      // 완전 Fallback -> 그냥 텍스트 때려박기
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
    console.log("[EnglishService] 일일 영어 알림 발송 시작...");

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
