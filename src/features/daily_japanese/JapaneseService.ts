import { EmbedBuilder, ChannelType, Client, TextChannel } from "discord.js";
import { aiService } from "../../core/ai";
import historyManager from "../../utils/HistoryManager";

interface DailyJapaneseData {
  content: string;
  pronunciation?: string;
  meaning: string;
  description: string;
  examples?: Array<{ a: string; b: string }>;
  rawExamples?: string; // Text parsing fallback
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

    // System Prompt (JSON 제거, 텍스트 포맷 강조)
    const systemPrompt = `당신은 왕초보를 위한 친절한 일본어 선생님입니다.
일본어를 처음 배우는 한국인 학습자를 위해 아주 기초적이고 쉬운 단어나 문장을 가르쳐주세요.

# 🚨 치명적 규칙 (무시할 경우 시스템 오류 발생)
1. **절대 서론이나 잡담을 하지 마세요.** (예: "네, 알려드릴게요" 등 금지)
2. **반드시 아래 템플릿 포맷을 그대로 사용하세요.**
3. 한자에는 반드시 발음(후리가나 또는 로마자)을 괄호 안에 표기하세요. (예: ありがとうございます (아리가토))
4. 각 섹션 제목은 주어진 이모지와 텍스트를 정확히 지켜야 합니다.

# 📋 응답 템플릿 (복사해서 내용만 채우세요)
### 🇯🇵 오늘의 기초 일본어
[일본어 문장] ([발음]) / [한국어 의미]

### 📘 설명
[문장이 쓰이는 상황이나 뉘앙스 설명]

### ✨ 따라 해보세요 (예시)
A: [대화 A]
B: [대화 B]

A: [대화 A]
B: [대화 B]`;

    // User Prompt
    const userPrompt = `주제: '${category}'
${recentHistory.length > 0 ? `제외할 표현(중복 금지): ${recentHistory.join(", ")}` : ""}

**[중요] 반드시 '### 🇯🇵 오늘의 기초 일본어'로 시작하는 템플릿 포맷을 지켜주세요.**`;

    try {
      // 1. AI 생성 (Text Mode)
      const rawResponse = await aiService.generateText(userPrompt, {
        systemInstruction: systemPrompt,
        config: {
          temperature: 0.8,
          // JSON 모드 제거
        },
      });

      // 2. Robust Text Parsing (Regex)
      const sections = rawResponse.split(/###\s+/);
      const data: any = {};

      sections.forEach((section: string) => {
        const lines = section.trim().split("\n");
        if (lines.length < 1) return;

        const title = lines[0].trim();
        const content = lines.slice(1).join("\n").trim();

        if (title.includes("오늘의 기초 일본어")) {
          // 일어 / 발음 / 뜻 분리 시도 (슬래시 또는 줄바꿈)
          // 예: ありがとうございます (아리가토) / 감사합니다
          const parts = content.split(/\//);
          if (parts.length >= 2) {
            data.content = parts[0].trim();
            data.meaning = parts[1].trim();
            // 발음은 content에 괄호로 포함되어 있다고 가정하거나 추가 파싱
            // 여기서는 단순히 나누기만 함
          } else {
            // 분리 실패 시 통으로
            data.content = content;
            data.meaning = "";
          }
        } else if (title.includes("설명")) {
          data.description = content;
        } else if (title.includes("따라 해보세요")) {
          data.examplesRaw = content;
        }
      });

      const finalContent = data.content || rawResponse;

      // 히스토리에 저장
      historyManager.addHistory("japanese", finalContent);

      return {
        category,
        data: {
          content: data.content || rawResponse,
          meaning: data.meaning || "",
          pronunciation: "", // 텍스트 모드에선 별도 추출 안 함 (content에 포함됨)
          description: data.description || "",
          examples: [],
          rawExamples: data.examplesRaw || "",
        },
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

    if (data && data.content && data.content !== content) {
      embed.setDescription(weekdayMsg);

      embed.addFields({
        name: "🇯🇵 오늘의 기초 일본어",
        value: `### ${data.content}`,
      });

      if (data.meaning) {
        embed.addFields({
          name: "💡 의미",
          value: data.meaning,
        });
      }

      if (data.description) {
        embed.addFields({
          name: "📘 설명",
          value: data.description,
        });
      }

      if (data.rawExamples) {
        embed.addFields({
          name: "✨ 따라 해보세요 (예시)",
          value: data.rawExamples,
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
  /**
   * 지정된 채널에 메시지 전송
   */
  async sendToChannel(
    client: Client,
    channelId: string,
  ): Promise<JapaneseServiceResult | null> {
    console.log(
      `[JapaneseService] 채널(${channelId})로 일일 일본어 알림 발송 시작...`,
    );

    try {
      const contentData = await this.generateDailyContent();
      const embed = this.createEmbed(contentData);

      const channel = (await client.channels.fetch(channelId)) as TextChannel;

      if (channel) {
        await channel.send({ embeds: [embed] });
        console.log(
          `[JapaneseService] 발송 성공: ${channel.guild.name} #${channel.name}`,
        );
        return { successCount: 1, embed };
      } else {
        console.error(
          `[JapaneseService] 채널을 찾을 수 없습니다: ${channelId}`,
        );
        return null;
      }
    } catch (error) {
      console.error("[JapaneseService] 발송 중 치명적 오류:", error);
      return null;
    }
  }
}

export default new JapaneseService();
