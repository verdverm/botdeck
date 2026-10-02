import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
  resolve: {
    alias: {
      "@games/ff1-state": fileURLToPath(
        new URL("../../games/ff1/state/src/index.ts", import.meta.url),
      ),
    },
  },
});
