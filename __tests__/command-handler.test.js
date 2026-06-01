const { handleCommand } = require("../src/core/command-handler");

const createMessage = (content = "!핑") => ({
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
        "핑",
        {
          name: "핑",
          keywords: ["핑"],
          execute,
        },
      ],
    ]);

    const handled = await handleCommand(createMessage("!핑"), commands);

    expect(handled).toBe(true);
    expect(execute).toHaveBeenCalledWith(expect.any(Object), []);
  });
});
