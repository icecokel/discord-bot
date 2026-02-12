import { EmbedBuilder, Message } from "discord.js";
import {
  getAdminCommands,
  registerAdminCommand,
} from "../../../core/admin-middleware";
import { aiService } from "../../../core/ai";
import englishService from "../../daily_english/english-service";
import japaneseService from "../../daily_japanese/japanese-service";
import newsService from "../../daily_news/news-service";
import { reminderService } from "../../tools/reminder-service";
import { getMidTermForecast, getShortTermForecast } from "../../../utils/kma-helper";
import kmaData from "../../../data/kma-data.json";

type TestStatus = "PASS" | "FAIL" | "SKIP";

interface TestResult {
  name: string;
  status: TestStatus;
  detail: string;
  durationMs: number;
}

const statusEmoji: Record<TestStatus, string> = {
  PASS: "✅",
  FAIL: "❌",
  SKIP: "⏭️",
};

const formatDuration = (ms: number): string => `${ms}ms`;

const runTest = async (
  name: string,
  fn: () => Promise<{ status: TestStatus; detail: string }>,
): Promise<TestResult> => {
  const start = Date.now();
  try {
    const result = await fn();
    return {
      name,
      status: result.status,
      detail: result.detail,
      durationMs: Date.now() - start,
    };
  } catch (error: any) {
    return {
      name,
      status: "FAIL",
      detail: error?.message || "알 수 없는 오류",
      durationMs: Date.now() - start,
    };
  }
};

const getRegionSample = (): {
  regionName: string;
  nx: number;
  ny: number;
  midCode?: string | null;
} => {
  const data = kmaData as Record<
    string,
    { nx?: number; ny?: number; midCode?: string | null }
  >;
  const preferred =
    Object.keys(data).find((key) => key.includes("서울")) || Object.keys(data)[0];
  if (!preferred) {
    throw new Error("kma-data.json에 지역 데이터가 없습니다.");
  }

  const region = data[preferred];
  if (typeof region.nx !== "number" || typeof region.ny !== "number") {
    throw new Error(`지역 좌표 누락: ${preferred}`);
  }

  return {
    regionName: preferred,
    nx: region.nx,
    ny: region.ny,
    midCode: region.midCode,
  };
};

const validateEmbedFieldNames = (
  fields: Array<{ name: string }>,
  required: string[],
): boolean => {
  const names = fields.map((field) => field.name);
  return required.every((requiredName) => names.includes(requiredName));
};

const hasCommandIdentifier = (
  commands: Array<{ name: string; keywords?: string[] }>,
  identifier: string,
): boolean => {
  return commands.some((command) => {
    if (command.name === identifier) return true;
    return (
      Array.isArray(command.keywords) &&
      command.keywords.some((keyword) => keyword === identifier)
    );
  });
};

const handleAdminTest = async (message: Message, args: string[]) => {
  const mode = args[0]?.toLowerCase() === "quick" ? "quick" : "full";

  const tests: Array<{
    name: string;
    fn: () => Promise<{ status: TestStatus; detail: string }>;
  }> = [
    {
      name: "커맨드 레지스트리",
      fn: async () => {
        const commands = Array.from(message.client.commands.values()).map(
          (command) => ({
            name: command.name,
            keywords: command.keywords,
          }),
        );
        const required = [
          "ping",
          "help",
          "weather",
          "weather-weekly",
          "fortune",
        ];
        const missing = required.filter(
          (identifier) => !hasCommandIdentifier(commands, identifier),
        );
        if (missing.length > 0) {
          return {
            status: "FAIL",
            detail: `누락 커맨드: ${missing.join(", ")}`,
          };
        }
        return {
          status: "PASS",
          detail: `${commands.length}개 커맨드 로드`,
        };
      },
    },
    {
      name: "어드민 커맨드 레지스트리",
      fn: async () => {
        const adminCommandNames = getAdminCommands().map((cmd) => cmd.name);
        const required = ["admin", "english", "japanese", "news", "ai", "test"];
        const missing = required.filter((name) => !adminCommandNames.includes(name));
        if (missing.length > 0) {
          return {
            status: "FAIL",
            detail: `누락 어드민 커맨드: ${missing.join(", ")}`,
          };
        }
        return {
          status: "PASS",
          detail: `${adminCommandNames.length}개 어드민 커맨드 등록`,
        };
      },
    },
    {
      name: "리마인더 파서",
      fn: async () => {
        const samples = ["10분 뒤", "내일 오후 3시", "3월 1일 오후 5시"];
        const invalid = samples.filter((sample) => {
          const ts = reminderService.parseTargetTime(sample);
          return !ts || Number.isNaN(ts);
        });
        if (invalid.length > 0) {
          return {
            status: "FAIL",
            detail: `파싱 실패: ${invalid.join(", ")}`,
          };
        }
        return {
          status: "PASS",
          detail: `${samples.length}개 시간 포맷 파싱 성공`,
        };
      },
    },
    {
      name: "날씨 API (단기/중기)",
      fn: async () => {
        const sample = getRegionSample();
        const short = await getShortTermForecast(sample.nx, sample.ny);
        if (!short) {
          return {
            status: "FAIL",
            detail: `단기 예보 실패 (${sample.regionName})`,
          };
        }

        if (!sample.midCode) {
          return {
            status: "SKIP",
            detail: `중기 코드 없음 (${sample.regionName})`,
          };
        }

        const mid = await getMidTermForecast(sample.midCode);
        if (!mid) {
          const hint = !process.env.WEATHER_MIDDLE_END_POINT
            ? "WEATHER_MIDDLE_END_POINT 누락"
            : !process.env.WEATHER_MIDDLE_API_KEY
              ? "WEATHER_MIDDLE_API_KEY 누락"
              : "인증/권한 오류 가능성(WEATHER_MIDDLE_API_KEY 확인)";
          return {
            status: "FAIL",
            detail: `중기 예보 실패 (${sample.regionName}) - ${hint}`,
          };
        }

        return {
          status: "PASS",
          detail: `${sample.regionName} 단기/중기 예보 조회 성공`,
        };
      },
    },
  ];

  if (mode === "full") {
    tests.push(
      {
        name: "AI 기본 생성",
        fn: async () => {
          if (!process.env.GEMINI_AI_API_KEY) {
            return {
              status: "SKIP",
              detail: "GEMINI_AI_API_KEY 없음",
            };
          }
          const text = await aiService.generateText(
            "health-check 라는 단어 하나만 출력해줘.",
          );
          const ok = text.toLowerCase().includes("health-check");
          return {
            status: ok ? "PASS" : "FAIL",
            detail: ok ? "응답 검증 성공" : `예상 토큰 미포함: ${text.slice(0, 60)}`,
          };
        },
      },
      {
        name: "영어 콘텐츠 품질",
        fn: async () => {
          if (!process.env.GEMINI_AI_API_KEY) {
            return {
              status: "SKIP",
              detail: "GEMINI_AI_API_KEY 없음",
            };
          }
          const content = await englishService.generateDailyContent();
          const embed = englishService.createEmbed(content).toJSON();
          const fields = (embed.fields || []) as Array<{ name: string }>;
          const structured = validateEmbedFieldNames(fields, [
            "📝 오늘의 문장",
            "📘 설명",
            "✨ 활용 예시",
          ]);
          return {
            status: structured ? "PASS" : "FAIL",
            detail: structured
              ? "구조화된 필드 출력 확인"
              : "Fallback 응답(간략 포맷) 발생",
          };
        },
      },
      {
        name: "일본어 콘텐츠 품질",
        fn: async () => {
          if (!process.env.GEMINI_AI_API_KEY) {
            return {
              status: "SKIP",
              detail: "GEMINI_AI_API_KEY 없음",
            };
          }
          const content = await japaneseService.generateDailyContent();
          const embed = japaneseService.createEmbed(content).toJSON();
          const fields = (embed.fields || []) as Array<{ name: string }>;
          const structured = validateEmbedFieldNames(fields, [
            "🇯🇵 오늘의 기초 일본어",
            "📘 설명",
            "✨ 따라 해보세요 (예시)",
          ]);
          return {
            status: structured ? "PASS" : "FAIL",
            detail: structured
              ? "구조화된 필드 출력 확인"
              : "Fallback 응답(간략 포맷) 발생",
          };
        },
      },
      {
        name: "뉴스 API",
        fn: async () => {
          if (!process.env.NAVER_APP_CLIENT_ID || !process.env.NAVER_APP_CLIENT_SECRET) {
            return {
              status: "SKIP",
              detail: "NAVER API 키 없음",
            };
          }
          const news = await newsService.generateDailyNews();
          if (!news || news.length === 0) {
            return {
              status: "FAIL",
              detail: "뉴스 항목 0건",
            };
          }
          return {
            status: "PASS",
            detail: `${news.length}건 조회 성공`,
          };
        },
      },
    );
  }

  const progressMsg = await message.reply(
    `🧪 통합 테스트 시작 (${mode.toUpperCase()}) 0/${tests.length}`,
  );

  const results: TestResult[] = [];
  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    await progressMsg.edit(
      `🧪 통합 테스트 진행중 (${mode.toUpperCase()}) ${i + 1}/${tests.length}\n현재: ${test.name}`,
    );
    const result = await runTest(test.name, test.fn);
    results.push(result);
  }

  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  const skipped = results.filter((r) => r.status === "SKIP").length;
  const totalTime = results.reduce((acc, cur) => acc + cur.durationMs, 0);

  const lines = results.map(
    (r) =>
      `${statusEmoji[r.status]} **${r.name}** (${formatDuration(r.durationMs)})\n- ${r.detail}`,
  );

  const details = lines.join("\n\n");
  const detailChunks: string[] = [];
  for (let i = 0; i < details.length; i += 1000) {
    detailChunks.push(details.slice(i, i + 1000));
  }

  const embed = new EmbedBuilder()
    .setColor(failed === 0 ? 0x57f287 : 0xed4245)
    .setTitle(`🧪 /admin test 결과 (${mode.toUpperCase()})`)
    .setDescription(
      `총 ${results.length}개 테스트\n✅ ${passed} | ❌ ${failed} | ⏭️ ${skipped}\n총 소요: ${formatDuration(totalTime)}`,
    )
    .setTimestamp();

  detailChunks.forEach((chunk, index) => {
    embed.addFields({
      name: index === 0 ? "세부 결과" : `세부 결과 (${index + 1})`,
      value: chunk,
      inline: false,
    });
  });

  embed.setFooter({
    text: "빠른 점검은 /admin test quick",
  });

  await progressMsg.edit({ content: null, embeds: [embed] });
};

registerAdminCommand("test", handleAdminTest, "통합 기능 점검 및 리포트");

export { handleAdminTest };
