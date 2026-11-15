module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/__tests__"],
  setupFiles: ["<rootDir>/jest-setup.cjs"],
  setupFilesAfterEnv: ["<rootDir>/jest-setup-after-env.cjs"],
  transform: {
    "^.+\\.tsx?$": "ts-jest",
  },
};
