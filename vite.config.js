import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  cacheDir: 'work/vite-cache',
  plugins: [tailwindcss(), {
    name: 'public-information-pages',
    configureServer(server) {
      server.middlewares.use((request, _response, next) => {
        const match = /^\/(about|guides|privacy|terms|support)\/?(?:\?.*)?$/.exec(request.url || '');
        if (match) request.url = `/${match[1]}/index.html`;
        next();
      });
    },
  }],
  server: { proxy: { '/api/analysis': 'http://127.0.0.1:8787' } },
});
