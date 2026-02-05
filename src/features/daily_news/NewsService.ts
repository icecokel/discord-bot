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
  async generateDailyNews(): Promise<string> {
    const query = "site:news.naver.com 오늘 대한민국 주요 뉴스 5가지";
    const systemPrompt = `당신은 뉴스 큐레이터입니다.
오늘 대한민국의 주요 뉴스 5가지를 선정하여, **반드시 아래 포맷에 맞춰** 작성해주세요.

# 🚨 출력 포맷 (이 형식을 벗어나면 안 됩니다)
1. **[기사 제목]**
- 요약: (기사의 핵심 내용을 1~2문장으로 요약)
- 링크: [기사 보기](기사 URL)

2. **[기사 제목]**
- 요약: ...
- 링크: ...

# ⚠️ 주의사항 (Negative Constraints)
- **절대로 제목만 나열하지 마세요.** (예: "1. 제목" 형식 금지)
- **각 뉴스마다 요약과 링크가 반드시 포함되어야 합니다.**
- 인사말이나 서론("오늘의 뉴스입니다")을 포함하지 마세요.
- 제목 옆에 불필요한 이모지를 붙이지 마세요.`;

    try {
      // AI를 통해 검색 및 요약 요청 (Text Mode)
      // 파싱 없이 결과 텍스트를 그대로 사용합니다.
      const rawResponse = await aiService.generateText(query, {
        systemInstruction: systemPrompt,
        tools: searchService.getTools(),
        config: {},
      });

      return rawResponse;
    } catch (error) {
      console.error("[NewsService] 뉴스 생성 중 오류 발생:", error);
      return "뉴스를 가져오는 데 실패했습니다.";
    }
  }

  /**
   * 뉴스 텍스트를 Embed로 변환합니다.
   */
  createEmbed(newsContent: string): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setColor(0x02d642) // 네이버 그린
      .setTitle("📰 오늘의 주요 뉴스 (Naver News)")
      .setTimestamp()
      .setFooter({ text: "Daily News Helper" });

    if (!newsContent || newsContent.includes("실패했습니다")) {
      embed.setDescription(
        "뉴스를 가져오지 못했습니다. 잠시 후 다시 시도해주세요.",
      );
    } else {
      embed.setDescription(newsContent);
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
      if (!newsItems || newsItems.length < 10) {
        console.log("[NewsService] 뉴스 내용이 너무 짧아 발송을 중단합니다.");
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
