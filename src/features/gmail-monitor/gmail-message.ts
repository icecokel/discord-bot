import { escapeMarkdown } from "discord.js";
import type { GmailMessage } from "./gmail-source";

const MAX_CONTENT_LENGTH = 2000;
const MAX_SUBJECT_LENGTH = 200;

export interface GmailNotificationChunk {
  content: string;
  /** Highest UID included in this chunk; the checkpoint may advance to it once sent. */
  maxUid: number;
}

const formatKst = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
};

const truncate = (text: string, length: number): string =>
  text.length > length ? `${text.slice(0, length).trimEnd()}…` : text;

/** A mail as shown in the DM; `label`/`summary` come from the recruiting filter when it ran. */
export interface GmailMessageView extends GmailMessage {
  label?: string;
  summary?: string;
}

export const formatGmailMessage = (message: GmailMessageView): string => {
  const receivedAt = formatKst(message.receivedAt);
  const lines = [
    `📧 **${escapeMarkdown(truncate(message.subject, MAX_SUBJECT_LENGTH))}**`,
    `보낸 사람: ${escapeMarkdown(truncate(message.from, 200))}${receivedAt ? ` · ${receivedAt}` : ""}`,
  ];
  if (message.summary) {
    lines.push(`> ${message.label ? `[${message.label}] ` : ""}${escapeMarkdown(message.summary)}`);
  } else if (message.snippet) {
    lines.push(`> ${escapeMarkdown(message.snippet)}`);
  }
  if (message.url) lines.push(`<${message.url}>`);
  return lines.join("\n");
};

export const buildGmailNotificationChunks = (
  messages: GmailMessageView[],
  omittedCount: number,
  maxUid: number,
  header?: string,
): GmailNotificationChunk[] => {
  if (!messages.length) return [];
  const total = messages.length + omittedCount;
  header ??=
    `📬 새 Gmail ${total}건` +
    (omittedCount > 0 ? ` · 오래된 ${omittedCount}건은 생략하고 최근 ${messages.length}건만 표시` : "");

  const chunks: GmailNotificationChunk[] = [];
  let content = header;
  let chunkMaxUid = 0;
  for (const message of messages) {
    const block = formatGmailMessage(message);
    const combined = `${content}\n\n${block}`;
    if (combined.length > MAX_CONTENT_LENGTH && chunkMaxUid > 0) {
      chunks.push({ content, maxUid: chunkMaxUid });
      content = block;
    } else {
      content = combined;
    }
    chunkMaxUid = message.uid;
  }
  // Omitted messages are older than every shown one, so the last chunk closes the whole range.
  chunks.push({ content, maxUid: Math.max(chunkMaxUid, maxUid) });
  return chunks;
};
