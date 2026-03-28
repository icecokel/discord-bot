import { Message } from "discord.js";
import geekNewsService from "../../daily_news/geek-news-service";

const execute = async (message: Message): Promise<void> => {
  const progress = await message.reply(
    "🔎 오늘의 긱뉴스 기사를 가져와 본문을 번역하는 중입니다...",
  );

  const item = await geekNewsService.fetchFeaturedItem();
  if (!item) {
    await progress.edit("❌ 긱뉴스 데이터를 가져오지 못했습니다. 잠시 후 다시 시도해주세요.");
    return;
  }

  const embeds = geekNewsService.createEmbeds(item);

  await progress.edit({ content: null, embeds });
};

export default {
  name: "geeknews",
  description: "긱뉴스 메인 페이지 상단 기사 1건의 본문을 한국어로 번역합니다.",
  keywords: ["긱뉴스", "geeknews", "gn"],
  execute,
};
