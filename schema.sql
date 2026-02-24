-- ============================================================
-- VanishChat Database Schema
-- ============================================================
-- Drop existing tables (order matters due to FK constraints)
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS rooms;

-- ============================================================
-- ROOMS TABLE
-- Stores all chat room metadata
-- ============================================================
CREATE TABLE rooms (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    room_code   CHAR(6)      NOT NULL,           -- 6-char uppercase alphanumeric code
    type        ENUM('single','group') NOT NULL DEFAULT 'group',
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at  DATETIME     NOT NULL,            -- Absolute expiry datetime
    is_active   TINYINT(1)   NOT NULL DEFAULT 1, -- 0 = deleted/expired
    CONSTRAINT uq_room_code UNIQUE (room_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Index for fast lookup by code (used on every join attempt)
CREATE INDEX idx_room_code ON rooms (room_code);

-- Index to efficiently find expired rooms during cleanup sweeps
CREATE INDEX idx_expires_at ON rooms (expires_at);

-- ============================================================
-- MESSAGES TABLE
-- Stores chat messages linked to rooms
-- ============================================================
CREATE TABLE messages (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    room_id     INT UNSIGNED NOT NULL,
    nickname    VARCHAR(32)  NOT NULL,            -- Anonymous display name
    content     TEXT         NOT NULL,            -- Encrypted ciphertext (base64)
    iv          VARCHAR(64)  NOT NULL,            -- AES-GCM IV (base64) for E2E decryption
    sent_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Foreign key: deleting a room cascades and removes all its messages
    CONSTRAINT fk_messages_room
        FOREIGN KEY (room_id) REFERENCES rooms(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Index for fast message retrieval by room
CREATE INDEX idx_messages_room_id ON messages (room_id);
