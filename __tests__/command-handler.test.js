const { handleCommand } = require("../src/core/command-handler");

const createMessage = (content = "!날씨") => ({
  content,
  author: {
    id: "owner-id",
    tag: "owner#0001",
  },
  reply: jest.fn(),
});

describe("command handler", () => {
  test("returns false when message has no prefix", async () => {
    const commands = new Map();
    const handled = await handleCommand(createMessage("서울 날씨 알려줘"), commands);

    expect(handled).toBe(false);
  });

  test("returns true and executes matched prefix command", async () => {
    const execute = jest.fn();
    const commands = new Map([
      [
        "날씨",
        {
          name: "날씨",
          keywords: ["날씨", "오늘날씨"],
          execute,
        },
      ],
    ]);

    const handled = await handleCommand(createMessage("!날씨"), commands);

    expect(handled).toBe(true);
    expect(execute).toHaveBeenCalledWith(expect.any(Object), []);
  });

  test("does not register ping command", () => {
    const { commands } = require("../src/core/registry");
    const names = commands.map((command) => command.name);
    const keywords = commands.flatMap((command) => command.keywords || []);

    expect(names).not.toContain("핑");
    expect(keywords).not.toContain("핑");
  });

  test("does not register help command", () => {
    const { commands } = require("../src/core/registry");
    const names = commands.map((command) => command.name);
    const keywords = commands.flatMap((command) => command.keywords || []);

    expect(names).not.toContain("도움말");
    expect(keywords).not.toContain("도움말");
    expect(keywords).not.toContain("명령어");
    expect(keywords).not.toContain("사용법");
  });
});
