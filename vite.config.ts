import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import path from "node:path";

const dashboardOutput = process.env.ALPHAWAY_DASHBOARD_DIR?.trim()
  ? path.resolve(process.env.ALPHAWAY_DASHBOARD_DIR)
  : path.resolve(import.meta.dirname, "dist");

export default defineConfig({
  plugins: [svelte(), tailwindcss()],
  root: ".",
  publicDir: "public",
  build: {
    outDir: dashboardOutput,
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:20129",
      "/v1": "http://127.0.0.1:20129",
      "/health": "http://127.0.0.1:20129",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
