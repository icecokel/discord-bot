import { escapeMarkdown } from "discord.js";
import { X_ACCOUNT } from "../../utils/x-monitor-store";
import type { XPost } from "../../utils/x-monitor-store";

export const getKstHour = (now: Date): number =>
  new Date(now.getTime() + 9 * 60 * 60 * 1000).getUTCHours();

export const isXQuietTime = (now: Date): boolean => {
  const hour = getKstHour(now);
  return hour >= 20 || hour < 6;
};

export const buildXMessages = (posts: XPost[], now: Date) => {
  const title = getKstHour(now) === 6 && new Date(now.getTime() + 9 * 3600_000).getUTCMinutes() < 20
    ? "🌅 X 야간 업데이트" : "🆕 X 미전송 업데이트 모음";
  const header = `${title} · @${X_ACCOUNT} · ${posts.length}건`;
  const chunks: { content: string; ids: string[]; progress: { id: string; sentParts: number }[] }[] = [];
  for (const post of [...posts].sort((a, b) => BigInt(a.id) < BigInt(b.id) ? -1 : 1)) {
    if (!post.translatedText && !post.originalOnly) throw new Error("X 감시 발송 방식이 정해지지 않았습니다.");
    const observed = new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).format(new Date(post.observedAt));
    const text = `**원문${post.textComplete ? "" : " (수집된 일부)"}**\n${escapeMarkdown(post.text)}` +
      (post.originalOnly ? "\n\n**번역 실패 · 원문만 전달**" :
        `\n\n**한국어 번역**\n${escapeMarkdown(post.translatedText!)}`);
    const parts: string[] = [];
    for (let offset = 0; offset < text.length;) {
      const part = text.slice(offset, offset + 1400).replace(/[\uD800-\uDBFF]$/, "");
      parts.push(part);
      offset += part.length;
    }
    if ((post.sentParts || 0) >= parts.length) throw new Error("X 감시 전송 위치가 올바르지 않습니다.");
    for (let index = post.sentParts || 0; index < parts.length; index += 1) {
      const block = `\n\n${parts.length > 1 ? `[본문 ${index + 1}/${parts.length}]\n` : ""}${parts[index]}\n원문 링크: <${post.url}>\n확인: ${observed} KST`;
      let chunk = chunks[chunks.length - 1];
      if (!chunk || chunk.content.length + block.length > 1760) {
        chunk = { content: header, ids: [], progress: [] };
        chunks.push(chunk);
      }
      chunk.content += block;
      chunk.progress.push({ id: post.id, sentParts: index + 1 });
      if (index === parts.length - 1) chunk.ids.push(post.id);
    }
  }
  return chunks.map((chunk, index) => ({
    ...chunk,
    content: chunks.length > 1 ? `${chunk.content}\n(${index + 1}/${chunks.length})` : chunk.content,
  }));
};
