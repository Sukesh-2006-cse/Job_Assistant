const { Pool } = require('pg');
const pgvector = require('pgvector/pg');

const pool = new Pool({
    connectionString: process.env.PGVECTOR_URL,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
});

// Register pgvector with the pool
pool.on('connect', async (client) => {
    console.log('[PostgreSQL] Connected');
    try {
        await pgvector.registerType(client);
    } catch (err) {
        console.error('[PostgreSQL] Error registering pgvector:', err);
    }
});

pool.on('error', (err) => {
    console.error('[PostgreSQL] Unexpected error on idle client:', err);
});

const query = async (text, params) => {
    try {
        const start = Date.now();
        const res = await pool.query(text, params);
        const duration = Date.now() - start;
        // console.log('[PostgreSQL] Executed query', { text, duration, rows: res.rowCount });
        return res.rows;
    } catch (err) {
        console.error('[PostgreSQL] Query Error:', err);
        throw err; // Throw instead of returning []
    }
};

module.exports = {
    pool,
    query
};
