import { Message } from "discord.js";
import { log } from "../utils/logger";
import { Command } from "./loader";

const PREFIX = "!";

/**
 * 커맨드 실행 핸들러
 */
export const handleCommand = async (
  message: Message,
  commands: Map<string, Command>,
): Promise<void> => {
  const content = message.content.trim();

  // 1. Prefix 확인
  if (!content.startsWith(PREFIX)) return;

  // 2. 커맨드 및 인자 파싱
  const args = content.slice(PREFIX.length).trim().split(/ +/);
  const commandName = args[0].toLowerCase();

  // 3. 커맨드 찾기 (이름 또는 키워드 매칭)
  const command = [...commands.values()].find(
    (cmd) =>
      cmd.name === commandName ||
      (cmd.keywords &&
        cmd.keywords.some((keyword) => keyword.toLowerCase() === commandName)),
  );

  if (!command) return;

  try {
    // 4. 로그 기록
    log({
      userId: message.author.id,
      userName: message.author.tag,
      command: command.name,
      args: args.slice(1),
    });

    console.log(
      `[Command] ${command.name} executed by ${message.author.tag} (${message.author.id})`,
    );

    // 5. 커맨드 실행
    await command.execute(message, args.slice(1));
  } catch (error) {
    console.error(`[Command] Execution error for ${command.name}:`, error);
    message.reply("명령어를 실행하는 중에 오류가 발생했습니다.");
  }
};
