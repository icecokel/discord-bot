const { handleCommand } = require("../src/core/command-handler");

const createMessage = (content = "!헤르메스") => ({
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
        "헤르메스",
        {
          name: "헤르메스",
          keywords: ["헤르메스", "hermes"],
          execute,
        },
      ],
    ]);

    const handled = await handleCommand(createMessage("!헤르메스"), commands);

    expect(handled).toBe(true);
    expect(execute).toHaveBeenCalledWith(expect.any(Object), []);
  });

  test("registers only admin Hermes prefix command", () => {
    const { commands } = require("../src/core/registry");
    const names = commands.map((command) => command.name);
    const keywords = commands.flatMap((command) => command.keywords || []);

    expect(names).toEqual(["헤르메스"]);
    expect(keywords).toEqual(["헤르메스", "hermes"]);
  });

  test("does not register removed public commands", () => {
    const { commands } = require("../src/core/registry");
    const names = commands.map((command) => command.name);
    const keywords = commands.flatMap((command) => command.keywords || []);

    expect(names).not.toContain("날씨");
    expect(names).not.toContain("주간날씨");
    expect(names).not.toContain("운세");
    expect(names).not.toContain("긱뉴스");
    expect(names).not.toContain("게임");
    expect(names).not.toContain("내정보");
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
