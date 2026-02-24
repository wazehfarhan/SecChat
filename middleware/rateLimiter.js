'use strict';
/**
 * middleware/rateLimiter.js
 *
 * express-rate-limit configuration.
 * Applied only to room creation endpoint to prevent:
 *  - Flooding the DB with phantom rooms
 *  - Brute-force guessing of room codes
 *  - DoS via resource exhaustion
 */

const rateLimit = require('express-rate-limit');

const roomCreationLimiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 min
    max:      parseInt(process.env.RATE_LIMIT_MAX        || '10',    10),  // 10 rooms/window
    standardHeaders: true,  // Return RateLimit-* headers
    legacyHeaders:   false,
    message: {
        error: 'Too many rooms created from this IP. Please wait before creating another.'
    },
    // Use IP address as the key. In production behind a reverse proxy,
    // set app.set('trust proxy', 1) so req.ip reflects the real client IP.
    keyGenerator: (req) => req.ip,
});

module.exports = { roomCreationLimiter };
