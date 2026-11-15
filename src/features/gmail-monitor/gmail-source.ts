import { ImapFlow } from "imapflow";
import type { MessageStructureObject, SearchObject } from "imapflow";

export interface GmailConfig {
  address: string;
  appPassword: string;
  mailbox: string;
  query: string;
}

export interface GmailMessage {
  uid: number;
  subject: string;
  from: string;
  receivedAt?: string;
  snippet?: string;
  url?: string;
}

export interface GmailUpdates {
  uidValidity: string;
  uidNext: number;
  /** Highest UID among the new messages, or the previous checkpoint when nothing is new. */
  maxUid: number;
  /** New messages in ascending UID order, limited to the newest `limit`. */
  messages: GmailMessage[];
  /** New messages left out because of `limit`. */
  omittedCount: number;
}

export interface GmailCheckpoint {
  uidValidity: string;
  lastUid: number;
}

export interface GmailSearchResult {
  /** UIDs refer to the mailbox the search ran in (normally All Mail). */
  mailbox: string;
  totalMatches: number;
  messages: GmailMessage[];
}

export interface GmailMessageDetail extends GmailMessage {
  mailbox: string;
  to: string[];
  cc: string[];
  labels: string[];
  attachments: string[];
  body: string;
  bodyTruncated: boolean;
}

const SNIPPET_LENGTH = 180;
const SNIPPET_DOWNLOAD_BYTES = 8 * 1024;
const BODY_DOWNLOAD_BYTES = 128 * 1024;
const MAX_BODY_LENGTH = 12_000;

const isAttachment = (node: MessageStructureObject): boolean =>
  node.disposition?.toLowerCase() === "attachment";

export const findTextPart = (
  node: MessageStructureObject | undefined,
  type: "text/plain" | "text/html",
): string | undefined => {
  if (!node) return undefined;
  if (node.childNodes?.length) {
    for (const child of node.childNodes) {
      const found = findTextPart(child, type);
      if (found) return found;
    }
    return undefined;
  }
  if (node.type.toLowerCase() === type && !isAttachment(node)) {
    // A single-part message has no part number; IMAP addresses its body as "1".
    return node.part || "1";
  }
  return undefined;
};

const decodeEntities = (text: string): string =>
  text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

export const htmlToText = (html: string): string =>
  decodeEntities(
    html
      .replace(/<(style|script|head)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>|<\/(p|div|tr|li|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();

export const toSnippet = (text: string, html = false): string => {
  const plain = html ? htmlToText(text) : text;
  const collapsed = plain
    // Plain-text mail renders images and links as noise that eats the short preview.
    .replace(/\[image:[^\]]*\]/gi, " ")
    .replace(/<?https?:\/\/\S+>?/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return collapsed.length > SNIPPET_LENGTH
    ? `${collapsed.slice(0, SNIPPET_LENGTH).trimEnd()}…`
    : collapsed;
};

export const gmailMessageUrl = (
  address: string,
  emailId: string | undefined,
): string | undefined => {
  if (!emailId || !/^\d+$/.test(emailId)) return undefined;
  return `https://mail.google.com/mail/u/${encodeURIComponent(address)}/#all/${BigInt(emailId).toString(16)}`;
};

type Address = { name?: string; address?: string };

const formatOneAddress = (entry: Address): string | undefined => {
  const name = entry.name?.trim();
  const address = entry.address?.trim();
  if (name && address && name !== address) return `${name} <${address}>`;
  return name || address || undefined;
};

const formatAddress = (addresses: Address[] | undefined): string =>
  (addresses?.[0] && formatOneAddress(addresses[0])) || "(보낸 사람 없음)";

const formatAddressList = (addresses: Address[] | undefined): string[] =>
  (addresses || []).map(formatOneAddress).filter((value): value is string => Boolean(value));

export const listAttachmentNames = (node: MessageStructureObject | undefined): string[] => {
  if (!node) return [];
  if (node.childNodes?.length) return node.childNodes.flatMap(listAttachmentNames);
  const name = node.dispositionParameters?.filename || node.parameters?.name;
  return isAttachment(node) || (name && !node.type.toLowerCase().startsWith("text/"))
    ? [name || node.type]
    : [];
};

const toIsoDate = (value: Date | string | undefined): string | undefined => {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

const readStream = async (stream: NodeJS.ReadableStream): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
};

/** Downloads the readable body (plain text preferred), decoded to UTF-8. */
const downloadBodyText = async (
  client: ImapFlow,
  uid: number,
  structure: MessageStructureObject | undefined,
  maxBytes: number,
): Promise<{ text: string; html: boolean } | undefined> => {
  const plainPart = findTextPart(structure, "text/plain");
  const part = plainPart || findTextPart(structure, "text/html");
  if (!part) return undefined;
  const download = await client.download(String(uid), part, { uid: true, maxBytes });
  if (!("content" in download) || !download.content) return undefined;
  return { text: await readStream(download.content), html: !plainPart };
};

const downloadSnippet = async (
  client: ImapFlow,
  uid: number,
  structure: MessageStructureObject | undefined,
): Promise<string | undefined> => {
  try {
    const body = await downloadBodyText(client, uid, structure, SNIPPET_DOWNLOAD_BYTES);
    return (body && toSnippet(body.text, body.html)) || undefined;
  } catch {
    // The preview is optional; the notification still carries subject and sender.
    return undefined;
  }
};

const withGmail = async <T>(
  config: GmailConfig,
  run: (client: ImapFlow) => Promise<T>,
): Promise<T> => {
  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: config.address, pass: config.appPassword },
    logger: false,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 60_000,
  });
  // ImapFlow emits socket errors as events; an unhandled "error" event would crash the bot.
  client.on("error", () => undefined);

  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.logout().catch(() => client.close());
  }
};

/** Opens a mailbox read-only so nothing here can mark mail as read or move it. */
const withMailbox = async <T>(
  client: ImapFlow,
  path: string,
  run: () => Promise<T>,
): Promise<T> => {
  const lock = await client.getMailboxLock(path, { readOnly: true });
  try {
    return await run();
  } finally {
    lock.release();
  }
};

// Gmail localizes "[Gmail]/All Mail" (e.g. "[Gmail]/전체보관함"), so find it by its special-use flag.
const findAllMailPath = async (client: ImapFlow): Promise<string> => {
  const mailboxes = await client.list();
  return mailboxes.find((mailbox) => mailbox.specialUse === "\\All")?.path || "INBOX";
};

export const fetchGmailUpdates = async (
  config: GmailConfig,
  checkpoint: GmailCheckpoint | null,
  limit: number,
): Promise<GmailUpdates> =>
  withGmail(config, (client) => withMailbox(client, config.mailbox, async () => {
    const mailbox = client.mailbox;
    if (!mailbox) throw new Error("Gmail 메일함을 열지 못했습니다.");
    const uidValidity = mailbox.uidValidity.toString();
    const base = {
      uidValidity,
      uidNext: mailbox.uidNext,
      messages: [],
      omittedCount: 0,
    };

    // No usable checkpoint: report the mailbox position only, so old mail is never sent.
    if (!checkpoint || checkpoint.uidValidity !== uidValidity) {
      return { ...base, maxUid: Math.max(0, mailbox.uidNext - 1) };
    }

    const search: SearchObject = { uid: `${checkpoint.lastUid + 1}:*` };
    if (config.query) search.gmraw = config.query;
    const found = await client.search(search, { uid: true });
    // "N:*" always matches the newest message, even when its UID is below N.
    const uids = (found || [])
      .filter((uid) => uid > checkpoint.lastUid)
      .sort((a, b) => a - b);
    if (!uids.length) {
      return { ...base, maxUid: checkpoint.lastUid };
    }

    const selected = uids.slice(-limit);
    const fetched = await client.fetchAll(
      selected.join(","),
      { uid: true, envelope: true, internalDate: true, bodyStructure: true },
      { uid: true },
    );
    fetched.sort((a, b) => a.uid - b.uid);

    const messages: GmailMessage[] = [];
    for (const message of fetched) {
      messages.push({
        uid: message.uid,
        subject: message.envelope?.subject?.trim() || "(제목 없음)",
        from: formatAddress(message.envelope?.from),
        receivedAt: toIsoDate(message.internalDate || message.envelope?.date),
        snippet: await downloadSnippet(client, message.uid, message.bodyStructure),
        url: gmailMessageUrl(config.address, message.emailId),
      });
    }

    return {
      ...base,
      maxUid: uids[uids.length - 1],
      messages,
      omittedCount: uids.length - selected.length,
    };
  }));

/** Searches All Mail with Gmail search syntax and returns the newest matches first. */
export const searchGmail = async (
  config: GmailConfig,
  query: string,
  limit: number,
): Promise<GmailSearchResult> =>
  withGmail(config, async (client) => {
    const mailbox = await findAllMailPath(client);
    return withMailbox(client, mailbox, async () => {
      const found = await client.search({ gmraw: query || "in:anywhere" }, { uid: true });
      const uids = (found || []).sort((a, b) => a - b);
      const selected = uids.slice(-limit);
      if (!selected.length) return { mailbox, totalMatches: 0, messages: [] };
      const fetched = await client.fetchAll(
        selected.join(","),
        { uid: true, envelope: true, internalDate: true, bodyStructure: true },
        { uid: true },
      );
      fetched.sort((a, b) => b.uid - a.uid);
      const messages: GmailMessage[] = [];
      for (const message of fetched) {
        messages.push({
          uid: message.uid,
          subject: message.envelope?.subject?.trim() || "(제목 없음)",
          from: formatAddress(message.envelope?.from),
          receivedAt: toIsoDate(message.internalDate || message.envelope?.date),
          snippet: await downloadSnippet(client, message.uid, message.bodyStructure),
          url: gmailMessageUrl(config.address, message.emailId),
        });
      }
      return { mailbox, totalMatches: uids.length, messages };
    });
  });

/** Reads one message from All Mail by the UID that searchGmail returned. */
export const readGmail = async (
  config: GmailConfig,
  uid: number,
): Promise<GmailMessageDetail | null> =>
  withGmail(config, async (client) => {
    const mailbox = await findAllMailPath(client);
    return withMailbox(client, mailbox, async () => {
      const message = await client.fetchOne(
        String(uid),
        { uid: true, envelope: true, internalDate: true, bodyStructure: true, labels: true },
        { uid: true },
      );
      if (!message) return null;
      const downloaded = await downloadBodyText(client, uid, message.bodyStructure, BODY_DOWNLOAD_BYTES);
      const text = downloaded ? (downloaded.html ? htmlToText(downloaded.text) : downloaded.text.trim()) : "";
      return {
        uid,
        mailbox,
        subject: message.envelope?.subject?.trim() || "(제목 없음)",
        from: formatAddress(message.envelope?.from),
        to: formatAddressList(message.envelope?.to),
        cc: formatAddressList(message.envelope?.cc),
        receivedAt: toIsoDate(message.internalDate || message.envelope?.date),
        labels: [...(message.labels || [])],
        attachments: listAttachmentNames(message.bodyStructure),
        url: gmailMessageUrl(config.address, message.emailId),
        body: text.slice(0, MAX_BODY_LENGTH),
        bodyTruncated: text.length > MAX_BODY_LENGTH,
      };
    });
  });
