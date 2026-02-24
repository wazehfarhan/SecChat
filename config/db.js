'use strict';
/**
 * config/db.js
 * Creates and exports a mysql2 connection pool.
 * Using a pool (vs. single connection) gives us:
 *  - Automatic reconnection on dropped connections
 *  - Concurrent query support for Socket.IO event handlers
 *  - Better resource management under load
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host:               process.env.DB_HOST     || '127.0.0.1',
    port:    parseInt(  process.env.DB_PORT     || '3306', 10),
    user:               process.env.DB_USER     || 'root',
    password:           process.env.DB_PASSWORD || '',
    database:           process.env.DB_NAME     || 'vanishchat',
    waitForConnections: true,
    connectionLimit:    10,       // Max simultaneous DB connections
    queueLimit:         0,        // 0 = unlimited queued requests
    charset:            'utf8mb4',
    timezone:           'Z',      // Store/return datetimes as UTC
});

/**
 * Verify the pool can actually reach the database on startup.
 * Fails fast rather than silently broken queries later.
 */
async function testConnection() {
    try {
        const conn = await pool.getConnection();
        console.log('[DB] MySQL connection pool established successfully.');
        conn.release();
    } catch (err) {
        console.error('[DB] FATAL: Cannot connect to MySQL:', err.message);
        process.exit(1); // Kill the server — nothing works without a DB
    }
}

testConnection();

module.exports = pool;
