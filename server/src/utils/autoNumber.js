const { query, getClient } = require('../config/db');

/**
 * Generate auto-number using database sequence (atomic, race-condition safe)
 * Format: {branchCode}-{docType}-{year}-{letter}-{8 digit seq}
 * Example: JKT-SO-2026-A-00000001
 */
async function generateAutoNumber(branchCode, docType, year = null) {
    if (!year) year = new Date().getFullYear().toString();
    const prefix = `${branchCode}-${docType}`;

    const client = await getClient();
    try {
        await client.query('BEGIN');

        // Lock and increment
        const result = await client.query(
            `INSERT INTO auto_number_counters (prefix, year, letter, counter)
       VALUES ($1, $2, 'A', 1)
       ON CONFLICT (prefix, year, letter)
       DO UPDATE SET counter = auto_number_counters.counter + 1
       RETURNING letter, counter`,
            [prefix, year]
        );

        let { letter, counter } = result.rows[0];

        // If counter exceeds 99999999, roll to next letter
        if (counter > 99999999) {
            const nextLetter = String.fromCharCode(letter.charCodeAt(0) + 1);
            await client.query(
                `INSERT INTO auto_number_counters (prefix, year, letter, counter)
         VALUES ($1, $2, $3, 1)
         ON CONFLICT (prefix, year, letter)
         DO UPDATE SET counter = 1
         RETURNING letter, counter`,
                [prefix, year, nextLetter]
            );
            letter = nextLetter;
            counter = 1;
        }

        await client.query('COMMIT');

        const seq = String(counter).padStart(8, '0');
        return `${prefix}-${year}-${letter}-${seq}`;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

module.exports = { generateAutoNumber };
