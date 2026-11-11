# 운영 서버 가이드 (맥미니)

현재 디스코드 봇의 운영 호스트는 Apple Silicon 맥미니다. 배포와 상태 확인은 이 문서를 기준으로 한다.

## 구성

- 대상: `/Users/smlee/discord-bot`를 작업 공간으로 쓰는 Apple Silicon 맥미니
- GitHub Actions runner: `.local/actions-runner`, 레이블 `self-hosted`, `macOS`, `ARM64`, `mac-mini`, `discord-bot`
- 실행 디렉터리: `/Users/smlee/discord-bot/.local/deploy` (Git에서 제외, 전체 소스 checkout 아님)
- 봇 서비스: 사용자 launchd 작업 `com.icecokel.discord-bot`
- 실행 파일: `.local/deploy/dist/index.js`; 검사용 스크립트: `.local/deploy/dist/check-x-profile.js`

`main` push 시 [워크플로](../.github/workflows/main.yml)가 Node.js 26에서 설치, 명령어 레지스트리 생성, 테스트, 타입 검사, 빌드를 수행한다. 이후 [배포 스크립트](../scripts/deploy-mac-mini.sh)가 실행 파일과 운영 의존성을 갱신하고 Chromium을 설치한 다음 launchd 서비스를 재시작한다. 배포 스크립트는 실행 디렉터리의 `.env`, `dist/data/`, `.local/`, `logs/`를 덮어쓰거나 삭제하지 않는다.

## 운영 설정

운영 `.env`는 `/Users/smlee/discord-bot/.local/deploy/.env`에 둔다. 로컬 개발용 저장소 루트 `.env`와 위치가 다르다. `DISCORD_BOT_TOKEN`과 `ADMIN_ID`는 필수이며, 아래는 Claude 전환에 필요한 비밀 값 이외의 설정 예시다. 운영 반영 시 이 파일에도 `ANTHROPIC_API_KEY`를 안전하게 설정한다. 로컬 `.env` 수정만으로 운영 `.env`가 갱신되지는 않는다.

```dotenv
AI_PROVIDER=claude
CLAUDE_MODEL=claude-sonnet-5-5
CLAUDE_TIMEOUT_MS=45000
X_MONITOR_ENABLED=true
```

Claude는 공식 Messages API로 호출하며 별도 CLI 로그인이나 sandbox 설정이 필요하지 않다. 관리자 대화에도 웹·파일·터미널 도구를 제공하지 않는다. X 감시는 `X_MONITOR_ENABLED=true`일 때만 실행하며, `X_MONITOR_HEADLESS`를 지정하지 않으면 창 모드다.

기능별로 날씨는 `WEATHER_ADMIN_REGION`, `WEATHER_SHORT_END_POINT`, `WEATHER_SHORT_API_KRY`, `WEATHER_MIDDLE_END_POINT`, `WEATHER_MIDDLE_API_KEY`를 사용한다. 뉴스는 `NAVER_APP_CLIENT_ID`, `NAVER_APP_CLIENT_SECRET`을 사용한다. `ADMIN_DISK_PATHS`로 관리자 디스크 조회 경로를 제한할 수 있다. `WEATHER_SHORT_API_KRY`는 코드에서 사용 중인 기존 변수명 그대로다.

`.env`와 인증 파일은 Git에 포함하지 않고 소유자만 읽을 수 있게 관리한다. `ANTHROPIC_API_KEY`는 로그나 Discord 메시지에 출력하지 않는다. `/관리자 서버상태`는 키의 설정 여부만 표시한다.

GitHub Actions runner는 `.local/actions-runner`에서 [runner LaunchAgent 설정](../scripts/github-runner-launch-agent.plist)으로 실행한다. 봇은 [봇 LaunchAgent 설정](../scripts/discord-bot-launch-agent.plist)을 사용한다. 두 사용자 LaunchAgent는 `smlee`의 GUI 로그인 세션에서 실행되므로 재부팅 뒤 로그인 상태를 확인한다.

## 배포

1. 변경 사항을 `main`에 push한다.
2. GitHub Actions의 `Deploy to Mac mini` 작업에서 테스트·타입 검사·빌드·배포 완료를 확인한다.
3. 아래 명령과 Discord 관리자 명령 `/관리자 배포상태`, `/관리자 프로세스`로 실행 상태를 확인한다.

배포 스크립트는 `package.json`, `package-lock.json`, `dist/index.js`, `dist/check-x-profile.js`를 실행 디렉터리에 복사한다. 실행 디렉터리에서 운영 의존성과 Chromium을 설치한 후 launchd 서비스를 재시작하고, 새 로그의 Discord 로그인 메시지를 확인한다.

## 상태 확인

```bash
launchctl print "gui/$(id -u)/com.icecokel.discord-bot"
tail -n 100 .local/deploy/logs/discord-bot-out.log
tail -n 100 .local/deploy/logs/discord-bot-error.log
```

runner 상태는 `launchctl print "gui/$(id -u)/actions.runner.icecokel-discord-bot.discord-bot-mac-mini"`로 확인한다. X 수집과 번역 미리보기는 실행 디렉터리에서 아래처럼 수행한다.

```bash
cd /Users/smlee/discord-bot/.local/deploy
node -r dotenv/config dist/check-x-profile.js --live
node -r dotenv/config dist/check-x-profile.js --translate
```

`--translate`는 앞선 `--live`가 저장한 원문으로 번역 미리보기를 만든다. 두 검사 모두 Discord로 전송하거나 발송 이력을 변경하지 않는다. 관리자 DM에 짧은 일반 메시지를 보내 `[Claude]` 응답을 확인하면 실제 API 호출 경로도 점검할 수 있다.

## 복구

배포가 실패하면 GitHub Actions 실패 단계와 위 launchd 상태·로그를 확인한다. 원인을 수정한 뒤 `main`에 반영해 다시 배포한다. 운영 이력은 실행 디렉터리의 `dist/data/`에 남으므로, 복구 과정에서 이 디렉터리와 `.env`, `.local/`을 삭제하지 않는다.
