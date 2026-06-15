import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.GITHUB_PAGES === "true" ? "/survivor-like/" : "/",
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
});
