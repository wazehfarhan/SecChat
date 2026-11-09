"use strict";
/**
 * models/Room.js
 * Data-access layer for the `rooms` table.
 * All raw SQL lives here; controllers never touch SQL directly.
 */

const db = require("../config/db");

const Room = {
  /**
<<<<<<< HEAD
   * Create a new room with optional password protection.
   * @param {object} options - Room options
   * @param {string} options.roomCode - 6-char uppercase alphanumeric
   * @param {string} options.type - 'single' | 'group'
   * @param {Date} options.expiresAt - JS Date object for expiry
   * @param {string} options.expiryPreset - '5m' | '15m' | '1h' | '24h' | 'custom'
   * @param {string} options.passwordHash - bcrypt hash of room password (optional)
   * @param {string} options.creatorNickname - Nickname of room creator (optional)
   * @returns {object} Inserted row data
   */
  async create(options) {
    const {
      roomCode,
      type = "group",
      expiresAt,
      expiryPreset = "1h",
      passwordHash = null,
      creatorNickname = null,
    } = options;

    const hasPassword = passwordHash ? 1 : 0;

    const [result] = await db.execute(
      `INSERT INTO rooms (
                room_code, type, created_at, expires_at, is_active,
                expiry_preset, password_hash, has_password, created_by_nickname
            ) VALUES (?, ?, NOW(), ?, 1, ?, ?, ?, ?)`,
      [
        roomCode,
        type,
        expiresAt,
        expiryPreset,
        passwordHash,
        hasPassword,
        creatorNickname,
      ],
    );

    return {
      id: result.insertId,
      room_code: roomCode,
      type,
      expires_at: expiresAt,
      expiry_preset: expiryPreset,
      has_password: !!passwordHash,
    };
  },

  /**
   * Find a room by its 6-char code (including password hash if set).
=======
   * Create a new room.
   * @param {string} roomCode  - 6-char uppercase alphanumeric
   * @param {string} type      - 'single' | 'group'
   * @param {string} expiryInterval - MySQL interval like '10 MINUTE', '1 HOUR', '24 HOUR'
   * @returns {object} Inserted row data
   */
  async create(roomCode, type, expiryInterval) {
    // Use MySQL to calculate expiry time to avoid timezone issues
    const [result] = await db.execute(
      `INSERT INTO rooms (room_code, type, expires_at)
             VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ?))`,
      [roomCode, type, expiryInterval],
    );

    // Fetch the created room to get the actual expires_at
    const [rows] = await db.execute(
      `SELECT id, room_code, type, created_at, expires_at, is_active
             FROM rooms WHERE id = ?`,
      [result.insertId],
    );
    return rows[0];
  },

  /**
   * Find a room by its 6-char code.
>>>>>>> ebbbac0 (Implement real-time typing indicator feature and fix timezone issues in room expiry)
   * Returns null if not found or already marked inactive.
   */
  async findByCode(roomCode) {
    const [rows] = await db.execute(
<<<<<<< HEAD
      `SELECT id, room_code, type, created_at, expires_at, is_active,
                    expiry_preset, password_hash, has_password, max_participants
=======
      `SELECT id, room_code, type, created_at, expires_at, is_active
>>>>>>> ebbbac0 (Implement real-time typing indicator feature and fix timezone issues in room expiry)
             FROM rooms
             WHERE room_code = ? AND is_active = 1
             LIMIT 1`,
      [roomCode],
    );
    return rows[0] || null;
  },

  /**
   * Find all rooms whose expiry has passed (used by cleanup job).
   */
  async findExpired() {
    const [rows] = await db.execute(
      `SELECT id, room_code
             FROM rooms
             WHERE expires_at <= NOW() AND is_active = 1`,
    );
    return rows;
  },

  /**
<<<<<<< HEAD
   * Get room count for statistics.
   */
  async getStats() {
    const [stats] = await db.execute(
      `SELECT 
                COUNT(*) as total_rooms,
                SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_rooms,
                SUM(CASE WHEN has_password = 1 THEN 1 ELSE 0 END) as protected_rooms
             FROM rooms`,
    );
    return stats[0] || { total_rooms: 0, active_rooms: 0, protected_rooms: 0 };
  },

  /**
   * Hard-delete a room by its primary key.
   * The CASCADE FK on messages, typing_indicators, read_receipts will delete associated records.
   */
  async deleteById(roomId) {
    await db.execute(`DELETE FROM rooms WHERE id = ?`, [roomId]);
  },

  /**
=======
   * Hard-delete a room by its primary key.
   * The CASCADE FK on messages will delete all associated messages automatically.
   */
  async deleteById(roomId) {
    await db.execute(`DELETE FROM rooms WHERE id = ?`, [roomId]);
  },

  /**
>>>>>>> ebbbac0 (Implement real-time typing indicator feature and fix timezone issues in room expiry)
   * Batch hard-delete multiple rooms (used by cleanup job).
   */
  async deleteManyByIds(ids) {
    if (!ids || ids.length === 0) return;
<<<<<<< HEAD
=======
    // Build IN (?, ?, ?) placeholders dynamically
>>>>>>> ebbbac0 (Implement real-time typing indicator feature and fix timezone issues in room expiry)
    const placeholders = ids.map(() => "?").join(",");
    await db.execute(`DELETE FROM rooms WHERE id IN (${placeholders})`, ids);
  },
};

module.exports = Room;
