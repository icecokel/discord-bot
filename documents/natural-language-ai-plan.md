# 자연어 기반 AI 명령 처리 운영 플랜

## 현재 상태

봇은 한국어 명령어와 자연어 요청을 함께 처리한다. 사용자는 `!` prefix 명령어를 직접 입력할 수도 있고, DM에서 자연어로 요청할 수도 있다.

대표 입력:

- `서울 날씨 알려줘`
- `이번 주 부산 날씨 어때?`
- `오늘 운세 봐줘`
- `긱뉴스 하나 번역해줘`
- `최근 로그 10개 보여줘`
- `봇 상태 테스트해줘`
- `이 질문 검색해서 답해줘`

## 처리 순서

`src/index.ts`의 메시지 처리 순서는 아래 기준을 따른다.

1. `shouldProcessMessage`로 처리 대상 메시지인지 확인한다.
2. 관리자 DM 명령어를 먼저 처리한다.
3. `!` prefix 기반 일반 명령어를 처리한다.
4. 남은 DM 메시지는 자연어 라우터로 보낸다.

`handleCommand`는 명령어 실행 여부를 `boolean`으로 반환한다. 이미 처리된 메시지는 자연어 라우터로 중복 전달하지 않는다.

Hermes 대화 맥락 규칙:

- 관리자 DM은 사용자+채널 단위 Hermes session을 사용한다.
- 관리자 DM에서는 bot-managed 대화 압축을 사용하지 않는다.
- 관리자 DM session 호출 실패 시 Hermes oneshot으로 한 번 재시도한다.
- 일반 DM에서 AI 답변 provider가 `hermes`이면 사용자+채널 단위 짧은 대화 맥락을 저장한다.
- 일반 DM의 다음 AI 답변 prompt에는 요약된 이전 대화와 최근 턴을 함께 넣는다.
- 일반 DM은 누적 10턴에 도달하면 Hermes로 요약을 생성하고, turns를 비운 뒤 summary만 유지한다.
- `!헤르메스 초기화`로 현재 사용자+채널의 bot-managed 대화 맥락과 Hermes session 매핑을 지운다.

## 현재 명령어

일반 명령어:

- `!날씨 [지역]`
- `!주간날씨 [지역]`
- `!운세`
- `!긱뉴스`
- `!게임`
- `!내정보`
- `!헤르메스 상태|켜기|끄기|초기화` (관리자 전용)

관리자 명령어:

- `/관리자 로그 [개수]`
- `/관리자 공지 <내용>`
- `/관리자 뉴스`
- `/관리자 데이터`
- `/관리자 초기화 <대상>`
- `/관리자 테스트 [빠른]`
- `/관리자 서버상태`
- `/관리자 디스크`
- `/관리자 프로세스`
- `/관리자 배포상태`
- `/질문 <질문>`

제거된 명령어:

- `핑`
- `info`

## 자연어 intent

지원 intent:

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
- `admin.log`
- `admin.data`
- `admin.test`
- `admin.news`
- `admin.notice`
- `admin.reset`
- `ai.answer`
- `unknown`

`bot.help`, `bot.info`, `bot.ping` 계열 intent는 사용하지 않는다.

## 실행 매핑

| intent | 실행 대상 | args |
| --- | --- | --- |
| `weather.today` | `날씨` | `[region]` |
| `weather.weekly` | `주간날씨` | `[region]` |
| `weather.setRegion` | `날씨` | `["설정", region]` |
| `weather.clearRegion` | `날씨` | `["설정삭제"]` |
| `weather.enableNotification` | `날씨` | `["알림"]` |
| `weather.disableNotification` | `날씨` | `["알림해제"]` |
| `fortune.today` | `운세` | `[]` |
| `geekNews.translate` | `긱뉴스` | `[]` |
| `game.links` | `게임` | `[]` |
| `user.whoami` | `내정보` | `[]` |
| `admin.log` | 관리자 `로그` | `[count]` |
| `admin.data` | 관리자 `데이터` | `[]` |
| `admin.test` | 관리자 `테스트` | `[mode]` |
| `admin.news` | 관리자 `뉴스` | `[]` |
| `admin.notice` | 관리자 `공지` | `[content]` |
| `admin.reset` | 관리자 `초기화` | `[target]` |
| `ai.answer` | AI 답변 | 원문 질문 |

## 안전 기준

다음 intent는 바로 실행하지 않고 `pending-action-store`에 저장한 뒤 확인을 요구한다.

- `admin.notice`
- `admin.reset`
- `weather.clearRegion`
- `weather.enableNotification`
- `weather.disableNotification`

관리자 intent는 DM과 `ADMIN_ID` 조건을 다시 확인한다. AI가 관리자 intent로 분류해도 권한이 없으면 실행하지 않는다.

## Fallback 기준

AI 또는 로컬 분류가 실패하면 사용자가 바로 다시 시도할 수 있는 예시를 안내한다.

예:

```text
요청을 정확히 이해하지 못했습니다. 예: "서울 날씨 알려줘", "오늘 운세 봐줘", "긱뉴스 번역해줘"
```

날씨 지역이 정확히 일치하지 않아 fallback 지역을 쓰는 경우에는 사용자에게 사유를 함께 보여준다.

## 테스트 기준

주요 보호 대상:

- prefix 없는 메시지는 자연어 라우터에서 처리된다.
- `서울 날씨 알려줘`는 `weather.today`로 매핑된다.
- `광교 날씨 알려줘`처럼 정확히 일치하지 않는 지역 표현도 날씨 명령으로 전달된다.
- `오늘 운세 봐줘`는 운세 명령으로 매핑된다.
- 위험 intent는 확인 전에는 실행되지 않는다.
- `핑` 명령은 레지스트리에 등록되지 않는다.

변경 후에는 `npm run type-check`, `npm test -- --runInBand`, `npm run build`를 실행한다.
