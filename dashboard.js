const express = require('express');
const fs = require('fs');
const path = require('path');
const { initDb } = require('./db');

const app = express();
const PORT = 3000;
const db = initDb();


// Start a new race: archive results, clear results, set new start time, clear stop time
const { archiveResults } = require('./read-nfc');
app.post('/api/race/start', (req, res) => {
  try {
    archiveResults(); // Archive before clearing
    db.prepare('DELETE FROM results').run();
    db.prepare('DELETE FROM race_start').run();
    const now = new Date().toISOString();
    db.prepare('INSERT OR REPLACE INTO race_start (id, start, stop) VALUES (1, ?, NULL)').run(now);
    res.json({ message: 'Race started', start: now });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to start race' });
  }
});

// Stop the race: set the stop timestamp
app.post('/api/race/stop', (req, res) => {
  try {
    const now = new Date().toISOString();
    db.prepare('UPDATE race_start SET stop = ? WHERE id = 1').run(now);
    res.json({ message: 'Race stopped', stop: now });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to stop race' });
  }
});


let lastScannedUID = null;

// Endpoint for CLI to send scanned UID and save if new
app.post('/api/scan-uid', express.json(), (req, res) => {
  // Prevent splits if race is stopped
  const race = db.prepare('SELECT start, stop FROM race_start WHERE id = 1').get();
  if (!race || !race.start || race.stop) {
    return res.status(403).json({ message: 'Race is not running.' });
  }
  const { rfid } = req.body;
  if (!rfid) {
    return res.status(400).json({ message: 'No UID provided' });
  }
  lastScannedUID = rfid;
  const now = new Date().toISOString();
  const row = db.prepare('SELECT * FROM participants WHERE uid = ?').get(rfid);
  if (!row) {
    // Assign next bib number
    const bibRow = db.prepare('SELECT MAX(CAST(bib AS INTEGER)) as maxBib FROM participants').get();
    const nextBib = bibRow && bibRow.maxBib ? parseInt(bibRow.maxBib, 10) + 1 : 1;
    db.prepare('INSERT INTO participants (uid, name, bib, created_date, last_scanned_date, last_updated_date) VALUES (?, ?, ?, ?, ?, ?)')
      .run(rfid, 'unnamed rfid tag', String(nextBib), now, now, now);
  } else {
    db.prepare('UPDATE participants SET last_scanned_date = ?, last_updated_date = ? WHERE uid = ?')
      .run(now, now, rfid);
  }
  res.json({ message: 'UID processed' });
});

// Endpoint to get all participants and the last scanned UID
app.get('/api/participants', (req, res) => {
  try {
    const rows = db.prepare('SELECT uid, name, bib, created_date, last_scanned_date, last_updated_date FROM participants').all();
    // Sort by last_scanned_date descending (nulls last)
    rows.sort((a, b) => {
      if (!b.last_scanned_date && !a.last_scanned_date) return 0;
      if (!b.last_scanned_date) return -1;
      if (!a.last_scanned_date) return 1;
      return b.last_scanned_date.localeCompare(a.last_scanned_date);
    });
    const participants = {};
    rows.forEach(row => {
      participants[row.uid] = {
        name: row.name,
        bib: row.bib,
        created_date: row.created_date,
        last_scanned_date: row.last_scanned_date,
        last_updated_date: row.last_updated_date
      };
    });
    res.json({ participants, lastScannedUID });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to read participants from database.' });
  }
});

// Endpoint to update a participant's name
app.post('/api/participants/update', express.json(), (req, res) => {
  const { rfid, name, bib } = req.body;
  if (!rfid || !name || !bib) {
    return res.status(400).json({ message: 'RFID, name, and bib are required.' });
  }
  const row = db.prepare('SELECT * FROM participants WHERE uid = ?').get(rfid);
  if (!row) {
    return res.status(404).json({ message: 'RFID not found.' });
  }
  const now = new Date().toISOString();
  try {
    db.prepare('UPDATE participants SET name = ?, bib = ?, last_updated_date = ? WHERE uid = ?').run(name, bib, now, rfid);
    res.json({ message: 'Name and bib updated successfully!' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update participant.' });
  }
});

app.use(express.json());
// API endpoint to register a user to an RFID UID
app.post('/api/register', (req, res) => {
  const { name, rfid, bib } = req.body;
  if (!name || !rfid) {
    return res.status(400).json({ message: 'Name and RFID UID are required.' });
  }
  const row = db.prepare('SELECT * FROM participants WHERE uid = ?').get(rfid);
  if (row) {
    return res.status(409).json({ message: 'RFID UID is already registered.' });
  }
  let bibToUse = bib;
  if (!bibToUse) {
    // Assign next bib number if not provided
    const bibRow = db.prepare('SELECT MAX(CAST(bib AS INTEGER)) as maxBib FROM participants').get();
    bibToUse = bibRow && bibRow.maxBib ? String(parseInt(bibRow.maxBib, 10) + 1) : '1';
  }
  const now = new Date().toISOString();
  try {
    db.prepare('INSERT INTO participants (uid, name, bib, created_date, last_scanned_date, last_updated_date) VALUES (?, ?, ?, ?, ?, ?)')
      .run(rfid, name, bibToUse, now, null, now);
    res.json({ message: 'User registered successfully!' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to save participant.' });
  }
});

function groupResultsByUID(results, startTime) {
  const grouped = {};
  for (const entry of results) {
    const uid = entry.uid;
    if (!grouped[uid]) {
      grouped[uid] = { ...entry, splits: [] };
    }
    grouped[uid].splits.push(entry.timestamp);
  }
  // Calculate split durations
  for (const uid in grouped) {
    const person = grouped[uid];
    const splits = person.splits.map(ts => new Date(ts));
    const deltas = [];
    for (let i = 0; i < splits.length; i++) {
      const prev = i === 0 ? new Date(startTime) : splits[i - 1];
      const delta = splits[i] - prev;
      deltas.push(delta);
    }
    person.durations = deltas; // in ms
    person.total = deltas.reduce((a, b) => a + b, 0);
    person.splitCount = deltas.length;
  }
  return grouped;
}

app.use(express.static('public'));

app.get('/results', (req, res) => {
  try {
    const results = db.prepare(`
      SELECT r.uid, p.name, p.bib, r.timestamp, r.split
      FROM results r
      LEFT JOIN participants p ON r.uid = p.uid
      ORDER BY r.timestamp
    `).all();
    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load results' });
  }
});

app.get('/start', (req, res) => {
  try {
    const row = db.prepare('SELECT start, stop FROM race_start WHERE id = 1').get();
    if (!row) throw new Error('No race start');
    res.json({ start: row.start, stop: row.stop });
  } catch (err) {
    res.status(404).json({ error: 'Race not started yet' });
  }
});

app.get('/grouped-results', (req, res) => {
  try {
    const startRow = db.prepare('SELECT start FROM race_start WHERE id = 1').get();
    if (!startRow) throw new Error('No race start');
    const start = startRow.start;
    const results = db.prepare(`
      SELECT r.uid, p.name, p.bib, r.timestamp, r.split
      FROM results r
      LEFT JOIN participants p ON r.uid = p.uid
      ORDER BY r.timestamp
    `).all();
    const grouped = groupResultsByUID(results, start);
    res.json(grouped);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load grouped results' });
  }
});

app.get('/results/:uid', (req, res) => {
  try {
    const { uid } = req.params;
    const results = db.prepare('SELECT uid, timestamp, split FROM results WHERE uid = ? ORDER BY timestamp').all(uid);
    const startRow = db.prepare('SELECT start FROM race_start WHERE id = 1').get();
    if (!startRow) throw new Error('No race start');
    const start = startRow.start;
    const userResults = results;
    const splits = userResults.map(r => new Date(r.timestamp));
    const deltas = splits.map((t, i) => {
      const prev = i === 0 ? new Date(start) : splits[i - 1];
      return t - prev;
    });
    const total = deltas.reduce((a, b) => a + b, 0);
    res.json({ splits: userResults, deltas, total });
  } catch {
    res.status(404).json({ error: 'Not found' });
  }
});

app.listen(PORT, () => {
  console.log(`📊 Dashboard running at http://localhost:${PORT}`);
});