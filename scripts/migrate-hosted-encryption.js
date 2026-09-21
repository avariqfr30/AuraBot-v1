'use strict';

require('dotenv').config({ quiet: true });
const { Pool } = require('pg');
const { createDataCipher } = require('../lib/data-crypto');
const { migrateLegacyAccountStorage } = require('../lib/hosted-migration');

async function main() {
    const apply = process.argv.includes('--apply');
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    const cipher = createDataCipher(process.env.AURA_DATA_ENCRYPTION_KEY, process.env.AURA_DATA_KEY_ID || 'primary');
    const previousKey = String(process.env.AURA_PREVIOUS_DATA_ENCRYPTION_KEY || '').trim();
    const previousKeyId = String(process.env.AURA_PREVIOUS_DATA_KEY_ID || '').trim();
    if (Boolean(previousKey) !== Boolean(previousKeyId)) throw new Error('Previous encryption key and key ID must be configured together');
    const previousCipher = previousKey ? createDataCipher(previousKey, previousKeyId) : null;
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
        const result = await migrateLegacyAccountStorage(pool, cipher, { apply, previousCipher });
        console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', ...result }));
        if (!apply && result.found) {
            console.log('Back up PostgreSQL, then rerun with --apply before starting this Aura version.');
        }
    } finally {
        await pool.end();
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error(`Hosted encryption migration failed: ${error.message}`);
        process.exitCode = 1;
    });
}

module.exports = { main };
