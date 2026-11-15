// The notification queue lives in memory under Jest (see notification-queue-store.ts);
// start every test with an empty queue. Cleared via the global so no module is pre-loaded.
beforeEach(() => {
  delete globalThis.__discordBotNotificationQueue;
});
