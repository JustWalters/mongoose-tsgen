module.exports = {
  testEnvironment: "node",
  testMatch: ["<rootDir>/src/**/*.test.ts"],
  preset: "ts-jest",
  globals: {
    "ts-jest": {
      tsConfig: "tsconfig.test.json"
    }
  },
  watchPathIgnorePatterns: [
    "<rootDir>/src/helpers/tests/artifacts/.*.ts",
    "<rootDir>/src/helpers/tests/artifacts/.*.gen.ts"
  ],
  extraGlobals: ["Math", "JSON"]
};
