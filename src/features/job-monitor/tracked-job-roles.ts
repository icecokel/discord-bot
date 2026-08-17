const TRACKED_JOB_TITLE_PATTERNS: readonly RegExp[] = [
  /(?:^|[^a-z])front[\s-]?end(?:[^a-z]|$)/i,
  /(?:^|[^a-z])full[\s-]?stack(?:[^a-z]|$)/i,
  /프론트\s*엔드|풀\s*스택/i,
  /\bFE\s*(?:Engineer|Developer)\b/,
  /\bFE\s*(?:엔지니어|개발자)/,
  /(?:^|[^a-z])AX\s*(?:software\s*)?(?:engineer|developer)(?:[^a-z]|$)/i,
  /AX\s*(?:소프트웨어\s*)?(?:엔지니어|개발자)/i,
  /AI\s*(?:transformation|전환)\s*(?:engineer|developer|엔지니어|개발자)/i,
  /(?:product|프로덕트|제품)\s*(?:software\s*)?(?:engineer|developer|엔지니어|개발자)/i,
  /(?:engineer|developer|엔지니어|개발자)\s*(?:,|-|\/)?\s*(?:product|프로덕트|제품)(?:$|[\s(/_-])/i,
];

export const TRACKED_JOB_FILTER_VERSION = 1;

export const TRACKED_JOB_ROLE_NAMES = [
  "프론트엔드",
  "풀스택",
  "AX 엔지니어",
  "Product Engineer",
] as const;

export const isTrackedJobTitle = (title: string): boolean => {
  const normalizedTitle = title.normalize("NFKC").trim();
  return TRACKED_JOB_TITLE_PATTERNS.some((pattern) =>
    pattern.test(normalizedTitle),
  );
};

export const filterTrackedJobPostings = <T extends { title: string }>(
  postings: readonly T[],
): T[] => postings.filter((posting) => isTrackedJobTitle(posting.title));
