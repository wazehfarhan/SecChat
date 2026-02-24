'use strict';
/**
 * models/Room.js
 * Data-access layer for the `rooms` table.
 * All raw SQL lives here; controllers never touch SQL directly.
 */

const db = require('../config/db');

const Room = {

    /**
     * Create a new room.
     * @param {string} roomCode  - 6-char uppercase alphanumeric
     * @param {string} type      - 'single' | 'group'
     * @param {Date}   expiresAt - JS Date object for expiry
     * @returns {object} Inserted row data
     */
    async create(roomCode, type, expiresAt) {
        // Parameterised query prevents SQL injection
        const [result] = await db.execute(
            `INSERT INTO rooms (room_code, type, expires_at)
             VALUES (?, ?, ?)`,
            [roomCode, type, expiresAt]
        );
        return { id: result.insertId, room_code: roomCode, type, expires_at: expiresAt };
    },

    /**
     * Find a room by its 6-char code.
     * Returns null if not found or already marked inactive.
     */
    async findByCode(roomCode) {
        const [rows] = await db.execute(
            `SELECT id, room_code, type, created_at, expires_at, is_active
             FROM rooms
             WHERE room_code = ? AND is_active = 1
             LIMIT 1`,
            [roomCode]
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
             WHERE expires_at <= NOW() AND is_active = 1`
        );
        return rows;
    },

    /**
     * Hard-delete a room by its primary key.
     * The CASCADE FK on messages will delete all associated messages automatically.
     */
    async deleteById(roomId) {
        await db.execute(`DELETE FROM rooms WHERE id = ?`, [roomId]);
    },

    /**
     * Batch hard-delete multiple rooms (used by cleanup job).
     */
    async deleteManyByIds(ids) {
        if (!ids || ids.length === 0) return;
        // Build IN (?, ?, ?) placeholders dynamically
        const placeholders = ids.map(() => '?').join(',');
        await db.execute(
            `DELETE FROM rooms WHERE id IN (${placeholders})`,
            ids
        );
    },
};

module.exports = Room;
