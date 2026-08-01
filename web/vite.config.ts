import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5273,
    proxy: {
      // 8000 常被别的项目占用，这里用 8077
      "/api": "http://127.0.0.1:8077",
    },
  },
});
