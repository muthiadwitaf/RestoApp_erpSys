const { query } = require('../config/db');
const logger = require('../utils/logger');

// Log error to database
async function logErrorToDb(err, req) {
    try {
        await query(
            `INSERT INTO error_logs (level, message, stack, endpoint, method, user_id, ip, request_body)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
                (err.status || 500) >= 500 ? 'error' : 'warn',
                err.message || 'Unknown error',
                err.stack || '',
                req.originalUrl || '',
                req.method || '',
                req.user?.id || null,
                req.ip || '',
                JSON.stringify(req.body || {}).substring(0, 2000),
            ]
        );
    } catch (logErr) {
        logger.error(`Failed to log error to DB: ${logErr.message}`);
    }
}

// Global error handler middleware
function errorHandler(err, req, res, next) {
    const status = err.status || 500;
    const isDev = process.env.NODE_ENV !== 'production';

    logger.error({ status, method: req.method, url: req.originalUrl, err: err.message }, err.message);
    if (status >= 500 && isDev) logger.error(err.stack);

    // Log to database (async, don't wait)
    logErrorToDb({ ...err, status }, req);

    // Dev: kirim stack trace ke client untuk kemudahan debug
    // Production: hanya pesan generik yang aman (tidak ada path, SQL, dll)
    const message = isDev
        ? err.message
        : (status >= 500 ? 'Terjadi kesalahan pada server. Silakan hubungi administrator.' : err.message);

    res.status(status).json({
        error: message,
        ...(isDev && err.stack ? { stack: err.stack } : {})
    });
}

module.exports = { errorHandler, logErrorToDb };
