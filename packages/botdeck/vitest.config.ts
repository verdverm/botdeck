import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      globals: false,
      setupFiles: ["./src/test/setup.ts"],
      exclude: ["**/node_modules/**", "**/dist/**", "./e2e/**"],
      coverage: {
        provider: "v8",
        reporter: ["text", "html", "lcov"],
        exclude: [
          "node_modules/",
          "dist/",
          "**/*.d.ts",
          "**/*.config.*",
          "src/test/**",
          "src/main.tsx",
        ],
      },
      benchmark: {
        suppressExportGetterWarnings: true,
      },
    },
  }),
);
