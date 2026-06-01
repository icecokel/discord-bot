# Discord Bot

관리자 DM 중심으로 동작하는 자연어 기반 디스코드 개인 비서 봇입니다. 사용자는 한글 명령어를 직접 입력할 수도 있고, 평소 말하듯 자연어로 요청할 수도 있습니다.

## 주요 기능

- 자연어 요청 처리
  - `서울 날씨 알려줘`
  - `이번 주 부산 날씨 어때?`
  - `오늘 운세 봐줘`
  - `긱뉴스 번역해줘`
  - `최근 로그 10개 보여줘`
- 날씨
  - 기상청 단기/중기 예보 조회
  - 기본 지역 저장/해제
  - 날씨 DM 알림 설정/해제
  - 지역 fallback 발생 시 사유 안내
- 운세
  - Gemini 기반 오늘의 운세 생성
  - 사용자별 하루 1회 캐싱
- 긱뉴스
  - GeekNews 상단 기사 조회
  - 본문 한국어 번역
  - 이미 보낸 기사 이력 저장
- 관리자 기능
  - 로그 조회
  - 저장 데이터 확인
  - 공지 발송
  - 뉴스 콘텐츠 테스트
  - 데이터 초기화
  - AI 검색 답변
  - 자체 상태 점검

## 명령어

일반 명령어:

| 명령어 | 설명 |
| --- | --- |
| `!날씨 [지역]` | 오늘 날씨를 조회합니다. |
| `!날씨 설정 [지역]` | 기본 날씨 지역을 저장합니다. |
| `!날씨 해제` | 기본 지역과 알림 설정을 해제합니다. |
| `!날씨 알림` | 저장된 기본 지역 기준 날씨 DM 알림을 켭니다. |
| `!날씨 알림해제` | 날씨 DM 알림을 끕니다. |
| `!주간날씨 [지역]` | 내일부터 7일간 예보를 조회합니다. |
| `!운세` | 오늘의 운세를 확인합니다. |
| `!긱뉴스` | 긱뉴스 상단 기사 1건을 번역합니다. |
| `!게임` | 게임 센터 링크를 보여줍니다. |
| `!내정보` | 디스코드 프로필 정보를 보여줍니다. |
| `!도움말` | 사용 가능한 명령어 목록을 보여줍니다. |

관리자 명령어:

| 명령어 | 설명 |
| --- | --- |
| `/관리자` | 관리자 명령어 목록을 보여줍니다. |
| `/관리자 로그 [개수]` | 최근 명령어 로그를 조회합니다. |
| `/관리자 공지 <내용>` | 등록된 사용자에게 공지를 발송합니다. |
| `/관리자 뉴스` | 뉴스 콘텐츠 발송을 테스트합니다. |
| `/관리자 데이터` | 저장된 데이터 현황을 확인합니다. |
| `/관리자 초기화 <대상>` | 지정한 데이터를 초기화합니다. |
| `/관리자 테스트 [빠른]` | 봇 상태를 점검합니다. |
| `/질문 <질문>` | AI 검색 답변을 생성합니다. |

제거된 명령어:

- `핑`
- `info`

## 동작 구조

메시지 처리 순서:

1. 봇 메시지, 비관리자 메시지, DM이 아닌 메시지를 제외합니다.
2. 관리자 DM 명령어를 먼저 처리합니다.
3. `!` prefix 기반 일반 명령어를 처리합니다.
4. 남은 메시지를 자연어 라우터로 넘깁니다.
5. 위험한 요청은 바로 실행하지 않고 `확인` 또는 `취소`를 기다립니다.

핵심 파일:

| 경로 | 역할 |
| --- | --- |
| `src/index.ts` | Discord Client 진입점과 메시지 처리 순서 |
| `src/core/command-handler.ts` | `!` prefix 명령어 실행 |
| `src/core/admin-middleware.ts` | 관리자 DM 명령어 처리 |
| `src/core/natural-language-router.ts` | 자연어 intent 실행 |
| `src/core/ai/intent-service.ts` | 자연어 의도 분류 |
| `src/core/pending-action-store.ts` | 확인이 필요한 작업 보관 |
| `scripts/generate-registry.ts` | 일반 명령어 레지스트리 자동 생성 |

## 환경변수

프로젝트 루트에 `.env`가 필요합니다. `.env`는 커밋하지 않습니다.

필수:

```text
DISCORD_BOT_TOKEN=
ADMIN_ID=
```

기능별:

```text
GEMINI_AI_API_KEY=
GEMINI_MODEL=
NAVER_APP_CLIENT_ID=
NAVER_APP_CLIENT_SECRET=
PRIVATE_CHANNEL_ID=
WEATHER_SHORT_END_POINT=
WEATHER_SHORT_API_KRY=
WEATHER_MIDDLE_END_POINT=
WEATHER_MIDDLE_API_KEY=
```

## 개발

```bash
npm ci
npm run gen:registry
npm run type-check
npm test -- --runInBand
npm run build
```

로컬 실행:

```bash
npm run start
```

프로덕션 번들 실행:

```bash
npm run build
npm run start:prod
```

## 배포

운영은 Termux 서버의 PM2 프로세스 기준입니다. 현재 방식은 로컬에서 빌드한 `dist/index.js`를 서버로 복사하고 PM2를 재시작합니다.

```bash
npm run build
scp -F /Users/smlee/termux-infra/config/ssh-config dist/index.js termux:~/projects/discord-bot/dist/index.js
/Users/smlee/termux-infra/scripts/tmx run 'cd ~/projects/discord-bot && pm2 restart discord-bot --update-env && pm2 save'
```

상태 확인:

```bash
/Users/smlee/termux-infra/scripts/tmx run 'cd ~/projects/discord-bot && pm2 status discord-bot --no-color'
```

## 문서

- `documents/natural-language-ai-concept.md`: 제품 컨셉과 사용자 경험 원칙
- `documents/natural-language-ai-plan.md`: 자연어 intent와 실행 매핑
- `documents/ai-guidelines.md`: AI 사용 지침
- `documents/pm2-deployment.md`: PM2 운영 가이드
