const {
  handleNaturalLanguageMessage,
} = require("../src/core/natural-language-router");
const { clearAllPendingActions } = require("../src/core/pending-action-store");

const createMessage = (content) => {
  const edit = jest.fn();
  const deleteMessage = jest.fn();

  return {
    content,
    author: {
      id: "owner-id",
      tag: "owner#0001",
    },
    channel: {
      send: jest.fn(),
    },
    reply: jest.fn().mockResolvedValue({
      delete: deleteMessage,
      edit,
    }),
  };
};

const createCommands = () => {
  const weatherExecute = jest.fn();
  const fortuneExecute = jest.fn();

  return {
    weatherExecute,
    fortuneExecute,
    commands: new Map([
      [
        "날씨",
        {
          name: "날씨",
          keywords: ["날씨", "오늘날씨"],
          execute: weatherExecute,
        },
      ],
      [
        "fortune",
        {
          name: "운세",
          keywords: ["운세", "오늘운세"],
          execute: fortuneExecute,
        },
      ],
    ]),
  };
};

describe("natural language router", () => {
  beforeEach(() => {
    clearAllPendingActions();
  });

  test("routes natural weather requests to the existing weather command", async () => {
    const { commands, weatherExecute } = createCommands();
    const message = createMessage("오늘 서울 날씨 알려줘");

    const handled = await handleNaturalLanguageMessage(message, commands);
    const progressMessage = await message.reply.mock.results[0].value;

    expect(handled).toBe(true);
    expect(message.reply).toHaveBeenCalledWith("요청을 확인하고 있습니다...");
    expect(progressMessage.delete).toHaveBeenCalled();
    expect(weatherExecute).toHaveBeenCalledWith(message, ["서울"]);
  });

  test("passes inexact weather region phrases to the weather command", async () => {
    const { commands, weatherExecute } = createCommands();
    const message = createMessage("광교 날씨 알려줘");

    const handled = await handleNaturalLanguageMessage(message, commands);

    expect(handled).toBe(true);
    expect(weatherExecute).toHaveBeenCalledWith(message, ["광교"]);
  });

  test("routes fortune requests to the existing fortune command", async () => {
    const { commands, fortuneExecute } = createCommands();
    const message = createMessage("오늘 운세 봐줘");

    const handled = await handleNaturalLanguageMessage(message, commands);

    expect(handled).toBe(true);
    expect(fortuneExecute).toHaveBeenCalledWith(message, []);
  });

  test("requires confirmation before changing weather notifications", async () => {
    const { commands, weatherExecute } = createCommands();
    const requestMessage = createMessage("날씨 알림 켜줘");

    const requested = await handleNaturalLanguageMessage(
      requestMessage,
      commands,
    );
    const progressMessage = await requestMessage.reply.mock.results[0].value;

    expect(requested).toBe(true);
    expect(weatherExecute).not.toHaveBeenCalled();
    expect(requestMessage.reply).toHaveBeenCalledWith(
      "요청을 확인하고 있습니다...",
    );
    expect(progressMessage.edit).toHaveBeenCalledWith(
      expect.stringContaining("실행하려면"),
    );

    const confirmMessage = createMessage("확인");
    const confirmed = await handleNaturalLanguageMessage(
      confirmMessage,
      commands,
    );

    expect(confirmed).toBe(true);
    expect(weatherExecute).toHaveBeenCalledWith(confirmMessage, ["알림"]);
  });
});
