import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { BaseProvider, IGenerationOptions } from "./base-provider";

const execFileAsync = promisify(execFile);
const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_MAX_BUFFER = 1024 * 1024;
const DEFAULT_TOOLSETS = "";

/**
 * Hermes CLI 공급자 구현
 */
export class HermesProvider extends BaseProvider {
  private hermesBin: string;
  private timeoutMs: number;

  constructor(config: any = {}) {
    super(config);
    this.hermesBin = process.env.HERMES_BIN || "hermes";
    this.timeoutMs = this.resolveTimeout();
  }

  /**
   * 텍스트를 생성합니다.
   */
  async generateText(
    prompt: string,
    options: IGenerationOptions = {},
  ): Promise<string> {
    try {
      const hermesPrompt = this.buildPrompt(prompt, options);
      const sessionArgs = options.hermesSessionName
        ? ["--continue", String(options.hermesSessionName)]
        : [];
      const { stdout } = await execFileAsync(
        this.hermesBin,
        [
          ...sessionArgs,
          "-z",
          hermesPrompt,
          "--toolsets",
          options.hermesToolsets ?? process.env.HERMES_TOOLSETS ?? DEFAULT_TOOLSETS,
          "--ignore-rules",
        ],
        {
          timeout: this.timeoutMs,
          maxBuffer: DEFAULT_MAX_BUFFER,
          env: this.buildEnv(),
        },
      );
      const output = this.cleanOutput(stdout.toString());

      if (!output) {
        throw new Error("Hermes returned an empty response");
      }

      return output;
    } catch (error: any) {
      console.error(`[HermesProvider] 생성 오류: ${error.message}`);
      throw error;
    }
  }

  private resolveTimeout(): number {
    const timeoutMs = Number(process.env.HERMES_TIMEOUT_MS);
    return Number.isFinite(timeoutMs) && timeoutMs > 0
      ? timeoutMs
      : DEFAULT_TIMEOUT_MS;
  }

  private buildPrompt(prompt: string, options: IGenerationOptions): string {
    const promptParts: string[] = [];

    if (options.systemInstruction) {
      promptParts.push(`System instruction:\n${options.systemInstruction}`);
    }

    if (options.responseMimeType === "application/json") {
      promptParts.push(
        "Respond with valid JSON only. Do not include markdown, prose, or code fences.",
      );
    }

    promptParts.push(prompt);

    return promptParts.join("\n\n");
  }

  private buildEnv(): NodeJS.ProcessEnv {
    const home = process.env.HOME;
    const pathEntries = [
      home ? path.join(home, ".local", "bin") : undefined,
      home ? path.join(home, ".local", "npm-global", "bin") : undefined,
      process.env.PATH,
    ].filter((entry): entry is string => Boolean(entry));

    return {
      ...process.env,
      PATH: pathEntries.join(path.delimiter),
    };
  }

  private cleanOutput(stdout: string): string {
    return stdout
      .split(/\r?\n/)
      .filter((line) => !/^session_id:\s*/i.test(line))
      .join("\n")
      .trim();
  }
}
