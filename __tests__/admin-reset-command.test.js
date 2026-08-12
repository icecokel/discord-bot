const mockRegisterAdminCommand = jest.fn();
const mockWriteJson = jest.fn();

jest.mock("../src/core/admin-middleware", () => ({
  registerAdminCommand: mockRegisterAdminCommand,
}));

jest.mock("../src/utils/file-manager", () => ({
  writeJson: mockWriteJson,
}));

const { handleReset } = require("../src/features/admin/commands/admin-reset");

describe("admin reset command", () => {
  test("reports failure when the reset file cannot be saved", async () => {
    mockWriteJson.mockReturnValue(false);
    const reply = jest.fn().mockResolvedValue(undefined);
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    await handleReset(
      { author: { tag: "admin#0001" }, reply },
      ["운세"],
    );

    expect(reply).toHaveBeenCalledWith(
      expect.stringContaining("데이터 파일 저장에 실패했습니다."),
    );
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
