#!/usr/bin/env node
"use strict";
/**
 * scripts/reset-db.js
 * DANGER: Drops and recreates the database from scratch.
 * Use only for development/testing — this deletes ALL data!
 *
 * Usage: npm run db:reset
 */

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const mysql = require("mysql2/promise");

// ────────────────────────────────────────────────────────────
// Configuration
// ────────────────────────────────────────────────────────────
const DB_HOST = process.env.DB_HOST || "127.0.0.1";
const DB_PORT = parseInt(process.env.DB_PORT || "3306", 10);
const DB_USER = process.env.DB_USER || "root";
const DB_PASSWORD = process.env.DB_PASSWORD || "";
const DB_NAME = process.env.DB_NAME || "vanishchat";

// ────────────────────────────────────────────────────────────
// Confirmation prompt
// ────────────────────────────────────────────────────────────
async function confirmReset() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(
      `⚠️  WARNING: This will DELETE ALL DATA in database "${DB_NAME}".\n` +
        'Type "yes" to confirm: ',
      (answer) => {
        rl.close();
        resolve(answer === "yes");
      },
    );
  });
}

// ────────────────────────────────────────────────────────────
// Main reset logic
// ────────────────────────────────────────────────────────────
async function resetDatabase() {
  console.log("[Reset DB] Database reset tool");
  console.log(`[Reset DB] Target: ${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}`);

  // Confirm before proceeding
  const confirmed = await confirmReset();
  if (!confirmed) {
    console.log("[Reset DB] Reset cancelled.");
    process.exit(0);
  }

  let connection;
  try {
    // ── Connect to MySQL ──
    console.log("[Reset DB] Connecting to MySQL server...");
    connection = await mysql.createConnection({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
    });
    console.log("[Reset DB] ✓ Connected");

    // ── Drop existing database ──
    console.log(`[Reset DB] Dropping database "${DB_NAME}"...`);
    await connection.execute(`DROP DATABASE IF EXISTS \`${DB_NAME}\``);
    console.log("[Reset DB] ✓ Database dropped");

    // ── Create fresh database ──
    console.log(`[Reset DB] Creating database "${DB_NAME}"...`);
    await connection.execute(`CREATE DATABASE \`${DB_NAME}\``);
    await connection.execute(`USE \`${DB_NAME}\``);
    console.log("[Reset DB] ✓ Database created");

    // ── Load and execute schema ──
    console.log("[Reset DB] Loading schema.sql...");
    const schemaPath = path.join(__dirname, "..", "schema.sql");
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`schema.sql not found at ${schemaPath}`);
    }
    const schema = fs.readFileSync(schemaPath, "utf-8");

    console.log("[Reset DB] Executing schema...");
    const statements = schema
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith("--"));

    for (const statement of statements) {
      await connection.execute(statement);
    }

    console.log("[Reset DB] ✓ Schema applied");

    // ── Verify tables ──
    const [tables] = await connection.execute(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
             WHERE TABLE_SCHEMA = ?`,
      [DB_NAME],
    );

    console.log("[Reset DB] ✓ Tables created:");
    tables.forEach((t) => console.log(`         - ${t.TABLE_NAME}`));

    console.log("[Reset DB] ✓✓✓ Database reset complete!");
    process.exit(0);
  } catch (err) {
    console.error("[Reset DB] ✗ FATAL:", err.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// ────────────────────────────────────────────────────────────
// Run reset
// ────────────────────────────────────────────────────────────
resetDatabase().catch((err) => {
  console.error("[Reset DB] Unexpected error:", err);
  process.exit(1);
});
