# PM2 배포 운영 가이드

## 운영 기준

디스코드 봇은 로컬 Mac 스케줄러가 아니라 icenux 서버의 PM2 프로세스로 실행한다. 현재 운영 대상은 `icenux-ms7b23`이며, `main` 브랜치 push 시 GitHub Actions self-hosted runner가 서버의 `~/projects/discord-bot`에서 배포를 수행한다.

## 로컬 빌드

```bash
npm run build
```

빌드 전 `prebuild`에서 `scripts/generate-registry.ts`가 실행되어 `src/core/registry.ts`를 재생성한다.

## 재배포

현재 사용하는 배포 흐름:

1. `main` 브랜치에 변경 사항을 push한다.
2. GitHub Actions self-hosted runner가 배포 산출물(`package.json`, `package-lock.json`, `ecosystem.config.cjs`, `dist/index.js`)을 icenux 서버의 `~/projects/discord-bot`로 복사한다.
3. runner가 빌드 후 PM2 프로세스를 `--update-env`로 재시작한다.

서버의 `~/projects/discord-bot`는 운영 실행 디렉터리이며, 전체 소스 체크아웃을 유지하는 위치가 아니다.

이전 배포는 로컬 빌드 결과물을 Termux 서버로 SCP 전송하고 Cloudflare/Termux 경로로 PM2를 재시작하는 방식이었다. 해당 흐름은 현재 운영 기준이 아니다.

## 운영 스케줄러

스케줄러는 별도 cron이나 별도 PM2 프로세스가 아니라 `discord-bot` PM2 프로세스 안에서 초기화된다.

- 날씨 DM: `ADMIN_ID` 운영자에게 매일 06:30 오늘 날씨, 22:30 내일 날씨를 보낸다. 지역은 `WEATHER_ADMIN_REGION`을 우선 사용하고, 값이 없으면 운영자의 기존 `user-preferences.json` 지역 설정, 그마저 없으면 `서울`을 사용한다.
- 긱뉴스 DM: 매일 08:00 KST에 `ADMIN_ID` 관리자 DM으로 긱뉴스 상단 기사 번역을 보낸다.

## 상태 확인

```bash
ssh icenux-ms7b23 'cd ~/projects/discord-bot && PATH="$HOME/.local/npm-global/bin:$PATH" pm2 status discord-bot --no-color'
```

로그 확인:

```bash
ssh icenux-ms7b23 'cd ~/projects/discord-bot && PATH="$HOME/.local/npm-global/bin:$PATH" pm2 logs discord-bot'
```

## 최초 서버 준비

서버에서 한 번만 준비한다. PM2는 `/home/icenux/.local/npm-global/bin/pm2`에 설치되어 있어야 하며, 운영 실행 디렉터리인 `~/projects/discord-bot`가 있어야 한다.

최초 배포는 GitHub Actions로 수행하거나 동일한 배포 산출물(`package.json`, `package-lock.json`, `ecosystem.config.cjs`, `dist/index.js`)을 수동으로 복사한다. 산출물이 준비된 뒤 아래 명령을 실행한다.

```bash
ssh icenux-ms7b23 'cd ~/projects/discord-bot && npm ci --omit=dev --ignore-scripts && PATH="$HOME/.local/npm-global/bin:$PATH" pm2 start ecosystem.config.cjs --update-env && PATH="$HOME/.local/npm-global/bin:$PATH" pm2 save'
```

서버 재부팅 후 자동 복구가 필요하면 PM2 startup 설정을 별도로 적용한다.

## 환경변수

봇은 `dotenv/config`를 사용한다. 운영 서버의 프로젝트 루트에 `.env`가 있어야 한다.

필수 값:

- `DISCORD_BOT_TOKEN`
- `ADMIN_ID`

기능별 필요 값:

- `GEMINI_AI_API_KEY`
- `GEMINI_MODEL`
- `NAVER_APP_CLIENT_ID`
- `NAVER_APP_CLIENT_SECRET`
- `WEATHER_ADMIN_REGION`
- `WEATHER_SHORT_END_POINT`
- `WEATHER_SHORT_API_KRY`
- `WEATHER_MIDDLE_END_POINT`
- `WEATHER_MIDDLE_API_KEY`

`.env`는 저장소에 커밋하지 않는다.

## Hermes / Codex OAuth AI Provider

운영 서버에서 Hermes / Codex OAuth를 AI provider로 사용할 때의 환경변수 예시는 아래와 같다.

```bash
AI_PROVIDER=hermes
AI_FALLBACK_PROVIDER=gemini
HERMES_BIN=/home/icenux/.local/bin/hermes
HERMES_TIMEOUT_MS=1800000
HERMES_TOOLSETS=web
HERMES_ADMIN_TOOLSETS=web,browser,terminal,file,code_execution,discord-bot-fs
```

Hermes의 Discord gateway는 사용하지 않는다. 현재 `discord.js` 봇이 유일한 Discord gateway이며, Hermes는 관리자 DM의 운영 기본 AI provider로 사용한다. 관리자 DM은 운영 기본값에서 Hermes session을 사용하고, 봇이 관리자 최근 대화 10턴을 prompt에 함께 포함한다. session 호출 실패 시 Hermes oneshot으로 한 번 재시도한다. `!헤르메스 끄기` 상태에서는 primary AI 공급자가 Gemini로 바뀌므로 prefix 없는 관리자 DM도 Hermes session/toolset을 사용하지 않는다. 일반 DM의 AI 답변과 bot-managed 압축 기억은 사용하지 않는다. 봇은 현재 관리자 Discord 메시지와 첨부 메타데이터를 bridge context로 정리해 prompt에 포함하고, 이미지 첨부는 Discord CDN URL을 우선 참조하되 URL 접근 실패에 대비해 타입과 크기를 제한한 임시 파일 fallback 경로를 함께 제공한다. Discord 쓰기/삭제/관리 tool은 Hermes에 열지 않는다. 관리자 DM은 Hermes 경로에서 `HERMES_ADMIN_TOOLSETS`로 브라우저 자동화, 서버 파일, 터미널, 코드 실행, `discord-bot-fs` MCP toolset을 별도로 사용한다. Discord 사용자 입력은 신뢰할 수 없는 입력이므로 hook 자동 승인은 사용하지 않는다.

관리자 Hermes 요청이 60초 안에 끝나면 상태 메시지를 최종 답변으로 수정한다. 60초를 넘기면 완료 후 별도 보고하겠다는 선응답을 남기고, Hermes 작업은 최대 30분까지 백그라운드로 계속 실행한 뒤 새 메시지로 결과를 보낸다.

긱뉴스 스케줄러의 AI 요약/번역은 Gemini fallback을 사용하지 않고 Hermes만 호출한다. Hermes 요약/번역이 실패하면 원문 기반 대체 번역을 보내지 않고, 관리자 DM embed에 실패 사유를 표시한다.

`discord-bot-fs` MCP는 `/home/icenux/projects/discord-bot`만 대상으로 하는 read-only filesystem MCP이다. `~/.hermes/config.yaml`의 `mcp_servers.discord-bot-fs.tools.include`에는 `read_*`, `list_*`, `directory_tree`, `search_files`, `get_file_info`, `list_allowed_directories`만 포함한다. `write_file`, `edit_file`, `create_directory`, `move_file`은 포함하지 않는다.

관리자 DM Hermes는 삭제, 초기화, 덮어쓰기, 강제 재설정, 권한 변경, 대량 발송, 서비스 중단처럼 되돌리기 어렵거나 영향 범위가 큰 작업을 바로 실행하지 않는다. 대상, 영향 범위, 되돌리는 방법을 요약해 확인을 요청하고, 애매하거나 고민되는 경우에는 작업하지 않고 사용자에게 질문한다.

서버에서 Hermes 실행 상태를 확인할 때는 아래 smoke command를 사용한다.

```bash
ssh icenux-ms7b23 'cd ~/projects/discord-bot && PATH="$HOME/.local/bin:$PATH" hermes -z "웹 검색 가능 여부를 한 문장으로 확인해줘." --toolsets web --ignore-rules'
```

정상 출력은 한 문장 이상의 응답 문장이다. 관리자 DM 일반 Hermes 응답은 공급자 설정을 따르지만, 긱뉴스 AI 요약/번역은 Hermes 전용으로 실행되며 fallback provider로 전환하지 않는다.

이 Hermes 통합은 새로운 런타임/데이터 파일명을 추가하지 않는다. 저장소에 새로 추가하는 파일은 kebab-case를 따라야 하며, `README.md`는 기존 conventional 파일명이다.

## 로그

PM2 로그 파일은 아래 경로에 쌓인다.

- `logs/discord-bot-out.log`
- `logs/discord-bot-error.log`

`logs/`는 `.gitignore`에 포함되어 커밋하지 않는다.
