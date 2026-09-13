module.exports = {
  apps: [
    {
      name: "discord-bot",
      script: "dist/index.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "production",
        PLAYWRIGHT_BROWSERS_PATH: require("node:path").join(__dirname, ".local/ms-playwright"),
      },
      time: true,
      out_file: "logs/discord-bot-out.log",
      error_file: "logs/discord-bot-error.log",
      merge_logs: true,
    },
  ],
};
