import { EmbedBuilder, Message } from "discord.js";
import geekNewsService from "../../daily_news/geek-news-service";

const execute = async (message: Message): Promise<void> => {
  const progress = await message.reply("🔎 긱뉴스 Top 5를 조회하고 있습니다...");

  const items = await geekNewsService.fetchTopItems(5);
  if (items.length === 0) {
    await progress.edit("❌ 긱뉴스 데이터를 가져오지 못했습니다. 잠시 후 다시 시도해주세요.");
    return;
  }

  const lines = items.map(
    (item) => `${item.rank}. [${item.title}](${item.link}) · 👍 ${item.points}`,
  );

  const embed = new EmbedBuilder()
    .setColor(0xff8a00)
    .setTitle("🧠 긱뉴스 Top 5")
    .setURL("https://news.hada.io/")
    .setDescription(lines.join("\n"))
    .setFooter({ text: "Source: news.hada.io" })
    .setTimestamp();

  await progress.edit({ content: null, embeds: [embed] });
};

export default {
  name: "geeknews",
  description: "긱뉴스 메인 페이지 Top 5를 간단히 보여줍니다.",
  keywords: ["긱뉴스", "geeknews", "gn"],
  execute,
};
