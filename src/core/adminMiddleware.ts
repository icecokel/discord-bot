import { Message } from "discord.js";

/**
 * 어드민 전용 DM 명령어 미들웨어
 * /admin 명령어를 처리하고 권한을 검증합니다.
 */

const ADMIN_ID = process.env.ADMIN_ID;
const ADMIN_PREFIX = "/admin";

// 어드민 명령어 핸들러 레지스트리
// eslint-disable-next-line @typescript-eslint/ban-types
const adminCommands = new Map<string, Function>();

/**
 * 어드민 여부 확인
 */
export const isAdmin = (userId: string): boolean => {
  return userId === ADMIN_ID;
};

/**
 * DM 채널 여부 확인
 */
export const isDM = (message: Message): boolean => {
  return message.channel.type === 1; // DM 채널 타입 (Discord.js enum 사용 권장되나 1로 유지)
};

/**
 * 어드민 명령어 등록
 */
// eslint-disable-next-line @typescript-eslint/ban-types
export const registerAdminCommand = (name: string, handler: Function): void => {
  adminCommands.set(name, handler);
};

/**
 * 어드민 DM 명령어 처리
 */
export const handleAdminCommand = async (
  message: Message,
): Promise<boolean> => {
  const content = message.content.trim();

  // /admin으로 시작하지 않으면 스킵
  if (!content.startsWith(ADMIN_PREFIX)) {
    return false;
  }

  // DM 채널인지 확인
  if (!isDM(message)) {
    await message.reply("❌ 어드민 명령어는 DM에서만 사용할 수 있습니다.");
    return true;
  }

  // 어드민 권한 확인
  if (!isAdmin(message.author.id)) {
    await message.reply("❌ 어드민 권한이 없습니다.");
    return true;
  }

  // 명령어 파싱: /admin <subcommand> [args...]
  const args = content.slice(ADMIN_PREFIX.length).trim().split(/ +/);
  const subcommand = args[0]?.toLowerCase() || "help";
  const subArgs = args.slice(1);

  // 등록된 명령어 실행
  const handler = adminCommands.get(subcommand);

  if (handler) {
    try {
      await handler(message, subArgs);
    } catch (error) {
      console.error(`[Admin] ${subcommand} 명령어 오류:`, error);
      await message.reply("❌ 명령어 실행 중 오류가 발생했습니다.");
    }
  } else {
    // 도움말 표시
    const availableCommands = [...adminCommands.keys()].join(", ");
    await message.reply(
      `📋 **어드민 명령어 목록**\n사용 가능한 명령어: \`${availableCommands || "없음"}\`\n\n` +
        `사용법: \`/admin <명령어> [인자...]\``,
    );
  }

  return true;
};
