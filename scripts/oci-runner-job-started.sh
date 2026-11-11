#!/usr/bin/env bash
set -eu
# This production runner handles only the repository's main-branch deployment workflow.
test "${GITHUB_REPOSITORY:-}" = icecokel/discord-bot
test "${GITHUB_EVENT_NAME:-}" = push
test "${GITHUB_REF:-}" = refs/heads/main
test "${GITHUB_WORKFLOW_REF:-}" = icecokel/discord-bot/.github/workflows/main.yml@refs/heads/main
