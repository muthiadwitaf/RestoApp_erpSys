const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Terlalu banyak request, coba lagi dalam 15 menit' },
    keyGenerator: (req) => req.ip,
});

// Stricter limit for auth endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5, // Dibatasi ke 5 percobaan untuk menghentikan serangan Brute Force
    message: { error: 'Terlalu banyak percobaan login yang gagal. Akses diblokir sementara, coba lagi dalam 15 menit' },
});

module.exports = { apiLimiter, authLimiter };
