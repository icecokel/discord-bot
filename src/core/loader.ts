import { commands as commandList } from "./registry";
import { Message } from "discord.js";

export interface Command {
  name: string;
  description?: string;
  keywords?: string[];
  execute: (message: Message, args: string[]) => Promise<unknown> | void;
}

/**
 * 커맨드 객체 타입 가드
 */
const isCommand = (value: unknown): value is Command => {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.name === "string" && typeof obj.execute === "function";
};

export const loadCommands = (): Map<string, Command> => {
  const commands = new Map<string, Command>();

  for (const command of commandList) {
    if (isCommand(command)) {
      commands.set(command.name, command);
    }
  }

  return commands;
};
