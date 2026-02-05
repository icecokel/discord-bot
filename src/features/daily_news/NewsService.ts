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

# 각 뉴스 항목의 형식 (반드시 지킬 것)
### 1. [뉴스 제목]
- 요약: [한 줄 설명]
- 링크: [기사 URL]

# 규칙
- 반드시 5개의 뉴스를 작성하세요.
- 번호(1, 2, 3...)와 "### " 형식을 정확히 지켜주세요.
- 링크는 네이버 뉴스(n.news.naver.com) 위주로 찾아주세요.
- JSON 형식이 아닌 일반 텍스트로(Markdown) 작성하세요.`;

    try {
      // AI를 통해 검색 및 요약 요청 (Text Mode)
      const rawResponse = await aiService.generateText(query, {
        systemInstruction: systemPrompt,
        tools: searchService.getTools(),
        config: {
          // JSON 모드 사용 안 함
        },
      });

      // 텍스트 파싱
      const newsItems: NewsItem[] = [];
      const sections = rawResponse.split(/### \d+\./); // "### 1.", "### 2." 등으로 분리

      for (const section of sections) {
        if (!section.trim()) continue;

        const lines = section.trim().split("\n");
        let title = lines[0].trim();
        let description = "";
        let link = "";

        // 제목에서 대괄호 제거 ([뉴스 제목] -> 뉴스 제목)
        title = title.replace(/^\[|\]$/g, "").trim();

        for (const line of lines.slice(1)) {
          if (line.includes("- 요약:")) {
            description = line.replace("- 요약:", "").trim();
            // 대괄호 제거
            description = description.replace(/^\[|\]$/g, "").trim();
          } else if (line.includes("- 링크:")) {
            link = line.replace("- 링크:", "").trim();
            // 대괄호 제거
            link = link.replace(/^\[|\]$/g, "").trim();
          }
        }

        if (title && description) {
          // 링크가 없을 경우 검색 결과에서 유추하거나 비워둠 (여기서는 안전하게 추가)
          newsItems.push({ title, description, link });
        }
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
