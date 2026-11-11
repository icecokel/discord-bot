const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

describe("OCI deployment boundaries", () => {
  let directory;
  let environment;

  beforeEach(() => {
    const base = path.resolve(__dirname, "../.local/test-tmp");
    fs.mkdirSync(base, { recursive: true });
    directory = fs.mkdtempSync(path.join(base, "oci-deploy-"));
    for (const folder of ["scripts", "dist/data", "bin"]) {
      fs.mkdirSync(path.join(directory, folder), { recursive: true });
    }
    fs.copyFileSync(path.resolve(__dirname, "../scripts/deploy-oci.sh"), path.join(directory, "scripts/deploy-oci.sh"));
    for (const file of ["package.json", "package-lock.json", "dist/index.js", "dist/check-x-profile.js", ".env", "dist/data/history.json", "ssh-key", "known-hosts"]) {
      fs.writeFileSync(path.join(directory, file), file.endsWith(".json") ? "{}\n" : "fixture\n");
    }
    const stub = `#!${process.execPath}
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify(args) + "\\n");
const input = [];
process.stdin.on("data", chunk => input.push(chunk));
process.stdin.on("end", () => {
  const command = args.at(-1);
  if (command.includes("systemctl is-active")) process.exit(Number(process.env.FAKE_INACTIVE || 0));
  if (command.includes("tar -xf")) fs.writeFileSync(process.env.FAKE_ARCHIVE, Buffer.concat(input));
  if (command === "bash -s") process.exit(Number(process.env.FAKE_INSTALL_FAILURE || 0));
});
`;
    fs.writeFileSync(path.join(directory, "bin/ssh"), stub, { mode: 0o755 });
    environment = {
      ...process.env,
      PATH: `${path.join(directory, "bin")}:${process.env.PATH}`,
      OCI_SSH_KEY: path.join(directory, "ssh-key"),
      OCI_KNOWN_HOSTS: path.join(directory, "known-hosts"),
      FAKE_LOG: path.join(directory, "ssh-calls.jsonl"),
      FAKE_ARCHIVE: path.join(directory, "artifacts.tar"),
    };
  });

  afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

  const run = () => spawnSync("bash", [path.join(directory, "scripts/deploy-oci.sh")], {
    cwd: directory,
    env: environment,
    encoding: "utf8",
  });

  test("uploads only application artifacts and preserves secrets and state", () => {
    const result = run();
    if (result.status !== 0) throw new Error(result.stderr);
    expect(result.status).toBe(0);
    const archive = spawnSync("tar", ["-tf", environment.FAKE_ARCHIVE], { encoding: "utf8" });
    expect(archive.status).toBe(0);
    expect(archive.stdout.trim().split("\n").sort()).toEqual([
      "dist/check-x-profile.js", "dist/index.js", "package-lock.json", "package.json",
    ]);
    expect(fs.readFileSync(path.join(directory, ".env"), "utf8")).toBe("fixture\n");
    expect(fs.readFileSync(path.join(directory, "dist/data/history.json"), "utf8")).toBe("{}\n");
  });

  test("refuses to upload when the OCI service is inactive", () => {
    environment.FAKE_INACTIVE = "3";
    expect(run().status).toBe(3);
    expect(fs.existsSync(environment.FAKE_ARCHIVE)).toBe(false);
    expect(fs.readFileSync(environment.FAKE_LOG, "utf8").trim().split("\n")).toHaveLength(1);
  });

  test("propagates a remote installation failure", () => {
    environment.FAKE_INSTALL_FAILURE = "23";
    expect(run().status).toBe(23);
  });

  test("refuses to connect when a bundle is missing", () => {
    fs.unlinkSync(path.join(directory, "dist/index.js"));
    expect(run().status).not.toBe(0);
    expect(fs.existsSync(environment.FAKE_LOG)).toBe(false);
  });
});
