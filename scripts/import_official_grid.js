const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

// 파일 경로 설정
const DATA_DIR = path.join(__dirname, "../src/data");
const LOCATION_CODES_PATH = path.join(DATA_DIR, "location_codes.json");
const CITY_COORDS_PATH = path.join(DATA_DIR, "city_coordinates.json");

// location_codes.json에서 도시명을 키로 하는 맵 생성
// 예: "서울" -> "11B10101", "안양" -> "11B20602"
function loadLocationCodes() {
  if (!fs.existsSync(LOCATION_CODES_PATH)) {
    console.error(`❌ ${LOCATION_CODES_PATH} 파일을 찾을 수 없습니다.`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(LOCATION_CODES_PATH, "utf8"));
}

// 엑셀 파일 찾기 (파일명이 조금씩 다를 수 있으므로 확장자로 검색)
function findExcelFile() {
  const files = fs.readdirSync(DATA_DIR);
  const excelFile = files.find(
    (file) =>
      file.endsWith(".xlsx") &&
      (file.includes("격자") || file.includes("위경도")),
  );

  if (!excelFile) {
    console.error("❌ 'src/data/' 폴더에서 엑셀 파일을 찾을 수 없습니다.");
    console.error(
      "   파일명에 '격자' 또는 '위경도'가 포함된 .xlsx 파일을 넣어주세요.",
    );
    console.error(
      "   (예: 기상청41_단기예보 조회서비스_오픈API활용가이드_격자_위경도.xlsx)",
    );
    return null;
  }
  return path.join(DATA_DIR, excelFile);
}

// 메인 로직
function main() {
  const locationCodes = loadLocationCodes();
  const excelPath = findExcelFile();

  if (!excelPath) return;

  console.log(`📂 엑셀 파일 로딩 중: ${path.basename(excelPath)}`);
  const workbook = XLSX.readFile(excelPath);
  const sheetName = workbook.SheetNames[0]; // 첫 번째 시트 사용
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet);

  console.log(`📊 데이터 행 수: ${rows.length}`);

  // 기존 좌표 데이터 로드 또는 초기화
  let cityCoords = {};
  if (fs.existsSync(CITY_COORDS_PATH)) {
    cityCoords = JSON.parse(fs.readFileSync(CITY_COORDS_PATH, "utf8"));
  }

  let matchCount = 0;
  const locationNames = Object.keys(locationCodes);

  // 엑셀 데이터 파싱 및 매핑
  // 엑셀 컬럼명 예상: '1단계', '2단계', '3단계', '격자 X', '격자 Y'
  // (실제 파일에 따라 다를 수 있으므로 유연하게 처리 필요하지만,
  //  공식 파일은 보통 '1단계', '2단계', '3단계', '격자 X', '격자 Y' 사용)

  rows.forEach((row) => {
    // 주요 도시 이름 매칭 로직
    // 1단게, 2단계, 3단계 조합하여 location_codes의 키와 매칭 시도

    const step1 = row["1단계"] || row["광역지자체"] || "";
    const step2 = row["2단계"] || row["시군구"] || "";
    const step3 = row["3단계"] || row["읍면동"] || "";
    const nx = row["격자 X"] || row["격자X"];
    const ny = row["격자 Y"] || row["격자Y"];

    if (!nx || !ny) return;

    // 매칭 전략:
    // location_codes의 키(도시명)가 step1, step2, step3 중 하나와 일치하거나
    // 조합된 이름과 일치하는지 확인.
    // 현재 location_codes.json은 "서울", "안양", "강릉" 처럼 시/군 단위가 많음.

    locationNames.forEach((cityKey) => {
      // 이미 좌표가 있고 code가 있는 경우(중기예보 코드 보존 필요), 업데이트만 수행
      // 단, 여기서는 새로 덮어쓰기보다 '격자값'을 갱신하는 것이 목표

      let isMatch = false;

      // 1. 정확히 이름이 일치하는 경우 (예: "서울" == "서울")
      if (cityKey === step1 || cityKey === step2) {
        isMatch = true;
      }
      // 2. "시" 등을 떼고 비교 (예: "안양" vs "안양시")
      else if (step2.startsWith(cityKey) && cityKey.length >= 2) {
        isMatch = true;
      }

      if (isMatch) {
        // 기존 데이터 보존하면서 nx, ny 업데이트
        if (!cityCoords[cityKey]) {
          cityCoords[cityKey] = { code: locationCodes[cityKey] }; // 중기예보 코드는 location_codes에서 가져옴?
          // 아니, location_codes는 '11B10101' 같은 값을 가짐.
          // city_coordinates가 필요한 'code'는 중기예보 광역코드임(예: 11B00000).
          // 이것은 별도 매핑이 필요하거나 기존 로직을 유지해야 함.
          // 우선 nx, ny만 업데이트하고 code는 기존 것을 유지하거나 비워둠.
        }

        cityCoords[cityKey].nx = parseInt(nx, 10);
        cityCoords[cityKey].ny = parseInt(ny, 10);

        // code가 없다면 location_codes의 값을 일단 넣되, 이는 단기예보 구역코드일 수 있음.
        // weather.js 로직상 중기예보는 별도 매핑이 필요할 수 있음.
        // 일단 nx, ny 확보가 최우선.
        if (!cityCoords[cityKey].code) {
          cityCoords[cityKey].code = locationCodes[cityKey];
        }
        matchCount++;
      }
    });
  });

  console.log(`✅ 총 ${matchCount}개의 도시 좌표를 업데이트했습니다.`); // 중복 매칭 등으로 숫자가 클 수 있음

  // 파일 저장
  fs.writeFileSync(
    CITY_COORDS_PATH,
    JSON.stringify(cityCoords, null, 2),
    "utf8",
  );
  console.log(`💾 ${CITY_COORDS_PATH} 저장 완료`);
}

main();
