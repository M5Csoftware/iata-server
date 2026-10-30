import { buildApp } from './app.js';
import { ENV } from './config/env.js';

async function startServer() {
  try {
    console.log('[Server] Starting IATA AWB Management Server in Mock Data mode (In-Memory)...');

    const app = await buildApp();

    const address = await app.listen({
      port: ENV.PORT,
      host: ENV.HOST,
    });

    console.log(`\n========================================================`);
    console.log(` ✈️  IATA AWB Management Server is running!`);
    console.log(` 🚀 Mode:              In-Memory Mock Data (No MongoDB needed)`);
    console.log(` 🌐 Server URL:        ${address}`);
    console.log(` 📚 API Documentation: ${address}/documentation`);
    console.log(` 🩺 Health Check:      ${address}/api/health`);
    console.log(`========================================================\n`);

    // Graceful shutdown
    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
    for (const signal of signals) {
      process.on(signal, async () => {
        console.log(`\n[Server] Received ${signal}. Gracefully shutting down...`);
        try {
          await app.close();
          console.log('[Server] Server closed cleanly.');
          process.exit(0);
        } catch (err) {
          console.error('[Server] Error during shutdown:', err);
          process.exit(1);
        }
      });
    }
  } catch (err) {
    console.error('[Server] Fatal error during startup:', err);
    process.exit(1);
  }
}

startServer();
