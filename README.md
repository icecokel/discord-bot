# Discord Bot

한국어 명령어와 자연어 요청을 함께 처리하는 디스코드 개인 비서 봇입니다. 기존 기능은 일반 사용자도 사용할 수 있고, 관리자 작업만 `ADMIN_ID` 권한으로 제한합니다. 단순 질문은 Hermes 기반 AI 비서가 답변하며, 최신 정보가 필요할 때 웹 검색을 사용할 수 있습니다.

## 현재 컨셉

- 일반 사용자는 기존 `!` 명령어 기능을 사용할 수 있습니다.
- DM에서는 prefix 없는 자연어 요청과 단순 질문을 사용할 수 있습니다.
- 서버 채널에서는 `!` prefix 명령어만 처리하고, 일반 대화에는 끼어들지 않습니다.
- 관리자 기능은 DM과 `ADMIN_ID` 조건을 다시 확인한 뒤 실행합니다.
- AI 답변은 Hermes를 기본 공급자로 사용하고, 실패 시 Gemini로 fallback할 수 있습니다.
- 관리자 DM의 Hermes AI 답변은 Hermes session을 사용하고, 일반 DM은 사용자+채널 단위 짧은 대화 맥락을 10턴마다 요약으로 압축합니다.
- DM의 자연어 AI 답변은 현재 Discord 메시지와 첨부 메타데이터를 Hermes 컨텍스트로 전달합니다. 이미지 첨부는 Discord CDN URL을 우선 참조하고, 접근 실패에 대비해 안전한 임시 파일 fallback 경로도 제공합니다.
- 봇이 서버에서 준비되면 `ADMIN_ID` 사용자에게 준비 완료 DM을 보냅니다.

## 주요 기능

- 자연어 요청 처리
  - `서울 날씨 알려줘`
  - `이번 주 부산 날씨 어때?`
  - `오늘 운세 봐줘`
  - `긱뉴스 번역해줘`
  - `수도권에서 팥빙수 맛있는집 찾아줘`
- AI 답변
  - Hermes / Codex OAuth 기반 한국어 답변
  - `HERMES_TOOLSETS=web` 기준 웹 검색 지원
  - Hermes 응답에는 `[Hermes] ` prefix 표시
  - fallback 응답에는 `[Gemini fallback] ` prefix 표시
- 날씨
  - 기상청 단기/중기 예보 조회
  - 기본 지역 저장/해제
  - 날씨 DM 알림 설정/해제
  - 지역 fallback 발생 시 사유 안내
- 운세
  - AI 기반 오늘의 운세 생성
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

## 응답 조건

메시지 처리 순서:

1. 봇이 보낸 메시지는 무시합니다.
2. 관리자 DM 명령어를 먼저 처리합니다.
3. `!` prefix 기반 일반 명령어를 처리합니다.
4. DM 메시지라면 자연어 라우터가 의도를 분류합니다.
5. 확인이 필요한 요청은 `확인` 또는 `취소`를 기다립니다.

권한 기준:

| 구분 | 서버 채널 | DM | 권한 |
| --- | --- | --- | --- |
| 일반 `!` 명령어 | 가능 | 가능 | 모든 사용자 |
| 자연어 기능 실행 | 불가 | 가능 | 모든 사용자 |
| 단순 AI 질문 | 불가 | 가능 | 모든 사용자 |
| 관리자 명령어 | 불가 | 가능 | `ADMIN_ID` |

확인이 필요한 요청:

- 공지 발송
- 데이터 초기화
- 날씨 지역 해제
- 날씨 알림 켜기
- 날씨 알림 끄기

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
| `!긱뉴스` | 긱뉴스 상단 기사 1건을 번역합니다. 매일 08:00 KST에는 관리자 DM으로 자동 발송됩니다. |
| `!게임` | 게임 센터 링크를 보여줍니다. |
| `!내정보` | 디스코드 프로필 정보를 보여줍니다. |
| `!헤르메스 상태\|켜기\|끄기\|초기화` | 관리자 전용 Hermes 상태 확인, 토글, 대화 맥락 초기화입니다. |

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
| `/관리자 서버상태` | Node 런타임, 메모리, Hermes 환경 상태를 확인합니다. |
| `/관리자 디스크` | 허용된 서버 디스크 경로의 사용량을 확인합니다. |
| `/관리자 프로세스` | `discord-bot` PM2 프로세스 상태를 확인합니다. |
| `/관리자 배포상태` | 배포 번들 경로와 해시를 확인합니다. |
| `/질문 <질문>` | 관리자 AI 답변을 생성합니다. |

제거된 명령어:

- `핑`
- `info`
- `도움말`

## AI 공급자

운영 기본값은 Hermes입니다.

```text
AI_PROVIDER=hermes
AI_FALLBACK_PROVIDER=gemini
HERMES_BIN=/home/icenux/.local/bin/hermes
HERMES_TIMEOUT_MS=60000
HERMES_TOOLSETS=web
HERMES_ADMIN_TOOLSETS=web,terminal,file,code_execution
```

Hermes는 디스코드 봇 안에서 AI 답변 공급자로 사용합니다. Hermes의 Discord gateway는 사용하지 않으며, `discord.js` 봇이 현재 메시지와 첨부 메타데이터를 검증된 bridge context로 정리해 Hermes prompt에 전달합니다. 관리자 DM은 사용자+채널 단위 Hermes session을 사용하고, session 호출 실패 시 Hermes oneshot으로 한 번 재시도합니다. 일반 DM은 기존 oneshot 구조와 bot-managed 10턴 압축 기억을 유지합니다. 이미지 첨부는 Discord CDN URL을 우선 참조하고, URL 접근 실패에 대비해 타입과 크기를 제한한 임시 파일 fallback 경로를 함께 제공합니다. Discord 메시지 전송, 삭제, 관리 tool은 Hermes에 열지 않고, 최종 응답 전송은 봇이 담당합니다. 일반 DM은 `HERMES_TOOLSETS=web`만 사용하고, 관리자 DM은 `HERMES_ADMIN_TOOLSETS`로 서버 파일/터미널/코드 실행 toolset을 별도로 열 수 있습니다.

관리자는 실행 중인 봇에서 `!헤르메스 켜기`, `!헤르메스 끄기`, `!헤르메스 상태`로 primary AI 공급자를 토글할 수 있습니다. 이 토글은 런타임 상태만 바꾸며, PM2 재시작 후에는 `.env`의 `AI_PROVIDER` 기준으로 다시 초기화됩니다. `!헤르메스 초기화`는 현재 사용자+채널의 bot-managed 대화 맥락과 Hermes session 매핑을 지웁니다.

AI 답변 페르소나:

- 질문에 정확한 답변을 찾아주는 한국어 AI 비서
- 코딩 도우미가 아님
- 사실 확인과 정확성 우선
- 확실하지 않은 내용은 추측하지 않고 확인 필요 안내
- 토큰, 비밀번호, 개인키 등 민감정보 요청/노출 금지

## 동작 구조

핵심 파일:

| 경로 | 역할 |
| --- | --- |
| `src/index.ts` | Discord Client 진입점과 메시지 처리 순서 |
| `src/core/message-guard.ts` | 봇 메시지 필터와 자연어 DM 조건 |
| `src/core/command-handler.ts` | `!` prefix 명령어 실행 |
| `src/core/admin-middleware.ts` | 관리자 DM 명령어 처리 |
| `src/core/natural-language-router.ts` | 자연어 키워드 실행과 AI 답변 |
| `src/core/ai/intent-service.ts` | 키워드 기반 기능 판별 |
| `src/core/ai/ai-service.ts` | Gemini/Hermes 공급자 선택과 fallback |
| `src/core/ai/providers/hermes-provider.ts` | Hermes CLI 공급자 |
| `src/core/pending-action-store.ts` | 확인이 필요한 작업 보관 |
| `scripts/generate-registry.ts` | 일반 명령어 레지스트리 자동 생성 |

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

기능별:

```text
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

운영 서버는 `icenux-ms7b23`이며, GitHub self-hosted runner와 PM2로 배포합니다.

- runner: `discord-bot-icenux`
- runner labels: `self-hosted`, `Linux`, `X64`, `icenux`, `discord-bot`
- deploy dir: `/home/icenux/projects/discord-bot`
- process: `pm2` 앱 `discord-bot`
- workflow: `.github/workflows/main.yml`
- trigger: `main` branch push

배포 흐름:

1. GitHub Actions가 self-hosted runner에서 실행됩니다.
2. `npm ci`, 테스트, 타입 체크, 빌드를 수행합니다.
3. `package.json`, `package-lock.json`, `ecosystem.config.cjs`, `dist/index.js`를 운영 디렉토리에 반영합니다.
4. 운영 디렉토리에서 production dependency를 설치합니다.
5. PM2로 `discord-bot`을 재시작하고 저장합니다.
6. 봇 로그인과 스케줄러 초기화가 끝나면 관리자 DM으로 준비 완료 알림을 보냅니다.
7. 서버 PM2 프로세스 안에서 날씨 DM과 긱뉴스 관리자 DM 스케줄러가 실행됩니다.

서버 상태 확인:

```bash
ssh icenux-ms7b23 'export PATH="$HOME/.local/npm-global/bin:$HOME/.local/bin:$PATH"; pm2 status discord-bot --no-color'
```

Hermes 웹 검색 smoke test:

```bash
ssh icenux-ms7b23 'cd ~/projects/discord-bot && PATH="$HOME/.local/bin:$PATH" hermes -z "웹 검색 가능 여부를 한 문장으로 확인해줘." --toolsets web --ignore-rules'
```

## 문서

- `documents/natural-language-ai-concept.md`: 제품 컨셉과 사용자 경험 원칙
- `documents/natural-language-ai-plan.md`: 자연어 intent와 실행 매핑
- `documents/ai-guidelines.md`: AI 사용 지침
- `documents/pm2-deployment.md`: PM2와 icenux 운영 가이드
- `docs/superpowers/plans/2026-06-03-hermes-codex-oauth-integration.md`: Hermes/Codex OAuth 통합 계획
