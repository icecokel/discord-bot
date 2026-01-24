/**
 * 명령어 실행 로그를 메모리에 저장하는 유틸리티
 * 최대 100개의 로그 항목을 유지합니다.
 */

const MAX_LOGS = 100;

export interface LogEntry {
  userId: string;
  userName: string;
  command: string;
  args: string[];
  [key: string]: any;
}

export interface StoredLogEntry extends LogEntry {
  timestamp: string;
}

// 메모리 기반 로그 저장소
const logs: StoredLogEntry[] = [];

/**
 * 로그 항목 추가
 */
export const log = (entry: LogEntry): void => {
  const logEntry: StoredLogEntry = {
    timestamp: new Date().toISOString(),
    ...entry,
  };

  logs.unshift(logEntry);

  // 최대 개수 초과 시 오래된 로그 제거
  if (logs.length > MAX_LOGS) {
    logs.pop();
  }
};

/**
 * 최근 N개 로그 반환
 */
export const getRecentLogs = (count: number = 10): StoredLogEntry[] => {
  return logs.slice(0, count);
};

/**
 * 전체 로그 개수 반환
 */
export const getLogCount = (): number => {
  return logs.length;
};

/**
 * 로그 초기화 (테스트용)
 */
export const clearLogs = (): void => {
  logs.length = 0;
};
