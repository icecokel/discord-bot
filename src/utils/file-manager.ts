import fs from "fs";
import path from "path";

// __dirname:
//   - dev: src/utils/
//   - prod: projects/discord-bot/ (dist 내용물이 루트로 배포됨)
// target: data/
export const DATA_DIR =
  process.env.NODE_ENV === "production"
    ? path.join(__dirname, "data")
    : path.join(__dirname, "../data");

/**
 * JSON 파일 읽기
 */
export const readJson = <T = any>(
  filename: string,
  defaultValue: T = {} as T,
): T => {
  const filePath = path.join(DATA_DIR, filename);
  let data: string;
  try {
    if (!fs.existsSync(filePath)) {
      return defaultValue;
    }
    data = fs.readFileSync(filePath, "utf8");
  } catch (error: any) {
    console.error(`[FileManager] Error reading ${filename}:`, error.message);
    return defaultValue;
  }

  try {
    return JSON.parse(data) as T;
  } catch (error: any) {
    console.error(`[FileManager] Error parsing ${filename}:`, error.message);

    try {
      let timestamp = Date.now();
      let corruptPath = `${filePath}.corrupt-${timestamp}-${process.pid}`;
      while (fs.existsSync(corruptPath)) {
        timestamp += 1;
        corruptPath = `${filePath}.corrupt-${timestamp}-${process.pid}`;
      }
      fs.renameSync(filePath, corruptPath);
    } catch (preservationError: any) {
      console.error(
        `[FileManager] Error preserving corrupt ${filename}:`,
        preservationError.message,
      );
    }

    return defaultValue;
  }
};

/**
 * JSON 파일 쓰기
 */
export const writeJson = (filename: string, data: any): boolean => {
  let temporaryPath: string | undefined;

  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    const filePath = path.join(DATA_DIR, filename);
    const directoryPath = path.dirname(filePath);
    const basename = path.basename(filePath);
    let timestamp = Date.now();
    temporaryPath = path.join(
      directoryPath,
      `.${basename}.${timestamp}-${process.pid}.tmp`,
    );
    while (fs.existsSync(temporaryPath)) {
      timestamp += 1;
      temporaryPath = path.join(
        directoryPath,
        `.${basename}.${timestamp}-${process.pid}.tmp`,
      );
    }

    fs.writeFileSync(temporaryPath, JSON.stringify(data, null, 2), "utf8");
    fs.renameSync(temporaryPath, filePath);
    return true;
  } catch (error: any) {
    if (temporaryPath) {
      try {
        fs.unlinkSync(temporaryPath);
      } catch {
        // Cleanup is best-effort; preserve the original write error.
      }
    }
    console.error(`[FileManager] Error writing ${filename}:`, error.message);
    return false;
  }
};
