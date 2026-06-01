import { Client } from "discord.js";

interface GuildLeaveTarget {
  id: string;
  name: string;
  ownerId?: string | null;
  leave: () => Promise<unknown>;
}

export interface GuildLeaveSummaryItem {
  id: string;
  name: string;
}

export interface GuildLeaveFailure extends GuildLeaveSummaryItem {
  reason: string;
}

export interface GuildLeaveResult {
  left: GuildLeaveSummaryItem[];
  failed: GuildLeaveFailure[];
  skippedOwned: GuildLeaveSummaryItem[];
}

const getErrorReason = (error: unknown): string => {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Unknown error";
};

export const leaveJoinedGuilds = async (
  client: Pick<Client, "guilds" | "user">,
): Promise<GuildLeaveResult> => {
  const result: GuildLeaveResult = {
    left: [],
    failed: [],
    skippedOwned: [],
  };
  const botUserId = client.user?.id;
  const guilds = Array.from(
    client.guilds.cache.values(),
  ) as GuildLeaveTarget[];

  for (const guild of guilds) {
    const item = { id: guild.id, name: guild.name };

    if (botUserId && guild.ownerId === botUserId) {
      result.skippedOwned.push(item);
      continue;
    }

    try {
      await guild.leave();
      result.left.push(item);
    } catch (error) {
      result.failed.push({
        ...item,
        reason: getErrorReason(error),
      });
    }
  }

  return result;
};

export const logGuildLeaveResult = (result: GuildLeaveResult): void => {
  for (const guild of result.left) {
    console.log(`[GuildLeaver] 서버 탈퇴 완료: ${guild.name} (${guild.id})`);
  }

  for (const guild of result.skippedOwned) {
    console.warn(
      `[GuildLeaver] 봇이 소유자인 서버는 탈퇴할 수 없어 스킵: ${guild.name} (${guild.id})`,
    );
  }

  for (const guild of result.failed) {
    console.error(
      `[GuildLeaver] 서버 탈퇴 실패: ${guild.name} (${guild.id}) - ${guild.reason}`,
    );
  }

  console.log(
    `[GuildLeaver] 처리 결과: 탈퇴 ${result.left.length}개, 실패 ${result.failed.length}개, 소유 서버 스킵 ${result.skippedOwned.length}개`,
  );
};
