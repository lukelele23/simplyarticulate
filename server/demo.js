import { createAnalysisServer, readConfig } from './index.js';
const config = readConfig({ ...process.env, NODE_ENV: 'development', AI_DEMO_MODE: 'true', AI_HOST: '127.0.0.1' });
const server = createAnalysisServer(config);
server.listen(config.port, config.host, () => console.log(`SAMPLE DEMO backend: http://${config.host}:${config.port}. No AI providers are contacted.`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
