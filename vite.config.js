import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  cacheDir: 'work/vite-cache',
  plugins: [tailwindcss()],
  server: { proxy: { '/api/analysis': 'http://127.0.0.1:8787' } },
});
