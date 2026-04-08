require('dotenv').config();

module.exports = {
    jwtSecret: process.env.JWT_SECRET || 'dev_jwt_secret_fallback',
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'dev_jwt_refresh_secret_fallback',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '2h',
    jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '6h',
    bcryptRounds: 12,
};
