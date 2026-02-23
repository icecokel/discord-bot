import {
  EmbedBuilder,
  Client,
  ChannelType,
  TextChannel,
  TextBasedChannel,
} from "discord.js";

interface NaverNewsItem {
  title: string;
  originallink: string;
  link: string;
  description: string;
  pubDate: string;
}

interface NaverNewsResponse {
  lastBuildDate: string;
  total: number;
  start: number;
  display: number;
  items: NaverNewsItem[];
}

export interface NewsItem {
  title: string;
  description: string;
  link: string;
  pubDate: string;
}

class NewsService {
  private readonly clientId = process.env.NAVER_APP_CLIENT_ID;
  private readonly clientSecret = process.env.NAVER_APP_CLIENT_SECRET;
  private readonly apiUrl = "https://openapi.naver.com/v1/search/news.json";

  /**
   * HTML 태그(<b>, &quot; 등)를 제거합니다.
   */
  private cleanHtml(text: string): string {
    return text
      .replace(/<[^>]*>?/g, "") // HTML 태그 제거
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
  }

  /**
   * 네이버 검색 API를 통해 IT/과학 뉴스를 가져옵니다.
   */
  async generateDailyNews(): Promise<NewsItem[]> {
    if (!this.clientId || !this.clientSecret) {
      console.error(
        "[NewsService] NAVER_APP_CLIENT_ID or NAVER_APP_CLIENT_SECRET is missing.",
      );
      return [];
    }

    // 검색 쿼리: "IT/과학 뉴스" (정확도 순)
    // display: 5개
    const query = encodeURIComponent("IT/과학 뉴스");
    const url = `${this.apiUrl}?query=${query}&display=5&start=1&sort=sim`;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "X-Naver-Client-Id": this.clientId,
          "X-Naver-Client-Secret": this.clientSecret,
        },
      });

      if (!response.ok) {
        throw new Error(`Naver API Error: ${response.statusText}`);
      }

      const data = (await response.json()) as NaverNewsResponse;

      return data.items.map((item) => ({
        title: this.cleanHtml(item.title),
        description: this.cleanHtml(item.description),
        link: item.originallink || item.link, // 원문 링크 우선
        pubDate: item.pubDate,
      }));
    } catch (error) {
      console.error("[NewsService] 뉴스 가져오기 실패:", error);
      return [];
    }
  }

  /**
   * 뉴스 아이템 목록을 Embed로 변환합니다.
   */
  createEmbed(newsItems: NewsItem[]): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setColor(0x02d642) // 네이버 그린
      .setTitle("📰 오늘의 주요 IT/과학 뉴스")
      .setURL("https://news.naver.com/section/105")
      .setDescription("네이버 뉴스에서 엄선한 주요 소식입니다.")
      .setTimestamp()
      .setFooter({ text: "Daily News Helper • Powered by Naver Open API" });

    if (newsItems.length === 0) {
      embed.setDescription(
        "뉴스를 가져오지 못했습니다. 잠시 후 다시 시도해주세요.",
      );
    } else {
      newsItems.forEach((item, index) => {
        // Discord Embed 필드 값 제한(1024자) 고려하여 description 자르기
        const summary =
          item.description.length > 100
            ? item.description.substring(0, 100) + "..."
            : item.description;

        embed.addFields({
          name: `${index + 1}. ${item.title}`,
          value: `📄 ${summary}\n[기사 보기](${item.link})`,
        });
      });
    }

    return embed;
  }

  /**
   * 관리자 테스트용 발송
   */
  async sendTestNews(channel: any) {
    const msg = await channel.send("🔍 네이버 뉴스를 검색하고 있습니다...");

    try {
      const newsItems = await this.generateDailyNews();

      if (newsItems.length === 0) {
        await msg.edit(
          "❌ 뉴스를 가져오는 데 실패했습니다. 로그를 확인하세요.",
        );
        return;
      }

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
      if (!newsItems || newsItems.length === 0) {
        console.log("[NewsService] 뉴스 내용이 없어 발송을 중단합니다.");
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

  /**
   * 특정 텍스트 채널로 뉴스 발송
   */
  async sendToChannel(client: Client, channelId: string) {
    console.log(`[NewsService] 특정 채널 뉴스 발송 시작: ${channelId}`);
    try {
      const newsItems = await this.generateDailyNews();
      if (!newsItems || newsItems.length === 0) {
        console.log(
          "[NewsService] 뉴스 내용이 없어 특정 채널 발송을 중단합니다.",
        );
        return;
      }

      const channel = await client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) {
        console.log(
          `[NewsService] 텍스트 채널이 아니거나 존재하지 않습니다: ${channelId}`,
        );
        return;
      }

      const embed = this.createEmbed(newsItems);
      await (channel as TextBasedChannel).send({ embeds: [embed] });
      console.log(`[NewsService] 특정 채널 뉴스 발송 완료: ${channelId}`);
    } catch (error) {
      console.error("[NewsService] 특정 채널 발송 중 오류:", error);
    }
  }
}

export default new NewsService();
