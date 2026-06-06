import { ChannelType, Message } from "discord.js";
import { aiService, searchService } from "./ai";
import {
  appendAdminConversationTurn,
  buildAdminConversationPrompt,
} from "./admin-conversation-context-store";
import { buildDiscordMessageContext, hasDiscordAttachments } from "./discord-message-context";
import { getHermesSessionName } from "./hermes-session-store";

const FINDING_INFO_MESSAGE = "필요한 정보를 찾고 있습니다...";
const ORGANIZING_ANSWER_MESSAGE = "답변을 정리하고 있습니다...";
const BACKGROUND_NOTICE_MESSAGE =
  "요청 확인했습니다. 작업이 길어지고 있어 완료되면 따로 보고드리겠습니다.";
const BACKGROUND_NOTICE_MS = 60_000;
const DEFAULT_HERMES_ADMIN_TOOLSETS =
  "web,browser,terminal,file,code_execution,discord-bot-fs";

type ProgressMessage = Pick<Message, "delete" | "edit">;

const isAdminDmMessage = (message: Message): boolean => {
  return Boolean(
    process.env.ADMIN_ID &&
      message.author.id === process.env.ADMIN_ID &&
      message.channel.type === ChannelType.DM,
  );
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

const sendLongChannelMessage = async (
  message: Message,
  text: string,
): Promise<void> => {
  const chunks = text.match(/[\s\S]{1,1900}/g) || [];

  if (chunks.length === 0) {
    await (message.channel as any).send("답변을 생성하지 못했습니다.");
    return;
  }

  for (const chunk of chunks) {
    if (chunk) {
      await (message.channel as any).send(chunk);
    }
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

const ADMIN_AI_ANSWER_SYSTEM_PROMPT = `너는 디스코드 봇 관리자 DM에서 동작하는 한국어 AI 비서다.
관리자가 명시적으로 요청한 경우 서버 작업, 코드 조사, 파일 수정, 터미널 실행, 브라우저 자동화로 사이트 접속과 탐색을 수행할 수 있다.
작업 전후로 무엇을 확인했고 어떤 변경을 했는지 간결하게 보고한다.
삭제, 초기화, 덮어쓰기, 강제 재설정, 권한 변경, 대량 발송, 서비스 중단처럼 되돌리기 어렵거나 영향 범위가 큰 작업은 절대 바로 실행하지 않는다.
위험 작업은 수행 대상, 영향 범위, 되돌리는 방법을 요약한 뒤 사용자에게 확인을 요청하고, 사용자가 명시적으로 승인한 뒤에만 실행한다.
애매하거나 고민되는 경우에는 추측해서 작업하지 말고 사용자에게 질문한다.
민감정보 값은 출력하지 말고 설정 여부나 키 이름 정도로만 설명한다.
Discord 메시지 전송, 삭제, 채널 관리 도구는 제공되지 않으며 최종 응답 전송은 디스코드 봇이 담당한다.`;

const answerWithAdminHermes = async (
  message: Message,
  progressMessage?: ProgressMessage,
): Promise<boolean> => {
  const waitMessage =
    progressMessage || await message.reply(FINDING_INFO_MESSAGE);
  await editProgressMessage(waitMessage, FINDING_INFO_MESSAGE);

  const userMessage = message.content.trim() || "첨부 이미지를 확인해줘";
  const basePrompt = buildAdminConversationPrompt(
    message.author.id,
    message.channel.id,
    userMessage,
  );
  const prompt = hasDiscordAttachments(message)
    ? `${basePrompt}\n\n${await buildDiscordMessageContext(message)}`
    : basePrompt;

  const answerPromise = (async (): Promise<string> => {
    const result = await aiService.generateTextWithProvider(prompt, {
      systemInstruction: ADMIN_AI_ANSWER_SYSTEM_PROMPT,
      tools: searchService.getTools(),
      disableProviderFallback: true,
      hermesSessionName: getHermesSessionName(
        message.author.id,
        message.channel.id,
      ),
      hermesToolsets:
        process.env.HERMES_ADMIN_TOOLSETS || DEFAULT_HERMES_ADMIN_TOOLSETS,
    });

    appendAdminConversationTurn(message.author.id, message.channel.id, {
      user: userMessage,
      assistant: result.text,
    });
    return `${getAiAnswerPrefix(result)}${result.text}`;
  })();

  let backgroundNoticeTimer: NodeJS.Timeout | undefined;
  const backgroundNoticePromise = new Promise<"background">((resolve) => {
    backgroundNoticeTimer = setTimeout(
      () => resolve("background"),
      BACKGROUND_NOTICE_MS,
    );
  });

  const answerOutcome = answerPromise
    .then((text) => ({ kind: "answer" as const, text }))
    .catch((error) => ({ kind: "error" as const, error }));

  const firstOutcome = await Promise.race([
    answerOutcome,
    backgroundNoticePromise.then((kind) => ({ kind })),
  ]);

  if (firstOutcome.kind === "background") {
    await editProgressMessage(waitMessage, BACKGROUND_NOTICE_MESSAGE);
    void answerPromise
      .then((text) => sendLongChannelMessage(message, text))
      .catch(async (error: any) => {
        console.error(
          "[NaturalLanguage] 백그라운드 Hermes 답변 실패:",
          error.message,
        );
        await sendLongChannelMessage(
          message,
          "Hermes 작업이 완료되지 못했습니다. 범위를 줄여 다시 요청해주세요.",
        );
      });

    return true;
  }

  if (backgroundNoticeTimer) {
    clearTimeout(backgroundNoticeTimer);
  }

  if (firstOutcome.kind === "answer") {
    await editProgressMessage(waitMessage, ORGANIZING_ANSWER_MESSAGE);
    await sendLongReply(message, waitMessage, firstOutcome.text);
    return true;
  }

  try {
    throw firstOutcome.error;
  } catch (error: any) {
    console.error("[NaturalLanguage] 관리자 Hermes 답변 실패:", error.message);
    await waitMessage.edit("답변 생성 중 오류가 발생했습니다.");
  }

  return true;
};

export const handleNaturalLanguageMessage = async (
  message: Message,
): Promise<boolean> => {
  if (!isAdminDmMessage(message)) return false;
  return answerWithAdminHermes(message);
};
