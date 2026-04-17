# 📋 VanishChat v2.0 — Quick Reference Card

## 🚀 3-Minute Startup

```bash
# 1. Install dependencies
npm install

# 2. Configure database
cp .env.example .env
# Edit .env — set DB_USER, DB_PASSWORD, DB_NAME

# 3. Initialize database
npm run db:init

# 4. Run server
npm run dev

# 5. Open browser
# http://localhost:3000
```

---

## 📝 Environment Variables

| Variable                    | Default       | Purpose                       |
| --------------------------- | ------------- | ----------------------------- |
| `PORT`                      | `3000`        | Server port                   |
| `NODE_ENV`                  | `development` | Mode: development/production  |
| `DB_HOST`                   | `127.0.0.1`   | MySQL host (not "localhost"!) |
| `DB_USER`                   | `root`        | MySQL username                |
| `DB_PASSWORD`               | ``            | MySQL password                |
| `DB_NAME`                   | `vanishchat`  | Database name                 |
| `FEATURE_TYPING_INDICATORS` | `true`        | Enable typing status          |
| `FEATURE_READ_RECEIPTS`     | `true`        | Enable read receipts          |
| `BCRYPT_ROUNDS`             | `10`          | Password hash complexity      |
| `RATE_LIMIT_MAX`            | `10`          | Max rooms per 15 min/IP       |

---

## 💾 Database Commands

```bash
# Initialize (creates tables)
npm run db:init

# Reset (⚠️ DELETES ALL DATA)
npm run db:reset

# Connect to MySQL manually
mysql -u root -p -e "USE vanishchat; SHOW TABLES;"
```

---

## 🎮 npm Scripts

```bash
npm start              # Production server
npm run dev            # Dev server (auto-reload)
npm run db:init        # Initialize database
npm run db:reset       # Reset database (DANGER!)
npm run lint           # Run ESLint
npm test               # Run tests
```

---

## 🔗 API Endpoints

### Create Room

```bash
POST /api/rooms/create
Content-Type: application/json

{
  "type": "group",                    # or "single"
  "expiryPreset": "1h",               # 5m|15m|1h|24h|custom
  "customExpiryMs": 3600000,          # If preset is "custom"
  "password": "optional_password",    # Optional
  "creatorNickname": "Alice"          # Optional
}

Response: { roomCode, type, expiresAt, hasPassword, expiryPreset }
```

### Join Room

```bash
POST /api/rooms/join
Content-Type: application/json

{
  "roomCode": "ABC123",
  "password": "password_if_protected"  # Optional
}

Response: { roomCode, type, expiresAt, hasPassword, expiryPreset }
```

---

## 📡 Socket.IO Events

### Send Message (Client → Server)

```javascript
socket.emit("chat:message", {
  content: "...encrypted base64...", // AES-GCM encrypted
  iv: "...base64 IV...", // Initialization vector
});
```

### Typing Indicator (Client → Server)

```javascript
socket.emit("chat:typing", { isTyping: true });
socket.emit("chat:typing", { isTyping: false });
```

### Mark as Read (Client → Server)

```javascript
socket.emit("chat:read", { messageId: 123 });
```

### Receive Message (Server → Client)

```javascript
socket.on("chat:message", (msg) => {
  console.log(msg);
  // { id, nickname, content (encrypted), iv, ts }
});
```

### Typing Status (Server → Client)

```javascript
socket.on("chat:typing", (data) => {
  console.log(data.typists); // ['Alice', 'Bob']
});
```

### Read Receipts (Server → Client)

```javascript
socket.on("chat:readReceipts", (data) => {
  console.log(data.readers); // ['Alice', 'Bob']
});
```

---

## 🐛 Common Issues

| Error                           | Fix                                                   |
| ------------------------------- | ----------------------------------------------------- |
| `Cannot connect to MySQL`       | Check DB_HOST (use `127.0.0.1`), verify MySQL running |
| `EADDRINUSE: port 3000 in use`  | `lsof -ti:3000 \| xargs kill -9`                      |
| `Module 'bcrypt' not found`     | `npm install` && `npm rebuild`                        |
| `Database doesn't exist`        | Run `npm run db:init`                                 |
| `Tables not found`              | Run `npm run db:reset` then `npm run db:init`         |
| `Typing indicators not working` | Check `FEATURE_TYPING_INDICATORS=true` in `.env`      |

---

## 📚 Full Documentation

- **SETUP.md** — Complete setup guide (40+ steps)
- **ADVANCED.md** — Production, scaling, Redis, monitoring
- **README.md** — Project overview, architecture, security
- **IMPLEMENTATION_SUMMARY.md** — What was built

---

## 🔐 Security Checklist

### Development ✅

- [x] XSS sanitization
- [x] SQL injection prevention
- [x] Password hashing (bcrypt)
- [x] Rate limiting
- [x] CORS security

### Production Todo

- [ ] Change `SESSION_SECRET` to strong random
- [ ] Enable HTTPS
- [ ] Set `NODE_ENV=production`
- [ ] Set actual `CORS_ORIGIN`
- [ ] Use strong MySQL password
- [ ] Configure firewall (ports 80, 443 only)
- [ ] Set up database backups
- [ ] Monitor with Prometheus/ELK/Sentry

---

## 📊 Project Stats

- **Backend:** Node.js + Express + Socket.IO
- **Database:** MySQL with 4 main tables
- **Frontend:** Vanilla HTML/CSS/JavaScript
- **Encryption:** Web Crypto API (AES-GCM)
- **Lines of Code:** ~2000+ core + ~1000+ docs
- **Files:** 20+ source files + scripts
- **Version:** 2.0.0 (Production-Ready)

---

## 🎯 Features Overview

| Feature                    | Status | Env Flag                    |
| -------------------------- | ------ | --------------------------- |
| Room creation              | ✅     | —                           |
| Password protection        | ✅     | —                           |
| Typing indicators          | ✅     | `FEATURE_TYPING_INDICATORS` |
| Read receipts              | ✅     | `FEATURE_READ_RECEIPTS`     |
| Message encryption         | ✅     | —                           |
| Room expiry                | ✅     | —                           |
| Single room mode (2 users) | ✅     | —                           |
| Rate limiting              | ✅     | —                           |
| Input sanitization         | ✅     | —                           |

---

## 🧪 Quick Test

```bash
# Terminal 1: Start server
npm run dev

# Terminal 2: Create room
curl -X POST http://localhost:3000/api/rooms/create \
  -H "Content-Type: application/json" \
  -d '{"type":"group","expiryPreset":"1h"}'

# Browser 1: http://localhost:3000
# - Copy the room code
# Browser 2: http://localhost:3000
# - Enter room code
# - Chat and verify encryption!
```

---

## 🚀 Next Steps

1. **Read SETUP.md** for complete setup guide
2. **Run `npm run db:init`** to initialize database
3. **Run `npm run dev`** to start server
4. **Test** by creating/joining rooms in browser
5. **Read ADVANCED.md** for production deployment
6. **Deploy** to production with HTTPS + Redis

---

## 📞 Need Help?

1. Check **SETUP.md** (step-by-step guide)
2. Check **ADVANCED.md** (scaling, monitoring)
3. Check error logs in console
4. See troubleshooting in **SETUP.md**

---

**VanishChat v2.0 — Production-Ready Ephemeral Chat**  
_Last Updated: April 17, 2026_
