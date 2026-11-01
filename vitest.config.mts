import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Low-memory friendly: run test files one at a time in a single worker.
    pool: "forks",
    fileParallelism: false,
    testTimeout: 60000,
  },
});
