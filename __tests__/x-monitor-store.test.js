jest.mock("../src/utils/file-manager", () => ({ readJson: jest.fn(), writeJson: jest.fn() }));
const { readJson, writeJson } = require("../src/utils/file-manager");
const { loadXMonitorState, saveXMonitorState } = require("../src/utils/x-monitor-store");
const valid = () => ({ version: 1, account: "thsottiaux", initializedAt: "2026-09-14T00:00:00Z",
  baselineMaxId: "100", lastCompleteMaxId: "100", notifiedIds: [], pending: [] });
test("only a missing file creates a baseline", () => {
  readJson.mockImplementation((name, fallback) => fallback);
  expect(loadXMonitorState()).toBeNull();
  for (const data of [null, {}, { ...valid(), pending: null }, { ...valid(), baselineMaxId: "NaN" },
    { ...valid(), notifiedIds: ["1", "1"] }, { ...valid(), account: "other" },
    { ...valid(), pending: [{ id: "101", url: "https://evil.test" }] }]) {
    readJson.mockReturnValue(data);
    expect(() => loadXMonitorState()).toThrow("이력 형식");
  }
  readJson.mockReturnValue(valid());
  expect(loadXMonitorState()).toEqual(valid());
});
test("propagates write failure", () => {
  writeJson.mockReturnValue(false);
  expect(() => saveXMonitorState(valid())).toThrow("저장에 실패");
});

test("loads legacy history and validates detailed delivery records", () => {
  const delivery = { sentAt: "2026-09-15T00:00:00Z", recipientId: "123", channelId: "456",
    messageId: "789", content: "원문과 한국어 번역", postIds: ["101"], completedPostIds: ["101"] };
  readJson.mockReturnValue({ ...valid(), deliveries: [delivery] });
  expect(loadXMonitorState().deliveries).toEqual([delivery]);
  for (const invalid of [null, { ...delivery, sentAt: "bad" }, { ...delivery, messageId: undefined },
    { ...delivery, completedPostIds: ["102"] }]) {
    readJson.mockReturnValue({ ...valid(), deliveries: [invalid] });
    expect(() => loadXMonitorState()).toThrow("이력 형식");
  }
});
