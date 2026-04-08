const { query } = require('../config/db');

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
        console.error('Failed to log error to DB:', logErr.message);
    }
}

// Global error handler middleware
function errorHandler(err, req, res, next) {
    const status = err.status || 500;
    const isDev = process.env.NODE_ENV !== 'production';

    console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} -> ${status}: ${err.message}`);
    if (status >= 500) console.error(err.stack);

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
