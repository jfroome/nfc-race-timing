
const { NFC } = require('nfc-pcsc');
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { initDb } = require('./db');
const db = initDb();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise(resolve => rl.question(question, answer => resolve(answer)));
}

function showMenu() {
  console.log('1. Scan and register mode');
  console.log('2. Race mode');
  console.log('3. Archive results to CSV');
  console.log('4. Exit');
}

function formatDateForFilename(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}_${hh}-${min}-${ss}`;
}

function archiveResults() {
  // Export results to Archive directory with new format: race_start,name,total_time,splits
  const archiveDir = path.join(__dirname, 'Archive');
  if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });

  // Get race start time if present
  const startRow = db.prepare('SELECT start FROM race_start WHERE id = 1').get();
  let startTimeStr = startRow && startRow.start ? startRow.start : null;
  let filenameBase;
  if (startTimeStr) {
    const parsed = new Date(startTimeStr);
    if (!isNaN(parsed)) filenameBase = formatDateForFilename(parsed);
  }
  if (!filenameBase) filenameBase = formatDateForFilename(new Date());

  const filename = `${filenameBase}_Results.csv`;
  const filePath = path.join(archiveDir, filename);

  // Query results joined with participants, ordered by uid then timestamp
  const rows = db.prepare(`SELECT r.uid as uid, p.name as name, r.timestamp as timestamp, r.split as split
    FROM results r LEFT JOIN participants p ON r.uid = p.uid ORDER BY r.uid, r.timestamp`).all();

  if (!rows || rows.length === 0) {
    console.log('ℹ️ No results to archive.');
    return null;
  }

  // Group by uid
  const grouped = {};
    for (const r of rows) {
      if (!grouped[r.uid]) grouped[r.uid] = { uid: r.uid, name: r.name || '', splits: [], timestamps: [] };
      grouped[r.uid].uid = r.uid; // Always set uid explicitly, even if already present
      grouped[r.uid].splits.push(Number(r.split));
      grouped[r.uid].timestamps.push(r.timestamp);
  }

  // Build CSV: race_start,uid,name,total_time,splits
  const header = ['race_start', 'uid', 'name', 'total_time', 'splits'].join(',') + '\n';
  // Sort by most laps (splits.length, descending), then by shortest total time (ascending)
  const sortedPeople = Object.values(grouped).sort((a, b) => {
    const lapsA = a.splits.length;
    const lapsB = b.splits.length;
    if (lapsB !== lapsA) return lapsB - lapsA;
    const totalA = lapsA > 0 ? a.splits[lapsA - 1] : 0;
    const totalB = lapsB > 0 ? b.splits[lapsB - 1] : 0;
    return totalA - totalB;
  });
    const lines = sortedPeople.map(person => {
      const total = person.splits.length > 0 ? person.splits[person.splits.length - 1] : 0;
      // Calculate lap times (differences between splits)
      const lapTimes = person.splits.map((split, idx, arr) => idx === 0 ? split : split - arr[idx - 1]);
      const splitsStr = '[' + lapTimes.join(';') + ']';
      const safeName = person.name ? (`"${String(person.name).replace(/"/g, '""')}"`) : '';
    const safeUid = person.uid ? person.uid : 'UNKNOWN';
    return `${startTimeStr || ''},${safeUid},${safeName},${total},${splitsStr}`;
    }).join('\n');

  fs.writeFileSync(filePath, header + lines, 'utf8');
  console.log(`✅ Archived ${Object.keys(grouped).length} participants to ${filePath}`);
  return filePath;

}

async function scanBracelet(reader) {
  console.log('\n🔎 Tap a bracelet to identify it. Press q to cancel.\n');
  reader.removeAllListeners('card');

  let stopped = false;
  // allow 'q' to cancel like registration
  const onKey = function onKey(buf) {
    if (buf.length === 1 && buf[0] === 0x71) { // 'q'
      stopped = true;
      reader.removeAllListeners('card');
      try { process.stdin.setRawMode(false); } catch (e) {}
      process.stdin.removeListener('data', onKey);
      rl.resume();
      console.log('\n🛑 Scan cancelled (q pressed)\n');
    }
  };

  const onCard = async card => {
    if (stopped) return;
    const uid = await getUID(reader);
    if (!uid) return;

    // Lookup participant
    const row = db.prepare('SELECT * FROM participants WHERE uid = ?').get(uid);
    const now = new Date().toISOString();
    if (row) {
      // Update last_scanned_date
      db.prepare('UPDATE participants SET last_scanned_date = ?, last_updated_date = ? WHERE uid = ?')
        .run(now, now, uid);
      console.log(`✅ Identified: UID=${uid} bib=${row.bib} name="${row.name || ''}"`);
    } else {
      console.log(`✅ UID=${uid} (not registered)`);
    }

    // cleanup after single read
    stopped = true;
    reader.removeListener('card', onCard);
    try { process.stdin.setRawMode(false); } catch (e) {}
    if (typeof onKey === 'function') process.stdin.removeListener('data', onKey);
    rl.resume();
  };

  reader.on('card', onCard);

  rl.pause();
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('data', onKey);

  // wait until stopped
  await new Promise(resolve => {
    const check = setInterval(() => {
      if (stopped) {
        clearInterval(check);
        resolve();
      }
    }, 100);
  });
}

async function registerBracelet(reader) {
  console.log('\n👉 Tap bracelets to register. Press q to stop.\n');
  reader.removeAllListeners('card');

  let stopped = false;
  const onCard = async card => {
    if (stopped) return;
    const uid = await getUID(reader);
    if (!uid) return;

    // Check if already registered
    const row = db.prepare('SELECT * FROM participants WHERE uid = ?').get(uid);
    const now = new Date().toISOString();
    if (row) {
      // Update last_scanned_date
      db.prepare('UPDATE participants SET last_scanned_date = ?, last_updated_date = ? WHERE uid = ?')
        .run(now, now, uid);
      console.log(`✅ Already registered: ${JSON.stringify(row)}`);
      return;
    }

    // Autoincrement bib number
    const bibRow = db.prepare('SELECT MAX(CAST(bib AS INTEGER)) as maxBib FROM participants').get();
    const nextBib = bibRow && bibRow.maxBib ? parseInt(bibRow.maxBib, 10) + 1 : 1;
    // Use INSERT OR IGNORE to guarantee no duplicates
    db.prepare('INSERT OR IGNORE INTO participants (uid, name, bib, created_date, last_scanned_date, last_updated_date) VALUES (?, ?, ?, ?, ?, ?)')
      .run(uid, '', String(nextBib), now, now, now);
    // Confirm registration
    const confirm = db.prepare('SELECT * FROM participants WHERE uid = ?').get(uid);
    if (confirm) {
      console.log(`✅ Registered UID ${uid} with bib ${nextBib}`);
    } else {
      console.log(`⚠️ UID ${uid} was not registered (possible duplicate)`);
    }
  };
  reader.on('card', onCard);

  // Pause readline before raw mode
  rl.pause();
  process.stdin.setRawMode(true);
  process.stdin.resume();
  await new Promise(resolve => {
    process.stdin.on('data', function onKey(buf) {
      // 'q' key is 113 (0x71) in ASCII
      if (buf.length === 1 && buf[0] === 0x71) {
        stopped = true;
        reader.removeListener('card', onCard);
        process.stdin.setRawMode(false);
        process.stdin.removeListener('data', onKey);
        rl.resume(); // Ensure readline works for main menu
        console.log('\n🛑 Registration stopped (q pressed)\n');
        resolve();
      }
    });
  });
}


async function raceMode(reader) {
  console.log('\n🏁 Race mode: Tap bracelets to record laps. Press q to stop.\n');
  reader.removeAllListeners('card');

  let stopped = false;
  const onCard = async card => {
    if (stopped) return;
    const uid = await getUID(reader);
    if (!uid) return;

    // Ensure UID exists in participants
    let participant = db.prepare('SELECT name, bib FROM participants WHERE uid = ?').get(uid);
    if (!participant) {
      const nowStr = new Date().toISOString();
      // Autoincrement bib number
      const bibRow = db.prepare('SELECT MAX(CAST(bib AS INTEGER)) as maxBib FROM participants').get();
      const nextBib = bibRow && bibRow.maxBib ? parseInt(bibRow.maxBib, 10) + 1 : 1;
      db.prepare('INSERT OR IGNORE INTO participants (uid, name, bib, created_date, last_scanned_date, last_updated_date) VALUES (?, ?, ?, ?, ?, ?)')
        .run(uid, '', String(nextBib), nowStr, nowStr, nowStr);
      participant = db.prepare('SELECT name, bib FROM participants WHERE uid = ?').get(uid) || {};
    }

    const now = new Date();
    const timestamp = now.toISOString();

    // Use the current race_start time if present, else warn
    const startRow = db.prepare('SELECT start FROM race_start WHERE id = 1').get();
    if (!startRow || !startRow.start) {
      console.log('⚠️ No race start time set. Please start the race from the dashboard.');
      return;
    }
    const startTime = new Date(startRow.start);
    const splitMs = now - startTime;
    const splitSec = Math.floor(splitMs / 1000);

    db.prepare('INSERT INTO results (uid, timestamp, split) VALUES (?, ?, ?)').run(uid, timestamp, splitSec);
    console.log(`✅ ${participant.name || 'Unknown'} (${uid}) @ ${timestamp} (+${splitSec}s)`);
  };
  reader.on('card', onCard);

  // Pause readline before raw mode
  rl.pause();
  process.stdin.setRawMode(true);
  process.stdin.resume();
  await new Promise(resolve => {
    process.stdin.on('data', function onKey(buf) {
      // 'q' key is 113 (0x71) in ASCII
      if (buf.length === 1 && buf[0] === 0x71) {
        stopped = true;
        reader.removeListener('card', onCard);
        process.stdin.setRawMode(false);
        process.stdin.removeListener('data', onKey);
        rl.resume();
        console.log('\n🛑 Race mode stopped (q pressed)\n');
        resolve();
      }
    });
  });
}

async function getUID(reader) {
  try {
    const cmd = Buffer.from([0xFF, 0xCA, 0x00, 0x00, 0x00]);
    const response = await reader.transmit(cmd, 40);
    return response.slice(0, -2).toString('hex').toUpperCase();
  } catch (err) {
    console.error('❌ Failed to read UID:', err.message);
    return null;
  }
}

function waitForReader(nfc) {
  return new Promise(resolve => {
    nfc.once('reader', reader => {
      console.log(`🔌 Reader connected: ${reader.reader.name}`);
      reader.autoProcessing = false;
      resolve(reader);
    });
  });
}

(module.exports = { archiveResults });
// MAIN
(async () => {
  const nfc = new NFC();
  const reader = await waitForReader(nfc);

  while (true) {
    showMenu();
    const choice = await ask('Select an option: ');

    if (choice === '1') await registerBracelet(reader); // Scan and register mode
    else if (choice === '2') await raceMode(reader);    // Race mode (no timer start/reset)
    else if (choice === '3') await (async () => { archiveResults(); })(); // Archive
    else if (choice === '4') break; // Exit
    else console.log('❓ Invalid option');
  }

  rl.close();
  process.exit(0);
})();
