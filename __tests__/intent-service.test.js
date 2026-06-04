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

  test("classifies explicit admin reset requests", () => {
    const intent = classifyLocalIntent("운세 초기화해줘");

    expect(intent).toMatchObject({
      intent: "admin.reset",
      requiresConfirmation: true,
      args: {
        target: "운세",
      },
    });
  });

  test("does not classify reset questions as admin reset commands", () => {
    const intent = classifyLocalIntent("서버 초기화하면 어떻게 돼?");

    expect(intent).toBeNull();
  });

  test("classifies explicit admin data status requests", () => {
    const intent = classifyLocalIntent("데이터 현황 보여줘");

    expect(intent).toMatchObject({
      intent: "admin.data",
    });
  });

  test("does not classify data explanation questions as admin data commands", () => {
    const intent = classifyLocalIntent("데이터 저장 구조 설명해줘");

    expect(intent).toBeNull();
  });

  test("classifies explicit admin news test requests", () => {
    const intent = classifyLocalIntent("뉴스 테스트 해줘");

    expect(intent).toMatchObject({
      intent: "admin.news",
    });
  });

  test("does not classify general news questions as admin news commands", () => {
    const intent = classifyLocalIntent("오늘 주요 뉴스 알려줘");

    expect(intent).toBeNull();
  });

  test("does not classify log explanation questions as admin log commands", () => {
    const intent = classifyLocalIntent("로그는 어디에 저장돼?");

    expect(intent).toBeNull();
  });

  test("does not classify descriptive status questions as admin test commands", () => {
    const intent = classifyLocalIntent(
      "디스코드봇에 헤르메스 연결해둔상태잖아 서버 재기동 하면 어떻게 되지?",
    );

    expect(intent).toBeNull();
  });

  test("classifies explicit status checks as admin test commands", () => {
    const intent = classifyLocalIntent("봇 상태 확인해줘");

    expect(intent).toMatchObject({
      intent: "admin.test",
    });
  });

  test("does not classify help requests after help command removal", () => {
    const intent = classifyLocalIntent("도움말 보여줘");

    expect(intent).toBeNull();
  });

  test("does not classify server service planning messages as weather requests", () => {
    const intent = classifyLocalIntent(
      "서버가 올라갈때 필수적인 서비스들이 올라가게 하고싶은데 너를 포함해서",
    );

    expect(intent).toBeNull();
  });

  test("still classifies explicit rain weather questions", () => {
    const intent = classifyLocalIntent("서울 비 와?");

    expect(intent).toMatchObject({
      intent: "weather.today",
      args: {
        region: "서울",
      },
    });
  });
});
