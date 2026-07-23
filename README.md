# Discord Bot

icenux 서버에서 PM2로 실행되는 관리자 중심 디스코드 봇입니다. 일반 사용자용 명령어와 일반 DM 자연어 기능은 제거했고, 현재 운영 범위는 스케줄러와 관리자 기능으로 제한합니다.

## 현재 컨셉

- 서버 채널과 일반 사용자 DM의 일반 기능 요청은 처리하지 않습니다.
- 스케줄러는 PM2 프로세스 안에서 아침 브리핑, 긱뉴스, 내일 날씨 DM을 발송합니다.
- 관리자 기능은 DM과 `ADMIN_ID` 조건을 확인한 뒤 실행합니다.
- 관리자 DM의 prefix 없는 메시지는 운영 기본값에서 Codex app-server thread로 처리합니다.
- `discord.js` 봇이 유일한 Discord gateway이고, Codex는 봇 프로세스 내부 provider로만 호출합니다.
- AI 에이전트에는 Discord 메시지 전송, 삭제, 채널 관리 도구를 제공하지 않습니다.
- 봇이 서버에서 준비되면 `ADMIN_ID` 사용자에게 준비 완료 DM을 보냅니다.

Codex app-server 직접 연동 기준은 `documents/codex-app-server-provider.md`에 둡니다.

## 남아 있는 기능

### 스케줄러

- 아침 브리핑: 매일 06:30 KST에 `ADMIN_ID` 관리자 DM으로 오늘 날씨를 보내고, 서버 디스크·메모리 상태는 문제가 있을 때만 함께 보냅니다.
- 긱뉴스: 매일 07:50 KST에 `ADMIN_ID` 관리자 DM으로 긱뉴스 상단 기사 번역을 보냅니다.
- 내일 날씨: 매일 22:30 KST에 `ADMIN_ID` 운영자에게 내일 날씨를 보냅니다.

날씨 지역은 `WEATHER_ADMIN_REGION`을 우선 사용하고, 값이 없으면 운영자의 기존 `user-preferences.json` 지역 설정, 그마저 없으면 `서울`을 사용합니다. 긱뉴스는 이력 저장소를 사용합니다. 스케줄 실행 결과는 `schedule-run-history.json`에 성공, 일부 성공, 실패 상태와 최근 시각, 다음 실행 시각을 기록합니다.

### 상태 데이터

운영 상태는 배포 번들 옆의 `dist/data/`에 저장합니다. 현재 `user-preferences.json`, `geek-news-history.json`, `schedule-run-history.json`이 이 경로를 사용합니다. 저장할 때는 같은 디렉터리의 임시 파일을 만든 뒤 교체하므로 기존 파일이 부분적으로 덮어써지는 일을 피합니다. 손상된 JSON은 기본값으로 읽되, 원본은 `*.corrupt-<timestamp>-<pid>` 이름으로 보존합니다.

### 관리자 명령어

| 명령어 | 설명 |
| --- | --- |
| `/관리자` | 관리자 명령어 목록을 보여줍니다. |
| `/관리자 로그 [개수]` | 최근 명령어 로그를 조회합니다. |
| `/관리자 공지 <내용>` | 등록된 사용자에게 공지를 발송합니다. |
| `/관리자 뉴스` | 뉴스 콘텐츠 발송을 테스트합니다. |
| `/관리자 데이터` | 저장된 데이터 현황을 확인합니다. |
| `/관리자 초기화 <대상>` | 지정한 데이터를 초기화합니다. |
| `/관리자 서버상태` | Node 런타임, 메모리, Codex 환경 상태를 확인합니다. |
| `/관리자 디스크` | 허용된 서버 디스크 경로의 사용량을 확인합니다. |
| `/관리자 프로세스` | `discord-bot` PM2 프로세스 상태를 확인합니다. |
| `/관리자 배포상태` | 배포 번들 경로와 해시를 확인합니다. |
| `/관리자 스케줄상태` | 최근 스케줄 실행 결과와 다음 실행 시간을 확인합니다. |
| `/질문 <질문>` | 관리자 AI 답변을 생성합니다. |

### 관리자 AI 제어(Codex)

| 명령어 | 설명 |
| --- | --- |
| `!코덱스 상태` | 현재 AI 공급자를 확인합니다. |
| `!코덱스 켜기` | primary AI 공급자를 Codex로 바꿉니다. |
| `!코덱스 끄기` | primary AI 공급자를 Gemini로 바꿉니다. |
| `!코덱스 초기화` | 현재 관리자 DM 채널의 Codex thread와 관리자 대화 기억을 초기화합니다. |
| `!헤르메스 ...` | 기존 운영 습관을 위한 Codex 제어 호환 alias입니다. |

현재 관리자 DM에서 prefix 없이 보낸 메시지는 운영 기본값에서 Codex app-server thread로 전달됩니다. 이 경로는 관리자 작업, 서버 조사, 웹 검색, 브라우저 확인, 프로젝트 파일 조회를 위한 에이전트 인터페이스입니다. `!코덱스 끄기` 또는 `!헤르메스 끄기` 상태에서는 primary AI 공급자가 Gemini로 바뀌므로 Codex thread 경로를 사용하지 않습니다.

`/질문 <질문>`은 현재 AI 공급자를 사용하는 단발 관리자 AI 답변입니다. 관리자 DM thread 기억, 관리자 최근 대화 10턴, 백그라운드 후속 보고 흐름을 사용하지 않습니다.

## 제거된 사용자 노출 기능

아래 기능은 더 이상 prefix 명령어나 일반 DM 자연어로 실행되지 않습니다.

- `!날씨`
- `!주간날씨`
- `!운세`
- `!긱뉴스`
- `!게임`
- `!내정보`
- 일반 사용자 DM 자연어 답변
- 일반 사용자 DM 자연어 기능 실행
- 일반 기능 intent 라우터

스케줄러와 관리자 데이터 조회에 필요한 서비스/데이터 파일은 유지합니다.

## 응답 조건

메시지 처리 순서:

1. 봇이 보낸 메시지는 무시합니다.
2. 관리자 DM 명령어를 먼저 처리합니다.
3. prefix 명령어 중 등록된 관리자 제어 명령어를 처리합니다.
4. 관리자 DM의 prefix 없는 메시지는 현재 AI 공급자 설정에 따른 자연어 답변 경로로 처리합니다. 운영 기본값은 Codex app-server입니다.
5. 그 외 일반 메시지는 처리하지 않습니다. 단, 일반 사용자가 관리자 명령어를 시도하면 권한 없음 응답을 받을 수 있습니다.

권한 기준:

| 구분 | 서버 채널 | DM | 권한 |
| --- | --- | --- | --- |
| 일반 사용자 기능 | 불가 | 불가 | 해당 없음 |
| 스케줄러 발송 | 해당 없음 | 가능 | 스케줄러 내부 |
| 관리자 명령어 | 불가 | 가능 | `ADMIN_ID` |
| 관리자 AI thread | 불가 | 가능 | `ADMIN_ID` |
| `!코덱스` 제어 | 가능 | 가능 | `ADMIN_ID` |
| `!헤르메스` 호환 alias | 가능 | 가능 | `ADMIN_ID` |

## AI 공급자

현재 운영 기본값은 Hermes 없이 Codex app-server를 직접 호출하는 `AI_PROVIDER=codex` 구조입니다. 코드에서 `AI_PROVIDER`가 비어 있으면 Gemini로 시작하지만, icenux 운영 `.env`는 Codex를 명시합니다.

### Codex app-server 직접 연동

`discord.js` 봇이 유일한 Discord gateway로 남고, 봇 프로세스 안에서 `codex app-server`를 장기 실행 child process로 띄워 stdio JSON-RPC로 통신합니다. Codex에는 Discord 쓰기/삭제/관리 권한을 넘기지 않습니다.

운영 `.env` 예시:

```text
AI_PROVIDER=codex
AI_FALLBACK_PROVIDER=gemini
CODEX_BIN=/home/icenux/.local/bin/codex
CODEX_MODEL=
CODEX_WORKDIR=/home/icenux/projects/discord-bot
CODEX_TIMEOUT_MS=1800000
CODEX_SANDBOX=read-only
CODEX_APPROVAL_POLICY=never
CODEX_ADMIN_SEARCH=true
CODEX_ADMIN_SANDBOX=read-only
CODEX_ADMIN_APPROVAL_POLICY=
```

서버에는 Codex CLI와 인증 캐시가 필요합니다. 파일 기반 인증 캐시를 쓰는 경우 `~/.codex/auth.json`은 비밀번호처럼 취급하고 로그, PR, 이슈, Discord 메시지에 출력하지 않습니다.

세부 설계와 운영 기준은 `documents/codex-app-server-provider.md`를 기준으로 합니다.

긱뉴스 스케줄러의 AI 요약/번역도 Codex만 사용합니다. Codex 요약/번역이 실패하면 Gemini fallback이나 원문 기반 대체 번역을 사용하지 않고, 관리자 DM embed에 실패 사유를 표시합니다.

### Legacy: Hermes provider

```text
AI_PROVIDER=hermes
AI_FALLBACK_PROVIDER=gemini
HERMES_BIN=/home/icenux/.local/bin/hermes
HERMES_TIMEOUT_MS=1800000
HERMES_TOOLSETS=web
HERMES_ADMIN_TOOLSETS=web,browser,terminal,file,code_execution,discord-bot-fs
```

Hermes provider 구현은 과거 운영 호환을 위해 남아 있지만 현재 기본 경로는 아닙니다. `!헤르메스` prefix 명령도 Codex 제어 alias로 동작합니다.

`discord-bot-fs` MCP는 legacy Hermes 운영에서 쓰던 read-only filesystem MCP입니다. 현재 Codex 기본 경로는 `CODEX_WORKDIR`와 sandbox 정책으로 파일 접근 범위를 제한합니다.

관리자 DM AI는 삭제, 초기화, 덮어쓰기, 강제 재설정, 권한 변경, 대량 발송, 서비스 중단처럼 되돌리기 어렵거나 영향 범위가 큰 작업을 바로 실행하지 않습니다. 대상, 영향 범위, 되돌리는 방법을 요약해 확인을 요청하고, 애매하거나 고민되는 경우에는 작업하지 않고 사용자에게 질문합니다.

## 동작 구조

핵심 파일:

| 경로 | 역할 |
| --- | --- |
| `src/index.ts` | Discord Client 진입점과 메시지 처리 순서 |
| `src/core/message-guard.ts` | 봇 메시지 필터와 관리자 DM 자연어 조건 |
| `src/core/command-handler.ts` | prefix 명령어 실행 |
| `src/core/admin-middleware.ts` | 관리자 DM 명령어 처리 |
| `src/core/natural-language-router.ts` | 관리자 DM 자연어 답변 경로 |
| `src/core/admin-conversation-context-store.ts` | 관리자 DM 최근 대화 기억 |
| `src/core/ai/ai-service.ts` | Gemini/Codex 공급자 선택과 fallback |
| `src/core/ai/providers/codex-provider.ts` | Codex app-server 공급자 |
| `src/core/ai/providers/hermes-provider.ts` | Legacy Hermes CLI 공급자 |
| `src/core/scheduler/private-scheduler.ts` | 아침 브리핑/긱뉴스/내일 날씨 DM 스케줄러 |
| `src/utils/schedule-run-store.ts` | 스케줄 실행 결과 영속 저장소 |
| `src/utils/server-health.ts` | 브리핑용 서버 디스크·메모리 상태 수집 |
| `src/features/daily_news/geek-news-service.ts` | 긱뉴스 조회, 번역, 이력 처리 |
| `src/features/tools/weather-notification-message.ts` | 날씨 스케줄러 DM 메시지 생성 |
| `scripts/generate-registry.ts` | prefix 명령어 레지스트리 자동 생성 |

## 환경변수

프로젝트 루트에 `.env`가 필요합니다. `.env`는 커밋하지 않습니다.

필수:

```text
DISCORD_BOT_TOKEN=
ADMIN_ID=
```

AI:

```text
AI_PROVIDER=
AI_FALLBACK_PROVIDER=
GEMINI_AI_API_KEY=
GEMINI_MODEL=
HERMES_BIN=
HERMES_TIMEOUT_MS=
HERMES_TOOLSETS=
HERMES_ADMIN_TOOLSETS=
CODEX_BIN=
CODEX_MODEL=
CODEX_WORKDIR=
CODEX_TIMEOUT_MS=
CODEX_SANDBOX=
CODEX_APPROVAL_POLICY=
CODEX_ADMIN_SEARCH=
CODEX_ADMIN_SANDBOX=
CODEX_ADMIN_APPROVAL_POLICY=
```

날씨:

```text
WEATHER_ADMIN_REGION=
WEATHER_SHORT_END_POINT=
WEATHER_SHORT_API_KRY=
WEATHER_MIDDLE_END_POINT=
WEATHER_MIDDLE_API_KEY=
```

뉴스:

```text
NAVER_APP_CLIENT_ID=
NAVER_APP_CLIENT_SECRET=
```

## 개발

설치:

```bash
npm install
```

테스트:

```bash
npm test -- --runInBand
```

타입 체크:

```bash
npm run type-check
```

빌드:

```bash
npm run build
```

명령어 레지스트리 재생성:

```bash
npm run gen:registry
```

운영 의존성 감사:

```bash
npm audit --omit=dev
```

Dependabot이 매주 루트 npm 의존성을 확인해 업데이트 PR을 만듭니다. 감사 결과에 강제 major 변경만 제안되는 경우에는 `npm audit fix --force`를 바로 적용하지 말고, 공급자 라이브러리의 호환 릴리스를 먼저 확인합니다.

## 배포

현재 운영 대상 SSH alias는 `icenux-external`입니다. `main` 브랜치 push 시 GitHub Actions self-hosted runner가 `npm ci`, 명령어 레지스트리 생성, 테스트, 타입 검사, 빌드를 수행한 뒤 서버의 `~/projects/discord-bot`에 배포하고 PM2를 재시작합니다.

서버 상태 확인:

```bash
ssh icenux-external 'export PATH="$HOME/.local/npm-global/bin:$HOME/.local/bin:$PATH"; pm2 status discord-bot --no-color'
```

Codex CLI smoke test:

```bash
ssh icenux-external 'export PATH="$HOME/.local/npm-global/bin:$HOME/.local/bin:$PATH"; codex --version'
ssh icenux-external 'test -f "${CODEX_HOME:-$HOME/.codex}/auth.json" && echo "codex auth file exists"'
```

## 문서

- `documents/codex-app-server-provider.md`: Hermes 없는 Codex app-server 직접 연동 기준
- `documents/hermes-agent-goal.md`: legacy Hermes provider와 `!헤르메스` 호환 alias 기준
- `documents/natural-language-ai-concept.md`: 관리자 AI 중심 컨셉
- `documents/natural-language-ai-plan.md`: 관리자 AI 운영 플랜
- `documents/ai-guidelines.md`: AI 사용 지침
- `documents/pm2-deployment.md`: PM2와 icenux 운영 가이드
- `documents/discord-bot-infra-diagram-vertical.svg`: 배포·런타임·Codex 연결 구조 다이어그램
- `docs/superpowers/plans/2026-06-03-hermes-codex-oauth-integration.md`: 완료된 legacy Hermes 통합 계획과 현재 Codex 대체 상태
