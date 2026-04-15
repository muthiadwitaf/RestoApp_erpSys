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

        // Lock the specific counter row, preventing concurrent reads from passing until this transaction commits
        const check = await client.query(
            `SELECT letter, counter FROM auto_number_counters 
             WHERE prefix = $1 AND year = $2 
             ORDER BY letter DESC LIMIT 1 FOR UPDATE`, 
            [prefix, year]
        );

        let letter = 'A';
        let counter = 1;

        if (check.rows.length === 0) {
            // First time this prefix/year happens
            await client.query(
                `INSERT INTO auto_number_counters (prefix, year, letter, counter)
                 VALUES ($1, $2, $3, $4)`,
                [prefix, year, letter, counter]
            );
        } else {
            letter = check.rows[0].letter;
            // Ensure integer addition
            counter = parseInt(check.rows[0].counter) + 1;

            if (counter > 99999999) {
                // Roll over to next alphabet character
                letter = String.fromCharCode(letter.charCodeAt(0) + 1);
                counter = 1;
                await client.query(
                    `INSERT INTO auto_number_counters (prefix, year, letter, counter)
                     VALUES ($1, $2, $3, $4)`,
                    [prefix, year, letter, counter]
                );
            } else {
                // Typical increment update
                await client.query(
                    `UPDATE auto_number_counters 
                     SET counter = $1 
                     WHERE prefix = $2 AND year = $3 AND letter = $4`,
                    [counter, prefix, year, letter]
                );
            }
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
