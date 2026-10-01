import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      exclude: [
        "node_modules/",
        "dist/",
        "**/*.d.ts",
        "**/*.config.*",
      ],
    },
    benchmark: {
      suppressExportGetterWarnings: true,
    },
  },
  resolve: {
    alias: {
      "@games/ff1-state": fileURLToPath(
        new URL("../../games/ff1/state/src/index.ts", import.meta.url),
      ),
    },
  },
});
