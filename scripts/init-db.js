#!/usr/bin/env node
"use strict";
/**
 * scripts/init-db.js
 * Initializes the database schema from schema.sql
 *
 * Usage: npm run db:init
 *
 * This script:
 * 1. Reads schema.sql
 * 2. Connects to MySQL
 * 3. Executes the schema to create tables if they don't exist
 * 4. Exits with code 0 on success, 1 on failure
 */

require("dotenv").config();

const fs = require("fs");
const path = require("path");
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
// Main initialization logic
// ────────────────────────────────────────────────────────────
async function initializeDatabase() {
  console.log("[Init DB] Starting database initialization...");
  console.log(`[Init DB] Target: ${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}`);

  let connection;
  try {
    // ── Connect without specifying database (to create if not exists) ──
    console.log("[Init DB] Connecting to MySQL server...");
    connection = await mysql.createConnection({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
      multipleStatements: true, // Allow multiple statements in one query
    });
    console.log("[Init DB] ✓ Connected to MySQL server");

    // ── Create database if not exists ──
    console.log(`[Init DB] Creating database "${DB_NAME}" if not exists...`);
    await connection.execute(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\``);
    console.log(`[Init DB] ✓ Database "${DB_NAME}" ready`);

    // ── Switch to the target database ──
    await connection.execute(`USE \`${DB_NAME}\``);
    console.log(`[Init DB] ✓ Switched to database "${DB_NAME}"`);

    // ── Read schema.sql ──
    const schemaPath = path.join(__dirname, "..", "schema.sql");
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`schema.sql not found at ${schemaPath}`);
    }
    const schema = fs.readFileSync(schemaPath, "utf-8");
    console.log("[Init DB] ✓ Loaded schema.sql");

    // ── Execute schema ──
    console.log("[Init DB] Creating/updating tables...");

    // Split by semicolon and filter out comments and empty statements
    const statements = schema
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith("--"));

    for (const statement of statements) {
      try {
        await connection.execute(statement);
      } catch (err) {
        // Log but continue on non-fatal errors (e.g., table already exists)
        if (err.code !== "ER_TABLE_EXISTS_ERROR") {
          console.warn(`[Init DB] Warning: ${err.message}`);
        }
      }
    }
    console.log("[Init DB] ✓ Schema applied successfully");

    // ── Verify tables exist ──
    const [tables] = await connection.execute(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
             WHERE TABLE_SCHEMA = ?`,
      [DB_NAME],
    );

    const expectedTables = [
      "rooms",
      "messages",
      "typing_indicators",
      "read_receipts",
    ];
    const createdTables = tables.map((t) => t.TABLE_NAME);
    const allPresent = expectedTables.every((t) => createdTables.includes(t));

    if (!allPresent) {
      console.warn("[Init DB] Warning: Some tables may be missing");
      console.warn("[Init DB] Expected:", expectedTables);
      console.warn("[Init DB] Found:", createdTables);
    } else {
      console.log("[Init DB] ✓ All required tables verified:");
      expectedTables.forEach((t) => console.log(`         - ${t}`));
    }

    console.log("[Init DB] ✓ Database initialization complete!");
    process.exit(0);
  } catch (err) {
    console.error("[Init DB] ✗ FATAL:", err.message);
    console.error("[Init DB] Setup failed. Please check:");
    console.error("   1. MySQL server is running");
    console.error("   2. DB_HOST, DB_USER, DB_PASSWORD in .env are correct");
    console.error("   3. User has CREATE DATABASE privilege");
    console.error("   4. schema.sql file exists");
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// ────────────────────────────────────────────────────────────
// Run initialization
// ────────────────────────────────────────────────────────────
initializeDatabase().catch((err) => {
  console.error("[Init DB] Unexpected error:", err);
  process.exit(1);
});
