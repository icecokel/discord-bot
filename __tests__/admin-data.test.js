const { ChannelType, Collection } = require("discord.js");

jest.mock("../src/utils/file-manager", () => ({
  readJson: jest.fn(() => ({})),
}));

const { handleData } = require("../src/features/admin/commands/admin-data");

describe("admin data command", () => {
  test("does not expose a general channel as a representative schedule channel", async () => {
    const reply = jest.fn().mockResolvedValue(undefined);
    const generalChannel = {
      id: "general-channel-id",
      name: "general",
      type: ChannelType.GuildText,
    };
    const otherChannel = {
      id: "other-channel-id",
      name: "dev-log",
      type: ChannelType.GuildText,
    };
    const message = {
      client: {
        channels: {
          fetch: jest.fn().mockResolvedValue(null),
        },
        guilds: {
          cache: new Collection([
            [
              "guild-id",
              {
                id: "guild-id",
                name: "Test Guild",
                memberCount: 10,
                channels: {
                  cache: new Collection([
                    [generalChannel.id, generalChannel],
                    [otherChannel.id, otherChannel],
                  ]),
                },
              },
            ],
          ]),
        },
      },
      reply,
    };

    await handleData(message);

    const payload = reply.mock.calls[0][0];
    const embedJson = payload.embeds[0].toJSON();
    const guildField = embedJson.fields.find(
      (field) => field.name === "🏰 참여 중인 서버 현황",
    );

    expect(guildField.value).not.toContain("대표 채널ID");
    expect(guildField.value).not.toContain("general-channel-id");
  });
});
