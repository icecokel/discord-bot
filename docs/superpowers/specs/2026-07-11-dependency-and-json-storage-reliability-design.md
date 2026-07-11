# Dependency and JSON Storage Reliability Design

## Goal

Remove the reported production dependency vulnerabilities and prevent a process interruption or malformed JSON file from silently losing persisted bot data.

## Scope

- Update the dependency lockfile using the non-breaking package versions proposed by `npm audit fix`.
- Make JSON writes atomic for the local user-preferences and GeekNews history stores.
- Preserve a malformed JSON file before the reader falls back to its supplied default value.
- Add focused automated tests for the new file-manager behavior.

## Non-goals

- Migrate local JSON storage to a database.
- Change data-file schemas or data-directory layout.
- Retry failed writes or change callers' existing boolean-based write contract.

## Chosen Approach

Three approaches were considered:

1. Keep direct writes and only add a backup copy. This retains a window where a partially written target file can be observed.
2. Write a temporary sibling file and rename it over the target, while renaming malformed input to a timestamped recovery file. This is the selected approach: it is small, keeps the current synchronous API, and prevents a partial target file on supported local filesystems.
3. Replace JSON storage with SQLite. This has stronger concurrency and recovery properties but is disproportionate for the current two local stores.

`writeJson` will serialize data, write it to `<filename>.<pid>.<timestamp>.tmp` in the same data directory, then rename that temporary file to the target. If any stage fails, it returns `false` and attempts to remove only its own temporary file.

`readJson` will retain the current default-value behavior for missing or malformed files. For malformed JSON, it will first rename the file to `<filename>.corrupt-<timestamp>` and log the recovery location. If the backup rename fails, it logs that failure and still returns the default value; it never overwrites the malformed target during the read operation.

## Testing

- Verify a successful write replaces an existing JSON document and leaves no temporary files.
- Verify malformed JSON is preserved under a `.corrupt-` filename and the supplied default is returned.
- Verify a missing file still returns the supplied default without creating a recovery file.
- Run the focused tests, then the complete test suite, type check, build, and production dependency audit.

## Dependency Update

Use `npm audit fix --omit=dev` without `--force`. The current dry run proposes the compatible updates needed for the advisories, including `discord.js` 14.26.5 and its `undici`, `ws`, and `lodash` dependency paths. The updated lockfile is validated with the existing test suite and a fresh `npm audit --omit=dev`.
