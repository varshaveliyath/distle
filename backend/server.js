require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Database = require('better-sqlite3');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors({ origin: "*" })); // Allow all origins for Vercel/Local dev
app.use(express.json());

// Serve static uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

// Database setup
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'distle.db');
// Ensure directory exists if it's not the current one
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
const db = new Database(dbPath);
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE,
    password TEXT,
    pair_id TEXT,
    pairing_code TEXT UNIQUE,
    lat REAL,
    lon REAL,
    note TEXT DEFAULT '',
    mood TEXT DEFAULT 'neutral',
    photo_url TEXT DEFAULT '',
    streak_count INTEGER DEFAULT 0,
    last_note_date TEXT,
    last_photo_date TEXT,
    last_active TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS history (
    user_id TEXT,
    date TEXT,
    note TEXT DEFAULT '',
    photo_url TEXT DEFAULT '',
    PRIMARY KEY (user_id, date)
  );
`);

// Helper to calculate distance in km
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// Auth & Pairing
app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  const id = 'user_' + Math.random().toString(36).substr(2, 9);
  const pairing_code = Math.floor(100000 + Math.random() * 900000).toString();
  try {
    db.prepare('INSERT INTO users (id, username, password, pairing_code) VALUES (?, ?, ?, ?)').run(id, username, password, pairing_code);
    res.json({ id, username, pairing_code });
  } catch (err) { res.status(400).json({ error: 'Username already exists' }); }
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ? AND password = ?').get(username, password);
  if (user) res.json(user);
  else res.status(401).json({ error: 'Invalid credentials' });
});

app.post('/api/pair', (req, res) => {
  const { userId, partnerCode } = req.body;
  const partner = db.prepare('SELECT id FROM users WHERE pairing_code = ? AND id != ?').get(partnerCode, userId);
  if (partner) {
    db.prepare('UPDATE users SET pair_id = ? WHERE id = ?').run(userId, partner.id);
    db.prepare('UPDATE users SET pair_id = ? WHERE id = ?').run(partner.id, userId);
    res.json({ success: true, partnerId: partner.id });
  } else res.status(400).json({ success: false, message: 'Invalid pairing code' });
});

// History Upsert Helper
function upsertHistory(userId, date, data) {
  const existing = db.prepare('SELECT * FROM history WHERE user_id = ? AND date = ?').get(userId, date);
  if (existing) {
    if (data.note !== undefined) db.prepare('UPDATE history SET note = ? WHERE user_id = ? AND date = ?').run(data.note, userId, date);
    if (data.photo_url !== undefined) db.prepare('UPDATE history SET photo_url = ? WHERE user_id = ? AND date = ?').run(data.photo_url, userId, date);
  } else {
    db.prepare('INSERT INTO history (user_id, date, note, photo_url) VALUES (?, ?, ?, ?)').run(userId, date, data.note || '', data.photo_url || '');
  }
}

// Refined Streak & Shared Updates
function checkAndIncrementStreak(userId) {
  const today = new Date().toISOString().split('T')[0];
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

  if (user.last_note_date === today && user.last_photo_date === today && user.last_active !== today) {
    let newStreak = 1;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    if (user.last_active === yesterdayStr) {
      newStreak = user.streak_count + 1;
    }

    db.prepare('UPDATE users SET last_active = ?, streak_count = ? WHERE id = ?').run(today, newStreak, userId);
    return newStreak;
  }
  return user.streak_count;
}

app.post('/api/note', (req, res) => {
  const { userId, note } = req.body;
  const today = new Date().toISOString().split('T')[0];
  db.prepare('UPDATE users SET note = ?, last_note_date = ? WHERE id = ?').run(note, today, userId);
  upsertHistory(userId, today, { note });
  const streak = checkAndIncrementStreak(userId);
  const user = db.prepare('SELECT pair_id FROM users WHERE id = ?').get(userId);
  if (user && user.pair_id) io.to(user.pair_id).emit('partner-note-update', { note, streak });
  res.json({ success: true, streak });
});

app.post('/api/photo', upload.single('photo'), (req, res) => {
  const { userId } = req.body;
  if (!req.file) return res.status(400).json({ error: 'No image provided' });

  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
  const photoUrl = `${baseUrl}/uploads/${req.file.filename}`;
  const today = new Date().toISOString().split('T')[0];
  db.prepare('UPDATE users SET photo_url = ?, last_photo_date = ? WHERE id = ?').run(photoUrl, today, userId);
  upsertHistory(userId, today, { photo_url: photoUrl });

  const streak = checkAndIncrementStreak(userId);
  const user = db.prepare('SELECT pair_id FROM users WHERE id = ?').get(userId);
  if (user && user.pair_id) io.to(user.pair_id).emit('partner-photo-update', { photoUrl, streak });
  res.json({ success: true, photoUrl, streak });
});

app.get('/api/history/:userId/:date', (req, res) => {
  const { userId, date } = req.params;
  const user = db.prepare('SELECT pair_id FROM users WHERE id = ?').get(userId);

  const myItem = db.prepare('SELECT note, photo_url FROM history WHERE user_id = ? AND date = ?').get(userId, date) || {};
  let partnerItem = {};

  if (user && user.pair_id) {
    partnerItem = db.prepare('SELECT note, photo_url FROM history WHERE user_id = ? AND date = ?').get(user.pair_id, date) || {};
  }

  res.json({
    mine: myItem,
    partner: partnerItem
  });
});

app.get('/api/partner-status/:userId', (req, res) => {
  const user = db.prepare('SELECT pair_id FROM users WHERE id = ?').get(req.params.userId);
  if (!user || !user.pair_id) return res.json({});
  const partner = db.prepare('SELECT username, note, lat, lon, photo_url, streak_count, last_active, created_at FROM users WHERE id = ?').get(user.pair_id);
  res.json(partner);
});

// Served by Vercel; no local serving needed in this split deployment

// Real-time synchronization
io.on('connection', (socket) => {
  socket.on('join', (userId) => socket.join(userId));
  socket.on('update-location', ({ userId, lat, lon }) => {
    db.prepare('UPDATE users SET lat = ?, lon = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?').run(lat, lon, userId);
    const user = db.prepare('SELECT pair_id FROM users WHERE id = ?').get(userId);
    if (user && user.pair_id) {
      const partner = db.prepare('SELECT lat, lon FROM users WHERE id = ?').get(user.pair_id);
      if (partner && partner.lat !== null) {
        const distance = calculateDistance(lat, lon, partner.lat, partner.lon);
        const midpoint = { lat: (lat + partner.lat) / 2, lon: (lon + partner.lon) / 2 };
        io.to(userId).emit('distance-update', { distance, midpoint });
        io.to(user.pair_id).emit('distance-update', { distance, midpoint });
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
