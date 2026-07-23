const mockCronSchedule = jest.fn();
const mockFetchFeaturedItemResult = jest.fn();
const mockCreateEmbeds = jest.fn();
const mockMarkItemAsSent = jest.fn();
const mockGetShortTermForecast = jest.fn();
const mockCollectServerHealth = jest.fn();
const mockBuildServerHealthBriefingLine = jest.fn(
  () => "🖥️ 서버 | 주의: 메모리 95% · 디스크 40% · 메모리 95%",
);
const mockRegisterScheduleDefinitions = jest.fn();
const mockRecordScheduleRunStart = jest.fn();
const mockRecordScheduleRunCompletion = jest.fn();
const mockRecordScheduleRunFailure = jest.fn();

jest.mock("node-cron", () => ({
  schedule: mockCronSchedule,
}));

jest.mock("../src/features/daily_news/geek-news-service", () => ({
  __esModule: true,
  default: {
    fetchFeaturedItemResult: mockFetchFeaturedItemResult,
    createEmbeds: mockCreateEmbeds,
    markItemAsSent: mockMarkItemAsSent,
  },
}));

jest.mock("../src/utils/kma-helper", () => ({
  getShortTermForecast: mockGetShortTermForecast,
}));

jest.mock("../src/utils/server-health", () => ({
  collectServerHealth: mockCollectServerHealth,
  buildServerHealthBriefingLine: mockBuildServerHealthBriefingLine,
}));

jest.mock("../src/utils/schedule-run-store", () => ({
  registerScheduleDefinitions: mockRegisterScheduleDefinitions,
  recordScheduleRunStart: mockRecordScheduleRunStart,
  recordScheduleRunCompletion: mockRecordScheduleRunCompletion,
  recordScheduleRunFailure: mockRecordScheduleRunFailure,
}));

const {
  GEEK_NEWS_SCHEDULE,
  MORNING_BRIEFING_SCHEDULE,
  SCHEDULE_DEFINITIONS,
  TOMORROW_WEATHER_SCHEDULE,
} = require("../src/core/scheduler/schedule-definitions");
const {
  resolveAdminWeatherNotificationUsers,
  PrivateScheduler,
} = require("../src/core/scheduler/private-scheduler");

const forecast = {
  today: {
    current: {
      temp: 24,
      sky: "맑음 ☀️",
      pty: "",
      pop: 10,
      desc: "맑음 ☀️",
    },
    min: 20,
    max: 28,
    popMax: 20,
  },
  tomorrow: {
    min: 21,
    max: 29,
    sky: "구름많음 🌥️",
    popMax: 30,
  },
  dayAfter: {
    min: 22,
    max: 30,
    sky: "맑음 ☀️",
    popMax: 10,
  },
};

describe("private scheduler owner-only filtering", () => {
  test("uses the configured admin weather region without user preferences", () => {
    expect(
      resolveAdminWeatherNotificationUsers([], "admin-id", "부산"),
    ).toEqual([{ userId: "admin-id", region: "부산" }]);
  });

  test("falls back to the admin preference region when no weather region is configured", () => {
    const users = [
      { userId: "admin-id", region: "서울" },
      { userId: "other-id", region: "부산" },
    ];

    expect(resolveAdminWeatherNotificationUsers(users, "admin-id")).toEqual([
      { userId: "admin-id", region: "서울" },
    ]);
  });

  test("uses a default admin weather region when admin preference is missing", () => {
    expect(resolveAdminWeatherNotificationUsers([], "admin-id")).toEqual([
      { userId: "admin-id", region: "서울" },
    ]);
  });

  test("keeps no weather target when admin id is missing", () => {
    expect(
      resolveAdminWeatherNotificationUsers([{ userId: "admin-id", region: "서울" }]),
    ).toEqual([]);
  });
});

describe("private scheduler morning briefing", () => {
  const originalAdminId = process.env.ADMIN_ID;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ADMIN_ID = "admin-id";
    mockGetShortTermForecast.mockResolvedValue(forecast);
    mockCollectServerHealth.mockReturnValue({
      diskUsagePercent: 40,
      memoryUsagePercent: 30,
      warnings: [],
    });
    mockFetchFeaturedItemResult.mockResolvedValue({
      status: "ok",
      item: {
        title: "새 긱뉴스",
        link: "https://news.hada.io/topic?id=1",
      },
    });
    mockCreateEmbeds.mockReturnValue([{ title: "embed" }]);
  });

  afterAll(() => {
    if (originalAdminId === undefined) {
      delete process.env.ADMIN_ID;
    } else {
      process.env.ADMIN_ID = originalAdminId;
    }
  });

  test("registers the 06:30 briefing, 07:50 geek news and 22:30 forecast", () => {
    const scheduler = new PrivateScheduler({ users: { fetch: jest.fn() } });

    scheduler.start();

    expect(mockRegisterScheduleDefinitions).toHaveBeenCalledWith(
      SCHEDULE_DEFINITIONS,
    );
    expect(mockCronSchedule).toHaveBeenCalledWith(
      "30 6 * * *",
      expect.any(Function),
      { timezone: "Asia/Seoul" },
    );
    expect(mockCronSchedule).toHaveBeenCalledWith(
      "50 7 * * *",
      expect.any(Function),
      { timezone: "Asia/Seoul" },
    );
    expect(mockCronSchedule).toHaveBeenCalledWith(
      "30 22 * * *",
      expect.any(Function),
      { timezone: "Asia/Seoul" },
    );
  });

  test("sends weather without healthy server status or geek news", async () => {
    const send = jest.fn().mockResolvedValue(undefined);
    const scheduler = new PrivateScheduler({
      users: {
        fetch: jest.fn().mockResolvedValue({ tag: "admin#0001", send }),
      },
    });

    const result = await scheduler.sendMorningBriefing();

    expect(result.status).toBe("success");
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({
      content: expect.stringContaining("서울 오늘"),
    });
    expect(send.mock.calls[0][0].content).not.toContain("서버 |");
    expect(mockFetchFeaturedItemResult).not.toHaveBeenCalled();
    expect(mockCreateEmbeds).not.toHaveBeenCalled();
    expect(mockMarkItemAsSent).not.toHaveBeenCalled();
  });

  test("includes server status only when the server has a warning", async () => {
    const send = jest.fn().mockResolvedValue(undefined);
    mockCollectServerHealth.mockReturnValue({
      diskUsagePercent: 40,
      memoryUsagePercent: 95,
      warnings: ["메모리 95%"],
    });
    const scheduler = new PrivateScheduler({
      users: { fetch: jest.fn().mockResolvedValue({ send }) },
    });

    const result = await scheduler.sendMorningBriefing();

    expect(result).toMatchObject({ status: "success" });
    expect(send.mock.calls[0][0].content).toContain("서버 | 주의");
    expect(mockBuildServerHealthBriefingLine).toHaveBeenCalledWith(
      expect.objectContaining({ warnings: ["메모리 95%"] }),
    );
  });

  test("sends geek news separately and marks the item as sent", async () => {
    const send = jest.fn().mockResolvedValue(undefined);
    const scheduler = new PrivateScheduler({
      users: { fetch: jest.fn().mockResolvedValue({ send }) },
    });

    const result = await scheduler.sendGeekNewsDM();

    expect(result).toMatchObject({ status: "success" });
    expect(send).toHaveBeenCalledWith({ embeds: [{ title: "embed" }] });
    expect(mockMarkItemAsSent).toHaveBeenCalledWith(
      expect.objectContaining({ title: "새 긱뉴스" }),
    );
  });

  test("reports partial success when the separate geek news lookup fails", async () => {
    const send = jest.fn().mockResolvedValue(undefined);
    mockFetchFeaturedItemResult.mockResolvedValue({
      status: "fetch-failed",
      item: null,
      reason: "뉴스 조회 실패",
    });
    const scheduler = new PrivateScheduler({
      users: { fetch: jest.fn().mockResolvedValue({ send }) },
    });

    const result = await scheduler.sendGeekNewsDM();

    expect(result).toMatchObject({ status: "partial" });
    expect(mockCreateEmbeds).toHaveBeenCalledWith(null, {
      fallbackDescription: "뉴스 조회 실패",
    });
    expect(mockMarkItemAsSent).not.toHaveBeenCalled();
  });

  test("records the scheduled geek news result in the execution ledger", async () => {
    const send = jest.fn().mockResolvedValue(undefined);
    const scheduler = new PrivateScheduler({
      users: { fetch: jest.fn().mockResolvedValue({ send }) },
    });
    scheduler.start();
    const geekNewsCallback = mockCronSchedule.mock.calls.find(
      ([expression]) => expression === GEEK_NEWS_SCHEDULE.cron,
    )[1];

    await geekNewsCallback();

    expect(mockRecordScheduleRunStart).toHaveBeenCalledWith(
      GEEK_NEWS_SCHEDULE,
    );
    expect(mockRecordScheduleRunCompletion).toHaveBeenCalledWith(
      GEEK_NEWS_SCHEDULE,
      "success",
      expect.any(String),
    );
  });

  test("records the scheduled briefing result in the execution ledger", async () => {
    const send = jest.fn().mockResolvedValue(undefined);
    const scheduler = new PrivateScheduler({
      users: { fetch: jest.fn().mockResolvedValue({ send }) },
    });
    scheduler.start();
    const morningCallback = mockCronSchedule.mock.calls.find(
      ([expression]) => expression === MORNING_BRIEFING_SCHEDULE.cron,
    )[1];

    await morningCallback();

    expect(mockRecordScheduleRunStart).toHaveBeenCalledWith(
      MORNING_BRIEFING_SCHEDULE,
    );
    expect(mockRecordScheduleRunCompletion).toHaveBeenCalledWith(
      MORNING_BRIEFING_SCHEDULE,
      "success",
      expect.any(String),
    );
    expect(mockRecordScheduleRunFailure).not.toHaveBeenCalled();
  });

  test("sends the 22:30 tomorrow forecast separately", async () => {
    const send = jest.fn().mockResolvedValue(undefined);
    const scheduler = new PrivateScheduler({
      users: { fetch: jest.fn().mockResolvedValue({ send }) },
    });

    const result = await scheduler.sendTomorrowWeatherDM();

    expect(result.status).toBe("success");
    expect(send).toHaveBeenCalledWith(
      "🌙 서울 내일 | 구름많음 🌥️ · 강수 30% | 21~29°",
    );
  });

  test("uses the expected schedule definitions", () => {
    expect(GEEK_NEWS_SCHEDULE.cron).toBe("50 7 * * *");
    expect(TOMORROW_WEATHER_SCHEDULE.cron).toBe("30 22 * * *");
  });
});
