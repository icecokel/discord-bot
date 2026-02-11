import * as fs from "fs";
import * as path from "path";

const featuresPath = path.join(__dirname, "../src/features");
const registryPath = path.join(__dirname, "../src/core/registry.ts");

const HEADER = `// 이 파일은 scripts/generate-registry.ts에 의해 자동 생성됩니다.
// 수동으로 편집하지 마세요.
// 생성 시각: ${new Date().toISOString()}

import { Command } from "./loader";
`;

function generateRegistry(): void {
  if (!fs.existsSync(featuresPath)) {
    process.stderr.write(
      "[generate-registry] features 디렉토리를 찾을 수 없습니다.\n",
    );
    process.exit(1);
  }

  const featureFolders = fs.readdirSync(featuresPath);
  const imports: string[] = [];
  const exportList: string[] = [];
  let importCounter = 0;

  for (const folder of featureFolders) {
    // admin 폴더는 별도 등록 시스템 사용 (registerAdminCommand)
    if (folder === "admin") continue;

    const commandsPath = path.join(featuresPath, folder, "commands");
    if (!fs.existsSync(commandsPath)) continue;

    const commandFiles = fs
      .readdirSync(commandsPath)
      .filter(
        (file) =>
          file.endsWith(".ts") &&
          !file.endsWith(".test.ts") &&
          !file.endsWith(".spec.ts"),
      );

    for (const file of commandFiles) {
      const importName = `cmd_${importCounter++}`;
      const baseName = path.basename(file, ".ts");
      const relativePath = `../features/${folder}/commands/${baseName}`;

      imports.push(`import ${importName} from "${relativePath}";`);
      exportList.push(importName);
    }
  }

  const fileContent = `${HEADER}
${imports.join("\n")}

export const commands: Command[] = [
  ${exportList.join(",\n  ")},
];
`;

  fs.writeFileSync(registryPath, fileContent, "utf-8");
  process.stdout.write(
    `[generate-registry] ${exportList.length}개 커맨드가 등록된 registry.ts 생성 완료\n`,
  );
}

generateRegistry();
