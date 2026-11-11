# Legacy Codex app-server provider 구현

현재 기본 공급자는 [Claude API](claude-api-provider.md)다. 이 문서는 `AI_PROVIDER=codex`로 명시 선택할 때의 legacy 구현 참고이며, 아래의 과거 기본값·명령·뉴스 경로 설명은 현재 운영 기준이 아니다. `!코덱스`와 `!헤르메스`는 현재 Claude 제어 alias다.

## 상태

이 문서는 현재 구현된 Codex app-server provider의 구조와 오류 처리를 설명한다. 맥미니의 환경변수·배포·점검 명령은 [운영 서버 가이드](mac-mini-deployment.md)를 기준으로 한다.

## 결정 사항

- Hermes gateway는 사용하지 않는다. Hermes CLI provider는 legacy 호환용으로만 남긴다.
- `discord.js` 봇이 유일한 Discord gateway로 남는다.
- 봇 프로세스 안에서 `codex app-server`를 장기 실행 child process로 띄우고 stdio JSON-RPC로 통신한다.
- Codex에는 Discord 쓰기/삭제/관리 권한을 넘기지 않는다.
- `codex exec` 단발 호출은 비교 대상일 뿐 목표 구조나 fallback 구조로 두지 않는다.
- 별도 fallback AI provider는 두지 않는다.

## 목표

관리자 DM의 기본 AI provider를 Hermes CLI 경유가 아니라 Codex app-server 직접 호출 구조로 운영한다.

목표 동작:

- `AI_PROVIDER=codex`일 때 관리자 DM의 prefix 없는 메시지를 Codex app-server turn으로 전달한다.
- Discord gateway는 계속 `discord.js` 봇 하나만 사용한다.
- 최종 Discord 응답 전송은 봇이 담당하고, Codex에는 Discord 쓰기/삭제/관리 권한을 넘기지 않는다.
- 관리자 DM 채널별 Codex thread를 유지해 이전 작업 맥락을 이어간다.
- 기본 provider 실패 시 다른 AI로 자동 전환하지 않고 오류를 알린다.
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

권장 구조는 봇 프로세스 내부에서 Codex app-server child process를 장기 실행하는 방식이다.

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

`!코덱스 초기화`와 `!헤르메스 초기화`는 Codex thread 매핑, 관리자 대화 기억, legacy Hermes session 매핑을 함께 지운다.

긱뉴스 요약·번역과 X 감시 번역처럼 일회성으로 호출하는 Codex 작업은 `ephemeral` thread를 사용한다. 이 작업은 Codex 대화 목록에 저장하지 않는다. `systemInstruction`과 JSON 출력 지시는 `thread/start`의 `developerInstructions`로 전달하고, 번역할 원문만 `turn/start`의 사용자 입력으로 전달한다.

## Provider 설정

`AI_PROVIDER`가 비어 있거나 지원하지 않는 값이면 `codex`를 선택한다. `CodexProvider`는 `CODEX_BIN`, `CODEX_MODEL`, `CODEX_WORKDIR`, `CODEX_TIMEOUT_MS`, `CODEX_SANDBOX`, `CODEX_APPROVAL_POLICY`를 사용한다. 관리자 DM 경로는 별도로 `CODEX_ADMIN_SEARCH`, `CODEX_ADMIN_SANDBOX`, `CODEX_ADMIN_APPROVAL_POLICY`를 적용한다.

`CodexProvider` 자체의 sandbox 기본값은 `read-only`지만, 관리자 DM 경로는 `CODEX_ADMIN_SANDBOX`가 없을 때 `workspace-write`를 전달한다. 현재 운영 `.env`는 이를 `read-only`로 설정한다. 실제 값과 인증 점검 방법은 [운영 서버 가이드](mac-mini-deployment.md#운영-설정)에 둔다.

## 배포 구조 영향

운영 실행 디렉터리는 전체 소스 checkout이 아니다. 복사되는 파일과 배포 절차는 [운영 서버 가이드](mac-mini-deployment.md#배포)에 둔다.

Codex app-server가 프로젝트 파일을 조사해야 한다면 선택지가 있다.

1. 현재 운영 번들 디렉터리만 읽게 둔다.
   - 가장 안전하고 단순하다.
   - TypeScript 원본과 테스트는 없다.

2. 별도 read-only 소스 checkout을 둔다.
   - Codex가 원본 코드와 테스트를 조사할 수 있다.
   - 배포 번들과 운영 소스 checkout의 동기화 정책이 필요하다.

현재 `CODEX_WORKDIR`는 운영 실행 디렉터리를 가리킨다. 소스 전체 조사가 필요해지면 별도 read-only checkout을 추가한다.

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

`aiService`는 현재 provider 실패 시 다른 AI로 자동 전환하지 않고 오류를 전달한다. `/질문`처럼 단발 AI 명령도 같은 정책을 따른다.

긱뉴스 요약/번역은 Codex 전용으로 운영한다. 실패하면 관리자 DM embed에 실패 사유를 보여준다.

X 감시 번역도 Codex를 호출한다. 번역이 실패한 글은 원문만 전송하고 실패 사실을 표시한다.

## 테스트 범위

단위 테스트:

- `CodexAppServerClient`가 JSON-RPC request id를 증가시키고 response와 notification을 매칭한다.
- initialize 전에 다른 request를 보내지 않는다.
- thread id 매핑이 channel key별로 유지된다.
- turn completion에서 최종 agent text를 반환한다.
- 실패 notification과 child exit를 reject로 변환한다.
- timeout 시 reject하고 app-server 재시작 대상 상태로 둔다.
- `CodexProvider`가 `systemInstruction`, JSON-only instruction, `model`, `cwd`, sandbox 설정을 turn에 반영한다.
- `AI_PROVIDER`가 비어 있거나 지원하지 않는 값이면 Codex를 선택한다.

운영 점검은 [운영 서버 가이드](mac-mini-deployment.md#상태-확인)의 명령과 관리자 DM의 `[Codex]` 응답으로 수행한다. DM 응답은 app-server의 `initialize -> initialized -> thread/start -> turn/start -> turn/completed` 경로를 함께 확인한다.

## 남은 결정 사항

- Codex thread id를 메모리로만 유지할지, JSON store로 영속화할지.
- 소스 전체 조사가 필요해질 때 read-only checkout을 추가할지.
- Discord 명령어의 `!헤르메스` 호환 alias를 언제 제거할지.
