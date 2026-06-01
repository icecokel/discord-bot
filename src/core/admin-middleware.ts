import { Message } from "discord.js";

/**
 * 관리자 전용 DM 명령어 미들웨어
 */

const getAdminId = (): string | undefined => process.env.ADMIN_ID;

// 관리자 명령어 핸들러 타입
type AdminHandler = (message: Message, args: string[]) => Promise<unknown>;

// 관리자 명령어 핸들러 레지스트리
const adminCommands = new Map<
  string,
  { handler: AdminHandler; description: string }
>();

/**
 * 관리자 여부 확인
 */
export const isAdmin = (userId: string): boolean => {
  return userId === getAdminId();
};

/**
 * DM 채널 여부 확인
 */
export const isDM = (message: Message): boolean => {
  return message.channel.type === 1; // DM 채널 타입
};

/**
 * 관리자 명령어 등록
 */
export const registerAdminCommand = (
  name: string,
  handler: AdminHandler,
  description: string = "No description",
): void => {
  // 접두사 없이 명령어 이름 자체로 등록
  adminCommands.set(name.toLowerCase(), { handler, description });
};

/**
 * 등록된 관리자 명령어 목록 반환
 */
export const getAdminCommands = (): { name: string; description: string }[] => {
  return Array.from(adminCommands.entries()).map(([name, { description }]) => ({
    name,
    description,
  }));
};

export const executeAdminCommand = async (
  message: Message,
  commandName: string,
  args: string[] = [],
): Promise<boolean> => {
  const commandEntry = adminCommands.get(commandName.toLowerCase());
  if (!commandEntry) return false;

  if (!isDM(message)) {
    console.log(
      `[AdminMiddleware] Ignored: Not a DM channel. (Channel Type: ${message.channel.type})`,
    );
    return false;
  }

  if (!isAdmin(message.author.id)) {
    const adminId = getAdminId();
    console.log(
      `[AdminMiddleware] Ignored: Unauthorized user. (User ID: ${message.author.id}, Admin ID: ${adminId})`,
    );
    await message.reply(
      `⛔ 관리자 권한이 없습니다. (Your ID: ${message.author.id})`,
    );
    return false;
  }

  console.log(`[AdminMiddleware] Executing command: ${commandName}`);
  try {
    await commandEntry.handler(message, args);
  } catch (error) {
    console.error(`[Admin] ${commandName} 명령어 오류:`, error);
    await message.reply("❌ 명령어 실행 중 오류가 발생했습니다.");
  }

  return true;
};

/**
 * 관리자 DM 명령어 처리
 * @returns true면 관리자 명령어로 처리됨, false면 다음 핸들러로 패스
 */
export const handleAdminCommand = async (
  message: Message,
): Promise<boolean> => {
  const content = message.content.trim();

  const args = content.split(/ +/);
  let commandName = args[0].toLowerCase();

  // 접두사 처리: "/" 또는 "!" 로 시작하면 제거
  if (commandName.startsWith("/") || commandName.startsWith("!")) {
    commandName = commandName.slice(1);
  }

  // "/관리자 <명령어>" 형태 처리
  let subArgsStart = 1;

  if (commandName === "관리자" && args.length > 1) {
    const subCommandName = args[1].toLowerCase();
    if (adminCommands.has(subCommandName)) {
      commandName = subCommandName;
      subArgsStart = 2;
    }
  }

  const commandEntry = adminCommands.get(commandName);

  if (!commandEntry) {
    return false;
  }

  console.log(`[AdminMiddleware] Admin command detected: ${commandName}`);
  const subArgs = args.slice(subArgsStart);
  return executeAdminCommand(message, commandName, subArgs);
};
