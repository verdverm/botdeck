import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Module import aliases only:
//   "@/"            -> src/
//   "@games/ff1-map" -> the extracted overworld map data (games/ff1/maps),
//                      imported as plain JSON, not fetched over /api.
// Runtime repo files (plays/) are still served by the vermbot file API.
const srcDir = fileURLToPath(new URL("./src", import.meta.url));
const mapsDir = fileURLToPath(new URL("../../games/ff1/maps", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\//, replacement: `${srcDir}/` },
      { find: /^@games\/ff1-map\//, replacement: `${mapsDir}/` },
    ],
  },
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    // jsnes ships untranspiled ESM source; let Vite consume it directly.
    // @games/ff1-state is a local TS workspace package; keep it unbundled too.
    exclude: ["jsnes", "@games/ff1-state"],
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
