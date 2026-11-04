import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // DB integration tests are skipped automatically when DATABASE_URL is unset.
    testTimeout: 30000,
  },
});
