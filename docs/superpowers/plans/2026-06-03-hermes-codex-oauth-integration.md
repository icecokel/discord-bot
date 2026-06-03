# Hermes Codex OAuth Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the existing discord-bot AI path to Hermes running on icenux with Codex OAuth, while keeping the current Discord bot, commands, admin guard, scheduler, PM2 deployment, and Gemini fallback path intact.

**Architecture:** Keep discord.js as the only Discord gateway. Add a `HermesProvider` that implements the existing `BaseProvider` interface and invokes the local Hermes CLI in non-interactive oneshot mode. Select providers through environment variables so production can use Hermes and tests/local development can still use Gemini.

**Tech Stack:** Node.js 24, TypeScript, discord.js, Jest/ts-jest, PM2, GitHub Actions self-hosted runner, Hermes Agent CLI, Codex OAuth.

---

## File Structure

- Create: `src/core/ai/providers/hermes-provider.ts`
  - Implements Hermes CLI text generation behind the existing `BaseProvider` contract.
  - Builds a prompt from `systemInstruction`, `responseMimeType`, and the user prompt.
  - Executes `hermes -z` with timeout and strips CLI session metadata from stdout.

- Modify: `src/core/ai/ai-service.ts`
  - Selects `GeminiProvider` or `HermesProvider` from `AI_PROVIDER`.
  - Supports optional `AI_FALLBACK_PROVIDER` for operational fallback.

- Create: `__tests__/hermes-provider.test.js`
  - Unit tests CLI argument construction, JSON instruction handling, metadata stripping, and timeout env parsing.

- Create: `__tests__/ai-service-provider-selection.test.js`
  - Unit tests provider selection and fallback behavior with mocked providers.

- Modify: `documents/pm2-deployment.md`
  - Documents Hermes/Codex OAuth environment variables, server smoke checks, PM2 restart, and known limitations.

- Modify: `.github/workflows/main.yml`
  - Runs on the icenux self-hosted runner, prepares deployment artifacts, exports the local npm/global binary paths, and fails if PM2 is missing.

- Workflow changes are included for this phase.
  - `.github/workflows/main.yml` deploys to icenux, prepares `/home/icenux/projects/discord-bot`, restarts PM2 when available, and fails if PM2 cannot be found.

---

### Task 1: Normalize Hermes Non-Interactive Execution on icenux

**Files:**
- Server config only: `/home/icenux/.codex/config.toml`
- Server config only: `/home/icenux/.hermes/config.yaml`
- Server runtime only: `/home/icenux/projects/discord-bot/.env`

- [ ] **Step 1: Confirm Hermes and Codex OAuth status**

Run:

```bash
ssh icenux-ms7b23 'set -e
export PATH="$HOME/.local/bin:$PATH"
hermes --version
hermes status | sed -n "1,90p"
'
```

Expected:

```text
Hermes Agent v0.15.2
OpenAI Codex  ✓ logged in
```

- [ ] **Step 2: Fix Codex config readability for the Hermes subprocess**

Run:

```bash
ssh icenux-ms7b23 'set -e
chmod 644 "$HOME/.codex/config.toml"
ls -l "$HOME/.codex/config.toml"
'
```

Expected:

```text
-rw-r--r-- ... /home/icenux/.codex/config.toml
```

Rationale: the current smoke test failed with `Failed to read project config file /home/icenux/.codex/config.toml: Permission denied`. The token-bearing `auth.json` remains `600`; only config readability is relaxed.

- [ ] **Step 3: Verify Hermes oneshot returns text**

Run:

```bash
ssh icenux-ms7b23 'set -e
export PATH="$HOME/.local/bin:$PATH"
cd "$HOME/projects/discord-bot"
timeout 60 hermes -z "한 문장으로 상태 확인에 답해." --toolsets "" --ignore-rules
'
```

Expected:

```text
<non-empty Korean or English sentence>
```

If the command prints a Codex app-server error, stop this plan and fix Hermes/Codex OAuth before editing application code.

- [ ] **Step 4: Add production AI environment variables**

Run:

```bash
ssh icenux-ms7b23 'set -e
cd "$HOME/projects/discord-bot"
cp .env ".env.bak.$(date +%Y%m%d%H%M%S)"
grep -q "^AI_PROVIDER=" .env && sed -i "s/^AI_PROVIDER=.*/AI_PROVIDER=hermes/" .env || printf "\nAI_PROVIDER=hermes\n" >> .env
grep -q "^AI_FALLBACK_PROVIDER=" .env && sed -i "s/^AI_FALLBACK_PROVIDER=.*/AI_FALLBACK_PROVIDER=gemini/" .env || printf "AI_FALLBACK_PROVIDER=gemini\n" >> .env
grep -q "^HERMES_BIN=" .env && sed -i "s|^HERMES_BIN=.*|HERMES_BIN=/home/icenux/.local/bin/hermes|" .env || printf "HERMES_BIN=/home/icenux/.local/bin/hermes\n" >> .env
grep -q "^HERMES_TIMEOUT_MS=" .env && sed -i "s/^HERMES_TIMEOUT_MS=.*/HERMES_TIMEOUT_MS=60000/" .env || printf "HERMES_TIMEOUT_MS=60000\n" >> .env
chmod 600 .env
'
```

Expected: exit code `0`. Do not print `.env` contents.

---

### Task 2: Add Hermes Provider Unit Tests

**Files:**
- Create: `__tests__/hermes-provider.test.js`
- Create later in Task 3: `src/core/ai/providers/hermes-provider.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/hermes-provider.test.js`:

```js
jest.mock("node:child_process", () => ({
  execFile: jest.fn(),
}));

const { execFile } = require("node:child_process");
const { HermesProvider } = require("../src/core/ai/providers/hermes-provider");

const mockExecFileSuccess = (stdout, stderr = "") => {
  execFile.mockImplementation((_file, _args, _options, callback) => {
    callback(null, { stdout, stderr });
  });
};

describe("HermesProvider", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    execFile.mockReset();
    process.env = {
      ...originalEnv,
      HERMES_BIN: "/home/icenux/.local/bin/hermes",
      HERMES_TIMEOUT_MS: "12345",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test("invokes hermes oneshot with the configured binary and timeout", async () => {
    mockExecFileSuccess("안녕하세요\n");
    const provider = new HermesProvider();

    const response = await provider.generateText("짧게 인사해");

    expect(response).toBe("안녕하세요");
    expect(execFile).toHaveBeenCalledWith(
      "/home/icenux/.local/bin/hermes",
      ["-z", "User prompt:\n짧게 인사해", "--toolsets", "", "--ignore-rules"],
      expect.objectContaining({
        timeout: 12345,
        maxBuffer: 1024 * 1024,
      }),
      expect.any(Function),
    );
  });

  test("includes system instruction and JSON-only instruction", async () => {
    mockExecFileSuccess('{"intent":"ai.answer"}\n');
    const provider = new HermesProvider();

    await provider.generateText("분류해", {
      systemInstruction: "JSON intent classifier",
      responseMimeType: "application/json",
    });

    const args = execFile.mock.calls[0][1];
    expect(args[1]).toContain("System instruction:\nJSON intent classifier");
    expect(args[1]).toContain("Return only valid JSON. Do not wrap the response in markdown.");
    expect(args[1]).toContain("User prompt:\n분류해");
  });

  test("strips session metadata from Hermes output", async () => {
    mockExecFileSuccess("좋습니다.\nsession_id: 20260603_135630_71d6f3\n");
    const provider = new HermesProvider();

    const response = await provider.generateText("상태 확인");

    expect(response).toBe("좋습니다.");
  });

  test("throws when Hermes returns empty output", async () => {
    mockExecFileSuccess("session_id: 20260603_135630_71d6f3\n");
    const provider = new HermesProvider();

    await expect(provider.generateText("상태 확인")).rejects.toThrow(
      "Hermes returned an empty response",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- --runInBand __tests__/hermes-provider.test.js
```

Expected:

```text
FAIL __tests__/hermes-provider.test.js
Cannot find module '../src/core/ai/providers/hermes-provider'
```

---

### Task 3: Implement HermesProvider

**Files:**
- Create: `src/core/ai/providers/hermes-provider.ts`
- Test: `__tests__/hermes-provider.test.js`

- [ ] **Step 1: Add the provider implementation**

Create `src/core/ai/providers/hermes-provider.ts`:

```ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { BaseProvider, IGenerationOptions } from "./base-provider";

const execFileAsync = promisify(execFile);

const DEFAULT_HERMES_BIN = "hermes";
const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_BUFFER_BYTES = 1024 * 1024;

const parseTimeout = (): number => {
  const rawValue = process.env.HERMES_TIMEOUT_MS;
  if (!rawValue) return DEFAULT_TIMEOUT_MS;

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TIMEOUT_MS;

  return parsed;
};

const buildPrompt = (
  prompt: string,
  options: IGenerationOptions,
): string => {
  const sections: string[] = [];

  if (options.systemInstruction) {
    sections.push(`System instruction:\n${options.systemInstruction}`);
  }

  if (options.responseMimeType === "application/json") {
    sections.push("Return only valid JSON. Do not wrap the response in markdown.");
  }

  sections.push(`User prompt:\n${prompt}`);
  return sections.join("\n\n");
};

const stripHermesOutput = (stdout: string): string =>
  stdout
    .split(/\r?\n/)
    .filter((line) => !/^session_id:\s*/i.test(line.trim()))
    .join("\n")
    .trim();

export class HermesProvider extends BaseProvider {
  private readonly hermesBin: string;
  private readonly timeoutMs: number;

  constructor(config: any = {}) {
    super(config);
    this.hermesBin = process.env.HERMES_BIN || DEFAULT_HERMES_BIN;
    this.timeoutMs = parseTimeout();
  }

  async generateText(
    prompt: string,
    options: IGenerationOptions = {},
  ): Promise<string> {
    const hermesPrompt = buildPrompt(prompt, options);

    try {
      const { stdout } = await execFileAsync(
        this.hermesBin,
        ["-z", hermesPrompt, "--toolsets", "", "--ignore-rules"],
        {
          timeout: this.timeoutMs,
          maxBuffer: MAX_BUFFER_BYTES,
          env: {
            ...process.env,
            PATH: [
              process.env.HOME ? `${process.env.HOME}/.local/bin` : undefined,
              process.env.HOME ? `${process.env.HOME}/.local/npm-global/bin` : undefined,
              process.env.PATH,
            ]
              .filter(Boolean)
              .join(":"),
          },
        },
      );

      const response = stripHermesOutput(stdout);
      if (!response) {
        throw new Error("Hermes returned an empty response");
      }

      return response;
    } catch (error: any) {
      console.error(`[HermesProvider] 생성 오류: ${error.message}`);
      throw error;
    }
  }
}
```

- [ ] **Step 2: Run provider tests**

Run:

```bash
npm test -- --runInBand __tests__/hermes-provider.test.js
```

Expected:

```text
PASS __tests__/hermes-provider.test.js
Tests: 4 passed
```

- [ ] **Step 3: Run type check**

Run:

```bash
npm run type-check
```

Expected:

```text
> discord-bot@1.0.0 type-check
> tsc --noEmit
```

Exit code must be `0`.

---

### Task 4: Add Provider Selection and Fallback

**Files:**
- Modify: `src/core/ai/ai-service.ts`
- Create: `__tests__/ai-service-provider-selection.test.js`

- [ ] **Step 1: Write provider selection tests**

Create `__tests__/ai-service-provider-selection.test.js`:

```js
jest.mock("../src/core/ai/providers/gemini-provider", () => ({
  GeminiProvider: jest.fn().mockImplementation(() => ({
    generateText: jest.fn().mockResolvedValue("gemini response"),
  })),
}));

jest.mock("../src/core/ai/providers/hermes-provider", () => ({
  HermesProvider: jest.fn().mockImplementation(() => ({
    generateText: jest.fn().mockResolvedValue("hermes response"),
  })),
}));

const { GeminiProvider } = require("../src/core/ai/providers/gemini-provider");
const { HermesProvider } = require("../src/core/ai/providers/hermes-provider");

describe("AIService provider selection", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    GeminiProvider.mockClear();
    HermesProvider.mockClear();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test("uses Gemini by default", async () => {
    delete process.env.AI_PROVIDER;
    const AIService = require("../src/core/ai/ai-service").default;

    const service = new AIService();
    const response = await service.generateText("hello");

    expect(response).toBe("gemini response");
    expect(GeminiProvider).toHaveBeenCalledTimes(1);
    expect(HermesProvider).not.toHaveBeenCalled();
  });

  test("uses Hermes when AI_PROVIDER is hermes", async () => {
    process.env.AI_PROVIDER = "hermes";
    const AIService = require("../src/core/ai/ai-service").default;

    const service = new AIService();
    const response = await service.generateText("hello");

    expect(response).toBe("hermes response");
    expect(HermesProvider).toHaveBeenCalledTimes(1);
  });

  test("falls back to Gemini when Hermes generation fails", async () => {
    process.env.AI_PROVIDER = "hermes";
    process.env.AI_FALLBACK_PROVIDER = "gemini";
    HermesProvider.mockImplementationOnce(() => ({
      generateText: jest.fn().mockRejectedValue(new Error("hermes down")),
    }));
    const AIService = require("../src/core/ai/ai-service").default;

    const service = new AIService();
    const response = await service.generateText("hello");

    expect(response).toBe("gemini response");
    expect(HermesProvider).toHaveBeenCalledTimes(1);
    expect(GeminiProvider).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails before implementation**

Run:

```bash
npm test -- --runInBand __tests__/ai-service-provider-selection.test.js
```

Expected:

```text
FAIL __tests__/ai-service-provider-selection.test.js
Expected HermesProvider to have been called
```

- [ ] **Step 3: Implement provider selection**

Replace `src/core/ai/ai-service.ts` with:

```ts
import { GeminiProvider } from "./providers/gemini-provider";
import { HermesProvider } from "./providers/hermes-provider";
import { BaseProvider, IGenerationOptions } from "./providers/base-provider";

type ProviderName = "gemini" | "hermes";

const normalizeProviderName = (
  value: string | undefined,
  defaultValue: ProviderName,
): ProviderName => {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "hermes" || normalized === "gemini") return normalized;
  return defaultValue;
};

const createProvider = (name: ProviderName): BaseProvider => {
  switch (name) {
    case "hermes":
      return new HermesProvider();
    case "gemini":
    default:
      return new GeminiProvider();
  }
};

/**
 * AI 서비스를 관리하는 중앙 클래스
 * AI_PROVIDER 환경변수로 Hermes 또는 Gemini를 선택한다.
 */
class AIService {
  private provider: BaseProvider;
  private fallbackProvider: BaseProvider | null;

  constructor() {
    const providerName = normalizeProviderName(process.env.AI_PROVIDER, "gemini");
    const fallbackName = normalizeProviderName(
      process.env.AI_FALLBACK_PROVIDER,
      providerName,
    );

    this.provider = createProvider(providerName);
    this.fallbackProvider =
      fallbackName !== providerName ? createProvider(fallbackName) : null;
  }

  async generateText(
    prompt: string,
    options: IGenerationOptions = {},
  ): Promise<string> {
    try {
      return await this.provider.generateText(prompt, options);
    } catch (error: any) {
      if (!this.fallbackProvider) throw error;

      console.error(`[AIService] 기본 AI 공급자 실패, fallback 실행: ${error.message}`);
      return this.fallbackProvider.generateText(prompt, options);
    }
  }
}

export default AIService;
```

- [ ] **Step 4: Run provider selection tests**

Run:

```bash
npm test -- --runInBand __tests__/ai-service-provider-selection.test.js
```

Expected:

```text
PASS __tests__/ai-service-provider-selection.test.js
Tests: 3 passed
```

---

### Task 5: Document Hermes Deployment Operation

**Files:**
- Modify: `documents/pm2-deployment.md`

- [ ] **Step 1: Add Hermes section**

Append this section to `documents/pm2-deployment.md`:

````md
## Hermes / Codex OAuth AI 공급자

icenux 배포에서는 기존 Gemini 직접 호출 대신 Hermes CLI를 AI 공급자로 사용할 수 있다.

운영 `.env` 예시:

```env
AI_PROVIDER=hermes
AI_FALLBACK_PROVIDER=gemini
HERMES_BIN=/home/icenux/.local/bin/hermes
HERMES_TIMEOUT_MS=60000
HERMES_TOOLSETS=
```

Hermes는 별도 Discord gateway로 실행하지 않는다. 현재 discord.js 봇이 유일한 Discord gateway이며, Hermes는 `aiService.generateText()`의 텍스트 생성 공급자로만 호출한다. Discord 사용자 입력은 신뢰할 수 없는 입력이므로 운영 기본값은 `HERMES_TOOLSETS=`로 도구를 비활성화하고, hook 자동 승인은 사용하지 않는다.

서버에서 Hermes 호출을 점검한다.

```bash
ssh icenux-ms7b23 'cd ~/projects/discord-bot && PATH="$HOME/.local/bin:$PATH" hermes -z "상태 확인" --toolsets "" --ignore-rules'
```

정상이라면 한 문장 이상의 응답이 출력된다. Codex OAuth 또는 Hermes 설정 오류가 있으면 봇의 AI 답변은 `AI_FALLBACK_PROVIDER`로 지정된 Gemini로 fallback된다.
````

- [ ] **Step 2: Check file naming**

Run:

```bash
rg --files | awk -F/ '{print $NF}' | grep -E '[_A-Z]' | grep -v '^AGENTS.md$' || true
```

Expected: no new non-kebab-case file from this task.

---

### Task 6: Run Full Local Verification

**Files:**
- Verify all modified code and docs.

- [ ] **Step 1: Run all tests**

Run:

```bash
npm test -- --runInBand
```

Expected:

```text
Test Suites: 14 passed, 14 total
Tests: 69 passed, 69 total
```

The exact total may differ if existing tests are added before execution, but there must be `0` failed suites and `0` failed tests.

- [ ] **Step 2: Run type check**

Run:

```bash
npm run type-check
```

Expected: exit code `0`.

- [ ] **Step 3: Run production build**

Run:

```bash
npm run build
```

Expected:

```text
dist/index.js
Done
```

Exit code must be `0`.

- [ ] **Step 4: Review diff**

Run:

```bash
git diff -- .github/workflows/main.yml src/core/ai/providers/hermes-provider.ts src/core/ai/ai-service.ts __tests__/hermes-provider.test.js __tests__/ai-service-provider-selection.test.js documents/pm2-deployment.md docs/superpowers/plans/2026-06-03-hermes-codex-oauth-integration.md
```

Expected:

- `HermesProvider` uses `execFile`, not shell string interpolation.
- No secrets are committed.
- `.env` is not committed.
- Gemini remains available.
- Existing command routing is unchanged.

---

### Task 7: Deploy and Verify on icenux

**Files:**
- Uses existing workflow: `.github/workflows/main.yml`
- Server runtime: `/home/icenux/projects/discord-bot`

- [ ] **Step 1: Commit changes locally**

Run:

```bash
git add .github/workflows/main.yml src/core/ai/providers/hermes-provider.ts src/core/ai/ai-service.ts __tests__/hermes-provider.test.js __tests__/ai-service-provider-selection.test.js documents/pm2-deployment.md docs/superpowers/plans/2026-06-03-hermes-codex-oauth-integration.md
git commit -m "feat(ai): 헤르메스 공급자 추가"
```

Expected:

```text
[main <sha>] feat(ai): 헤르메스 공급자 추가
```

- [ ] **Step 2: Push main**

Run:

```bash
git push origin main
```

Expected: GitHub Actions starts on runner `discord-bot-icenux`.

- [ ] **Step 3: Watch the workflow**

Run:

```bash
gh run list --repo icecokel/discord-bot --limit 3
gh run watch --repo icecokel/discord-bot
```

Expected:

```text
Deploy to icenux ... completed success
```

- [ ] **Step 4: Verify PM2 process and logs**

Run:

```bash
ssh icenux-ms7b23 'set -e
export PATH="$HOME/.local/npm-global/bin:$PATH"
pm2 status discord-bot --no-color
pm2 logs discord-bot --lines 80 --nostream --no-color
'
```

Expected:

```text
discord-bot ... online
Logged in as 얼콜봇#3227!
```

- [ ] **Step 5: Manual Discord smoke test**

Send these messages to the bot from the admin account:

```text
오늘 서울 날씨 알려줘
상태 확인을 한 문장으로 답해줘
```

Expected:

- Weather message routes to the existing weather command.
- General AI message returns a Hermes-generated answer.
- PM2 logs do not show `[HermesProvider] 생성 오류`.

---

## Scope Boundaries

- Hermes Discord gateway is not enabled in this plan.
- Hermes is not allowed to replace existing deterministic command execution.
- Gemini tool definitions passed through `options.tools` are not converted to Hermes tools in this phase.
- Codex OAuth session management is treated as an icenux operational prerequisite.
- `loginctl enable-linger icenux` remains a separate sudo-dependent hardening task.

## Self-Review

- Spec coverage: The plan covers Hermes server readiness, provider code, provider selection, docs, local verification, and deployment verification.
- Placeholder scan: No prohibited placeholder terms or open-ended implementation steps are present.
- Type consistency: `HermesProvider`, `GeminiProvider`, `BaseProvider`, and `IGenerationOptions` names match existing project naming.
- File naming: All new files use kebab-case.
