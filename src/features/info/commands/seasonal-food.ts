import { Message, EmbedBuilder } from "discord.js";
import { Command } from "../../../core/loader";
import { getSeasonalFoods } from "../../../data/seasonalFoods";

const seasonalFood: Command = {
  name: "제철음식",
  description: "이번 달의 제철 식재료 정보를 알려줍니다.",
  keywords: ["제철", "식재료", "음식"],
  execute: async (message: Message, args: string[]) => {
    const today = new Date();
    const currentMonth = today.getMonth() + 1; // getMonth() returns 0-11

    const foods = getSeasonalFoods(currentMonth);

    if (foods.length === 0) {
      await message.reply(
        `${currentMonth}월의 제철 식재료 정보를 찾을 수 없습니다.`,
      );
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(`📅 ${currentMonth}월의 제철 식재료`)
      .setDescription(
        `한국의 ${currentMonth}월 제철 식재료를 소개합니다! 건강하고 맛있는 제철 음식을 즐겨보세요.`,
      )
      .setColor("#4CAF50") // Green color for nature/food
      .setTimestamp()
      .setFooter({ text: "출처: 농촌진흥청 및 각종 요리 백과" });

    foods.forEach((food) => {
      const dishInfo = food.recommendedDishes
        ? `\n🍽️ 추천 요리: ${food.recommendedDishes.join(", ")}`
        : "";

      embed.addFields({
        name: `🥒 ${food.name}`,
        value: `${food.description}${dishInfo}`,
        inline: false,
      });
    });

    await (message.channel as any).send({ embeds: [embed] });
  },
};

export default seasonalFood;
