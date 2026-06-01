import { Message } from "discord.js";
import { Command } from "./loader";
import { PREFIX } from "../config/constants";
import { log } from "../utils/logger";
import {
  NaturalLanguageIntent,
  intentService,
} from "./ai/intent-service";
import { aiService, searchService } from "./ai";
import { executeAdminCommand } from "./admin-middleware";
import {
  clearPendingAction,
  consumePendingAction,
  getPendingAction,
  setPendingAction,
} from "./pending-action-store";

const EXECUTION_CONFIDENCE_THRESHOLD = 0.8;

const CONFIRM_WORDS = new Set(["확인", "ㅇㅋ", "오케이", "ok", "yes", "실행"]);
const CANCEL_WORDS = new Set(["취소", "아니", "아니요", "no", "그만"]);

const getStringArg = (
  intent: NaturalLanguageIntent,
  key: string,
): string | undefined => {
  const value = intent.args[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const getNumberArg = (
  intent: NaturalLanguageIntent,
  key: string,
): number | undefined => {
  const value = intent.args[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const findCommand = (
  commands: Map<string, Command>,
  identifiers: string[],
): Command | undefined => {
  const normalized = identifiers.map((identifier) => identifier.toLowerCase());
  return [...commands.values()].find((command) => {
    if (normalized.includes(command.name.toLowerCase())) return true;
    return command.keywords?.some((keyword) =>
      normalized.includes(keyword.toLowerCase()),
    );
  });
};

const executeCommand = async (
  message: Message,
  commands: Map<string, Command>,
  identifiers: string[],
  args: string[],
  sourceIntent: string,
): Promise<boolean> => {
  const command = findCommand(commands, identifiers);
  if (!command) {
    await message.reply("실행할 기능을 찾지 못했습니다.");
    return false;
  }

  log({
    userId: message.author.id,
    userName: message.author.tag,
    command: command.name,
    args,
    source: "natural-language",
    intent: sourceIntent,
    originalContent: message.content,
  });

  console.log(
    `[NaturalLanguage] ${sourceIntent} -> ${command.name} by ${message.author.tag} (${message.author.id})`,
  );

  await command.execute(message, args);
  return true;
};

const sendLongReply = async (
  message: Message,
  initialMessage: Message,
  text: string,
): Promise<void> => {
  const chunks = text.match(/[\s\S]{1,1900}/g) || [];
  if (chunks.length === 0) {
    await initialMessage.edit("답변을 생성하지 못했습니다.");
    return;
  }

  const firstChunk = chunks[0];
  if (!firstChunk) {
    await initialMessage.edit("답변을 생성하지 못했습니다.");
    return;
  }

  await initialMessage.edit(firstChunk);
  for (let i = 1; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (chunk) {
      await (message.channel as any).send(chunk);
    }
  }
};

const answerWithAi = async (message: Message): Promise<boolean> => {
  const waitMessage = await message.reply("답변을 생성하고 있습니다...");

  try {
    const response = await aiService.generateText(message.content.trim(), {
      tools: searchService.getTools(),
    });
    await sendLongReply(message, waitMessage, response);
  } catch (error: any) {
    console.error("[NaturalLanguage] AI 답변 실패:", error.message);
    await waitMessage.edit("답변 생성 중 오류가 발생했습니다.");
  }

  return true;
};

const buildConfirmationSummary = (
  intent: NaturalLanguageIntent,
): string => {
  switch (intent.intent) {
    case "admin.notice":
      return `공지 발송 요청으로 이해했습니다.\n내용: ${getStringArg(intent, "content") || "(내용 없음)"}\n대상: 등록된 유저 전체`;
    case "admin.reset":
      return `데이터 초기화 요청으로 이해했습니다.\n대상: ${getStringArg(intent, "target") || "미지정"}`;
    case "weather.clearRegion":
      return "기본 날씨 지역 설정을 해제하는 요청으로 이해했습니다.";
    case "weather.enableNotification":
      return "날씨 DM 알림을 켜는 요청으로 이해했습니다.";
    case "weather.disableNotification":
      return "날씨 DM 알림을 끄는 요청으로 이해했습니다.";
    default:
      return `${intent.intent} 실행 요청으로 이해했습니다.`;
  }
};

const requestConfirmation = async (
  message: Message,
  intent: NaturalLanguageIntent,
): Promise<boolean> => {
  const summary = buildConfirmationSummary(intent);
  setPendingAction(message.author.id, intent, summary);
  await message.reply(`${summary}\n\n실행하려면 "확인", 취소하려면 "취소"라고 답해주세요.`);
  return true;
};

const executeAdminIntent = async (
  message: Message,
  intent: NaturalLanguageIntent,
): Promise<boolean> => {
  switch (intent.intent) {
    case "admin.log": {
      const count = getNumberArg(intent, "count");
      return executeAdminCommand(
        message,
        "log",
        count ? [String(count)] : [],
      );
    }
    case "admin.data":
      return executeAdminCommand(message, "data", []);
    case "admin.test": {
      const mode = getStringArg(intent, "mode");
      return executeAdminCommand(message, "test", mode ? [mode] : []);
    }
    case "admin.news":
      return executeAdminCommand(message, "news", []);
    case "admin.notice": {
      const content = getStringArg(intent, "content");
      if (!content) {
        await message.reply("공지 내용을 알려주세요.");
        return true;
      }
      return executeAdminCommand(message, "notice", [content]);
    }
    case "admin.reset": {
      const target = getStringArg(intent, "target");
      return executeAdminCommand(message, "reset", target ? [target] : []);
    }
    default:
      return false;
  }
};

const executeIntent = async (
  message: Message,
  commands: Map<string, Command>,
  intent: NaturalLanguageIntent,
): Promise<boolean> => {
  const region = getStringArg(intent, "region");

  switch (intent.intent) {
    case "weather.today":
      return executeCommand(
        message,
        commands,
        ["weather", "날씨", "오늘날씨"],
        region ? [region] : [],
        intent.intent,
      );
    case "weather.weekly":
      return executeCommand(
        message,
        commands,
        ["weather-weekly", "주간날씨", "주간", "weekly"],
        region ? [region] : [],
        intent.intent,
      );
    case "weather.setRegion":
      if (!region) {
        await message.reply("기본 지역으로 설정할 지역을 알려주세요.");
        return true;
      }
      return executeCommand(
        message,
        commands,
        ["weather", "날씨"],
        ["설정", region],
        intent.intent,
      );
    case "weather.clearRegion":
      return executeCommand(
        message,
        commands,
        ["weather", "날씨"],
        ["해제"],
        intent.intent,
      );
    case "weather.enableNotification":
      return executeCommand(
        message,
        commands,
        ["weather", "날씨"],
        ["알림"],
        intent.intent,
      );
    case "weather.disableNotification":
      return executeCommand(
        message,
        commands,
        ["weather", "날씨"],
        ["알림해제"],
        intent.intent,
      );
    case "fortune.today":
      return executeCommand(
        message,
        commands,
        ["운세", "fortune", "오늘운세"],
        [],
        intent.intent,
      );
    case "geekNews.translate":
      return executeCommand(
        message,
        commands,
        ["geeknews", "긱뉴스", "gn"],
        [],
        intent.intent,
      );
    case "game.links":
      return executeCommand(
        message,
        commands,
        ["game", "게임"],
        [],
        intent.intent,
      );
    case "user.whoami":
      return executeCommand(
        message,
        commands,
        ["whoami", "내정보", "나"],
        [],
        intent.intent,
      );
    case "bot.info":
      return executeCommand(
        message,
        commands,
        ["info", "정보"],
        [],
        intent.intent,
      );
    case "bot.help":
      return executeCommand(
        message,
        commands,
        ["help", "도움말", "명령어", "사용법"],
        [],
        intent.intent,
      );
    case "admin.log":
    case "admin.data":
    case "admin.test":
    case "admin.news":
    case "admin.notice":
    case "admin.reset":
      return executeAdminIntent(message, intent);
    case "ai.answer":
      return answerWithAi(message);
    case "unknown":
      await message.reply(
        "요청을 정확히 이해하지 못했습니다. 예: \"서울 날씨 알려줘\", \"오늘 운세 봐줘\", \"긱뉴스 번역해줘\"",
      );
      return true;
    default:
      return false;
  }
};

const handlePendingConfirmation = async (
  message: Message,
  commands: Map<string, Command>,
): Promise<boolean> => {
  const content = message.content.trim().toLowerCase();
  const pending = getPendingAction(message.author.id);
  if (!pending) return false;

  if (CANCEL_WORDS.has(content)) {
    clearPendingAction(message.author.id);
    await message.reply("취소했습니다.");
    return true;
  }

  if (!CONFIRM_WORDS.has(content)) return false;

  const action = consumePendingAction(message.author.id);
  if (!action) {
    await message.reply("확인할 요청이 만료되었습니다. 다시 요청해주세요.");
    return true;
  }

  return executeIntent(message, commands, action.intent);
};

export const handleNaturalLanguageMessage = async (
  message: Message,
  commands: Map<string, Command>,
): Promise<boolean> => {
  const content = message.content.trim();
  if (!content || content.startsWith(PREFIX)) return false;

  if (await handlePendingConfirmation(message, commands)) return true;

  const intent = await intentService.classify(content);
  if (
    intent.intent !== "unknown" &&
    intent.intent !== "ai.answer" &&
    intent.confidence < EXECUTION_CONFIDENCE_THRESHOLD
  ) {
    await message.reply(
      "요청을 확실히 이해하지 못했습니다. 지역, 대상, 작업을 조금 더 구체적으로 말해주세요.",
    );
    return true;
  }

  if (intent.requiresConfirmation) {
    return requestConfirmation(message, intent);
  }

  return executeIntent(message, commands, intent);
};
