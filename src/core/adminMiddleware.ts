import { Message } from "discord.js";

/**
 * 어드민 전용 DM 명령어 미들웨어
 * Admin 커맨드인지 확인하고 권한을 검증합니다.
 */

const ADMIN_ID = process.env.ADMIN_ID;

// 어드민 명령어 핸들러 레지스트리
// eslint-disable-next-line @typescript-eslint/ban-types
const adminCommands = new Map<
  string,
  { handler: Function; description: string }
>();

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
  return message.channel.type === 1; // DM 채널 타입
};

/**
 * 어드민 명령어 등록
 */
// eslint-disable-next-line @typescript-eslint/ban-types
export const registerAdminCommand = (
  name: string,
  handler: Function,
  description: string = "No description",
): void => {
  // 접두사 없이 명령어 이름 자체로 등록 (예: "english")
  adminCommands.set(name.toLowerCase(), { handler, description });
};

/**
 * 등록된 어드민 명령어 목록 반환
 */
export const getAdminCommands = (): { name: string; description: string }[] => {
  return Array.from(adminCommands.entries()).map(([name, { description }]) => ({
    name,
    description,
  }));
};

/**
 * 어드민 DM 명령어 처리
 * @returns {boolean} true면 어드민 명령어로 처리됨(실행 완료), false면 일반 명령어로 패스
 */
export const handleAdminCommand = async (
  message: Message,
): Promise<boolean> => {
  const content = message.content.trim();

  // 명령어 파싱 (Prefix 없이 바로 명령어 이름 확인을 위해 공백 기준 분리)
  // 일반적인 커맨드 Prefix (!, /) 등을 고려해야 할 수도 있지만,
  // 기획상 "/english" 처럼 Slash Command 스타일이나 특정 단어로 시작하는지 체크.
  // 여기서는 편의상 "!" 또는 "/" 같은 접두사가 있든 없든 첫 단어를 커맨드로 간주하거나,
  // 요구사항에 맞춰 "/english" 처럼 명시적으로 처리.

  // 요청사항: "/english" -> "english"
  const args = content.split(/ +/);
  let commandName = args[0].toLowerCase();

  // 접두사 처리: "/" 또는 "!" 로 시작하면 제거
  if (commandName.startsWith("/") || commandName.startsWith("!")) {
    commandName = commandName.slice(1);
  }

  // "/admin <명령어>" 형태 처리
  let subArgsStart = 1;

  if (commandName === "admin" && args.length > 1) {
    const subCommandName = args[1].toLowerCase();
    // 두 번째 단어가 등록된 어드민 명령어라면 해당 명령어로 스위칭
    if (adminCommands.has(subCommandName)) {
      commandName = subCommandName;
      subArgsStart = 2; // "/admin", "reset" 이후부터 인자로 취급
    }
  }

  // 1. 등록된 Admin 커맨드인지 확인
  const commandEntry = adminCommands.get(commandName);

  if (!commandEntry) {
    // Admin 전용 커맨드가 아니면 일반 커맨드 핸들러로 넘김
    return false;
  }

  const { handler } = commandEntry;

  console.log(`[AdminMiddleware] Admin command detected: ${commandName}`);

  // 2. Admin 전용 커맨드임. 이제 권한 검사.

  // 3. DM 체크
  if (!isDM(message)) {
    console.log(
      `[AdminMiddleware] Ignored: Not a DM channel. (Channel Type: ${message.channel.type})`,
    );
    // 보안상 무시하는 것이 원칙이나, 디버깅을 위해 잠시 활성화
    // await message.reply("❌ 이 명령어는 DM에서만 사용할 수 있습니다.");
    return false;
  }

  // 4. Admin ID 체크
  if (!isAdmin(message.author.id)) {
    console.log(
      `[AdminMiddleware] Ignored: Unauthorized user. (User ID: ${message.author.id}, Admin ID: ${ADMIN_ID})`,
    );
    // 명시적 에러 메시지 전송 (디버깅용)
    await message.reply(
      `⛔ 관리자 권한이 없습니다. (Your ID: ${message.author.id})`,
    );
    return false;
  }

  // 5. 권한 충족 -> 실행
  console.log(`[AdminMiddleware] Executing command: ${commandName}`);
  const subArgs = args.slice(subArgsStart);
  try {
    await handler(message, subArgs);
  } catch (error) {
    console.error(`[Admin] ${commandName} 명령어 오류:`, error);
    await message.reply("❌ 명령어 실행 중 오류가 발생했습니다.");
  }

  return true; // 처리 완료
};
