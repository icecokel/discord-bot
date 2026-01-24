const { readJson, writeJson, DATA_DIR } = require("./fileManager");

const FILE_NAME = "user_preferences.json";

// 데이터 로드
const loadData = () => {
  return readJson(FILE_NAME, {});
};

// 데이터 저장
const saveData = (data) => {
  writeJson(FILE_NAME, data);
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

// 기본 지역 해제하기
const clearUserRegion = (userId) => {
  const data = loadData();
  if (data[userId]) {
    delete data[userId].defaultRegion;
    saveData(data);
    return true;
  }
  return false;
};

// 알림 설정 가져오기
const isNotificationEnabled = (userId) => {
  const data = loadData();
  return data[userId]?.notificationEnabled === true;
};

// 알림 설정 켜기
const enableNotification = (userId) => {
  const data = loadData();
  if (!data[userId]) {
    data[userId] = {};
  }
  data[userId].notificationEnabled = true;
  saveData(data);
};

// 알림 설정 끄기
const disableNotification = (userId) => {
  const data = loadData();
  if (data[userId]) {
    data[userId].notificationEnabled = false;
    saveData(data);
    return true;
  }
  return false;
};

// 알림이 활성화된 유저 목록 가져오기 (지역 등록 + 알림 ON)
const getAllUsersWithNotification = () => {
  const data = loadData();
  const result = [];
  for (const userId in data) {
    if (
      data[userId].defaultRegion &&
      data[userId].notificationEnabled === true
    ) {
      result.push({ userId, region: data[userId].defaultRegion });
    }
  }
  return result;
};

module.exports = {
  getUserRegion,
  setUserRegion,
  clearUserRegion,
  isNotificationEnabled,
  enableNotification,
  disableNotification,
  getAllUsersWithNotification,
  DATA_DIR,
};
