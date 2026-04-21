require('dotenv').config();
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const xssClean = require('xss-clean');
const compression = require('compression');
const { apiLimiter } = require('./src/middleware/rateLimiter');
const { errorHandler } = require('./src/middleware/errorHandler');

const app = express();
const PORT = parseInt(process.env.PORT || '3999');

// ── Security Middleware ──
app.use(helmet({
    contentSecurityPolicy: false,  // disabled for serving SPA
    crossOriginEmbedderPolicy: false,
}));
const corsOptions = {
    origin: function (origin, callback) {
        if (!origin || (process.env.CORS_ORIGIN && process.env.CORS_ORIGIN.split(',').includes(origin))) {
            callback(null, true);
        } else if (!process.env.CORS_ORIGIN) {
            callback(null, origin || '*'); // reflect origin if no strict CORS defined
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    optionsSuccessStatus: 200,
    credentials: true
};
app.use(cors(corsOptions));
app.use(xssClean());
app.use(compression());

// ── Body Parsing ──
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Proxy Trust (required behind Nginx / reverse-proxy / Vite dev-proxy) ──
app.set('trust proxy', 1);

// ── Rate Limiting ──
app.use('/api/', apiLimiter);

// ── Serve uploaded images (auth-protected static files) ──────────────────
const jwt = require('jsonwebtoken');
const pathModule = require('path');
const { jwtSecret } = require('./src/config/auth');

function imageAuthMiddleware(req, res, next) {
    if (process.env.AUTH_DISABLED === 'true') return next();

    // Accept token from Authorization header or ?token= query param
    const authHeader = req.headers['authorization'];
    const token = (authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null)
        || req.query.token;
    if (!token) return res.status(401).json({ error: 'Akses gambar memerlukan autentikasi' });
    try {
        jwt.verify(token, jwtSecret);
        next();
    } catch {
        return res.status(401).json({ error: 'Token tidak valid atau sudah kadaluarsa' });
    }
}

app.use('/uploadedImage', imageAuthMiddleware, express.static(pathModule.join(__dirname, 'uploadedImage')));

// ── API Routes ──
const settingsModule = require('./src/module/settings');
const inventoryModule = require('./src/module/inventory');
const salesModule = require('./src/module/sales');
const purchasingModule = require('./src/module/purchasing');
const accountingModule = require('./src/module/accounting');
const companyModule = require('./src/module/company');
const hrModule = require('./src/module/hr');
const restoModule = require('./src/module/resto');

app.use('/api/settings', settingsModule);
app.use('/api/inventory', inventoryModule);
app.use('/api/sales', salesModule);
app.use('/api/purchasing', purchasingModule);
app.use('/api/accounting', accountingModule);
app.use('/api/company', companyModule);
app.use('/api/hr', hrModule);
app.use('/api/resto', restoModule);

// ── Health check ──
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Serve FE build (SPA) ── kita comment dulu untuk development
// const FE_DIST = path.join(__dirname, '../FE/dist');
// app.use(express.static(FE_DIST));
// app.get('*', (req, res) => {
//     res.sendFile(path.join(FE_DIST, 'index.html'));
// });

// ── Global Error Handler ──
app.use(errorHandler);

// ── Start Server ──
app.listen(PORT, () => {
    console.log(`\n  🚀 ERP running on http://localhost:${PORT}`);
});

module.exports = app;
