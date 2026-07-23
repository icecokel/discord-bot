export const buildMorningBriefingContent = (
  weatherLine: string,
  serverHealthLine?: string,
  unavailableSections: string[] = [],
): string => {
  const lines = [
    "☀️ 좋은 아침입니다. 오늘의 브리핑입니다.",
    weatherLine,
  ];

  if (serverHealthLine) {
    lines.push(serverHealthLine);
  }

  if (unavailableSections.length > 0) {
    lines.push(`⚠️ 일부 정보 확인 실패: ${unavailableSections.join(", ")}`);
  }

  return lines.join("\n");
};
