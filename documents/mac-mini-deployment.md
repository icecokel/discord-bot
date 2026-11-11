# 운영 서버 가이드 (맥미니)

현재 디스코드 봇의 운영 호스트는 Apple Silicon 맥미니다. 배포와 상태 확인은 이 문서를 기준으로 한다.

## OCI 이관 준비 (2026-11-11)

사용자 승인으로 춘천 `oci-termux-prod-01`(`140.245.73.237`) 이관을 시작했다. 현재 봇은 여전히 맥미니에서 실행 중이며, GitHub Actions의 배포 대상도 맥미니다. OCI 검증과 최종 데이터 동기화 전에는 기존 봇을 종료하지 않는다.

- OCI 앱 경로: `/home/ubuntu/discord-bot`. 번들, 운영 의존성, ARM64 Chromium 설치를 완료했다.
- Node.js `26.7.0`은 `.local/node`에 설치하고 공식 SHA-256과 일치함을 확인했다. 시스템 `libatomic1`이 없어 임시 검사에는 `.local/runtime-libs/usr/lib/aarch64-linux-gnu`를 `LD_LIBRARY_PATH`로 사용했다.
- 운영 `.env`를 권한 `600`으로 전송하고 맥미니 전용 경로와 미사용 legacy CLI 설정을 제거했다. 원본 운영 설정은 맥미니에 보존했다.
- JSON 4개 약 1.6MB를 초기 복사했다. 이 데이터는 최종 전환 사본이 아니며, 최종 기준은 맥미니의 `.local/deploy/dist/data/`다.
- OCI에서 Discord REST 인증, Claude 실제 응답, 단기 예보, 네이버 뉴스 API가 정상이다. 채용 수집은 17곳 중 16곳이 성공했고 두나무는 OCI에서만 HTTP 403이다. 중기 예보 HTTP 403은 맥미니에서도 재현된다.
- 자동 실행 보안 훅이 `sudo`를 차단했다. 관리자 설치는 [준비 스크립트](../scripts/prepare-oci-system.sh)를 OCI에서 root로 직접 실행해야 한다. 이 스크립트는 시스템 의존성 및 [서비스](../scripts/discord-bot-oci.service)를 설치하고 `.local/system-prepared`를 만든 뒤 전환 신호를 최대 15분 기다린다.
- 전환 신호는 `/home/ubuntu/discord-bot/.local/activate-oci`다. Xvfb에서 실제 수집을 검증하고 맥미니 봇 종료 및 최종 JSON 복사·해시 검증을 마친 뒤에만 만든다. 서비스에도 이 파일의 존재 조건을 설정했다.
- [OCI 배포 스크립트](../scripts/deploy-oci.sh)는 실행 중인 OCI 서비스만 갱신하며 `.env`와 `dist/data/`를 전송하지 않는다. systemd의 `Restart=always`와 ubuntu 소유 프로세스에 대한 종료 신호로 재시작한다. 실제 OCI 재배포는 아직 미검증이다.

OCI 준비가 끝나면 워크플로의 마지막 배포 단계를 `bash scripts/deploy-oci.sh`로 바꾼다. 맥미니 runner는 빌드용으로 유지하고 봇의 launchd 작업만 중지·비활성화한다. 이후 OCI의 Discord 로그인, 준비 알림, X 수집, 자동 재시작과 실제 CI 배포를 확인한다.

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
