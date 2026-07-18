require("ts-node/register/transpile-only");

describe("schedule run store", () => {
  let stored;

  beforeEach(() => {
    stored = { jobs: {} };
    jest.resetModules();
    jest.doMock("../src/utils/file-manager", () => ({
      readJson: jest.fn(() => stored),
      writeJson: jest.fn((filename, data) => {
        stored = data;
        return true;
      }),
    }));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("calculates the next daily run in Asia/Seoul", () => {
    const { MORNING_BRIEFING_SCHEDULE } = require("../src/core/scheduler/schedule-definitions");
    const { getNextScheduleRunAt } = require("../src/utils/schedule-run-store");

    expect(
      getNextScheduleRunAt(
        MORNING_BRIEFING_SCHEDULE,
        new Date("2026-07-17T20:30:00.000Z"),
      ),
    ).toBe("2026-07-17T21:30:00.000Z");
    expect(
      getNextScheduleRunAt(
        MORNING_BRIEFING_SCHEDULE,
        new Date("2026-07-17T21:30:00.000Z"),
      ),
    ).toBe("2026-07-18T21:30:00.000Z");
  });

  test("persists attempts, partial completion and the previous timestamps", () => {
    const { MORNING_BRIEFING_SCHEDULE } = require("../src/core/scheduler/schedule-definitions");
    const {
      getScheduleRunRecords,
      recordScheduleRunCompletion,
      recordScheduleRunStart,
      registerScheduleDefinitions,
    } = require("../src/utils/schedule-run-store");
    const start = new Date("2026-07-17T21:30:00.000Z");
    const completed = new Date("2026-07-17T21:33:00.000Z");

    registerScheduleDefinitions([MORNING_BRIEFING_SCHEDULE], start);
    recordScheduleRunStart(MORNING_BRIEFING_SCHEDULE, start);
    recordScheduleRunCompletion(
      MORNING_BRIEFING_SCHEDULE,
      "partial",
      "긱뉴스 조회 실패",
      completed,
    );

    expect(getScheduleRunRecords()).toEqual([
      expect.objectContaining({
        jobId: "morning-briefing",
        status: "partial",
        lastAttemptAt: start.toISOString(),
        lastCompletedAt: completed.toISOString(),
        lastSuccessAt: completed.toISOString(),
        nextRunAt: "2026-07-18T21:30:00.000Z",
        detail: "긱뉴스 조회 실패",
      }),
    ]);
  });

  test("keeps the last success when a later run fails", () => {
    const { TOMORROW_WEATHER_SCHEDULE } = require("../src/core/scheduler/schedule-definitions");
    const {
      getScheduleRunRecords,
      recordScheduleRunCompletion,
      recordScheduleRunFailure,
      recordScheduleRunStart,
    } = require("../src/utils/schedule-run-store");
    const firstRun = new Date("2026-07-17T13:30:00.000Z");
    const failedRun = new Date("2026-07-18T13:30:00.000Z");

    recordScheduleRunStart(TOMORROW_WEATHER_SCHEDULE, firstRun);
    recordScheduleRunCompletion(
      TOMORROW_WEATHER_SCHEDULE,
      "success",
      "전송 완료",
      firstRun,
    );
    recordScheduleRunStart(TOMORROW_WEATHER_SCHEDULE, failedRun);
    recordScheduleRunFailure(
      TOMORROW_WEATHER_SCHEDULE,
      "날씨 조회 실패",
      failedRun,
    );

    expect(getScheduleRunRecords()[0]).toMatchObject({
      status: "failure",
      lastSuccessAt: firstRun.toISOString(),
      lastFailureAt: failedRun.toISOString(),
      detail: "날씨 조회 실패",
    });
  });

  test("marks an in-progress run as interrupted when the scheduler restarts", () => {
    const { MORNING_BRIEFING_SCHEDULE } = require("../src/core/scheduler/schedule-definitions");
    const {
      getScheduleRunRecords,
      recordScheduleRunStart,
      registerScheduleDefinitions,
    } = require("../src/utils/schedule-run-store");
    const started = new Date("2026-07-17T21:30:00.000Z");
    const restarted = new Date("2026-07-17T21:35:00.000Z");

    recordScheduleRunStart(MORNING_BRIEFING_SCHEDULE, started);
    registerScheduleDefinitions([MORNING_BRIEFING_SCHEDULE], restarted);

    expect(getScheduleRunRecords()[0]).toMatchObject({
      status: "failure",
      lastFailureAt: restarted.toISOString(),
      detail: expect.stringContaining("프로세스 재시작"),
    });
  });
});
