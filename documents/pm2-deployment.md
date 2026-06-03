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
- `WEATHER_*`

`.env`는 저장소에 커밋하지 않는다.

## Hermes / Codex OAuth AI Provider

운영 서버에서 Hermes / Codex OAuth를 AI provider로 사용할 때의 환경변수 예시는 아래와 같다.

```bash
AI_PROVIDER=hermes
AI_FALLBACK_PROVIDER=gemini
HERMES_BIN=/home/icenux/.local/bin/hermes
HERMES_TIMEOUT_MS=60000
HERMES_TOOLSETS=web
```

Hermes의 Discord gateway는 사용하지 않는다. 현재 `discord.js` 봇이 유일한 Discord gateway이며, Hermes는 `aiService.generateText()`에서 텍스트 생성을 호출할 때만 사용한다. Hermes 답변은 최신 정보 확인을 위해 `HERMES_TOOLSETS=web`으로 웹 검색 도구를 사용할 수 있다. Discord 사용자 입력은 신뢰할 수 없는 입력이므로 hook 자동 승인은 사용하지 않는다.

서버에서 Hermes 실행 상태를 확인할 때는 아래 smoke command를 사용한다.

```bash
ssh icenux-ms7b23 'cd ~/projects/discord-bot && PATH="$HOME/.local/bin:$PATH" hermes -z "웹 검색 가능 여부를 한 문장으로 확인해줘." --toolsets web --ignore-rules'
```

정상 출력은 한 문장 이상의 응답 문장이다. Codex OAuth 또는 Hermes 오류가 발생하면 `AI_FALLBACK_PROVIDER`를 통해 fallback provider로 전환된다.

이 Hermes 통합은 새로운 런타임/데이터 파일명을 추가하지 않는다. 저장소에 새로 추가하는 파일은 kebab-case를 따라야 하며, `README.md`는 기존 conventional 파일명이다.

## 로그

PM2 로그 파일은 아래 경로에 쌓인다.

- `logs/discord-bot-out.log`
- `logs/discord-bot-error.log`

`logs/`는 `.gitignore`에 포함되어 커밋하지 않는다.
