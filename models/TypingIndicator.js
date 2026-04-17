"use strict";
/**
 * models/TypingIndicator.js
 * Data-access layer for the `typing_indicators` table.
 * Tracks who is currently typing in each room.
 */

const db = require("../config/db");

const TypingIndicator = {
  /**
   * Record that a user is typing in a room.
   * @param {number} roomId - FK to rooms.id
   * @param {string} nickname - User's nickname
   * @returns {object} Inserted or updated row
   */
  async markTyping(roomId, nickname) {
    // Upsert: if already typing, update expires_at; else insert
    await db.execute(
      `INSERT INTO typing_indicators (room_id, nickname, expires_at)
             VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 5 SECOND))
             ON DUPLICATE KEY UPDATE
                expires_at = DATE_ADD(NOW(), INTERVAL 5 SECOND),
                started_at = NOW()`,
      [roomId, nickname],
    );
  },

  /**
   * Get all users currently typing in a room.
   */
  async getTypersInRoom(roomId) {
    const [rows] = await db.execute(
      `SELECT nickname, started_at
             FROM typing_indicators
             WHERE room_id = ? AND expires_at > NOW()
             ORDER BY started_at ASC`,
      [roomId],
    );
    return rows;
  },

  /**
   * Remove a user from the typing list.
   */
  async stopTyping(roomId, nickname) {
    await db.execute(
      `DELETE FROM typing_indicators WHERE room_id = ? AND nickname = ?`,
      [roomId, nickname],
    );
  },

  /**
   * Clean up expired typing indicators.
   */
  async cleanupExpired() {
    await db.execute(`DELETE FROM typing_indicators WHERE expires_at <= NOW()`);
  },
};

module.exports = TypingIndicator;
