# 🚀 VanishChat — Developer Setup Guide

Complete step-by-step instructions to set up and run VanishChat locally.

---

## 📋 Prerequisites

Before you begin, ensure you have:

- **Node.js** ≥ 18.0.0 ([download](https://nodejs.org/))
- **npm** ≥ 9.0.0 (comes with Node.js)
- **MySQL** ≥ 5.7 ([download](https://dev.mysql.com/downloads/mysql/))
- **macOS, Linux, or Windows** (with WSL2)

### Verify your setup:

```bash
node --version   # Should be v18 or higher
npm --version    # Should be v9 or higher
mysql --version  # Should show MySQL version
```

---

## 📦 Installation

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/vanishchat.git
cd vanishchat
```

### 2. Install Node.js dependencies

```bash
npm install
```

This installs:

- Express (web server)
- Socket.IO (real-time messaging)
- MySQL2 (database driver)
- Bcrypt (password hashing)
- Helmet (security headers)
- And other dependencies

### 3. Configure environment variables

```bash
# Copy the template
cp .env.example .env

# Edit with your database credentials
nano .env  # or vim .env or your favorite editor
```

**Key environment variables:**

```env
PORT=3000                    # Server port
NODE_ENV=development         # development | production

DB_HOST=127.0.0.1           # MySQL host
DB_PORT=3306                # MySQL port
DB_USER=root                # MySQL username
DB_PASSWORD=yourpassword    # MySQL password
DB_NAME=vanishchat          # Database name

FEATURE_TYPING_INDICATORS=true
FEATURE_READ_RECEIPTS=true
BCRYPT_ROUNDS=10
```

---

## 🗄️ Database Setup

### 1. Start MySQL server

**macOS (Homebrew):**

```bash
brew services start mysql
```

**Linux (systemd):**

```bash
sudo systemctl start mysql
```

**Windows:**

- Open Services → find MySQL → Start
- Or use MySQL Installer

### 2. Verify MySQL connection

```bash
mysql -u root -p
# Enter your password, then:
> SHOW DATABASES;
> EXIT;
```

### 3. Initialize the database

```bash
npm run db:init
```

This:

- Creates the `vanishchat` database (if not exists)
- Creates all required tables:
  - `rooms` — chat rooms metadata
  - `messages` — encrypted messages
  - `typing_indicators` — live typing status
  - `read_receipts` — message read tracking

**Output:**

```
[Init DB] Starting database initialization...
[Init DB] ✓ Connected to MySQL server
[Init DB] ✓ Database "vanishchat" ready
[Init DB] ✓ Schema applied successfully
[Init DB] ✓ All required tables verified:
         - rooms
         - messages
         - typing_indicators
         - read_receipts
[Init DB] ✓ Database initialization complete!
```

### 4. (Optional) Reset database for fresh start

```bash
npm run db:reset
```

**WARNING:** This **deletes all data** in the database. Use only in development!

---

## ▶️ Running the Server

### Development mode (with auto-reload):

```bash
npm run dev
```

Watches for file changes and auto-restarts the server using **nodemon**.

### Production mode:

```bash
npm start
```

Runs the server without auto-reload.

### Expected output:

```
[DB] ✓ MySQL connection pool established successfully.
[Cleanup] Starting expired-room sweep every 60s
[Server] VanishChat running on http://localhost:3000
```

Open your browser to: **http://localhost:3000**

---

## 🧪 Testing Features

### 1. Create a chat room

```
http://localhost:3000
1. Enter room type: "group" or "single"
2. Select expiry: "5m", "15m", "1h", "24h", or custom
3. (Optional) Set a password
4. Click "Create Room"
```

### 2. Join a room

```
- Share the room code with others
- They visit http://localhost:3000
- Enter the room code
- Enter a nickname
- (If password-protected) Enter the password
```

### 3. Test end-to-end encryption

```
- Messages are encrypted client-side before sending
- Server stores only ciphertext
- Decryption happens in the browser
- Check browser DevTools Console to see encrypted/decrypted messages
```

### 4. Test typing indicators

```
- Start typing in the message input
- Others in the room see "X is typing..."
- Stops after 5 seconds of inactivity
```

### 5. Test read receipts

```
- Messages show checkmarks when read by others
- Read status updates in real-time
```

---

## 🔍 Troubleshooting

### "Cannot connect to MySQL"

```bash
# Check if MySQL is running:
mysql -u root -p

# If connection fails, check credentials in .env:
DB_HOST=127.0.0.1     # NOT 'localhost' (use IP)
DB_USER=root
DB_PASSWORD=yourpass
```

### "EADDRINUSE: address already in use :::3000"

```bash
# Kill the process using port 3000:
lsof -ti:3000 | xargs kill -9  # macOS/Linux
netstat -ano | findstr :3000   # Windows
```

### "Module not found: bcrypt"

```bash
# Reinstall node_modules:
rm -rf node_modules package-lock.json
npm install
```

### "Tables don't exist"

```bash
# Check database:
mysql -u root -p -e "USE vanishchat; SHOW TABLES;"

# Reinitialize:
npm run db:reset
npm run db:init
```

---

## 📁 Project Structure

```
vanishchat/
├── server.js                      # Express + Socket.IO entry point
├── package.json
├── schema.sql                     # Database schema
├── .env.example                   # Environment template
│
├── config/
│   └── db.js                      # MySQL connection pool
│
├── routes/
│   └── rooms.js                   # HTTP room endpoints
│
├── controllers/
│   └── roomController.js          # Room creation/join logic
│
├── models/
│   ├── Room.js                    # rooms table queries
│   ├── Message.js                 # messages table queries
│   ├── TypingIndicator.js         # typing status queries
│   └── ReadReceipt.js             # read receipt queries
│
├── middleware/
│   ├── sanitize.js                # XSS sanitization
│   └── rateLimiter.js             # Rate limiting
│
├── services/
│   └── cleanupService.js          # Expired room cleanup
│
├── scripts/
│   ├── init-db.js                 # Database initialization
│   └── reset-db.js                # Database reset (DANGER!)
│
└── public/
    ├── index.html                 # Single-page app
    ├── css/
    │   └── style.css
    └── js/
        ├── app.js                 # Client logic
        └── crypto.js              # AES-GCM encryption/decryption
```

---

## 🔐 Security Checklist (Production)

Before deploying to production:

- [ ] Set `NODE_ENV=production` in `.env`
- [ ] Change `SESSION_SECRET` to a strong random string
- [ ] Enable HTTPS (uncomment TLS in `server.js`)
- [ ] Set `CORS_ORIGIN` to your actual domain
- [ ] Use strong MySQL password
- [ ] Set `RATE_LIMIT_MAX` appropriately for your use case
- [ ] Enable firewall rules (only allow port 443)
- [ ] Set up database backups
- [ ] Use Redis for scaling Socket.IO (see ADVANCED.md)

---

## 📚 Next Steps

- Read [API Documentation](./docs/API.md)
- Read [Architecture Guide](./docs/ARCHITECTURE.md)
- Read [Security Guide](./docs/SECURITY.md)
- Read [Advanced Features](./ADVANCED.md)

---

## 💬 Support

- 📖 Check [README.md](./README.md)
- 🐛 Open an issue on GitHub
- 💡 Suggest features

---

## 📄 License

MIT — See [LICENSE](./LICENSE)
