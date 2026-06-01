const { leaveJoinedGuilds } = require("../src/core/guild-leaver");

const createClient = (guilds, userId = "bot-id") => ({
  user: { id: userId },
  guilds: {
    cache: new Map(guilds.map((guild) => [guild.id, guild])),
  },
});

describe("guild leaver", () => {
  test("leaves every joined guild", async () => {
    const firstLeave = jest.fn().mockResolvedValue(undefined);
    const secondLeave = jest.fn().mockResolvedValue(undefined);
    const client = createClient([
      { id: "guild-1", name: "First", ownerId: "owner-1", leave: firstLeave },
      { id: "guild-2", name: "Second", ownerId: "owner-2", leave: secondLeave },
    ]);

    const result = await leaveJoinedGuilds(client);

    expect(firstLeave).toHaveBeenCalledTimes(1);
    expect(secondLeave).toHaveBeenCalledTimes(1);
    expect(result.left).toEqual([
      { id: "guild-1", name: "First" },
      { id: "guild-2", name: "Second" },
    ]);
    expect(result.failed).toEqual([]);
    expect(result.skippedOwned).toEqual([]);
  });

  test("skips guilds owned by the bot because Discord rejects leaving them", async () => {
    const leave = jest.fn().mockResolvedValue(undefined);
    const client = createClient([
      { id: "guild-1", name: "Owned", ownerId: "bot-id", leave },
    ]);

    const result = await leaveJoinedGuilds(client);

    expect(leave).not.toHaveBeenCalled();
    expect(result.left).toEqual([]);
    expect(result.failed).toEqual([]);
    expect(result.skippedOwned).toEqual([{ id: "guild-1", name: "Owned" }]);
  });

  test("records failures and continues leaving remaining guilds", async () => {
    const firstLeave = jest.fn().mockRejectedValue(new Error("Forbidden"));
    const secondLeave = jest.fn().mockResolvedValue(undefined);
    const client = createClient([
      { id: "guild-1", name: "First", ownerId: "owner-1", leave: firstLeave },
      { id: "guild-2", name: "Second", ownerId: "owner-2", leave: secondLeave },
    ]);

    const result = await leaveJoinedGuilds(client);

    expect(firstLeave).toHaveBeenCalledTimes(1);
    expect(secondLeave).toHaveBeenCalledTimes(1);
    expect(result.left).toEqual([{ id: "guild-2", name: "Second" }]);
    expect(result.failed).toEqual([
      { id: "guild-1", name: "First", reason: "Forbidden" },
    ]);
    expect(result.skippedOwned).toEqual([]);
  });
});
