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
