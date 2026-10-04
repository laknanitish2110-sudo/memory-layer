import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    server: {
      deps: {
        inline: [/@memory-layer\/protocol/],
      },
    },
  },
  resolve: {
    alias: [
      {
        find: /^@memory-layer\/protocol\/src\/(.*)\.js$/,
        replacement: path.resolve(__dirname, "../protocol/src/$1.ts"),
      },
      {
        find: /^@memory-layer\/protocol$/,
        replacement: path.resolve(__dirname, "../protocol/src/index.ts"),
      },
    ],
  },
});
