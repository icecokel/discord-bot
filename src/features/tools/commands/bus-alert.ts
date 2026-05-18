import { EmbedBuilder, Message } from "discord.js";
import { busAlertService } from "../bus-alert-service";

const HELP_ALIASES = ["help", "도움", "도움말", "가이드", "설명", "사용법"];
const LIST_ALIASES = ["목록", "list", "조회", "확인"];
const REMOVE_ALIASES = ["해제", "삭제", "remove", "delete", "off", "취소"];
const SET_ALIASES = ["설정", "등록", "추가", "set", "on"];

const createHelpEmbed = (): EmbedBuilder => {
  return new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle("🚌 버스 알림 사용법")
    .setDescription(
      "원하는 정류장 기준으로 버스가 **3정거장 전**일 때 계속 알림을 보냅니다.",
    )
    .addFields(
      {
        name: "알림 설정",
        value:
          "`!버스알림 설정 <노선번호> <정류장명/정류장ID>`\n" +
          "예: `!버스알림 설정 1000 강남역`\n" +
          "예: `!버스알림 설정 1000 228000173`",
      },
      {
        name: "알림 목록",
        value: "`!버스알림 목록`",
      },
      {
        name: "알림 해제",
        value: "`!버스알림 해제 <ID>`",
      },
    )
    .setFooter({
      text: "설정 후 해제 전까지 알림이 유지됩니다.",
    });
};

const formatRouteCandidates = (
  candidates: Array<{
    routeId: string;
    routeName: string;
    routeTypeName?: string;
    companyName?: string;
  }>,
): string => {
  return candidates
    .map((item) => {
      const extras = [item.routeTypeName, item.companyName].filter(Boolean).join(" / ");
      return (
        `- **${item.routeName}** (routeId: \`${item.routeId}\`)` +
        (extras ? ` - ${extras}` : "")
      );
    })
    .join("\n");
};

const formatStationCandidates = (
  candidates: Array<{
    stationId: string;
    stationName: string;
    regionName?: string;
    mobileNo?: string;
  }>,
): string => {
  return candidates
    .map((item) => {
      const extraParts = [item.regionName, item.mobileNo].filter(Boolean);
      const extraText = extraParts.length > 0 ? ` - ${extraParts.join(" / ")}` : "";
      return `- **${item.stationName}** (정류장ID: \`${item.stationId}\`)${extraText}`;
    })
    .join("\n");
};

const execute = async (message: Message, args: string[]) => {
  const subcommand = args[0]?.toLowerCase();

  if (!subcommand || HELP_ALIASES.includes(subcommand)) {
    return message.reply({ embeds: [createHelpEmbed()] });
  }

  if (!busAlertService.isApiConfigured()) {
    return message.reply(
      "❌ 버스 API 키가 설정되지 않았습니다.\n`GYEONGGI_BUS_API_KEY`를 .env에 추가한 뒤 봇을 재시작해주세요.",
    );
  }

  if (LIST_ALIASES.includes(subcommand)) {
    const subscriptions = busAlertService.getSubscriptionsByUser(message.author.id);
    if (subscriptions.length === 0) {
      return message.reply(
        "📭 등록된 버스 알림이 없습니다.\n`!버스알림 설정 <노선번호> <정류장명/정류장ID>`로 등록해주세요.",
      );
    }

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle("🚌 내 버스 알림 목록")
      .setDescription("해제하려면 `!버스알림 해제 <ID>`를 사용하세요.")
      .setTimestamp();

    subscriptions.forEach((item) => {
      embed.addFields({
        name: `[${item.shortId}] ${item.routeName} / ${item.stationName}`,
        value:
          `채널: <#${item.channelId}>\n` +
          `정류장ID: \`${item.stationId}\` | routeId: \`${item.routeId}\`\n` +
          `알림 기준: ${item.thresholdStops}정거장 전`,
        inline: false,
      });
    });

    return message.reply({ embeds: [embed] });
  }

  if (REMOVE_ALIASES.includes(subcommand)) {
    const shortId = args[1];
    if (!shortId) {
      return message.reply(
        "❌ 해제할 알림 ID를 입력해주세요.\n예: `!버스알림 해제 a1b2`",
      );
    }

    const isAdmin = message.author.id === process.env.ADMIN_ID;
    const result = busAlertService.removeSubscriptionByShortId(
      shortId,
      message.author.id,
      { isAdmin },
    );

    if (result.ok) {
      return message.reply(
        `✅ 버스 알림 해제 완료: [${result.subscription.shortId}] ` +
          `${result.subscription.routeName} / ${result.subscription.stationName}`,
      );
    }

    if (result.reason === "FORBIDDEN") {
      return message.reply("⛔ 본인이 등록한 버스 알림만 해제할 수 있습니다.");
    }

    return message.reply(
      `❌ 알림 ID(${shortId})를 찾을 수 없습니다. \`!버스알림 목록\`으로 확인해주세요.`,
    );
  }

  let routeInput = "";
  let stationInput = "";

  if (SET_ALIASES.includes(subcommand)) {
    routeInput = args[1] || "";
    stationInput = args.slice(2).join(" ").trim();
  } else {
    routeInput = args[0] || "";
    stationInput = args.slice(1).join(" ").trim();
  }

  if (!routeInput || !stationInput) {
    return message.reply(
      "❌ 사용법: `!버스알림 설정 <노선번호> <정류장명/정류장ID>`\n" +
        "예: `!버스알림 설정 1000 강남역`",
    );
  }

  const result = await busAlertService.addSubscription(
    message.author.id,
    message.channel.id,
    routeInput,
    stationInput,
    3,
  );

  if (result.ok) {
    return message.reply(
      `✅ 버스 알림 등록 완료!\n` +
        `ID: \`${result.subscription.shortId}\`\n` +
        `노선: **${result.subscription.routeName}**\n` +
        `정류장: **${result.subscription.stationName}** (\`${result.subscription.stationId}\`)\n` +
        `기준: **${result.subscription.thresholdStops}정거장 전**\n` +
        `해제: \`!버스알림 해제 ${result.subscription.shortId}\``,
    );
  }

  if (result.reason === "MISSING_API_KEY") {
    return message.reply(
      "❌ 버스 API 키가 설정되지 않았습니다.\n`GYEONGGI_BUS_API_KEY`를 .env에 추가한 뒤 봇을 재시작해주세요.",
    );
  }

  if (result.reason === "ROUTE_NOT_FOUND") {
    return message.reply(
      `❌ \`${routeInput}\` 노선을 찾지 못했습니다. 노선번호를 다시 확인해주세요.`,
    );
  }

  if (result.reason === "ROUTE_AMBIGUOUS") {
    return message.reply(
      "❗ 같은 이름의 노선이 여러 개입니다. routeId로 다시 시도해주세요.\n" +
        `${formatRouteCandidates(result.candidates)}\n\n` +
        "예: `!버스알림 설정 <routeId> 강남역`",
    );
  }

  if (result.reason === "STATION_NOT_FOUND") {
    return message.reply(
      `❌ \`${stationInput}\` 정류장을 찾지 못했습니다. 정류장명 또는 정류장ID를 확인해주세요.`,
    );
  }

  if (result.reason === "STATION_AMBIGUOUS") {
    return message.reply(
      `❗ \`${result.route.routeName}\` 노선 기준으로 정류장이 여러 개 검색되었습니다.\n` +
        `${formatStationCandidates(result.candidates)}\n\n` +
        "정류장ID로 다시 입력해주세요.",
    );
  }

  if (result.reason === "STATION_NOT_ON_ROUTE") {
    return message.reply(
      `❌ 선택한 정류장이 \`${result.route.routeName}\` 노선에 포함되지 않았습니다.\n` +
        "아래 후보 중 정류장ID를 골라 다시 설정해주세요.\n" +
        `${formatStationCandidates(result.candidates)}`,
    );
  }

  if (result.reason === "DUPLICATE") {
    return message.reply(
      `ℹ️ 이미 등록된 알림입니다. (ID: \`${result.subscription.shortId}\`)\n` +
        "필요하면 `!버스알림 목록`에서 확인 후 해제해주세요.",
    );
  }

  return message.reply(
    `❌ 버스 알림 설정 중 오류가 발생했습니다: ${result.message}\n잠시 후 다시 시도해주세요.`,
  );
};

export default {
  name: "버스알림",
  description: "정류장 기준 버스 3정거장 전 도착 알림을 등록합니다.",
  keywords: ["버스알림", "bus-alert", "버스도착알림"],
  execute,
};
