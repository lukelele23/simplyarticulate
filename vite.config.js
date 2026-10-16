import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import {detectedCountry} from './src/lib/pricingModel.js';
function pricingContext(server){server.middlewares.use((request,response,next)=>{
 if(request.url?.split('?')[0]!=='/api/paddle-context')return next();
 const country=detectedCountry(new Headers(Object.entries(request.headers).filter(([,v])=>typeof v==='string')));
 response.setHeader('Content-Type','application/json');response.setHeader('Cache-Control','private, no-store');
 response.end(JSON.stringify(country?{countryCode:country}:{}));
});}


export default defineConfig({
  cacheDir: 'work/vite-cache',
  plugins: [tailwindcss(), {name:'paddle-country-context',configureServer:pricingContext,configurePreviewServer:pricingContext}, {
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
