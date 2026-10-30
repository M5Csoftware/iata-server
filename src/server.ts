import { buildApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { seedDatabase } from './seeds/seeder.js';
import { ENV } from './config/env.js';

async function startServer() {
  try {
    console.log('[Server] Connecting to MongoDB...');
    try {
      await connectDatabase();
      // Auto seed default data if collections are empty
      await seedDatabase(false);
    } catch (dbErr: any) {
      console.warn(`[Server] Warning: MongoDB connection failed (${dbErr.message}).`);
      console.warn(`[Server] Server will continue running for health and docs, but MongoDB operations require an active connection.`);
    }

    const app = await buildApp();

    const address = await app.listen({
      port: ENV.PORT,
      host: ENV.HOST,
    });

    console.log(`\n========================================================`);
    console.log(` ✈️  IATA AWB Management Server is running!`);
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
          await disconnectDatabase();
          console.log('[Server] Server and database connections closed cleanly.');
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

