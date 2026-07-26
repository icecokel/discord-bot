require("ts-node/register/transpile-only");

const {
  buildJobPostingNotificationMessages,
} = require("../src/features/job-monitor/job-notification-message");

describe("job posting notification message", () => {
  test("groups official job links by company", () => {
    const messages = buildJobPostingNotificationMessages([
      {
        id: "1",
        companyId: "naver",
        companyName: "네이버",
        title: "Backend [Platform] Engineer",
        url: "https://recruit.navercorp.com/rcrt/view.do?annoId=1",
      },
      {
        id: "2",
        companyId: "kakao",
        companyName: "카카오",
        title: "Frontend Engineer",
        url: "https://careers.kakao.com/jobs/P-2",
      },
    ]);

    expect(messages.join("\n")).toContain("새 채용공고 2건");
    expect(messages.join("\n")).toContain("**네이버**");
    expect(messages.join("\n")).toContain(
      "[Backend \\[Platform\\] Engineer](<https://recruit.navercorp.com/rcrt/view.do?annoId=1>)",
    );
    expect(messages.join("\n")).toContain("**카카오**");
  });

  test("splits large batches below Discord's message limit", () => {
    const postings = Array.from({ length: 40 }, (_, index) => ({
      id: String(index),
      companyId: "naver",
      companyName: "네이버",
      title: `매우 긴 채용공고 제목 ${index} ${"가".repeat(100)}`,
      url: `https://example.com/jobs/${index}`,
    }));

    const messages = buildJobPostingNotificationMessages(postings);

    expect(messages.length).toBeGreaterThan(1);
    expect(messages.every((message) => message.length <= 2000)).toBe(true);
  });
});
