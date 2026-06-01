const {
  handleNaturalLanguageMessage,
} = require("../src/core/natural-language-router");
const { clearAllPendingActions } = require("../src/core/pending-action-store");

const createMessage = (content) => ({
  content,
  author: {
    id: "owner-id",
    tag: "owner#0001",
  },
  channel: {
    send: jest.fn(),
  },
  reply: jest.fn().mockResolvedValue({
    edit: jest.fn(),
  }),
});

const createCommands = () => {
  const weatherExecute = jest.fn();
  const fortuneExecute = jest.fn();

  return {
    weatherExecute,
    fortuneExecute,
    commands: new Map([
      [
        "weather",
        {
          name: "weather",
          keywords: ["weather", "날씨", "오늘날씨"],
          execute: weatherExecute,
        },
      ],
      [
        "fortune",
        {
          name: "운세",
          keywords: ["운세", "fortune", "오늘운세"],
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

    expect(handled).toBe(true);
    expect(weatherExecute).toHaveBeenCalledWith(message, ["서울"]);
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

    expect(requested).toBe(true);
    expect(weatherExecute).not.toHaveBeenCalled();
    expect(requestMessage.reply).toHaveBeenCalledWith(
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
