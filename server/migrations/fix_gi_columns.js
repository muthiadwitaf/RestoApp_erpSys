require('dotenv').config({ path: '../.env' });
const { query, pool } = require('../src/config/db');

async function run() {
    // Cek default value kolom status
    const res = await query(
        `SELECT column_name, column_default, is_nullable
         FROM information_schema.columns
         WHERE table_name = 'goods_issues'
           AND column_name IN ('status','approved_by','approved_at','ready_by','ready_at')
         ORDER BY column_name`
    );
    console.log('\nKolom goods_issues:');
    res.rows.forEach(r => {
        console.log(`  ${r.column_name}: default=${r.column_default}, nullable=${r.is_nullable}`);
    });

    // Pastikan default status = 'draft'
    await query(
        `ALTER TABLE goods_issues ALTER COLUMN status SET DEFAULT 'draft'`
    );
    console.log("\n✓ Default status diset ke 'draft'");

    // Cek apakah ada GI lama dengan status 'completed' yang perlu diupdate
    const old = await query(
        `SELECT COUNT(*) as cnt FROM goods_issues WHERE status IS NULL`
    );
    console.log(`\nGI dengan status NULL: ${old.rows[0].cnt}`);

    if (parseInt(old.rows[0].cnt) > 0) {
        await query(`UPDATE goods_issues SET status = 'approved' WHERE status IS NULL`);
        console.log('✓ GI lama dengan status NULL diset ke approved');
    }

    // Tampilkan distribusi status saat ini
    const dist = await query(
        `SELECT status, COUNT(*) as cnt FROM goods_issues GROUP BY status ORDER BY cnt DESC`
    );
    console.log('\nDistribusi status GI:');
    dist.rows.forEach(r => console.log(`  ${r.status || 'NULL'}: ${r.cnt}`));

    console.log('\n✅ Selesai!');
    await pool.end();
}

run().catch(e => { console.error('Error:', e.message); pool.end(); });
