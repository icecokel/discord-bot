# Dependency and JSON Storage Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove production dependency advisories and make persisted JSON writes recoverable after malformed input or interrupted writes.

**Architecture:** Keep the synchronous `readJson` and `writeJson` public API. `writeJson` writes a same-directory temporary file and atomically renames it to the target; `readJson` renames malformed input to a timestamped recovery file before returning the caller's default value. Dependencies are updated only through the compatible releases selected by `npm audit fix --omit=dev`.

**Tech Stack:** Node.js, TypeScript, Jest, npm audit, esbuild.

---

### Task 1: Capture file-manager recovery behavior in tests

**Files:**
- Create: `__tests__/file-manager.test.js`
- Modify: none

- [x] **Step 1: Write the failing recovery test with an in-memory `fs` mock**

```js
const mockFiles = new Map();
const mockFs = {
  existsSync: jest.fn((filePath) => mockFiles.has(filePath)),
  readFileSync: jest.fn((filePath) => mockFiles.get(filePath)),
  writeFileSync: jest.fn((filePath, contents) => mockFiles.set(filePath, contents)),
  mkdirSync: jest.fn(),
  renameSync: jest.fn((source, target) => {
    mockFiles.set(target, mockFiles.get(source));
    mockFiles.delete(source);
  }),
  unlinkSync: jest.fn((filePath) => mockFiles.delete(filePath)),
};
jest.mock("fs", () => ({ __esModule: true, default: mockFs, ...mockFs }));

test("preserves malformed JSON before returning the supplied default", () => {
  const filePath = path.join(DATA_DIR, "state.json");
  mockFiles.set(filePath, "{invalid");

  expect(readJson("state.json", { entries: [] })).toEqual({ entries: [] });
  expect([...mockFiles.keys()]).toContainEqual(
    expect.stringMatching(/state\.json\.corrupt-/),
  );
  expect(mockFiles.has(filePath)).toBe(false);
});
```

Load `file-manager` only after registering the `fs` mock. Keep `path` real and use
the ordinary child filename `state.json`; do not construct a relative filename that
escapes `DATA_DIR`.

- [x] **Step 2: Run the test and verify it fails because no recovery file exists**

Run: `npm test -- __tests__/file-manager.test.js --runInBand`

Expected: FAIL because `file-manager.ts` returns the default value without renaming the malformed file.

- [x] **Step 3: Add the atomic-write test**

```js
test("writes through a temporary file and atomically replaces the target", () => {
  const filePath = path.join(DATA_DIR, "state.json");

  expect(writeJson("state.json", { enabled: true })).toBe(true);
  expect(mockFs.renameSync).toHaveBeenCalledWith(expect.stringMatching(/\.tmp$/), filePath);
  expect(JSON.parse(mockFiles.get(filePath))).toEqual({ enabled: true });
  expect([...mockFiles.keys()]).not.toContainEqual(expect.stringMatching(/\.tmp$/));
});
```

- [x] **Step 4: Run the test and verify it fails because `writeJson` writes directly to the target**

Run: `npm test -- __tests__/file-manager.test.js --runInBand`

Expected: FAIL because `renameSync` is not called by the current implementation.

### Task 2: Implement recovery-safe JSON I/O

**Files:**
- Modify: `src/utils/file-manager.ts:16-48`
- Test: `__tests__/file-manager.test.js`

- [x] **Step 1: Separate read and parse errors, then preserve malformed JSON**

```ts
const backupCorruptFile = (filePath: string): void => {
  const backupPath = `${filePath}.corrupt-${Date.now()}-${process.pid}`;
  fs.renameSync(filePath, backupPath);
  console.error(`[FileManager] Malformed JSON moved to ${backupPath}`);
};

const raw = fs.readFileSync(filePath, "utf8");
try {
  return JSON.parse(raw) as T;
} catch (error) {
  try {
    backupCorruptFile(filePath);
  } catch (backupError) {
    console.error(`[FileManager] Error preserving ${filename}:`, backupError);
  }
  console.error(`[FileManager] Error parsing ${filename}:`, error);
  return defaultValue;
}
```

- [x] **Step 2: Replace direct writes with same-directory temporary-file rename**

```ts
const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
try {
  fs.writeFileSync(temporaryPath, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(temporaryPath, filePath);
  return true;
} catch (error) {
  if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
  console.error(`[FileManager] Error writing ${filename}:`, error);
  return false;
}
```

- [x] **Step 3: Run focused tests and verify they pass**

Run: `npm test -- __tests__/file-manager.test.js --runInBand --silent`

Expected: PASS with malformed input backed up and successful writes observed through `renameSync`.

- [x] **Step 4: Commit the storage behavior change**

```bash
git add src/utils/file-manager.ts __tests__/file-manager.test.js
git commit -m "fix(storage): JSON 저장 안정성 개선"
```

### Task 3: Update audited production dependencies

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [x] **Step 1: Apply compatible audited updates without force**

Run: `npm audit fix --omit=dev --ignore-scripts`

Expected: The lockfile updates `discord.js` and its affected transitive packages without a major-version migration.

- [x] **Step 2: Run the complete validation set**

Run: `npm test -- --runInBand --silent && npm run type-check && npm run build && npm audit --omit=dev`

Result: 117 tests, type checking, and the build pass. The production audit falls from 5 to 4 findings; the remaining `undici@6.24.1` advisories are pinned exactly by `discord.js@14.26.5` and `@discordjs/rest@2.6.1`, and no compatible audit fix is available.

- [x] **Step 3: Commit the dependency update**

```bash
git add package.json package-lock.json
git commit -m "fix(deps): 운영 의존성 보안 업데이트"
```
