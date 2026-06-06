const mockCronSchedule = jest.fn();
const mockFetchFeaturedItemResult = jest.fn();
const mockCreateEmbeds = jest.fn();
const mockMarkItemAsSent = jest.fn();

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

const {
  filterOwnerNotificationUsers,
  PrivateScheduler,
} = require("../src/core/scheduler/private-scheduler");

describe("private scheduler owner-only filtering", () => {
  test("keeps only the admin notification target", () => {
    const users = [
      { userId: "admin-id", region: "서울" },
      { userId: "other-id", region: "부산" },
    ];

    expect(filterOwnerNotificationUsers(users, "admin-id")).toEqual([
      { userId: "admin-id", region: "서울" },
    ]);
  });

  test("keeps no notification targets when admin id is missing", () => {
    expect(
      filterOwnerNotificationUsers([{ userId: "admin-id", region: "서울" }]),
    ).toEqual([]);
  });
});

describe("private scheduler geek news DM", () => {
  const originalAdminId = process.env.ADMIN_ID;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ADMIN_ID = "admin-id";
  });

  afterAll(() => {
    process.env.ADMIN_ID = originalAdminId;
  });

  test("registers daily geek news DM schedule", () => {
    const scheduler = new PrivateScheduler({ users: { fetch: jest.fn() } });

    scheduler.start();

    expect(mockCronSchedule).toHaveBeenCalledWith(
      "0 8 * * *",
      expect.any(Function),
      { timezone: "Asia/Seoul" },
    );
  });

  test("sends scheduled geek news to the admin DM", async () => {
    const send = jest.fn().mockResolvedValue(undefined);
    const item = { title: "새 긱뉴스", link: "https://news.hada.io/topic?id=1" };
    const embeds = [{ title: "embed" }];
    mockFetchFeaturedItemResult.mockResolvedValue({
      status: "ok",
      item,
      reason: undefined,
    });
    mockCreateEmbeds.mockReturnValue(embeds);

    const scheduler = new PrivateScheduler({
      users: {
        fetch: jest.fn().mockResolvedValue({ tag: "admin#0001", send }),
      },
    });

    await scheduler.sendGeekNewsDM();

    expect(send).toHaveBeenCalledWith({ embeds });
    expect(mockCreateEmbeds).toHaveBeenCalledWith(item);
    expect(mockMarkItemAsSent).toHaveBeenCalledWith(item);
  });
});
