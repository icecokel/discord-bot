require("ts-node/register/transpile-only");

const mockFetchCompanyJobPostings = jest.fn();
let stored;

jest.mock("../src/features/job-monitor/company-job-sources", () => ({
  COMPANY_JOB_SOURCES: [
    {
      id: "naver",
      name: "네이버",
      careersUrl: "https://recruit.navercorp.com/",
    },
    {
      id: "kakao",
      name: "카카오",
      careersUrl: "https://careers.kakao.com/jobs",
    },
  ],
  fetchCompanyJobPostings: mockFetchCompanyJobPostings,
}));

jest.mock("../src/utils/file-manager", () => ({
  readJson: jest.fn(() => stored),
  writeJson: jest.fn((filename, data) => {
    stored = data;
    return true;
  }),
}));

const {
  checkForNewJobPostings,
  markJobPostingsAsNotified,
} = require("../src/features/job-monitor/job-monitor-service");
const { writeJson: mockWriteJson } = require("../src/utils/file-manager");

const posting = (companyId, companyName, id) => ({
  id,
  companyId,
  companyName,
  title: `${companyName} ${id}`,
  url: `https://example.com/${id}`,
});

describe("job monitor service", () => {
  beforeEach(() => {
    stored = { companies: {} };
    jest.clearAllMocks();
  });

  test("uses each company's first successful crawl as a silent baseline", async () => {
    mockFetchCompanyJobPostings.mockImplementation(async (source) => [
      posting(source.id, source.name, `${source.id}-1`),
    ]);

    const result = await checkForNewJobPostings(
      new Date("2026-07-26T00:00:00.000Z"),
    );

    expect(result.newPostings).toEqual([]);
    expect(result.initializedCompanies).toEqual(["네이버", "카카오"]);
    expect(stored.companies.naver.seenIds).toEqual(["naver-1"]);
    expect(stored.companies.kakao.seenIds).toEqual(["kakao-1"]);
  });

  test("initializes an empty role-filtered baseline and detects the first matching job", async () => {
    mockFetchCompanyJobPostings.mockResolvedValue([]);

    const baseline = await checkForNewJobPostings(
      new Date("2026-07-27T00:00:00.000Z"),
    );

    expect(baseline.newPostings).toEqual([]);
    expect(baseline.successfulCompanyCount).toBe(2);
    expect(stored.companies.naver).toMatchObject({
      seenIds: [],
      lastPostingCount: 0,
    });

    mockFetchCompanyJobPostings.mockImplementation(async (source) =>
      source.id === "naver"
        ? [posting("naver", "네이버", "naver-frontend-1")]
        : [],
    );

    const nextCheck = await checkForNewJobPostings(
      new Date("2026-07-27T04:00:00.000Z"),
    );

    expect(nextCheck.newPostings).toEqual([
      expect.objectContaining({ id: "naver-frontend-1" }),
    ]);
  });

  test("returns unseen ids and keeps them pending until notification succeeds", async () => {
    stored = {
      companies: {
        naver: {
          seenIds: ["naver-1"],
          initializedAt: "2026-07-25T00:00:00.000Z",
          lastCheckedAt: "2026-07-25T00:00:00.000Z",
          lastPostingCount: 1,
        },
        kakao: {
          seenIds: ["kakao-1"],
          initializedAt: "2026-07-25T00:00:00.000Z",
          lastCheckedAt: "2026-07-25T00:00:00.000Z",
          lastPostingCount: 1,
        },
      },
    };
    mockFetchCompanyJobPostings.mockImplementation(async (source) =>
      source.id === "naver"
        ? [
            posting("naver", "네이버", "naver-1"),
            posting("naver", "네이버", "naver-2"),
          ]
        : [posting("kakao", "카카오", "kakao-1")],
    );

    const result = await checkForNewJobPostings(
      new Date("2026-07-26T06:00:00.000Z"),
    );

    expect(result.newPostings).toEqual([
      expect.objectContaining({ id: "naver-2" }),
    ]);
    expect(stored.companies.naver.seenIds).toEqual(["naver-1"]);

    markJobPostingsAsNotified(
      result.newPostings,
      new Date("2026-07-26T06:01:00.000Z"),
    );
    expect(stored.companies.naver.seenIds).toEqual([
      "naver-1",
      "naver-2",
    ]);
    expect(stored.companies.naver.lastNotifiedAt).toBe(
      "2026-07-26T06:01:00.000Z",
    );
  });

  test("isolates a failed company while checking successful sources", async () => {
    mockFetchCompanyJobPostings.mockImplementation(async (source) => {
      if (source.id === "kakao") throw new Error("카카오 응답 오류");
      return [posting("naver", "네이버", "naver-1")];
    });

    const result = await checkForNewJobPostings();

    expect(result.successfulCompanyCount).toBe(1);
    expect(result.failures).toEqual([
      expect.objectContaining({
        companyId: "kakao",
        reason: "카카오 응답 오류",
      }),
    ]);
    expect(stored.companies.naver).toBeDefined();
    expect(stored.companies.kakao).toBeUndefined();
  });

  test("does not replace invalid history with a new baseline", async () => {
    stored = { companies: { naver: null } };
    mockFetchCompanyJobPostings.mockImplementation(async (source) => [
      posting(source.id, source.name, `${source.id}-new`),
    ]);

    await expect(checkForNewJobPostings()).rejects.toThrow(
      "채용공고 이력 형식이 올바르지 않습니다.",
    );
    expect(mockWriteJson).not.toHaveBeenCalled();
  });
});
