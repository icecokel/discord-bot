require("ts-node/register/transpile-only");

const mockReadJson = jest.fn();
const mockWriteJson = jest.fn();

jest.mock("../src/utils/file-manager", () => ({
  DATA_DIR: "/tmp/discord-bot-test-data",
  readJson: mockReadJson,
  writeJson: mockWriteJson,
}));

const { getUserRegion, setUserRegion } = require("../src/utils/user-store");

describe("user store", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReadJson.mockReturnValue({
      "admin-id": { defaultRegion: "안양" },
    });
    mockWriteJson.mockReturnValue(true);
  });

  test("reads a saved region without requiring notification opt-in", () => {
    expect(getUserRegion("admin-id")).toBe("안양");
  });

  test("throws when saving user preferences fails", () => {
    mockWriteJson.mockReturnValue(false);

    expect(() => setUserRegion("admin-id", "서울")).toThrow(
      "사용자 설정 저장에 실패했습니다.",
    );
  });
});
