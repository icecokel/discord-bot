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
