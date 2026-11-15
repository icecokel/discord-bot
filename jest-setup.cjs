// Quiet hours depend on the wall clock; keep suites deterministic regardless of when they run.
// Suites that test quiet hours set NOTIFICATION_QUIET_HOURS themselves.
process.env.NOTIFICATION_QUIET_HOURS = "off";
