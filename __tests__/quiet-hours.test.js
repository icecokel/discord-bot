const { isQuietHours, getQuietHoursWindow } = require("../src/utils/quiet-hours");
const { sendNotifications, runNotificationBatch } = require("../src/utils/notification-batch");
const queueStore = require("../src/utils/notification-queue-store");
const { loadNotificationQueue, enqueueNotifications, MAX_QUEUE_ENTRIES } = queueStore;

const kst = (hhmm, day = 15) => {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(2026, 10, day, h - 9, m));
};

let userSend, client;
beforeEach(() => {
  delete process.env.NOTIFICATION_QUIET_HOURS;
  userSend = jest.fn().mockResolvedValue({ id: "m", channelId: "dm" });
  client = { users: { fetch: jest.fn().mockResolvedValue({ send: userSend }) } };
});
afterAll(() => { process.env.NOTIFICATION_QUIET_HOURS = "off"; });

const queued = () => loadNotificationQueue().entries;

describe("quiet hours window", () => {
  test.each([
    ["22:59", false], ["23:00", true], ["02:30", true], ["05:59", true], ["06:00", false], ["12:00", false],
  ])("default 23:00~06:00 KST at %s", (time, quiet) => {
    expect(isQuietHours(kst(time))).toBe(quiet);
  });

  test("can be configured or turned off", () => {
    expect(getQuietHoursWindow("off")).toBeNull();
    expect(isQuietHours(kst("02:00"), getQuietHoursWindow("off"))).toBe(false);
    expect(isQuietHours(kst("21:30"), getQuietHoursWindow("21-7"))).toBe(true);
    expect(isQuietHours(kst("13:30"), getQuietHoursWindow("13-14"))).toBe(true);
    const errors = jest.spyOn(console, "error").mockImplementation(() => undefined);
    expect(getQuietHoursWindow("nonsense")).toEqual({ start: 23, end: 6 });
    errors.mockRestore();
  });
});

describe("the queue is held at night", () => {
  test("notifications are queued and acknowledged, but nothing is sent", async () => {
    const onSent = jest.fn();
    await runNotificationBatch(client, [
      (deliver) => deliver("owner", [{ content: "📬 새 Gmail 1건", onSent }, { embeds: [{ title: "임베드" }] }]),
    ], { now: () => kst("01:20") });
    expect(userSend).not.toHaveBeenCalled();
    expect(onSent).toHaveBeenCalledWith(undefined, "📬 새 Gmail 1건");
    expect(queued().map(({ content, embeds, attempts }) => ({ content, embeds, attempts }))).toEqual([
      { content: "📬 새 Gmail 1건", embeds: [], attempts: 0 },
      { content: "", embeds: [{ title: "임베드" }], attempts: 0 },
    ]);
  });

  test("admin-requested results go out immediately, without releasing the held queue", async () => {
    await runNotificationBatch(client, [(deliver) => deliver("owner", [{ content: "밤 알림" }])], { now: () => kst("01:00") });
    await sendNotifications(client, "owner", [{ content: "수동 확인 결과" }], { now: () => kst("01:20"), immediate: true });
    expect(userSend.mock.calls.map(([options]) => options.content)).toEqual(["수동 확인 결과"]);
    expect(queued().map((entry) => entry.content)).toEqual(["밤 알림"]);
  });

  test("direct sources (X) are not held by the queue; they apply quiet hours themselves", async () => {
    await sendNotifications(client, "owner", [{ content: "X", delivery: "direct" }], { now: () => kst("01:20") });
    expect(userSend).toHaveBeenCalledTimes(1);
  });

  test("daytime notifications go out in the same minute", async () => {
    await runNotificationBatch(client, [(deliver) => deliver("owner", [{ content: "낮 알림" }])], { now: () => kst("10:00") });
    expect(userSend.mock.calls[0][0].content).toBe("낮 알림");
    expect(queued()).toEqual([]);
  });
});

describe("06:00 release", () => {
  test("held entries go out oldest first under one header, labelled with their times, with 06:00 schedules", async () => {
    enqueueNotifications([{ ownerId: "o", content: "두 번째", embeds: [] }], kst("03:10"));
    enqueueNotifications([{ ownerId: "o", content: "첫 번째", embeds: [] }], kst("23:40", 14));
    await runNotificationBatch(client, [], { now: () => kst("05:59") });
    expect(userSend).not.toHaveBeenCalled();

    await runNotificationBatch(client, [(deliver) => deliver("o", [{ content: "🌤️ 오늘 날씨" }])], { now: () => kst("06:00") });
    expect(userSend).toHaveBeenCalledTimes(1);
    expect(userSend.mock.calls[0][0].content).toBe(
      "🌙 야간(23:00~06:00)에 쌓인 알림 2건\n\n🕐 23:40\n첫 번째\n\n🕐 03:10\n두 번째\n\n🌤️ 오늘 날씨",
    );
    expect(queued()).toEqual([]);
  });

  test("a long night is split under the Discord limit", async () => {
    for (let hour = 0; hour < 5; hour += 1) {
      enqueueNotifications([{ ownerId: "o", content: "가".repeat(1_800), embeds: [] }], kst(`0${hour}:00`));
    }
    await runNotificationBatch(client, [], { now: () => kst("06:00") });
    expect(userSend).toHaveBeenCalledTimes(5);
    expect(userSend.mock.calls.every(([options]) => options.content.length <= 2_000)).toBe(true);
  });

  test("a failed morning DM keeps the entries and retries after the backoff", async () => {
    enqueueNotifications([{ ownerId: "o", content: "보류", embeds: [] }], kst("04:00"));
    userSend.mockRejectedValueOnce(new Error("DM closed"));
    await runNotificationBatch(client, [], { now: () => kst("06:00") });
    expect(queued()).toEqual([expect.objectContaining({ attempts: 1, lastError: "DM closed" })]);
    await runNotificationBatch(client, [], { now: () => kst("06:01") });
    expect(queued()).toEqual([]);
    expect(userSend).toHaveBeenCalledTimes(2);
  });

  test("an immediate entry that failed at night is retried at night", async () => {
    userSend.mockRejectedValueOnce(new Error("DM closed"));
    await sendNotifications(client, "o", [{ content: "수동" }], { now: () => kst("01:00"), immediate: true });
    await runNotificationBatch(client, [], { now: () => kst("01:01") });
    expect(userSend).toHaveBeenCalledTimes(2);
    expect(queued()).toEqual([]);
  });
});

describe("queue limits and persistence", () => {
  test("drops the oldest entries beyond the cap or older than 3 days", () => {
    const errors = jest.spyOn(console, "error").mockImplementation(() => undefined);
    enqueueNotifications([{ ownerId: "o", content: "아주 오래됨", embeds: [] }], new Date("2026-11-01T00:00:00Z"));
    enqueueNotifications(Array.from({ length: MAX_QUEUE_ENTRIES + 5 }, (_, i) => ({ ownerId: "o", content: `${i}`, embeds: [] })),
      new Date("2026-11-15T00:00:00Z"));
    const state = loadNotificationQueue();
    expect(state.entries).toHaveLength(MAX_QUEUE_ENTRIES);
    expect(state.entries[0].content).toBe("5");
    expect(state.droppedCount).toBe(6);
    errors.mockRestore();
  });

  test("the queue file survives a restart", () => {
    jest.isolateModules(() => {
      let file;
      jest.doMock("../src/utils/file-manager", () => ({
        readJson: jest.fn((name, fallback) => (file === undefined ? fallback : structuredClone(file))),
        writeJson: jest.fn((name, data) => { file = structuredClone(data); return true; }),
      }));
      process.env.NOTIFICATION_QUEUE_PERSIST = "true";
      try {
        const store = require("../src/utils/notification-queue-store");
        store.enqueueNotifications([{ ownerId: "o", content: "밤 GitHub 실패", embeds: [] }], kst("02:00"));
        jest.resetModules();
        jest.doMock("../src/utils/file-manager", () => ({
          readJson: jest.fn((name, fallback) => (file === undefined ? fallback : structuredClone(file))),
          writeJson: jest.fn((name, data) => { file = structuredClone(data); return true; }),
        }));
        const reloaded = require("../src/utils/notification-queue-store");
        expect(reloaded.loadNotificationQueue().entries.map((entry) => entry.content)).toEqual(["밤 GitHub 실패"]);
      } finally {
        delete process.env.NOTIFICATION_QUEUE_PERSIST;
      }
    });
  });

  test("a notification that cannot be queued is a failed send, so the source retries", async () => {
    // Spy on the instance notification-batch uses (the restart test reloads its own copies).
    const spy = jest.spyOn(queueStore, "enqueueNotifications").mockImplementation(() => { throw new Error("알림 큐 저장에 실패했습니다."); });
    const onSent = jest.fn();
    try {
      await expect(sendNotifications(client, "o", [{ content: "a", onSent }])).rejects.toThrow("알림 큐 저장");
      expect(onSent).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
