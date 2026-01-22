const { commands: commandList } = require("./registry");

function loadCommands() {
  const commands = new Map();

  for (const command of commandList) {
    if ("name" in command && "execute" in command) {
      commands.set(command.name, command);
      console.log(`[Loader] Loaded command: ${command.name}`);
    } else {
      console.warn(
        `[Loader] A command is missing a required "name" or "execute" property.`,
      );
    }
  }

  return commands;
}

module.exports = { loadCommands };
