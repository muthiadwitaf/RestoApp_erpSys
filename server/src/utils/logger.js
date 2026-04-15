const pino = require('pino');

// Create an async/non-blocking logger
const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV !== 'production' ? {
        target: 'pino-pretty', // You can install pino-pretty for dev mode nicely formatted logs
        options: { colorize: true }
    } : undefined // In production, pino writes JSON asynchronously to stdout
});

module.exports = logger;
