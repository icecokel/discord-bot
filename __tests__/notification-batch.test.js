const { MessageFlags, EmbedBuilder } = require("discord.js");
const { runNotificationBatch, sendNotifications } = require("../src/utils/notification-batch");
const { loadNotificationQueue } = require("../src/utils/notification-queue-store");

let send, client;
beforeEach(() => {
  send = jest.fn().mockResolvedValue({ id: "456", channelId: "789" });
  client = { users: { fetch: jest.fn().mockResolvedValue({ send }) } };
});

const queued = () => loadNotificationQueue().entries;

test("waits for every task, then dispatches the minute's queue in task order", async () => {
  let release;
  const slow = new Promise(resolve => { release = resolve; });
  const acknowledged = jest.fn();
  const running = runNotificationBatch(client, [
    async deliver => { await slow; await deliver("admin", [{ content: "날씨", onSent: acknowledged }]); },
    deliver => deliver("admin", [{ content: "티보", onSent: acknowledged }]),
  ]);
  await Promise.resolve();
  expect(send).not.toHaveBeenCalled();
  // Queued is durable, so the faster source is acknowledged before any DM goes out.
  expect(acknowledged).toHaveBeenCalledWith(undefined, "티보");
  release();
  await running;
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0][0]).toEqual({ content: "날씨\n\n티보", allowedMentions: { parse: [] } });
  expect(acknowledged).toHaveBeenCalledTimes(2);
  expect(queued()).toEqual([]);
});

test("a failed or empty producer does not block another notification", async () => {
  const log = jest.spyOn(console, "error").mockImplementation(() => {});
  try {
    await runNotificationBatch(client, [
      async () => { throw new Error("X unavailable"); },
      async () => {},
      deliver => deliver("admin", [{ content: "날씨" }]),
    ]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].content).toBe("날씨");
    expect(log).toHaveBeenCalled();
  } finally { log.mockRestore(); }
});

test("packs in order and makes overflow messages silent", async () => {
  await runNotificationBatch(client, [
    deliver => deliver("admin", [{ content: "날씨".repeat(200) }]),
    deliver => deliver("admin", [{ content: "a".repeat(1800) }, { content: "티보 끝" }]),
  ]);
  expect(send.mock.calls.map(([message]) => message.content)).toEqual([
    "날씨".repeat(200), `${"a".repeat(1800)}\n\n티보 끝`,
  ]);
  expect(send.mock.calls[0][0].flags).toBeUndefined();
  expect(send.mock.calls[1][0].flags).toBe(MessageFlags.SuppressNotifications);
});

test("keeps recipients separate and does not silence the first message for a different owner", async () => {
  await runNotificationBatch(client, [
    deliver => deliver("first", [{ content: "A" }]),
    deliver => deliver("second", [{ content: "B" }]),
  ]);
  expect(client.users.fetch.mock.calls).toEqual([["first"], ["second"]]);
  expect(send.mock.calls.every(([message]) => message.flags === undefined)).toBe(true);
});

test("merges embeds with text while respecting Discord embed count and text limits", async () => {
  const embeds = Array.from({ length: 10 }, () => new EmbedBuilder().setTitle("뉴스"));
  await runNotificationBatch(client, [
    deliver => deliver("admin", [{ content: "날씨" }]),
    deliver => deliver("admin", [{ embeds }]),
    deliver => deliver("admin", [{ embeds: [new EmbedBuilder().setTitle("추가")] }]),
  ]);
  expect(send).toHaveBeenCalledTimes(2);
  expect(send.mock.calls[0][0]).toMatchObject({ content: "날씨", embeds: embeds.map((embed) => embed.toJSON()) });
  send.mockClear();
  await runNotificationBatch(client, [
    deliver => deliver("admin", [{ embeds: [{ description: "a".repeat(4000) }] }]),
    deliver => deliver("admin", [{ embeds: [{ description: "b".repeat(3000) }] }]),
  ]);
  expect(send).toHaveBeenCalledTimes(2);
});

test("a failed DM keeps every undelivered entry queued with backoff, in order", async () => {
  send.mockRejectedValue(new Error("DM blocked"));
  const acknowledge = jest.fn();
  await runNotificationBatch(client, ["날씨", "티보"].map(content => deliver =>
    deliver("admin", [{ content, onSent: acknowledge }])), { now: () => new Date("2026-11-15T03:00:00Z") });
  expect(acknowledge).toHaveBeenCalledTimes(2);
  expect(queued().map(({ content, attempts, nextAttemptAt }) => ({ content, attempts, nextAttemptAt }))).toEqual([
    { content: "날씨", attempts: 1, nextAttemptAt: "2026-11-15T03:01:00.000Z" },
    { content: "티보", attempts: 1, nextAttemptAt: "2026-11-15T03:01:00.000Z" },
  ]);

  send.mockResolvedValue({ id: "1", channelId: "dm" });
  await runNotificationBatch(client, [], { now: () => new Date("2026-11-15T03:01:00Z") });
  // A short retry needs no time label (that starts after 5 minutes of waiting).
  expect(send.mock.calls.at(-1)[0].content).toBe("날씨\n\n티보");
  expect(queued()).toEqual([]);
});

test("a failed acknowledgement fails that source but its entries are already queued", async () => {
  const failed = jest.fn();
  const other = jest.fn();
  await runNotificationBatch(client, [
    async deliver => {
      try {
        await deliver("admin", [{ content: "긱뉴스", onSent: () => { throw new Error("disk full"); } }]);
      } catch (error) { failed(error.message); }
    },
    deliver => deliver("admin", [{ content: "티보", onSent: other }]),
  ]);
  expect(failed).toHaveBeenCalledWith("disk full");
  expect(other).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0][0].content).toBe("긱뉴스\n\n티보");
});

test("rejects oversized messages before queueing anything", async () => {
  const acknowledge = jest.fn();
  await expect(sendNotifications(client, "admin", [
    { content: "ok", onSent: acknowledge }, { content: "x".repeat(2_001) },
  ])).rejects.toThrow("길이 제한");
  expect(acknowledge).not.toHaveBeenCalled();
  expect(queued()).toEqual([]);
});

describe("direct delivery (sources with their own outbox)", () => {
  test("shares the DM with queued entries and receives the delivered message", async () => {
    const onSent = jest.fn();
    await runNotificationBatch(client, [
      deliver => deliver("admin", [{ content: "날씨" }]),
      deliver => deliver("admin", [{ content: "티보", delivery: "direct", onSent }]),
    ]);
    expect(send.mock.calls[0][0].content).toBe("날씨\n\n티보");
    expect(onSent).toHaveBeenCalledWith({ id: "456", channelId: "789" }, "날씨\n\n티보");
    expect(queued()).toEqual([]);
  });

  test("a failed DM rejects the direct source and leaves it out of the queue", async () => {
    send.mockRejectedValue(new Error("DM failed"));
    const onSent = jest.fn();
    await expect(sendNotifications(client, "admin", [{ content: "티보", delivery: "direct", onSent }]))
      .rejects.toThrow("DM failed");
    expect(onSent).not.toHaveBeenCalled();
    expect(queued()).toEqual([]);
  });

  test("rechecks its own quiet time after recipient lookup without dropping queued entries", async () => {
    let quiet = false;
    client.users.fetch.mockImplementation(async () => { quiet = true; return { send }; });
    const acknowledge = jest.fn();
    await runNotificationBatch(client, [
      deliver => deliver("admin", [{ content: "날씨" }]),
      deliver => deliver("admin", [{ content: "티보", delivery: "direct", shouldSend: () => !quiet, onSent: acknowledge }]),
    ]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].content).toBe("날씨");
    expect(acknowledge).not.toHaveBeenCalled();
  });
});

test("an empty minute does not fetch a user or send a message", async () => {
  await runNotificationBatch(client, [deliver => deliver("admin", [])]);
  await runNotificationBatch(client, []);
  expect(client.users.fetch).not.toHaveBeenCalled();
});

describe("conversation memory of delivered notifications", () => {
  const store = require("../src/core/admin-conversation-context-store");
  beforeEach(() => store.clearAllAdminConversationContexts());

  test("records what was actually delivered, including embed text, keyed by the DM channel", async () => {
    const userSend = jest.fn().mockResolvedValue({ id: "m1", channelId: "dm-1" });
    const memoryClient = { users: { fetch: jest.fn().mockResolvedValue({ send: userSend }) } };
    await sendNotifications(memoryClient, "owner", [
      { content: "🌤️ 서울 맑음" },
      { embeds: [{ title: "긱뉴스", description: "요약", fields: [{ name: "원문", value: "링크" }] }] },
    ]);
    const entries = store.getAdminConversationEntries("owner", "dm-1");
    expect(entries.map((entry) => entry.content)).toEqual(["🌤️ 서울 맑음\n\n긱뉴스\n요약\n원문: 링크"]);
  });

  test("records nothing until the DM is actually delivered", async () => {
    const memoryClient = { users: { fetch: jest.fn().mockResolvedValue({ send: jest.fn().mockRejectedValue(new Error("closed")) }) } };
    await sendNotifications(memoryClient, "owner", [{ content: "알림" }]);
    expect(store.getAdminConversationEntries("owner", "dm-1")).toEqual([]);
    expect(queued()).toHaveLength(1);
  });
});
