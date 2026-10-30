import mongoose from 'mongoose';
import { ENV } from './env.js';

export async function connectDatabase(): Promise<typeof mongoose> {
  try {
    mongoose.set('strictQuery', false);
    const conn = await mongoose.connect(ENV.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`[MongoDB] Connected successfully to: ${conn.connection.host}/${conn.connection.name}`);
    return conn;
  } catch (err: any) {
    console.error(`[MongoDB] Connection error (${ENV.MONGODB_URI}): ${err.message}`);
    console.error(`[MongoDB] Please ensure MongoDB is running or configure MONGODB_URI in your .env file.`);
    throw err;
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    console.log('[MongoDB] Disconnected.');
  }
}

