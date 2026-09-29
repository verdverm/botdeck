import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Module import alias only: "@/..." -> "src/...". Repo files (games/, plays/)
// are served at runtime by the vermbot file API over /api (DESIGN.md 4, 9) -
// never via a Vite alias, which adds no HTTP route.
const srcDir = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: `${srcDir}/` }],
  },
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    // jsnes ships untranspiled ESM source; let Vite consume it directly.
    exclude: ["jsnes"],
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
});
