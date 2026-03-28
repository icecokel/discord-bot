import { Message } from "discord.js";
import { commute8407Service } from "../commute-8407-service";

const ALERT_ALIASES = ["알림", "on", "구독", "설정"];
const DISABLE_ALIASES = ["해제", "off", "취소", "삭제"];

export default {
  name: "8407",
  description: "8407 통근버스 예상 도착과 DM 알림을 관리합니다.",
  async execute(message: Message, args: string[]) {
    const action = args[0]?.trim().toLowerCase();

    if (action && !ALERT_ALIASES.includes(action) && !DISABLE_ALIASES.includes(action)) {
      return message.reply(
        "❌ 사용법: `!8407`, `!8407 알림`, `!8407 해제`",
      );
    }

    if (DISABLE_ALIASES.includes(action || "")) {
      const disabled = commute8407Service.disableAlert(message.author.id);
      if (!disabled) {
        return message.reply("ℹ️ 현재 활성화된 8407 알림이 없습니다.");
      }

      return message.reply("🔕 8407 통근버스 알림을 해제했습니다.");
    }

    const snapshot = await commute8407Service.getSnapshot();
    const embed = commute8407Service.createEmbed(snapshot);

    if (ALERT_ALIASES.includes(action || "")) {
      const result = commute8407Service.enableAlert(message.author.id);
      const suffix = result.alreadyEnabled
        ? "이미 DM 알림이 켜져 있습니다."
        : "DM 알림을 켰습니다. 해제 전까지 도착 15분 전에 알려드립니다.";

      return message.reply({
        content: `🔔 ${suffix}`,
        embeds: [embed],
      });
    }

    return message.reply({ embeds: [embed] });
  },
};
