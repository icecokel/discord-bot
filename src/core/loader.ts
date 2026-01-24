import { commands as commandList } from "./registry";
import { Message } from "discord.js";

export interface Command {
  name: string;
  description?: string;
  keywords?: string[];
  execute: (message: Message, args: string[]) => Promise<void>;
}

export function loadCommands(): Map<string, Command> {
  const commands = new Map<string, Command>();

  for (const command of commandList) {
    // any 타입으로 캐스팅하여 속성 확인, 추후 Command 타입이 명확해지면 수정
    const cmd = command as any;
    if ("name" in cmd && "execute" in cmd) {
      commands.set(cmd.name, cmd as Command);
      console.log(`[Loader] Loaded command: ${cmd.name}`);
    } else {
      console.warn(
        `[Loader] A command is missing a required "name" or "execute" property.`,
      );
    }
  }

  return commands;
}
