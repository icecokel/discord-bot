const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const dotenv = require("dotenv");
const { render, formatValue, toEnvName } = require("../scripts/render-production-env.cjs");
const { toGitHubName, classify } = require("../scripts/push-env-to-github.cjs");

const script = path.resolve(__dirname, "../scripts/render-production-env.cjs");
let tmp;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bot-env-")); });
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const runRender = (secrets, vars) => {
  const output = path.join(tmp, "production.env");
  const result = spawnSync("node", [script, output], {
    env: { ...process.env, BOT_SECRETS_JSON: JSON.stringify(secrets), BOT_VARS_JSON: JSON.stringify(vars) },
    encoding: "utf8",
  });
  return { ...result, output, exists: fs.existsSync(output) };
};

test("renders secrets and variables into a 600 .env that dotenv reads back exactly", () => {
  const tricky = "p@ss word#1 $HOME \\n";
  const result = runRender(
    { github_token: "ghs_workflow", DISCORD_BOT_TOKEN: "discord", GH_TOKEN: "github_pat_x", GMAIL_APP_PASSWORD: tricky, MULTI: "a\nb", QUOTE: "it's" },
    { ADMIN_ID: "123", GH_ACTIONS_MONITOR_REPO: "icecokel/VSCoke", GITHUB_TRENDING_ENABLED_UNUSED: undefined },
  );
  expect(result.status).toBe(0);
  expect(fs.statSync(result.output).mode & 0o777).toBe(0o600);
  const parsed = dotenv.parse(fs.readFileSync(result.output, "utf8"));
  expect(parsed).toEqual({
    ADMIN_ID: "123",
    DISCORD_BOT_TOKEN: "discord",
    GITHUB_TOKEN: "github_pat_x",
    GITHUB_ACTIONS_MONITOR_REPO: "icecokel/VSCoke",
    GMAIL_APP_PASSWORD: tricky,
    MULTI: "a\nb",
    QUOTE: "it's",
  });
  // Names are logged, values never are; the workflow's own token is not configuration.
  expect(result.stdout).toContain("GITHUB_TOKEN");
  expect(result.stdout).not.toMatch(/discord"|github_pat_x|ghs_workflow|p@ss/);
});

test("keeps the server .env when GitHub has no bot settings yet", () => {
  const result = runRender({ github_token: "ghs_workflow" }, {});
  expect(result.status).toBe(0);
  expect(result.exists).toBe(false);
  expect(result.stdout).toContain("keeps its current .env");
});

test("refuses to render without the settings the bot needs to start", () => {
  const result = runRender({ ANTHROPIC_API_KEY: "k" }, {});
  expect(result.status).toBe(1);
  expect(result.exists).toBe(false);
  expect(result.stderr).toContain("DISCORD_BOT_TOKEN, ADMIN_ID");
});

test("rejects duplicates across secrets/variables and GH_ aliases", () => {
  expect(() => render({ ADMIN_ID: "1" }, { ADMIN_ID: "2" })).toThrow("more than once");
  expect(() => render({ GH_TOKEN: "a", GITHUB_TOKEN: "b" }, {})).not.toThrow(); // GITHUB_TOKEN is GitHub's own
  expect(() => render({ GH_X: "a" }, { GITHUB_X: "b" })).toThrow("more than once");
  expect(() => render({ "bad-name": "a" }, {})).toThrow("Unsupported name");
  expect(() => formatValue("X", "a\"b'c")).toThrow("cannot be written");
  expect(toEnvName("GH_TOKEN")).toBe("GITHUB_TOKEN");
});

test("the migration script maps reserved names and keeps credentials secret", () => {
  expect(toGitHubName("GITHUB_TOKEN")).toBe("GH_TOKEN");
  expect(toGitHubName("GITHUB_ACTIONS_MONITOR_ENABLED")).toBe("GH_ACTIONS_MONITOR_ENABLED");
  expect(toEnvName(toGitHubName("GITHUB_TRENDING_ENABLED"))).toBe("GITHUB_TRENDING_ENABLED");
  for (const name of ["DISCORD_BOT_TOKEN", "ANTHROPIC_API_KEY", "GMAIL_APP_PASSWORD", "GMAIL_ADDRESS", "WEATHER_SHORT_API_KRY", "NAVER_APP_CLIENT_SECRET", "ADMIN_ID", "GITHUB_TOKEN"]) {
    expect([name, classify(name)]).toEqual([name, "secret"]);
  }
  for (const name of ["X_MONITOR_ENABLED", "CLAUDE_MODEL", "WEATHER_ADMIN_REGION", "AI_PROVIDER", "WEATHER_SHORT_END_POINT", "NOTIFICATION_QUIET_HOURS", "GITHUB_ACTIONS_MONITOR_REPO", "TMPDIR"]) {
    expect([name, classify(name)]).toEqual([name, "variable"]);
  }
});
