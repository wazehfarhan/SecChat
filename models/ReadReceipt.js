"use strict";
/**
 * models/ReadReceipt.js
 * Data-access layer for the `read_receipts` table.
 * Tracks who has read which messages.
 */

const db = require("../config/db");

const ReadReceipt = {
  /**
   * Record that a user has read a message.
   * @param {number} messageId - FK to messages.id
   * @param {string} nickname - User's nickname
   */
  async markRead(messageId, nickname) {
    try {
      await db.execute(
        `INSERT INTO read_receipts (message_id, nickname, read_at)
                 VALUES (?, ?, NOW())
                 ON DUPLICATE KEY UPDATE read_at = NOW()`,
        [messageId, nickname],
      );
    } catch (err) {
      // Silently ignore duplicate key errors (already read)
      if (err.code !== "ER_DUP_ENTRY") {
        throw err;
      }
    }
  },

  /**
   * Get all read receipts for a message.
   * @param {number} messageId - FK to messages.id
   * @returns {array} Array of { nickname, read_at }
   */
  async getReadersForMessage(messageId) {
    const [rows] = await db.execute(
      `SELECT nickname, read_at
             FROM read_receipts
             WHERE message_id = ?
             ORDER BY read_at ASC`,
      [messageId],
    );
    return rows;
  },

  /**
   * Get all read receipts for a room's messages.
   * Used for bulk sync when user joins room.
   * @param {number} roomId - FK to rooms.id
   */
  async getReceiptsForRoom(roomId) {
    const [rows] = await db.execute(
      `SELECT m.id as message_id, r.nickname, r.read_at
             FROM read_receipts r
             JOIN messages m ON r.message_id = m.id
             WHERE m.room_id = ?
             ORDER BY r.read_at ASC`,
      [roomId],
    );
    return rows;
  },

  /**
   * Delete all read receipts for a message.
   * (Called when message is purged, though CASCADE handles it)
   */
  async deleteByMessageId(messageId) {
    await db.execute(`DELETE FROM read_receipts WHERE message_id = ?`, [
      messageId,
    ]);
  },
};

module.exports = ReadReceipt;
