/**
 * migrations/seed_user_hr_test.js
 * Membuat user test untuk role HR Manager (untuk testing modul absensi).
 *
 * User yang dibuat:
 *   email    : hr.test@erp.local
 *   password : HRtest123!
 *   role     : HR Manager (di semua company aktif)
 *
 * Usage: node migrations/seed_user_hr_test.js
 */
require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const BCRYPT_ROUNDS = 12;
const TEST_EMAIL    = 'hr.test@erp.local';
const TEST_NAME     = 'HR Tester';
const TEST_PASSWORD = 'HRtest123!';

const pool = new Pool({
    host    : process.env.DB_HOST     || 'localhost',
    port    : parseInt(process.env.DB_PORT || '5432'),
    user    : process.env.DB_USER     || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME     || 'erpsys',
});

async function run() {
    const client = await pool.connect();
    try {
        console.log('Membuat user HR test...\n');

        // Cari semua company aktif
        const { rows: companies } = await client.query(
            `SELECT id, name FROM companies WHERE is_active = TRUE ORDER BY id`
        );
        if (companies.length === 0) {
            console.error('Tidak ada company aktif!');
            process.exit(1);
        }
        console.log(`  Ditemukan ${companies.length} company aktif`);

        // Hash password
        const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);

        // Auto-generate username dari email prefix
        const baseUsername = TEST_EMAIL.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_');
        let username = baseUsername;
        let suffix = 1;
        while ((await client.query(`SELECT id FROM users WHERE username = $1`, [username])).rows.length > 0) {
            username = `${baseUsername}_${suffix++}`;
        }

        // Upsert user
        const existing = await client.query(
            `SELECT id FROM users WHERE email = $1`, [TEST_EMAIL]
        );

        let userId;
        if (existing.rows.length > 0) {
            userId = existing.rows[0].id;
            await client.query(
                `UPDATE users SET password_hash = $1, is_active = TRUE, updated_at = NOW() WHERE id = $2`,
                [passwordHash, userId]
            );
            console.log(`\n  User sudah ada (id=${userId}), password di-reset.`);
        } else {
            const res = await client.query(
                `INSERT INTO users (username, name, email, password_hash, is_active)
                 VALUES ($1, $2, $3, $4, TRUE) RETURNING id`,
                [username, TEST_NAME, TEST_EMAIL, passwordHash]
            );
            userId = res.rows[0].id;
            console.log(`\n  User baru dibuat (id=${userId})`);
        }

        // Assign ke semua company via user_companies
        for (const company of companies) {
            await client.query(
                `INSERT INTO user_companies (user_id, company_id)
                 VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                [userId, company.id]
            );
            console.log(`  Ditambahkan ke company [${company.id}] ${company.name}`);
        }

        // Assign role "HR Manager" (semua company)
        const { rows: allHrManagerRoles } = await client.query(
            `SELECT id, company_id FROM roles WHERE name = 'HR Manager'`
        );

        if (allHrManagerRoles.length === 0) {
            console.log('\n  [PERINGATAN] Role "HR Manager" belum ada — jalankan seed_add_role_HR.js dulu!');
        } else {
            // Hapus role lama & assign ulang
            await client.query(`DELETE FROM user_roles WHERE user_id = $1`, [userId]);
            for (const role of allHrManagerRoles) {
                await client.query(
                    `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                    [userId, role.id]
                );
            }
            console.log(`  Role "HR Manager" di-assign (${allHrManagerRoles.length} role)`);
        }

        // Tampilkan ringkasan
        console.log('\n=============================');
        console.log('  USER HR TEST SIAP DIGUNAKAN');
        console.log('=============================');
        console.log(`  Email   : ${TEST_EMAIL}`);
        console.log(`  Password: ${TEST_PASSWORD}`);
        console.log(`  Role    : HR Manager`);
        console.log('=============================\n');

    } catch (e) {
        console.error('Error:', e.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

run();
