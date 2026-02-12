import { readJson, writeJson, DATA_DIR } from "./file-manager";

const FILE_NAME = "user-preferences.json";
const LEGACY_FILE_NAME = "user_preferences.json";

export interface UserPreference {
  defaultRegion?: string;
  notificationEnabled?: boolean;
}

export interface UserPreferences {
  [userId: string]: UserPreference;
}

export interface UserWithNotification {
  userId: string;
  region: string;
}

// 데이터 로드
const loadData = (): UserPreferences => {
  const data = readJson<UserPreferences>(FILE_NAME, {});
  if (Object.keys(data).length > 0) {
    return data;
  }
  return readJson<UserPreferences>(LEGACY_FILE_NAME, {});
};

// 데이터 저장
const saveData = (data: UserPreferences): void => {
  writeJson(FILE_NAME, data);
};

// 기본 지역 가져오기
export const getUserRegion = (userId: string): string | null => {
  const data = loadData();
  return data[userId]?.defaultRegion || null;
};

// 기본 지역 설정하기
export const setUserRegion = (userId: string, region: string): void => {
  const data = loadData();
  if (!data[userId]) {
    data[userId] = {};
  }
  data[userId].defaultRegion = region;
  saveData(data);
};

// 기본 지역 해제하기
export const clearUserRegion = (userId: string): boolean => {
  const data = loadData();
  if (data[userId]) {
    delete data[userId].defaultRegion;
    saveData(data);
    return true;
  }
  return false;
};

// 알림 설정 가져오기
export const isNotificationEnabled = (userId: string): boolean => {
  const data = loadData();
  return data[userId]?.notificationEnabled === true;
};

// 알림 설정 켜기
export const enableNotification = (userId: string): void => {
  const data = loadData();
  if (!data[userId]) {
    data[userId] = {};
  }
  data[userId].notificationEnabled = true;
  saveData(data);
};

// 알림 설정 끄기
export const disableNotification = (userId: string): boolean => {
  const data = loadData();
  if (data[userId]) {
    data[userId].notificationEnabled = false;
    saveData(data);
    return true;
  }
  return false;
};

// 알림이 활성화된 유저 목록 가져오기 (지역 등록 + 알림 ON)
export const getAllUsersWithNotification = (): UserWithNotification[] => {
  const data = loadData();
  const result: UserWithNotification[] = [];
  for (const userId in data) {
    if (
      data[userId].defaultRegion &&
      data[userId].notificationEnabled === true
    ) {
      result.push({ userId, region: data[userId].defaultRegion as string });
    }
  }
  return result;
};

export { DATA_DIR };
