"use strict";
/**
 * server.js — VanishChat entry point
 *
 * Responsibilities:
 *  - Bootstrap Express + Socket.IO
 *  - Mount middleware (CORS, rate-limit, sanitize, helmet)
 *  - Mount HTTP routes
 *  - Handle all real-time Socket.IO events
 *  - Start the expiry cleanup service
 *  - Graceful shutdown handler
 */

require("dotenv").config(); // Load .env before anything else

const fs = require("fs");
const http = require("http");
// const https      = require('https'); // Uncomment for production TLS
const path = require("path");
const express = require("express");
const { Server } = require("socket.io");
const helmet = require("helmet");
const cors = require("cors");
const xss = require("xss");

const roomRoutes = require("./routes/rooms");
const sanitizeBody = require("./middleware/sanitize");
const { startCleanup, stopCleanup } = require("./services/cleanupService");
const Room = require("./models/Room");
const Message = require("./models/Message");

// ────────────────────────────────────────────────────────────
// App & Server setup
// ────────────────────────────────────────────────────────────
const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

// ── HTTPS (production) ──────────────────────────────────────
// const tlsOptions = {
//     key:  fs.readFileSync(process.env.SSL_KEY_PATH),
//     cert: fs.readFileSync(process.env.SSL_CERT_PATH),
// };
// const server = https.createServer(tlsOptions, app);

const server = http.createServer(app); // Development: plain HTTP

// ────────────────────────────────────────────────────────────
// Socket.IO
// ────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin:
      process.env.NODE_ENV === "production"
        ? "https://yourdomain.com" // Replace with your actual domain
        : "*",
    methods: ["GET", "POST"],
  },
  // Prevent enormous payloads from crashing the server
  maxHttpBufferSize: 1e6, // 1 MB
});

// ────────────────────────────────────────────────────────────
// Express Middleware (order matters)
// ────────────────────────────────────────────────────────────

// Security headers (CSP, HSTS, etc.)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"], // Inline JS in views
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'", "ws:", "wss:"], // Allow WebSocket
      },
    },
  }),
);

// Trust proxy (required for accurate req.ip behind Nginx/load balancer)
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

app.use(cors());
app.use(express.json({ limit: "50kb" })); // Limit request body size
app.use(express.urlencoded({ extended: false }));
app.use(sanitizeBody); // Strip XSS from all body fields

// Serve static files (CSS, client JS, images)
app.use(express.static(path.join(__dirname, "public")));

// ────────────────────────────────────────────────────────────
// HTTP Routes
// ────────────────────────────────────────────────────────────
app.use("/api/rooms", roomRoutes);

// Serve the single-page app shell for all non-API routes
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ────────────────────────────────────────────────────────────
// In-memory room participant tracking
// Tracks socket IDs per room for single-room enforcement
// Structure: Map<roomCode, Set<socketId>>
// ────────────────────────────────────────────────────────────
const roomParticipants = new Map();

// ────────────────────────────────────────────────────────────
// Socket.IO Event Handlers
// ────────────────────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);

  // Track which room this socket is in (for cleanup on disconnect)
  socket.currentRoom = null;
  socket.nickname = null;

  /**
   * EVENT: chat:join
   * Client sends this after verifying the room via HTTP API.
   * Payload: { roomCode, nickname }
   */
  socket.on("chat:join", async ({ roomCode, nickname } = {}) => {
    try {
      // --- Input validation ---
      if (!roomCode || typeof roomCode !== "string") return;
      if (!nickname || typeof nickname !== "string") return;

      const code = xss(roomCode.trim().toUpperCase().slice(0, 6));
      const cleanNick = xss(nickname.trim().slice(0, 32));

      if (!/^[A-Z0-9]{6}$/.test(code)) return;
      if (!cleanNick || cleanNick.length < 1) return;

      // --- Verify room still exists and hasn't expired ---
      const room = await Room.findByCode(code);
      if (!room) {
        socket.emit("error:room", { message: "Room not found or expired." });
        return;
      }
      if (new Date() >= new Date(room.expires_at + "Z")) {
        await Room.deleteById(room.id);
        socket.emit("room:expired", { message: "Room has expired." });
        return;
      }

      // --- Single-room: max 2 participants ---
      if (room.type === "single") {
        const participants = roomParticipants.get(code) || new Set();
        if (participants.size >= 2 && !participants.has(socket.id)) {
          socket.emit("error:room", {
            message: "This private room is full (max 2 users).",
          });
          return;
        }
      }

      // --- Join Socket.IO room ---
      socket.join(code);
      socket.currentRoom = code;
      socket.nickname = cleanNick;
      socket.roomId = room.id;

      // Track participant
      if (!roomParticipants.has(code)) roomParticipants.set(code, new Set());
      roomParticipants.get(code).add(socket.id);

      // --- Send message history to the joining client ---
      const history = await Message.findByRoomId(room.id);
      socket.emit("chat:history", { messages: history });

      // --- Notify everyone else in the room ---
      socket.to(code).emit("chat:system", {
        text: `${cleanNick} joined the room.`,
        ts: new Date().toISOString(),
      });

      // --- Confirm join to the joining client ---
      socket.emit("chat:joined", {
        roomCode: code,
        type: room.type,
        expiresAt: room.expires_at,
        nickname: cleanNick,
      });

      console.log(`[Socket] ${cleanNick} (${socket.id}) joined room ${code}`);
    } catch (err) {
      console.error("[Socket] chat:join error:", err.message);
      socket.emit("error:room", { message: "Failed to join room." });
    }
  });

  /**
   * EVENT: chat:message
   * Client sends encrypted message content + IV.
   * Server stores ciphertext only and broadcasts to room.
   * Payload: { content: string (base64 ciphertext), iv: string (base64 IV) }
   */
  socket.on("chat:message", async ({ content, iv } = {}) => {
    try {
      if (!socket.currentRoom || !socket.nickname) return;

      // Validate
      if (!content || typeof content !== "string") return;
      if (!iv || typeof iv !== "string") return;
      if (content.length > 65536) return; // 64 KB max ciphertext

      // Sanitise (though ciphertext is base64, belt-and-suspenders)
      const cleanContent = xss(content.trim());
      const cleanIv = xss(iv.trim());

      // Verify room is still live
      const room = await Room.findByCode(socket.currentRoom);
      if (!room) {
        socket.emit("room:expired", { message: "Room no longer exists." });
        return;
      }

      // Persist encrypted message
      const msgId = await Message.create(
        socket.roomId,
        socket.nickname,
        cleanContent,
        cleanIv,
      );

      // Broadcast to ALL clients in the room (including sender)
      io.to(socket.currentRoom).emit("chat:message", {
        id: msgId,
        nickname: socket.nickname,
        content: cleanContent, // Still encrypted — decryption happens client-side
        iv: cleanIv,
        ts: new Date().toISOString(),
      });
    } catch (err) {
      console.error("[Socket] chat:message error:", err.message);
    }
  });

  /**
   * EVENT: disconnect
   * Fires automatically when a client disconnects (tab close, network drop, etc.)
   */
  socket.on("disconnect", () => {
    const code = socket.currentRoom;
    if (code) {
      // Remove from participant tracker
      const participants = roomParticipants.get(code);
      if (participants) {
        participants.delete(socket.id);
        if (participants.size === 0) roomParticipants.delete(code);
      }

      // Notify remaining users
      if (socket.nickname) {
        socket.to(code).emit("chat:system", {
          text: `${socket.nickname} left the room.`,
          ts: new Date().toISOString(),
        });
      }
    }
    console.log(`[Socket] Disconnected: ${socket.id}`);
  });
});

// ────────────────────────────────────────────────────────────
// Start server
// ────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`[Server] VanishChat running on http://localhost:${PORT}`);
  startCleanup(io); // Begin background expiry sweep
});

// ────────────────────────────────────────────────────────────
// Graceful shutdown
// ────────────────────────────────────────────────────────────
function gracefulShutdown(signal) {
  console.log(`\n[Server] Received ${signal}. Shutting down gracefully...`);
  stopCleanup();
  server.close(() => {
    console.log("[Server] HTTP server closed.");
    process.exit(0);
  });
  // Force exit if graceful shutdown hangs
  setTimeout(() => process.exit(1), 10000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
