const mongoose = require('mongoose');
const env      = require('./env');
const logger   = require('../utils/logger');

let connected = false;

async function connectDB() {
  if (connected) return;

  mongoose.connection.on('connected',    () => logger.info('[DB] MongoDB connected'));
  mongoose.connection.on('disconnected', () => logger.warn('[DB] MongoDB disconnected'));
  mongoose.connection.on('error', (err)  => logger.error(`[DB] Error: ${err.message}`));

  await mongoose.connect(env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  });
  connected = true;
}

async function disconnectDB() {
  if (connected) { await mongoose.disconnect(); connected = false; }
}

module.exports = { connectDB, disconnectDB };