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

export interface JobPostingMessageChunk {
  content: string;
  postings: JobPosting[];
}

const buildJobPostingMessageChunks = (
  postings: JobPosting[],
  title: string,
  continuationTitle: string,
): JobPostingMessageChunk[] => {
  if (postings.length === 0) return [];

  const grouped = new Map<string, JobPosting[]>();
  for (const posting of postings) {
    const companyPostings = grouped.get(posting.companyName) || [];
    companyPostings.push(posting);
    grouped.set(posting.companyName, companyPostings);
  }

  const lines: { text: string; posting?: JobPosting }[] = [];
  for (const [companyName, companyPostings] of grouped) {
    lines.push({ text: `\n**${companyName}**` });
    for (const posting of companyPostings) {
      const title = escapeMarkdownLinkText(truncateTitle(posting.title));
      lines.push({ text: `• [${title}](<${posting.url}>)`, posting });
    }
  }

  const messages: JobPostingMessageChunk[] = [];
  let current = title;
  let currentPostings: JobPosting[] = [];
  for (const line of lines) {
    const candidate = `${current}\n${line.text}`;
    if (candidate.length <= SAFE_MESSAGE_LIMIT) {
      current = candidate;
      if (line.posting) currentPostings.push(line.posting);
      continue;
    }

    if (currentPostings.length > 0) {
      messages.push({ content: current, postings: currentPostings });
      current = `${continuationTitle}\n${line.text}`;
      currentPostings = line.posting ? [line.posting] : [];
    } else {
      current = candidate;
      if (line.posting) currentPostings.push(line.posting);
    }
  }
  messages.push({ content: current, postings: currentPostings });

  return messages.map((message) => ({
    ...message,
    content:
      message.content.length <= DISCORD_MESSAGE_LIMIT
        ? message.content
        : message.content.slice(0, DISCORD_MESSAGE_LIMIT),
  }));
};

export const buildJobPostingNotificationChunks = (
  postings: JobPosting[],
): JobPostingMessageChunk[] =>
  buildJobPostingMessageChunks(
    postings,
    `💼 **새 채용공고 ${postings.length}건**`,
    "💼 **새 채용공고 (계속)**",
  );

export const buildJobPostingNotificationMessages = (
  postings: JobPosting[],
): string[] =>
  buildJobPostingNotificationChunks(postings).map(({ content }) => content);

export const buildCurrentJobPostingMessages = (
  postings: JobPosting[],
): string[] =>
  buildJobPostingMessageChunks(
    postings,
    `💼 **현재 감시 직군 채용공고 ${postings.length}건**`,
    "💼 **현재 감시 직군 채용공고 (계속)**",
  ).map(({ content }) => content);
