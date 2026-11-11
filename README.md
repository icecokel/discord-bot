# Discord Bot

관리자 명령과 정기 알림을 제공하는 디스코드 봇입니다. 일반 사용자용 명령어와 일반 DM 자연어 기능은 제거했고, 현재 운영 범위는 스케줄러와 관리자 기능으로 제한합니다.

## 현재 컨셉

- 서버 채널과 일반 사용자 DM의 일반 기능 요청은 처리하지 않습니다.
- 스케줄러는 봇 프로세스 안에서 아침 브리핑, 긱뉴스, 내일 날씨, 신규 채용공고와 활성화된 X 감시 알림을 관리자 DM으로 발송합니다.
- 관리자 기능은 DM과 `ADMIN_ID` 조건을 확인한 뒤 실행합니다.
- 관리자 DM의 prefix 없는 메시지는 운영 기본값에서 Claude API로 처리하며 최근 대화 10턴을 전달합니다.
- `discord.js` 봇이 유일한 Discord gateway이고, Claude는 봇 프로세스 내부 provider로만 호출합니다.
- AI 에이전트에는 Discord 메시지 전송, 삭제, 채널 관리 도구를 제공하지 않습니다.
- 봇이 서버에서 준비되면 `ADMIN_ID` 사용자에게 준비 완료 DM을 보냅니다.

Claude API 연동 기준은 [Claude provider 문서](documents/claude-api-provider.md)에 둡니다.

## 남아 있는 기능

### 스케줄러

- 아침 브리핑: 매일 06:00 KST에 `ADMIN_ID` 관리자 DM으로 오늘 날씨를 보내고, 서버 디스크 사용률이 85% 이상이거나 여유 메모리가 10% 이하이거나 상태 확인에 실패했을 때 서버 상태를 함께 보냅니다. OCI에서는 Node.js의 `os.freemem()`과 `os.totalmem()`으로 여유 메모리 비율을 계산합니다.
- 긱뉴스: 매일 07:50 KST에 `ADMIN_ID` 관리자 DM으로 긱뉴스 상단 기사 번역을 보냅니다.
- 내일 날씨: 매일 22:30 KST에 `ADMIN_ID` 운영자에게 내일 날씨를 보냅니다.
- 채용공고: 매일 07:00, 13:00, 19:00 KST에 공식 채용 사이트를 확인하고 새 공고만 `ADMIN_ID` 관리자 DM으로 보냅니다.

날씨 지역은 `WEATHER_ADMIN_REGION`을 우선 사용하고, 값이 없으면 운영자의 기존 `user-preferences.json` 지역 설정, 그마저 없으면 `서울`을 사용합니다. 긱뉴스는 이력 저장소를 사용합니다. 채용공고 감시는 처음 성공한 수집 결과를 기준선으로 저장하므로 배포 직후 기존 공고가 한꺼번에 발송되지 않습니다. 이후 처음 확인한 공고 ID만 알림을 보내며, 일부 회사 조회가 실패해도 다른 회사 수집은 계속합니다. 스케줄 실행 결과는 `schedule-run-history.json`에 성공, 일부 성공, 실패 상태와 최근 시각, 다음 실행 시각을 기록합니다. 같은 시각에 실행되는 작업은 내용을 모두 준비한 뒤 같은 수신자의 DM으로 합칩니다. 06:00에는 오늘 날씨와 티보 야간 업데이트를, 07:00·13:00·19:00에는 새 채용공고와 티보 업데이트를 함께 보냅니다. 내용이 길면 기존 본문 분할 단위를 유지하며 첫 메시지 이후에는 알림음을 억제합니다. 실제 발송은 해당 작업들의 수집·번역 완료 후이며, 실패하거나 보낼 내용이 없는 작업은 다른 알림을 막지 않습니다.

채용공고는 공고 제목을 기준으로 **프론트엔드, 풀스택, AX 엔지니어, Product Engineer** 직군만 감시합니다. 백엔드만 명시된 공고와 다른 직군은 알림 및 채용공고 이력 비교 대상에서 제외하며, 기존 이력은 배포 후 회사별 첫 정상 수집에서 현재 필터에 맞게 정리합니다.

#### X 업데이트 감시

`X_MONITOR_ENABLED=true`로 활성화하면 창 모드 Chromium으로 `https://x.com/thsottiaux`를 매시 00분·20분·40분에 확인합니다. 발송 완료 이력에 없는 글은 첫 수집부터 알림 대상입니다. 미발송 글의 원문 전체와 번역에 성공한 경우 Claude API 한국어 번역을 관리자 DM으로 공유하며, **KST 20:00~다음 날 06:00에는 수집만 하고 06:00 배치에서 모아서 알립니다.** 긴 모음은 여러 메시지로 나눕니다. 발송에 성공한 메시지마다 `x-profile-history.json`의 `deliveries`에 발송 시각(UTC), 수신자·채널·메시지 ID, 실제 발송 내용, 포함 글 ID와 전송 완료 글 ID를 저장합니다. 06:00 수집 실패 시에도 저장된 대기 글은 보내고, 발송 실패·재시작 시 미전송분은 다음 주간 배치에서 재시도합니다.

번역은 주간 발송 전에 실행하고 성공한 번역을 이력에 저장합니다. 번역에 실패하면 관리자에게 별도 경고 DM을 보내고, 해당 글도 실패 표시와 함께 원문을 발송합니다. 경고 DM 전송에 실패해도 원문 발송을 계속하며, 게시물 DM 전송에 실패하면 다음 주간 배치에서 이어 보냅니다. 다른 글의 번역과 발송은 계속합니다. 원문·번역은 길어도 생략하지 않고 분할하며 전송된 부분의 위치도 저장합니다. `ANTHROPIC_API_KEY`, `CLAUDE_MODEL`, `CLAUDE_TIMEOUT_MS` 설정을 사용합니다.

`/관리자 X확인`으로 즉시 확인하고 `/관리자 스케줄상태`에서 결과·보류 건수를 볼 수 있습니다. 야간 수동 확인도 알림 보류를 따릅니다. 설정이 없으면 비활성입니다.

설치와 검증은 프로젝트 루트에서 실행합니다.

```bash
PLAYWRIGHT_BROWSERS_PATH="$PWD/.local/ms-playwright" npx playwright install chromium
npm run check:x-profile
npm run check:x-profile -- --live
npm run check:x-profile -- --translate
```

`--translate`는 직전에 수집한 원문을 실제 Claude API로 번역해 `.local/x-bilingual-preview.json`에 원문·번역·발송 메시지를 저장합니다. Discord로 보내지 않습니다. 배포 서버의 점검 명령은 [운영 서버 가이드](documents/mac-mini-deployment.md#운영-전환)를 참고하세요.

첫 검사는 네트워크 없이 Chromium에서 DOM 추출 규칙을 확인합니다. `--live`는 실제 X 수집 결과와 전체 본문을 `.local/x-profile-preview.json`에 저장하며 알림 이력 저장·Discord 전송은 하지 않습니다. 최초 수집은 정상적으로 읽힌 최근 목록을 기준선으로 사용하고, 접힌 글은 상세 페이지에서 원문을 읽습니다. 후속 수집은 기존 체크포인트 연결 여부를 계속 검증합니다. 창 모드가 기본값이며, `X_MONITOR_HEADLESS=true`는 해당 환경에서 실제 수집 성공을 확인한 경우에만 사용합니다. OCI 배포 워크플로는 운영 앱의 `.local/ms-playwright`에 Chromium을 설치합니다. OCI에서 Xvfb로 실행하는 점검 명령은 [운영 서버 가이드](documents/mac-mini-deployment.md#운영-전환)를 참고하세요.

로그인이 필요한 환경에서는 운영자가 Chromium에서 직접 로그인해 저장한 상태를 실행 디렉터리의 `.local/x-auth-state.json`에 둡니다. 파일은 `chmod 600`으로 보호하고 Git·로그·배포 아티팩트에 포함하지 않습니다. 로그인 만료·CAPTCHA·접근 차단은 실패로 기록하며 우회하지 않습니다. `.local/`과 운영 이력 `dist/data/x-profile-history.json`은 배포·재시작 시 보존합니다. 단일 봇 프로세스에서 동작하며, 전송 성공 직후 저장 전에 종료되면 같은 글이 다시 올 수 있습니다.

이전 설계의 수집 범위·인수 조건은 [X 감시 설계서](documents/x-profile-monitor-design.md)에 남아 있습니다.

#### 채용공고 감시 대상

| 회사 | 공식 채용 사이트 |
| --- | --- |
| 네이버 | [NAVER Careers](https://recruit.navercorp.com/rcrt/list.do?sysCompanyCdArr=KR&sysCompanyCdData=KR) |
| 카카오 | [카카오 영입](https://careers.kakao.com/jobs) |
| 토스 | [토스 채용](https://toss.im/career/jobs) |
| 당근 | [당근 채용](https://careers.daangn.com/jobs/) |
| 우아한형제들 | [우아한형제들 인재영입](https://career.woowahan.com/recruitment/) |
| LINE | [LINE Careers](https://careers.linecorp.com/ko/jobs?ca=All&ci=Gwacheon%2CBundang&co=East%20Asia) |
| 쿠팡 | [Coupang Careers](https://www.coupang.jobs/kr/jobs/) |
| 무신사 | [MUSINSA Careers](https://www.musinsacareers.com/ko/home) |
| 오늘의집 | [Bucketplace Careers](https://www.bucketplace.com/careers/?region=&team=dev) |
| 컬리 | [Kurly Careers](https://kurly.career.greetinghr.com/ko/recruiting) |
| 카카오뱅크 | [KakaoBank Careers](https://recruit.kakaobank.com/jobs) |
| 두나무 | [Dunamu Careers](https://www.dunamu.com/careers/jobs) |
| 하이퍼커넥트 | [Hyperconnect Careers](https://career.hyperconnect.com/jobs/) |
| 센드버드 | [Sendbird Careers](https://sendbird.com/careers) |
| 몰로코 | [Moloco Careers](https://www.moloco.com/ko/open-positions) |
| 카카오스타일 | [KakaoStyle Careers](https://career.kakaostyle.com/jobs) |
| 에이블리 | [ABLY Careers](https://ably.team/recruit) |

### 상태 데이터

운영 상태는 배포 번들 옆의 `dist/data/`에 저장합니다. 현재 `user-preferences.json`, `geek-news-history.json`, `job-monitor-history.json`, `schedule-run-history.json`, `x-profile-history.json`이 이 경로를 사용합니다. 저장할 때는 같은 디렉터리의 임시 파일을 만든 뒤 교체하므로 기존 파일이 부분적으로 덮어써지는 일을 피합니다. 파일이 없을 때만 기본값을 사용합니다. JSON이 손상되면 원본은 그대로 두고 `*.corrupt-<timestamp>-<pid>` 복구 사본을 만든 뒤 오류를 전파하므로, 빈 상태로 자동 덮어쓰지 않습니다.

### 관리자 명령어

| 명령어 | 설명 |
| --- | --- |
| `/관리자` | 관리자 명령어 목록을 보여줍니다. |
| `/관리자 로그 [개수]` | 최근 명령어 로그를 조회합니다. |
| `/관리자 공지 <내용>` | 등록된 사용자에게 공지를 발송합니다. |
| `/관리자 뉴스` | 뉴스 콘텐츠 발송을 테스트합니다. |
| `/관리자 데이터` | 저장된 데이터 현황을 확인합니다. |
| `/관리자 초기화 <대상>` | 지정한 데이터를 초기화합니다. |
| `/관리자 서버상태` | Node 런타임, 메모리, Claude 환경 상태를 확인합니다. |
| `/관리자 디스크` | 허용된 서버 디스크 경로의 사용량을 확인합니다. |
| `/관리자 프로세스` | `discord-bot` 프로세스 상태를 확인합니다. |
| `/관리자 배포상태` | 배포 번들 경로와 해시를 확인합니다. |
| `/관리자 스케줄상태` | 최근 스케줄 실행 결과와 다음 실행 시간을 확인합니다. |
| `/관리자 채용공고` | 현재 감시 직군 채용공고를 즉시 조회합니다. |
| `/관리자 X확인` | X 게시물을 즉시 확인합니다. 야간에는 발송을 보류합니다. |
| `/질문 <질문>` | 관리자 AI 답변을 생성합니다. |

### 관리자 AI 제어(Claude)

| 명령어 | 설명 |
| --- | --- |
| `!클로드 상태` | 현재 AI 공급자를 확인합니다. |
| `!클로드 켜기` | primary AI 공급자를 Claude로 바꿉니다. |
| `!클로드 초기화` | 현재 채널의 관리자 대화 기억과 legacy 세션 매핑을 초기화합니다. |
| `!코덱스 ...`, `!헤르메스 ...` | 기존 명령어를 위한 Claude 제어 호환 alias입니다. |

관리자 DM의 일반 메시지는 Claude API에 전달합니다. 최근 대화 10턴과 지원되는 첨부 이미지를 사용하며, Claude API 경로에는 웹 검색, 브라우저, 터미널, 서버·로컬 파일 접근 도구를 제공하지 않습니다.

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
4. 관리자 DM의 prefix 없는 메시지는 현재 AI 공급자 설정에 따른 자연어 답변 경로로 처리합니다. 기본값은 Claude API입니다.
5. 그 외 일반 메시지는 처리하지 않습니다. 단, 일반 사용자가 관리자 명령어를 시도하면 권한 없음 응답을 받을 수 있습니다.

권한 기준:

| 구분 | 서버 채널 | DM | 권한 |
| --- | --- | --- | --- |
| 일반 사용자 기능 | 불가 | 불가 | 해당 없음 |
| 스케줄러 발송 | 해당 없음 | 가능 | 스케줄러 내부 |
| 관리자 명령어 | 불가 | 가능 | `ADMIN_ID` |
| 관리자 AI 대화 | 불가 | 가능 | `ADMIN_ID` |
| `!클로드` 제어 | 가능 | 가능 | `ADMIN_ID` |
| `!코덱스`, `!헤르메스` 호환 alias | 가능 | 가능 | `ADMIN_ID` |

## AI 공급자

기본 AI 공급자는 `AI_PROVIDER=claude`입니다. `AI_PROVIDER`가 비어 있거나 지원하지 않는 값이면 Claude로 시작합니다. 로컬 불릿 편집기의 공식 `@anthropic-ai/sdk` 연동 방식과 동일하게 `ANTHROPIC_API_KEY`를 서버에서만 사용하며, 기본 모델은 `claude-sonnet-5-5`, 제한 시간은 45초, SDK 자동 재시도는 0회입니다.

긱뉴스 요약·번역과 X 감시 번역은 관리자 대화의 공급자 선택과 관계없이 Claude를 사용하며 JSON 스키마로 응답 형식을 제한합니다. 긱뉴스 실패는 관리자 embed에 사유를 표시하고, X 번역 실패는 기존 원문 발송·재시도 정책을 따릅니다.

환경변수는 [운영 서버 가이드](documents/mac-mini-deployment.md#운영-설정)에, 응답·오류·첨부 처리 방식은 [Claude provider 문서](documents/claude-api-provider.md)에 정리했습니다.

Codex/Hermes provider는 과거 운영 호환을 위해 남겼으며 `AI_PROVIDER=codex` 또는 `AI_PROVIDER=hermes`로 명시한 경우에만 관리자 AI 경로에서 사용합니다. `!코덱스`와 `!헤르메스` 명령은 Claude 제어 alias입니다. [Codex 문서](documents/codex-app-server-provider.md)와 [Hermes 문서](documents/hermes-agent-goal.md)는 legacy 참고 자료입니다.

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
| `src/core/ai/ai-service.ts` | Claude 및 legacy 공급자 선택 |
| `src/core/ai/providers/claude-provider.ts` | Claude Messages API 공급자 |
| `src/core/ai/providers/codex-provider.ts` | Legacy Codex app-server 공급자 |
| `src/core/ai/providers/hermes-provider.ts` | Legacy Hermes CLI 공급자 |
| `src/core/scheduler/private-scheduler.ts` | 아침 브리핑/긱뉴스/내일 날씨/채용공고와 선택적 X 감시 스케줄러 |
| `src/utils/schedule-run-store.ts` | 스케줄 실행 결과 영속 저장소 |
| `src/utils/server-health.ts` | 브리핑용 서버 디스크·메모리 상태 수집 |
| `src/features/daily_news/geek-news-service.ts` | 긱뉴스 조회, 번역, 이력 처리 |
| `src/features/job-monitor/company-job-sources.ts` | 공식 채용 사이트 목록과 회사별 공고 수집기 |
| `src/features/job-monitor/job-monitor-service.ts` | 신규 공고 비교와 기준선/알림 이력 처리 |
| `src/utils/job-monitor-store.ts` | 회사별 확인 완료 공고 ID 영속 저장소 |
| `src/features/tools/weather-notification-message.ts` | 날씨 스케줄러 DM 메시지 생성 |
| `scripts/generate-registry.ts` | prefix 명령어 레지스트리 자동 생성 |

## 환경변수

로컬 개발은 저장소 루트 `.env`를 사용합니다. 운영 봇은 실행 디렉터리의 `.env`를 사용하며, 필수 값과 기능별 변수는 [운영 서버 가이드](documents/mac-mini-deployment.md#운영-설정)에 정리했습니다. `.env`는 커밋하지 않습니다.

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

`main` 브랜치 push 시 춘천 OCI의 GitHub Actions 러너 `discord-bot-oci`가 테스트, 타입 검사, 빌드를 수행합니다. 같은 호스트에서 운영 번들을 배포하고 systemd가 재시작한 봇의 Discord 로그인을 확인합니다. 운영 설정, 상태 확인, 복구 절차는 [운영 서버 가이드](documents/mac-mini-deployment.md)를 참고하세요.

## 문서

- `documents/claude-api-provider.md`: Claude API 연동과 오류 처리 기준
- `documents/codex-app-server-provider.md`: legacy Codex app-server 연동 참고
- `documents/hermes-agent-goal.md`: legacy Hermes provider와 `!헤르메스` 호환 alias 기준
- `documents/natural-language-ai-concept.md`: 관리자 AI 중심 컨셉
- `documents/ai-guidelines.md`: AI 사용 지침
- `documents/mac-mini-deployment.md`: Mac에서 OCI로의 전환과 운영 서버 가이드
- `documents/discord-bot-infra-diagram-vertical.svg`: 이전 icenux 배포·런타임 구조 다이어그램
- `docs/superpowers/plans/2026-06-03-hermes-codex-oauth-integration.md`: 완료된 legacy Hermes 통합 계획
