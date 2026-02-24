# 🔥 VanishChat — Ephemeral Encrypted Chat

> Secret, anonymous, code-based rooms that self-destruct. No logs. No traces.

---

## 📁 Project Structure

```
vanishchat/
├── server.js                  # Entry point — Express + Socket.IO bootstrap
├── package.json
├── schema.sql                 # Database schema
├── .env.example               # Environment variable template
│
├── config/
│   └── db.js                  # MySQL connection pool
│
├── routes/
│   └── rooms.js               # HTTP route definitions
│
├── controllers/
│   └── roomController.js      # Room creation & join business logic
│
├── models/
│   ├── Room.js                # rooms table queries
│   └── Message.js             # messages table queries
│
├── middleware/
│   ├── sanitize.js            # XSS sanitisation of req.body
│   └── rateLimiter.js         # express-rate-limit config
│
├── services/
│   └── cleanupService.js      # Background expiry sweep (setInterval)
│
└── public/
    ├── index.html             # Single-page app shell
    ├── css/
    │   └── style.css          # Dark-theme stylesheet
    └── js/
        ├── crypto.js          # Web Crypto API — AES-GCM E2E encryption
        └── app.js             # Client-side application logic
```

---

## 🚀 Setup Instructions

### Prerequisites

- **Node.js** v18 or later — https://nodejs.org
- **MySQL** 8.0 or later — https://dev.mysql.com/downloads/

### Step 1 — Clone / Download the project

```bash
git clone https://github.com/yourname/vanishchat.git
cd vanishchat
```

### Step 2 — Install dependencies

```bash
npm install
```

This installs:
| Package              | Purpose                                      |
|----------------------|----------------------------------------------|
| `express`            | HTTP server and routing                      |
| `socket.io`          | WebSocket real-time communication            |
| `mysql2`             | MySQL driver (promise-based)                 |
| `dotenv`             | Load environment variables from `.env`       |
| `helmet`             | HTTP security headers (CSP, HSTS, etc.)      |
| `cors`               | Cross-Origin Resource Sharing                |
| `express-rate-limit` | Throttle room creation per IP                |
| `xss`                | Sanitise user input against XSS attacks      |
| `nodemon` (dev)      | Auto-restart on file changes during dev      |

### Step 3 — Create the MySQL database and user

```sql
-- Run these in your MySQL client (e.g. mysql -u root -p)
CREATE DATABASE vanishchat CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'vanishchat_user'@'localhost' IDENTIFIED BY 'your_strong_password';
GRANT ALL PRIVILEGES ON vanishchat.* TO 'vanishchat_user'@'localhost';
FLUSH PRIVILEGES;
```

### Step 4 — Apply the database schema

```bash
mysql -u vanishchat_user -p vanishchat < schema.sql
```

### Step 5 — Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in your values:

```env
PORT=3000
NODE_ENV=development
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=vanishchat_user
DB_PASSWORD=your_strong_password
DB_NAME=vanishchat
SESSION_SECRET=generate_64_char_hex_here
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=10
CLEANUP_INTERVAL_MS=60000
```

Generate a session secret:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### Step 6 — Start the server

**Development (with auto-reload):**
```bash
npm run dev
```

**Production:**
```bash
npm start
```

Open your browser at: **http://localhost:3000**

---

## 🔐 End-to-End Encryption — How it Works

1. When you **create a room**, the browser generates a random 256-bit AES-GCM key using `window.crypto.subtle.generateKey()`.

2. That key is **base64url-encoded** and appended to the share URL as a **hash fragment**:
   ```
   https://yourdomain.com/?join=A3B9CX#<base64url-key>
   ```

3. The hash fragment is **never sent to the server** (it's a browser-side-only concept per HTTP spec). The server only ever receives and stores the encrypted ciphertext and per-message IV.

4. Everyone who joins via the full share URL extracts the key from `location.hash`, imports it, and uses it locally to **encrypt before sending** and **decrypt after receiving**.

5. AES-GCM provides **authenticated encryption** — any tampering with stored ciphertext will cause decryption to fail and throw a `DOMException`.

---

## ⏱ Expiry Mechanism — How it Works

```
         Server starts
               │
               ▼
    cleanupService.startCleanup(io)
               │
         setInterval fires
         every 60 seconds
               │
               ▼
    Room.findExpired()  ──── SELECT WHERE expires_at <= NOW()
               │
    For each expired room:
               │
     ┌─────────▼──────────┐
     │  io.to(code).emit  │  ← Tell all clients "room:expired"
     │  ('room:expired')  │
     └─────────┬──────────┘
               │
     ┌─────────▼──────────┐
     │  socket.leave(code)│  ← Disconnect clients from channel
     └─────────┬──────────┘
               │
     ┌─────────▼──────────┐
     │  Room.deleteById() │  ← DELETE FROM rooms (CASCADE kills messages)
     └────────────────────┘
```

- Rooms can expire **up to `CLEANUP_INTERVAL_MS`** (60s by default) after their `expires_at`.
- The HTTP join endpoint **also checks expiry** and deletes immediately if already past.
- The Socket.IO `chat:join` handler performs a **third check** so even a client with a cached room code is blocked.

---

## 📈 Scaling to Production — Redis + Load Balancer

### The Problem with Multiple Node.js Instances

Socket.IO uses **in-memory rooms**. If you run 3 Node instances behind a load balancer, a user on Server A is in an in-memory room that Server B and C know nothing about. Messages and expiry broadcasts only reach users on the same instance.

### Solution: Redis Adapter for Socket.IO

```bash
npm install @socket.io/redis-adapter redis
```

```javascript
// server.js — add after creating io
const { createAdapter }  = require('@socket.io/redis-adapter');
const { createClient }   = require('redis');

const pubClient = createClient({ url: 'redis://localhost:6379' });
const subClient = pubClient.duplicate();

await Promise.all([pubClient.connect(), subClient.connect()]);
io.adapter(createAdapter(pubClient, subClient));
```

Now `io.to('ROOMCODE').emit(...)` broadcasts across ALL Node instances via Redis pub/sub.

### Solution: Redis TTL for Expiry (instead of setInterval)

Instead of polling MySQL every 60s, set a Redis key with a TTL equal to `expires_at - now`. Use **Redis Keyspace Notifications** to receive an event when the key expires, then trigger deletion:

```bash
# Enable keyspace notifications
redis-cli CONFIG SET notify-keyspace-events Ex
```

```javascript
subClient.subscribe('__keyevent@0__:expired', (expiredKey) => {
    const roomCode = expiredKey.replace('room:expiry:', '');
    // Delete room + notify clients
});
```

This gives sub-second expiry accuracy and eliminates DB polling.

### Recommended Production Architecture

```
           Internet
               │
         [ Nginx / Caddy ]   ← TLS termination, rate limiting
          /     |     \
     Node.js  Node.js  Node.js   ← Multiple app instances
          \     |     /
         [ Redis Cluster ]   ← Socket.IO adapter + expiry TTLs
               │
         [ MySQL (RDS) ]     ← Persistent room/message storage
               │
     [ MySQL Read Replicas ] ← Scale reads (message history)
```

### Additional Production Checklist

- Enable HTTPS — uncomment the `https.createServer()` block in `server.js`
- Set `NODE_ENV=production` and `app.set('trust proxy', 1)`
- Use PM2 or Docker for process management
- Configure Nginx to proxy WebSocket connections (`proxy_http_version 1.1; Upgrade $http_upgrade;`)
- Set up log rotation (messages are deleted from DB but server logs remain)
- Add health-check endpoint `/health` for load balancer monitoring
- Use connection pooling tuned to your DB max_connections

---

## 🛡 Security Features

| Threat              | Mitigation                                                    |
|---------------------|---------------------------------------------------------------|
| XSS                 | `xss` package sanitises all req.body fields + textContent DOM |
| SQL Injection       | All queries use parameterised placeholders (`?`)              |
| Room flooding       | `express-rate-limit` on `/api/rooms/create` (10/15 min/IP)   |
| Oversized payloads  | `express.json({ limit: '50kb' })` + Socket.IO 1 MB cap       |
| Clickjacking        | `X-Frame-Options: DENY` header via Helmet                     |
| MIME sniffing       | `X-Content-Type-Options: nosniff` via Helmet                  |
| Message interception| AES-GCM E2E encryption — server never sees plaintext          |
| Key leakage via URL | Key in hash fragment, never sent in HTTP request              |
| Single-room abuse   | Max 2 participants enforced in Socket.IO join handler         |
