const { ChannelType } = require("discord.js");
const { shouldProcessMessage } = require("../src/core/message-guard");

const createMessage = ({
  bot = false,
  userId = "owner-id",
  channelType = ChannelType.DM,
} = {}) => ({
  author: {
    bot,
    id: userId,
  },
  channel: {
    type: channelType,
  },
});

describe("message guard", () => {
  test("accepts only project owner DM messages", () => {
    expect(shouldProcessMessage(createMessage(), "owner-id")).toBe(true);
  });

  test("rejects bot messages", () => {
    expect(shouldProcessMessage(createMessage({ bot: true }), "owner-id")).toBe(
      false,
    );
  });

  test("rejects non-DM messages from the owner", () => {
    expect(
      shouldProcessMessage(
        createMessage({ channelType: ChannelType.GuildText }),
        "owner-id",
      ),
    ).toBe(false);
  });

  test("rejects DM messages from non-owner users", () => {
    expect(
      shouldProcessMessage(createMessage({ userId: "other-id" }), "owner-id"),
    ).toBe(false);
  });

  test("rejects all user messages when owner id is missing", () => {
    expect(shouldProcessMessage(createMessage(), undefined)).toBe(false);
  });
});
