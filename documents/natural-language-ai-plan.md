# 자연어 기반 AI 명령 처리 전환 플랜

## 목표

현재 봇은 `!날씨 서울`, `!운세`, `/admin test`처럼 명령어 prefix와 키워드에 의존한다. 앞으로는 사용자가 자연어로 요청해도 봇이 의도를 파악하고, 기존 기능을 실행하거나 AI 답변을 생성하도록 전환한다.

예시:

- `오늘 서울 날씨 알려줘` -> 날씨 조회
- `내일 아침에 비 와?` -> 기본 지역 또는 문맥 기반 날씨 조회
- `오늘 운세 봐줘` -> 운세 조회
- `긱뉴스 하나 번역해줘` -> 긱뉴스 번역
- `최근 로그 10개 보여줘` -> 관리자 로그 조회
- `이 질문 검색해서 답해줘` -> AI 검색 답변

## 현재 구조 요약

- 진입점: `src/index.ts`
- 메시지 필터: `src/core/message-guard.ts`
  - 현재는 `ADMIN_ID` 사용자만 DM에서 처리한다.
- 일반 명령어 처리: `src/core/command-handler.ts`
  - `!` prefix 기반으로 명령어를 찾는다.
- 관리자 명령어 처리: `src/core/admin-middleware.ts`
  - DM에서 `/admin <명령어>` 또는 `/명령어` 형태를 처리한다.
- AI 서비스: `src/core/ai`
  - Gemini 기반 텍스트 생성
  - Google Search 도구 사용 가능
- 구현된 기능:
  - 날씨/주간날씨
  - 운세
  - 긱뉴스 번역
  - 게임 링크
  - 기본 정보/내 정보/help/ping
  - 관리자 AI, 뉴스, 로그, 데이터, 초기화, 공지, 테스트

## 전환 원칙

1. 기존 명령어는 제거하지 않는다.
   - 자연어 기능 안정화 전까지 `!날씨`, `!운세` 등은 fallback으로 유지한다.
2. 자연어 처리는 기존 command execute 함수를 재사용한다.
   - 같은 기능을 두 번 구현하지 않는다.
3. AI는 “답변 생성”보다 “의도 분류와 인자 추출”에 먼저 사용한다.
   - 날씨 조회, 운세 조회 같은 결정적 기능은 기존 코드가 실행한다.
4. 관리자 기능은 더 엄격하게 제한한다.
   - 관리자 자연어 요청은 DM + `ADMIN_ID` 조건을 유지한다.
   - `notice`, `reset` 같은 파괴적/대량 발송 기능은 확인 단계를 둔다.
5. AI 결과는 구조화된 JSON으로 받는다.
   - 임의 텍스트 파싱을 피하고, 실패 시 안전하게 일반 AI 답변 또는 안내로 fallback한다.

## 제안 아키텍처

### 1. 자연어 라우터 추가

새 파일:

- `src/core/natural-language-router.ts`
- `src/core/ai/intent-service.ts`

처리 순서:

1. `messageCreate` 수신
2. `shouldProcessMessage` 통과
3. 기존 관리자 명령어 처리
4. 기존 prefix 명령어 처리
5. prefix 명령어가 아니면 자연어 라우터 실행

`src/index.ts`의 흐름은 아래처럼 바꾼다.

```ts
if (await handleAdminCommand(message)) return;
if (await handleCommand(message, client.commands)) return;
await handleNaturalLanguageMessage(message, client.commands);
```

이를 위해 `handleCommand`는 처리 여부를 반환하도록 바꾸는 것이 좋다.

### 2. 의도 분류 스키마

AI가 반환할 JSON 예시:

```json
{
  "intent": "weather.today",
  "confidence": 0.91,
  "args": {
    "region": "서울"
  },
  "requiresConfirmation": false,
  "replyMode": "execute"
}
```

지원 intent 초안:

- `weather.today`
- `weather.weekly`
- `weather.setRegion`
- `weather.clearRegion`
- `weather.enableNotification`
- `weather.disableNotification`
- `fortune.today`
- `geekNews.translate`
- `game.links`
- `user.whoami`
- `bot.info`
- `bot.help`
- `admin.log`
- `admin.data`
- `admin.test`
- `admin.news`
- `admin.notice`
- `admin.reset`
- `ai.answer`
- `unknown`

### 3. Intent와 기존 명령어 매핑

자연어 라우터는 intent를 기존 명령어와 args로 변환한다.

예시:

| intent | 실행 명령 | args |
| --- | --- | --- |
| `weather.today` | `weather` | `[region]` |
| `weather.weekly` | `weather-weekly` | `[region]` |
| `weather.setRegion` | `weather` | `["설정", region]` |
| `fortune.today` | `운세` | `[]` |
| `geekNews.translate` | `geeknews` | `[]` |
| `game.links` | `game` | `[]` |
| `admin.log` | admin handler `log` | `[count]` |
| `ai.answer` | AI 답변 | 원문 질문 |

## 사용자 경험

### 기본 동작

사용자는 prefix 없이 자연어로 말한다.

- `서울 날씨 알려줘`
- `이번 주 부산 날씨 어때?`
- `오늘 운세`
- `긱뉴스 번역해줘`
- `봇 정보 보여줘`

봇은 의도가 명확하면 바로 실행한다.

### 확인이 필요한 경우

다음 요청은 바로 실행하지 않고 확인한다.

- 공지 발송
- 데이터 초기화
- 알림 설정 변경
- 지역이 애매한 날씨 조회

예시:

사용자: `공지로 오늘 점검 있다고 보내`

봇:

```text
공지 발송 요청으로 이해했습니다.
대상: 저장된 유저 전체
내용: 오늘 점검 있다고 보내

실행하려면 "확인"이라고 답해주세요.
```

### 정보가 부족한 경우

예시:

사용자: `날씨 알려줘`

처리:

- 기본 지역이 있으면 해당 지역으로 조회
- 기본 지역이 없으면 지역 설정을 요청

응답:

```text
지역을 알려주세요. 예: "서울 날씨 알려줘"
기본 지역을 저장하려면 "내 기본 지역 서울로 설정해줘"라고 말하면 됩니다.
```

## 구현 단계

### 1단계: 기존 명령어 핸들러 반환값 개선

대상:

- `src/core/command-handler.ts`
- `src/index.ts`

작업:

- `handleCommand` 반환 타입을 `Promise<boolean>`으로 변경
- 명령어를 실행했으면 `true`
- prefix가 없거나 명령어를 못 찾으면 `false`

목적:

- 자연어 라우터가 기존 명령어 다음 단계로 안전하게 들어갈 수 있게 한다.

### 2단계: Intent 서비스 추가

대상:

- `src/core/ai/intent-service.ts`

작업:

- Gemini에 자연어 메시지를 보내 intent JSON을 받는다.
- `responseMimeType: "application/json"` 사용을 우선 검토한다.
- JSON 파싱 실패, confidence 부족, 필수 args 누락 시 `unknown` 처리한다.

권장 confidence 기준:

- `0.80` 이상: 실행
- `0.55` 이상: 확인 또는 추가 질문
- `0.55` 미만: 일반 AI 답변 또는 도움말 안내

### 3단계: 자연어 라우터 추가

대상:

- `src/core/natural-language-router.ts`

작업:

- intent를 기존 커맨드 실행으로 연결한다.
- 관리자 intent는 `isAdmin`, `isDM` 조건을 재확인한다.
- 실행 로그에는 자연어 원문과 매핑된 intent를 남긴다.

### 4단계: 관리자 확인 플로우 추가

대상 후보:

- `src/core/pending-action-store.ts`
- `src/core/natural-language-router.ts`

작업:

- 사용자별 pending action을 메모리에 저장한다.
- `확인`, `취소` 응답을 처리한다.
- 만료 시간은 3분 정도로 둔다.

확인 필수 intent:

- `admin.notice`
- `admin.reset`
- `weather.enableNotification`
- `weather.disableNotification`
- `weather.clearRegion`

### 5단계: 테스트 추가

대상:

- `__tests__/command-handler.test.js`
- `__tests__/natural-language-router.test.js`
- `__tests__/intent-service.test.js`

테스트 항목:

- prefix 명령어가 기존처럼 동작한다.
- prefix 없는 메시지는 자연어 라우터로 넘어간다.
- `서울 날씨 알려줘`가 `weather.today`로 매핑된다.
- `오늘 운세 봐줘`가 `fortune.today`로 매핑된다.
- 관리자 intent는 비관리자에게 차단된다.
- `reset`, `notice`는 확인 없이는 실행되지 않는다.
- AI JSON 파싱 실패 시 사용자에게 오류 대신 안전한 안내를 보낸다.

## 프롬프트 초안

```text
너는 디스코드 봇의 자연어 의도 분류기다.
사용자의 한국어 메시지를 보고 실행할 intent와 인자를 JSON으로만 반환한다.

지원 intent:
- weather.today
- weather.weekly
- weather.setRegion
- weather.clearRegion
- weather.enableNotification
- weather.disableNotification
- fortune.today
- geekNews.translate
- game.links
- user.whoami
- bot.info
- bot.help
- admin.log
- admin.data
- admin.test
- admin.news
- admin.notice
- admin.reset
- ai.answer
- unknown

규칙:
1. JSON 이외의 텍스트를 출력하지 마라.
2. 확신이 낮으면 unknown을 반환해라.
3. 지역명, 개수, 공지 내용, reset 대상 등 필요한 인자를 args에 넣어라.
4. notice, reset, 알림 변경, 지역 삭제는 requiresConfirmation을 true로 설정해라.
5. 사용자가 단순 질문을 하면 ai.answer로 분류해라.

반환 형식:
{
  "intent": "...",
  "confidence": 0.0,
  "args": {},
  "requiresConfirmation": false,
  "replyMode": "execute"
}
```

## 리스크와 대응

### AI 오분류

리스크:

- `공지 보내줘` 같은 요청을 잘못 해석해 실제 발송할 수 있다.

대응:

- 위험 intent는 확인 필수
- confidence 기준 적용
- 관리자 권한 재검증

### 기존 명령어와 자연어 충돌

리스크:

- `!날씨 서울` 같은 기존 명령어가 자연어 라우터까지 중복 처리될 수 있다.

대응:

- `handleCommand`가 처리 여부를 반환하게 한다.
- 처리 완료 시 자연어 라우터를 호출하지 않는다.

### JSON 파싱 실패

리스크:

- AI 응답이 JSON 형식을 벗어날 수 있다.

대응:

- `responseMimeType: "application/json"` 사용
- 파싱 실패 시 `unknown`
- 사용자에게 “정확히 이해하지 못했다”는 안내 제공

### 비용과 응답 속도

리스크:

- 모든 메시지마다 Gemini 호출이 발생한다.

대응:

- 기존 prefix 명령어는 AI 호출 없이 처리
- 짧고 명확한 로컬 룰 우선 적용
  - `날씨`, `운세`, `긱뉴스`, `로그` 같은 핵심 키워드
- 룰로 판단이 어려운 경우에만 AI intent 분류 호출

## 권장 구현 순서

1. `handleCommand` 반환값 변경
2. 자연어 라우터 뼈대 추가
3. 로컬 룰 기반 intent 매핑부터 구현
4. Gemini intent 분류 추가
5. 관리자 확인 플로우 추가
6. 테스트 추가
7. 실제 DM에서 주요 케이스 수동 검증

## 완료 기준

- 사용자가 prefix 없이 핵심 기능을 실행할 수 있다.
- 기존 `!` 명령어는 그대로 동작한다.
- 위험 관리자 기능은 확인 없이는 실행되지 않는다.
- AI 응답 실패가 봇 장애로 이어지지 않는다.
- 주요 자연어 입력 케이스가 테스트로 보호된다.
