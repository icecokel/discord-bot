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
    // 검색 쿼리에 포맷팅 지시사항을 포함 (User Prompt 강화)
    const query = `site:news.naver.com 오늘 대한민국 주요 뉴스 3가지를 찾아주세요.
검색된 결과를 바탕으로 아래 포맷을 **정확히** 지켜서 작성해야 합니다.
링크(URL)가 없으면 안 됩니다. 검색 도구에서 URL을 반드시 가져오세요.

[포맷 예시]
1. **[뉴스 제목]**
- 요약: ...
- 링크: [기사 보기](https://...)

위 포맷으로 3개를 작성하세요. (번호 매기기는 제목에만 하세요)`;

    const systemPrompt = `당신은 뉴스 큐레이터입니다.
검색 도구(Google Search)를 사용하여 최신 뉴스를 찾고, **반드시 마크다운 포맷**으로 정리해 주세요.

# 🚨 필수 준수 사항
1. **링크 포함 필수**: 각 뉴스 항목마다 [기사 보기](URL) 링크가 없으면 안 됩니다.
2. **요약/링크에 번호 금지**: 요약과 링크 앞에는 숫자(2., 3.)를 쓰지 말고 하이픈(-)이나 점(•)을 쓰세요.
3. **제목만 나열 금지**: "1. [제목]" 만 달랑 쓰지 마세요. 밑에 내용과 링크를 꼭 붙이세요.

# 출력 포맷 (제목에만 번호, 내용은 불렛)
1. **[기사 제목]**
- 요약: (내용)
- 링크: [기사 보기](URL)

2. **[기사 제목]**
- 요약: ...
- 링크: ...`;

    try {
      // AI를 통해 검색 및 요약 요청 (Text Mode)
      // 파싱 없이 결과 텍스트를 그대로 사용합니다.
      const rawResponse = await aiService.generateText(query, {
        systemInstruction: systemPrompt,
        tools: searchService.getTools(),
        config: {
          maxOutputTokens: 4000, // 토큰 제한 대폭 상향 (짤림 방지)
          temperature: 0.6, // 창의성 낮춤 (포맷 준수 강화)
        },
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
