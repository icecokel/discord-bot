// 기상청 격자 변환 공식 (Lambert Conformal Conic Projection)
// 소스: 기상청 단기예보 오픈API 활용가이드 위경도<->좌표 변환

const RE = 6371.00877; // 지구 반경(km)
const GRID = 5.0; // 격자 간격(km)
const SLAT1 = 30.0; // 투영 위도1(degree)
const SLAT2 = 60.0; // 투영 위도2(degree)
const OLON = 126.0; // 기준점 경도(degree)
const OLAT = 38.0; // 기준점 위도(degree)
const XO = 43; // 기준점 X좌표(GRID)
const YO = 136; // 기준점 Y좌표(GRID)

function dfs_xy_conv(code, v1, v2) {
  const DEGRAD = Math.PI / 180.0;
  const RADDEG = 180.0 / Math.PI;

  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD;
  const slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD;
  const olat = OLAT * DEGRAD;

  let sn =
    Math.tan(Math.PI * 0.25 + slat2 * 0.5) /
    Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);

  const rs = {};
  if (code === "toXY") {
    rs["lat"] = v1;
    rs["lng"] = v2;
    let ra = Math.tan(Math.PI * 0.25 + v1 * DEGRAD * 0.5);
    ra = (re * sf) / Math.pow(ra, sn);
    let theta = v2 * DEGRAD - olon;
    if (theta > Math.PI) theta -= 2.0 * Math.PI;
    if (theta < -Math.PI) theta += 2.0 * Math.PI;
    theta *= sn;
    rs["x"] = Math.floor(ra * Math.sin(theta) + XO + 0.5);
    rs["y"] = Math.floor(ro - ra * Math.cos(theta) + YO + 0.5);
  }
  return rs;
}

// 안양시청 좌표
const anyangLat = 37.3943;
const anyangLng = 126.9568;

console.log(`[Input] 안양시청 위도: ${anyangLat}, 경도: ${anyangLng}`);
const result = dfs_xy_conv("toXY", anyangLat, anyangLng);
console.log(`[Output] 기상청 격자 좌표: NX=${result.x}, NY=${result.y}`);

// 검증
if (result.x === 59 && result.y === 123) {
  console.log("✅ 증명 성공: 안양의 격자 좌표는 (59, 123) 입니다.");
} else {
  console.log(
    "❌ 값 불일치 (좌표가 경계선에 걸쳐있을 수 있음, 주변 좌표 확인 필요)",
  );
}
