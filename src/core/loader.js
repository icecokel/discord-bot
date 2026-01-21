const fs = require("fs");
const path = require("path");

function loadCommands() {
  const commands = new Map(); // Collection 대신 Map 사용 (discord.js 의존성 제거)
  const featuresPath = path.join(__dirname, "../features");

  // features 폴더가 없으면 빈 맵 반환
  if (!fs.existsSync(featuresPath)) return commands;

  const featureFolders = fs.readdirSync(featuresPath);

  for (const folder of featureFolders) {
    const commandsPath = path.join(featuresPath, folder, "commands");

    if (fs.existsSync(commandsPath)) {
      const commandFiles = fs
        .readdirSync(commandsPath)
        .filter((file) => file.endsWith(".js"));

      for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);

        // 명령에 필요한 속성이 있는지 확인
        if ("name" in command && "execute" in command) {
          commands.set(command.name, command);
          console.log(`[Loader] Loaded command: ${command.name} (${folder})`);
        } else {
          console.warn(
            `[Loader] The command at ${filePath} is missing a required "name" or "execute" property.`,
          );
        }
      }
    }
  }

  return commands;
}

module.exports = { loadCommands };
