import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ["@metamask/connect-evm", "@metamask/connect-multichain"],
  },
  build: {
    commonjsOptions: {
      include: [/node_modules/],
    },
  },
});
