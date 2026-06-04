import { ChannelType, Message } from "discord.js";
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
import {
  appendConversationTurn,
  buildConversationPrompt,
  CONVERSATION_COMPRESSION_TURN_COUNT,
  getConversationTurns,
  replaceConversationWithSummary,
} from "./conversation-context-store";
import {
  buildDiscordMessageContext,
  hasDiscordAttachments,
} from "./discord-message-context";
import { getHermesSessionName } from "./hermes-session-store";

const EXECUTION_CONFIDENCE_THRESHOLD = 0.8;
const CHECKING_REQUEST_MESSAGE = "요청을 확인하고 있습니다...";
const ROUTING_REQUEST_MESSAGE = "어떤 기능으로 처리할지 살펴보는 중입니다...";
const FINDING_INFO_MESSAGE = "필요한 정보를 찾고 있습니다...";
const ORGANIZING_ANSWER_MESSAGE = "답변을 정리하고 있습니다...";
const LONG_WAIT_MESSAGE = "조금만 더 확인해보겠습니다...";
const MEMORY_COMPRESSION_COMPLETE_MESSAGE =
  "대화 기억을 요약해서 정리했습니다.";
const LONG_WAIT_MS = 10_000;
const DEFAULT_HERMES_ADMIN_TOOLSETS =
  "web,browser,terminal,file,code_execution";

const CONFIRM_WORDS = new Set(["확인", "ㅇㅋ", "오케이", "ok", "yes", "실행"]);
const CANCEL_WORDS = new Set(["취소", "아니", "아니요", "no", "그만"]);

type ProgressMessage = Pick<Message, "delete" | "edit">;

const isAdminDmMessage = (message: Message): boolean => {
  return Boolean(
    process.env.ADMIN_ID &&
      message.author.id === process.env.ADMIN_ID &&
      message.channel.type === ChannelType.DM,
  );
};

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
  initialMessage: Pick<Message, "edit">,
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

const clearProgressMessage = async (
  progressMessage: ProgressMessage | undefined,
): Promise<void> => {
  if (!progressMessage) return;

  try {
    await progressMessage.delete();
  } catch {
    // 상태 메시지 삭제 실패는 실제 명령 실행을 막지 않는다.
  }
};

const editProgressMessage = async (
  progressMessage: Pick<Message, "edit"> | undefined,
  text: string,
): Promise<void> => {
  if (!progressMessage) return;

  try {
    await progressMessage.edit(text);
  } catch {
    // 중간 상태 메시지 수정 실패는 최종 응답 생성을 막지 않는다.
  }
};

const getAiAnswerPrefix = (result: {
  providerName: string;
  usedFallback: boolean;
}): string => {
  if (result.usedFallback) {
    return result.providerName === "gemini"
      ? "[Gemini fallback] "
      : `[${result.providerName} fallback] `;
  }

  if (result.providerName === "hermes") {
    return "[Hermes] ";
  }

  return "";
};

const AI_ANSWER_SYSTEM_PROMPT = `너는 디스코드 서버에서 질문에 정확한 답변을 찾아주는 한국어 AI 비서다.
너는 코딩 도우미가 아니다. 코드를 작성하거나 프로젝트를 대신 수정하는 역할로 답하지 않는다.
답변은 간결하고 실용적으로 하되, 사실 확인과 정확성을 우선한다.
날씨, 운세, 뉴스, 관리자 기능처럼 이 봇의 기존 명령으로 처리할 수 있는 요청은 직접 답변을 꾸미지 말고 해당 기능을 쓰도록 유도한다.
확실하지 않은 내용은 추측하지 말고 확인이 필요하다고 말한다.
민감정보, 토큰, 비밀번호, 개인키를 요구하거나 노출하지 않는다.`;

const ADMIN_AI_ANSWER_SYSTEM_PROMPT = `너는 디스코드 봇 관리자 DM에서 동작하는 한국어 AI 비서다.
관리자가 명시적으로 요청한 경우 서버 작업, 코드 조사, 파일 수정, 터미널 실행, 브라우저 자동화로 사이트 접속과 탐색을 수행할 수 있다.
작업 전후로 무엇을 확인했고 어떤 변경을 했는지 간결하게 보고한다.
삭제, 강제 초기화, 토큰/비밀번호/개인키 노출, 대량 발송처럼 위험하거나 되돌리기 어려운 작업은 실행 전에 확인을 요청한다.
민감정보 값은 출력하지 말고 설정 여부나 키 이름 정도로만 설명한다.
Discord 메시지 전송, 삭제, 채널 관리 도구는 제공되지 않으며 최종 응답 전송은 디스코드 봇이 담당한다.`;

const CONVERSATION_SUMMARY_SYSTEM_PROMPT = `너는 대화 맥락 압축기다.
다음 대화에서 사용자의 목표, 선호, 진행 중인 주제, 답변에 필요한 사실만 한국어로 간결하게 요약한다.
불필요한 인사, 중복 표현, 민감정보는 제거한다.
출력은 요약 문장만 작성한다.`;

const maybeCompressConversation = async (
  message: Message,
): Promise<boolean> => {
  const turns = getConversationTurns(message.author.id, message.channel.id);
  if (turns.length < CONVERSATION_COMPRESSION_TURN_COUNT) return false;

  const transcript = turns
    .map((turn) => `사용자: ${turn.user}\n비서: ${turn.assistant}`)
    .join("\n\n");

  try {
    const summary = await aiService.generateText(transcript, {
      systemInstruction: CONVERSATION_SUMMARY_SYSTEM_PROMPT,
      config: {
        temperature: 0.2,
        maxOutputTokens: 800,
      },
    });

    if (summary.trim()) {
      replaceConversationWithSummary(
        message.author.id,
        message.channel.id,
        summary.trim(),
      );
      return true;
    }
  } catch (error: any) {
    console.error("[NaturalLanguage] 대화 맥락 압축 실패:", error.message);
  }

  return false;
};

const answerWithAi = async (
  message: Message,
  progressMessage?: ProgressMessage,
): Promise<boolean> => {
  const waitMessage =
    progressMessage || await message.reply(FINDING_INFO_MESSAGE);
  await editProgressMessage(waitMessage, FINDING_INFO_MESSAGE);
  const useHermesSession = isAdminDmMessage(message);
  const userMessage = message.content.trim() || "첨부 이미지를 확인해줘";
  const basePrompt = useHermesSession
    ? userMessage
    : buildConversationPrompt(
        message.author.id,
        message.channel.id,
        userMessage,
      );
  const prompt = hasDiscordAttachments(message)
    ? `${basePrompt}\n\n${await buildDiscordMessageContext(message)}`
    : basePrompt;
  const longWaitTimer = setTimeout(() => {
    void editProgressMessage(waitMessage, LONG_WAIT_MESSAGE);
  }, LONG_WAIT_MS);

  try {
    let compressedConversation = false;
    const result = await aiService.generateTextWithProvider(
      prompt,
      {
        systemInstruction: useHermesSession
          ? ADMIN_AI_ANSWER_SYSTEM_PROMPT
          : AI_ANSWER_SYSTEM_PROMPT,
        tools: searchService.getTools(),
        disableProviderFallback: true,
        ...(useHermesSession
          ? {
              hermesSessionName: getHermesSessionName(
                message.author.id,
                message.channel.id,
              ),
              hermesToolsets:
                process.env.HERMES_ADMIN_TOOLSETS ||
                DEFAULT_HERMES_ADMIN_TOOLSETS,
            }
          : {}),
      },
    );
    clearTimeout(longWaitTimer);
    await editProgressMessage(waitMessage, ORGANIZING_ANSWER_MESSAGE);
    if (result.providerName === "hermes" && !useHermesSession) {
      appendConversationTurn(message.author.id, message.channel.id, {
        user: userMessage,
        assistant: result.text,
      });
      compressedConversation = await maybeCompressConversation(message);
    }
    await sendLongReply(
      message,
      waitMessage,
      `${getAiAnswerPrefix(result)}${result.text}`,
    );
    if (compressedConversation) {
      await (message.channel as any).send(MEMORY_COMPRESSION_COMPLETE_MESSAGE);
    }
  } catch (error: any) {
    clearTimeout(longWaitTimer);
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
  progressMessage?: ProgressMessage,
): Promise<boolean> => {
  const summary = buildConfirmationSummary(intent);
  setPendingAction(message.author.id, intent, summary);
  const text = `${summary}\n\n실행하려면 "확인", 취소하려면 "취소"라고 답해주세요.`;
  if (progressMessage) {
    await progressMessage.edit(text);
  } else {
    await message.reply(text);
  }
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
        "로그",
        count ? [String(count)] : [],
      );
    }
    case "admin.data":
      return executeAdminCommand(message, "데이터", []);
    case "admin.test": {
      const mode = getStringArg(intent, "mode");
      return executeAdminCommand(message, "테스트", mode ? [mode] : []);
    }
    case "admin.news":
      return executeAdminCommand(message, "뉴스", []);
    case "admin.notice": {
      const content = getStringArg(intent, "content");
      if (!content) {
        await message.reply("공지 내용을 알려주세요.");
        return true;
      }
      return executeAdminCommand(message, "공지", [content]);
    }
    case "admin.reset": {
      const target = getStringArg(intent, "target");
      return executeAdminCommand(message, "초기화", target ? [target] : []);
    }
    default:
      return false;
  }
};

const executeIntent = async (
  message: Message,
  commands: Map<string, Command>,
  intent: NaturalLanguageIntent,
  progressMessage?: ProgressMessage,
): Promise<boolean> => {
  const region = getStringArg(intent, "region");

  switch (intent.intent) {
    case "weather.today":
      await editProgressMessage(progressMessage, ROUTING_REQUEST_MESSAGE);
      await clearProgressMessage(progressMessage);
      return executeCommand(
        message,
        commands,
        ["날씨", "오늘날씨"],
        region ? [region] : [],
        intent.intent,
      );
    case "weather.weekly":
      await editProgressMessage(progressMessage, ROUTING_REQUEST_MESSAGE);
      await clearProgressMessage(progressMessage);
      return executeCommand(
        message,
        commands,
        ["주간날씨", "주간"],
        region ? [region] : [],
        intent.intent,
      );
    case "weather.setRegion":
      if (!region) {
        if (progressMessage) {
          await progressMessage.edit("기본 지역으로 설정할 지역을 알려주세요.");
        } else {
          await message.reply("기본 지역으로 설정할 지역을 알려주세요.");
        }
        return true;
      }
      await editProgressMessage(progressMessage, ROUTING_REQUEST_MESSAGE);
      await clearProgressMessage(progressMessage);
      return executeCommand(
        message,
        commands,
        ["날씨"],
        ["설정", region],
        intent.intent,
      );
    case "weather.clearRegion":
      await editProgressMessage(progressMessage, ROUTING_REQUEST_MESSAGE);
      await clearProgressMessage(progressMessage);
      return executeCommand(
        message,
        commands,
        ["날씨"],
        ["해제"],
        intent.intent,
      );
    case "weather.enableNotification":
      await editProgressMessage(progressMessage, ROUTING_REQUEST_MESSAGE);
      await clearProgressMessage(progressMessage);
      return executeCommand(
        message,
        commands,
        ["날씨"],
        ["알림"],
        intent.intent,
      );
    case "weather.disableNotification":
      await editProgressMessage(progressMessage, ROUTING_REQUEST_MESSAGE);
      await clearProgressMessage(progressMessage);
      return executeCommand(
        message,
        commands,
        ["날씨"],
        ["알림해제"],
        intent.intent,
      );
    case "fortune.today":
      await editProgressMessage(progressMessage, ROUTING_REQUEST_MESSAGE);
      await clearProgressMessage(progressMessage);
      return executeCommand(
        message,
        commands,
        ["운세", "오늘운세"],
        [],
        intent.intent,
      );
    case "geekNews.translate":
      await editProgressMessage(progressMessage, ROUTING_REQUEST_MESSAGE);
      await clearProgressMessage(progressMessage);
      return executeCommand(
        message,
        commands,
        ["긱뉴스"],
        [],
        intent.intent,
      );
    case "game.links":
      await editProgressMessage(progressMessage, ROUTING_REQUEST_MESSAGE);
      await clearProgressMessage(progressMessage);
      return executeCommand(
        message,
        commands,
        ["게임"],
        [],
        intent.intent,
      );
    case "user.whoami":
      await editProgressMessage(progressMessage, ROUTING_REQUEST_MESSAGE);
      await clearProgressMessage(progressMessage);
      return executeCommand(
        message,
        commands,
        ["내정보", "나"],
        [],
        intent.intent,
      );
    case "admin.log":
    case "admin.data":
    case "admin.test":
    case "admin.news":
    case "admin.notice":
    case "admin.reset":
      await editProgressMessage(progressMessage, ROUTING_REQUEST_MESSAGE);
      await clearProgressMessage(progressMessage);
      return executeAdminIntent(message, intent);
    case "ai.answer":
      return answerWithAi(message, progressMessage);
    case "unknown":
      return answerWithAi(message, progressMessage);
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
  const hasAttachments = hasDiscordAttachments(message);
  if ((!content && !hasAttachments) || content.startsWith(PREFIX)) return false;

  if (await handlePendingConfirmation(message, commands)) return true;

  const progressMessage = await message.reply(CHECKING_REQUEST_MESSAGE);
  if (!content && hasAttachments) {
    return answerWithAi(message, progressMessage);
  }

  const intent = await intentService.classify(content);
  if (
    intent.intent !== "unknown" &&
    intent.intent !== "ai.answer" &&
    intent.confidence < EXECUTION_CONFIDENCE_THRESHOLD
  ) {
    return answerWithAi(message, progressMessage);
  }

  if (intent.requiresConfirmation) {
    return requestConfirmation(message, intent, progressMessage);
  }

  return executeIntent(message, commands, intent, progressMessage);
};
