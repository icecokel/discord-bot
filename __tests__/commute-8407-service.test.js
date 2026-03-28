require("ts-node/register/transpile-only");

const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  Commute8407Service,
  buildHistoricalScheduleTimes,
  findNextHistoricalArrival,
  pruneExpiredCommuteEvents,
} = require("../src/features/tools/commute-8407-service");

const createRoute = () => ({
  id: 20000876,
  name: "8407",
  displayName: "8407",
  firstTimeAtStartPoint: "04:30",
  lastTimeAtStartPoint: "22:00",
  firstTimeAtEndPoint: "06:00",
  lastTimeAtEndPoint: "23:40",
  intervalList: [
    { dayType: "WEEKDAYS", intervalTime: "20-40분" },
    { dayType: "SATURDAY", intervalTime: "30-60분" },
    { dayType: "SUNDAY", intervalTime: "30-60분" },
  ],
  busStopGraph: [{ id: 159407, name: "대동문고.댕리단길" }],
});

const createArrivalResponse = (items) => ({
  updatedAt: "2026-03-30T08:00:00+09:00",
  busArrivalItems: items,
  arriveSoonBusRouteIds: [],
});

describe("Commute8407Service helpers", () => {
  test("buildHistoricalScheduleTimes groups realtime events into 5-minute slots", () => {
    const events = [
      {
        observedAt: new Date("2026-03-23T08:03:00+09:00").getTime(),
        serviceDate: "2026-03-23",
        dayType: "weekday",
        source: "realtime",
        nextArrivalAt: new Date("2026-03-23T08:17:00+09:00").getTime(),
      },
      {
        observedAt: new Date("2026-03-24T08:06:00+09:00").getTime(),
        serviceDate: "2026-03-24",
        dayType: "weekday",
        source: "realtime",
        nextArrivalAt: new Date("2026-03-24T08:18:00+09:00").getTime(),
      },
      {
        observedAt: new Date("2026-03-24T09:00:00+09:00").getTime(),
        serviceDate: "2026-03-24",
        dayType: "weekday",
        source: "fallback-cache",
        nextArrivalAt: new Date("2026-03-24T09:05:00+09:00").getTime(),
      },
    ];

    expect(buildHistoricalScheduleTimes(events, "weekday")).toEqual(["08:15"]);
  });

  test("findNextHistoricalArrival chooses the next time for today", () => {
    const now = new Date("2026-03-30T08:10:00+09:00").getTime();
    const nextArrival = findNextHistoricalArrival(
      ["07:55", "08:15", "09:00"],
      "2026-03-30",
      now,
    );

    expect(nextArrival).toBe(new Date("2026-03-30T08:15:00+09:00").getTime());
  });

  test("pruneExpiredCommuteEvents drops data older than 90 days", () => {
    const now = new Date("2026-03-30T08:00:00+09:00").getTime();
    const events = [
      {
        observedAt: new Date("2025-11-01T08:00:00+09:00").getTime(),
        serviceDate: "2025-11-01",
        dayType: "weekday",
        source: "realtime",
      },
      {
        observedAt: new Date("2026-03-20T08:00:00+09:00").getTime(),
        serviceDate: "2026-03-20",
        dayType: "weekday",
        source: "realtime",
      },
    ];

    expect(pruneExpiredCommuteEvents(events, now)).toHaveLength(1);
  });
});

describe("Commute8407Service", () => {
  let tempDir;
  let now;
  let busApi;
  let service;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "commute-8407-"));
    now = new Date("2026-03-30T08:00:00+09:00").getTime();
    busApi = {
      getRoute: jest.fn().mockResolvedValue(createRoute()),
      getStopArrivals: jest.fn(),
    };
    service = new Commute8407Service({
      dataDir: tempDir,
      busApi,
      now: () => now,
    });
  });

  afterEach(() => {
    if (service.timer) {
      clearInterval(service.timer);
      service.timer = null;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test("getSnapshot prefers realtime arrival over historical schedule", async () => {
    fs.writeFileSync(
      path.join(tempDir, "commute-8407-events.jsonl"),
      `${JSON.stringify({
        observedAt: new Date("2026-03-23T08:01:00+09:00").getTime(),
        serviceDate: "2026-03-23",
        dayType: "weekday",
        source: "realtime",
        nextArrivalAt: new Date("2026-03-23T08:20:00+09:00").getTime(),
      })}\n`,
      "utf8",
    );

    busApi.getStopArrivals.mockResolvedValue(
      createArrivalResponse([
        {
          busRouteId: 20000876,
          remainingStops: 2,
          estimatedTimeLeft: 480,
          remainSeat: 44,
          waitingForTurnaround: false,
          waitingInGarage: false,
          busServiceStatus: "RUNNING",
        },
      ]),
    );

    const snapshot = await service.getSnapshot();

    expect(snapshot.predictionSource).toBe("realtime");
    expect(snapshot.targetArrivalAt).toBe(
      new Date("2026-03-30T08:08:00+09:00").getTime(),
    );
    expect(snapshot.historicalScheduleTimes).toEqual(["08:20"]);

    const eventLog = fs.readFileSync(
      path.join(tempDir, "commute-8407-events.jsonl"),
      "utf8",
    );
    expect(eventLog).toContain(`"source":"realtime"`);
  });

  test("getSnapshot falls back to accumulated historical schedule when realtime is absent", async () => {
    fs.writeFileSync(
      path.join(tempDir, "commute-8407-events.jsonl"),
      [
        {
          observedAt: new Date("2026-03-23T08:01:00+09:00").getTime(),
          serviceDate: "2026-03-23",
          dayType: "weekday",
          source: "realtime",
          nextArrivalAt: new Date("2026-03-23T08:15:00+09:00").getTime(),
        },
        {
          observedAt: new Date("2026-03-24T08:04:00+09:00").getTime(),
          serviceDate: "2026-03-24",
          dayType: "weekday",
          source: "realtime",
          nextArrivalAt: new Date("2026-03-24T08:14:00+09:00").getTime(),
        },
      ]
        .map((item) => JSON.stringify(item))
        .join("\n")
        .concat("\n"),
      "utf8",
    );

    busApi.getStopArrivals.mockResolvedValue(createArrivalResponse([]));

    const snapshot = await service.getSnapshot();

    expect(snapshot.predictionSource).toBe("historical");
    expect(snapshot.targetArrivalAt).toBe(
      new Date("2026-03-30T08:15:00+09:00").getTime(),
    );
    expect(snapshot.note).toContain("누적된 정류장 기록");
  });

  test("getSnapshot keeps cached route info when naver refresh fails", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    fs.writeFileSync(
      path.join(tempDir, "commute-8407-cache.json"),
      JSON.stringify({
        fetchedAt: new Date("2026-03-29T01:00:00+09:00").getTime(),
        routeId: 20000876,
        routeName: "8407",
        stationId: 159407,
        stationName: "대동문고.댕리단길",
        firstTimeAtStartPoint: "04:30",
        lastTimeAtStartPoint: "22:00",
        intervals: [{ dayType: "weekday", intervalText: "20-40분" }],
      }),
      "utf8",
    );

    service.routeCache = JSON.parse(
      fs.readFileSync(path.join(tempDir, "commute-8407-cache.json"), "utf8"),
    );

    fs.writeFileSync(
      path.join(tempDir, "commute-8407-events.jsonl"),
      `${JSON.stringify({
        observedAt: new Date("2026-03-24T08:05:00+09:00").getTime(),
        serviceDate: "2026-03-24",
        dayType: "weekday",
        source: "realtime",
        nextArrivalAt: new Date("2026-03-24T08:25:00+09:00").getTime(),
      })}\n`,
      "utf8",
    );

    busApi.getRoute.mockRejectedValue(new Error("naver unavailable"));
    busApi.getStopArrivals.mockResolvedValue(createArrivalResponse([]));

    const snapshot = await service.getSnapshot();

    expect(snapshot.routeCache).not.toBeNull();
    expect(snapshot.routeCache.routeName).toBe("8407");
    expect(snapshot.predictionSource).toBe("historical");

    consoleSpy.mockRestore();
  });

  test("sendDueAlerts only sends once for the same arrival window", async () => {
    const send = jest.fn().mockResolvedValue(undefined);
    service.client = {
      users: {
        fetch: jest.fn().mockResolvedValue({ send }),
      },
    };

    service.enableAlert("user-1");

    const snapshot = {
      observedAt: now,
      serviceDate: "2026-03-30",
      dayType: "weekday",
      routeCache: null,
      realtimeArrival: {
        remainingStops: 2,
        estimatedTimeLeftSeconds: 600,
        remainSeat: 44,
        predictMinutes: 10,
      },
      historicalScheduleTimes: [],
      nextHistoricalArrivalAt: null,
      targetArrivalAt: now + 10 * 60 * 1000,
      predictionSource: "realtime",
      note: "실시간 도착 정보 우선 사용",
    };

    await service.sendDueAlerts(snapshot);
    await service.sendDueAlerts({
      ...snapshot,
      observedAt: now + 60_000,
      targetArrivalAt: now + 9 * 60 * 1000,
    });

    expect(send).toHaveBeenCalledTimes(1);
  });
});
