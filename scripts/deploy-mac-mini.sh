#!/usr/bin/env bash
set -euo pipefail

deploy_dir="/Users/smlee/discord-bot/.local/deploy"
service="gui/$(id -u)/com.icecokel.discord-bot"
prepare_only="${1:-}"

if [[ -n "$prepare_only" && "$prepare_only" != "--prepare" ]]; then
  echo "Usage: $0 [--prepare]" >&2
  exit 2
fi

test -f "$deploy_dir/.env" || { echo "Missing production .env: $deploy_dir/.env" >&2; exit 1; }
if [[ "$prepare_only" != "--prepare" ]]; then
  launchctl print "$service" >/dev/null || { echo "launchd service is not loaded: $service" >&2; exit 1; }
fi

mkdir -p "$deploy_dir/dist" "$deploy_dir/logs" "$deploy_dir/.local"
cp package.json package-lock.json "$deploy_dir/"
cp dist/index.js dist/check-x-profile.js "$deploy_dir/dist/"

cd "$deploy_dir"
npm ci --omit=dev --ignore-scripts
PLAYWRIGHT_BROWSERS_PATH="$deploy_dir/.local/ms-playwright" npm exec -- playwright install chromium

if [[ "$prepare_only" == "--prepare" ]]; then
  exit 0
fi

log_file="$deploy_dir/logs/discord-bot-out.log"
log_size=0
if [[ -f "$log_file" ]]; then
  log_size="$(wc -c < "$log_file")"
fi

launchctl kickstart -k "$service"
for _ in {1..30}; do
  if launchctl print "$service" | grep -q 'state = running' &&
    [[ -f "$log_file" ]] &&
    tail -c "+$((log_size + 1))" "$log_file" | grep -q 'Logged in as'; then
    exit 0
  fi
  sleep 1
done

echo "Bot did not log in to Discord within 30 seconds" >&2
exit 1
