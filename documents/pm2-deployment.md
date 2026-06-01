# PM2 배포 운영 가이드

## 목적

디스코드 봇은 로컬 Mac 스케줄러가 아니라 배포 서버의 PM2 프로세스로 실행한다. PM2가 프로세스 재시작, 로그 관리, 서버 재부팅 후 복구를 담당한다.

## 최초 배포

배포 서버에서 실행한다.

```bash
npm ci
npm run build
npm run pm2:start
pm2 save
```

서버 재부팅 후 자동 복구가 필요하면 PM2 startup 명령을 한 번 설정한다.

```bash
pm2 startup
```

PM2가 출력하는 명령을 그대로 실행한 뒤 다시 저장한다.

```bash
pm2 save
```

## 재배포

코드 업데이트 후 실행한다.

```bash
git pull
npm ci
npm run pm2:restart
pm2 save
```

## 상태 확인

```bash
pm2 status
pm2 logs discord-bot
```

## 중지

```bash
npm run pm2:stop
pm2 save
```

## 환경변수

봇은 `dotenv/config`를 사용하므로 배포 서버의 프로젝트 루트에 `.env`가 있어야 한다.

필수 값:

- `DISCORD_BOT_TOKEN`
- `ADMIN_ID`

기능별 필요 값:

- `GEMINI_AI_API_KEY`
- `GEMINI_MODEL`
- `NAVER_APP_CLIENT_ID`
- `NAVER_APP_CLIENT_SECRET`
- `WEATHER_*`

## 로그

PM2 로그 파일은 아래 경로에 쌓인다.

- `logs/discord-bot-out.log`
- `logs/discord-bot-error.log`

`logs/`는 `.gitignore`에 포함되어 커밋하지 않는다.
