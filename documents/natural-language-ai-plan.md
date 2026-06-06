# 관리자 Hermes 운영 플랜

## 목표

일반 사용자 기능을 제거하고, 스케줄러와 관리자 기능만 남긴다. 자연어 처리는 관리자 DM에서 Hermes session을 호출하는 용도로만 사용한다.

## 메시지 처리 흐름

1. 봇 메시지는 무시한다.
2. 관리자 DM 명령어를 먼저 처리한다.
3. prefix 명령어 레지스트리에서 `!헤르메스`만 처리한다.
4. 관리자 DM의 prefix 없는 메시지는 Hermes session으로 전달한다.
5. 일반 사용자 DM, 서버 채널 일반 메시지, 제거된 일반 명령어는 처리하지 않는다.

## 남은 prefix 명령어

- `!헤르메스 상태`
- `!헤르메스 켜기`
- `!헤르메스 끄기`
- `!헤르메스 초기화`

`!헤르메스`는 `ADMIN_ID`만 사용할 수 있다.

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

## Hermes 운영 규칙

관리자 DM Hermes는 사용자+채널 단위 session을 사용한다. Hermes CLI oneshot session 저장이 비어 있을 수 있으므로, 봇도 관리자 최근 대화 10턴을 별도로 보관해 다음 prompt에 함께 포함한다.

허용 toolset:

```text
web,browser,terminal,file,code_execution,discord-bot-fs
```

`discord-bot-fs`는 `/home/icenux/projects/discord-bot`만 대상으로 하는 read-only MCP다. 쓰기, 수정, 생성, 이동 도구는 허용하지 않는다.

## 검증 기준

- `npm run gen:registry` 실행 후 registry에 `헤르메스`만 남는다.
- `npm test -- --runInBand`가 통과한다.
- `npm run type-check`가 통과한다.
- `npm run build`가 통과한다.
- prefix 명령어 레지스트리에 `헤르메스` 외 커맨드가 남아 있지 않아야 한다.
