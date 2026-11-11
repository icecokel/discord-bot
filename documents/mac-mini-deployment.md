# Discord 봇 운영과 배포

## 현재 운영 상태

2026-11-11 KST에 Discord 봇과 `main`의 빌드·배포를 춘천 OCI로 이관했다. 앱 경로는 `/home/ubuntu/discord-bot`이고, Linux ARM64 러너 이름과 전용 레이블은 `discord-bot-oci`다. 봇과 러너의 systemd 서비스는 모두 활성화돼 있다. Mac의 봇 LaunchAgent `com.icecokel.discord-bot`은 중지하고 자동 시작을 해제했다. 기존 Mac 러너는 등록 상태를 유지한다.

- 23:40 KST Mac에서 X 스케줄이 끝난 뒤 실행 중인 작업이 0개인 것을 확인했다. Mac 봇을 종료한 후 `dist/data/` 전체를 OCI에 복사하고 JSON 4개의 파일 목록·SHA-256·JSON 파싱 결과를 확인한 뒤 OCI 봇을 시작했다.
- [첫 운영 배포](https://github.com/icecokel/discord-bot/actions/runs/43041159820)는 OCI 러너에서 테스트 39개 묶음·342개, 타입 검사, 빌드, 로컬 배포를 통과했다. 운영 번들 두 개와 패키지 파일 두 개가 러너의 빌드 결과와 일치했다.
- 23:43 KST 배포 재시작 후 새 프로세스에서 Discord 로그인, 준비 알림 전송, 스케줄 5개 등록을 확인했다. Xvfb DOM 검사가 통과했고 배포 후 실수집에서 게시물 5건의 본문 5건을 읽었다. 자동 재시작은 실행 중인 서비스의 프로세스 교체로 검증했다.

## OCI 배포 경로

1. GitHub의 `main` push를 춘천 OCI의 러너가 수신한다. 러너는 봇과 별도 systemd 서비스로 실행한다.
2. [워크플로](../.github/workflows/main.yml)는 러너 checkout에서 운영 Node.js 26.7.0으로 의존성 설치, 명령 레지스트리 생성, 테스트, 타입 검사, 빌드를 수행한다.
3. [배포 스크립트](../scripts/deploy-oci.sh)는 OCI 로컬에서 운영 의존성을 준비하고 번들 두 개와 패키지 명세를 교체한다. 운영 설정은 앱 경로의 `.env`, 운영 이력은 `dist/data`, Chromium과 X 인증 상태는 `.local`에 보존한다.
4. systemd가 봇을 재시작하면 **새 실행의 journal**에서 Discord 로그인을 확인한다. 게시 도중 실패하면 이전 번들과 의존성으로 복구한다. 복구 후 헬스 확인까지 실패하면 CI 오류 출력에 백업 경로가 표시된다.

서비스 이름은 `discord-bot.service`와 `actions.runner.icecokel-discord-bot.discord-bot-oci.service`다. 러너는 GitHub에 아웃바운드로 연결하며, 작업 시작 훅은 `icecokel/discord-bot`의 `main` push와 해당 배포 워크플로를 확인한다. 서비스 설치는 [OCI 준비 스크립트](../scripts/prepare-oci-system.sh)의 `--with-oci-runner` 옵션을 사용한다.

## 운영 설정

OCI의 `/home/ubuntu/discord-bot/.env`는 ubuntu 소유·권한 600으로 관리한다. Discord 로그인과 관리자 알림은 `DISCORD_BOT_TOKEN`과 `ADMIN_ID`를 사용한다. Claude는 `ANTHROPIC_API_KEY`를 사용하며 X 감시는 `X_MONITOR_ENABLED=true`일 때 등록된다. OCI에서는 Xvfb의 창 모드를 사용한다. 인증 파일은 `.local/x-auth-state.json`에 둔다.

날씨는 `WEATHER_ADMIN_REGION`, `WEATHER_SHORT_END_POINT`, `WEATHER_SHORT_API_KRY`, `WEATHER_MIDDLE_END_POINT`, `WEATHER_MIDDLE_API_KEY`를, 뉴스는 `NAVER_APP_CLIENT_ID`, `NAVER_APP_CLIENT_SECRET`을 사용한다. 디스크 조회 대상은 `ADMIN_DISK_PATHS`로 지정한다.

## 운영 전환

- OCI 앱 번들·의존성·ARM64 Chromium을 준비하고 운영 `.env` 권한을 600으로 설정한다. Discord REST 인증, Claude 응답, 단기 날씨, 네이버 API는 준비 단계에서 확인했다.
- 두나무 채용 목록은 같은 요청에서 Mac은 HTTP 200, OCI는 CloudFront의 HTTP 403 `Request blocked`를 반환했다. 차단 규칙은 확인되지 않았다. 중기 날씨 API의 403은 기존 Mac 운영 환경에서도 재현된다.
- 관리자 설치 후 `.local/system-prepared`를 확인한다. 앱 경로에서 다음 명령으로 DOM과 실제 X 수집을 검사한다. 검사 결과에는 건수와 성공 여부만 남기고 미리보기·인증 파일은 배포 대상에서 제외한다.

```bash
cd /home/ubuntu/discord-bot
export PATH="$PWD/.local/node/bin:$PATH"
export PLAYWRIGHT_BROWSERS_PATH="$PWD/.local/ms-playwright"
xvfb-run -a node -r dotenv/config dist/check-x-profile.js
xvfb-run -a node -r dotenv/config dist/check-x-profile.js --live
```

- Mac의 실행 원장에서 진행 중인 작업이 끝났는지 확인한 뒤 봇 LaunchAgent만 비활성화하고 종료한다. Mac 운영 경로는 `/Users/smlee/discord-bot/.local/deploy`다.
- 중지한 Mac의 `dist/data/` 전체를 OCI 앱 경로에 복사하고 파일 목록·파일별 SHA-256·JSON 유효성을 대조한다. 이후 `.local/activate-oci`를 생성한다. 관리자 준비 스크립트는 준비 신호를 만든 뒤 최대 15분 동안 전환 신호를 기다린다.
- OCI의 Discord 로그인, 스케줄 등록, 준비 알림 전송을 확인한 후 워크플로 변경을 `main`에 반영한다. 실제 Actions 실행의 러너 이름, 배포 결과, 봇의 새 PID·로그인, X 수집을 확인한다.

## 상태 확인과 복귀

```bash
systemctl is-active discord-bot.service actions.runner.icecokel-discord-bot.discord-bot-oci.service
systemctl is-enabled discord-bot.service actions.runner.icecokel-discord-bot.discord-bot-oci.service
systemctl show discord-bot.service -p MainPID -p Restart -p InvocationID
```

운영 복귀가 필요하면 OCI 봇을 먼저 중지하고 활성화 신호를 해제한다. OCI에서 마지막으로 갱신된 `dist/data/`를 Mac으로 회수해 해시와 JSON을 검증한 뒤 Mac 봇을 시작한다. 배포 경로도 해당 운영 호스트와 일치하도록 되돌린다.
