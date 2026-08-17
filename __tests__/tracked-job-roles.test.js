require("ts-node/register/transpile-only");

const {
  filterTrackedJobPostings,
  isTrackedJobTitle,
  TRACKED_JOB_ROLE_NAMES,
} = require("../src/features/job-monitor/tracked-job-roles");

describe("tracked job roles", () => {
  test("exposes the requested role names", () => {
    expect(TRACKED_JOB_ROLE_NAMES).toEqual([
      "프론트엔드",
      "풀스택",
      "AX 엔지니어",
      "Product Engineer",
    ]);
  });

  test.each([
    "Frontend Engineer",
    "Staff Front-end Developer",
    "프론트 엔드 개발자",
    "FE Engineer",
    "Frontend / Backend Engineer",
    "백엔드 및 프론트엔드 개발자",
    "Fullstack Engineer",
    "Full Stack Developer",
    "풀스택 엔지니어",
    "AX Engineer",
    "AX 소프트웨어 개발자",
    "AI Transformation Engineer",
    "Product Engineer",
    "Product Software Engineer",
    "프로덕트 엔지니어",
    "Software Engineer, Product Platform",
  ])("includes requested engineering role: %s", (title) => {
    expect(isTrackedJobTitle(title)).toBe(true);
  });

  test.each([
    "Product Manager",
    "Product Designer",
    "Machine Learning Engineer",
    "DevOps Engineer",
    "Android Software Engineer",
    "외화자금(Front) 담당자",
    "Delivery Operation 기획 팀장 (Front Line Operation)",
    "정보보호 AX 운영 담당자",
    "Technical Writer",
    "Backend Engineer",
    "Senior Back-end Developer",
    "백엔드 개발자",
    "BE 개발자",
    "서버 개발자 - 결제 서비스",
    "Server-side Engineer",
  ])("excludes unrelated role: %s", (title) => {
    expect(isTrackedJobTitle(title)).toBe(false);
  });

  test("filters postings without changing matching posting data", () => {
    const postings = [
      { id: "frontend", title: "Frontend Engineer", url: "/frontend" },
      { id: "manager", title: "Product Manager", url: "/manager" },
      { id: "backend", title: "서버 개발자", url: "/backend" },
    ];

    expect(filterTrackedJobPostings(postings)).toEqual([
      postings[0],
    ]);
  });
});
