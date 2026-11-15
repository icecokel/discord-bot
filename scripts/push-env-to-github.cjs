#!/usr/bin/env node
/**
 * Copies a dotenv file into this repository's GitHub Actions secrets and variables, so the
 * deploy workflow can render the production .env (see render-production-env.cjs).
 *
 *   OCI_HOST='ubuntu@server'   # the real SSH target
 *   ssh "$OCI_HOST" 'sudo cat /srv/discord-bot/.env' | node scripts/push-env-to-github.cjs --dry-run
 *   ssh "$OCI_HOST" 'sudo cat /srv/discord-bot/.env' | node scripts/push-env-to-github.cjs
 *
 * Reads stdin so values never touch the local disk; secret values go to `gh` over stdin, never
 * argv. Names starting with GITHUB_ are stored as GH_ (GitHub reserves the prefix).
 * Non-sensitive settings (flags, model, region, endpoints...) become variables; the rest secrets.
 */
const { spawnSync } = require("node:child_process");
const dotenv = require("dotenv");

const VARIABLE_PATTERN = /(_ENABLED|_MODEL|_TIMEOUT_MS|_REGION|_REPO|_WORKFLOWS|_QUERY|_MAILBOX|_QUIET_HOURS|_HEADLESS|_END_POINT|_DISK_PATHS|_TOOLSETS|_SANDBOX|_APPROVAL_POLICY|_SEARCH)$|^(AI_PROVIDER|TMPDIR)$/;

const toGitHubName = (name) => (name.startsWith("GITHUB_") ? `GH_${name.slice(7)}` : name);
const classify = (name) => (VARIABLE_PATTERN.test(name) ? "variable" : "secret");

const readStdin = () => {
  try {
    return require("node:fs").readFileSync(0, "utf8");
  } catch {
    return "";
  }
};

const gh = (args, input) => {
  const result = spawnSync("gh", args, { input, encoding: "utf8", stdio: ["pipe", "ignore", "pipe"] });
  if (result.status !== 0) throw new Error(`gh ${args.slice(0, 3).join(" ")} failed: ${(result.stderr || "").trim()}`);
};

const main = () => {
  const dryRun = process.argv.includes("--dry-run");
  const parsed = dotenv.parse(readStdin());
  const names = Object.keys(parsed);
  if (!names.length) throw new Error("No settings on stdin. Pipe the production .env into this script.");

  for (const name of names.sort()) {
    const target = toGitHubName(name);
    const kind = classify(name);
    const value = parsed[name];
    // GitHub rejects empty secrets/variables; an empty setting is the same as an unset one.
    console.log(`${dryRun ? "[dry-run] " : ""}${(value ? kind : "skip").padEnd(8)} ${target}${target !== name ? `  (from ${name})` : ""}${value ? "" : "  (empty)"}`);
    if (dryRun || !value) continue;
    if (kind === "secret") gh(["secret", "set", target], value);
    else gh(["variable", "set", target, "--body", value]);
  }
  console.log(dryRun
    ? `${names.length} settings would be uploaded. Run again without --dry-run to apply.`
    : `${names.length} settings uploaded. The next deploy renders the production .env from them.`);
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`push-env-to-github: ${error.message}`);
    process.exit(1);
  }
}

module.exports = { toGitHubName, classify };
