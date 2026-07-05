import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import readline from "node:readline";
import { BaseProvider, IGenerationOptions } from "./base-provider";

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_CLIENT_NAME = "discord_bot";
const DEFAULT_CLIENT_TITLE = "Discord Bot";
const DEFAULT_CLIENT_VERSION = "0.1.0";

interface JsonRpcError {
  code?: number;
  message?: string;
}

interface JsonRpcMessage {
  id?: number;
  method?: string;
  params?: any;
  result?: any;
  error?: JsonRpcError;
}

interface PendingRequest {
  resolve: (result: any) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

interface PendingTurn {
  textParts: string[];
  turnStartRequestId?: number;
  resolve: (text: string) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

interface CodexTurnOptions extends IGenerationOptions {
  codexApprovalPolicy?: string;
  codexSandbox?: string;
  codexSearch?: boolean;
  codexThreadKey?: string;
  codexWorkdir?: string;
}

class CodexAppServerClient {
  private proc?: ChildProcessWithoutNullStreams;
  private rl?: readline.Interface;
  private nextRequestId = 1;
  private pendingRequests = new Map<number, PendingRequest>();
  private activeTurn?: PendingTurn;
  private initialized = false;
  private initializePromise?: Promise<void>;
  private threadIds = new Map<string, string>();
  private operationQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly codexBin: string,
    private readonly timeoutMs: number,
    private readonly defaultWorkdir: string,
    private readonly buildEnv: () => NodeJS.ProcessEnv,
  ) {}

  async generateText(
    prompt: string,
    options: CodexTurnOptions = {},
  ): Promise<string> {
    const run = async (): Promise<string> => {
      await this.ensureInitialized();
      const threadId = await this.resolveThreadId(options);
      return this.startTurn(threadId, prompt, options);
    };

    const resultPromise = this.operationQueue.then(run, run);
    this.operationQueue = resultPromise.then(
      () => undefined,
      () => undefined,
    );
    return resultPromise;
  }

  clearThread(threadKey: string): boolean {
    return this.threadIds.delete(threadKey);
  }

  shutdown(): void {
    this.rl?.close();
    this.proc?.kill();
    this.resetProcessState();
  }

  private ensureProcess(): ChildProcessWithoutNullStreams {
    if (this.proc && !this.proc.killed) {
      return this.proc;
    }

    const proc = spawn(this.codexBin, ["app-server"], {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: this.defaultWorkdir,
      env: this.buildEnv(),
    });

    this.proc = proc;
    this.rl = readline.createInterface({ input: proc.stdout });
    this.rl.on("line", (line) => this.handleLine(line));
    proc.on("error", (error) => this.handleProcessFailure(error));
    proc.on("exit", (code, signal) => {
      this.handleProcessFailure(
        new Error(
          `Codex app-server exited${code === null ? "" : ` with code ${code}`}${
            signal ? ` (${signal})` : ""
          }`,
        ),
      );
    });

    return proc;
  }

  private async ensureInitialized(): Promise<void> {
    this.ensureProcess();

    if (this.initialized) {
      return;
    }

    if (!this.initializePromise) {
      this.initializePromise = this.request("initialize", {
        clientInfo: {
          name: DEFAULT_CLIENT_NAME,
          title: DEFAULT_CLIENT_TITLE,
          version: DEFAULT_CLIENT_VERSION,
        },
      }).then(() => {
        this.sendNotification("initialized", {});
        this.initialized = true;
      });
    }

    await this.initializePromise;
  }

  private async resolveThreadId(options: CodexTurnOptions): Promise<string> {
    const threadKey = options.codexThreadKey;
    if (threadKey) {
      const mappedThreadId = this.threadIds.get(threadKey);
      if (mappedThreadId) {
        return mappedThreadId;
      }
    }

    const result = await this.request(
      "thread/start",
      this.buildThreadStartParams(options),
    );
    const threadId = result?.thread?.id;

    if (typeof threadId !== "string" || !threadId) {
      throw new Error("Codex did not return a thread id");
    }

    if (threadKey) {
      this.threadIds.set(threadKey, threadId);
    }

    return threadId;
  }

  private startTurn(
    threadId: string,
    prompt: string,
    options: CodexTurnOptions,
  ): Promise<string> {
    if (this.activeTurn) {
      throw new Error("Codex turn is already active");
    }

    const turnParams = this.buildTurnParams(threadId, prompt, options);

    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.activeTurn = undefined;
        reject(new Error("Codex turn timed out"));
      }, this.timeoutMs);

      this.activeTurn = {
        textParts: [],
        resolve: (text) => {
          clearTimeout(timer);
          resolve(text);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
        timer,
      };
      const turnStartRequestId = this.sendRequestMessage(
        "turn/start",
        turnParams,
      );
      this.activeTurn.turnStartRequestId = turnStartRequestId;
      this.pendingRequests.set(turnStartRequestId, {
        resolve: () => undefined,
        reject: (error) => this.rejectActiveTurn(error),
        timer: setTimeout(() => {
          this.pendingRequests.delete(turnStartRequestId);
        }, this.timeoutMs),
      });
    });
  }

  private buildTurnParams(
    threadId: string,
    prompt: string,
    options: CodexTurnOptions,
  ): Record<string, unknown> {
    const model = this.resolveModel(options);
    const workdir = this.resolveWorkdir(options);

    return {
      threadId,
      input: [
        {
          type: "text",
          text: this.buildPrompt(prompt, options),
          text_elements: [],
        },
      ],
      cwd: workdir,
      ...(model ? { model } : {}),
      sandboxPolicy: this.resolveSandboxPolicy(options, workdir),
      approvalPolicy: this.resolveApprovalPolicy(options),
    };
  }

  private buildThreadStartParams(
    options: CodexTurnOptions,
  ): Record<string, unknown> {
    const model = this.resolveModel(options);
    const codexSearch =
      typeof options.codexSearch === "boolean" ? options.codexSearch : undefined;

    return {
      cwd: this.resolveWorkdir(options),
      approvalPolicy: this.resolveApprovalPolicy(options),
      sandbox: this.resolveSandboxMode(options),
      ...(model ? { model } : {}),
      ...(codexSearch === undefined
        ? {}
        : {
            config: {
              web_search: codexSearch ? "cached" : "disabled",
            },
          }),
    };
  }

  private buildPrompt(prompt: string, options: CodexTurnOptions): string {
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

  private request(method: string, params: any): Promise<any> {
    const id = this.sendRequestMessage(method, params);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Codex app-server request timed out: ${method}`));
      }, this.timeoutMs);

      this.pendingRequests.set(id, {
        resolve,
        reject,
        timer,
      });
    });
  }

  private sendRequestMessage(method: string, params: any): number {
    const id = this.nextRequestId;
    this.nextRequestId += 1;
    this.send({ id, method, params });
    return id;
  }

  private sendNotification(method: string, params: any): void {
    this.send({ method, params });
  }

  private send(message: JsonRpcMessage): void {
    const proc = this.ensureProcess();
    proc.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private handleLine(line: string): void {
    if (!line.trim()) {
      return;
    }

    let message: JsonRpcMessage;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }

    if (typeof message.id === "number") {
      this.handleResponse(message);
      return;
    }

    this.handleNotification(message);
  }

  private handleResponse(message: JsonRpcMessage): void {
    if (typeof message.id !== "number") {
      return;
    }

    const pendingRequest = this.pendingRequests.get(message.id);
    if (!pendingRequest) {
      return;
    }

    this.pendingRequests.delete(message.id);
    clearTimeout(pendingRequest.timer);

    if (message.error) {
      pendingRequest.reject(
        new Error(message.error.message || `Codex app-server error ${message.error.code}`),
      );
      return;
    }

    pendingRequest.resolve(message.result);
  }

  private handleNotification(message: JsonRpcMessage): void {
    if (!message.method || !this.activeTurn) {
      return;
    }

    if (
      message.method === "item/agentMessage/delta" ||
      message.method === "item/completed"
    ) {
      const text = this.extractAgentText(message.params);
      if (text) {
        this.activeTurn.textParts.push(text);
      }
      return;
    }

    if (message.method === "turn/completed") {
      const turn = this.activeTurn;
      this.activeTurn = undefined;
      this.clearPendingRequest(turn.turnStartRequestId);
      clearTimeout(turn.timer);
      const text = turn.textParts.join("").trim();

      if (!text) {
        turn.reject(new Error("Codex returned an empty response"));
        return;
      }

      turn.resolve(text);
      return;
    }

    if (message.method === "turn/failed" || message.method === "turn/error") {
      const turn = this.activeTurn;
      this.activeTurn = undefined;
      this.clearPendingRequest(turn.turnStartRequestId);
      clearTimeout(turn.timer);
      turn.reject(
        new Error(
          message.params?.error?.message ||
            message.params?.message ||
            "Codex turn failed",
        ),
      );
    }
  }

  private rejectActiveTurn(error: Error): void {
    if (!this.activeTurn) {
      return;
    }

    const turn = this.activeTurn;
    this.activeTurn = undefined;
    this.clearPendingRequest(turn.turnStartRequestId);
    clearTimeout(turn.timer);
    turn.reject(error);
  }

  private clearPendingRequest(id: number | undefined): void {
    if (id === undefined) {
      return;
    }

    const pendingRequest = this.pendingRequests.get(id);
    if (!pendingRequest) {
      return;
    }

    clearTimeout(pendingRequest.timer);
    this.pendingRequests.delete(id);
  }

  private extractAgentText(params: any): string {
    if (!params) {
      return "";
    }

    if (typeof params.delta === "string") {
      return params.delta;
    }

    if (typeof params.text === "string") {
      return params.text;
    }

    const item = params.item;
    if (!item) {
      return "";
    }

    if (typeof item.text === "string") {
      return item.text;
    }

    if (Array.isArray(item.content)) {
      return item.content
        .map((content: any) => {
          if (typeof content === "string") return content;
          if (typeof content?.text === "string") return content.text;
          return "";
        })
        .join("");
    }

    return "";
  }

  private handleProcessFailure(error: Error): void {
    for (const [id, pendingRequest] of this.pendingRequests.entries()) {
      clearTimeout(pendingRequest.timer);
      pendingRequest.reject(error);
      this.pendingRequests.delete(id);
    }

    if (this.activeTurn) {
      clearTimeout(this.activeTurn.timer);
      this.activeTurn.reject(error);
      this.activeTurn = undefined;
    }

    this.resetProcessState();
  }

  private resetProcessState(): void {
    this.proc = undefined;
    this.rl = undefined;
    this.initialized = false;
    this.initializePromise = undefined;
  }

  private resolveModel(options: CodexTurnOptions): string | undefined {
    return options.model || process.env.CODEX_MODEL || undefined;
  }

  private resolveWorkdir(options: CodexTurnOptions): string {
    return options.codexWorkdir || process.env.CODEX_WORKDIR || this.defaultWorkdir;
  }

  private resolveApprovalPolicy(options: CodexTurnOptions): string {
    return (
      options.codexApprovalPolicy ||
      process.env.CODEX_APPROVAL_POLICY ||
      "never"
    );
  }

  private resolveSandboxMode(options: CodexTurnOptions): string {
    return options.codexSandbox || process.env.CODEX_SANDBOX || "read-only";
  }

  private resolveSandboxPolicy(
    options: CodexTurnOptions,
    workdir: string,
  ): Record<string, unknown> {
    const sandboxMode = this.resolveSandboxMode(options);

    if (sandboxMode === "danger-full-access") {
      return {
        type: "dangerFullAccess",
      };
    }

    if (sandboxMode === "workspace-write") {
      return {
        type: "workspaceWrite",
        writableRoots: [workdir],
        networkAccess: false,
        excludeTmpdirEnvVar: false,
        excludeSlashTmp: false,
      };
    }

    return {
      type: "readOnly",
      networkAccess: false,
    };
  }
}

/**
 * Codex app-server 공급자 구현
 */
export class CodexProvider extends BaseProvider {
  private readonly client: CodexAppServerClient;

  constructor(config: any = {}) {
    super(config);
    const defaultWorkdir = process.env.CODEX_WORKDIR || process.cwd();
    this.client = new CodexAppServerClient(
      process.env.CODEX_BIN || this.defaultCodexBin(),
      this.resolveTimeout(),
      defaultWorkdir,
      () => this.buildEnv(),
    );
  }

  async generateText(
    prompt: string,
    options: IGenerationOptions = {},
  ): Promise<string> {
    try {
      return await this.client.generateText(prompt, options as CodexTurnOptions);
    } catch (error: any) {
      console.error(`[CodexProvider] 생성 오류: ${error.message}`);
      throw error;
    }
  }

  clearThread(threadKey: string): boolean {
    return this.client.clearThread(threadKey);
  }

  shutdown(): void {
    this.client.shutdown();
  }

  private resolveTimeout(): number {
    const timeoutMs = Number(process.env.CODEX_TIMEOUT_MS);
    return Number.isFinite(timeoutMs) && timeoutMs > 0
      ? timeoutMs
      : DEFAULT_TIMEOUT_MS;
  }

  private defaultCodexBin(): string {
    return process.platform === "win32" ? "codex.cmd" : "codex";
  }

  private buildEnv(): NodeJS.ProcessEnv {
    const home = process.env.HOME || process.env.USERPROFILE;
    const pathEntries = [
      home ? path.join(home, ".local", "bin") : undefined,
      home ? path.join(home, ".local", "npm-global", "bin") : undefined,
      home ? path.join(home, "AppData", "Roaming", "npm") : undefined,
      process.env.PATH,
    ].filter((entry): entry is string => Boolean(entry));

    return {
      ...process.env,
      PATH: pathEntries.join(path.delimiter),
    };
  }
}
