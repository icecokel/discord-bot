import { filterTrackedJobPostings } from "./tracked-job-roles";

export type CompanyId =
  | "naver"
  | "kakao"
  | "toss"
  | "daangn"
  | "woowahan"
  | "line"
  | "coupang"
  | "musinsa"
  | "bucketplace"
  | "kurly"
  | "kakaobank"
  | "dunamu"
  | "hyperconnect"
  | "sendbird"
  | "moloco"
  | "kakaostyle"
  | "ably";

export interface CompanyJobSource {
  id: CompanyId;
  name: string;
  careersUrl: string;
}

export interface JobPosting {
  id: string;
  companyId: CompanyId;
  companyName: string;
  title: string;
  url: string;
  publishedAt?: string;
}

export const COMPANY_JOB_SOURCES: readonly CompanyJobSource[] = [
  {
    id: "naver",
    name: "네이버",
    careersUrl:
      "https://recruit.navercorp.com/rcrt/list.do?sysCompanyCdArr=KR&sysCompanyCdData=KR",
  },
  {
    id: "kakao",
    name: "카카오",
    careersUrl: "https://careers.kakao.com/jobs",
  },
  {
    id: "toss",
    name: "토스",
    careersUrl: "https://toss.im/career/jobs",
  },
  {
    id: "daangn",
    name: "당근",
    careersUrl: "https://careers.daangn.com/jobs/",
  },
  {
    id: "woowahan",
    name: "우아한형제들",
    careersUrl: "https://career.woowahan.com/recruitment/",
  },
  {
    id: "line",
    name: "LINE",
    careersUrl:
      "https://careers.linecorp.com/ko/jobs?ca=All&ci=Gwacheon%2CBundang&co=East%20Asia",
  },
  {
    id: "coupang",
    name: "쿠팡",
    careersUrl: "https://www.coupang.jobs/kr/jobs/",
  },
  {
    id: "musinsa",
    name: "무신사",
    careersUrl: "https://www.musinsacareers.com/ko/home",
  },
  {
    id: "bucketplace",
    name: "오늘의집",
    careersUrl: "https://www.bucketplace.com/careers/?region=&team=dev",
  },
  {
    id: "kurly",
    name: "컬리",
    careersUrl: "https://kurly.career.greetinghr.com/ko/recruiting",
  },
  {
    id: "kakaobank",
    name: "카카오뱅크",
    careersUrl: "https://recruit.kakaobank.com/jobs",
  },
  {
    id: "dunamu",
    name: "두나무",
    careersUrl: "https://www.dunamu.com/careers/jobs",
  },
  {
    id: "hyperconnect",
    name: "하이퍼커넥트",
    careersUrl: "https://career.hyperconnect.com/jobs/",
  },
  {
    id: "sendbird",
    name: "센드버드",
    careersUrl: "https://sendbird.com/careers",
  },
  {
    id: "moloco",
    name: "몰로코",
    careersUrl: "https://www.moloco.com/ko/open-positions",
  },
  {
    id: "kakaostyle",
    name: "카카오스타일",
    careersUrl: "https://career.kakaostyle.com/jobs",
  },
  {
    id: "ably",
    name: "에이블리",
    careersUrl: "https://ably.team/recruit",
  },
];

const REQUEST_TIMEOUT_MS = 20_000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; DiscordJobMonitor/1.0; +https://github.com/)";

const getErrorMessage = (error: unknown): string =>
  error instanceof Error && error.message.trim()
    ? error.message
    : String(error || "알 수 없는 오류");

const fetchData = async <T>(
  url: string,
  readBody: (response: Response) => Promise<T>,
  init: RequestInit = {},
): Promise<T> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const headers = new Headers(init.headers);
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json,text/html;q=0.9,*/*;q=0.8");
  }
  if (!headers.has("Accept-Language")) {
    headers.set("Accept-Language", "ko-KR,ko;q=0.9,en;q=0.7");
  }
  if (!headers.has("User-Agent")) {
    headers.set("User-Agent", USER_AGENT);
  }

  try {
    const response = await fetch(url, {
      ...init,
      headers,
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
    }
    return await readBody(response);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`요청 시간 초과(${REQUEST_TIMEOUT_MS / 1000}초)`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

const fetchText = async (url: string): Promise<string> =>
  fetchData(url, (response) => response.text());

const fetchJson = async (
  url: string,
  init: RequestInit = {},
): Promise<unknown> =>
  fetchData(url, (response) => response.json(), init);

const decodeHtml = (value: string): string =>
  value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;|&#38;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;|&#60;/gi, "<")
    .replace(/&gt;|&#62;/gi, ">")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    );

const stripHtml = (value: string): string =>
  decodeHtml(value.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toStringValue = (value: unknown): string =>
  typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";

const dedupePostings = (postings: JobPosting[]): JobPosting[] => {
  const byId = new Map<string, JobPosting>();
  for (const posting of postings) {
    if (posting.id && posting.title && posting.url) {
      byId.set(posting.id, posting);
    }
  }
  return [...byId.values()];
};

export const parseNaverJobPostings = (
  html: string,
  source: CompanyJobSource,
): JobPosting[] => {
  const postings: JobPosting[] = [];
  const cardPattern =
    /<li[^>]*class=["'][^"']*\bcard_item\b[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi;

  for (const cardMatch of html.matchAll(cardPattern)) {
    const card = cardMatch[1];
    const id =
      card.match(/onclick=["']show\(\s*['"]?(\d+)['"]?\s*\)/i)?.[1] || "";
    const titleHtml =
      card.match(
        /<h4[^>]*class=["'][^"']*\bcard_title\b[^"']*["'][^>]*>([\s\S]*?)<\/h4>/i,
      )?.[1] || "";
    const title = stripHtml(titleHtml);
    if (!id || !title) continue;

    postings.push({
      id,
      companyId: source.id,
      companyName: source.name,
      title,
      url: `https://recruit.navercorp.com/rcrt/view.do?annoId=${id}&lang=ko`,
    });
  }

  return dedupePostings(postings);
};

export const parseDaangnJobPostings = (
  html: string,
  source: CompanyJobSource,
): JobPosting[] => {
  const postings: JobPosting[] = [];
  const anchorPattern =
    /<a[^>]+href=["']([^"']*\/jobs\/role\/(\d+)\/?[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(anchorPattern)) {
    const id = match[2];
    const anchorBody = match[3];
    const titleHtml =
      anchorBody.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i)?.[1] || "";
    const firstTitleSpan =
      titleHtml.match(/<span[^>]*>([\s\S]*?)<\/span>/i)?.[1] || titleHtml;
    const title = stripHtml(firstTitleSpan);
    if (!title) continue;

    postings.push({
      id,
      companyId: source.id,
      companyName: source.name,
      title,
      url: new URL(decodeHtml(match[1]), source.careersUrl).toString(),
    });
  }

  return dedupePostings(postings);
};

export const parseKakaoJobPostings = (
  data: unknown,
  source: CompanyJobSource,
): JobPosting[] => {
  if (!isRecord(data) || !Array.isArray(data.jobList)) return [];

  return dedupePostings(
    data.jobList.flatMap((value): JobPosting[] => {
      if (!isRecord(value)) return [];
      const id = toStringValue(value.realId);
      const title = toStringValue(value.jobOfferTitle);
      if (!id || !title) return [];

      return [
        {
          id,
          companyId: source.id,
          companyName: source.name,
          title,
          url: `https://careers.kakao.com/jobs/${encodeURIComponent(id)}`,
          publishedAt: toStringValue(value.regDate) || undefined,
        },
      ];
    }),
  );
};

export const parseTossJobPostings = (
  data: unknown,
  source: CompanyJobSource,
): JobPosting[] => {
  if (!isRecord(data) || data.resultType !== "SUCCESS") return [];
  if (!Array.isArray(data.success)) return [];

  const postings: JobPosting[] = [];
  for (const group of data.success) {
    if (!isRecord(group)) continue;
    const jobs = Array.isArray(group.jobs)
      ? group.jobs
      : isRecord(group.primary_job)
        ? [group.primary_job]
        : [];

    for (const value of jobs) {
      if (!isRecord(value)) continue;
      const metadata = Array.isArray(value.metadata) ? value.metadata : [];
      const isHidden = metadata.some(
        (entry) =>
          isRecord(entry) &&
          toStringValue(entry.name).includes("미노출") &&
          entry.value === true,
      );
      if (isHidden) continue;

      const id = toStringValue(value.id);
      const title = toStringValue(value.title);
      const absoluteUrl = toStringValue(value.absolute_url);
      if (!id || !title) continue;

      postings.push({
        id,
        companyId: source.id,
        companyName: source.name,
        title,
        url:
          absoluteUrl ||
          `https://toss.im/career/job-detail?gh_jid=${encodeURIComponent(id)}`,
        publishedAt: toStringValue(value.first_published) || undefined,
      });
    }
  }

  return dedupePostings(postings);
};

interface WoowahanPage {
  postings: JobPosting[];
  totalPages: number;
}

export const parseWoowahanJobPostings = (
  data: unknown,
  source: CompanyJobSource,
): WoowahanPage => {
  if (!isRecord(data) || !isRecord(data.data)) {
    return { postings: [], totalPages: 0 };
  }
  const page = data.data;
  const list = Array.isArray(page.list) ? page.list : [];
  const postings = list.flatMap((value): JobPosting[] => {
    if (!isRecord(value)) return [];
    if (value.recruitDeleteYn === true || value.isHidden === true) return [];

    const id = toStringValue(value.recruitNumber);
    const title = toStringValue(value.recruitName);
    if (!id || !title) return [];

    return [
      {
        id,
        companyId: source.id,
        companyName: source.name,
        title,
        url: `https://career.woowahan.com/recruitment/${encodeURIComponent(id)}/detail?category=all%3Aall`,
        publishedAt: toStringValue(value.recruitOpenDate) || undefined,
      },
    ];
  });

  const parsedTotalPages = Number(page.totalPageNumber);
  return {
    postings: dedupePostings(postings),
    totalPages:
      Number.isInteger(parsedTotalPages) && parsedTotalPages > 0
        ? parsedTotalPages
        : postings.length > 0
          ? 1
          : 0,
  };
};

export const parseGreetingJobPostings = (
  html: string,
  source: CompanyJobSource,
): JobPosting[] => {
  const postings: JobPosting[] = [];
  const anchorPattern =
    /<a\b[^>]*href=["']([^"']*\/(?:ko\/)?o\/(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(anchorPattern)) {
    const anchorBody = match[3];
    const titleHtml =
      anchorBody.match(
        /<[^>]+data-variant=["']title-01["'][^>]*>([\s\S]*?)<\/[^>]+>/i,
      )?.[1] || anchorBody;
    const title = stripHtml(titleHtml);
    if (!title) continue;

    postings.push({
      id: match[2],
      companyId: source.id,
      companyName: source.name,
      title,
      url: new URL(decodeHtml(match[1]), source.careersUrl).toString(),
    });
  }

  return dedupePostings(postings);
};

export const parseLineJobPostings = (
  data: unknown,
  source: CompanyJobSource,
): JobPosting[] => {
  if (!isRecord(data) || !isRecord(data.result)) return [];
  const resultData = isRecord(data.result.data) ? data.result.data : null;
  const allJobs =
    resultData && isRecord(resultData.allStrapiJobs)
      ? resultData.allStrapiJobs
      : null;
  if (!allJobs || !Array.isArray(allJobs.edges)) return [];

  const koreanCities = new Set(["Bundang", "Gwacheon", "Seoul"]);
  return dedupePostings(
    allJobs.edges.flatMap((edge): JobPosting[] => {
      if (!isRecord(edge) || !isRecord(edge.node)) return [];
      const job = edge.node;
      if (job.publish !== true || job.is_public === false) return [];

      const isKoreanPosition =
        Array.isArray(job.cities) &&
        job.cities.some(
          (city) =>
            isRecord(city) &&
            koreanCities.has(toStringValue(city.name)),
        );
      if (!isKoreanPosition) return [];

      const id = toStringValue(job.strapiId);
      const title =
        toStringValue(job.title) || toStringValue(job.title_en);
      if (!id || !title) return [];

      return [
        {
          id,
          companyId: source.id,
          companyName: source.name,
          title,
          url: `https://careers.linecorp.com/ko/jobs/${encodeURIComponent(id)}/`,
          publishedAt: toStringValue(job.start_date) || undefined,
        },
      ];
    }),
  );
};

export const parseGreenhouseJobPostings = (
  data: unknown,
  source: CompanyJobSource,
  isAllowedLocation: (location: string) => boolean = () => true,
): JobPosting[] => {
  if (!isRecord(data) || !Array.isArray(data.jobs)) return [];

  return dedupePostings(
    data.jobs.flatMap((value): JobPosting[] => {
      if (!isRecord(value)) return [];
      const location = isRecord(value.location)
        ? toStringValue(value.location.name)
        : "";
      if (!isAllowedLocation(location)) return [];

      const id = toStringValue(value.id);
      const title = toStringValue(value.title);
      const url = toStringValue(value.absolute_url);
      if (!id || !title || !url) return [];

      return [
        {
          id,
          companyId: source.id,
          companyName: source.name,
          title,
          url,
          publishedAt: toStringValue(value.updated_at) || undefined,
        },
      ];
    }),
  );
};

const isKoreanLocation = (location: string): boolean =>
  /south korea|seoul|korea|대한민국/i.test(location);

export const parseCoupangJobPostings = (
  data: unknown,
  source: CompanyJobSource,
): JobPosting[] =>
  parseGreenhouseJobPostings(data, source, isKoreanLocation);

const parseKakaoBankDate = (value: unknown): number => {
  const raw = toStringValue(value);
  if (!raw) return Number.NaN;
  return Date.parse(`${raw.replace(" ", "T")}+09:00`);
};

export const parseKakaoBankJobPostings = (
  data: unknown,
  source: CompanyJobSource,
  now: Date = new Date(),
): JobPosting[] => {
  if (!isRecord(data) || !Array.isArray(data.list)) return [];

  const nowTime = now.getTime();
  return dedupePostings(
    data.list.flatMap((value): JobPosting[] => {
      if (!isRecord(value)) return [];

      const startTime = parseKakaoBankDate(value.receiveStartDatetime);
      const endTime = parseKakaoBankDate(value.receiveEndDatetime);
      if (
        (Number.isFinite(startTime) && startTime > nowTime) ||
        (Number.isFinite(endTime) && endTime < nowTime)
      ) {
        return [];
      }

      const id = toStringValue(value.recruitNoticeSn);
      const title = toStringValue(value.recruitNoticeName);
      if (!id || !title) return [];

      return [
        {
          id,
          companyId: source.id,
          companyName: source.name,
          title,
          url: `https://recruit.kakaobank.com/jobs/${encodeURIComponent(id)}`,
          publishedAt:
            toStringValue(value.receiveStartDatetime) || undefined,
        },
      ];
    }),
  );
};

export const parseDunamuJobPostings = (
  html: string,
  source: CompanyJobSource,
): JobPosting[] => {
  const postings: JobPosting[] = [];
  const anchorPattern =
    /<a\b[^>]*href=["'](https:\/\/careers\.dunamu\.com\/(?:detail\/(\d+)|careers\/[^"']*?\/detail\/(\d+)))["'][^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(anchorPattern)) {
    const id = match[2] || match[3] || "";
    const titleHtml =
      match[4].match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] || "";
    const title = stripHtml(titleHtml).replace(/\s*-\s*$/, "");
    if (!id || !title) continue;

    postings.push({
      id,
      companyId: source.id,
      companyName: source.name,
      title,
      url: match[1],
    });
  }

  return dedupePostings(postings);
};

export const parseLeverJobPostings = (
  data: unknown,
  source: CompanyJobSource,
): JobPosting[] => {
  if (!Array.isArray(data)) return [];

  return dedupePostings(
    data.flatMap((value): JobPosting[] => {
      if (!isRecord(value)) return [];
      const categories = isRecord(value.categories)
        ? value.categories
        : null;
      const location = categories
        ? toStringValue(categories.location)
        : "";
      if (!isKoreanLocation(location)) return [];

      const id = toStringValue(value.id);
      const title = toStringValue(value.text);
      const url = toStringValue(value.hostedUrl);
      if (!id || !title || !url) return [];

      const createdAt = Number(value.createdAt);
      return [
        {
          id,
          companyId: source.id,
          companyName: source.name,
          title,
          url,
          publishedAt:
            Number.isFinite(createdAt) && createdAt > 0
              ? new Date(createdAt).toISOString()
              : undefined,
        },
      ];
    }),
  );
};

export const parseNinehireJobPostings = (
  data: unknown,
  source: CompanyJobSource,
): JobPosting[] => {
  if (!isRecord(data) || !Array.isArray(data.results)) return [];

  return dedupePostings(
    data.results.flatMap((value): JobPosting[] => {
      if (!isRecord(value)) return [];
      if (value.status !== "in_progress" || value.isPrivate === true) {
        return [];
      }

      const id = toStringValue(value.recruitmentId);
      const title =
        toStringValue(value.externalTitle) || toStringValue(value.title);
      const addressKey = toStringValue(value.addressKey);
      if (!id || !title || !addressKey) return [];

      return [
        {
          id,
          companyId: source.id,
          companyName: source.name,
          title,
          url: new URL(
            `/job_posting/${encodeURIComponent(addressKey)}`,
            source.careersUrl,
          ).toString(),
          publishedAt: toStringValue(value.createdAt) || undefined,
        },
      ];
    }),
  );
};

export const parseAblyJobPostings = (
  html: string,
  source: CompanyJobSource,
): JobPosting[] => {
  const nextDataText =
    html.match(
      /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
    )?.[1] || "";
  if (!nextDataText) return [];

  let data: unknown;
  try {
    data = JSON.parse(nextDataText);
  } catch {
    return [];
  }

  if (!isRecord(data) || !isRecord(data.props)) return [];
  const pageProps = isRecord(data.props.pageProps)
    ? data.props.pageProps
    : null;
  if (!pageProps || !Array.isArray(pageProps.recruits)) return [];

  return dedupePostings(
    pageProps.recruits.flatMap((value): JobPosting[] => {
      if (!isRecord(value)) return [];
      if (value.status !== "in_progress" || value.isPrivate === true) {
        return [];
      }

      const id = toStringValue(value.id);
      const title = toStringValue(value.title);
      const applyUrl = toStringValue(value.applyUrl);
      const addressKey =
        applyUrl.match(/\/job_posting\/([^/?#]+)/i)?.[1] || "";
      if (!id || !title || !addressKey) return [];

      return [
        {
          id,
          companyId: source.id,
          companyName: source.name,
          title,
          url: `https://recruit.ably.team/job_posting/${encodeURIComponent(addressKey)}`,
          publishedAt: toStringValue(value.createdAt) || undefined,
        },
      ];
    }),
  );
};

const fetchNaverJobs = async (
  source: CompanyJobSource,
): Promise<JobPosting[]> =>
  parseNaverJobPostings(await fetchText(source.careersUrl), source);

const fetchDaangnJobs = async (
  source: CompanyJobSource,
): Promise<JobPosting[]> =>
  parseDaangnJobPostings(await fetchText(source.careersUrl), source);

const fetchKakaoJobs = async (
  source: CompanyJobSource,
): Promise<JobPosting[]> => {
  const parts = ["TECHNOLOGY", "BUSINESS_SERVICES", "DESIGN", "STAFF"];
  const firstPages = await Promise.all(
    parts.map(async (part) => {
      const url = new URL("https://careers.kakao.com/public/api/job-list");
      url.search = new URLSearchParams({
        skillSet: "",
        part,
        company: "KAKAO",
        employeeType: "",
        page: "1",
      }).toString();
      const data = await fetchJson(url.toString());
      const totalPage =
        isRecord(data) && Number.isInteger(Number(data.totalPage))
          ? Math.max(1, Number(data.totalPage))
          : 1;
      return { part, data, totalPage };
    }),
  );

  const remainingPages = await Promise.all(
    firstPages.flatMap(({ part, totalPage }) =>
      Array.from({ length: Math.max(0, totalPage - 1) }, async (_, index) => {
        const url = new URL("https://careers.kakao.com/public/api/job-list");
        url.search = new URLSearchParams({
          skillSet: "",
          part,
          company: "KAKAO",
          employeeType: "",
          page: String(index + 2),
        }).toString();
        return fetchJson(url.toString());
      }),
    ),
  );

  return dedupePostings(
    [...firstPages.map(({ data }) => data), ...remainingPages].flatMap((data) =>
      parseKakaoJobPostings(data, source),
    ),
  );
};

const fetchTossJobs = async (
  source: CompanyJobSource,
): Promise<JobPosting[]> =>
  parseTossJobPostings(
    await fetchJson(
      "https://api-public.toss.im/api/v3/ipd-eggnog/career/job-groups",
    ),
    source,
  );

const buildWoowahanUrl = (page: number): string => {
  const url = new URL("https://career.woowahan.com/w1/recruits");
  url.search = new URLSearchParams({
    category: "all:all",
    recruitCampaignSeq: "0",
    all: "all",
    page: String(page),
    size: "100",
    sort: "updateDate,desc",
  }).toString();
  return url.toString();
};

const fetchWoowahanJobs = async (
  source: CompanyJobSource,
): Promise<JobPosting[]> => {
  const firstPage = parseWoowahanJobPostings(
    await fetchJson(buildWoowahanUrl(0)),
    source,
  );
  const remainingPages = await Promise.all(
    Array.from({ length: Math.max(0, firstPage.totalPages - 1) }, (_, index) =>
      fetchJson(buildWoowahanUrl(index + 1)),
    ),
  );

  return dedupePostings([
    ...firstPage.postings,
    ...remainingPages.flatMap(
      (data) => parseWoowahanJobPostings(data, source).postings,
    ),
  ]);
};

const fetchLineJobs = async (
  source: CompanyJobSource,
): Promise<JobPosting[]> =>
  parseLineJobPostings(
    await fetchJson(
      "https://careers.linecorp.com/page-data/ko/jobs/page-data.json?ca=All&ci=Gwacheon%2CBundang&co=East%20Asia",
    ),
    source,
  );

const fetchCoupangJobs = async (
  source: CompanyJobSource,
): Promise<JobPosting[]> =>
  parseCoupangJobPostings(
    await fetchJson(
      "https://boards-api.greenhouse.io/v1/boards/coupang/jobs",
    ),
    source,
  );

const fetchGreenhouseJobs = async (
  source: CompanyJobSource,
  board: string,
): Promise<JobPosting[]> =>
  parseGreenhouseJobPostings(
    await fetchJson(
      `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs`,
    ),
    source,
    isKoreanLocation,
  );

const fetchGreetingJobs = async (
  source: CompanyJobSource,
): Promise<JobPosting[]> =>
  parseGreetingJobPostings(await fetchText(source.careersUrl), source);

const fetchKakaoBankPage = async (pageNumber: number): Promise<unknown> =>
  fetchJson("https://recruit.kakaobank.com/api/recruits", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      pageNumber,
      pageSize: 200,
    }),
  });

const fetchKakaoBankJobs = async (
  source: CompanyJobSource,
): Promise<JobPosting[]> => {
  const firstPage = await fetchKakaoBankPage(1);
  const paging =
    isRecord(firstPage) && isRecord(firstPage.paging)
      ? firstPage.paging
      : null;
  const parsedTotalPages = paging ? Number(paging.totalPages) : 1;
  const totalPages =
    Number.isInteger(parsedTotalPages) && parsedTotalPages > 0
      ? parsedTotalPages
      : 1;
  const remainingPages = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) =>
      fetchKakaoBankPage(index + 2),
    ),
  );

  return dedupePostings(
    [firstPage, ...remainingPages].flatMap((data) =>
      parseKakaoBankJobPostings(data, source),
    ),
  );
};

const fetchDunamuJobs = async (
  source: CompanyJobSource,
): Promise<JobPosting[]> =>
  parseDunamuJobPostings(await fetchText(source.careersUrl), source);

const fetchHyperconnectJobs = async (
  source: CompanyJobSource,
): Promise<JobPosting[]> =>
  parseLeverJobPostings(
    await fetchJson(
      "https://api.lever.co/v0/postings/matchgroup?mode=json",
    ),
    source,
  );

const fetchKakaoStyleJobs = async (
  source: CompanyJobSource,
): Promise<JobPosting[]> => {
  const url = new URL(
    "https://api.ninehire.com/identity-access/homepage/recruitments",
  );
  url.search = new URLSearchParams({
    companyId: "1573cfe0-2c72-11ef-950a-65a32c77a0c3",
    page: "1",
    countPerPage: "100",
    externalTitle: "",
    order: "created_at_desc",
  }).toString();
  return parseNinehireJobPostings(await fetchJson(url.toString()), source);
};

const fetchAblyJobs = async (
  source: CompanyJobSource,
): Promise<JobPosting[]> =>
  parseAblyJobPostings(await fetchText(source.careersUrl), source);

export const fetchCompanyJobPostings = async (
  source: CompanyJobSource,
): Promise<JobPosting[]> => {
  let postings: JobPosting[];

  try {
    switch (source.id) {
      case "naver":
        postings = await fetchNaverJobs(source);
        break;
      case "kakao":
        postings = await fetchKakaoJobs(source);
        break;
      case "toss":
        postings = await fetchTossJobs(source);
        break;
      case "daangn":
        postings = await fetchDaangnJobs(source);
        break;
      case "woowahan":
        postings = await fetchWoowahanJobs(source);
        break;
      case "line":
        postings = await fetchLineJobs(source);
        break;
      case "coupang":
        postings = await fetchCoupangJobs(source);
        break;
      case "musinsa":
      case "bucketplace":
      case "kurly":
        postings = await fetchGreetingJobs(source);
        break;
      case "kakaobank":
        postings = await fetchKakaoBankJobs(source);
        break;
      case "dunamu":
        postings = await fetchDunamuJobs(source);
        break;
      case "hyperconnect":
        postings = await fetchHyperconnectJobs(source);
        break;
      case "sendbird":
        postings = await fetchGreenhouseJobs(source, "sendbird");
        break;
      case "moloco":
        postings = await fetchGreenhouseJobs(source, "moloco");
        break;
      case "kakaostyle":
        postings = await fetchKakaoStyleJobs(source);
        break;
      case "ably":
        postings = await fetchAblyJobs(source);
        break;
    }
  } catch (error) {
    throw new Error(`${source.name} 조회 실패: ${getErrorMessage(error)}`);
  }

  if (postings.length === 0) {
    throw new Error(
      `${source.name} 조회 실패: 공고를 한 건도 추출하지 못했습니다.`,
    );
  }

  return filterTrackedJobPostings(postings);
};
