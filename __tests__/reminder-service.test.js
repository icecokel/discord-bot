require("ts-node/register/transpile-only");

const { reminderService } = require("../src/features/tools/reminder-service");

const baseReminder = {
  id: "owner-1",
  shortId: "a1b2",
  userId: "owner",
  channelId: "channel-1",
  targetTime: Date.now() + 60_000,
  message: "test reminder",
  createdAt: Date.now(),
};

describe("Reminder delete permission", () => {
  beforeEach(() => {
    if (reminderService.checkTimeout) {
      clearTimeout(reminderService.checkTimeout);
      reminderService.checkTimeout = null;
    }
    reminderService.reminders = [];
    reminderService.saveReminders = jest.fn();
  });

  test("owner can remove own reminder", () => {
    reminderService.reminders = [{ ...baseReminder }];

    const result = reminderService.removeReminderByShortId("a1b2", "owner", {
      isAdmin: false,
    });

    expect(result.ok).toBe(true);
    expect(reminderService.reminders).toHaveLength(0);
  });

  test("non-owner cannot remove reminder", () => {
    reminderService.reminders = [{ ...baseReminder }];

    const result = reminderService.removeReminderByShortId("a1b2", "other", {
      isAdmin: false,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("FORBIDDEN");
    expect(reminderService.reminders).toHaveLength(1);
  });

  test("admin can remove another user's reminder", () => {
    reminderService.reminders = [{ ...baseReminder }];

    const result = reminderService.removeReminderByShortId("a1b2", "admin", {
      isAdmin: true,
    });

    expect(result.ok).toBe(true);
    expect(reminderService.reminders).toHaveLength(0);
  });

  test("owner can remove all own reminders in current channel", () => {
    reminderService.reminders = [
      { ...baseReminder, id: "owner-1", shortId: "a1b2", channelId: "channel-1" },
      { ...baseReminder, id: "owner-2", shortId: "c3d4", channelId: "channel-1" },
      { ...baseReminder, id: "owner-3", shortId: "e5f6", channelId: "channel-2" },
      { ...baseReminder, id: "other-1", shortId: "g7h8", userId: "other", channelId: "channel-1" },
    ];

    const result = reminderService.removeAllRemindersByUser("owner", {
      channelId: "channel-1",
    });

    expect(result.removedCount).toBe(2);
    expect(reminderService.reminders).toHaveLength(2);
    expect(reminderService.reminders.every((r) => r.shortId !== "a1b2")).toBe(
      true,
    );
    expect(reminderService.reminders.every((r) => r.shortId !== "c3d4")).toBe(
      true,
    );
  });

  test("remove all by user returns zero when no reminders exist", () => {
    reminderService.reminders = [{ ...baseReminder, userId: "other" }];

    const result = reminderService.removeAllRemindersByUser("owner", {
      channelId: "channel-1",
    });

    expect(result.removedCount).toBe(0);
    expect(reminderService.reminders).toHaveLength(1);
  });
});

describe("Reminder time parser", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test("absolute date-time should not be parsed as relative minutes", () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 1, 15, 23, 23, 0, 0));

    const target = reminderService.parseTargetTime("2월19일9시15분");
    const parsed = new Date(target);

    expect(target).not.toBeNull();
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(1);
    expect(parsed.getDate()).toBe(19);
    expect(parsed.getHours()).toBe(9);
    expect(parsed.getMinutes()).toBe(15);
  });

  test("relative minutes should still work", () => {
    jest.useFakeTimers();
    const now = new Date(2026, 1, 15, 10, 0, 0, 0);
    jest.setSystemTime(now);

    const target = reminderService.parseTargetTime("15분");
    expect(target).toBe(now.getTime() + 15 * 60 * 1000);
  });
});
