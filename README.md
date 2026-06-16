# Discord Bot

icenux 서버에서 PM2로 실행되는 관리자 중심 디스코드 봇입니다. 일반 사용자용 명령어와 일반 DM 자연어 기능은 제거했고, 현재 운영 범위는 스케줄러와 관리자 기능으로 제한합니다.

## 현재 컨셉

- 서버 채널과 일반 사용자 DM의 일반 기능 요청은 처리하지 않습니다.
- 스케줄러는 PM2 프로세스 안에서 날씨 DM과 긱뉴스 관리자 DM을 발송합니다.
- 관리자 기능은 DM과 `ADMIN_ID` 조건을 확인한 뒤 실행합니다.
- 관리자 DM의 prefix 없는 메시지는 운영 기본값에서 Hermes session으로 처리합니다.
- Hermes 관리자 세션은 웹, 브라우저, 터미널, 파일 조회, 코드 실행, read-only MCP를 사용할 수 있습니다.
- Discord 메시지 전송, 삭제, 채널 관리 도구는 Hermes에 제공하지 않습니다.
- 봇이 서버에서 준비되면 `ADMIN_ID` 사용자에게 준비 완료 DM을 보냅니다.

## 남아 있는 기능

### 스케줄러

- 날씨 DM: 알림 대상 사용자에게 매일 06:30 오늘 날씨, 22:30 내일 날씨를 보냅니다.
- 긱뉴스 DM: 매일 08:00 KST에 `ADMIN_ID` 관리자 DM으로 긱뉴스 상단 기사 번역을 보냅니다.

스케줄러 내부 구현과 데이터는 유지합니다. 날씨 스케줄러는 `user-preferences.json`의 기존 알림 설정을 읽고, 긱뉴스 스케줄러는 긱뉴스 이력 저장소를 사용합니다.

### 관리자 명령어

| 명령어 | 설명 |
| --- | --- |
| `/관리자` | 관리자 명령어 목록을 보여줍니다. |
| `/관리자 로그 [개수]` | 최근 명령어 로그를 조회합니다. |
| `/관리자 공지 <내용>` | 등록된 사용자에게 공지를 발송합니다. |
| `/관리자 뉴스` | 뉴스 콘텐츠 발송을 테스트합니다. |
| `/관리자 데이터` | 저장된 데이터 현황을 확인합니다. |
| `/관리자 초기화 <대상>` | 지정한 데이터를 초기화합니다. |
| `/관리자 서버상태` | Node 런타임, 메모리, Hermes 환경 상태를 확인합니다. |
| `/관리자 디스크` | 허용된 서버 디스크 경로의 사용량을 확인합니다. |
| `/관리자 프로세스` | `discord-bot` PM2 프로세스 상태를 확인합니다. |
| `/관리자 배포상태` | 배포 번들 경로와 해시를 확인합니다. |
| `/질문 <질문>` | 관리자 AI 답변을 생성합니다. |

### 관리자 Hermes

| 명령어 | 설명 |
| --- | --- |
| `!헤르메스 상태` | 현재 AI 공급자를 확인합니다. |
| `!헤르메스 켜기` | primary AI 공급자를 Hermes로 바꿉니다. |
| `!헤르메스 끄기` | primary AI 공급자를 Gemini로 바꿉니다. |
| `!헤르메스 초기화` | 현재 관리자 DM 채널의 Hermes session 매핑을 초기화합니다. |

관리자 DM에서 prefix 없이 보낸 메시지는 운영 기본값에서 Hermes session으로 전달됩니다. 이 경로는 관리자 작업, 서버 조사, 웹 검색, 브라우저 확인, 프로젝트 파일 read-only 조회를 위한 에이전트 인터페이스입니다. `!헤르메스 끄기` 상태에서는 primary AI 공급자가 Gemini로 바뀌므로, prefix 없는 관리자 DM도 Hermes session/toolset을 사용하지 않습니다.

`/질문 <질문>`은 현재 AI 공급자를 사용하는 단발 관리자 AI 답변입니다. Hermes session 기억, 관리자 최근 대화 10턴, 백그라운드 후속 보고 흐름을 사용하지 않습니다.

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
4. 관리자 DM의 prefix 없는 메시지는 현재 AI 공급자 설정에 따른 자연어 답변 경로로 처리합니다. 운영 기본값은 Hermes session입니다.
5. 그 외 일반 메시지는 처리하지 않습니다. 단, 일반 사용자가 관리자 명령어를 시도하면 권한 없음 응답을 받을 수 있습니다.

권한 기준:

| 구분 | 서버 채널 | DM | 권한 |
| --- | --- | --- | --- |
| 일반 사용자 기능 | 불가 | 불가 | 해당 없음 |
| 스케줄러 발송 | 해당 없음 | 가능 | 스케줄러 내부 |
| 관리자 명령어 | 불가 | 가능 | `ADMIN_ID` |
| 관리자 Hermes session | 불가 | 가능 | `ADMIN_ID` |
| `!헤르메스` 제어 | 가능 | 가능 | `ADMIN_ID` |

## AI 공급자

운영 기본값은 Hermes입니다.

```text
AI_PROVIDER=hermes
AI_FALLBACK_PROVIDER=gemini
HERMES_BIN=/home/icenux/.local/bin/hermes
HERMES_TIMEOUT_MS=1800000
HERMES_TOOLSETS=web
HERMES_ADMIN_TOOLSETS=web,browser,terminal,file,code_execution,discord-bot-fs
```

Hermes는 디스코드 봇 안에서 관리자 AI provider로 사용합니다. Hermes의 Discord gateway는 사용하지 않으며, `discord.js` 봇이 현재 관리자 DM 메시지와 첨부 메타데이터를 검증된 bridge context로 정리해 Hermes prompt에 전달합니다.

관리자 DM은 운영 기본값에서 사용자+채널 단위 Hermes session을 사용하고, 봇이 관리자 최근 대화 10턴을 함께 prompt에 포함합니다. session 호출 실패 시 Hermes oneshot으로 한 번 재시도합니다. 일반 DM의 bot-managed 압축 기억은 사용하지 않습니다. `!헤르메스 끄기` 상태에서는 이 Hermes session 경로가 아니라 현재 primary AI 공급자 경로를 사용합니다.

Hermes 응답이 60초 안에 끝나면 기존 상태 메시지를 최종 답변으로 수정합니다. 60초를 넘기면 먼저 "완료되면 따로 보고" 메시지를 남기고, Hermes 작업은 최대 30분까지 계속 실행한 뒤 새 메시지로 결과를 보고합니다.

긱뉴스 스케줄러의 AI 요약/번역은 Gemini 키 유무와 무관하게 Hermes만 사용합니다. Hermes 요약/번역이 실패하면 Gemini fallback이나 원문 기반 대체 번역을 사용하지 않고, 관리자 DM embed에 실패 사유를 표시합니다.

`discord-bot-fs` MCP는 `/home/icenux/projects/discord-bot`만 대상으로 하는 read-only filesystem MCP입니다. 허용 도구는 `read_*`, `list_*`, `directory_tree`, `search_files`, `get_file_info`, `list_allowed_directories`이고, `write_file`, `edit_file`, `create_directory`, `move_file`은 allowlist에 포함하지 않습니다.

관리자 DM Hermes는 삭제, 초기화, 덮어쓰기, 강제 재설정, 권한 변경, 대량 발송, 서비스 중단처럼 되돌리기 어렵거나 영향 범위가 큰 작업을 바로 실행하지 않습니다. 대상, 영향 범위, 되돌리는 방법을 요약해 확인을 요청하고, 애매하거나 고민되는 경우에는 작업하지 않고 사용자에게 질문합니다.

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
| `src/core/ai/ai-service.ts` | Gemini/Hermes 공급자 선택과 fallback |
| `src/core/ai/providers/hermes-provider.ts` | Hermes CLI 공급자 |
| `src/core/scheduler/private-scheduler.ts` | 날씨/긱뉴스 DM 스케줄러 |
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
```

날씨:

```text
WEATHER_API_KEY=
WEATHER_BASE_DATE=
WEATHER_BASE_TIME=
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

## 배포

현재 운영 대상은 `icenux-ms7b23`입니다. `main` 브랜치 push 시 GitHub Actions self-hosted runner가 서버의 `~/projects/discord-bot`에서 배포를 수행합니다.

서버 상태 확인:

```bash
ssh icenux-ms7b23 'export PATH="$HOME/.local/npm-global/bin:$HOME/.local/bin:$PATH"; pm2 status discord-bot --no-color'
```

Hermes 웹 검색 smoke test:

```bash
ssh icenux-ms7b23 'cd ~/projects/discord-bot && PATH="$HOME/.local/bin:$PATH" hermes -z "웹 검색 가능 여부를 한 문장으로 확인해줘." --toolsets web --ignore-rules'
```

## 문서

- `documents/hermes-agent-goal.md`: Hermes 에이전트 운영 목표와 경계
- `documents/natural-language-ai-concept.md`: 관리자 Hermes 중심 컨셉
- `documents/natural-language-ai-plan.md`: 관리자 Hermes 운영 플랜
- `documents/ai-guidelines.md`: AI 사용 지침
- `documents/pm2-deployment.md`: PM2와 icenux 운영 가이드
- `docs/superpowers/plans/2026-06-03-hermes-codex-oauth-integration.md`: Hermes/Codex OAuth 통합 계획
