const { MessageFlags, EmbedBuilder } = require("discord.js");
const { runNotificationBatch, sendNotifications } = require("../src/utils/notification-batch");

let send, client;
beforeEach(() => {
  send = jest.fn().mockResolvedValue({ id: "456", channelId: "789" });
  client = { users: { fetch: jest.fn().mockResolvedValue({ send }) } };
});

test("waits for every task and combines in task order before acknowledging delivery", async () => {
  let release;
  const slow = new Promise(resolve => { release = resolve; });
  const acknowledged = jest.fn();
  const running = runNotificationBatch(client, [
    async deliver => { await slow; await deliver("admin", [{ content: "날씨", onSent: acknowledged }]); },
    deliver => deliver("admin", [{ content: "티보", onSent: acknowledged }]),
  ]);
  await Promise.resolve();
  expect(send).not.toHaveBeenCalled();
  expect(acknowledged).not.toHaveBeenCalled();
  release();
  await running;
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0][0]).toEqual({ content: "날씨\n\n티보", allowedMentions: { parse: [] } });
  expect(acknowledged).toHaveBeenCalledTimes(2);
  expect(acknowledged).toHaveBeenCalledWith({ id: "456", channelId: "789" }, "날씨\n\n티보");
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

test("preserves chunk order and makes overflow messages silent", async () => {
  await runNotificationBatch(client, [
    deliver => deliver("admin", [{ content: "날씨".repeat(200) }]),
    deliver => deliver("admin", [{ content: "a".repeat(1800) }, { content: "티보 끝" }]),
  ]);
  expect(send.mock.calls.map(([message]) => message.content)).toEqual([
    "날씨".repeat(200), "a".repeat(1800), "티보 끝",
  ]);
  expect(send.mock.calls[0][0].flags).toBeUndefined();
  expect(send.mock.calls.slice(1).every(([message]) => message.flags === MessageFlags.SuppressNotifications)).toBe(true);
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
  expect(send.mock.calls[0][0]).toMatchObject({ content: "날씨", embeds });
  send.mockClear();
  await runNotificationBatch(client, [
    deliver => deliver("admin", [{ embeds: [{ description: "a".repeat(4000) }] }]),
    deliver => deliver("admin", [{ embeds: [{ description: "b".repeat(3000) }] }]),
  ]);
  expect(send).toHaveBeenCalledTimes(2);
});

test("failed combined delivery rejects both sources without committing either", async () => {
  send.mockRejectedValue(new Error("DM blocked"));
  const acknowledge = jest.fn();
  const failures = [];
  await runNotificationBatch(client, ["날씨", "티보"].map(content => async deliver => {
    try { await deliver("admin", [{ content, onSent: acknowledge }]); }
    catch (error) { failures.push(error.message); }
  }));
  expect(failures).toEqual(["DM blocked", "DM blocked"]);
  expect(acknowledge).not.toHaveBeenCalled();
});

test("records other delivered sources even if one acknowledgement fails, then stops that source", async () => {
  const other = jest.fn();
  const failed = jest.fn();
  const skipped = jest.fn();
  await runNotificationBatch(client, [
    async deliver => {
      try {
        await deliver("admin", [
          { content: "날씨", onSent: () => { throw new Error("disk full"); } },
          { content: "다음", onSent: skipped },
        ]);
      } catch (error) { failed(error.message); }
    },
    deliver => deliver("admin", [{ content: "티보", onSent: other }]),
  ]);
  expect(send).toHaveBeenCalledTimes(1);
  expect(other).toHaveBeenCalledTimes(1);
  expect(failed).toHaveBeenCalledWith("disk full");
  expect(skipped).not.toHaveBeenCalled();
});

test("retains only delivered progress after a later chunk fails", async () => {
  const first = jest.fn(), second = jest.fn();
  send.mockResolvedValueOnce({ id: "1" }).mockRejectedValueOnce(new Error("DM failed"));
  await expect(sendNotifications(client, "admin", [
    { content: "첫 부분", onSent: first }, { content: "끝", onSent: second },
  ])).rejects.toThrow("DM failed");
  expect(first).toHaveBeenCalledTimes(1);
  expect(second).not.toHaveBeenCalled();
});

test("rechecks quiet time after recipient lookup without dropping other sources", async () => {
  let quiet = false;
  client.users.fetch.mockImplementation(async () => { quiet = true; return { send }; });
  const acknowledge = jest.fn();
  await runNotificationBatch(client, [
    deliver => deliver("admin", [{ content: "날씨" }]),
    deliver => deliver("admin", [{ content: "티보", shouldSend: () => !quiet, onSent: acknowledge }]),
  ]);
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0][0].content).toBe("날씨");
  expect(acknowledge).not.toHaveBeenCalled();
});

test("empty batches do not fetch a user or send a message", async () => {
  await runNotificationBatch(client, [deliver => deliver("admin", [])]);
  expect(client.users.fetch).not.toHaveBeenCalled();
});

describe("conversation memory of delivered notifications", () => {
  const store = require("../src/core/admin-conversation-context-store");
  const { sendNotifications } = require("../src/utils/notification-batch");
  beforeEach(() => store.clearAllAdminConversationContexts());

  test("records what was actually delivered, including embed text, keyed by the DM channel", async () => {
    const userSend = jest.fn().mockResolvedValue({ id: "m1", channelId: "dm-1" });
    const client = { users: { fetch: jest.fn().mockResolvedValue({ send: userSend }) } };
    await sendNotifications(client, "owner", [
      { content: "🌤️ 서울 맑음" },
      { embeds: [{ title: "긱뉴스", description: "요약", fields: [{ name: "원문", value: "링크" }] }] },
    ]);
    const entries = store.getAdminConversationEntries("owner", "dm-1");
    // Chunks of one source are sent as separate DMs, so each becomes its own memory entry.
    expect(entries.map((entry) => entry.content)).toEqual(["🌤️ 서울 맑음", "긱뉴스\n요약\n원문: 링크"]);
  });

  test("records nothing when delivery fails", async () => {
    const client = { users: { fetch: jest.fn().mockResolvedValue({ send: jest.fn().mockRejectedValue(new Error("closed")) }) } };
    await expect(sendNotifications(client, "owner", [{ content: "알림" }])).rejects.toThrow("closed");
    expect(store.getAdminConversationEntries("owner", "dm-1")).toEqual([]);
  });
});
