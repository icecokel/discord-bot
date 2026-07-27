import { Message } from "discord.js";
import { registerAdminCommand } from "../../../core/admin-middleware";
import {
  COMPANY_JOB_SOURCES,
  fetchCompanyJobPostings,
} from "../../job-monitor/company-job-sources";
import type {
  CompanyJobSource,
  JobPosting,
} from "../../job-monitor/company-job-sources";
import { buildCurrentJobPostingMessages } from "../../job-monitor/job-notification-message";

interface CurrentJobPostingsResult {
  postings: JobPosting[];
  failedSources: CompanyJobSource[];
}

export const getCurrentJobPostings = async (): Promise<CurrentJobPostingsResult> => {
  const results = await Promise.allSettled(
    COMPANY_JOB_SOURCES.map((source) => fetchCompanyJobPostings(source)),
  );
  const postings: JobPosting[] = [];
  const failedSources: CompanyJobSource[] = [];

  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      postings.push(...result.value);
      return;
    }

    failedSources.push(COMPANY_JOB_SOURCES[index]);
  });

  return { postings, failedSources };
};

const buildFailureNotice = (failedSources: CompanyJobSource[]): string =>
  failedSources.length === 0
    ? ""
    : `\n⚠️ ${failedSources.length}개 회사 조회 실패: ${failedSources
        .map((source) => source.name)
        .join(", ")}`;

const sendFollowUp = async (message: Message, text: string): Promise<void> => {
  if (message.channel.isSendable()) {
    await message.channel.send(text);
    return;
  }

  await message.reply(text);
};

const handleJobPostings = async (message: Message): Promise<void> => {
  const { postings, failedSources } = await getCurrentJobPostings();
  const failureNotice = buildFailureNotice(failedSources);

  if (postings.length === 0) {
    const text =
      failedSources.length === COMPANY_JOB_SOURCES.length
        ? "❌ 채용공고를 조회하지 못했습니다."
        : "💼 현재 감시 직군의 채용공고가 없습니다.";
    await message.reply(`${text}${failureNotice}`);
    return;
  }

  const messages = buildCurrentJobPostingMessages(postings);
  await message.reply(messages[0]);
  for (const text of messages.slice(1)) {
    await sendFollowUp(message, text);
  }

  if (failureNotice) {
    await sendFollowUp(message, failureNotice.trim());
  }
};

registerAdminCommand(
  "채용공고",
  handleJobPostings,
  "현재 감시 직군 채용공고 즉시 조회",
);

export { handleJobPostings };
