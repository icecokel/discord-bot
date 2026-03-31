import fs from "fs";
import path from "path";
import { DATA_DIR } from "./file-manager";

const HISTORY_FILE_PATH = path.join(DATA_DIR, "daily-history.json");
const LEGACY_HISTORY_FILE_PATH = path.join(DATA_DIR, "daily_history.json");

export interface DailyHistoryData {
  english: string[]; // 최근 영어 문장 리스트
}

const createEmptyHistory = (): DailyHistoryData => ({ english: [] });

const normalizeHistory = (value: unknown): DailyHistoryData => {
  const history = value as Partial<Record<keyof DailyHistoryData, unknown>>;

  return {
    english: Array.isArray(history?.english)
      ? history.english.filter((item): item is string => typeof item === "string")
      : [],
  };
};

export class HistoryManager {
  private history: DailyHistoryData;

  constructor() {
    this.history = createEmptyHistory();
    this.loadHistory();
  }

  /**
   * 히스토리 파일 로드
   */
  private loadHistory(): void {
    try {
      const targetPath = fs.existsSync(HISTORY_FILE_PATH)
        ? HISTORY_FILE_PATH
        : LEGACY_HISTORY_FILE_PATH;

      if (fs.existsSync(targetPath)) {
        const data = fs.readFileSync(targetPath, "utf-8");
        this.history = normalizeHistory(JSON.parse(data));
        console.log("[HistoryManager] 히스토리 로드 완료");
      } else {
        console.log("[HistoryManager] 히스토리 파일이 없어 새로 생성합니다.");
        this.saveToFile();
      }
    } catch (error) {
      console.error("[HistoryManager] 히스토리 로드 실패:", error);
      // 실패 시 빈 상태로 시작
      this.history = createEmptyHistory();
    }
  }

  /**
   * 파일에 현재 상태 저장
   */
  private saveToFile(): void {
    try {
      const dirPath = path.dirname(HISTORY_FILE_PATH);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      fs.writeFileSync(
        HISTORY_FILE_PATH,
        JSON.stringify(this.history, null, 2),
        "utf-8",
      );
    } catch (error) {
      console.error("[HistoryManager] 히스토리 파일 저장 실패:", error);
    }
  }

  /**
   * 특정 언어의 최근 문장 리스트 가져오기
   * @param language 'english'
   */
  getRecentContents(language: "english"): string[] {
    return this.history[language] || [];
  }

  /**
   * 새로운 문장을 히스토리에 추가 (최근 30개 유지)
   * @param language 'english'
   * @param content 추가할 문장 (핵심 구문)
   */
  addHistory(language: "english", content: string): void {
    if (!this.history[language]) {
      this.history[language] = [];
    }

    // 중복 제거 후 추가
    const list = this.history[language].filter((item) => item !== content);
    list.push(content);

    // 최대 30개 유지 (오래된 것 삭제)
    if (list.length > 30) {
      list.shift(); // 앞부분(오래된 것) 제거
    }

    this.history[language] = list;
    this.saveToFile();
    console.log(
      `[HistoryManager] ${language} 히스토리 업데이트 완료 (총 ${list.length}개)`,
    );
  }
}

export default new HistoryManager();
