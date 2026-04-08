/**
 * BE/src/module/accounting/assets/lifecycle.js
 * Aksi lifecycle aset -- semua menghasilkan jurnal otomatis ke GL
 *
 * PUT /accounting/assets/:uuid/post        -- posting akuisisi
 * PUT /accounting/assets/:uuid/depreciate  -- catat 1 periode penyusutan
 * PUT /accounting/assets/:uuid/maintain    -- catat biaya pemeliharaan
 * PUT /accounting/assets/:uuid/transfer    -- transfer antar cabang
 * PUT /accounting/assets/:uuid/dispose     -- disposal / penghapusan aset
 * PUT /accounting/assets/:uuid/revalue     -- revaluasi (naik/turun) aset non-depreciable
 */
const router = require('express').Router();
const { query, getClient } = require('../../../config/db');
const { requirePermission } = require('../../../middleware/auth');
const { validateUUID } = require('../../../middleware/validate');
const { asyncHandler } = require('../../../utils/helpers');
const { generateAutoNumber } = require('../../../utils/autoNumber');

// ── Helper: resolve COA (aset-level > category-level > error) ────────────────
async function resolveCoa(assetCoaId, categoryCoaId, fieldLabel) {
    const id = assetCoaId || categoryCoaId;
    if (!id) throw Object.assign(new Error(`COA untuk ${fieldLabel} belum dikonfigurasi di aset maupun kategori`), { status: 400 });
    return id;
}

// ── Helper: ambil data aset + kategori dalam satu query ────────────────────────
async function fetchAsset(uuid, companyId) {
    const r = await query(
        `SELECT
            a.id, a.uuid, a.number, a.name, a.status,
            a.acquisition_cost, a.current_book_value, a.accumulated_depreciation,
            a.useful_life_months, a.residual_value, a.depreciation_method,
            a.coa_asset_id, a.coa_depreciation_id, a.coa_accum_depreciation_id,
            a.coa_disposal_gain_id, a.coa_disposal_loss_id, a.coa_maintenance_id,
            a.coa_revalue_surplus_id, a.coa_revalue_loss_id,
            b.id AS branch_id, b.code AS branch_code, b.company_id,
            ac.is_depreciable,
            ac.coa_asset_id              AS cat_coa_asset,
            ac.coa_depreciation_id       AS cat_coa_dep,
            ac.coa_accum_depreciation_id AS cat_coa_accum,
            ac.coa_disposal_gain_id      AS cat_coa_gain,
            ac.coa_disposal_loss_id      AS cat_coa_loss,
            ac.coa_maintenance_id        AS cat_coa_maint,
            ac.coa_revalue_surplus_id    AS cat_coa_revalue_surplus,
            ac.coa_revalue_loss_id       AS cat_coa_revalue_loss,
            ac.useful_life_months        AS cat_useful_life,
            ac.depreciation_method       AS cat_dep_method,
            ac.residual_value_pct        AS cat_residual_pct
         FROM assets a
         JOIN branches b          ON a.branch_id          = b.id
         JOIN asset_categories ac  ON a.asset_category_id  = ac.id
         WHERE a.uuid = $1 AND b.company_id = $2`,
        [uuid, companyId]
    );
    return r.rows[0] || null;
}

// ── Helper: insert jurnal + lines + update COA balance ────────────────────────
async function insertJournal(client, { branchId, branchCode, description, refNumber, refType, userName, lines }) {
    const jeNum = await generateAutoNumber(branchCode || 'GEN', 'JU');
    const jeRes = await client.query(
        `INSERT INTO journal_entries (number, date, branch_id, description, status, created_by, ref_number, ref_type)
         VALUES ($1, NOW()::date, $2, $3, 'posted', $4, $5, $6)
         RETURNING id`,
        [jeNum, branchId, description, userName, refNumber, refType]
    );
    const jeId = jeRes.rows[0].id;

    for (const line of lines) {
        await client.query(
            `INSERT INTO journal_lines (journal_id, account_id, debit, credit, description)
             VALUES ($1,$2,$3,$4,$5)`,
            [jeId, line.accountId, line.debit || 0, line.credit || 0, line.description]
        );
        // Update COA balance (debit +, credit -)
        if (line.debit)  await client.query(`UPDATE chart_of_accounts SET balance = balance + $1, updated_at = NOW() WHERE id = $2`, [line.debit,  line.accountId]);
        if (line.credit) await client.query(`UPDATE chart_of_accounts SET balance = balance - $1, updated_at = NOW() WHERE id = $2`, [line.credit, line.accountId]);
    }
    return { jeId, jeNum };
}

// ── Helper: audit log ─────────────────────────────────────────────────────────
async function auditLog(req, action, description, branchId) {
    await query(
        `INSERT INTO audit_trail (action, module, description, user_id, user_name, branch_id)
         VALUES ($1,'accounting',$2,$3,$4,$5)`,
        [action, description, req.user.id, req.user.name, branchId || req.user.branch_id]
    ).catch(() => { });
}

// =============================================================================
// POST /:uuid/post -- Posting akuisisi aset
// Jurnal: Dr. Aset Tetap -- Kr. Kas / Hutang Usaha
// =============================================================================
router.put('/:uuid/post', requirePermission('accounting:approve'), validateUUID(), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const asset = await fetchAsset(req.params.uuid, companyId);
    if (!asset) return res.status(404).json({ error: 'Aset tidak ditemukan' });
    if (asset.company_id !== companyId) return res.status(403).json({ error: 'Akses ditolak' });
    if (asset.status !== 'draft') return res.status(400).json({ error: 'Hanya aset Draft yang bisa diposting' });

    // Resolve COA
    const coaAssetId  = await resolveCoa(asset.coa_asset_id, asset.cat_coa_asset, 'Aset Tetap');

    // Cari akun Kas/Bank untuk kredit
    const cashCoaRes = await query(
        `SELECT id FROM chart_of_accounts WHERE company_id = $1 AND (name ILIKE '%Kas%' OR name ILIKE '%Bank%') AND type = 'Aset' ORDER BY code LIMIT 1`,
        [companyId]
    );
    if (!cashCoaRes.rows.length) return res.status(400).json({ error: 'Akun Kas/Bank tidak ditemukan di COA' });
    const cashCoaId = cashCoaRes.rows[0].id;

    const client = await getClient();
    try {
        await client.query('BEGIN');
        const { jeId, jeNum } = await insertJournal(client, {
            branchId: asset.branch_id, branchCode: asset.branch_code,
            description: `Akuisisi Aset: ${asset.name}`,
            refNumber: asset.number, refType: 'AST', userName: req.user.name,
            lines: [
                { accountId: coaAssetId, debit: parseFloat(asset.acquisition_cost), description: `Aset Tetap: ${asset.name}` },
                { accountId: cashCoaId,  credit: parseFloat(asset.acquisition_cost), description: `Akuisisi Aset: ${asset.name}` }
            ]
        });
        await client.query(
            `UPDATE assets SET status = 'active', journal_id = $1, updated_at = NOW() WHERE id = $2`,
            [jeId, asset.id]
        );
        await client.query('COMMIT');
        await auditLog(req, 'approve', `Post aset: ${asset.number} - Jurnal: ${jeNum}`, asset.branch_id);
        res.json({ message: `Aset ${asset.number} berhasil diposting. Jurnal: ${jeNum}` });
    } catch (err) {
        await client.query('ROLLBACK');
        if (err.status === 400) return res.status(400).json({ error: err.message });
        throw err;
    } finally { client.release(); }
}));

// =============================================================================
// PUT /:uuid/depreciate -- Catat 1 periode penyusutan
// Jurnal: Dr. Beban Depresiasi -- Kr. Akumulasi Depresiasi
// =============================================================================
router.put('/:uuid/depreciate', requirePermission('accounting:approve'), validateUUID(), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const asset = await fetchAsset(req.params.uuid, companyId);
    if (!asset) return res.status(404).json({ error: 'Aset tidak ditemukan' });
    if (asset.company_id !== companyId) return res.status(403).json({ error: 'Akses ditolak' });
    if (asset.status !== 'active') return res.status(400).json({ error: 'Hanya aset berstatus Active yang bisa disusutkan' });

    const { period, depreciation_date, amount } = req.body;
    if (!period || !depreciation_date) {
        return res.status(400).json({ error: 'period (YYYY-MM) dan tanggal penyusutan wajib diisi' });
    }
    if (!/^\d{4}-\d{2}$/.test(period)) {
        return res.status(400).json({ error: 'Format period harus YYYY-MM' });
    }

    // Cek duplikat periode
    const dupRes = await query(
        `SELECT id FROM asset_depreciation_logs WHERE asset_id = $1 AND period = $2`,
        [asset.id, period]
    );
    if (dupRes.rows.length) return res.status(400).json({ error: `Penyusutan periode ${period} sudah pernah dicatat` });

    // Hitung nominal penyusutan
    const usefulLife     = asset.useful_life_months || asset.cat_useful_life || 60;
    const residual       = parseFloat(asset.residual_value) || (parseFloat(asset.acquisition_cost) * (parseFloat(asset.cat_residual_pct) || 0) / 100);
    const depMethod      = asset.depreciation_method || asset.cat_dep_method || 'straight-line';
    const bookValue      = parseFloat(asset.current_book_value);

    let depAmount;
    if (amount && parseFloat(amount) > 0) {
        depAmount = parseFloat(amount);
    } else if (depMethod === 'declining-balance') {
        depAmount = bookValue * (2 / usefulLife);
    } else {
        depAmount = (parseFloat(asset.acquisition_cost) - residual) / usefulLife;
    }
    depAmount = Math.min(depAmount, Math.max(0, bookValue - residual));
    if (depAmount <= 0) return res.status(400).json({ error: 'Nilai buku sudah mencapai nilai sisa, tidak perlu penyusutan lagi' });

    const newBookValue = bookValue - depAmount;

    // Resolve COA
    const coaDepId    = await resolveCoa(asset.coa_depreciation_id,       asset.cat_coa_dep,   'Beban Depresiasi').catch(e => { throw Object.assign(e, { status: 400 }); });
    const coaAccumId  = await resolveCoa(asset.coa_accum_depreciation_id, asset.cat_coa_accum, 'Akumulasi Depresiasi').catch(e => { throw Object.assign(e, { status: 400 }); });

    const client = await getClient();
    try {
        await client.query('BEGIN');
        const { jeId, jeNum } = await insertJournal(client, {
            branchId: asset.branch_id, branchCode: asset.branch_code,
            description: `Penyusutan Aset ${asset.number} Periode ${period}`,
            refNumber: asset.number, refType: 'DEP', userName: req.user.name,
            lines: [
                { accountId: coaDepId,   debit: depAmount, description: `Beban Penyusutan: ${asset.name}` },
                { accountId: coaAccumId, credit: depAmount, description: `Akumulasi Penyusutan: ${asset.name}` }
            ]
        });

        const logRes = await client.query(
            `INSERT INTO asset_depreciation_logs (asset_id, period, depreciation_date, amount, book_value_after, journal_id, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING uuid`,
            [asset.id, period, depreciation_date, depAmount, newBookValue, jeId, req.user.name]
        );

        await client.query(
            `UPDATE assets SET
                current_book_value       = $1,
                accumulated_depreciation = accumulated_depreciation + $2,
                updated_at               = NOW()
             WHERE id = $3`,
            [newBookValue, depAmount, asset.id]
        );

        await client.query('COMMIT');
        await auditLog(req, 'approve', `Penyusutan aset: ${asset.number} periode ${period} - Jurnal: ${jeNum}`, asset.branch_id);
        res.json({
            message: `Penyusutan periode ${period} berhasil dicatat. Jurnal: ${jeNum}`,
            log_uuid: logRes.rows[0].uuid,
            depreciation_amount: depAmount,
            book_value_after: newBookValue
        });
    } catch (err) {
        await client.query('ROLLBACK');
        if (err.status === 400) return res.status(400).json({ error: err.message });
        throw err;
    } finally { client.release(); }
}));

// =============================================================================
// PUT /:uuid/maintain -- Catat biaya pemeliharaan
// Jurnal: Dr. Beban Pemeliharaan -- Kr. Kas atau Kr. Hutang Usaha
// =============================================================================
router.put('/:uuid/maintain', requirePermission('accounting:create'), validateUUID(), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const asset = await fetchAsset(req.params.uuid, companyId);
    if (!asset) return res.status(404).json({ error: 'Aset tidak ditemukan' });
    if (asset.company_id !== companyId) return res.status(403).json({ error: 'Akses ditolak' });
    if (asset.status !== 'active') return res.status(400).json({ error: 'Hanya aset Active yang bisa dicatat pemeliharaannya' });

    const { maintenance_date, description, cost, vendor, payment_method } = req.body;
    if (!maintenance_date || !description?.trim() || !cost || parseFloat(cost) <= 0) {
        return res.status(400).json({ error: 'Tanggal, deskripsi, dan biaya pemeliharaan wajib diisi' });
    }

    const payMethod = payment_method === 'hutang' ? 'hutang' : 'cash';
    const costVal   = parseFloat(cost);

    // COA Debit: Beban Pemeliharaan
    const coaMaintId = await resolveCoa(asset.coa_maintenance_id, asset.cat_coa_maint, 'Beban Pemeliharaan').catch(e => { throw Object.assign(e, { status: 400 }); });

    // COA Kredit: Kas atau Hutang Usaha
    const creditKeyword = payMethod === 'hutang' ? 'Hutang' : 'Kas';
    const creditCoaRes = await query(
        `SELECT id FROM chart_of_accounts WHERE company_id = $1 AND name ILIKE $2 ORDER BY code LIMIT 1`,
        [companyId, `%${creditKeyword}%`]
    );
    if (!creditCoaRes.rows.length) return res.status(400).json({ error: `Akun ${creditKeyword} tidak ditemukan di COA` });
    const creditCoaId = creditCoaRes.rows[0].id;

    const client = await getClient();
    try {
        await client.query('BEGIN');
        const { jeId, jeNum } = await insertJournal(client, {
            branchId: asset.branch_id, branchCode: asset.branch_code,
            description: `Pemeliharaan Aset ${asset.number}: ${description.trim()}`,
            refNumber: asset.number, refType: 'MNT', userName: req.user.name,
            lines: [
                { accountId: coaMaintId,  debit: costVal, description: `Beban Pemeliharaan: ${asset.name}` },
                { accountId: creditCoaId, credit: costVal, description: description.trim() }
            ]
        });

        const logRes = await client.query(
            `INSERT INTO asset_maintenance_logs (asset_id, maintenance_date, description, cost, vendor, payment_method, journal_id, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING uuid`,
            [asset.id, maintenance_date, description.trim(), costVal, vendor?.trim() || null, payMethod, jeId, req.user.name]
        );

        await client.query('COMMIT');
        await auditLog(req, 'create', `Pemeliharaan aset: ${asset.number} - ${description.trim()} - Jurnal: ${jeNum}`, asset.branch_id);
        res.status(201).json({
            message: `Pemeliharaan berhasil dicatat. Jurnal: ${jeNum}`,
            log_uuid: logRes.rows[0].uuid
        });
    } catch (err) {
        await client.query('ROLLBACK');
        if (err.status === 400) return res.status(400).json({ error: err.message });
        throw err;
    } finally { client.release(); }
}));

// =============================================================================
// PUT /:uuid/transfer -- Transfer aset ke cabang lain
// Jurnal cabang asal   : Dr. Rek. Koran Antar Cabang | Kr. Aset Tetap
// Jurnal cabang tujuan : Dr. Aset Tetap               | Kr. Rek. Koran Antar Cabang
// =============================================================================
router.put('/:uuid/transfer', requirePermission('accounting:approve'), validateUUID(), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const asset = await fetchAsset(req.params.uuid, companyId);
    if (!asset) return res.status(404).json({ error: 'Aset tidak ditemukan' });
    if (asset.company_id !== companyId) return res.status(403).json({ error: 'Akses ditolak' });
    if (asset.status !== 'active') return res.status(400).json({ error: 'Hanya aset Active yang bisa ditransfer' });

    const { target_branch_uuid, transfer_date, notes } = req.body;
    if (!target_branch_uuid || !transfer_date) {
        return res.status(400).json({ error: 'Cabang tujuan dan tanggal transfer wajib diisi' });
    }

    // Resolve target branch
    const targetBrRes = await query(
        `SELECT id, code, name FROM branches WHERE uuid = $1 AND company_id = $2`,
        [target_branch_uuid, companyId]
    );
    if (!targetBrRes.rows.length) return res.status(400).json({ error: 'Cabang tujuan tidak ditemukan' });
    const targetBranch = targetBrRes.rows[0];

    if (targetBranch.id === asset.branch_id) {
        return res.status(400).json({ error: 'Cabang tujuan harus berbeda dengan cabang aset saat ini' });
    }

    // Resolve COA Aset Tetap
    const coaAssetId = await resolveCoa(asset.coa_asset_id, asset.cat_coa_asset, 'Aset Tetap')
        .catch(e => { throw Object.assign(e, { status: 400 }); });
    const cost = parseFloat(asset.acquisition_cost);

    // ── Cari / buat akun kliring "Rekening Koran Antar Cabang" ──────────────
    let clearingCoaId;
    const clearingRes = await query(
        `SELECT id FROM chart_of_accounts WHERE company_id = $1 AND name ILIKE '%Antar Cabang%' ORDER BY code LIMIT 1`,
        [companyId]
    );
    if (clearingRes.rows.length) {
        clearingCoaId = clearingRes.rows[0].id;
    } else {
        // Auto-create jika belum ada
        const newCoa = await query(
            `INSERT INTO chart_of_accounts (code, name, type, category, currency, company_id)
             VALUES ($1, $2, 'Aset', 'Aset Lainnya', 'IDR', $3)
             ON CONFLICT (code, company_id) DO UPDATE SET name = EXCLUDED.name
             RETURNING id`,
            ['1-9999', 'Rekening Koran Antar Cabang', companyId]
        );
        clearingCoaId = newCoa.rows[0].id;
    }

    const client = await getClient();
    try {
        await client.query('BEGIN');

        // Jurnal cabang asal — Dr. Rek. Koran Antar Cabang | Kr. Aset Tetap
        const srcDesc = `Transfer Aset ${asset.number} ke ${targetBranch.name}`;
        const { jeNum: srcJeNum } = await insertJournal(client, {
            branchId: asset.branch_id, branchCode: asset.branch_code,
            description: srcDesc, refNumber: asset.number, refType: 'TRF', userName: req.user.name,
            lines: [
                { accountId: clearingCoaId, debit: cost,  description: `Piutang transfer aset ke ${targetBranch.name}` },
                { accountId: coaAssetId,    credit: cost, description: srcDesc }
            ]
        });

        // Jurnal cabang tujuan — Dr. Aset Tetap | Kr. Rek. Koran Antar Cabang
        const dstDesc = `Penerimaan Transfer Aset ${asset.number} dari ${asset.branch_code}`;
        const { jeNum: dstJeNum } = await insertJournal(client, {
            branchId: targetBranch.id, branchCode: targetBranch.code,
            description: dstDesc, refNumber: asset.number, refType: 'TRF', userName: req.user.name,
            lines: [
                { accountId: coaAssetId,    debit: cost,  description: dstDesc },
                { accountId: clearingCoaId, credit: cost, description: `Hutang transfer aset dari ${asset.branch_code}` }
            ]
        });

        // Update branch aset ke cabang tujuan
        await client.query(
            `UPDATE assets SET branch_id = $1, notes = COALESCE($2, notes), updated_at = NOW() WHERE id = $3`,
            [targetBranch.id, notes?.trim() || null, asset.id]
        );

        await client.query('COMMIT');
        await auditLog(req, 'approve', `Transfer aset: ${asset.number} -> ${targetBranch.name} - Jurnal: ${srcJeNum}, ${dstJeNum}`, asset.branch_id);
        res.json({
            message: `Aset ${asset.number} berhasil ditransfer ke ${targetBranch.name}. Jurnal: ${srcJeNum} / ${dstJeNum}`
        });
    } catch (err) {
        await client.query('ROLLBACK');
        if (err.status === 400) return res.status(400).json({ error: err.message });
        throw err;
    } finally { client.release(); }
}));


// =============================================================================
// PUT /:uuid/dispose -- Disposal / pelepasan aset
// Jurnal:
//   Dr. Kas/Piutang (disposal_price)
//   Dr. Akum. Depresiasi (accumulated_depreciation)
//     Kr. Aset Tetap (acquisition_cost)
//     Kr. Laba Pelepasan  -- atau --
//   Dr. Rugi Pelepasan
// =============================================================================
router.put('/:uuid/dispose', requirePermission('accounting:approve'), validateUUID(), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const asset = await fetchAsset(req.params.uuid, companyId);
    if (!asset) return res.status(404).json({ error: 'Aset tidak ditemukan' });
    if (asset.company_id !== companyId) return res.status(403).json({ error: 'Akses ditolak' });
    if (asset.status !== 'active') return res.status(400).json({ error: 'Hanya aset Active yang bisa di-disposal' });

    const { disposal_date, disposal_price, disposal_notes } = req.body;
    if (!disposal_date) return res.status(400).json({ error: 'Tanggal disposal wajib diisi' });

    const salePrice    = parseFloat(disposal_price) || 0;
    const accumDep     = parseFloat(asset.accumulated_depreciation);
    const acquiCost    = parseFloat(asset.acquisition_cost);
    const bookValue    = parseFloat(asset.current_book_value);
    const gainLoss     = salePrice - bookValue;  // positif = gain, negatif = loss

    // Resolve COA
    const coaAssetId  = await resolveCoa(asset.coa_asset_id,             asset.cat_coa_asset,  'Aset Tetap').catch(e => { throw Object.assign(e, { status: 400 }); });
    const coaAccumId  = await resolveCoa(asset.coa_accum_depreciation_id, asset.cat_coa_accum,  'Akumulasi Depresiasi').catch(e => { throw Object.assign(e, { status: 400 }); });
    const coaGainId   = gainLoss >= 0 ? await resolveCoa(asset.coa_disposal_gain_id, asset.cat_coa_gain, 'Laba Pelepasan').catch(e => { throw Object.assign(e, { status: 400 }); }) : null;
    const coaLossId   = gainLoss < 0  ? await resolveCoa(asset.coa_disposal_loss_id, asset.cat_coa_loss, 'Rugi Pelepasan').catch(e => { throw Object.assign(e, { status: 400 }); }) : null;

    // Akun Kas/Piutang untuk hasil penjualan (hanya jika ada hasil)
    let cashCoaId = null;
    if (salePrice > 0) {
        const cashRes = await query(
            `SELECT id FROM chart_of_accounts WHERE company_id = $1 AND (name ILIKE '%Kas%' OR name ILIKE '%Bank%') AND type = 'Aset' ORDER BY code LIMIT 1`,
            [companyId]
        );
        if (!cashRes.rows.length) return res.status(400).json({ error: 'Akun Kas/Bank tidak ditemukan di COA' });
        cashCoaId = cashRes.rows[0].id;
    }

    // Susun lines jurnal
    const lines = [];
    if (salePrice > 0) {
        lines.push({ accountId: cashCoaId, debit: salePrice, description: `Hasil Penjualan Aset: ${asset.name}` });
    }
    if (accumDep > 0) {
        lines.push({ accountId: coaAccumId, debit: accumDep, description: `Hapus Akumulasi Depresiasi: ${asset.name}` });
    }
    lines.push({ accountId: coaAssetId, credit: acquiCost, description: `Hapus Aset Tetap: ${asset.name}` });

    if (gainLoss > 0) {
        lines.push({ accountId: coaGainId, credit: gainLoss, description: `Laba Pelepasan Aset: ${asset.name}` });
    } else if (gainLoss < 0) {
        lines.push({ accountId: coaLossId, debit: Math.abs(gainLoss), description: `Rugi Pelepasan Aset: ${asset.name}` });
    }

    const client = await getClient();
    try {
        await client.query('BEGIN');
        const { jeId, jeNum } = await insertJournal(client, {
            branchId: asset.branch_id, branchCode: asset.branch_code,
            description: `Disposal Aset: ${asset.number} - ${asset.name}`,
            refNumber: asset.number, refType: 'DSP', userName: req.user.name,
            lines
        });

        await client.query(
            `UPDATE assets SET
                status                = 'disposed',
                disposal_journal_id   = $1,
                disposal_date         = $2,
                disposal_price        = $3,
                disposal_notes        = $4,
                current_book_value    = 0,
                updated_at            = NOW()
             WHERE id = $5`,
            [jeId, disposal_date, salePrice, disposal_notes?.trim() || null, asset.id]
        );

        await client.query('COMMIT');
        await auditLog(req, 'approve', `Disposal aset: ${asset.number} - Jurnal: ${jeNum} - ${gainLoss >= 0 ? 'Gain' : 'Loss'}: ${Math.abs(gainLoss)}`, asset.branch_id);
        res.json({
            message: `Aset ${asset.number} berhasil di-disposal. Jurnal: ${jeNum}`,
            gain_loss: gainLoss,
            gain_loss_label: gainLoss >= 0 ? 'Laba Pelepasan' : 'Rugi Pelepasan'
        });
    } catch (err) {
        await client.query('ROLLBACK');
        if (err.status === 400) return res.status(400).json({ error: err.message });
        throw err;
    } finally { client.release(); }
}));

// =============================================================================
// PUT /:uuid/revalue -- Revaluasi aset (naik atau turun)
// Jurnal (naik):   Dr. Aset Tetap -- Kr. Surplus Revaluasi (Ekuitas)
// Jurnal (turun):  Dr. Kerugian Penurunan Nilai -- Kr. Aset Tetap
// =============================================================================
router.put('/:uuid/revalue', requirePermission('accounting:approve'), validateUUID(), asyncHandler(async (req, res) => {
    const companyId = req.user.company_id;
    const asset = await fetchAsset(req.params.uuid, companyId);
    if (!asset) return res.status(404).json({ error: 'Aset tidak ditemukan' });
    if (asset.company_id !== companyId) return res.status(403).json({ error: 'Akses ditolak' });
    if (asset.status !== 'active') return res.status(400).json({ error: 'Hanya aset Active yang bisa direvaluasi' });

    const { revaluation_date, new_value, notes } = req.body;
    if (!revaluation_date || new_value === undefined || new_value === null || new_value === '') {
        return res.status(400).json({ error: 'Tanggal revaluasi dan nilai baru wajib diisi' });
    }

    const oldValue   = parseFloat(asset.current_book_value);
    const newVal     = parseFloat(new_value);
    const difference = newVal - oldValue;

    if (difference === 0) return res.status(400).json({ error: 'Nilai baru sama dengan nilai buku saat ini' });

    const isUpward = difference > 0;

    // Resolve COA Aset Tetap (selalu dibutuhkan)
    const coaAssetId = await resolveCoa(asset.coa_asset_id, asset.cat_coa_asset, 'Aset Tetap')
        .catch(e => { throw Object.assign(e, { status: 400 }); });

    // Resolve COA Surplus atau Kerugian
    let coaCounterpartId;
    if (isUpward) {
        coaCounterpartId = await resolveCoa(
            asset.coa_revalue_surplus_id, asset.cat_coa_revalue_surplus, 'Surplus Revaluasi'
        ).catch(e => { throw Object.assign(e, { status: 400 }); });
    } else {
        coaCounterpartId = await resolveCoa(
            asset.coa_revalue_loss_id, asset.cat_coa_revalue_loss, 'Kerugian Penurunan Nilai'
        ).catch(e => { throw Object.assign(e, { status: 400 }); });
    }

    const absDiff = Math.abs(difference);
    const lines = isUpward
        ? [
            { accountId: coaAssetId,        debit: absDiff,  description: `Revaluasi Naik: ${asset.name}` },
            { accountId: coaCounterpartId,  credit: absDiff, description: `Surplus Revaluasi: ${asset.name}` }
          ]
        : [
            { accountId: coaCounterpartId,  debit: absDiff,  description: `Kerugian Penurunan Nilai: ${asset.name}` },
            { accountId: coaAssetId,        credit: absDiff, description: `Penurunan Nilai Aset: ${asset.name}` }
          ];

    const client = await getClient();
    try {
        await client.query('BEGIN');
        const { jeId, jeNum } = await insertJournal(client, {
            branchId: asset.branch_id, branchCode: asset.branch_code,
            description: `Revaluasi Aset: ${asset.number} - ${isUpward ? 'Kenaikan' : 'Penurunan'} Nilai`,
            refNumber: asset.number, refType: 'RVL', userName: req.user.name,
            lines
        });

        const logRes = await client.query(
            `INSERT INTO asset_revaluation_logs (asset_id, revaluation_date, old_value, new_value, difference, notes, journal_id, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING uuid`,
            [asset.id, revaluation_date, oldValue, newVal, difference, notes?.trim() || null, jeId, req.user.name]
        );

        await client.query(
            `UPDATE assets SET
                current_book_value = $1,
                acquisition_cost   = CASE WHEN $1 > acquisition_cost THEN $1 ELSE acquisition_cost END,
                updated_at         = NOW()
             WHERE id = $2`,
            [newVal, asset.id]
        );

        await client.query('COMMIT');
        await auditLog(req, 'approve',
            `Revaluasi aset: ${asset.number} ${oldValue} -> ${newVal} (${isUpward ? '+' : ''}${difference}) - Jurnal: ${jeNum}`,
            asset.branch_id
        );
        res.json({
            message: `Revaluasi berhasil dicatat. Jurnal: ${jeNum}`,
            log_uuid: logRes.rows[0].uuid,
            old_value: oldValue,
            new_value: newVal,
            difference,
            direction: isUpward ? 'upward' : 'downward'
        });
    } catch (err) {
        await client.query('ROLLBACK');
        if (err.status === 400) return res.status(400).json({ error: err.message });
        throw err;
    } finally { client.release(); }
}));

module.exports = router;
