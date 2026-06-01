const { handleCommand } = require("../src/core/command-handler");

const createMessage = (content = "!ping") => ({
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
        "ping",
        {
          name: "ping",
          keywords: ["ping"],
          execute,
        },
      ],
    ]);

    const handled = await handleCommand(createMessage("!ping"), commands);

    expect(handled).toBe(true);
    expect(execute).toHaveBeenCalledWith(expect.any(Object), []);
  });
});
