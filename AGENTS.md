# Repository Rules

## File Naming

- Use `kebab-case` for all file names.
- Do not use `camelCase`, `PascalCase`, or `snake_case` file names.
- Apply the same rule to tests, scripts, and data files.
- When renaming files, update all related import/require paths in the same change.
- Exception: keep tool-reserved file names as-is (for example `AGENTS.md`, `.agent/GEMINI.md`).

Examples:

- `weather-command-utils.ts` (O)
- `weatherCommandUtils.ts` (X)
- `daily_fortunes.json` (X)
