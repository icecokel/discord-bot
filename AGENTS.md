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

## Commit Message

- Use `type(scope):요약` or `type:요약`.
- Allowed `type`: `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`, `ci`, `build`, `revert`.
- Optional `scope` pattern: lowercase letters, numbers, `.`, `_`, `/`, `-`.
- Do not add a space after `:`.
- Keep the title within 50 characters.
- Do not end the title with `.`, `!`, `?`, `。`.
- Include Korean text in the summary.
- Preserve Git special messages as-is: `Merge ...`, `Revert ...`, `fixup! ...`, `squash! ...`.

Examples:

- `feat(auth):구글토큰검증추가` (O)
- `fix:랭킹중복노출수정` (O)
- `fix: ranking bug` (X, no Korean)
- `feat: 기능추가` (X, space after `:`)
