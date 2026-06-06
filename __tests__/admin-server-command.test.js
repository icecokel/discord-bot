jest.mock("../src/core/admin-middleware", () => ({
  registerAdminCommand: jest.fn(),
}));

const { registerAdminCommand } = require("../src/core/admin-middleware");
const {
  formatPm2AppStatus,
  resolveAllowedDiskPaths,
  redactEnvSummary,
} = require("../src/features/admin/commands/admin-server");

describe("admin server command", () => {
  const originalDiskPaths = process.env.ADMIN_DISK_PATHS;
  const originalSecretEnv = {
    ADMIN_ID: process.env.ADMIN_ID,
    DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN,
    HERMES_BIN: process.env.HERMES_BIN,
    AI_PROVIDER: process.env.AI_PROVIDER,
  };

  afterEach(() => {
    process.env.ADMIN_DISK_PATHS = originalDiskPaths;
    process.env.ADMIN_ID = originalSecretEnv.ADMIN_ID;
    process.env.DISCORD_BOT_TOKEN = originalSecretEnv.DISCORD_BOT_TOKEN;
    process.env.HERMES_BIN = originalSecretEnv.HERMES_BIN;
    process.env.AI_PROVIDER = originalSecretEnv.AI_PROVIDER;
  });

  test("registers safe admin server inspection commands", () => {
    const names = registerAdminCommand.mock.calls.map((call) => call[0]);

    expect(names).toEqual(
      expect.arrayContaining(["서버상태", "디스크", "프로세스", "배포상태"]),
    );
  });

  test("uses only configured disk allowlist and ignores user supplied paths", () => {
    process.env.ADMIN_DISK_PATHS = "/tmp,/definitely-not-existing-discord-bot-path";

    const paths = resolveAllowedDiskPaths(["../../etc", "/"]);

    expect(paths).toEqual(["/tmp"]);
  });

  test("redacts secret environment values from status output", () => {
    process.env.ADMIN_ID = "123456789";
    process.env.DISCORD_BOT_TOKEN = "secret-token";
    process.env.HERMES_BIN = "/usr/local/bin/hermes";
    process.env.AI_PROVIDER = "hermes";

    const summary = redactEnvSummary();

    expect(summary).toContain("AI_PROVIDER=hermes");
    expect(summary).toContain("ADMIN_ID_SET=true");
    expect(summary).toContain("DISCORD_TOKEN_SET=true");
    expect(summary).toContain("HERMES_BIN_SET=true");
    expect(summary).not.toContain("123456789");
    expect(summary).not.toContain("secret-token");
    expect(summary).not.toContain("/usr/local/bin/hermes");
  });

  test("formats only the discord-bot PM2 process", () => {
    const result = formatPm2AppStatus([
      { name: "other-app", pm2_env: { status: "online" } },
      {
        name: "discord-bot",
        pid: 1234,
        monit: { memory: 57 * 1024 * 1024, cpu: 1.2 },
        pm2_env: {
          status: "online",
          restart_time: 2,
          pm_uptime: Date.now() - 60_000,
        },
      },
    ]);

    expect(result).toContain("discord-bot");
    expect(result).toContain("online");
    expect(result).toContain("pid=1234");
    expect(result).toContain("restart=2");
    expect(result).not.toContain("other-app");
  });
});
