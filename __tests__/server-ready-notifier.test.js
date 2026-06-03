const {
  notifyServerReady,
} = require("../src/core/server-ready-notifier");

const createClient = () => {
  const send = jest.fn().mockResolvedValue(undefined);
  const fetch = jest.fn().mockResolvedValue({ send });

  return {
    user: {
      tag: "얼콜봇#3227",
    },
    users: {
      fetch,
    },
    send,
  };
};

describe("server ready notifier", () => {
  test("sends a ready DM to the admin user", async () => {
    const client = createClient();

    await notifyServerReady(client, "admin-id");

    expect(client.users.fetch).toHaveBeenCalledWith("admin-id");
    expect(client.send).toHaveBeenCalledWith(
      expect.stringContaining("icenux 서버 준비 완료"),
    );
    expect(client.send).toHaveBeenCalledWith(
      expect.stringContaining("Hermes 대화 맥락 응답 준비 완료"),
    );
  });

  test("does not send when admin id is missing", async () => {
    const client = createClient();

    await notifyServerReady(client, undefined);

    expect(client.users.fetch).not.toHaveBeenCalled();
    expect(client.send).not.toHaveBeenCalled();
  });

  test("logs but does not throw when DM sending fails", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const client = createClient();
    client.users.fetch.mockRejectedValueOnce(new Error("fetch failed"));

    await expect(notifyServerReady(client, "admin-id")).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledWith(
      "[ServerReadyNotifier] 준비 알림 전송 실패:",
      "fetch failed",
    );
    consoleSpy.mockRestore();
  });
});
