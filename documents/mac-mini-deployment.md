# 맥미니 배포 운영 가이드

## 구성

- 대상: `/Users/smlee/discord-bot`를 작업 공간으로 쓰는 Apple Silicon 맥미니
- GitHub Actions runner: `.local/actions-runner`, 레이블 `self-hosted`, `macOS`, `ARM64`, `mac-mini`, `discord-bot`
- 실행 디렉터리: `.local/deploy` (Git에서 제외)
- 봇 서비스: 사용자 launchd 작업 `com.icecokel.discord-bot`
- 실행 파일: `.local/deploy/dist/index.js`; 검사용 스크립트: `.local/deploy/dist/check-x-profile.js`

`main` push 시 [워크플로](../.github/workflows/main.yml)가 Node.js 26에서 설치, 명령어 레지스트리 생성, 테스트, 타입 검사, 빌드를 수행한다. 이후 [배포 스크립트](../scripts/deploy-mac-mini.sh)가 실행 파일과 운영 의존성을 갱신하고 Chromium을 설치한 다음 launchd 서비스를 재시작한다. `.env`, `dist/data/`, `.local/`, `logs/`는 덮어쓰거나 삭제하지 않는다.

## 최초 전환

1. 맥미니에 Node.js, Codex CLI와 로그인 상태를 준비한다. runner는 `.local/actions-runner`에 등록하고 GitHub의 `runsvc.sh`를 사용하는 [runner LaunchAgent 설정](../scripts/github-runner-launch-agent.plist)을 `~/Library/LaunchAgents/actions.runner.icecokel-discord-bot.discord-bot-mac-mini.plist`에 설치한다.
2. icenux의 `~/projects/discord-bot/.env`, `dist/data/*.json`, 필요한 `.local` 인증 상태를 맥미니의 `.local/deploy`에 복사한다. `.env`와 이력 파일은 소유자만 읽도록 `chmod 600`을 적용한다. Linux 전용 `DISPLAY`, `LD_LIBRARY_PATH`, Chromium 바이너리는 복사하지 않는다.
3. `.env`의 `CODEX_BIN`을 `/Users/smlee/.local/bin/codex`, `CODEX_WORKDIR`를 `/Users/smlee/discord-bot/.local/deploy`로 바꾼다. `X_MONITOR_ENABLED`와 비밀 설정 값은 기존 운영 값을 유지한다.
4. `npm run build`와 `bash scripts/deploy-mac-mini.sh --prepare`로 봇 실행 파일과 의존성을 미리 배치한다. [봇 LaunchAgent 설정](../scripts/discord-bot-launch-agent.plist)은 마지막 데이터 동기화 이후 `~/Library/LaunchAgents/com.icecokel.discord-bot.plist`에 설치한다.
5. 중복 로그인과 알림을 막기 위해 icenux의 `discord-bot` PM2 프로세스를 중지하고 저장 목록에서 제거한다. 그 뒤 `dist/data/*.json`을 다시 복사해 최종 시점을 맞춘다.
6. launchd로 맥미니 봇을 시작하고, 준비된 변경을 `main`에 push해 배포한다. launchd 상태, Discord 로그인 로그, 관리자 명령 `/관리자 배포상태`와 `/관리자 프로세스`, X 수집 검사를 확인한다.

## 상태 확인

```bash
launchctl print "gui/$(id -u)/com.icecokel.discord-bot"
tail -n 100 .local/deploy/logs/discord-bot-out.log
tail -n 100 .local/deploy/logs/discord-bot-error.log
```

runner 상태는 `launchctl print "gui/$(id -u)/actions.runner.icecokel-discord-bot.discord-bot-mac-mini"`로 확인한다. macOS 사용자 LaunchAgent는 `smlee`의 GUI 로그인 세션에서 실행되므로, 재부팅 뒤 로그인 상태도 확인한다. X 감시는 기본적으로 창 모드 Chromium을 사용한다.

## 복구

맥미니 배포가 실패하면 맥미니의 `com.icecokel.discord-bot`을 중지한 뒤, icenux의 PM2 프로세스를 다시 시작한다. 맥미니에서 이미 새 알림이나 이력이 생긴 경우에는 두 실행 디렉터리의 `dist/data/`를 비교하고 최신 상태를 한곳에 모은 뒤 하나의 프로세스만 실행한다. 두 호스트의 봇을 동시에 실행하지 않는다.
