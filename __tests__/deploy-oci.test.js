const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

describe("OCI local deployment", () => {
  let tmp, app, checkout, bin, processToRestart, env;
  const artifacts = ["package.json", "package-lock.json", "dist/index.js", "dist/check-x-profile.js"];
  const write = (root, name, value, mode) => {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, value, { mode });
  };
  const stub = (name, body) => write(bin, name, "#!/bin/sh\nset -eu\n" + body + "\n", 0o755);
  const run = () => spawnSync("bash", [path.join(checkout, "scripts/deploy-oci.sh")], { env, encoding: "utf8" });
  const value = file => fs.readFileSync(path.join(app, file), "utf8");

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bot-oci-deploy-"));
    app = path.join(tmp, "app");
    checkout = path.join(tmp, "checkout");
    bin = path.join(tmp, "test-bin");
    for (const file of artifacts) {
      write(app, file, "old");
      write(checkout, file, "new");
    }
    write(app, "dist/data/history.json", "original history");
    write(app, ".env", "original configuration");
    write(app, ".local/activate-oci", "");
    write(app, "node_modules/version", "old dependencies");
    write(checkout, "scripts/deploy-oci.sh", fs.readFileSync(path.resolve(__dirname, "../scripts/deploy-oci.sh")));
    processToRestart = spawn("sleep", ["60"], { stdio: "ignore" });
    env = { ...process.env, OCI_APP_DIR: app, PATH: bin + ":" + process.env.PATH, TEST_PID: String(processToRestart.pid), TEST_DIR: tmp };
    stub("npm", 'test "${FAIL_NPM:-0}" = 0 || exit 23\nmkdir -p node_modules\necho new > node_modules/version');
    stub("node", 'test "$1" = node_modules/playwright/cli.js');
    stub("systemctl", [
      'case "$*" in',
      '  *is-active*) exit "${INACTIVE:-0}";;',
      '  *Restart*) echo always;;',
      '  *MainPID*) echo "$TEST_PID";;',
      '  *InvocationID*) if test -e "$TEST_DIR/restart-check"; then echo after; else touch "$TEST_DIR/restart-check"; echo before; fi;;',
      '  *) exit 98;;',
      'esac',
    ].join("\n"));
    stub("journalctl", 'test "$1" = _SYSTEMD_INVOCATION_ID=after && echo "Logged in as test bot"');
  });

  afterEach(() => {
    processToRestart.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test("delivers the build on the runner host and preserves configuration and history", () => {
    const result = run();
    if (result.status !== 0) throw new Error(result.stderr);
    for (const file of artifacts) expect(value(file)).toBe("new");
    expect(value("node_modules/version").trim()).toBe("new");
    expect(value(".env")).toBe("original configuration");
    expect(value("dist/data/history.json")).toBe("original history");
  });
  test("preserves the running release when dependency preparation fails", () => {
    env.FAIL_NPM = "1";
    expect(run().status).toBe(23);
    expect(value("node_modules/version")).toBe("old dependencies");
    expect(value("dist/index.js")).toBe("old");
  });
  test("requires an active service", () => {
    env.INACTIVE = "3";
    expect(run().status).toBe(3);
    expect(value("dist/index.js")).toBe("old");
  });
  test("requires the cutover marker", () => {
    fs.unlinkSync(path.join(app, ".local/activate-oci"));
    expect(run().status).not.toBe(0);
    expect(value("dist/index.js")).toBe("old");
  });
  test("restores the previous build and dependencies if publication fails", () => {
    stub("install", 'case "$3" in */dist/index.js) exit 27;; esac\ncp "$3" "$4"');
    expect(run().status).toBe(27);
    for (const file of artifacts) expect(value(file)).toBe("old");
    expect(value("node_modules/version")).toBe("old dependencies");
    expect(value("dist/data/history.json")).toBe("original history");
  });
});
