"use strict";
/**
 * controllers/roomController.js
 * Business logic for room creation and joining, including password-protected rooms.
 */

const Room = require("../models/Room");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

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
 * Hash a room password using bcrypt.
 * Uses cost factor from environment (default: 10).
 */
async function hashPassword(password) {
  const rounds = parseInt(process.env.BCRYPT_ROUNDS || "10", 10);
  return bcrypt.hash(password, rounds);
}

/**
 * Verify a password against its bcrypt hash.
 */
async function verifyPassword(plaintext, hash) {
  return bcrypt.compare(plaintext, hash);
}

/**
 * Expiry preset to milliseconds converter.
 */
function expiryPresetToMs(preset) {
  const presets = {
    "5m": 5 * 60 * 1000,
    "15m": 15 * 60 * 1000,
    "1h": 60 * 60 * 1000,
    "24h": 24 * 60 * 60 * 1000,
  };
  return presets[preset] || 60 * 60 * 1000; // Default 1h
}

/**
 * POST /api/rooms/create
 * Body: {
 *   type: 'single'|'group',
 *   expiryPreset: '5m'|'15m'|'1h'|'24h'|'custom',
 *   customExpiryMs?: number,
 *   password?: string,
 *   creatorNickname?: string
 * }
 */
async function createRoom(req, res) {
  try {
    const {
      type,
      expiryPreset = "1h",
      customExpiryMs,
      password,
      creatorNickname,
    } = req.body;

    // --- Validate type ---
    if (!["single", "group"].includes(type)) {
      return res
        .status(400)
        .json({ error: "Invalid room type. Must be 'single' or 'group'." });
    }

<<<<<<< HEAD
    // --- Compute expires_at ---
    const now = new Date();
    let expiresAt;

    if (expiryPreset === "custom") {
      if (!customExpiryMs || typeof customExpiryMs !== "number") {
        return res.status(400).json({
          error: "customExpiryMs required when expiryPreset is 'custom'.",
        });
      }
      // customExpiryMs is time in milliseconds from now
      if (customExpiryMs <= 0) {
        return res
          .status(400)
          .json({ error: "customExpiryMs must be positive." });
      }
      // Cap at 30 days to prevent abuse
      const maxMs = 30 * 24 * 60 * 60 * 1000;
      if (customExpiryMs > maxMs) {
        return res.status(400).json({
          error: "customExpiryMs cannot exceed 30 days.",
        });
      }
      expiresAt = new Date(now.getTime() + customExpiryMs);
    } else {
      const ms = expiryPresetToMs(expiryPreset);
      if (!ms) {
        return res.status(400).json({ error: "Invalid expiryPreset." });
      }
      expiresAt = new Date(now.getTime() + ms);
=======
    // --- Compute expires_at (store as local time) ---
    const now = new Date();
    let expiresAt;

    // Helper function to format Date as local datetime for MySQL
    function toLocalDatetime(date) {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      const h = String(date.getHours()).padStart(2, "0");
      const min = String(date.getMinutes()).padStart(2, "0");
      const s = String(date.getSeconds()).padStart(2, "0");
      return `${y}-${m}-${d} ${h}:${min}:${s}`;
    }

    switch (expiryType) {
      case "10m":
        expiresAt = toLocalDatetime(new Date(now.getTime() + 10 * 60 * 1000));
        break;
      case "1h":
        expiresAt = toLocalDatetime(new Date(now.getTime() + 60 * 60 * 1000));
        break;
      case "24h":
        expiresAt = toLocalDatetime(
          new Date(now.getTime() + 24 * 60 * 60 * 1000),
        );
        break;
      case "custom":
        if (!customExpiry) {
          return res.status(400).json({
            error: "customExpiry datetime required when expiryType is custom.",
          });
        }
        expiresAt = toLocalDatetime(new Date(customExpiry));
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
>>>>>>> ebbbac0 (Implement real-time typing indicator feature and fix timezone issues in room expiry)
    }

    // --- Hash password if provided ---
    let passwordHash = null;
    if (
      password &&
      typeof password === "string" &&
      password.trim().length > 0
    ) {
      // Validate password strength (min 4 chars for demo)
      if (password.length < 4) {
        return res.status(400).json({
          error: "Password must be at least 4 characters.",
        });
      }
      if (password.length > 64) {
        return res.status(400).json({
          error: "Password must not exceed 64 characters.",
        });
      }
      try {
        passwordHash = await hashPassword(password);
      } catch (err) {
        console.error(
          "[roomController.createRoom] Password hashing failed:",
          err,
        );
        return res
          .status(500)
          .json({ error: "Server error hashing password." });
      }
    }

    // --- Create room ---
    const roomCode = await generateUniqueCode();
    const room = await Room.create({
      roomCode,
      type,
      expiryPreset,
      expiresAt,
      passwordHash,
      creatorNickname: creatorNickname ? creatorNickname.slice(0, 32) : null,
    });

    return res.status(201).json({
      roomCode: room.room_code,
      type: room.type,
      expiresAt: room.expires_at,
      hasPassword: !!passwordHash,
      expiryPreset,
    });
  } catch (err) {
    console.error("[roomController.createRoom]", err);
    return res.status(500).json({ error: "Server error creating room." });
  }
}

/**
 * POST /api/rooms/join
 * Body: { roomCode: string, password?: string }
 * Returns room metadata if valid, not expired, and password (if protected) is correct.
 */
async function joinRoom(req, res) {
  try {
    const { roomCode, password } = req.body;

    if (!roomCode || typeof roomCode !== "string") {
      return res.status(400).json({ error: "roomCode is required." });
    }

    // Normalise: uppercase, strip whitespace
    const code = roomCode.trim().toUpperCase().slice(0, 6);

    if (!/^[A-Z0-9]{6}$/.test(code)) {
      return res.status(400).json({
        error: "Room code must be 6 uppercase alphanumeric characters.",
      });
    }

    const room = await Room.findByCode(code);

    if (!room) {
      return res.status(404).json({
        error: "Room not found. It may have expired or never existed.",
      });
    }

<<<<<<< HEAD
    // --- Check expiry ---
    if (new Date() >= new Date(room.expires_at + "Z")) {
=======
    // Check expiry (double-check in app layer, not just DB)
    // MySQL DATETIME stores local time, so don't add "Z"
    const now = new Date();
    const expiresAt = new Date(room.expires_at);

    if (now >= expiresAt) {
      // Trigger deletion immediately
>>>>>>> ebbbac0 (Implement real-time typing indicator feature and fix timezone issues in room expiry)
      await Room.deleteById(room.id);
      return res.status(410).json({
        error:
          "This session has expired and all messages have been permanently deleted.",
      });
    }

    // --- Check password if room is protected ---
    if (room.has_password) {
      if (!password || typeof password !== "string") {
        return res.status(403).json({
          error: "This room is password-protected. Password required.",
          requiresPassword: true,
        });
      }

      try {
        const passwordMatch = await verifyPassword(
          password,
          room.password_hash,
        );
        if (!passwordMatch) {
          return res.status(403).json({
            error: "Incorrect password.",
            requiresPassword: true,
          });
        }
      } catch (err) {
        console.error(
          "[roomController.joinRoom] Password verification failed:",
          err,
        );
        return res
          .status(500)
          .json({ error: "Server error verifying password." });
      }
    }

    return res.status(200).json({
      roomCode: room.room_code,
      type: room.type,
      expiresAt: room.expires_at,
      hasPassword: room.has_password,
      expiryPreset: room.expiry_preset,
    });
  } catch (err) {
    console.error("[roomController.joinRoom]", err);
    return res.status(500).json({ error: "Server error joining room." });
  }
}

module.exports = { createRoom, joinRoom, hashPassword, verifyPassword };
