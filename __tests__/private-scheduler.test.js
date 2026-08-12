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
const mockCheckForNewJobPostings = jest.fn();
const mockMarkJobPostingsAsNotified = jest.fn();
const mockBuildJobPostingNotificationChunks = jest.fn();
const mockGetUserRegion = jest.fn();

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

jest.mock("../src/utils/user-store", () => ({
  getUserRegion: mockGetUserRegion,
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

jest.mock("../src/features/job-monitor/job-monitor-service", () => ({
  checkForNewJobPostings: mockCheckForNewJobPostings,
  markJobPostingsAsNotified: mockMarkJobPostingsAsNotified,
}));

jest.mock("../src/features/job-monitor/job-notification-message", () => ({
  buildJobPostingNotificationChunks: mockBuildJobPostingNotificationChunks,
}));

const {
  GEEK_NEWS_SCHEDULE,
  JOB_POSTINGS_SCHEDULE,
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
  const originalWeatherAdminRegion = process.env.WEATHER_ADMIN_REGION;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ADMIN_ID = "admin-id";
    delete process.env.WEATHER_ADMIN_REGION;
    mockGetUserRegion.mockReturnValue(null);
    mockRegisterScheduleDefinitions.mockReturnValue(true);
    mockRecordScheduleRunStart.mockReturnValue(true);
    mockRecordScheduleRunCompletion.mockReturnValue(true);
    mockRecordScheduleRunFailure.mockReturnValue(true);
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
    mockCheckForNewJobPostings.mockResolvedValue({
      newPostings: [],
      initializedCompanies: [],
      successfulCompanyCount: 5,
      totalPostingCount: 100,
      failures: [],
    });
    mockBuildJobPostingNotificationChunks.mockReturnValue([]);
  });

  afterAll(() => {
    if (originalAdminId === undefined) {
      delete process.env.ADMIN_ID;
    } else {
      process.env.ADMIN_ID = originalAdminId;
    }
    if (originalWeatherAdminRegion === undefined) {
      delete process.env.WEATHER_ADMIN_REGION;
    } else {
      process.env.WEATHER_ADMIN_REGION = originalWeatherAdminRegion;
    }
  });

  test("registers daily notifications and the six-hour job monitor", () => {
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
    expect(mockCronSchedule).toHaveBeenCalledWith(
      "0 7,13,19 * * *",
      expect.any(Function),
      { timezone: "Asia/Seoul" },
    );
  });

  test("registers jobs even when the execution ledger cannot initialize", () => {
    mockRegisterScheduleDefinitions.mockReturnValue(false);
    const consoleError = jest.spyOn(console, "error").mockImplementation();
    const scheduler = new PrivateScheduler({ users: { fetch: jest.fn() } });

    expect(() => scheduler.start()).not.toThrow();
    expect(mockCronSchedule).toHaveBeenCalledTimes(4);
    expect(consoleError).toHaveBeenCalledWith(
      "[PrivateScheduler] 스케줄 실행 원장 초기화에 실패했습니다.",
    );
    consoleError.mockRestore();
  });

  test("registers jobs when execution ledger initialization throws", () => {
    mockRegisterScheduleDefinitions.mockImplementation(() => {
      throw new Error("corrupt ledger");
    });
    const consoleError = jest.spyOn(console, "error").mockImplementation();
    const scheduler = new PrivateScheduler({ users: { fetch: jest.fn() } });

    expect(() => scheduler.start()).not.toThrow();
    expect(mockCronSchedule).toHaveBeenCalledTimes(4);
    expect(consoleError).toHaveBeenCalledWith(
      "[PrivateScheduler] 스케줄 실행 원장 초기화에 실패했습니다.",
    );
    consoleError.mockRestore();
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

  test("reports failure when sent geek news history cannot be saved", async () => {
    const send = jest.fn().mockResolvedValue(undefined);
    mockMarkItemAsSent.mockImplementationOnce(() => {
      throw new Error("긱뉴스 이력 저장에 실패했습니다.");
    });
    const scheduler = new PrivateScheduler({
      users: { fetch: jest.fn().mockResolvedValue({ send }) },
    });

    await expect(scheduler.sendGeekNewsDM()).resolves.toMatchObject({
      status: "failure",
      detail: expect.stringContaining("긱뉴스 이력 저장에 실패했습니다."),
    });
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

  test("runs a job when its start cannot be recorded", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation();
    const scheduler = new PrivateScheduler({
      users: {
        fetch: jest.fn().mockResolvedValue({ send: jest.fn() }),
      },
    });
    scheduler.start();
    mockRecordScheduleRunStart.mockReturnValue(false);
    const geekNewsCallback = mockCronSchedule.mock.calls.find(
      ([expression]) => expression === GEEK_NEWS_SCHEDULE.cron,
    )[1];

    await geekNewsCallback();

    expect(mockFetchFeaturedItemResult).toHaveBeenCalled();
    expect(mockRecordScheduleRunCompletion).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  test("logs when job completion cannot be recorded", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation();
    const send = jest.fn().mockResolvedValue(undefined);
    const scheduler = new PrivateScheduler({
      users: { fetch: jest.fn().mockResolvedValue({ send }) },
    });
    scheduler.start();
    mockRecordScheduleRunCompletion.mockReturnValue(false);
    const geekNewsCallback = mockCronSchedule.mock.calls.find(
      ([expression]) => expression === GEEK_NEWS_SCHEDULE.cron,
    )[1];

    await geekNewsCallback();

    expect(mockRecordScheduleRunFailure).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(
      "[PrivateScheduler] 긱뉴스 완료 기록 저장 실패",
    );
    consoleError.mockRestore();
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

  test("uses the admin saved region without notification opt-in", async () => {
    const send = jest.fn().mockResolvedValue(undefined);
    mockGetUserRegion.mockReturnValue("안양");
    const scheduler = new PrivateScheduler({
      users: { fetch: jest.fn().mockResolvedValue({ send }) },
    });

    const result = await scheduler.sendTomorrowWeatherDM();

    expect(result.status).toBe("success");
    expect(mockGetShortTermForecast).toHaveBeenCalledWith(60, 123);
    expect(send).toHaveBeenCalledWith(expect.stringContaining("안양 내일"));
  });

  test("does not use an unrelated substring match for an unknown region", async () => {
    const fetch = jest.fn();
    mockGetUserRegion.mockReturnValue("토당동");
    const scheduler = new PrivateScheduler({ users: { fetch } });

    const result = await scheduler.sendTomorrowWeatherDM();

    expect(result).toMatchObject({
      status: "failure",
      detail: expect.stringContaining("좌표 없음"),
    });
    expect(mockGetShortTermForecast).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  test("keeps the first job crawl as a baseline without sending a DM", async () => {
    const fetch = jest.fn();
    mockCheckForNewJobPostings.mockResolvedValue({
      newPostings: [],
      initializedCompanies: ["네이버", "카카오", "토스", "당근", "우아한형제들"],
      successfulCompanyCount: 5,
      totalPostingCount: 120,
      failures: [],
    });
    const scheduler = new PrivateScheduler({ users: { fetch } });

    const result = await scheduler.sendJobPostingNotifications();

    expect(result).toMatchObject({
      status: "success",
      detail: expect.stringContaining("기준선 생성"),
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(mockMarkJobPostingsAsNotified).not.toHaveBeenCalled();
  });

  test("sends new job postings to the admin and marks them as notified", async () => {
    const posting = {
      id: "P-1",
      companyId: "kakao",
      companyName: "카카오",
      title: "Backend Engineer",
      url: "https://careers.kakao.com/jobs/P-1",
    };
    const send = jest.fn().mockResolvedValue(undefined);
    mockCheckForNewJobPostings.mockResolvedValue({
      newPostings: [posting],
      initializedCompanies: [],
      successfulCompanyCount: 5,
      totalPostingCount: 121,
      failures: [],
    });
    mockBuildJobPostingNotificationChunks.mockReturnValue([
      {
        content: `💼 새 채용공고 1건\n• [Backend Engineer](<${posting.url}>)`,
        postings: [posting],
      },
    ]);
    const scheduler = new PrivateScheduler({
      users: { fetch: jest.fn().mockResolvedValue({ send }) },
    });

    const result = await scheduler.sendJobPostingNotifications();

    expect(result).toMatchObject({ status: "success" });
    expect(send).toHaveBeenCalledWith({
      content: expect.stringContaining(`<${posting.url}>`),
    });
    expect(mockMarkJobPostingsAsNotified).toHaveBeenCalledWith([posting]);
  });

  test("does not mark a job as notified when the DM fails", async () => {
    const posting = {
      id: "P-2",
      companyId: "kakao",
      companyName: "카카오",
      title: "Frontend Engineer",
      url: "https://careers.kakao.com/jobs/P-2",
    };
    mockCheckForNewJobPostings.mockResolvedValue({
      newPostings: [posting],
      initializedCompanies: [],
      successfulCompanyCount: 5,
      totalPostingCount: 121,
      failures: [],
    });
    mockBuildJobPostingNotificationChunks.mockReturnValue([
      { content: `공고 (<${posting.url}>)`, postings: [posting] },
    ]);
    const scheduler = new PrivateScheduler({
      users: {
        fetch: jest.fn().mockResolvedValue({
          send: jest.fn().mockRejectedValue(new Error("DM blocked")),
        }),
      },
    });

    const result = await scheduler.sendJobPostingNotifications();

    expect(result).toMatchObject({ status: "failure" });
    expect(mockMarkJobPostingsAsNotified).not.toHaveBeenCalled();
  });

  test("marks only postings from chunks sent before a later DM failure", async () => {
    const first = {
      id: "P-3",
      companyId: "kakao",
      companyName: "카카오",
      title: "Backend Engineer",
      url: "https://careers.kakao.com/jobs/P-3",
    };
    const second = {
      ...first,
      id: "P-4",
      title: "Frontend Engineer",
      url: "https://careers.kakao.com/jobs/P-4",
    };
    mockCheckForNewJobPostings.mockResolvedValue({
      newPostings: [first, second],
      initializedCompanies: [],
      successfulCompanyCount: 5,
      totalPostingCount: 122,
      failures: [],
    });
    mockBuildJobPostingNotificationChunks.mockReturnValue([
      { content: `첫 메시지 (<${first.url}>)`, postings: [first] },
      { content: `두 번째 메시지 (<${second.url}>)`, postings: [second] },
    ]);
    const send = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("DM blocked"));
    const scheduler = new PrivateScheduler({
      users: { fetch: jest.fn().mockResolvedValue({ send }) },
    });

    const result = await scheduler.sendJobPostingNotifications();

    expect(result.status).toBe("failure");
    expect(mockMarkJobPostingsAsNotified).toHaveBeenCalledTimes(1);
    expect(mockMarkJobPostingsAsNotified).toHaveBeenCalledWith([first]);
  });

  test("records the scheduled job monitor result in the execution ledger", async () => {
    const scheduler = new PrivateScheduler({
      users: { fetch: jest.fn() },
    });
    scheduler.start();
    const jobCallback = mockCronSchedule.mock.calls.find(
      ([expression]) => expression === JOB_POSTINGS_SCHEDULE.cron,
    )[1];

    await jobCallback();

    expect(mockRecordScheduleRunStart).toHaveBeenCalledWith(
      JOB_POSTINGS_SCHEDULE,
    );
    expect(mockRecordScheduleRunCompletion).toHaveBeenCalledWith(
      JOB_POSTINGS_SCHEDULE,
      "success",
      expect.any(String),
    );
  });

  test("uses the expected schedule definitions", () => {
    expect(GEEK_NEWS_SCHEDULE.cron).toBe("50 7 * * *");
    expect(TOMORROW_WEATHER_SCHEDULE.cron).toBe("30 22 * * *");
    expect(JOB_POSTINGS_SCHEDULE.cron).toBe("0 7,13,19 * * *");
  });
});
