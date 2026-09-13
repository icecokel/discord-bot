const mockGenerate = jest.fn();
jest.mock("../src/core/ai", () => ({ aiService: { generateTextWithProviderOnly: (...args) => mockGenerate(...args) } }));
const { translateXPost } = require("../src/features/x-monitor/x-post-translation");
test("uses Codex app-server only and passes original text as data", async () => {
  mockGenerate.mockResolvedValue({ text: JSON.stringify({ translation: "모든 변경 사항이 적용됐습니다.\n편안한 밤 보내세요." }) });
  expect(await translateXPost("Reset all propagated.\nSweet dreams.")).toContain("편안한 밤");
  expect(mockGenerate).toHaveBeenCalledWith("codex", JSON.stringify({ text: "Reset all propagated.\nSweet dreams." }), expect.objectContaining({
    responseMimeType: "application/json", codexSandbox: "read-only", codexApprovalPolicy: "never", codexSearch: false,
  }));
});
test.each(["not json", '{}', '{"translation":"English only"}', '{"translation":""}'])("rejects invalid translation %s", async (text) => {
  mockGenerate.mockResolvedValue({ text });
  await expect(translateXPost("Original")).rejects.toThrow("Codex 번역 실패");
});
test("propagates provider failure without a fake translation", async () => {
  mockGenerate.mockRejectedValue(new Error("auth expired"));
  await expect(translateXPost("Original")).rejects.toThrow("Codex 번역 실패");
});
