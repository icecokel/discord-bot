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
  try {
    const filePath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return defaultValue;
    }
    const data = fs.readFileSync(filePath, "utf8");
    return JSON.parse(data) as T;
  } catch (error: any) {
    console.error(`[FileManager] Error reading ${filename}:`, error.message);
    return defaultValue;
  }
};

/**
 * JSON 파일 쓰기
 */
export const writeJson = (filename: string, data: any): boolean => {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const filePath = path.join(DATA_DIR, filename);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
    return true;
  } catch (error: any) {
    console.error(`[FileManager] Error writing ${filename}:`, error.message);
    return false;
  }
};
