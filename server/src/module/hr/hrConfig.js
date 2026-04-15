/**
 * BE/src/module/hr/hrConfig.js
 *
 * Konfigurasi HR per perusahaan:
 *   GET  /api/hr/config                          - Ambil config (country_code)
 *   PUT  /api/hr/config                          - Simpan config (HR Manager)
 *
 * Hari Libur Nasional (dengan DB cache):
 *   GET    /api/hr/config/public-holidays?year=  - Calendarific (cached) + custom merged
 *   DELETE /api/hr/config/public-holidays/cache  - Force refresh cache (HR Manager)
 *
 * Hari Libur Tambahan (custom):
 *   GET    /api/hr/config/custom-holidays?year=  - List custom holidays
 *   POST   /api/hr/config/custom-holidays        - Tambah (HR Manager)
 *   PUT    /api/hr/config/custom-holidays/:id    - Edit  (HR Manager)
 *   DELETE /api/hr/config/custom-holidays/:id    - Hapus (HR Manager)
 *
 * === Cache Strategy ===
 * 1. Cek tabel hr_holiday_cache (company_id + country_code + year)
 * 2. Jika ada → return from DB (tidak panggil API)
 * 3. Jika tidak ada → panggil Calendarific → simpan ke DB → return
 * 4. HR Manager bisa DELETE cache untuk force refresh (misal: ada perubahan libur)
 */
const express  = require('express');
const https    = require('https');
const { URLSearchParams } = require('url');
const { query } = require('../../config/db');
const { authenticateToken } = require('../../middleware/auth');
const { asyncHandler } = require('../../utils/helpers');

const router = express.Router();
router.use(authenticateToken);

// ── Middleware: HR Manager only ────────────────────────────────────────────────
function requireHrManager(req, res, next) {
    const perms = req.user?.permissions || [];
    if (req.user?.is_super_admin || perms.includes('hr:delete')) return next();
    return res.status(403).json({ error: 'Hanya HR Manager yang dapat mengubah konfigurasi HR' });
}

// ── Helper: upsert hr_config ──────────────────────────────────────────────────
async function getOrCreateConfig(companyUuid) {
    await query(
        `INSERT INTO hr_config (company_id, company_uuid)
         VALUES ((SELECT id FROM companies WHERE uuid = $1), $1)
         ON CONFLICT DO NOTHING`,
        [companyUuid]
    );
    const res = await query(
        `SELECT country_code, timezone FROM hr_config WHERE company_uuid = $1`,
        [companyUuid]
    );
    return res.rows[0] || { country_code: 'ID', timezone: 'Asia/Jakarta' };
}

// ── Helper: fetch from Calendarific ───────────────────────────────────────────
function fetchCalendarific(year, countryCode, apiKey) {
    return new Promise((resolve, reject) => {
        const params = new URLSearchParams({
            api_key: apiKey,
            country:  countryCode,
            year:     year,
            type:     'national,local,religious,observance',
        });
        const url = `https://calendarific.com/api/v2/holidays?${params}`;
        https.get(url, { headers: { 'Accept': 'application/json' } }, (resp) => {
            let raw = '';
            resp.on('data', d => raw += d);
            resp.on('end', () => {
                try {
                    const body = JSON.parse(raw);
                    if (body.meta?.code !== 200) {
                        return reject(new Error(body.meta?.error_detail || `Calendarific error ${body.meta?.code}`));
                    }
                    // Normalise → { date, localName, name, type }
                    const holidays = (body.response?.holidays || []).map(h => ({
                        date:      h.date?.iso?.substring(0, 10) || '',  // YYYY-MM-DD
                        localName: h.name,
                        name:      h.name,
                        type:      (h.type || []).join(', '),
                        source:    'calendarific',
                    })).filter(h => h.date);
                    resolve(holidays);
                } catch (e) {
                    reject(new Error('Invalid response from Calendarific'));
                }
            });
        }).on('error', reject);
    });
}

// ── Helper: check DB cache then fetch ─────────────────────────────────────────
async function getHolidaysFromCacheOrApi(companyUuid, countryCode, year) {
    // 1. Check DB cache
    const cached = await query(
        `SELECT holidays, fetched_at, source FROM hr_holiday_cache
         WHERE company_uuid = $1 AND country_code = $2 AND year = $3`,
        [companyUuid, countryCode, year]
    );
    if (cached.rows.length) {
        const row = cached.rows[0];
        console.log(`[holidays] Cache HIT: company=${companyUuid} country=${countryCode} year=${year} source=${row.source}`);
        return { holidays: row.holidays, fromCache: true, cachedAt: row.fetched_at, source: row.source };
    }

    // 2. Cache miss → fetch from Calendarific
    const apiKey = process.env.CALENDARIFIC_API_KEY;
    if (!apiKey) {
        console.warn('[holidays] CALENDARIFIC_API_KEY not set, returning empty');
        return { holidays: [], fromCache: false, source: 'none' };
    }

    console.log(`[holidays] Cache MISS → fetching Calendarific: country=${countryCode} year=${year}`);
    const holidays = await fetchCalendarific(year, countryCode, apiKey);

    // 3. Save to DB cache
    await query(
        `INSERT INTO hr_holiday_cache (company_id, company_uuid, country_code, year, holidays, source, fetched_at)
         VALUES ((SELECT id FROM companies WHERE uuid = $1), $1, $2, $3, $4::jsonb, 'calendarific', NOW())
         ON CONFLICT (company_uuid, country_code, year)
         DO UPDATE SET holidays = EXCLUDED.holidays, fetched_at = NOW(), source = 'calendarific'`,
        [companyUuid, countryCode, year, JSON.stringify(holidays)]
    );
    console.log(`[holidays] Saved ${holidays.length} holidays to cache for company=${companyUuid} ${countryCode}/${year}`);

    return { holidays, fromCache: false, source: 'calendarific' };
}

// =============================================================================
// GET /hr/config
// =============================================================================
router.get('/', asyncHandler(async (req, res) => {
    const cfg = await getOrCreateConfig(req.user.company_uuid);
    res.json(cfg);
}));

// =============================================================================
// PUT /hr/config
// =============================================================================
router.put('/', requireHrManager, asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const { country_code, timezone } = req.body;
    if (!country_code?.trim()) return res.status(400).json({ error: 'country_code wajib diisi' });

    await query(
        `INSERT INTO hr_config (company_id, company_uuid, country_code, timezone, updated_at)
         VALUES ((SELECT id FROM companies WHERE uuid = $1), $1, $2, $3, NOW())
         ON CONFLICT (company_uuid) DO UPDATE
           SET country_code = EXCLUDED.country_code,
               timezone     = EXCLUDED.timezone,
               updated_at   = NOW()`,
        [companyUuid, country_code.trim().toUpperCase(), timezone?.trim() || 'Asia/Jakarta']
    );
    res.json({ message: 'Konfigurasi HR disimpan', country_code: country_code.trim().toUpperCase() });
}));

// =============================================================================
// GET /hr/config/public-holidays?year=2026
// Returns: Calendarific (DB-cached) + custom holidays, merged & sorted
// =============================================================================
router.get('/public-holidays', asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const cfg     = await getOrCreateConfig(companyUuid);
    const year    = parseInt(req.query.year) || new Date().getFullYear();
    const country = (req.query.country || cfg.country_code || 'ID').toUpperCase();

    let nationalHolidays = [];
    let fromCache = false;
    let cachedAt  = null;
    let warning   = null;
    let source    = 'none';

    try {
        const result = await getHolidaysFromCacheOrApi(companyUuid, country, year);
        nationalHolidays = result.holidays;
        fromCache = result.fromCache;
        cachedAt  = result.cachedAt;
        source    = result.source;
    } catch (e) {
        console.error('[holidays] API error:', e.message);
        warning = `Gagal fetch hari libur nasional: ${e.message}`;
    }

    const customRes = await query(
        `SELECT id, date::text AS date, name, description, type
         FROM hr_custom_holidays
         WHERE company_uuid = $1 AND EXTRACT(YEAR FROM date) = $2
         ORDER BY date ASC`,
        [companyUuid, year]
    );
    const customHolidays = customRes.rows.map(h => ({
        date:      h.date,
        localName: h.name,
        name:      h.name,
        description: h.description,
        source:    'custom',
        type:      h.type,
        id:        h.id,
    }));

    // 3. Merge & sort
    const all = [...nationalHolidays, ...customHolidays]
        .sort((a, b) => a.date.localeCompare(b.date));

    res.json({
        country,
        year,
        holidays: all,
        meta: {
            fromCache,
            cachedAt,
            source,
            nationalCount: nationalHolidays.length,
            customCount:   customHolidays.length,
            ...(warning ? { warning } : {}),
        },
    });
}));

// =============================================================================
// DELETE /hr/config/public-holidays/cache?year=2026  — Force refresh (HR Manager)
// =============================================================================
router.delete('/public-holidays/cache', requireHrManager, asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const cfg  = await getOrCreateConfig(companyUuid);
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const country = (req.query.country || cfg.country_code || 'ID').toUpperCase();

    await query(
        `DELETE FROM hr_holiday_cache WHERE company_uuid = $1 AND country_code = $2 AND year = $3`,
        [companyUuid, country, year]
    );
    res.json({ message: `Cache hari libur ${country}/${year} dihapus. Kalender akan fetch ulang saat berikutnya dibuka.` });
}));

// =============================================================================
// CRUD: /hr/config/custom-holidays
// =============================================================================

router.get('/custom-holidays', asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const result = await query(
        `SELECT id, date::text AS date, name, description, type, created_at
         FROM hr_custom_holidays
         WHERE company_uuid = $1 AND EXTRACT(YEAR FROM date) = $2
         ORDER BY date ASC`,
        [companyUuid, year]
    );
    res.json(result.rows);
}));

router.post('/custom-holidays', requireHrManager, asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const { date, name, description, type } = req.body;
    if (!date)         return res.status(400).json({ error: 'Tanggal wajib diisi' });
    if (!name?.trim()) return res.status(400).json({ error: 'Nama hari libur wajib diisi' });

    const typeVal = ['holiday', 'cuti_bersama', 'local'].includes(type) ? type : 'holiday';
    try {
        const result = await query(
            `INSERT INTO hr_custom_holidays (company_id, company_uuid, date, name, description, type)
             VALUES ((SELECT id FROM companies WHERE uuid = $1), $1, $2, $3, $4, $5)
             RETURNING id, date::text AS date, name, description, type`,
            [companyUuid, date, name.trim(), description?.trim() || null, typeVal]
        );
        res.status(201).json(result.rows[0]);
    } catch (e) {
        if (e.code === '23505') return res.status(400).json({ error: 'Tanggal & nama sudah ada' });
        throw e;
    }
}));

// POST /hr/config/custom-holidays/batch  — insert satu record per hari dari rentang tanggal
router.post('/custom-holidays/batch', requireHrManager, asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const { date_from, date_to, name, description, type } = req.body;
    if (!date_from)    return res.status(400).json({ error: 'Tanggal mulai wajib diisi' });
    if (!date_to)      return res.status(400).json({ error: 'Tanggal akhir wajib diisi' });
    if (!name?.trim()) return res.status(400).json({ error: 'Nama hari libur wajib diisi' });
    if (date_from > date_to) return res.status(400).json({ error: 'Tanggal mulai harus sebelum tanggal akhir' });

    const typeVal = ['holiday', 'cuti_bersama', 'local'].includes(type) ? type : 'holiday';

    const dates = [];
    const cur = new Date(date_from + 'T00:00:00');
    const end = new Date(date_to   + 'T00:00:00');

    while (cur <= end && dates.length <= 31) {
        dates.push(cur.toISOString().slice(0, 10));
        cur.setDate(cur.getDate() + 1);
    }

    const inserted = [];
    for (const d of dates) {
        try {
            const r = await query(
                `INSERT INTO hr_custom_holidays (company_id, company_uuid, date, name, description, type)
                 VALUES ((SELECT id FROM companies WHERE uuid = $1), $1, $2, $3, $4, $5)
                 ON CONFLICT (company_id, date, name) DO NOTHING
                 RETURNING id, date::text AS date, name, description, type`,
                [companyUuid, d, name.trim(), description?.trim() || null, typeVal]
            );
            if (r.rows.length) inserted.push(r.rows[0]);
        } catch (_) {}
    }

    res.status(201).json({
        message: `${inserted.length} hari libur berhasil ditambahkan dari ${date_from} hingga ${date_to}`,
        inserted,
        total_days: dates.length,
    });
}));

router.put('/custom-holidays/:id', requireHrManager, asyncHandler(async (req, res) => {
    const companyUuid = req.user.company_uuid;
    const { date, name, description, type } = req.body;
    if (!date)         return res.status(400).json({ error: 'Tanggal wajib diisi' });
    if (!name?.trim()) return res.status(400).json({ error: 'Nama hari libur wajib diisi' });

    const typeVal = ['holiday', 'cuti_bersama', 'local'].includes(type) ? type : 'holiday';
    const result = await query(
        `UPDATE hr_custom_holidays
         SET date = $1, name = $2, description = $3, type = $4, updated_at = NOW()
         WHERE id = $5 AND company_uuid = $6
         RETURNING id, date::text AS date, name, description, type`,
        [date, name.trim(), description?.trim() || null, typeVal, req.params.id, companyUuid]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Tidak ditemukan' });
    res.json(result.rows[0]);
}));

router.delete('/custom-holidays/:id', requireHrManager, asyncHandler(async (req, res) => {
    const result = await query(
        `DELETE FROM hr_custom_holidays WHERE id = $1 AND company_uuid = $2 RETURNING id`,
        [req.params.id, req.user.company_uuid]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Tidak ditemukan' });
    res.json({ message: 'Hari libur dihapus' });
}));

module.exports = router;
