#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
ssh_key="${OCI_SSH_KEY:-/Users/smlee/icecoke-ops/config/oci_migration_key}"
known_hosts="${OCI_KNOWN_HOSTS:-/Users/smlee/discord-bot/.local/oci-known-hosts}"
ssh_target=ubuntu@140.245.73.237
ssh_options=(-F /dev/null -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes
  -o UpdateHostKeys=no -o ConnectTimeout=10 -o "UserKnownHostsFile=$known_hosts" -i "$ssh_key")

test -f "$ssh_key"
test -s "$known_hosts"
cd "$repo_dir"
for file in package.json package-lock.json dist/index.js dist/check-x-profile.js; do
  test -s "$file" || { echo "Missing deployment artifact: $file" >&2; exit 1; }
done

ssh "${ssh_options[@]}" "$ssh_target" 'systemctl is-active --quiet discord-bot.service'
COPYFILE_DISABLE=1 tar --no-xattrs -cf - package.json package-lock.json dist/index.js dist/check-x-profile.js |
  ssh "${ssh_options[@]}" "$ssh_target" 'tar -xf - -C /home/ubuntu/discord-bot'

ssh "${ssh_options[@]}" "$ssh_target" 'bash -s' <<'REMOTE'
set -euo pipefail
app_dir=/home/ubuntu/discord-bot
cd "$app_dir"
export PATH="$app_dir/.local/node/bin:$PATH"
export TMPDIR="$app_dir/.local/tmp"
export npm_config_cache="$app_dir/.local/npm-cache"
export PLAYWRIGHT_BROWSERS_PATH="$app_dir/.local/ms-playwright"
test -f .env
test -d dist/data
test "$(systemctl show discord-bot.service --property=Restart --value)" = always
npm ci --omit=dev --ignore-scripts --no-audit --no-fund
node node_modules/playwright/cli.js install chromium

old_pid="$(systemctl show discord-bot.service --property=MainPID --value)"
[[ "$old_pid" =~ ^[0-9]+$ && "$old_pid" -gt 1 ]]
# The unit always restarts; signaling its ubuntu-owned main process needs no elevated command.
kill -TERM "$old_pid"
for ((attempt=0; attempt<60; attempt++)); do
  new_pid="$(systemctl show discord-bot.service --property=MainPID --value)"
  if [[ "$new_pid" =~ ^[0-9]+$ && "$new_pid" -gt 1 && "$new_pid" != "$old_pid" ]] &&
    systemctl is-active --quiet discord-bot.service &&
    journalctl --unit=discord-bot.service --since="$(systemctl show discord-bot.service --property=ActiveEnterTimestamp --value)" --no-pager --output=cat |
      grep -q 'Logged in as'; then
    echo "OCI bot restarted and logged in."
    exit 0
  fi
  sleep 1
done
echo "OCI bot did not log in within 60 seconds." >&2
exit 1
REMOTE
