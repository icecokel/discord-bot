const { ChannelType } = require("discord.js");

const createMessage = (content, userId = "owner-id") => ({
  content,
  author: {
    id: userId,
  },
  channel: {
    type: ChannelType.DM,
  },
  reply: jest.fn().mockResolvedValue(undefined),
});

describe("admin middleware", () => {
  const originalAdminId = process.env.ADMIN_ID;

  beforeEach(() => {
    jest.resetModules();
    process.env.ADMIN_ID = "owner-id";
  });

  afterAll(() => {
    process.env.ADMIN_ID = originalAdminId;
  });

  test("executes a direct Korean admin command in owner DM", async () => {
    const {
      handleAdminCommand,
      registerAdminCommand,
    } = require("../src/core/admin-middleware");
    const handler = jest.fn().mockResolvedValue(undefined);
    registerAdminCommand("점검", handler, "점검");

    const message = createMessage("/점검 지금");
    const handled = await handleAdminCommand(message);

    expect(handled).toBe(true);
    expect(handler).toHaveBeenCalledWith(message, ["지금"]);
  });

  test("executes a /관리자 subcommand in owner DM", async () => {
    const {
      handleAdminCommand,
      registerAdminCommand,
    } = require("../src/core/admin-middleware");
    const handler = jest.fn().mockResolvedValue(undefined);
    registerAdminCommand("로그", handler, "로그");

    const message = createMessage("/관리자 로그 10");
    const handled = await handleAdminCommand(message);

    expect(handled).toBe(true);
    expect(handler).toHaveBeenCalledWith(message, ["10"]);
  });

  test("rejects admin commands from non-owner users", async () => {
    const {
      handleAdminCommand,
      registerAdminCommand,
    } = require("../src/core/admin-middleware");
    const handler = jest.fn().mockResolvedValue(undefined);
    registerAdminCommand("점검", handler, "점검");

    const message = createMessage("/점검", "other-id");
    const handled = await handleAdminCommand(message);

    expect(handled).toBe(false);
    expect(handler).not.toHaveBeenCalled();
    expect(message.reply).toHaveBeenCalledWith(
      expect.stringContaining("관리자 권한이 없습니다"),
    );
  });
});
