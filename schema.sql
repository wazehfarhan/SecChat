-- ============================================================
-- VanishChat Database Schema (v2)
-- Enhanced with: room passwords, typing indicators, read receipts
-- ============================================================
-- Drop existing tables (order matters due to FK constraints)
DROP TABLE IF EXISTS read_receipts;
DROP TABLE IF EXISTS typing_indicators;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS rooms;

-- ============================================================
-- ROOMS TABLE
-- Stores all chat room metadata
-- ============================================================
CREATE TABLE rooms (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    room_code           CHAR(6)      NOT NULL,              -- 6-char uppercase alphanumeric code
    type                ENUM('single','group') NOT NULL DEFAULT 'group',
    password_hash       VARCHAR(255) NULL,                  -- bcrypt hash of room password (optional)
    has_password        TINYINT(1)   NOT NULL DEFAULT 0,   -- 1 if password-protected
    expiry_preset       ENUM('5m','15m','1h','24h','custom') NOT NULL DEFAULT '1h', -- Expiry preset used
    created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at          DATETIME     NOT NULL,              -- Absolute expiry datetime
    is_active           TINYINT(1)   NOT NULL DEFAULT 1,    -- 0 = deleted/expired
    max_participants    INT UNSIGNED DEFAULT 50,            -- Soft limit on room size
    created_by_nickname VARCHAR(32)  NULL,                  -- Creator's nickname (for info only)
    CONSTRAINT uq_room_code UNIQUE (room_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Index for fast lookup by code (used on every join attempt)
CREATE INDEX idx_room_code ON rooms (room_code);

-- Index to efficiently find expired rooms during cleanup sweeps
CREATE INDEX idx_expires_at ON rooms (expires_at);

-- Index for finding active rooms
CREATE INDEX idx_is_active ON rooms (is_active);

-- ============================================================
-- MESSAGES TABLE
-- Stores chat messages linked to rooms
-- ============================================================
CREATE TABLE messages (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    room_id     INT UNSIGNED NOT NULL,
    nickname    VARCHAR(32)  NOT NULL,                 -- Anonymous display name
    content     TEXT         NOT NULL,                 -- Encrypted ciphertext (base64)
    iv          VARCHAR(64)  NOT NULL,                 -- AES-GCM IV (base64) for E2E decryption
    sent_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Foreign key: deleting a room cascades and removes all its messages
    CONSTRAINT fk_messages_room
        FOREIGN KEY (room_id) REFERENCES rooms(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Index for fast message retrieval by room
CREATE INDEX idx_messages_room_id ON messages (room_id);

-- Index for chronological message ordering
CREATE INDEX idx_messages_sent_at ON messages (sent_at DESC);

-- ============================================================
-- TYPING_INDICATORS TABLE
-- Real-time transient data: who is typing in which room
-- (Optional: could be handled entirely in-memory for performance)
-- ============================================================
CREATE TABLE typing_indicators (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    room_id             INT UNSIGNED NOT NULL,
    nickname            VARCHAR(32)  NOT NULL,    -- Who is typing
    started_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at          DATETIME     NOT NULL,    -- Auto-expire after 5 seconds

    CONSTRAINT fk_typing_room
        FOREIGN KEY (room_id) REFERENCES rooms(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    
    -- One typing indicator per nickname per room
    CONSTRAINT uq_typing_indicator UNIQUE (room_id, nickname)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Index for finding active typists in a room
CREATE INDEX idx_typing_room_id ON typing_indicators (room_id);

-- Index for cleaning up expired typing indicators
CREATE INDEX idx_typing_expires_at ON typing_indicators (expires_at);

-- ============================================================
-- READ_RECEIPTS TABLE
-- Tracks which users have read which messages
-- ============================================================
CREATE TABLE read_receipts (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    message_id      BIGINT UNSIGNED NOT NULL,
    nickname        VARCHAR(32) NOT NULL,         -- Who read the message
    read_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_receipt_message
        FOREIGN KEY (message_id) REFERENCES messages(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    
    -- Prevent duplicate read receipts
    CONSTRAINT uq_read_receipt UNIQUE (message_id, nickname)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Index for finding read receipts by message
CREATE INDEX idx_receipt_message_id ON read_receipts (message_id);

-- Index for finding user's read history
CREATE INDEX idx_receipt_nickname ON read_receipts (nickname);
