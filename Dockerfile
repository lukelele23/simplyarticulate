FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY server ./server
COPY src/lib ./src/lib
RUN mkdir -p /data && chown node:node /data
ENV NODE_ENV=production AI_HOST=0.0.0.0 AI_ENABLED=true AI_DATA_DIR=/data
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD node -e "fetch('http://127.0.0.1:'+(process.env.AI_PORT||process.env.PORT||8787)+'/api/analysis/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
