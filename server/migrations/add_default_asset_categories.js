/**
 * add_default_asset_categories.js
 * Seed 5 kategori aset default ke semua company yang sudah ada.
 * COA di-link otomatis berdasarkan kode akun.
 * Idempotent: skip company yang sudah punya kategori aset.
 * Jalankan: node migrations/add_default_asset_categories.js
 */
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '5432'),
    user:     process.env.DB_USER     || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME     || 'erpsys',
});

/**
 * Template 5 kategori default.
 * Tiap entry: [name, dep_method, useful_life_months, residual_pct,
 *              coa_asset_code, coa_accum_code, coa_dep_code,
 *              coa_maint_code, coa_gain_code, coa_loss_code, is_depreciable]
 */
const DEFAULT_CATEGORIES = [
    ['Kendaraan',             'straight-line',     60,  0, '1-2100', '1-2110', '6-2100', '6-2600', '8-1100', '6-3000', true],
    ['Peralatan & Mesin',     'straight-line',     96,  0, '1-2200', '1-2210', '6-2200', '6-2700', '8-1100', '6-3000', true],
    ['Bangunan & Renovasi',   'straight-line',    240,  0, '1-2300', '1-2310', '6-2300', '6-2800', '8-1100', '6-3000', true],
    ['Furnitur & Inventaris', 'straight-line',     60,  0, '1-2400', '1-2410', '6-2400', '6-2900', '8-1100', '6-3000', true],
    ['Peralatan IT & Komputer','straight-line',    36,  0, '1-2500', '1-2510', '6-2500', '6-2900', '8-1100', '6-3000', true],
];

/**
 * Seed kategori default untuk 1 company.
 * client = pg Client yang sedang aktif (bisa dalam transaksi).
 * companyId = integer ID company.
 * Kembalikan jumlah kategori yang berhasil di-insert.
 */
async function seedAssetCategories(client, companyId) {
    // Lookup semua COA yang dibutuhkan sekaligus
    const codes = [...new Set(DEFAULT_CATEGORIES.flatMap(r => [r[4], r[5], r[6], r[7], r[8], r[9]]))];
    const coaRes = await client.query(
        `SELECT id, code FROM chart_of_accounts
         WHERE company_id = $1 AND code = ANY($2)`,
        [companyId, codes]
    );
    const coaMap = Object.fromEntries(coaRes.rows.map(r => [r.code, r.id]));

    let inserted = 0;
    for (const [name, method, life, residual,
                assetCode, accumCode, depCode,
                maintCode, gainCode, lossCode, isDep] of DEFAULT_CATEGORIES) {

        // Cek sudah ada belum (by name, case-insensitive)
        const exists = await client.query(
            `SELECT 1 FROM asset_categories WHERE company_id = $1 AND LOWER(name) = LOWER($2)`,
            [companyId, name]
        );
        if (exists.rows.length > 0) continue;

        await client.query(
            `INSERT INTO asset_categories
             (company_id, name, depreciation_method, useful_life_months, residual_value_pct,
              is_depreciable,
              coa_asset_id, coa_accum_depreciation_id, coa_depreciation_id,
              coa_maintenance_id, coa_disposal_gain_id, coa_disposal_loss_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
            [
                companyId, name, method, life, residual, isDep,
                coaMap[assetCode]   || null,
                coaMap[accumCode]   || null,
                coaMap[depCode]     || null,
                coaMap[maintCode]   || null,
                coaMap[gainCode]    || null,
                coaMap[lossCode]    || null,
            ]
        );
        inserted++;
    }
    return inserted;
}

// Export helper agar bisa di-require oleh company/index.js
module.exports = { seedAssetCategories };

// Jalankan migration jika dipanggil langsung
if (require.main === module) {
    (async () => {
        const client = await pool.connect();
        try {
            const companies = await client.query(`SELECT id, code, name FROM companies ORDER BY name`);
            console.log('Found ' + companies.rows.length + ' company(s).\n');

            let totalInserted = 0;
            for (const company of companies.rows) {
                const n = await seedAssetCategories(client, company.id);
                totalInserted += n;
                console.log('  [OK] ' + company.name + ' (' + company.code + ') -- ' + n + ' kategori baru');
            }

            console.log('\nSelesai! Total kategori baru: ' + totalInserted);
        } catch (e) {
            console.error('Gagal:', e.message);
            process.exit(1);
        } finally {
            client.release();
            await pool.end();
        }
    })();
}
