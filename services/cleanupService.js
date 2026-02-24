'use strict';
/**
 * services/cleanupService.js
 *
 * EXPIRY MECHANISM — How it works:
 * ─────────────────────────────────
 * 1. A setInterval runs every CLEANUP_INTERVAL_MS (default: 60 seconds).
 * 2. It calls Room.findExpired() which queries:
 *      SELECT id, room_code FROM rooms WHERE expires_at <= NOW() AND is_active = 1
 * 3. For each expired room it:
 *    a. Calls io.to(roomCode).emit('room:expired') — pushes a Socket.IO event
 *       to every connected client in that room.
 *    b. Calls io.in(roomCode).socketsLeave(roomCode) — forcibly removes all
 *       sockets from the Socket.IO room (disconnects them from the channel).
 *    c. Deletes the room row (CASCADE deletes all messages automatically).
 * 4. No data survives — MySQL CASCADE ensures messages are gone the instant
 *    the room row is deleted.
 *
 * ACCURACY NOTE:
 * ──────────────
 * The timer fires every 60 s so a room might live up to 60 s past expires_at.
 * For tighter accuracy reduce CLEANUP_INTERVAL_MS (e.g. 10000 for 10 s),
 * but this adds more DB queries. For production, a Redis TTL + keyspace
 * notifications approach is more efficient (see scaling notes in README).
 */

const Room = require('../models/Room');

let cleanupInterval = null;

/**
 * Start the background cleanup loop.
 * @param {import('socket.io').Server} io - Socket.IO server instance
 */
function startCleanup(io) {
    const intervalMs = parseInt(process.env.CLEANUP_INTERVAL_MS || '60000', 10);

    console.log(`[Cleanup] Starting expired-room sweep every ${intervalMs / 1000}s`);

    cleanupInterval = setInterval(async () => {
        try {
            const expiredRooms = await Room.findExpired();

            if (expiredRooms.length === 0) return; // Nothing to do

            console.log(`[Cleanup] Found ${expiredRooms.length} expired room(s). Deleting...`);

            for (const room of expiredRooms) {
                // 1. Notify all clients in this Socket.IO room
                io.to(room.room_code).emit('room:expired', {
                    message: 'This session has expired. All messages have been permanently deleted.',
                });

                // 2. Force all sockets out of this Socket.IO room
                //    (They remain connected to the server but lose the room channel)
                const socketsInRoom = await io.in(room.room_code).fetchSockets();
                for (const socket of socketsInRoom) {
                    socket.leave(room.room_code);
                }

                // 3. Hard-delete room (CASCADE deletes messages)
                await Room.deleteById(room.id);
                console.log(`[Cleanup] Deleted room ${room.room_code}`);
            }
        } catch (err) {
            // Log but don't crash the interval — next tick will retry
            console.error('[Cleanup] Error during sweep:', err.message);
        }
    }, intervalMs);

    // Allow Node to exit cleanly even if interval is pending
    if (cleanupInterval.unref) cleanupInterval.unref();
}

/**
 * Stop the cleanup loop (used in graceful shutdown).
 */
function stopCleanup() {
    if (cleanupInterval) {
        clearInterval(cleanupInterval);
        cleanupInterval = null;
        console.log('[Cleanup] Sweep stopped.');
    }
}

module.exports = { startCleanup, stopCleanup };
