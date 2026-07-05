# Hermes Codex OAuth Integration Historical Plan

## Status

This plan is historical. It originally described adding Hermes CLI as the AI provider while using Codex OAuth on the icenux server. The current implementation has moved past that design.

Current implementation:

- `discord.js` remains the only Discord gateway.
- `AI_PROVIDER=codex` is the icenux operating default.
- `CodexProvider` starts `codex app-server` as a long-running child process and talks to it over stdio JSON-RPC.
- Admin DM natural-language messages use Codex app-server thread/turn flow.
- `!코덱스` is the primary admin AI control command.
- `!헤르메스` remains only as a Codex control compatibility alias.
- GeekNews AI summary and translation use Codex only and do not fall back to Gemini.
- Gemini remains available as fallback for generic provider calls and as the primary provider after `!코덱스 끄기`.
- Hermes gateway is not used. `HermesProvider` remains only as legacy compatibility code.

## Current Operating Reference

Use these documents for current behavior:

- `README.md`
- `documents/codex-app-server-provider.md`
- `documents/natural-language-ai-concept.md`
- `documents/natural-language-ai-plan.md`
- `documents/ai-guidelines.md`
- `documents/pm2-deployment.md`

## Current Server Defaults

The current icenux `.env` shape is:

```text
AI_PROVIDER=codex
AI_FALLBACK_PROVIDER=gemini
CODEX_BIN=/home/icenux/.local/bin/codex
CODEX_MODEL=
CODEX_WORKDIR=/home/icenux/projects/discord-bot
CODEX_TIMEOUT_MS=1800000
CODEX_SANDBOX=read-only
CODEX_APPROVAL_POLICY=never
CODEX_ADMIN_SEARCH=true
CODEX_ADMIN_SANDBOX=read-only
CODEX_ADMIN_APPROVAL_POLICY=
```

`~/.codex/auth.json` is treated as a secret and must not be printed in logs, commits, issues, PRs, or Discord messages.

## Current Verification

Local verification:

```bash
npm test -- --runInBand
npm run type-check
npm run build
```

Server verification:

```bash
ssh icenux-external 'export PATH="$HOME/.local/npm-global/bin:$HOME/.local/bin:$PATH"; codex --version'
ssh icenux-external 'test -f "${CODEX_HOME:-$HOME/.codex}/auth.json" && echo "codex auth file exists"'
ssh icenux-external 'export PATH="$HOME/.local/npm-global/bin:$HOME/.local/bin:$PATH"; pm2 status discord-bot --no-color'
```

Deployment verification is handled by the `Deploy to icenux` GitHub Actions workflow on pushes to `main`.

## Legacy Notes

The original Hermes work introduced useful boundaries that still apply:

- The bot owns Discord input validation and final response delivery.
- AI providers do not receive Discord write, delete, or channel-management tools.
- Risky operations such as deletion, reset, overwrite, permission changes, mass messaging, and service interruption require explicit user confirmation.
- Sensitive values must be reported only by presence or key name, never by value.

The old Hermes-specific steps, smoke commands, and implementation snippets are superseded by the Codex app-server provider.
