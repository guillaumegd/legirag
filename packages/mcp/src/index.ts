import { startServer } from './server.js';

startServer().catch((error: unknown) => {
  console.error('Échec du démarrage du serveur MCP :', error);
  process.exitCode = 1;
});

