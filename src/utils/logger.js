/**
 * 명령어 실행 로그를 메모리에 저장하는 유틸리티
 * 최대 100개의 로그 항목을 유지합니다.
 */

const MAX_LOGS = 100;

// 메모리 기반 로그 저장소
const logs = [];

/**
 * 로그 항목 추가
 * @param {Object} entry - 로그 항목
 * @param {string} entry.userId - 유저 ID
 * @param {string} entry.userName - 유저 태그
 * @param {string} entry.command - 명령어 이름
 * @param {Array} entry.args - 명령어 인자
 */
const log = (entry) => {
  const logEntry = {
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
 * @param {number} count - 반환할 로그 개수 (기본값: 10)
 * @returns {Array} 최근 로그 항목들
 */
const getRecentLogs = (count = 10) => {
  return logs.slice(0, count);
};

/**
 * 전체 로그 개수 반환
 * @returns {number} 로그 개수
 */
const getLogCount = () => logs.length;

/**
 * 로그 초기화 (테스트용)
 */
const clearLogs = () => {
  logs.length = 0;
};

module.exports = {
  log,
  getRecentLogs,
  getLogCount,
  clearLogs,
};
