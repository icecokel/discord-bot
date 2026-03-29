import { Message } from "discord.js";
import geekNewsService from "../../daily_news/geek-news-service";

const execute = async (message: Message): Promise<void> => {
  const progress = await message.reply(
    "🔎 오늘의 긱뉴스 기사를 가져와 본문을 번역하는 중입니다...",
  );

  const item = await geekNewsService.fetchFeaturedItem();
  if (!item) {
    await progress.edit(
      "ℹ️ 오늘은 새로 보낼 긱뉴스 기사가 없습니다. 이미 발송했거나 데이터를 가져오지 못했습니다.",
    );
    return;
  }

  const embeds = geekNewsService.createEmbeds(item);

  await progress.edit({ content: null, embeds });
  geekNewsService.markItemAsSent(item);
};

export default {
  name: "geeknews",
  description: "긱뉴스 메인 페이지 상단 기사 1건의 본문을 한국어로 번역합니다.",
  keywords: ["긱뉴스", "geeknews", "gn"],
  execute,
};
