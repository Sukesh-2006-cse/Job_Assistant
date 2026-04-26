const Redis = require('ioredis');

let redisClient = null;

// Only create client if REDIS_URL is configured
if (process.env.REDIS_URL) {
    try {
        redisClient = new Redis(process.env.REDIS_URL, {
            maxRetriesPerRequest: 1,
            connectTimeout: 5000,
            lazyConnect: true,
        });

        redisClient.on('connect', () => {
            console.log('[Redis] Connected');
        });

        redisClient.on('error', (err) => {
            // Log silently — do NOT crash the server
            console.error('[Redis] Error (non-fatal):', err.message);
        });
    } catch (err) {
        console.error('[Redis] Failed to initialise client (non-fatal):', err.message);
        redisClient = null;
    }
} else {
    console.warn('[Redis] REDIS_URL not set — caching disabled, running in fallback mode');
}

/**
 * Get a cached value by key. Returns parsed object or null on miss/error.
 * @param {string} key
 * @returns {Promise<object|null>}
 */
async function cacheGet(key) {
    if (!redisClient) return null;
    try {
        const raw = await redisClient.get(key);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (err) {
        console.error('[Redis] cacheGet error (non-fatal):', err.message);
        return null;
    }
}

/**
 * Store a value in Redis with an expiry time.
 * @param {string} key
 * @param {object} value - Will be JSON-stringified
 * @param {number} ttlSeconds - Time-to-live in seconds
 * @returns {Promise<boolean>}
 */
async function cacheSet(key, value, ttlSeconds) {
    if (!redisClient) return false;
    try {
        await redisClient.set(key, JSON.stringify(value), 'EX', ttlSeconds);
        return true;
    } catch (err) {
        console.error('[Redis] cacheSet error (non-fatal):', err.message);
        return false;
    }
}

module.exports = { redisClient, cacheGet, cacheSet };
