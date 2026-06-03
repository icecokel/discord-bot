const { ChannelType } = require("discord.js");
const {
  shouldProcessMessage,
  shouldProcessNaturalLanguageMessage,
} = require("../src/core/message-guard");

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
  test("accepts user messages regardless of admin ownership", () => {
    expect(shouldProcessMessage(createMessage(), "owner-id")).toBe(true);
    expect(
      shouldProcessMessage(createMessage({ userId: "other-id" }), "owner-id"),
    ).toBe(true);
  });

  test("rejects bot messages", () => {
    expect(shouldProcessMessage(createMessage({ bot: true }), "owner-id")).toBe(
      false,
    );
  });

  test("accepts guild user messages for prefix command handling", () => {
    expect(
      shouldProcessMessage(
        createMessage({ channelType: ChannelType.GuildText }),
        "owner-id",
      ),
    ).toBe(true);
  });

  test("accepts user messages when owner id is missing", () => {
    expect(shouldProcessMessage(createMessage(), undefined)).toBe(true);
  });

  test("allows natural language handling only in DM", () => {
    expect(shouldProcessNaturalLanguageMessage(createMessage())).toBe(true);
    expect(
      shouldProcessNaturalLanguageMessage(
        createMessage({ channelType: ChannelType.GuildText }),
      ),
    ).toBe(false);
  });
});
