import { EmbedBuilder, Client, TextChannel } from "discord.js";
import { aiService } from "../../core/ai";
import historyManager from "../../utils/history-manager";

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

const cleanMultilineText = (value: string): string =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");

const stripLinePrefix = (line: string, prefixes: string[]): string | null => {
  for (const prefix of prefixes) {
    if (line.startsWith(prefix)) {
      return line.slice(prefix.length).trim();
    }
  }

  return null;
};

const parseJapaneseLesson = (sectionContent: string): DailyJapaneseData => {
  const normalizedContent = cleanMultilineText(sectionContent);
  const lines = normalizedContent.split("\n").filter(Boolean);

  let content = "";
  let pronunciation = "";
  let meaning = "";

  for (const line of lines) {
    if (!content) {
      const prefixedContent = stripLinePrefix(line, [
        "일본어:",
        "문장:",
        "표현:",
      ]);
      if (prefixedContent) {
        content = prefixedContent;
        continue;
      }
    }

    if (!pronunciation) {
      const prefixedPronunciation = stripLinePrefix(line, [
        "발음:",
        "읽기:",
        "요미:",
      ]);
      if (prefixedPronunciation) {
        pronunciation = prefixedPronunciation;
        continue;
      }
    }

    if (!meaning) {
      const prefixedMeaning = stripLinePrefix(line, [
        "뜻:",
        "의미:",
        "한국어:",
      ]);
      if (prefixedMeaning) {
        meaning = prefixedMeaning;
      }
    }
  }

  const slashParts = normalizedContent
    .split(/\s*\/\s*/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (slashParts.length >= 2) {
    if (!content) {
      content = slashParts[0];
    }
    if (!meaning) {
      meaning = slashParts.slice(1).join(" / ");
    }
  }

  if (!content && lines.length > 0) {
    content = lines[0];
  }

  if (!pronunciation && lines.length >= 3) {
    const candidate = lines[1];
    if (!candidate.startsWith("뜻:") && !candidate.startsWith("의미:")) {
      pronunciation = candidate;
    }
  }

  if (!meaning) {
    const fallbackMeaningLine = lines.find((line, index) => {
      if (index === 0) return false;
      return line.startsWith("뜻:") || line.startsWith("의미:");
    });

    if (fallbackMeaningLine) {
      meaning = fallbackMeaningLine.replace(/^(뜻|의미):\s*/, "").trim();
    } else if (lines.length >= 3) {
      meaning = lines[2];
    } else if (lines.length >= 2) {
      meaning = lines[1];
    }
  }

  return {
    content: content || normalizedContent,
    pronunciation,
    meaning,
    description: "",
    examples: [],
    rawExamples: "",
  };
};

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
3. 일본어 문장, 발음, 뜻을 각각 줄바꿈으로 분리하세요.
4. 발음은 일본어 문장 안에 괄호로 섞지 말고 반드시 별도 줄에 작성하세요.
5. 각 섹션 제목은 주어진 이모지와 텍스트를 정확히 지켜야 합니다.

# 📋 응답 템플릿 (복사해서 내용만 채우세요)
### 🇯🇵 오늘의 기초 일본어
일본어: [일본어 문장]
발음: [한글 발음]
뜻: [한국어 의미]

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
      const data: DailyJapaneseData = {
        content: "",
        pronunciation: "",
        meaning: "",
        description: "",
        examples: [],
        rawExamples: "",
      };

      sections.forEach((section: string) => {
        const lines = section.trim().split("\n");
        if (lines.length < 1) return;

        const title = lines[0].trim();
        const content = lines.slice(1).join("\n").trim();

        if (title.includes("오늘의 기초 일본어")) {
          const parsed = parseJapaneseLesson(content);
          data.content = parsed.content;
          data.pronunciation = parsed.pronunciation;
          data.meaning = parsed.meaning;
        } else if (title.includes("설명")) {
          data.description = content;
        } else if (title.includes("따라 해보세요")) {
          data.rawExamples = content;
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
          pronunciation: data.pronunciation || "",
          description: data.description || "",
          examples: [],
          rawExamples: data.rawExamples || "",
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
    const hasStructuredFields = Boolean(
      data &&
        data.content &&
        (data.meaning || data.description || data.rawExamples),
    );

    const embed = new EmbedBuilder()
      .setColor(0xff69b4) // 핫핑크
      .setTitle(`🇯🇵 오늘의 왕초보 일본어 - ${category} 편`)
      .setTimestamp()
      .setFooter({ text: "Daily Japanese Helper" });

    if (hasStructuredFields && data) {
      embed.setDescription(weekdayMsg);

      const lessonLines = [`### ${data.content}`];
      if (data.pronunciation) {
        lessonLines.push(`발음: ${data.pronunciation}`);
      }
      if (data.meaning) {
        lessonLines.push(`뜻: ${data.meaning}`);
      }

      embed.addFields({
        name: "🇯🇵 오늘의 기초 일본어",
        value: lessonLines.join("\n"),
      });

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
