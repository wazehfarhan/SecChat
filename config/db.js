"use strict";
/**
 * config/db.js
 * Creates and exports a mysql2 connection pool with enhanced error handling.
 * Using a pool (vs. single connection) gives us:
 *  - Automatic reconnection on dropped connections
 *  - Concurrent query support for Socket.IO event handlers
 *  - Better resource management under load
 *  - Connection retry on startup failure
 */

const mysql = require("mysql2/promise");
require("dotenv").config();

// ────────────────────────────────────────────────────────────
// Environment Validation
// ────────────────────────────────────────────────────────────
function validateEnv() {
  const required = ["DB_HOST", "DB_USER", "DB_NAME"];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error(
      "[DB] ERROR: Missing required environment variables:",
      missing.join(", "),
    );
    console.error("[DB] Please copy .env.example to .env and configure it.");
    process.exit(1);
  }
}

validateEnv();

// ────────────────────────────────────────────────────────────
// Pool Configuration
// ────────────────────────────────────────────────────────────
const pool = mysql.createPool({
  host: process.env.DB_HOST || process.env.RDS_HOSTNAME || "mysql",
  port: parseInt(process.env.DB_PORT || "3306", 10),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "vanishchat",
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || "10", 10),
  queueLimit: parseInt(process.env.DB_QUEUE_LIMIT || "0", 10),
  charset: "utf8mb4",
  timezone: "Z", // Store/return datetimes as UTC
  enableKeepAlive: true,
  keepAliveInitialDelayMs: 0,
});

// ────────────────────────────────────────────────────────────
// Connection Testing with Retry Logic
// ────────────────────────────────────────────────────────────
/**
 * Test database connectivity with exponential backoff retry.
 * Logs error but doesn't crash if DB unavailable (frontend continues)
 */
async function testConnection() {
  const retryAttempts = parseInt(process.env.DB_RETRY_ATTEMPTS || "5", 10);
  const retryDelayMs = parseInt(process.env.DB_RETRY_DELAY_MS || "2000", 10);

  let lastError;

  for (let attempt = 1; attempt <= retryAttempts; attempt++) {
    try {
      const conn = await pool.getConnection();
      await conn.query("SELECT 1");
      conn.release();

      console.log("[DB] ✓ MySQL connection pool established successfully.");
      return;
    } catch (err) {
      lastError = err;
      const elapsedMs = (attempt - 1) * retryDelayMs;
      console.warn(
        `[DB] Connection attempt ${attempt}/${retryAttempts} failed (${elapsedMs}ms elapsed): ${err.message}`,
      );

      if (attempt < retryAttempts) {
        const nextRetry = attempt * retryDelayMs;
        console.warn(`[DB] Retrying in ${nextRetry}ms...`);
        await new Promise((resolve) => setTimeout(resolve, nextRetry));
      }
    }
  }

  // Don't crash - log warning, frontend works without DB
  console.error(
    "[DB] ✗ MySQL unavailable. Rooms disabled until DB configured.",
  );
  console.error("[DB] Fix: Render Dashboard → New MySQL DB → Add env vars");
  console.error("[DB] Vars: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME");
}

// Run connection test on startup (non-blocking)
testConnection().catch(console.error);

// ────────────────────────────────────────────────────────────
// Error Handlers
// ────────────────────────────────────────────────────────────

/**
 * Handle pool errors (connection drops, etc.)
 */
pool.on("error", (err) => {
  console.error("[DB] Pool error:", err.message);
});

/**
 * Handle connection errors (individual query failures)
 */
pool.on("connection", (connection) => {
  connection.on("error", (err) => {
    if (err.code === "PROTOCOL_CONNECTION_LOST") {
      console.error("[DB] Connection lost - will retry.");
    } else {
      console.error("[DB] Connection error:", err.message);
    }
  });
});

module.exports = pool;
