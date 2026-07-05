const fs = require("node:fs");

const mockExecFile = jest.fn();

jest.mock("node:child_process", () => ({
  execFile: mockExecFile,
}));

const { CodexProvider } = require("../src/core/ai/providers/codex-provider");

const getArgValue = (args, name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const resolveExecFile = (lastMessage, stdout = "") => {
  mockExecFile.mockImplementationOnce((bin, args, options, callback) => {
    const outputPath = getArgValue(args, "--output-last-message");
    if (outputPath && lastMessage !== undefined) {
      fs.writeFileSync(outputPath, lastMessage);
    }
    callback(null, { stdout, stderr: "" });
  });
};

const rejectExecFile = (error) => {
  mockExecFile.mockImplementationOnce((bin, args, options, callback) => {
    callback(error);
  });
};

describe("CodexProvider", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      HOME: "/Users/tester",
    };
    delete process.env.CODEX_BIN;
    delete process.env.CODEX_TIMEOUT_MS;
    delete process.env.CODEX_SANDBOX;
    delete process.env.CODEX_APPROVAL_POLICY;
    delete process.env.CODEX_MODEL;
    delete process.env.CODEX_PROFILE;
    delete process.env.CODEX_WORKDIR;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test("runs codex exec with the default binary, args, timeout, maxBuffer, and expanded PATH", async () => {
    resolveExecFile("hello");
    const provider = new CodexProvider();

    const result = await provider.generateText("Say hello");

    expect(result).toBe("hello");
    expect(mockExecFile).toHaveBeenCalledWith(
      "codex",
      expect.arrayContaining([
        "exec",
        "--cd",
        process.cwd(),
        "--sandbox",
        "read-only",
        "--ask-for-approval",
        "never",
        "--output-last-message",
        expect.any(String),
        "--color",
        "never",
        "--ignore-rules",
        "Say hello",
      ]),
      expect.objectContaining({
        timeout: 30 * 60 * 1000,
        maxBuffer: 1024 * 1024,
        env: expect.objectContaining({
          PATH: expect.stringContaining("/Users/tester/.local/bin"),
        }),
      }),
      expect.any(Function),
    );
    const args = mockExecFile.mock.calls[0][1];
    expect(args[0]).toBe("exec");
    expect(args[args.length - 1]).toBe("Say hello");
    expect(args).not.toContain("--dangerously-bypass-approvals-and-sandbox");
    const options = mockExecFile.mock.calls[0][2];
    expect(options.env.PATH).toContain("/Users/tester/.local/npm-global/bin");
  });

  test("uses CODEX_BIN, CODEX_TIMEOUT_MS, sandbox, and approval overrides", async () => {
    process.env.CODEX_BIN = "/opt/codex/bin/codex";
    process.env.CODEX_TIMEOUT_MS = "12345";
    process.env.CODEX_SANDBOX = "workspace-write";
    process.env.CODEX_APPROVAL_POLICY = "on-request";
    resolveExecFile("ok");
    const provider = new CodexProvider();

    await provider.generateText("prompt");

    expect(mockExecFile.mock.calls[0][0]).toBe("/opt/codex/bin/codex");
    expect(mockExecFile.mock.calls[0][1]).toEqual(
      expect.arrayContaining([
        "--sandbox",
        "workspace-write",
        "--ask-for-approval",
        "on-request",
      ]),
    );
    expect(mockExecFile.mock.calls[0][2].timeout).toBe(12345);
  });

  test("uses per-request search, model, and profile options without bypassing sandbox", async () => {
    resolveExecFile("ok");
    const provider = new CodexProvider();

    await provider.generateText("prompt", {
      codexSearch: true,
      model: "gpt-5",
      codexProfile: "ops",
    });

    expect(mockExecFile.mock.calls[0][1]).toEqual(
      expect.arrayContaining([
        "--search",
        "--model",
        "gpt-5",
        "--profile",
        "ops",
      ]),
    );
    expect(mockExecFile.mock.calls[0][1]).not.toContain("--accept-hooks");
    expect(mockExecFile.mock.calls[0][1]).not.toContain(
      "--dangerously-bypass-approvals-and-sandbox",
    );
  });

  test("uses environment model, profile, and workdir defaults", async () => {
    process.env.CODEX_MODEL = "gpt-5-mini";
    process.env.CODEX_PROFILE = "server";
    process.env.CODEX_WORKDIR = "/srv/discord-bot";
    resolveExecFile("ok");
    const provider = new CodexProvider();

    await provider.generateText("prompt");

    expect(mockExecFile.mock.calls[0][1]).toEqual(
      expect.arrayContaining([
        "--cd",
        "/srv/discord-bot",
        "--model",
        "gpt-5-mini",
        "--profile",
        "server",
      ]),
    );
  });

  test("includes system instruction and json-only instruction in the codex prompt", async () => {
    resolveExecFile("{}");
    const provider = new CodexProvider();

    await provider.generateText("Return a payload", {
      systemInstruction: "You are strict.",
      responseMimeType: "application/json",
    });

    const args = mockExecFile.mock.calls[0][1];
    const codexPrompt = args[args.length - 1];
    expect(codexPrompt).toContain("You are strict.");
    expect(codexPrompt).toContain("Return a payload");
    expect(codexPrompt).toContain("JSON");
  });

  test("falls back to stdout when codex does not write the last message file", async () => {
    resolveExecFile(undefined, "stdout response");
    const provider = new CodexProvider();

    const result = await provider.generateText("prompt");

    expect(result).toBe("stdout response");
  });

  test("throws when codex returns an empty response", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    resolveExecFile("   \n\n");
    const provider = new CodexProvider();

    await expect(provider.generateText("prompt")).rejects.toThrow(
      "Codex returned an empty response",
    );

    consoleSpy.mockRestore();
  });

  test("logs and rethrows generation errors", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("spawn failed");
    rejectExecFile(error);
    const provider = new CodexProvider();

    await expect(provider.generateText("prompt")).rejects.toThrow(error);
    expect(consoleSpy).toHaveBeenCalledWith(
      "[CodexProvider] 생성 오류: spawn failed",
    );

    consoleSpy.mockRestore();
  });
});
