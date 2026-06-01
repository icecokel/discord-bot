const { classifyLocalIntent } = require("../src/core/ai/intent-service");

describe("intent service local classifier", () => {
  test("classifies weather lookup with a known region", () => {
    const intent = classifyLocalIntent("오늘 서울 날씨 알려줘");

    expect(intent).toMatchObject({
      intent: "weather.today",
      args: {
        region: "서울",
      },
      requiresConfirmation: false,
    });
  });

  test("keeps the requested Korean region phrase instead of substring matching", () => {
    const intent = classifyLocalIntent("안양동 날씨 알려줘");

    expect(intent).toMatchObject({
      intent: "weather.today",
      args: {
        region: "안양동",
      },
    });
  });

  test("extracts an inexact region phrase for weather command resolution", () => {
    const intent = classifyLocalIntent("광교 날씨 알려줘");

    expect(intent).toMatchObject({
      intent: "weather.today",
      args: {
        region: "광교",
      },
    });
  });

  test("classifies default weather region setup", () => {
    const intent = classifyLocalIntent("내 기본 지역 서울로 설정해줘");

    expect(intent).toMatchObject({
      intent: "weather.setRegion",
      args: {
        region: "서울",
      },
    });
  });

  test("marks notice requests as confirmation-required", () => {
    const intent = classifyLocalIntent("공지로 오늘 밤 점검이라고 보내줘");

    expect(intent).toMatchObject({
      intent: "admin.notice",
      requiresConfirmation: true,
    });
    expect(intent.args.content).toContain("오늘 밤 점검");
  });
});
