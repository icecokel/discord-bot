const { EventEmitter } = require("node:events");
const { PassThrough, Writable } = require("node:stream");

const mockSpawn = jest.fn();

jest.mock("node:child_process", () => ({
  spawn: mockSpawn,
}));

const { CodexProvider } = require("../src/core/ai/providers/codex-provider");

const waitForTicks = async (count = 3) => {
  for (let index = 0; index < count; index += 1) {
    await Promise.resolve();
  }
};

const parseWrites = (writes) =>
  writes
    .join("")
    .split(/\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));

const createAppServerProcess = () => {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const writes = [];
  const stdin = new Writable({
    write(chunk, encoding, callback) {
      writes.push(chunk.toString());
      callback();
    },
  });
  const proc = new EventEmitter();
  proc.stdin = stdin;
  proc.stdout = stdout;
  proc.stderr = stderr;
  proc.kill = jest.fn();

  mockSpawn.mockReturnValueOnce(proc);

  return {
    proc,
    stdout,
    writes,
    send(message) {
      stdout.write(`${JSON.stringify(message)}\n`);
    },
    messages() {
      return parseWrites(writes);
    },
  };
};

const completeHandshake = async (server) => {
  await waitForTicks();
  const initializeMessage = server.messages()[0];
  expect(initializeMessage.method).toBe("initialize");
  server.send({ id: initializeMessage.id, result: { userAgent: "codex-test" } });
  await waitForTicks();
};

const completeThreadStart = async (server, threadId = "thread-1") => {
  const threadStart = server
    .messages()
    .find((message) => message.method === "thread/start");
  expect(threadStart).toBeDefined();
  server.send({
    id: threadStart.id,
    result: {
      thread: {
        id: threadId,
      },
    },
  });
  await waitForTicks();
};

const completeTurn = async (server, text = "Codex answer") => {
  const turnStart = server
    .messages()
    .find((message) => message.method === "turn/start");
  expect(turnStart).toBeDefined();
  server.send({
    method: "item/agentMessage/delta",
    params: {
      delta: text,
    },
  });
  server.send({
    method: "turn/completed",
    params: {
      turn: {
        id: "turn-1",
      },
    },
  });
  await waitForTicks();
};

describe("CodexProvider", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      HOME: "/Users/tester",
      PATH: "/usr/bin",
    };
    delete process.env.CODEX_BIN;
    delete process.env.CODEX_TIMEOUT_MS;
    delete process.env.CODEX_SANDBOX;
    delete process.env.CODEX_APPROVAL_POLICY;
    delete process.env.CODEX_MODEL;
    delete process.env.CODEX_WORKDIR;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test("starts codex app-server over stdio and completes a turn", async () => {
    const server = createAppServerProcess();
    const provider = new CodexProvider();

    const answerPromise = provider.generateText("서버 상태 확인", {
      model: "gpt-5.4",
      codexThreadKey: "owner:channel",
      codexSandbox: "read-only",
      codexApprovalPolicy: "never",
    });

    await completeHandshake(server);
    await completeThreadStart(server);
    await completeTurn(server, "정상입니다.");

    await expect(answerPromise).resolves.toBe("정상입니다.");
    expect(mockSpawn).toHaveBeenCalledWith(
      "codex",
      ["app-server"],
      expect.objectContaining({
        stdio: ["pipe", "pipe", "pipe"],
        env: expect.objectContaining({
          PATH: expect.stringContaining("/Users/tester/.local/npm-global/bin"),
        }),
      }),
    );

    const messages = server.messages();
    expect(messages.map((message) => message.method)).toEqual([
      "initialize",
      "initialized",
      "thread/start",
      "turn/start",
    ]);

    const turnStart = messages.find(
      (message) => message.method === "turn/start",
    );
    expect(turnStart.params).toEqual(
      expect.objectContaining({
        threadId: "thread-1",
        cwd: process.cwd(),
        model: "gpt-5.4",
        sandboxPolicy: {
          type: "readOnly",
          networkAccess: false,
        },
        approvalPolicy: "never",
      }),
    );
    expect(turnStart.params.input).toEqual([
      {
        type: "text",
        text: "서버 상태 확인",
        text_elements: [],
      },
    ]);
  });

  test("includes system and JSON instructions in the turn input", async () => {
    const server = createAppServerProcess();
    const provider = new CodexProvider();

    const answerPromise = provider.generateText("payload 반환", {
      systemInstruction: "엄격하게 답해라.",
      responseMimeType: "application/json",
    });

    await completeHandshake(server);
    await completeThreadStart(server);
    await completeTurn(server, "{}");

    await expect(answerPromise).resolves.toBe("{}");
    const turnStart = server
      .messages()
      .find((message) => message.method === "turn/start");
    const inputText = turnStart.params.input[0].text;
    expect(inputText).toContain("엄격하게 답해라.");
    expect(inputText).toContain("payload 반환");
    expect(inputText).toContain("JSON");
  });

  test("reuses the mapped Codex thread for the same admin channel", async () => {
    const server = createAppServerProcess();
    const provider = new CodexProvider();

    const firstAnswer = provider.generateText("첫 질문", {
      codexThreadKey: "owner:channel",
    });
    await completeHandshake(server);
    await completeThreadStart(server, "thread-reused");
    await completeTurn(server, "첫 답변");
    await expect(firstAnswer).resolves.toBe("첫 답변");

    const secondAnswer = provider.generateText("두 번째 질문", {
      codexThreadKey: "owner:channel",
    });
    await waitForTicks();
    const secondTurnStart = server.messages().at(-1);
    expect(secondTurnStart.method).toBe("turn/start");
    expect(secondTurnStart.params.threadId).toBe("thread-reused");
    server.send({
      method: "item/agentMessage/delta",
      params: {
        delta: "두 번째 답변",
      },
    });
    server.send({ method: "turn/completed", params: {} });

    await expect(secondAnswer).resolves.toBe("두 번째 답변");
    expect(
      server.messages().filter((message) => message.method === "thread/start"),
    ).toHaveLength(1);
  });

  test("uses environment overrides for binary, timeout, model, workdir, sandbox, and approval policy", async () => {
    process.env.CODEX_BIN = "/opt/codex/bin/codex";
    process.env.CODEX_TIMEOUT_MS = "12345";
    process.env.CODEX_MODEL = "gpt-5-mini";
    process.env.CODEX_WORKDIR = "/srv/discord-bot";
    process.env.CODEX_SANDBOX = "workspace-write";
    process.env.CODEX_APPROVAL_POLICY = "on-request";
    const server = createAppServerProcess();
    const provider = new CodexProvider();

    const answerPromise = provider.generateText("설정 확인");

    await completeHandshake(server);
    await completeThreadStart(server);
    await completeTurn(server, "ok");
    await expect(answerPromise).resolves.toBe("ok");

    expect(mockSpawn.mock.calls[0][0]).toBe("/opt/codex/bin/codex");
    expect(mockSpawn.mock.calls[0][2].cwd).toBe("/srv/discord-bot");
    const turnStart = server
      .messages()
      .find((message) => message.method === "turn/start");
    expect(turnStart.params).toEqual(
      expect.objectContaining({
        cwd: "/srv/discord-bot",
        model: "gpt-5-mini",
        sandboxPolicy: {
          type: "workspaceWrite",
          writableRoots: ["/srv/discord-bot"],
          networkAccess: false,
          excludeTmpdirEnvVar: false,
          excludeSlashTmp: false,
        },
        approvalPolicy: "on-request",
      }),
    );
  });

  test("rejects JSON-RPC errors with the server message", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const server = createAppServerProcess();
    const provider = new CodexProvider();

    const answerPromise = provider.generateText("실패 요청");

    await completeHandshake(server);
    const threadStart = server
      .messages()
      .find((message) => message.method === "thread/start");
    server.send({
      id: threadStart.id,
      error: {
        code: -32000,
        message: "not authenticated",
      },
    });

    await expect(answerPromise).rejects.toThrow("not authenticated");
    expect(consoleSpy).toHaveBeenCalledWith(
      "[CodexProvider] 생성 오류: not authenticated",
    );
    consoleSpy.mockRestore();
  });

  test("rejects turn/start JSON-RPC errors with the server message", async () => {
    process.env.CODEX_TIMEOUT_MS = "100";
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const server = createAppServerProcess();
    const provider = new CodexProvider();

    const answerPromise = provider.generateText("거부되는 요청");

    await completeHandshake(server);
    await completeThreadStart(server);
    const turnStart = server
      .messages()
      .find((message) => message.method === "turn/start");
    server.send({
      id: turnStart.id,
      error: {
        code: -32000,
        message: "turn denied",
      },
    });

    await expect(answerPromise).rejects.toThrow("turn denied");
    consoleSpy.mockRestore();
  });

  test("rejects when the completed turn has no agent text", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const server = createAppServerProcess();
    const provider = new CodexProvider();

    const answerPromise = provider.generateText("빈 답변 요청");

    await completeHandshake(server);
    await completeThreadStart(server);
    server.send({ method: "turn/completed", params: {} });

    await expect(answerPromise).rejects.toThrow(
      "Codex returned an empty response",
    );
    consoleSpy.mockRestore();
  });
});
