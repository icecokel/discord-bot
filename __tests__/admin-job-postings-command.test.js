const mockRegisterAdminCommand = jest.fn();
const mockFetchCompanyJobPostings = jest.fn();

jest.mock("../src/core/admin-middleware", () => ({
  registerAdminCommand: mockRegisterAdminCommand,
}));

jest.mock("../src/features/job-monitor/company-job-sources", () => ({
  COMPANY_JOB_SOURCES: [
    { id: "naver", name: "네이버", careersUrl: "https://careers.naver.com" },
    { id: "kakao", name: "카카오", careersUrl: "https://careers.kakao.com" },
  ],
  fetchCompanyJobPostings: mockFetchCompanyJobPostings,
}));

const {
  getCurrentJobPostings,
  handleJobPostings,
} = require("../src/features/admin/commands/admin-job-postings");

describe("admin job postings command", () => {
  beforeEach(() => {
    mockFetchCompanyJobPostings.mockReset();
  });

  test("registers the current job postings command", () => {
    expect(mockRegisterAdminCommand).toHaveBeenCalledWith(
      "채용공고",
      expect.any(Function),
      expect.any(String),
    );
  });

  test("shows all current postings without changing notification history", async () => {
    mockFetchCompanyJobPostings
      .mockResolvedValueOnce([
        {
          id: "naver-1",
          companyId: "naver",
          companyName: "네이버",
          title: "Frontend Engineer",
          url: "https://careers.naver.com/jobs/1",
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "kakao-1",
          companyId: "kakao",
          companyName: "카카오",
          title: "Backend Engineer",
          url: "https://careers.kakao.com/jobs/1",
        },
      ]);
    const message = {
      reply: jest.fn().mockResolvedValue(undefined),
      channel: {
        isSendable: jest.fn(() => true),
        send: jest.fn().mockResolvedValue(undefined),
      },
    };

    await handleJobPostings(message);

    expect(mockFetchCompanyJobPostings).toHaveBeenCalledTimes(2);
    expect(message.reply).toHaveBeenCalledTimes(1);
    expect(message.reply.mock.calls[0][0]).toContain(
      "현재 감시 직군 채용공고 2건",
    );
    expect(message.reply.mock.calls[0][0]).toContain("**네이버**");
    expect(message.reply.mock.calls[0][0]).toContain("**카카오**");
    expect(message.channel.send).not.toHaveBeenCalled();
  });

  test("keeps successful results when one company lookup fails", async () => {
    mockFetchCompanyJobPostings
      .mockResolvedValueOnce([
        {
          id: "naver-1",
          companyId: "naver",
          companyName: "네이버",
          title: "Fullstack Engineer",
          url: "https://careers.naver.com/jobs/1",
        },
      ])
      .mockRejectedValueOnce(new Error("network error"));
    const message = {
      reply: jest.fn().mockResolvedValue(undefined),
      channel: {
        isSendable: jest.fn(() => true),
        send: jest.fn().mockResolvedValue(undefined),
      },
    };

    await handleJobPostings(message);

    expect(message.reply.mock.calls[0][0]).toContain("**네이버**");
    expect(message.channel.send).toHaveBeenCalledWith(
      "⚠️ 1개 회사 조회 실패: 카카오",
    );
  });

  test("returns empty results when every lookup has no matching job", async () => {
    mockFetchCompanyJobPostings.mockResolvedValue([]);

    const result = await getCurrentJobPostings();

    expect(result).toEqual({ postings: [], failedSources: [] });
  });
});
