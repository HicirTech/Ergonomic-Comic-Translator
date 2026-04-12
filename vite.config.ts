import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  root: ".",
  build: {
    outDir: "dist/frontend",
    rollupOptions: {
      input: "index.html",
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: false,
      },
      "/health": {
        target: "http://localhost:3000",
        changeOrigin: false,
      },
    },
  },
});
