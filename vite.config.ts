import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  root: path.resolve("web"),
  build: {
    outDir: path.resolve("dist/web"),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:3847",
    },
  },
});