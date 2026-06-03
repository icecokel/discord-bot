const mockExecFile = jest.fn();

jest.mock("node:child_process", () => ({
  execFile: mockExecFile,
}));

const { HermesProvider } = require("../src/core/ai/providers/hermes-provider");

const resolveExecFile = (stdout) => {
  mockExecFile.mockImplementationOnce((bin, args, options, callback) => {
    callback(null, { stdout, stderr: "" });
  });
};

const rejectExecFile = (error) => {
  mockExecFile.mockImplementationOnce((bin, args, options, callback) => {
    callback(error);
  });
};

describe("HermesProvider", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      HOME: "/Users/tester",
    };
    delete process.env.HERMES_BIN;
    delete process.env.HERMES_TIMEOUT_MS;
    delete process.env.HERMES_TOOLSETS;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test("runs hermes with the default binary, args, timeout, maxBuffer, and expanded PATH", async () => {
    resolveExecFile("hello");
    const provider = new HermesProvider();

    const result = await provider.generateText("Say hello");

    expect(result).toBe("hello");
    expect(mockExecFile).toHaveBeenCalledWith(
      "hermes",
      ["-z", "Say hello", "--toolsets", "", "--ignore-rules"],
      expect.objectContaining({
        timeout: 60000,
        maxBuffer: 1024 * 1024,
        env: expect.objectContaining({
          PATH: expect.stringContaining("/Users/tester/.local/bin"),
        }),
      }),
      expect.any(Function),
    );
    const options = mockExecFile.mock.calls[0][2];
    expect(options.env.PATH).toContain("/Users/tester/.local/npm-global/bin");
  });

  test("uses HERMES_BIN and HERMES_TIMEOUT_MS overrides", async () => {
    process.env.HERMES_BIN = "/opt/hermes/bin/hermes";
    process.env.HERMES_TIMEOUT_MS = "12345";
    resolveExecFile("ok");
    const provider = new HermesProvider();

    await provider.generateText("prompt");

    expect(mockExecFile.mock.calls[0][0]).toBe("/opt/hermes/bin/hermes");
    expect(mockExecFile.mock.calls[0][2].timeout).toBe(12345);
  });

  test("uses explicit toolsets override without auto-accepting hooks", async () => {
    process.env.HERMES_TOOLSETS = "web";
    resolveExecFile("ok");
    const provider = new HermesProvider();

    await provider.generateText("prompt");

    expect(mockExecFile.mock.calls[0][1]).toEqual([
      "-z",
      "prompt",
      "--toolsets",
      "web",
      "--ignore-rules",
    ]);
    expect(mockExecFile.mock.calls[0][1]).not.toContain("--accept-hooks");
  });

  test("includes system instruction and json-only instruction in the hermes prompt", async () => {
    resolveExecFile("{}");
    const provider = new HermesProvider();

    await provider.generateText("Return a payload", {
      systemInstruction: "You are strict.",
      responseMimeType: "application/json",
    });

    const hermesPrompt = mockExecFile.mock.calls[0][1][1];
    expect(hermesPrompt).toContain("You are strict.");
    expect(hermesPrompt).toContain("Return a payload");
    expect(hermesPrompt).toContain("JSON");
  });

  test("strips session id lines from stdout", async () => {
    resolveExecFile("session_id: abc123\nactual response\nsession_id: next\n");
    const provider = new HermesProvider();

    const result = await provider.generateText("prompt");

    expect(result).toBe("actual response");
  });

  test("throws when hermes returns only empty or session id output", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    resolveExecFile("session_id: abc123\n\n");
    const provider = new HermesProvider();

    await expect(provider.generateText("prompt")).rejects.toThrow(
      "Hermes returned an empty response",
    );

    consoleSpy.mockRestore();
  });

  test("logs and rethrows generation errors", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("spawn failed");
    rejectExecFile(error);
    const provider = new HermesProvider();

    await expect(provider.generateText("prompt")).rejects.toThrow(error);
    expect(consoleSpy).toHaveBeenCalledWith(
      "[HermesProvider] 생성 오류: spawn failed",
    );

    consoleSpy.mockRestore();
  });
});
