"use strict";
/**
 * controllers/roomController.js
 * Business logic for room creation and joining.
 */

const Room = require("../models/Room");
const crypto = require("crypto");

/**
 * Generate a unique 6-character uppercase alphanumeric room code.
 * Retries up to 5 times to avoid (astronomically rare) collisions.
 * Character set: A-Z 0-9 (36^6 = ~2.17 billion combinations)
 */
async function generateUniqueCode() {
  const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const LENGTH = 6;
  for (let attempt = 0; attempt < 5; attempt++) {
    // crypto.randomBytes is cryptographically secure — better than Math.random()
    const bytes = crypto.randomBytes(LENGTH);
    let code = "";
    for (let i = 0; i < LENGTH; i++) {
      code += CHARS[bytes[i] % CHARS.length];
    }
    // Check uniqueness
    const existing = await Room.findByCode(code);
    if (!existing) return code;
  }
  throw new Error("Failed to generate a unique room code after 5 attempts.");
}

/**
 * POST /api/rooms/create
 * Body: { type: 'single'|'group', expiryType: '10m'|'1h'|'24h'|'custom', customExpiry?: ISO string }
 */
async function createRoom(req, res) {
  try {
    const { type, expiryType, customExpiry } = req.body;

    // --- Validate type ---
    if (!["single", "group"].includes(type)) {
      return res
        .status(400)
        .json({ error: "Invalid room type. Must be single or group." });
    }

    // --- Compute expires_at (store as UTC) ---
    const now = new Date();
    let expiresAt;

    switch (expiryType) {
      case "10m":
        expiresAt = new Date(now.getTime() + 10 * 60 * 1000)
          .toISOString()
          .slice(0, 19)
          .replace("T", " ");
        break;
      case "1h":
        expiresAt = new Date(now.getTime() + 60 * 60 * 1000)
          .toISOString()
          .slice(0, 19)
          .replace("T", " ");
        break;
      case "24h":
        expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 19)
          .replace("T", " ");
        break;
      case "custom":
        if (!customExpiry) {
          return res.status(400).json({
            error: "customExpiry datetime required when expiryType is custom.",
          });
        }
        expiresAt = new Date(customExpiry)
          .toISOString()
          .slice(0, 19)
          .replace("T", " ");
        if (isNaN(new Date(customExpiry).getTime())) {
          return res
            .status(400)
            .json({ error: "Invalid customExpiry datetime format." });
        }
        // Must be in the future
        if (new Date(customExpiry) <= now) {
          return res
            .status(400)
            .json({ error: "customExpiry must be in the future." });
        }
        // Cap at 30 days to prevent abuse
        const maxExpiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        if (new Date(customExpiry) > maxExpiry) {
          return res.status(400).json({
            error: "customExpiry cannot be more than 30 days in the future.",
          });
        }
        break;
      default:
        return res.status(400).json({ error: "Invalid expiryType." });
    }

    const roomCode = await generateUniqueCode();
    const room = await Room.create(roomCode, type, expiresAt);

    return res.status(201).json({
      roomCode: room.room_code,
      type: room.type,
      expiresAt: room.expires_at,
    });
  } catch (err) {
    console.error("[roomController.createRoom]", err);
    return res.status(500).json({ error: "Server error creating room." });
  }
}

/**
 * POST /api/rooms/join
 * Body: { roomCode: string }
 * Returns room metadata if valid and not expired.
 */
async function joinRoom(req, res) {
  try {
    const { roomCode } = req.body;

    if (!roomCode || typeof roomCode !== "string") {
      return res.status(400).json({ error: "roomCode is required." });
    }

    // Normalise: uppercase, strip whitespace, limit to 6 chars
    const code = roomCode.trim().toUpperCase().slice(0, 6);

    if (!/^[A-Z0-9]{6}$/.test(code)) {
      return res.status(400).json({
        error: "Room code must be 6 uppercase alphanumeric characters.",
      });
    }

    const room = await Room.findByCode(code);

    if (!room) {
      // Room doesn't exist OR was already cleaned up
      return res.status(404).json({
        error: "Room not found. It may have expired or never existed.",
      });
    }

    // Check expiry (double-check in app layer, not just DB)
    // Compare as UTC timestamps to avoid timezone issues
    if (new Date() >= new Date(room.expires_at + "Z")) {
      // Trigger deletion immediately
      await Room.deleteById(room.id);
      return res.status(410).json({
        error:
          "This session has expired and all messages have been permanently deleted.",
      });
    }

    return res.status(200).json({
      roomCode: room.room_code,
      type: room.type,
      expiresAt: room.expires_at,
    });
  } catch (err) {
    console.error("[roomController.joinRoom]", err);
    return res.status(500).json({ error: "Server error joining room." });
  }
}

module.exports = { createRoom, joinRoom };
