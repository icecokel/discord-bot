import {
  EmbedBuilder,
  Client,
  ChannelType,
  TextChannel,
  Message,
} from "discord.js";
import { aiService, searchService } from "../../core/ai";

export interface NewsItem {
  title: string;
  description: string;
  link: string;
}

class NewsService {
  /**
   * 오늘의 주요 뉴스를 검색하고 포맷팅하여 반환합니다.
   */
  async generateDailyNews(): Promise<NewsItem[]> {
    const query = "site:news.naver.com 오늘 대한민국 주요 뉴스 5가지";
    const systemPrompt = `당신은 뉴스 큐레이터입니다.
대한민국의 오늘 주요 뉴스 5가지를 선정하여 정리해주세요.
각 뉴스는 아래 3가지 항목을 반드시 포함해야 합니다.

1. 제목 (Title) - 흥미롭고 간결하게
2. 한 줄 설명 (Description) - 핵심 내용을 요약
3. 링크 (Link) - 뉴스 기사 원문 URL (네이버 뉴스 권장)

# 출력 형식 (반드시 JSON 배열 형태)
[
  {
    "title": "뉴스 제목",
    "description": "뉴스 설명",
    "link": "https://n.news.naver.com/..."
  },
  ...
]`;

    try {
      // AI를 통해 검색 및 요약 요청 (aiService 직접 사용)
      const rawResponse = await aiService.generateText(query, {
        systemInstruction: systemPrompt,
        tools: searchService.getTools(), // 검색 도구 주입
        config: {
          responseMimeType: "application/json", // JSON 모드 (Gemini API 지원 시)
        },
      });

      // JSON 파싱 시도
      let newsItems: NewsItem[] = [];
      try {
        // 응답에 마크다운 코드 블록이 있을 수 있으므로 제거 시도
        const cleanResponse = rawResponse
          .replace(/```json/g, "")
          .replace(/```/g, "")
          .trim();
        newsItems = JSON.parse(cleanResponse);

        // 배열이 아닐 경우 (객체로 감싸져 있을 수 있음) 처리
        if (!Array.isArray(newsItems) && (newsItems as any).news) {
          newsItems = (newsItems as any).news;
        }
      } catch (e) {
        console.error("[NewsService] JSON 파싱 실패, 텍스트 파싱 시도", e);
        return [];
      }

      return newsItems.slice(0, 5); // 최대 5개 유지
    } catch (error) {
      console.error("[NewsService] 뉴스 생성 중 오류 발생:", error);
      return [];
    }
  }

  /**
   * 뉴스 아이템을 Embed로 변환합니다.
   */
  createEmbed(newsItems: NewsItem[]): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setColor(0x02d642) // 네이버 그린
      .setTitle("📰 오늘의 주요 뉴스 (Naver News)")
      .setDescription("대한민국 주요 뉴스를 정리해 드립니다.")
      .setTimestamp()
      .setFooter({ text: "Daily News Helper" });

    newsItems.forEach((item, index) => {
      embed.addFields({
        name: `${index + 1}. ${item.title}`,
        value: `${item.description}\n[기사 보기](${item.link})`,
      });
    });

    if (newsItems.length === 0) {
      embed.setDescription(
        "뉴스를 가져오지 못했습니다. 잠시 후 다시 시도해주세요.",
      );
    }

    return embed;
  }

  /**
   * 관리자 테스트용 발송
   */
  async sendTestNews(channel: any) {
    const msg = await channel.send("🔍 뉴스를 검색하고 있습니다...");

    try {
      const newsItems = await this.generateDailyNews();
      const embed = this.createEmbed(newsItems);

      await msg.edit({ content: "✅ 뉴스 검색 완료!", embeds: [embed] });
    } catch (error) {
      console.error("[NewsService] 테스트 발송 실패:", error);
      await msg.edit("❌ 뉴스 검색 중 오류가 발생했습니다.");
    }
  }

  /**
   * 모든 길드의 'general' 채널로 뉴스 발송
   */
  async sendToGeneralChannels(client: Client) {
    console.log("[NewsService] 뉴스 전체 발송 시작...");
    try {
      const newsItems = await this.generateDailyNews();
      if (newsItems.length === 0) {
        console.log("[NewsService] 뉴스 아이템이 없어 발송을 중단합니다.");
        return;
      }

      const embed = this.createEmbed(newsItems);
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
              `[NewsService] 발송 성공: ${guild.name} #${targetChannel.name}`,
            );
            successCount++;
          }
        } catch (err: any) {
          console.error(
            `[NewsService] 발송 실패 (${guild.name}):`,
            err.message,
          );
        }
      }
      console.log(`[NewsService] 발송 완료. 총 ${successCount}개 채널 전송.`);
    } catch (error) {
      console.error("[NewsService] 전체 발송 중 치명적 오류:", error);
    }
  }
}

export default new NewsService();
