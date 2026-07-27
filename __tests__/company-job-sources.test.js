require("ts-node/register/transpile-only");

const {
  parseAblyJobPostings,
  parseCoupangJobPostings,
  parseDaangnJobPostings,
  parseDunamuJobPostings,
  parseGreetingJobPostings,
  parseKakaoJobPostings,
  parseKakaoBankJobPostings,
  parseLeverJobPostings,
  parseLineJobPostings,
  parseNaverJobPostings,
  parseNinehireJobPostings,
  parseTossJobPostings,
  parseWoowahanJobPostings,
  fetchCompanyJobPostings,
} = require("../src/features/job-monitor/company-job-sources");

describe("company job source parsers", () => {
  test("extracts Naver posting ids, titles and official detail URLs", () => {
    const source = {
      id: "naver",
      name: "네이버",
      careersUrl: "https://recruit.navercorp.com/rcrt/list.do",
    };
    const html = `
      <li class="card_item">
        <a href="#n" class="card_link" onclick="show('30005174')">
          <h4 class="card_title">[NAVER] AI &amp; Search Engineer</h4>
        </a>
      </li>
    `;

    expect(parseNaverJobPostings(html, source)).toEqual([
      {
        id: "30005174",
        companyId: "naver",
        companyName: "네이버",
        title: "[NAVER] AI & Search Engineer",
        url: "https://recruit.navercorp.com/rcrt/view.do?annoId=30005174&lang=ko",
      },
    ]);
  });

  test("extracts Daangn role links without including badge text", () => {
    const source = {
      id: "daangn",
      name: "당근",
      careersUrl: "https://careers.daangn.com/jobs/",
    };
    const html = `
      <a href="/jobs/role/7791182003/">
        <h3>
          <span>Design Engineer &amp; Builder</span>
          <span>초기 빌더</span>
        </h3>
      </a>
    `;

    expect(parseDaangnJobPostings(html, source)).toEqual([
      {
        id: "7791182003",
        companyId: "daangn",
        companyName: "당근",
        title: "Design Engineer & Builder",
        url: "https://careers.daangn.com/jobs/role/7791182003/",
      },
    ]);
  });

  test("parses Kakao public API jobs", () => {
    const source = {
      id: "kakao",
      name: "카카오",
      careersUrl: "https://careers.kakao.com/jobs",
    };
    const result = parseKakaoJobPostings(
      {
        jobList: [
          {
            realId: "P-14472",
            jobOfferTitle: "AI Engineer",
            regDate: "2026-06-12T17:24:29",
          },
        ],
      },
      source,
    );

    expect(result[0]).toMatchObject({
      id: "P-14472",
      title: "AI Engineer",
      url: "https://careers.kakao.com/jobs/P-14472",
      publishedAt: "2026-06-12T17:24:29",
    });
  });

  test("deduplicates Toss jobs and excludes explicitly hidden jobs", () => {
    const source = {
      id: "toss",
      name: "토스",
      careersUrl: "https://toss.im/career/jobs",
    };
    const visible = {
      id: 6008890003,
      title: "Account Manager",
      absolute_url:
        "https://toss.im/career/job-detail?gh_jid=6008890003",
      metadata: [],
    };
    const hidden = {
      id: 7000000003,
      title: "Hidden Job",
      metadata: [
        {
          name: '커리어페이지 메뉴에 "미노출" 되어야 하는 Job인가요?',
          value: true,
        },
      ],
    };

    expect(
      parseTossJobPostings(
        {
          resultType: "SUCCESS",
          success: [{ jobs: [visible, visible, hidden] }],
        },
        source,
      ),
    ).toEqual([
      expect.objectContaining({
        id: "6008890003",
        title: "Account Manager",
      }),
    ]);
  });

  test("parses Woowahan pages and skips hidden jobs", () => {
    const source = {
      id: "woowahan",
      name: "우아한형제들",
      careersUrl: "https://career.woowahan.com/recruitment/",
    };
    const result = parseWoowahanJobPostings(
      {
        data: {
          totalPageNumber: 3,
          list: [
            {
              recruitNumber: "R2607043",
              recruitName: "운영지원(마케팅채널)",
              recruitOpenDate: "2026-07-24 15:53:13",
              isHidden: false,
              recruitDeleteYn: false,
            },
            {
              recruitNumber: "R2607000",
              recruitName: "숨김 공고",
              isHidden: true,
            },
          ],
        },
      },
      source,
    );

    expect(result.totalPages).toBe(3);
    expect(result.postings).toEqual([
      expect.objectContaining({
        id: "R2607043",
        title: "운영지원(마케팅채널)",
        url: "https://career.woowahan.com/recruitment/R2607043/detail?category=all%3Aall",
      }),
    ]);
  });

  test("parses Greeting-based job pages using the title field", () => {
    const source = {
      id: "musinsa",
      name: "무신사",
      careersUrl: "https://www.musinsacareers.com/ko/home",
    };
    const html = `
      <a data-testid="공고_아이템" href="/ko/o/223313">
        <span data-variant="title-01">Frontend Engineer (Core Ads Platform)</span>
        <span>Frontend Engineering</span>
        <span>경력 5년 이상</span>
      </a>
    `;

    expect(parseGreetingJobPostings(html, source)).toEqual([
      {
        id: "223313",
        companyId: "musinsa",
        companyName: "무신사",
        title: "Frontend Engineer (Core Ads Platform)",
        url: "https://www.musinsacareers.com/ko/o/223313",
      },
    ]);
  });

  test("parses Bucketplace external Greeting links", () => {
    const source = {
      id: "bucketplace",
      name: "오늘의집",
      careersUrl:
        "https://www.bucketplace.com/careers/?region=&team=dev",
    };
    const html = `
      <a href="https://bucketplace.career.greetinghr.com/ko/o/173769">
        Frontend Engineer, Content
        <svg><path></path></svg>
      </a>
    `;

    expect(parseGreetingJobPostings(html, source)).toEqual([
      expect.objectContaining({
        id: "173769",
        title: "Frontend Engineer, Content",
        url: "https://bucketplace.career.greetinghr.com/ko/o/173769",
      }),
    ]);
  });

  test("parses public LINE Korea jobs and excludes overseas jobs", () => {
    const source = {
      id: "line",
      name: "LINE",
      careersUrl: "https://careers.linecorp.com/ko/jobs",
    };
    const result = parseLineJobPostings(
      {
        result: {
          data: {
            allStrapiJobs: {
              edges: [
                {
                  node: {
                    strapiId: 3005,
                    title: "LINE Pay Frontend Engineer",
                    publish: true,
                    is_public: true,
                    start_date: "2026-07-25",
                    cities: [{ name: "Bundang" }],
                  },
                },
                {
                  node: {
                    strapiId: 9999,
                    title: "Overseas Engineer",
                    publish: true,
                    is_public: true,
                    cities: [{ name: "Tokyo" }],
                  },
                },
              ],
            },
          },
        },
      },
      source,
    );

    expect(result).toEqual([
      expect.objectContaining({
        id: "3005",
        title: "LINE Pay Frontend Engineer",
        url: "https://careers.linecorp.com/ko/jobs/3005/",
        publishedAt: "2026-07-25",
      }),
    ]);
  });

  test("parses Coupang jobs located in Korea", () => {
    const source = {
      id: "coupang",
      name: "쿠팡",
      careersUrl: "https://www.coupang.jobs/kr/jobs/",
    };
    const result = parseCoupangJobPostings(
      {
        jobs: [
          {
            id: 8083026,
            title: "Staff Frontend Engineer (Coupang Eats)",
            absolute_url:
              "https://www.coupang.jobs/en/jobs/?gh_jid=8083026",
            location: { name: "Seoul, South Korea" },
            updated_at: "2026-07-25T12:00:00Z",
          },
          {
            id: 9000000,
            title: "Frontend Engineer",
            absolute_url:
              "https://www.coupang.jobs/en/jobs/?gh_jid=9000000",
            location: { name: "Seattle, USA" },
          },
        ],
      },
      source,
    );

    expect(result).toEqual([
      expect.objectContaining({
        id: "8083026",
        title: "Staff Frontend Engineer (Coupang Eats)",
        publishedAt: "2026-07-25T12:00:00Z",
      }),
    ]);
  });

  test("keeps only active KakaoBank jobs", () => {
    const source = {
      id: "kakaobank",
      name: "카카오뱅크",
      careersUrl: "https://recruit.kakaobank.com/jobs",
    };
    const result = parseKakaoBankJobPostings(
      {
        list: [
          {
            recruitNoticeSn: 261154,
            recruitNoticeName: "서비스 기획자 - 대화형 AI 서비스",
            receiveStartDatetime: "2026-07-20 00:00:00",
            receiveEndDatetime: "2026-08-18 23:59:59",
          },
          {
            recruitNoticeSn: 238654,
            recruitNoticeName: "프론트엔드 개발자",
            receiveStartDatetime: "2026-03-02 00:00:00",
            receiveEndDatetime: "2026-04-29 23:59:59",
          },
        ],
      },
      source,
      new Date("2026-07-26T00:00:00+09:00"),
    );

    expect(result).toEqual([
      expect.objectContaining({
        id: "261154",
        title: "서비스 기획자 - 대화형 AI 서비스",
        url: "https://recruit.kakaobank.com/jobs/261154",
      }),
    ]);
  });

  test("parses Dunamu careers links and preserves frontend titles", () => {
    const source = {
      id: "dunamu",
      name: "두나무",
      careersUrl: "https://www.dunamu.com/careers/jobs",
    };
    const html = `
      <li>
        <a href="https://careers.dunamu.com/detail/588">
          <p>Frontend Engineer_데이터 프로덕트 서비스 개발<i>-</i></p>
          <em>Engineering</em>
        </a>
      </li>
    `;

    expect(parseDunamuJobPostings(html, source)).toEqual([
      {
        id: "588",
        companyId: "dunamu",
        companyName: "두나무",
        title: "Frontend Engineer_데이터 프로덕트 서비스 개발",
        url: "https://careers.dunamu.com/detail/588",
      },
    ]);
  });

  test("parses Korea-based Lever jobs for Hyperconnect", () => {
    const source = {
      id: "hyperconnect",
      name: "하이퍼커넥트",
      careersUrl: "https://career.hyperconnect.com/jobs/",
    };
    const result = parseLeverJobPostings(
      [
        {
          id: "4004a95b-ed89-4193-ad1a-a2ed5d4703d5",
          text: "Android Software Engineer (Azar)",
          hostedUrl:
            "https://jobs.lever.co/matchgroup/4004a95b-ed89-4193-ad1a-a2ed5d4703d5",
          createdAt: 1767596368549,
          categories: {
            department: "Hyperconnect",
            location: "Seoul, South Korea",
          },
        },
        {
          id: "overseas",
          text: "Overseas Engineer",
          hostedUrl: "https://jobs.lever.co/matchgroup/overseas",
          categories: {
            location: "New York, United States",
          },
        },
      ],
      source,
    );

    expect(result).toEqual([
      expect.objectContaining({
        id: "4004a95b-ed89-4193-ad1a-a2ed5d4703d5",
        title: "Android Software Engineer (Azar)",
        publishedAt: "2026-01-05T06:59:28.549Z",
      }),
    ]);
  });

  test("parses active Ninehire jobs for KakaoStyle", () => {
    const source = {
      id: "kakaostyle",
      name: "카카오스타일",
      careersUrl: "https://career.kakaostyle.com/jobs",
    };
    const result = parseNinehireJobPostings(
      {
        results: [
          {
            recruitmentId: "0fb1fb60-087e-11f1-b395-d1ab45793756",
            status: "in_progress",
            externalTitle: "검색추천제품팀 팀장",
            addressKey: "EtoyrVCR",
            createdAt: "2026-02-13T03:11:35.000Z",
            isPrivate: false,
          },
          {
            recruitmentId: "closed",
            status: "closed",
            externalTitle: "마감 공고",
            addressKey: "closedKey",
          },
        ],
      },
      source,
    );

    expect(result).toEqual([
      expect.objectContaining({
        id: "0fb1fb60-087e-11f1-b395-d1ab45793756",
        title: "검색추천제품팀 팀장",
        url: "https://career.kakaostyle.com/job_posting/EtoyrVCR",
      }),
    ]);
  });

  test("parses active ABLY jobs from Next.js page data", () => {
    const source = {
      id: "ably",
      name: "에이블리",
      careersUrl: "https://ably.team/recruit",
    };
    const nextData = {
      props: {
        pageProps: {
          recruits: [
            {
              id: "0e154340-e128-11ee-9b94-0decb2bde950",
              title: "프론트엔드 엔지니어",
              status: "in_progress",
              applyUrl:
                "https://tydtr0dj.ninehire.site/job_posting/1L05YART",
              createdAt: "2024-03-13T10:54:25.000Z",
              isPrivate: false,
            },
            {
              id: "closed",
              title: "마감 공고",
              status: "closed",
              applyUrl:
                "https://tydtr0dj.ninehire.site/job_posting/closedKey",
            },
          ],
        },
      },
    };
    const html = `
      <script id="__NEXT_DATA__" type="application/json">
        ${JSON.stringify(nextData)}
      </script>
    `;

    expect(parseAblyJobPostings(html, source)).toEqual([
      expect.objectContaining({
        id: "0e154340-e128-11ee-9b94-0decb2bde950",
        title: "프론트엔드 엔지니어",
        url: "https://recruit.ably.team/job_posting/1L05YART",
      }),
    ]);
  });

  test("treats a successful crawl with no tracked roles as an empty result", async () => {
    const source = {
      id: "naver",
      name: "네이버",
      careersUrl: "https://recruit.navercorp.com/rcrt/list.do",
    };
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      text: jest.fn().mockResolvedValue(`
        <li class="card_item">
          <a onclick="show('30005174')">
            <h4 class="card_title">Product Manager</h4>
          </a>
        </li>
      `),
    });

    try {
      await expect(fetchCompanyJobPostings(source)).resolves.toEqual([]);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
