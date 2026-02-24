'use strict';
/**
 * routes/rooms.js
 * HTTP endpoints for room lifecycle (create / join).
 * Real-time chat is handled entirely via Socket.IO (see server.js).
 */

const express               = require('express');
const router                = express.Router();
const { createRoom, joinRoom } = require('../controllers/roomController');
const { roomCreationLimiter }  = require('../middleware/rateLimiter');

// POST /api/rooms/create   — rate-limited
router.post('/create', roomCreationLimiter, createRoom);

// POST /api/rooms/join
router.post('/join', joinRoom);

module.exports = router;
