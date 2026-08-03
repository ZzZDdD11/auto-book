import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5273,
    // nginx 转发时 Host 头是域名/裸IP，不是 localhost，vite 默认会拒绝
    // （防DNS rebinding 的机制）。显式列出会用到的host，而不是设 true
    // 整体关掉校验——那样任何伪造 Host 头的请求都能穿透，等于放弃这层防护。
    allowedHosts: ["auto-book.dryz.top", "49.232.95.135"],
    proxy: {
      // 8000 常被别的项目占用，这里用 8077
      "/api": "http://127.0.0.1:8077",
    },
  },
});
