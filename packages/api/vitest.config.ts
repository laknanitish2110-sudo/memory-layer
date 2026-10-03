import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@memory-layer/protocol": path.resolve(__dirname, "../protocol"),
    },
  },
});
