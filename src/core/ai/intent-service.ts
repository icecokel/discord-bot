import { aiService } from "./index";
import kmaData from "../../data/kma-data.json";

export type NaturalLanguageIntentName =
  | "weather.today"
  | "weather.weekly"
  | "weather.setRegion"
  | "weather.clearRegion"
  | "weather.enableNotification"
  | "weather.disableNotification"
  | "fortune.today"
  | "geekNews.translate"
  | "game.links"
  | "user.whoami"
  | "admin.log"
  | "admin.data"
  | "admin.test"
  | "admin.news"
  | "admin.notice"
  | "admin.reset"
  | "ai.answer"
  | "unknown";

export interface NaturalLanguageIntent {
  intent: NaturalLanguageIntentName;
  confidence: number;
  args: Record<string, unknown>;
  requiresConfirmation: boolean;
  replyMode: "execute" | "answer" | "clarify";
}

const INTENT_NAMES: NaturalLanguageIntentName[] = [
  "weather.today",
  "weather.weekly",
  "weather.setRegion",
  "weather.clearRegion",
  "weather.enableNotification",
  "weather.disableNotification",
  "fortune.today",
  "geekNews.translate",
  "game.links",
  "user.whoami",
  "admin.log",
  "admin.data",
  "admin.test",
  "admin.news",
  "admin.notice",
  "admin.reset",
  "ai.answer",
  "unknown",
];

const CONFIRMATION_INTENTS = new Set<NaturalLanguageIntentName>([
  "admin.notice",
  "admin.reset",
  "weather.clearRegion",
  "weather.enableNotification",
  "weather.disableNotification",
]);

const makeIntent = (
  intent: NaturalLanguageIntentName,
  args: Record<string, unknown> = {},
  confidence = 0.92,
): NaturalLanguageIntent => ({
  intent,
  confidence,
  args,
  requiresConfirmation: CONFIRMATION_INTENTS.has(intent),
  replyMode: intent === "ai.answer" ? "answer" : "execute",
});

const normalizeText = (text: string): string =>
  text.toLowerCase().replace(/\s+/g, " ").trim();

const getRegionNames = (): string[] =>
  Object.keys(kmaData as Record<string, unknown>).sort(
    (a, b) => b.length - a.length,
  );

const extractKnownRegion = (text: string): string | undefined => {
  const normalized = normalizeText(text);
  return getRegionNames().find((region) =>
    normalized.includes(region.toLowerCase()),
  );
};

const cleanRegionPhrase = (text: string): string | undefined => {
  const cleaned = text
    .replace(/[?!.,。！？]/g, " ")
    .replace(/\b(today|weather|weekly)\b/gi, " ")
    .replace(/오늘|내일|모레|이번 주|이번주|주간|일주일|7일|칠일/g, " ")
    .replace(/날씨|기온|강수|우산/g, " ")
    .replace(/알려줘|알려|어때|조회|확인|봐줘|보여줘|부탁|좀/g, " ")
    .replace(/기본\s*지역|지역/g, " ")
    .replace(/설정|저장|바꿔|해줘|해 줘/g, " ")
    .replace(/(으로|로|은|는|이|가|을|를|의)$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned.length > 0 ? cleaned : undefined;
};

const extractRegionPhrase = (text: string): string | undefined => {
  const setupMatch = text.match(
    /(?:기본\s*지역|지역)\s+(.+?)(?:으로|로)?\s*(?:설정|저장|바꿔|해줘|해 줘)/,
  );
  if (setupMatch?.[1]) {
    return cleanRegionPhrase(setupMatch[1]);
  }

  const beforeWeatherMatch = text.match(
    /^(.+?)\s*(?:오늘|내일|모레|이번 주|이번주|주간)?\s*(?:날씨|기온|강수|우산)/,
  );
  if (beforeWeatherMatch?.[1]) {
    return cleanRegionPhrase(beforeWeatherMatch[1]);
  }

  const afterWeatherMatch = text.match(
    /(?:날씨|기온|강수|우산)\s+(.+?)(?:알려줘|알려|어때|조회|확인|봐줘|보여줘)?$/,
  );
  if (afterWeatherMatch?.[1]) {
    return cleanRegionPhrase(afterWeatherMatch[1]);
  }

  return undefined;
};

const extractCount = (text: string): number | undefined => {
  const match = text.match(/(\d+)\s*(개|건|줄|회)?/);
  if (!match) return undefined;
  const count = Number.parseInt(match[1], 10);
  if (!Number.isFinite(count)) return undefined;
  return count;
};

const extractNoticeContent = (text: string): string => {
  return text
    .replace(/공지(로|를|사항)?/g, "")
    .replace(/(보내줘|보내|발송해줘|발송|전송해줘|전송)$/g, "")
    .trim();
};

const extractResetTarget = (text: string): string | undefined => {
  if (/운세/.test(text)) return "운세";
  return undefined;
};

const hasExplicitResetRequest = (text: string): boolean =>
  /초기화\s*(해|해줘|해주세요|시켜|시켜줘)|리셋\s*(해|해줘|해주세요)|reset\s*(please|now)?/.test(
    text,
  );

const classifyWeatherIntent = (
  text: string,
): NaturalLanguageIntent | null => {
  const hasExplicitRainSignal =
    /(^|[\s,?!.,。！？])비\s*(와|오|올|옴|내리|내려|내림|확률|예보|\?)/.test(
      text,
    ) || /비가|비는|비도|비를|비올|비와|비오|비옴/.test(text);
  const hasWeatherSignal =
    /날씨|기온|강수|우산|춥|더워|덥/.test(text) ||
    hasExplicitRainSignal ||
    /기본.*지역|지역.*설정|지역.*저장/.test(text);
  if (!hasWeatherSignal) return null;

  const region = extractRegionPhrase(text) || extractKnownRegion(text);
  const args = region ? { region } : {};

  if (/알림|구독/.test(text)) {
    if (/해제|끄|꺼|중지|그만|취소/.test(text)) {
      return makeIntent("weather.disableNotification", args);
    }
    return makeIntent("weather.enableNotification", args);
  }

  if (/기본|지역|저장|설정/.test(text) && /설정|저장|해줘|해 줘|바꿔/.test(text)) {
    return makeIntent("weather.setRegion", args);
  }

  if (/해제|삭제|지워|초기화/.test(text)) {
    return makeIntent("weather.clearRegion", args);
  }

  if (/주간|이번 주|일주일|7일|칠일|weekly/.test(text)) {
    return makeIntent("weather.weekly", args);
  }

  return makeIntent("weather.today", args);
};

export const classifyLocalIntent = (
  rawText: string,
): NaturalLanguageIntent | null => {
  const text = normalizeText(rawText);
  if (!text) return null;

  const weatherIntent = classifyWeatherIntent(text);
  if (weatherIntent) return weatherIntent;

  if (/긱뉴스|하다뉴스/.test(text)) {
    return makeIntent("geekNews.translate");
  }

  if (/최근.*로그|로그.*(보여|조회|확인)|log\s*(show|check)?$/.test(text)) {
    const count = extractCount(text);
    return makeIntent("admin.log", count ? { count } : {});
  }

  if (/공지/.test(text) && /보내|발송|전송|알려/.test(text)) {
    return makeIntent("admin.notice", {
      content: extractNoticeContent(rawText),
    });
  }

  if (/(초기화|리셋|reset)/.test(text) && hasExplicitResetRequest(text)) {
    return makeIntent("admin.reset", {
      target: extractResetTarget(text),
    });
  }

  if (/(데이터|저장.*현황|설정.*현황)/.test(text) && /(현황|보여|조회|확인)/.test(text)) {
    return makeIntent("admin.data");
  }

  if (/네이버.*뉴스.*(테스트|확인|조회)|뉴스.*테스트/.test(text)) {
    return makeIntent("admin.news");
  }

  if (/테스트|점검|상태\s*(확인|체크)/.test(text)) {
    return makeIntent("admin.test", {
      mode: /빠른/.test(text) ? "빠른" : undefined,
    });
  }

  if (/운세|오늘운세/.test(text)) {
    return makeIntent("fortune.today");
  }

  if (/게임|워들|스카이\s*드롭|애로우\s*드리프트/.test(text)) {
    return makeIntent("game.links");
  }

  if (/내\s*정보|내정보|나는\s*누구|나\s*누구/.test(text)) {
    return makeIntent("user.whoami");
  }

  return null;
};

const SYSTEM_PROMPT = `너는 디스코드 봇의 자연어 의도 분류기다.
사용자의 한국어 메시지를 보고 실행할 intent와 인자를 JSON으로만 반환한다.

지원 intent:
- weather.today
- weather.weekly
- weather.setRegion
- weather.clearRegion
- weather.enableNotification
- weather.disableNotification
- fortune.today
- geekNews.translate
- game.links
- user.whoami
- admin.log
- admin.data
- admin.test
- admin.news
- admin.notice
- admin.reset
- ai.answer
- unknown

규칙:
1. JSON 이외의 텍스트를 출력하지 마라.
2. 확신이 낮으면 unknown을 반환해라.
3. 지역명은 args.region, 개수는 args.count, 공지 내용은 args.content, reset 대상은 args.target에 넣어라.
4. notice, reset, 알림 변경, 지역 삭제는 requiresConfirmation을 true로 설정해라.
5. 사용자가 단순 질문을 하면 ai.answer로 분류해라.
6. 사용자가 관리자 기능의 결과나 서버 상황을 질문/설명하는 경우에는 admin.*를 실행하지 말고 ai.answer로 분류해라.
7. admin.*는 "실행해줘", "보여줘", "확인해줘", "테스트해줘", "보내줘", "초기화해줘"처럼 명시적 실행 요청일 때만 사용해라.

반환 형식:
{
  "intent": "...",
  "confidence": 0.0,
  "args": {},
  "requiresConfirmation": false,
  "replyMode": "execute"
}`;

const parseIntentResponse = (rawResponse: string): NaturalLanguageIntent => {
  const cleaned = rawResponse
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const parsed = JSON.parse(cleaned) as Partial<NaturalLanguageIntent>;
  const intent = parsed.intent;

  if (!intent || !INTENT_NAMES.includes(intent)) {
    return makeIntent("unknown", {}, 0);
  }

  const confidence =
    typeof parsed.confidence === "number" ? parsed.confidence : 0;
  const args =
    parsed.args && typeof parsed.args === "object" && !Array.isArray(parsed.args)
      ? (parsed.args as Record<string, unknown>)
      : {};
  const requiresConfirmation =
    typeof parsed.requiresConfirmation === "boolean"
      ? parsed.requiresConfirmation
      : CONFIRMATION_INTENTS.has(intent);
  const replyMode =
    parsed.replyMode === "answer" || parsed.replyMode === "clarify"
      ? parsed.replyMode
      : intent === "ai.answer"
        ? "answer"
        : "execute";

  return {
    intent,
    confidence,
    args,
    requiresConfirmation:
      requiresConfirmation || CONFIRMATION_INTENTS.has(intent),
    replyMode,
  };
};

class IntentService {
  async classify(text: string): Promise<NaturalLanguageIntent> {
    const localIntent = classifyLocalIntent(text);
    if (localIntent) return localIntent;

    try {
      const response = await aiService.generateText(text, {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
        config: {
          temperature: 0.1,
          maxOutputTokens: 500,
        },
      });
      return parseIntentResponse(response);
    } catch (error: any) {
      console.error("[IntentService] 의도 분류 실패:", error.message);
      return makeIntent("unknown", {}, 0);
    }
  }
}

export const intentService = new IntentService();
