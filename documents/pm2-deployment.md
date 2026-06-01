# PM2 배포 운영 가이드

## 운영 기준

디스코드 봇은 로컬 Mac 스케줄러가 아니라 배포 서버의 PM2 프로세스로 실행한다. 현재 운영 방식은 로컬에서 빌드한 `dist/index.js`를 Termux 서버로 복사하고, 서버에서 PM2 프로세스를 재시작하는 방식이다.

## 로컬 빌드

```bash
npm run build
```

빌드 전 `prebuild`에서 `scripts/generate-registry.ts`가 실행되어 `src/core/registry.ts`를 재생성한다.

## 재배포

현재 사용하는 배포 흐름:

```bash
npm run build
scp -F /Users/smlee/termux-infra/config/ssh-config dist/index.js termux:~/projects/discord-bot/dist/index.js
/Users/smlee/termux-infra/scripts/tmx run 'cd ~/projects/discord-bot && pm2 restart discord-bot --update-env && pm2 save'
```

서버의 `~/projects/discord-bot`는 운영 실행 디렉터리다. 로컬 저장소 전체를 서버에서 `git pull`하는 방식이 아니다.

## 상태 확인

```bash
/Users/smlee/termux-infra/scripts/tmx run 'cd ~/projects/discord-bot && pm2 status discord-bot --no-color'
```

로그 확인:

```bash
/Users/smlee/termux-infra/scripts/tmx run 'cd ~/projects/discord-bot && pm2 logs discord-bot'
```

## 최초 서버 준비

서버에서 한 번만 준비한다.

```bash
cd ~/projects/discord-bot
npm install --omit=dev --ignore-scripts
pm2 start dist/index.js --name discord-bot --update-env
pm2 save
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

## 로그

PM2 로그 파일은 아래 경로에 쌓인다.

- `logs/discord-bot-out.log`
- `logs/discord-bot-error.log`

`logs/`는 `.gitignore`에 포함되어 커밋하지 않는다.
