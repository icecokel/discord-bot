#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
app_dir="${OCI_APP_DIR:-/home/ubuntu/discord-bot}"
service=discord-bot.service
artifacts=(package.json package-lock.json dist/index.js dist/check-x-profile.js)
for file in "${artifacts[@]}"; do test -s "$repo_dir/$file"; done
cd "$app_dir"
test -f .local/activate-oci
test -f .env
test -d dist/data
test -d node_modules
systemctl is-active --quiet "$service"
test "$(systemctl show "$service" -p Restart --value)" = always

export PATH="$app_dir/.local/node/bin:$PATH"
export TMPDIR="$app_dir/.local/tmp"
export npm_config_cache="$app_dir/.local/npm-cache"
export PLAYWRIGHT_BROWSERS_PATH="$app_dir/.local/ms-playwright"
stage="$(mktemp -d "$app_dir/.local/deploy.XXXXXXXX")"
trap 'rm -rf "$stage"' EXIT
mkdir -p "$stage/previous/dist"
for file in "${artifacts[@]}"; do cp -p "$file" "$stage/previous/$file"; done
(
  cd "$stage"
  cp "$repo_dir/package.json" "$repo_dir/package-lock.json" .
  npm ci --omit=dev --ignore-scripts --no-audit --no-fund
  node node_modules/playwright/cli.js install chromium
)

restart_bot() {
  local pid invocation
  pid="$(systemctl show "$service" -p MainPID --value)"
  [[ "$pid" =~ ^[0-9]+$ && "$pid" -gt 1 ]] || return 1
  invocation="$(systemctl show "$service" -p InvocationID --value)"
  kill -TERM "$pid" || return 1
  for ((attempt=0; attempt<90; attempt++)); do
    local current
    current="$(systemctl show "$service" -p InvocationID --value)"
    if [[ -n "$current" && "$current" != "$invocation" ]] &&
      systemctl is-active --quiet "$service" &&
      journalctl "_SYSTEMD_INVOCATION_ID=$current" --no-pager -o cat | grep -F 'Logged in as' >/dev/null; then
      return 0
    fi
    sleep 1
  done
  return 1
}

# Keep live data and environment in place while replacing the four build files and dependencies.
restore_on_error() {
  local rc=$?
  trap - EXIT
  if ((rc != 0)) && [[ -d "$stage/previous/node_modules" ]]; then
    mv node_modules "$stage/failed-node_modules" 2>/dev/null || true
    mv "$stage/previous/node_modules" node_modules
    for file in "${artifacts[@]}"; do cp -p "$stage/previous/$file" "$file"; done
    if ! restart_bot; then
      echo "Previous release restored; verify the service before retrying. Backup: $stage" >&2
      exit "$rc"
    fi
  fi
  rm -rf "$stage"
  exit "$rc"
}
trap restore_on_error EXIT
mv node_modules "$stage/previous/node_modules"
mv "$stage/node_modules" node_modules
for file in "${artifacts[@]}"; do
  install -m 644 "$repo_dir/$file" "$stage/installing"
  mv -f "$stage/installing" "$file"
done
restart_bot
echo "OCI bot restarted and logged in."
