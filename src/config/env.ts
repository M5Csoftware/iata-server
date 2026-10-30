import dotenv from 'dotenv';
dotenv.config();

export const ENV = {
  PORT: parseInt(process.env.PORT || '5000', 10),
  HOST: process.env.HOST || '0.0.0.0',
  NODE_ENV: process.env.NODE_ENV || 'development',
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/iata-db',
  JWT_SECRET: process.env.JWT_SECRET || 'iata-cargo-super-secret-jwt-key-2026',
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
};

