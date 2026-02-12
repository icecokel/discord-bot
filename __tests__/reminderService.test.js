require("ts-node/register/transpile-only");

const { reminderService } = require("../src/features/tools/reminderService");

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
});
