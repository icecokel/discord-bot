# Codex App Server Provider Design

## 상태

이 문서는 현재 구현된 Codex app-server provider 운영 기준 문서다. 선택한 방향은 Hermes 없이 Discord bot이 Codex app-server를 직접 호출하는 구조다.

## 결정 사항

- Hermes gateway는 사용하지 않는다. Hermes CLI provider는 legacy 호환용으로만 남긴다.
- `discord.js` 봇이 유일한 Discord gateway로 남는다.
- 봇 프로세스 안에서 `codex app-server`를 장기 실행 child process로 띄우고 stdio JSON-RPC로 통신한다.
- Codex에는 Discord 쓰기/삭제/관리 권한을 넘기지 않는다.
- `codex exec` 단발 호출은 비교 대상일 뿐 목표 구조나 fallback 구조로 두지 않는다.
- 기존 Gemini fallback은 일반 관리자 AI 답변의 보조 경로로만 유지한다.

## 목표

관리자 DM의 기본 AI provider를 Hermes CLI 경유가 아니라 Codex app-server 직접 호출 구조로 운영한다.

목표 동작:

- `AI_PROVIDER=codex`일 때 관리자 DM의 prefix 없는 메시지를 Codex app-server turn으로 전달한다.
- Discord gateway는 계속 `discord.js` 봇 하나만 사용한다.
- 최종 Discord 응답 전송은 봇이 담당하고, Codex에는 Discord 쓰기/삭제/관리 권한을 넘기지 않는다.
- 관리자 DM 채널별 Codex thread를 유지해 이전 작업 맥락을 이어간다.
- 기존 Gemini fallback은 유지한다.
- 긱뉴스 AI 요약/번역처럼 운영상 AI 실패를 명시해야 하는 경로는 별도 정책을 적용한다.

비목표:

- Hermes gateway를 실행하지 않는다.
- `codex exec` 단발 CLI 래퍼를 목표 구조로 삼지 않는다.
- Codex가 Discord API를 직접 호출하게 하지 않는다.
- 위험 작업을 자동 승인하지 않는다.

## 현재 구조 요약

현재 AI provider 경계는 `BaseProvider.generateText(prompt, options)`다.

주요 흐름:

1. `src/core/natural-language-router.ts`가 관리자 DM을 받는다.
2. 관리자 최근 대화와 Discord 첨부 컨텍스트를 prompt로 구성한다.
3. `aiService.generateTextWithProvider()`가 현재 provider를 호출한다.
4. Codex 구조는 `CodexProvider`가 `codex app-server` child process와 JSON-RPC로 통신하고 관리자 DM 채널별 thread를 유지한다.
5. 60초 안에 끝나면 상태 메시지를 최종 답변으로 수정하고, 더 길어지면 완료 후 별도 메시지로 보고한다.

`natural-language-router`의 Discord 응답 흐름은 기존 관리자 AI 흐름을 유지한다.

## 권장 아키텍처

권장 구조는 PM2 봇 프로세스 내부에서 Codex app-server child process를 장기 실행하는 방식이다.

```text
Discord DM
  -> natural-language-router
  -> aiService
  -> CodexProvider
  -> CodexAppServerClient
  -> codex app-server (stdio JSON-RPC)
```

`CodexProvider`는 `BaseProvider`를 구현하고, 내부에서 `CodexAppServerClient`를 사용한다. app-server 프로토콜 세부 사항은 provider 밖으로 노출하지 않는다.

### 왜 장기 실행인가

Codex app-server는 thread와 turn을 핵심 primitive로 사용한다. 요청마다 app-server를 새로 실행하면 app-server의 thread lifecycle, streaming event, tool progress를 제대로 활용하기 어렵다. 관리자 DM에서 세션형 작업 에이전트처럼 쓰려면 장기 실행 client가 더 맞다.

단발 실행이 필요한 경우에는 `codex exec`가 더 단순하지만, 이 문서의 목표는 app-server 직접 사용이므로 `codex exec`는 fallback 설계가 아니다.

## Codex App Server Client

`CodexAppServerClient`의 책임:

- `codex app-server`를 stdio transport로 spawn한다.
- 시작 직후 `initialize` request를 보내고 `initialized` notification을 보낸다.
- 요청마다 기존 thread를 재사용하거나 새 thread를 만든다.
- `turn/start`를 보내고 stream notification을 읽는다.
- agent message delta 또는 completed item에서 최종 텍스트를 조립한다.
- `turn/completed` 또는 실패 이벤트를 기준으로 promise를 resolve/reject한다.
- app-server child process가 죽으면 다음 요청에서 재시작한다.
- timeout이 발생하면 해당 turn을 실패 처리하고 child process 상태를 점검한다.

공식 app-server 흐름 기준:

1. `codex app-server` 시작
2. `initialize`
3. `initialized`
4. `thread/start` 또는 `thread/resume`
5. `turn/start`
6. `item/*`, `turn/*` notification 수신
7. `turn/completed` 또는 실패 이벤트 처리

## Thread 매핑

초기 구현은 관리자 DM 채널 단위 in-memory 매핑으로 충분하다.

```text
key = `${adminUserId}:${channelId}`
value = codexThreadId
```

운영 재시작 후 thread continuity까지 필요하면 별도 JSON store를 추가한다. 현재 Codex thread 매핑은 메모리 기반이다.

초기화 명령은 기존 `!헤르메스 초기화`와 같은 역할로 Codex thread 매핑과 관리자 대화 기억을 지운다.

## Provider 설정

새 provider 이름은 `codex`로 둔다.

운영 `.env` 예시:

```env
AI_PROVIDER=codex
AI_FALLBACK_PROVIDER=gemini
CODEX_BIN=/home/icenux/.local/npm-global/bin/codex
CODEX_MODEL=gpt-5.4
CODEX_WORKDIR=/home/icenux/projects/discord-bot
CODEX_TIMEOUT_MS=1800000
CODEX_SANDBOX=read-only
CODEX_APPROVAL_POLICY=never
```

권장 기본값:

- `CODEX_SANDBOX=read-only`
- `CODEX_APPROVAL_POLICY=never`
- `CODEX_WORKDIR=/home/icenux/projects/discord-bot`

관리자가 명시적으로 서버 작업이나 코드 변경을 요청하는 경우에도 위험 작업은 Discord prompt에서 확인을 먼저 받아야 한다. 쓰기 권한이 필요하면 별도 승인된 작업 단위에서만 `workspace-write` 정책을 검토한다.

## 서버 세팅

서버에는 Codex CLI와 인증 캐시가 필요하다.

설치 예:

```bash
ssh icenux-external 'npm install -g @openai/codex'
```

인증은 headless 환경이므로 device code 또는 로컬 인증 캐시 복사 중 하나를 사용한다.

device code 예:

```bash
ssh icenux-external 'codex login --device-auth'
```

파일 기반 인증 캐시를 쓰는 경우 `~/.codex/auth.json`은 비밀번호처럼 취급한다. 값은 로그, PR, 이슈, Discord 메시지에 출력하지 않는다.

권장 `~/.codex/config.toml` 기본값:

```toml
cli_auth_credentials_store = "file"
```

필요하면 `CODEX_HOME`을 명시해 봇 전용 Codex state를 분리한다.

```env
CODEX_HOME=/home/icenux/.codex-discord-bot
```

분리할 경우 `CODEX_HOME` 기준으로 다시 로그인해야 한다.

## 배포 구조 영향

현재 GitHub Actions 배포는 `package.json`, `package-lock.json`, `ecosystem.config.cjs`, `dist/index.js`만 `~/projects/discord-bot`에 복사한다. 운영 디렉터리는 전체 소스 checkout이 아니다.

Codex app-server가 프로젝트 파일을 조사해야 한다면 선택지가 있다.

1. 현재 운영 번들 디렉터리만 읽게 둔다.
   - 가장 안전하고 단순하다.
   - TypeScript 원본과 테스트는 없다.

2. 서버에 read-only 소스 checkout을 별도로 둔다.
   - Codex가 원본 코드와 테스트를 조사할 수 있다.
   - 배포 번들과 운영 소스 checkout의 동기화 정책이 필요하다.

1차 전환은 운영 안정성을 우선해 현재 운영 디렉터리를 `CODEX_WORKDIR`로 사용한다. 소스 전체 조사가 필요해지면 별도 read-only checkout을 추가한다.

## 오류 처리

`CodexProvider`는 다음 상황을 명시적으로 실패 처리한다.

- Codex binary 없음
- 인증 없음 또는 만료
- app-server initialize 실패
- thread/start 실패
- turn/start 실패
- turn failed/error notification 수신
- 최종 agent message가 비어 있음
- timeout
- child process exit

`aiService`는 일반 관리자 DM에서 Codex 실패 시 `AI_FALLBACK_PROVIDER=gemini` fallback을 사용할 수 있다. 단, Codex tool 수행이 필요한 요청은 Gemini fallback이 의미 없는 응답을 만들 수 있으므로 fallback 메시지 prefix를 유지한다.

긱뉴스 요약/번역은 Codex 전용으로 운영하고 Gemini fallback을 허용하지 않는다. 실패하면 관리자 DM embed에 실패 사유를 보여준다.

## 테스트 범위

단위 테스트:

- `CodexAppServerClient`가 JSON-RPC request id를 증가시키고 response와 notification을 매칭한다.
- initialize 전에 다른 request를 보내지 않는다.
- thread id 매핑이 channel key별로 유지된다.
- turn completion에서 최종 agent text를 반환한다.
- 실패 notification과 child exit를 reject로 변환한다.
- timeout 시 reject하고 app-server 재시작 대상 상태로 둔다.
- `CodexProvider`가 `systemInstruction`, JSON-only instruction, `model`, `cwd`, sandbox 설정을 turn에 반영한다.
- `AI_PROVIDER=codex` 선택과 Gemini fallback이 동작한다.

운영 smoke test:

```bash
ssh icenux-external 'export PATH="$HOME/.local/npm-global/bin:$PATH"; codex --version'
ssh icenux-external 'test -f "${CODEX_HOME:-$HOME/.codex}/auth.json" && echo "codex auth file exists"'
ssh icenux-external 'cd ~/projects/discord-bot && node -e "console.log(\"codex app-server smoke placeholder\")"'
```

구현 후에는 실제 app-server smoke script를 추가해 `initialize -> initialized -> thread/start -> turn/start -> turn/completed`까지 확인한다.

## 운영 점검 순서

1. 서버에 Codex CLI와 인증이 준비되어 있는지 확인한다.
2. 운영 `.env`가 `AI_PROVIDER=codex`와 필요한 `CODEX_*` 값을 갖는지 확인한다.
3. PM2 프로세스가 `--update-env`로 재시작됐는지 확인한다.
4. 관리자 DM prefix 없는 메시지가 `[Codex]` 응답으로 돌아오는지 확인한다.
5. 긱뉴스 요약/번역 실패 시 Gemini fallback 없이 실패 사유가 표시되는지 확인한다.

## 남은 결정 사항

- Codex thread id를 메모리로만 유지할지, JSON store로 영속화할지.
- 운영 디렉터리만 `CODEX_WORKDIR`로 둘지, read-only 소스 checkout을 따로 둘지.
- Discord 명령어의 `!헤르메스` 호환 alias를 언제 제거할지.
