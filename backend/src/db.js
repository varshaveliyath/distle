const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'distle.db');
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

// Initialize Schema
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
    accuracy REAL DEFAULT 0,
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

console.log(`[DB] Database initialized at ${dbPath}`);

module.exports = db;
