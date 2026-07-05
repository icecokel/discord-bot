# 관리자 AI 운영 플랜

## 목표

일반 사용자 기능을 제거하고, 스케줄러와 관리자 기능만 남긴다. 현재 자연어 처리는 운영 기본값에서 관리자 DM Hermes session을 호출하는 용도로 사용한다. 선택한 다음 방향은 Hermes 없이 Discord bot이 Codex app-server를 직접 호출하는 구조다. `!헤르메스 끄기` 상태에서는 primary AI 공급자가 Gemini로 바뀌므로 Hermes session/toolset 경로가 아니다.

Codex app-server 전환 기준은 `documents/codex-app-server-provider.md`에 둔다.

## 메시지 처리 흐름

1. 봇 메시지는 무시한다.
2. 관리자 DM 명령어를 먼저 처리한다.
3. prefix 명령어 레지스트리에서 `!헤르메스`만 처리한다.
4. 관리자 DM의 prefix 없는 메시지는 현재 AI 공급자 설정에 따른 자연어 답변 경로로 전달한다. 현재 운영 기본값은 Hermes session이고, 전환 목표는 Codex app-server다.
5. 일반 사용자 DM 일반 메시지, 서버 채널 일반 메시지, 제거된 일반 명령어는 처리하지 않는다. 단, 일반 사용자가 관리자 명령어를 시도하면 권한 없음 응답을 받을 수 있다.

## 남은 prefix 명령어

현재 구현 기준:

- `!헤르메스 상태`
- `!헤르메스 켜기`
- `!헤르메스 끄기`
- `!헤르메스 초기화`

`!헤르메스`는 `ADMIN_ID`만 사용할 수 있다.

`!헤르메스 끄기`는 primary AI 공급자를 Gemini로 바꾼다. 이 상태에서는 prefix 없는 관리자 DM 답변이 Hermes session과 관리자 Hermes toolset을 쓰지 않는다.

Codex 전환 후에는 `!코덱스` 명령을 기본 이름으로 두고, 필요하면 `!헤르메스`를 호환 alias로 남긴다.

## 남은 관리자 명령어

- `/관리자`
- `/관리자 로그 [개수]`
- `/관리자 공지 <내용>`
- `/관리자 뉴스`
- `/관리자 데이터`
- `/관리자 초기화 <대상>`
- `/관리자 서버상태`
- `/관리자 디스크`
- `/관리자 프로세스`
- `/관리자 배포상태`
- `/질문 <질문>`

`/질문 <질문>`은 현재 AI 공급자를 사용하는 단발 관리자 AI 답변이다. Hermes session 기억, 관리자 최근 대화 10턴, 백그라운드 후속 보고 흐름을 사용하지 않는다.

## 남은 스케줄러

- 날씨 DM: 매일 06:30 오늘 날씨, 22:30 내일 날씨
- 긱뉴스 DM: 매일 08:00 KST 관리자 DM

스케줄러 내부 서비스는 유지한다.

- `src/core/scheduler/private-scheduler.ts`
- `src/features/tools/weather-notification-message.ts`
- `src/utils/kma-helper.ts`
- `src/features/daily_news/geek-news-service.ts`
- `src/utils/geek-news-history-store.ts`
- `src/utils/user-store.ts`

## 제거된 실행 경로

- 일반 사용자 prefix 명령어
- 일반 사용자 DM 자연어 답변
- 일반 사용자 자연어 기능 실행
- `intent-service`
- `pending-action-store`
- 날씨/주간날씨/운세/긱뉴스/게임/내정보 command module

## 관리자 AI 운영 규칙

현재 관리자 DM Hermes는 사용자+채널 단위 session을 사용한다. Hermes CLI oneshot session 저장이 비어 있을 수 있으므로, 봇도 관리자 최근 대화 10턴을 별도로 보관해 다음 prompt에 함께 포함한다.

전환 후 Codex provider는 관리자 DM 채널별 Codex thread를 유지하고, 봇의 관리자 최근 대화 context를 함께 전달한다. 봇은 `codex app-server`를 장기 실행 child process로 띄우고 stdio JSON-RPC로 통신한다.

현재 Hermes 허용 toolset:

```text
web,browser,terminal,file,code_execution,discord-bot-fs
```

`discord-bot-fs`는 `/home/icenux/projects/discord-bot`만 대상으로 하는 read-only MCP다. 쓰기, 수정, 생성, 이동 도구는 허용하지 않는다.

Codex 전환 후 기본 sandbox는 read-only로 두며, Discord 메시지 전송, 삭제, 채널 관리 도구는 Codex에 제공하지 않는다.

## 검증 기준

- `npm run gen:registry` 실행 후 registry에 `헤르메스`만 남는다.
- `npm test -- --runInBand`가 통과한다.
- `npm run type-check`가 통과한다.
- `npm run build`가 통과한다.
- 현재 prefix 명령어 레지스트리에 `헤르메스` 외 커맨드가 남아 있지 않아야 한다.
- Codex 전환 구현 후에는 app-server smoke test가 `initialize -> initialized -> thread/start -> turn/start -> turn/completed`까지 통과해야 한다.
