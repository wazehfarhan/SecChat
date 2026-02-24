'use strict';
/**
 * middleware/sanitize.js
 *
 * Express middleware that strips XSS vectors from req.body fields.
 * We use the `xss` package which HTML-encodes dangerous characters
 * (<, >, ", ', &) and removes event-handler attributes.
 *
 * Why here AND in the frontend?
 *  - Frontend sanitisation is UX (immediate feedback).
 *  - Backend sanitisation is security (we never trust the client).
 */

const xss = require('xss');

/**
 * Recursively sanitise every string value in an object.
 * Handles nested objects and arrays.
 */
function sanitizeObject(obj) {
    if (typeof obj === 'string') return xss(obj.trim());
    if (Array.isArray(obj))     return obj.map(sanitizeObject);
    if (obj && typeof obj === 'object') {
        const clean = {};
        for (const [key, val] of Object.entries(obj)) {
            clean[key] = sanitizeObject(val);
        }
        return clean;
    }
    return obj; // numbers, booleans, null — pass through untouched
}

/**
 * Express middleware: sanitises req.body before it reaches route handlers.
 */
function sanitizeBody(req, _res, next) {
    if (req.body && typeof req.body === 'object') {
        req.body = sanitizeObject(req.body);
    }
    next();
}

module.exports = sanitizeBody;
