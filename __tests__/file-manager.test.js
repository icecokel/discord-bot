require("ts-node/register/transpile-only");

const path = require("path");
const mockFiles = new Map();
const mockDirectories = new Set();
const mockFs = {
  existsSync: jest.fn(
    (filePath) => mockFiles.has(filePath) || mockDirectories.has(filePath),
  ),
  readFileSync: jest.fn((filePath) => {
    if (!mockFiles.has(filePath)) {
      throw new Error(`ENOENT: no such file or directory, open '${filePath}'`);
    }
    return mockFiles.get(filePath);
  }),
  writeFileSync: jest.fn((filePath, contents) => {
    mockFiles.set(filePath, contents);
  }),
  mkdirSync: jest.fn((directoryPath) => {
    mockDirectories.add(directoryPath);
  }),
  renameSync: jest.fn((sourcePath, targetPath) => {
    if (!mockFiles.has(sourcePath)) {
      throw new Error(`ENOENT: no such file or directory, rename '${sourcePath}'`);
    }
    mockFiles.set(targetPath, mockFiles.get(sourcePath));
    mockFiles.delete(sourcePath);
  }),
  unlinkSync: jest.fn((filePath) => {
    mockFiles.delete(filePath);
  }),
};

jest.mock("fs", () => ({
  __esModule: true,
  default: mockFs,
  ...mockFs,
}));

const {
  DATA_DIR,
  readJson,
  writeJson,
} = require("../src/utils/file-manager");

describe("file manager", () => {
  const statePath = path.join(DATA_DIR, "state.json");

  beforeEach(() => {
    mockFiles.clear();
    mockDirectories.clear();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("returns the default and preserves malformed JSON as a corrupt sibling", () => {
    const defaultValue = { enabled: false };
    jest.spyOn(console, "error").mockImplementation(() => {});
    mockFiles.set(statePath, "{ malformed");

    expect(readJson("state.json", defaultValue)).toBe(defaultValue);
    const corruptPaths = Array.from(mockFiles.keys()).filter((filePath) =>
      /^state\.json\.corrupt-/.test(path.basename(filePath)),
    );
    expect(corruptPaths).toHaveLength(1);
    expect(mockFiles.get(corruptPaths[0])).toBe("{ malformed");
    expect(mockFiles.has(statePath)).toBe(false);
  });

  test("writes JSON atomically through a temporary file", () => {
    expect(writeJson("state.json", { enabled: true })).toBe(true);
    expect(mockFs.renameSync).toHaveBeenCalledWith(
      expect.stringMatching(/\.tmp$/),
      statePath,
    );
    expect(JSON.parse(mockFiles.get(statePath))).toEqual({ enabled: true });
    expect(Array.from(mockFiles.keys())).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/\.tmp$/)]),
    );
  });

  test("returns the default for missing JSON without creating a corrupt file", () => {
    const defaultValue = { enabled: false };

    expect(readJson("state.json", defaultValue)).toBe(defaultValue);
    expect(Array.from(mockFiles.keys())).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/^.*state\.json\.corrupt-/)]),
    );
  });
});
