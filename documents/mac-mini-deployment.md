# Discord 봇 운영과 배포

## 현재 운영 상태

2026-11-11 KST에 Discord 봇과 `main`의 빌드·배포를 춘천 OCI로 이관했다. 앱 경로는 `/srv/discord-bot`(전용 계정 `discord-bot` 소유, 계정 분리 전에는 `/home/ubuntu/discord-bot`)이고, Linux ARM64 러너 이름과 전용 레이블은 `discord-bot-oci`다. 봇과 러너의 systemd 서비스는 모두 활성화돼 있다. Mac의 봇 LaunchAgent `com.icecokel.discord-bot`은 중지하고 자동 시작을 해제했다. 기존 Mac 러너는 등록 상태를 유지한다.

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

### 설정 관리: GitHub Secrets·Variables

운영 설정의 원본은 저장소의 **Settings → Secrets and variables → Actions**다. 배포 워크플로가 [`scripts/render-production-env.cjs`](../scripts/render-production-env.cjs)로 저장소의 모든 Secret과 Variable을 `/srv/discord-bot/.env`(discord-bot 소유, 권한 600)로 만들고, [배포 스크립트](../scripts/deploy-oci.sh)가 빌드와 함께 교체한다. 배포가 실패하면 이전 빌드와 함께 이전 `.env`로 되돌린다.

- **서버의 `.env`를 직접 고치지 않는다.** 다음 배포에서 GitHub 값으로 덮어쓴다. GitHub에 없는 키는 운영 `.env`에서 사라진다.
- 값을 바꾸면 배포를 다시 실행해야 반영된다(`main` push 또는 Actions에서 `Deploy to OCI` 재실행).
- 비밀값(토큰, API 키, 비밀번호, 이메일 주소, ID)은 **Secret**, 켜고 끄는 값·모델·지역·엔드포인트 같은 설정은 **Variable**에 둔다. 같은 이름을 양쪽에 두면 배포가 실패한다.
- **Variable은 전부 자동으로 들어가지만, Secret은 [워크플로](../.github/workflows/main.yml)에 이름을 하나씩 적은 것만 들어간다.** 새 Secret을 추가하면 워크플로의 `BOT_SECRETS_JSON` 목록에 한 줄을 더한다. 모든 Secret을 통째로 넘기는 `toJSON(secrets)`는 self-hosted 러너에서 유출 패턴으로 보여 GitHub이 실행을 승인 대기로 묶는다(웹에서만 승인 가능). 목록에 있지만 설정하지 않은 Secret(`GH_TOKEN`, `GMAIL_*` 등)은 건너뛴다.
- GitHub은 `GITHUB_`로 시작하는 이름을 막으므로 `GH_`로 저장한다. `GH_TOKEN`은 `.env`의 `GITHUB_TOKEN`, `GH_ACTIONS_MONITOR_REPO`는 `GITHUB_ACTIONS_MONITOR_REPO`가 된다.
- `DISCORD_BOT_TOKEN`과 `ADMIN_ID`가 없으면 서버를 건드리지 않고 배포가 실패한다. GitHub에 봇 설정이 하나도 없으면 서버의 기존 `.env`를 그대로 쓴다(전환 전 상태).
- 배포 로그에는 키 이름만 나오고 값은 나오지 않는다.

기존 서버 `.env`를 GitHub으로 옮길 때는 값이 로컬 디스크에 남지 않도록 파이프로 넘긴다. `gh`가 이 저장소에 로그인된 PC에서 실행한다.

```bash
# 0) 실제 OCI 접속 대상으로 바꾼다(예: ubuntu@서버공인IP 또는 ~/.ssh/config의 Host 이름)
OCI_HOST='ubuntu@서버주소'
# 1) 분류 확인(업로드 안 함)
ssh "$OCI_HOST" 'sudo cat /srv/discord-bot/.env' | node scripts/push-env-to-github.cjs --dry-run
# 2) 업로드
ssh "$OCI_HOST" 'sudo cat /srv/discord-bot/.env' | node scripts/push-env-to-github.cjs
# 3) Actions에서 Deploy to OCI 재실행 → 로그의 "Rendered N settings" 확인
```

### 설정 항목

Discord 로그인과 관리자 알림은 `DISCORD_BOT_TOKEN`과 `ADMIN_ID`를 사용한다. Claude는 `ANTHROPIC_API_KEY`를 사용하며 X 감시는 `X_MONITOR_ENABLED=true`일 때 등록된다. OCI에서는 Xvfb의 창 모드를 사용한다. 인증 파일은 `.local/x-auth-state.json`에 둔다.

날씨는 `WEATHER_ADMIN_REGION`, `WEATHER_SHORT_END_POINT`, `WEATHER_SHORT_API_KRY`, `WEATHER_MIDDLE_END_POINT`, `WEATHER_MIDDLE_API_KEY`를, 뉴스는 `NAVER_APP_CLIENT_ID`, `NAVER_APP_CLIENT_SECRET`을 사용한다. 디스크 조회 대상은 `ADMIN_DISK_PATHS`로 지정한다.

VSCoke GitHub Actions 실패 감시는 별도 설정 없이 기본 활성이다. 끄려면 `GITHUB_ACTIONS_MONITOR_ENABLED=false`를 두고, 대상은 `GITHUB_ACTIONS_MONITOR_REPO`·`GITHUB_ACTIONS_MONITOR_WORKFLOWS`로 바꾼다. 공개 저장소라 토큰은 필요 없으며 `GITHUB_TOKEN`은 한도를 높일 때만 선택으로 둔다. 배포 후 `/관리자 스케줄상태`의 `GitHub Actions 감시` 항목이 10분 안에 성공(첫 실행은 `기준선 생성`)으로 바뀌는지 확인하고, VSCoke의 Production Chat Smoke를 `force_failure=true`로 실행해 실패 DM을 확인한다. 자세한 동작은 [README](../README.md#github-actions-실패-감시)에 있다.

모든 알림은 `dist/data/notification-queue.json` 알림 큐에 쌓이고 발송기가 1분마다 DM으로 보낸다. 큐는 23:00~06:00 KST에 홀드됐다가 06:00에 발송되며, 시간대는 `NOTIFICATION_QUIET_HOURS`(기본 `23-6`, `off`로 끔)로 바꾼다. 큐 파일은 배포·재시작 중에도 보존해야 한다. 대기·재시도 상태는 `/관리자 스케줄상태`의 `알림 큐` 항목에서 확인한다.

깃 트렌드는 별도 설정 없이 매일 10:00에 발송되며, 끄려면 `GITHUB_TRENDING_ENABLED=false`를 둔다. 기여 여부 확인이 GitHub API 속도 제한에 걸리면 `GITHUB_TOKEN`을 설정한다.

Gmail 새 메일 알림은 `GMAIL_MONITOR_ENABLED=true`, `GMAIL_ADDRESS`, `GMAIL_APP_PASSWORD`(Google 앱 비밀번호)를 모두 둘 때 등록된다. 알림 대상을 좁히려면 `GMAIL_MONITOR_QUERY`(예: `category:primary`)를 둔다. 배포 후 `/관리자 메일확인`을 실행해 `기준선 생성` 응답을 확인하고, 자신에게 테스트 메일을 보낸 뒤 다시 실행해 DM이 오는지 확인한다. 자세한 동작은 [README](../README.md#gmail-새-메일-알림)에 있다. `GMAIL_ADDRESS`와 `GMAIL_APP_PASSWORD`만 있어도 관리자 DM의 Claude가 메일을 읽기 전용으로 조회하며, 끄려면 `GMAIL_AI_ENABLED=false`를 둔다.

## 운영 전환

- OCI 앱 번들·의존성·ARM64 Chromium을 준비하고 운영 `.env` 권한을 600으로 설정한다. Discord REST 인증, Claude 응답, 단기 날씨, 네이버 API는 준비 단계에서 확인했다.
- 두나무 채용 목록은 같은 요청에서 Mac은 HTTP 200, OCI는 CloudFront의 HTTP 403 `Request blocked`를 반환했다. 차단 규칙은 확인되지 않았다. 중기 날씨 API의 403은 기존 Mac 운영 환경에서도 재현된다.
- 관리자 설치 후 `.local/system-prepared`를 확인한다. 앱 경로에서 다음 명령으로 DOM과 실제 X 수집을 검사한다. 검사 결과에는 건수와 성공 여부만 남기고 미리보기·인증 파일은 배포 대상에서 제외한다.

```bash
cd /srv/discord-bot
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
