const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "../data");
const FILE_PATH = path.join(DATA_DIR, "user_preferences.json");

// 데이터 로드
const loadData = () => {
  if (!fs.existsSync(FILE_PATH)) {
    return {};
  }
  try {
    const data = fs.readFileSync(FILE_PATH, "utf8");
    return JSON.parse(data);
  } catch (e) {
    console.error("Error loading user preferences:", e);
    return {};
  }
};

// 데이터 저장
const saveData = (data) => {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2), "utf8");
  } catch (e) {
    console.error("Error saving user preferences:", e);
  }
};

// 기본 지역 가져오기
const getUserRegion = (userId) => {
  const data = loadData();
  return data[userId]?.defaultRegion || null;
};

// 기본 지역 설정하기
const setUserRegion = (userId, region) => {
  const data = loadData();
  if (!data[userId]) {
    data[userId] = {};
  }
  data[userId].defaultRegion = region;
  saveData(data);
};

// 지역이 등록된 모든 유저 목록 가져오기
const getAllUsersWithRegion = () => {
  const data = loadData();
  const result = [];
  for (const userId in data) {
    if (data[userId].defaultRegion) {
      result.push({ userId, region: data[userId].defaultRegion });
    }
  }
  return result;
};

module.exports = {
  getUserRegion,
  setUserRegion,
  getAllUsersWithRegion,
};
