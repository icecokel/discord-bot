import type { JobPosting } from "./company-job-sources";

const DISCORD_MESSAGE_LIMIT = 2_000;
const SAFE_MESSAGE_LIMIT = 1_900;
const MAX_TITLE_LENGTH = 160;

const escapeMarkdownLinkText = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/\[/g, "\\[").replace(/\]/g, "\\]");

const truncateTitle = (title: string): string =>
  title.length <= MAX_TITLE_LENGTH
    ? title
    : `${title.slice(0, MAX_TITLE_LENGTH - 1)}…`;

const buildJobPostingMessages = (
  postings: JobPosting[],
  title: string,
  continuationTitle: string,
): string[] => {
  if (postings.length === 0) return [];

  const grouped = new Map<string, JobPosting[]>();
  for (const posting of postings) {
    const companyPostings = grouped.get(posting.companyName) || [];
    companyPostings.push(posting);
    grouped.set(posting.companyName, companyPostings);
  }

  const lines: string[] = [];
  for (const [companyName, companyPostings] of grouped) {
    lines.push(`\n**${companyName}**`);
    for (const posting of companyPostings) {
      const title = escapeMarkdownLinkText(truncateTitle(posting.title));
      lines.push(`• [${title}](<${posting.url}>)`);
    }
  }

  const messages: string[] = [];
  let current = title;
  for (const line of lines) {
    const candidate = `${current}\n${line}`;
    if (candidate.length <= SAFE_MESSAGE_LIMIT) {
      current = candidate;
      continue;
    }

    messages.push(current);
    current = `${continuationTitle}\n${line}`;
  }
  messages.push(current);

  return messages.map((message) =>
    message.length <= DISCORD_MESSAGE_LIMIT
      ? message
      : message.slice(0, DISCORD_MESSAGE_LIMIT),
  );
};

export const buildJobPostingNotificationMessages = (
  postings: JobPosting[],
): string[] =>
  buildJobPostingMessages(
    postings,
    `💼 **새 채용공고 ${postings.length}건**`,
    "💼 **새 채용공고 (계속)**",
  );

export const buildCurrentJobPostingMessages = (
  postings: JobPosting[],
): string[] =>
  buildJobPostingMessages(
    postings,
    `💼 **현재 감시 직군 채용공고 ${postings.length}건**`,
    "💼 **현재 감시 직군 채용공고 (계속)**",
  );
