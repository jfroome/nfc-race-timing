const Database = require('better-sqlite3');
const path = require('path');

const DB_FILE = path.join(__dirname, 'race-timing.db');

function initDb() {
  const db = new Database(DB_FILE);



  // Participants table
  db.prepare(`CREATE TABLE IF NOT EXISTS participants (
    uid TEXT PRIMARY KEY,
    name TEXT,
    bib TEXT,
    created_date TEXT,
    last_scanned_date TEXT,
    last_updated_date TEXT
  )`).run();

  // Results table
  db.prepare(`CREATE TABLE IF NOT EXISTS results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uid TEXT,
    timestamp TEXT,
    split INTEGER,
    FOREIGN KEY(uid) REFERENCES participants(uid)
  )`).run();


  // Race start/stop table (single row)
  db.prepare(`CREATE TABLE IF NOT EXISTS race_start (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    start TEXT
    -- stop column may be missing in old DBs
  )`).run();

  // Migration: add 'stop' column if it doesn't exist
  const pragma = db.prepare("PRAGMA table_info(race_start)").all();
  const hasStop = pragma.some(col => col.name === 'stop');
  if (!hasStop) {
    db.prepare('ALTER TABLE race_start ADD COLUMN stop TEXT').run();
  }

  return db;
}

module.exports = { initDb, DB_FILE };
