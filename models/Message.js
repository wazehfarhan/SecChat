'use strict';
/**
 * models/Message.js
 * Data-access layer for the `messages` table.
 * NOTE: The server only ever stores/retrieves encrypted ciphertext.
 *       Plaintext never touches the server (E2E encryption via Web Crypto API).
 */

const db = require('../config/db');

const Message = {

    /**
     * Persist an encrypted message to the DB.
     * @param {number} roomId   - FK to rooms.id
     * @param {string} nickname - Sender's anonymous handle
     * @param {string} content  - AES-GCM encrypted ciphertext (base64)
     * @param {string} iv       - AES-GCM initialisation vector (base64)
     */
    async create(roomId, nickname, content, iv) {
        const [result] = await db.execute(
            `INSERT INTO messages (room_id, nickname, content, iv)
             VALUES (?, ?, ?, ?)`,
            [roomId, nickname, content, iv]
        );
        return result.insertId;
    },

    /**
     * Retrieve all messages for a room (for late joiners to catch up).
     * Messages are returned oldest-first.
     */
    async findByRoomId(roomId) {
        const [rows] = await db.execute(
            `SELECT id, nickname, content, iv, sent_at
             FROM messages
             WHERE room_id = ?
             ORDER BY sent_at ASC`,
            [roomId]
        );
        return rows;
    },

    /**
     * Delete all messages for a specific room.
     * Called explicitly during cleanup (though CASCADE also handles it).
     */
    async deleteByRoomId(roomId) {
        await db.execute(`DELETE FROM messages WHERE room_id = ?`, [roomId]);
    },
};

module.exports = Message;
