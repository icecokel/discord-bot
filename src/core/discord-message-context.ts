import { writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Message } from "discord.js";

const MAX_IMAGE_ATTACHMENTS = 4;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_CONTEXT_DIR_PREFIX = "discord-bot-hermes-";

type AttachmentLike = {
  id?: string;
  name?: string | null;
  contentType?: string | null;
  size?: number;
  url?: string;
};

type MessageWithAttachments = Pick<
  Message,
  "attachments" | "author" | "channel" | "content"
>;

const IMAGE_EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "image/gif": ".gif",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

const getAttachments = (message: MessageWithAttachments): AttachmentLike[] => {
  return [...(message.attachments?.values() || [])];
};

const isImageAttachment = (attachment: AttachmentLike): boolean => {
  if (attachment.contentType?.startsWith("image/")) return true;
  return /\.(gif|jpe?g|png|webp)$/i.test(attachment.name || "");
};

const getSafeExtension = (attachment: AttachmentLike): string => {
  const contentType = attachment.contentType || "";
  if (IMAGE_EXTENSION_BY_CONTENT_TYPE[contentType]) {
    return IMAGE_EXTENSION_BY_CONTENT_TYPE[contentType];
  }

  const extension = path.extname(attachment.name || "").toLowerCase();
  if (/^\.(gif|jpe?g|png|webp)$/.test(extension)) return extension;
  return ".img";
};

const downloadImageAttachment = async (
  attachment: AttachmentLike,
  index: number,
): Promise<string> => {
  if (!attachment.url) {
    return "download_status: skipped_missing_url";
  }

  if ((attachment.size || 0) > MAX_IMAGE_BYTES) {
    return `download_status: skipped_too_large max_bytes: ${MAX_IMAGE_BYTES}`;
  }

  try {
    const response = await fetch(attachment.url);
    if (!response.ok) {
      return `download_status: failed_http_${response.status}`;
    }

    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
      return `download_status: skipped_too_large max_bytes: ${MAX_IMAGE_BYTES}`;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_IMAGE_BYTES) {
      return `download_status: skipped_too_large max_bytes: ${MAX_IMAGE_BYTES}`;
    }

    const directory = await mkdtemp(path.join(tmpdir(), IMAGE_CONTEXT_DIR_PREFIX));
    const filePath = path.join(
      directory,
      `attachment-${index}${getSafeExtension(attachment)}`,
    );
    await writeFile(filePath, buffer);
    return `download_status: downloaded\nlocal_file: ${filePath}`;
  } catch (error: any) {
    return `download_status: failed ${error.message}`;
  }
};

export const hasDiscordAttachments = (
  message: Partial<Pick<Message, "attachments">>,
): boolean => {
  return (message.attachments?.size || 0) > 0;
};

export const buildDiscordMessageContext = async (
  message: MessageWithAttachments,
): Promise<string> => {
  const attachments = getAttachments(message);
  const parts: string[] = [
    "Discord bridge context:",
    "- Discord 쓰기/삭제/관리 도구는 제공되지 않습니다.",
    "- 최종 응답 전송은 discord-bot이 담당합니다.",
    "- 채널 히스토리는 제공되지 않습니다.",
    "",
    "현재 메시지:",
    `author_id: ${message.author.id}`,
    `author_tag: ${message.author.tag}`,
    `channel_id: ${message.channel.id}`,
    `channel_type: ${message.channel.type}`,
    `content: ${message.content.trim() || "(텍스트 없음)"}`,
  ];

  if (attachments.length === 0) {
    return parts.join("\n");
  }

  parts.push("", "첨부:");

  let downloadedImages = 0;
  for (let index = 0; index < attachments.length; index += 1) {
    const attachment = attachments[index];
    const attachmentNumber = index + 1;
    const isImage = isImageAttachment(attachment);

    parts.push(
      `첨부 ${attachmentNumber}:`,
      `name: ${attachment.name || "(이름 없음)"}`,
      `content_type: ${attachment.contentType || "(unknown)"}`,
      `size_bytes: ${attachment.size || 0}`,
      `url: ${attachment.url || "(url 없음)"}`,
      `is_image: ${isImage}`,
    );

    if (isImage && downloadedImages < MAX_IMAGE_ATTACHMENTS) {
      downloadedImages += 1;
      parts.push(await downloadImageAttachment(attachment, attachmentNumber));
    } else if (isImage) {
      parts.push(`download_status: skipped_image_limit max_images: ${MAX_IMAGE_ATTACHMENTS}`);
    } else {
      parts.push("download_status: skipped_not_image");
    }

    if (index < attachments.length - 1) {
      parts.push("");
    }
  }

  return parts.join("\n");
};
