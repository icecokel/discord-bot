import fs from "fs";
import path from "path";
import { DATA_DIR } from "./fileManager";

const HISTORY_FILE_PATH = path.join(DATA_DIR, "daily_history.json");

export interface DailyHistoryData {
  english: string[]; // 최근 영어 문장 리스트
  japanese: string[]; // 최근 일본어 문장 리스트
}

export class HistoryManager {
  private history: DailyHistoryData;

  constructor() {
    this.history = { english: [], japanese: [] };
    this.loadHistory();
  }

  /**
   * 히스토리 파일 로드
   */
  private loadHistory(): void {
    try {
      if (fs.existsSync(HISTORY_FILE_PATH)) {
        const data = fs.readFileSync(HISTORY_FILE_PATH, "utf-8");
        this.history = JSON.parse(data);
        console.log("[HistoryManager] 히스토리 로드 완료");
      } else {
        console.log("[HistoryManager] 히스토리 파일이 없어 새로 생성합니다.");
        this.saveToFile();
      }
    } catch (error) {
      console.error("[HistoryManager] 히스토리 로드 실패:", error);
      // 실패 시 빈 상태로 시작
      this.history = { english: [], japanese: [] };
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
   * @param language 'english' | 'japanese'
   */
  getRecentContents(language: "english" | "japanese"): string[] {
    return this.history[language] || [];
  }

  /**
   * 새로운 문장을 히스토리에 추가 (최근 30개 유지)
   * @param language 'english' | 'japanese'
   * @param content 추가할 문장 (핵심 구문)
   */
  addHistory(language: "english" | "japanese", content: string): void {
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
