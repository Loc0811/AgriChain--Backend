const winston = require('winston');
const env = require('../config/env');

const { combine, timestamp, printf, colorize, errors } = winston.format;

// Format log dễ đọc
const devFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp, stack }) =>
    stack
      ? `${timestamp} [${level}] ${message}\n${stack}`
      : `${timestamp} [${level}] ${message}`
  )
);

const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  winston.format.json()
);

const logger = winston.createLogger({
  level: env.IS_PROD ? 'info' : 'debug',
  format: env.IS_PROD ? prodFormat : devFormat,
  transports: [
    new winston.transports.Console(),
    ...(env.IS_PROD
      ? [
          new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
          new winston.transports.File({ filename: 'logs/combined.log' }),
        ]
      : []),
  ],
});

module.exports = logger;