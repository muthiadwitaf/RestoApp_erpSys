require('dotenv').config();

// SECURITY: JWT secrets MUST be set via environment variables.
// Server will crash on startup if they are missing to prevent insecure operation.
if (!process.env.JWT_SECRET) {
    console.error('FATAL: JWT_SECRET environment variable is not set! Aborting.');
    process.exit(1);
}
if (!process.env.JWT_REFRESH_SECRET) {
    console.error('FATAL: JWT_REFRESH_SECRET environment variable is not set! Aborting.');
    process.exit(1);
}

module.exports = {
    jwtSecret: process.env.JWT_SECRET,
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
    jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '6h',
    bcryptRounds: 12,
};
