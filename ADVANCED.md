# 🚀 VanishChat — Advanced Features & Scaling Guide

Production-ready optimizations, advanced features, and scaling strategies.

---

## 📊 Performance Optimizations

### 1. Database Connection Pooling

Already implemented in `config/db.js`:

- 10 concurrent connections by default
- Automatic reconnection on failure
- Connection timeout handling

**To increase pool size for high concurrency:**

```env
DB_CONNECTION_LIMIT=20      # Increase from 10
DB_QUEUE_LIMIT=50           # Queue additional requests
```

**Pro tip:** Monitor pool usage in production:

```sql
SHOW PROCESSLIST;            -- See active connections
SHOW STATUS LIKE 'Threads%'; -- Connection statistics
```

---

## 🔄 Redis Integration (Socket.IO Scaling)

For horizontal scaling with multiple Node.js instances, use Redis as a Socket.IO adapter.

### Why Redis?

- **Problem:** Socket.IO keeps connections in-memory. Multiple servers can't share state.
- **Solution:** Redis acts as a message bus between servers.

### Setup

1. **Install Redis**

```bash
# macOS
brew install redis
brew services start redis

# Linux
sudo apt-get install redis-server
sudo systemctl start redis-server

# Docker
docker run -d -p 6379:6379 redis:latest
```

2. **Install Socket.IO Redis adapter**

```bash
npm install @socket.io/redis-adapter redis
```

3. **Update server.js**

```javascript
const { createAdapter } = require("@socket.io/redis-adapter");
const { createClient } = require("redis");

// Create Redis clients
const pubClient = createClient({ url: process.env.REDIS_URL });
const subClient = pubClient.duplicate();

Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
  io.adapter(createAdapter(pubClient, subClient));
  console.log("[Redis] Socket.IO adapter configured");
});
```

4. **Add to .env**

```env
REDIS_URL=redis://127.0.0.1:6379
```

5. **Deploy multiple instances behind a load balancer**

```
                    Load Balancer (Nginx)
                            |
                ┌───────────┼───────────┐
                |           |           |
            Node 1      Node 2      Node 3
            (3000)      (3001)      (3002)
                            |
                            └─────────── Redis
```

---

## 📁 File Upload with Encryption

Add secure file sharing to VanishChat.

### Schema additions:

```sql
CREATE TABLE file_uploads (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    room_id     INT UNSIGNED NOT NULL,
    uploader    VARCHAR(32) NOT NULL,
    filename    VARCHAR(255) NOT NULL,
    file_size   INT UNSIGNED NOT NULL,     -- Bytes
    file_hash   VARCHAR(64) NOT NULL,      -- SHA-256 hex
    encrypted   TINYINT(1) DEFAULT 1,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_upload_room
        FOREIGN KEY (room_id) REFERENCES rooms(id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### Implementation steps:

1. **Install upload handler**

```bash
npm install multer
```

2. **Create upload route**

```javascript
const multer = require("multer");
const upload = multer({
  dest: "./uploads/",
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
});

router.post(
  "/rooms/:roomCode/upload",
  upload.single("file"),
  uploadController.upload,
);
```

3. **Encrypt files on client before upload**

```javascript
// In public/js/crypto.js
async function encryptFile(file, key) {
  const buffer = await file.arrayBuffer();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    buffer,
  );
  return { encrypted, iv };
}
```

4. **Store encrypted blobs**

```javascript
POST /api/rooms/{roomCode}/upload
Content-Type: multipart/form-data

// File is encrypted client-side before sending
// Server stores encrypted binary blob
// Only users with room encryption key can decrypt
```

### Security:

- ✅ Files encrypted end-to-end
- ✅ Server never sees plaintext
- ✅ File size limits prevent DoS
- ✅ SHA-256 integrity checking
- ✅ Expired files auto-deleted with room

---

## 📱 Push Notifications (Optional)

Alert users when they're mentioned or in offline mode.

### Setup with Firebase Cloud Messaging:

1. **Install FCM library**

```bash
npm install firebase-admin
```

2. **Add tokens table**

```sql
CREATE TABLE notification_tokens (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    room_id     INT UNSIGNED,
    nickname    VARCHAR(32),
    device_token VARCHAR(500),
    platform    ENUM('web', 'android', 'ios'),
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_token_room
        FOREIGN KEY (room_id) REFERENCES rooms(id)
        ON DELETE CASCADE
);
```

3. **Emit notification on message**

```javascript
socket.on("chat:message", async (data) => {
  // ... save message ...

  // Send push to other users in room
  const tokens = await NotificationToken.findByRoom(roomId);
  await sendPushNotifications(tokens, {
    title: `${socket.nickname} sent a message`,
    body: "[Encrypted message]",
  });
});
```

---

## 🔐 Enhanced Security Features

### 1. Rate Limiting by Room

Prevent spam/abuse per room:

```javascript
const roomRateLimiter = rateLimit({
  windowMs: 60000, // 1 minute
  max: 100, // 100 messages per room
  keyGenerator: (req) => `${req.params.roomCode}:${req.body.nickname}`,
});
```

### 2. Message Signing

Add cryptographic proof of sender identity:

```javascript
// Client signs each message with private key
const signature = await crypto.subtle.sign(
  "RSASSA-PKCS1-v1_5",
  privateKey,
  messageBuffer,
);

socket.emit("chat:message", { content, iv, signature });

// Server optionally verifies (doesn't trust, but logs)
```

### 3. Audit Logging

Log all security events:

```javascript
// Log room creation
await AuditLog.create({
  event: "room:created",
  roomCode,
  ipAddress: req.ip,
  timestamp: new Date(),
});

// Log suspicious activity
if (message.length > 50000) {
  await AuditLog.create({
    event: "suspicious:oversized_message",
    roomCode,
    nickname,
  });
}
```

### 4. IP Whitelisting (for private deployments)

```env
IP_WHITELIST=192.168.1.0/24,10.0.0.0/8
```

---

## 📈 Monitoring & Observability

### 1. Prometheus Metrics

```bash
npm install prom-client
```

```javascript
const prometheus = require("prom-client");

const roomsGauge = new prometheus.Gauge({
  name: "vanishchat_active_rooms",
  help: "Number of active chat rooms",
});

const messagesCounter = new prometheus.Counter({
  name: "vanishchat_messages_total",
  help: "Total messages sent",
});
```

### 2. ELK Stack Integration (Elasticsearch, Logstash, Kibana)

```javascript
const { Client } = require("@elastic/elasticsearch");
const client = new Client({ node: process.env.ELASTICSEARCH_URL });

// Log every Socket.IO event
socket.on("*", (event) => {
  client.index({
    index: "vanishchat-events",
    document: { event, timestamp: new Date(), socketId: socket.id },
  });
});
```

### 3. Sentry Error Tracking

```bash
npm install @sentry/node
```

```javascript
const Sentry = require("@sentry/node");
Sentry.init({ dsn: process.env.SENTRY_DSN });

app.use(Sentry.Handlers.errorHandler());

socket.on("error", (err) => {
  Sentry.captureException(err);
});
```

---

## 🌍 Deployment Guides

### Docker

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
EXPOSE 3000

CMD ["npm", "start"]
```

```bash
docker build -t vanishchat .
docker run -p 3000:3000 --env-file .env vanishchat
```

### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: vanishchat
spec:
  replicas: 3
  selector:
    matchLabels:
      app: vanishchat
  template:
    metadata:
      labels:
        app: vanishchat
    spec:
      containers:
        - name: vanishchat
          image: vanishchat:latest
          ports:
            - containerPort: 3000
          env:
            - name: NODE_ENV
              value: production
            - name: REDIS_URL
              value: redis://redis-service:6379
```

### AWS ECS/Fargate

1. Push Docker image to ECR
2. Create ECS task definition
3. Configure ALB (load balancer)
4. Enable auto-scaling

### Heroku

```bash
git push heroku main
```

With `Procfile`:

```
web: npm start
```

### Vercel (Frontend only, requires backend elsewhere)

Not suitable for Socket.IO. Deploy frontend to Vercel, backend to VPS/Docker.

---

## 🔧 Development Tools

### 1. Socket.IO DevTools

```bash
npm install socket.io-client@latest  # For debugging
```

Browser extension: "Socket.IO DevTools" (Chrome)

### 2. Database GUI

- **MySQL Workbench** — Full-featured MySQL client
- **DBeaver** — Universal database tool
- **TablePlus** — Mac-native, lightweight

### 3. API Testing

- **Postman** — HTTP/WebSocket testing
- **Insomnia** — REST client
- **curl** — Command-line tool

Example:

```bash
# Create room
curl -X POST http://localhost:3000/api/rooms/create \
  -H "Content-Type: application/json" \
  -d '{"type":"group","expiryPreset":"1h"}'

# Join room
curl -X POST http://localhost:3000/api/rooms/join \
  -H "Content-Type: application/json" \
  -d '{"roomCode":"ABC123"}'
```

---

## 📊 Load Testing

Test server with many concurrent connections:

### Using Artillery:

```bash
npm install -D artillery

# Create load-test.yml
targets:
  - http://localhost:3000
scenarios:
  - name: "Chat load test"
    flow:
      - post:
          url: "/api/rooms/create"
          json:
            type: "group"
            expiryPreset: "1h"

# Run test
artillery run load-test.yml
```

### Expected performance:

- ✅ 1000+ concurrent connections
- ✅ <100ms message latency (with Redis)
- ✅ 99.9% uptime

---

## 🧹 Cleanup & Maintenance

### Database Vacuuming (monthly)

```sql
-- Optimize tables
OPTIMIZE TABLE rooms, messages, typing_indicators, read_receipts;

-- Analyze for query optimizer
ANALYZE TABLE rooms, messages, typing_indicators, read_receipts;
```

### Archive Old Rooms (optional)

```sql
-- Move to archive table (keep for compliance)
INSERT INTO rooms_archive
SELECT * FROM rooms WHERE expires_at < DATE_SUB(NOW(), INTERVAL 30 DAY);

DELETE FROM rooms WHERE expires_at < DATE_SUB(NOW(), INTERVAL 30 DAY);
```

---

## 📚 Additional Resources

- [Socket.IO Documentation](https://socket.io/docs/)
- [MySQL Best Practices](https://dev.mysql.com/doc/refman/8.0/en/)
- [Node.js Performance](https://nodejs.org/en/docs/guides/nodejs-performance/)
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- [OWASP Security](https://owasp.org/Top10/)

---

## 💬 Contributing

Have a cool optimization? Submit a PR!

---

**Last updated:** April 2026
