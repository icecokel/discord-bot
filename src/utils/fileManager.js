const fs = require("fs");
const path = require("path");

// 데이터 디렉토리 설정 (프로젝트 루트/src/data)
// process.cwd()는 실행 위치에 따라 달라질 수 있으므로, __dirname을 기준으로 상위로 이동하여 설정하는 것이 더 안전할 수 있으나,
// 현재 구조상 src/features/... 에서 실행되므로 통일성을 위해 process.cwd() 기반으로 하되,
// 가장 안전한 방법은 프로젝트 루트를 찾는 것이지만 여기서는 사용자가 승인한 방식인
// "기존 userStore의 DATA_DIR 로직"을 따르되, 이를 이 파일이 전담하게 함.
// userStore.js는: const DATA_DIR = path.join(process.cwd(), "src/data"); 였음.
// 하지만 fortune.js 문제(경로 불일치)를 해결하기 위해 절대 경로를 확실히 잡는 것이 좋음.

// __dirname: src/utils
// target: src/data
const DATA_DIR = path.join(__dirname, "../data");

/**
 * 데이터 디렉토리 가져오기
 */
const getDataDir = () => DATA_DIR;

/**
 * JSON 파일 읽기
 * @param {string} filename 파일명 (예: "user_preferences.json")
 * @param {any} defaultValue 파일이 없거나 오류 발생 시 반환할 기본값 (기본: {})
 * @returns {any} 파싱된 데이터 또는 기본값
 */
const readJson = (filename, defaultValue = {}) => {
  try {
    const filePath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return defaultValue;
    }
    const data = fs.readFileSync(filePath, "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.error(`[FileManager] Error reading ${filename}:`, error.message);
    return defaultValue;
  }
};

/**
 * JSON 파일 쓰기
 * @param {string} filename 파일명
 * @param {any} data 저장할 데이터
 * @returns {boolean} 성공 여부
 */
const writeJson = (filename, data) => {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const filePath = path.join(DATA_DIR, filename);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
    return true;
  } catch (error) {
    console.error(`[FileManager] Error writing ${filename}:`, error.message);
    return false;
  }
};

/**
 * 파일 삭제
 * @param {string} filename 파일명
 * @returns {boolean} 성공 여부
 */
const deleteFile = (filename) => {
  try {
    const filePath = path.join(DATA_DIR, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`[FileManager] Error deleting ${filename}:`, error.message);
    return false;
  }
};

module.exports = {
  DATA_DIR,
  getDataDir,
  readJson,
  writeJson,
  deleteFile,
};
