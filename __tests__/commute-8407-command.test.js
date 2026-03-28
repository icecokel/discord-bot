require("ts-node/register/transpile-only");

describe("8407 command", () => {
  const baseSnapshot = {
    observedAt: new Date("2026-03-30T08:00:00+09:00").getTime(),
    serviceDate: "2026-03-30",
    dayType: "weekday",
    routeCache: null,
    realtimeArrival: null,
    historicalScheduleTimes: [],
    nextHistoricalArrivalAt: null,
    targetArrivalAt: null,
    predictionSource: "unavailable",
    note: "테스트",
  };

  const loadCommand = (serviceMock) => {
    jest.resetModules();
    jest.doMock("../src/features/tools/commute-8407-service", () => ({
      __esModule: true,
      commute8407Service: serviceMock,
      default: serviceMock,
    }));

    return require("../src/features/tools/commands/commute-8407").default;
  };

  test("!8407 알림 enables DM alert after rendering snapshot", async () => {
    const embed = { fake: true };
    const serviceMock = {
      getSnapshot: jest.fn().mockResolvedValue(baseSnapshot),
      createEmbed: jest.fn().mockReturnValue(embed),
      enableAlert: jest.fn().mockReturnValue({ alreadyEnabled: false }),
      disableAlert: jest.fn(),
    };

    const command = loadCommand(serviceMock);
    const message = {
      author: { id: "user-1" },
      reply: jest.fn(),
    };

    await command.execute(message, ["알림"]);

    expect(serviceMock.getSnapshot).toHaveBeenCalledTimes(1);
    expect(serviceMock.enableAlert).toHaveBeenCalledWith("user-1");
    expect(message.reply).toHaveBeenCalledWith({
      content: expect.stringContaining("DM 알림을 켰습니다"),
      embeds: [embed],
    });
  });

  test("!8407 해제 disables alert without fetching snapshot", async () => {
    const serviceMock = {
      getSnapshot: jest.fn(),
      createEmbed: jest.fn(),
      enableAlert: jest.fn(),
      disableAlert: jest.fn().mockReturnValue(true),
    };

    const command = loadCommand(serviceMock);
    const message = {
      author: { id: "user-1" },
      reply: jest.fn(),
    };

    await command.execute(message, ["해제"]);

    expect(serviceMock.getSnapshot).not.toHaveBeenCalled();
    expect(serviceMock.disableAlert).toHaveBeenCalledWith("user-1");
    expect(message.reply).toHaveBeenCalledWith(
      "🔕 8407 통근버스 알림을 해제했습니다.",
    );
  });
});
