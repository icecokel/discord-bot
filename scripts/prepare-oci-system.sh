#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" != 0 ]]; then
  echo "Run this script as root on the OCI host." >&2
  exit 1
fi

source /etc/os-release
if [[ "$ID" != ubuntu || "$VERSION_ID" != 24.04 || "$(uname -m)" != aarch64 ]]; then
  echo "Expected Ubuntu 24.04 ARM64." >&2
  exit 1
fi

app_dir=/home/ubuntu/discord-bot
node_bin="$app_dir/.local/node/bin/node"
test -x "$node_bin"
test -f "$app_dir/scripts/discord-bot-oci.service"

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends libatomic1 xauth
echo "Node system dependency ready. Waiting for application dependencies."
for ((attempt=0; attempt<900; attempt++)); do
  [[ -f "$app_dir/node_modules/playwright/cli.js" ]] && break
  sleep 1
done
test -f "$app_dir/node_modules/playwright/cli.js"
"$node_bin" "$app_dir/node_modules/playwright/cli.js" install-deps chromium
install -m 644 "$app_dir/scripts/discord-bot-oci.service" /etc/systemd/system/discord-bot.service
systemd-analyze verify /etc/systemd/system/discord-bot.service
systemctl daemon-reload
systemctl enable discord-bot.service

if systemctl is-active --quiet discord-bot.service; then
  echo "System dependencies and unit are ready; bot is already active."
  exit 0
fi

install -o ubuntu -g ubuntu -m 600 /dev/null "$app_dir/.local/system-prepared"
echo "System ready. Waiting up to 15 minutes for the migration cutover signal."
for ((attempt=0; attempt<900; attempt++)); do
  if [[ -f "$app_dir/.local/activate-oci" ]]; then
    systemctl start discord-bot.service
    systemctl is-active discord-bot.service
    exit 0
  fi
  sleep 1
done

echo "No cutover signal received; bot was not started." >&2
exit 1
