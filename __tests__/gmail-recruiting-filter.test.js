const mockGenerate = jest.fn();
jest.mock("../src/core/ai", () => ({
  aiService: { generateTextWithProviderOnly: (...args) => mockGenerate(...args) },
}));
const { findRecruitingMails } = require("../src/features/gmail-monitor/gmail-recruiting-filter");

const mail = (uid, subject) => ({ uid, subject, from: "a <a@example.com>", snippet: "본문" });

test("returns only known mails with a valid category, as one Claude call", async () => {
  mockGenerate.mockResolvedValue({ text: JSON.stringify({ recruiting: [
    { uid: 1, category: "application", summary: "  카카오  서류 합격 안내 " },
    { uid: 2, category: "spam", summary: "잘못된 분류" },
    { uid: 99, category: "posting", summary: "없는 메일" },
  ] }) });
  const result = await findRecruitingMails([mail(1, "서류 결과"), mail(2, "광고")]);
  expect([...result]).toEqual([[1, { category: "application", summary: "카카오 서류 합격 안내" }]]);
  expect(mockGenerate).toHaveBeenCalledTimes(1);
  const [provider, prompt, options] = mockGenerate.mock.calls[0];
  expect(provider).toBe("claude");
  expect(JSON.parse(prompt).mails).toEqual([
    { uid: 1, subject: "서류 결과", from: "a <a@example.com>", preview: "본문" },
    { uid: 2, subject: "광고", from: "a <a@example.com>", preview: "본문" },
  ]);
  expect(options.systemInstruction).toContain("untrusted data");
});

test("throws on a malformed response so the caller retries instead of dropping mail", async () => {
  mockGenerate.mockResolvedValue({ text: JSON.stringify({ nope: [] }) });
  await expect(findRecruitingMails([mail(1, "x")])).rejects.toThrow("형식");
  await expect(findRecruitingMails([])).resolves.toEqual(new Map());
});
