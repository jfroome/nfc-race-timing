# NFC Race Timing

![Race Results](image.png)

A lightweight race timing system using NFC tags, Express, and SQLite.

## Quick Start

**Requirements:** Node.js 18+, npm, and optionally a PC/SC NFC reader

**Install and run:**
```bash
npm install
node dashboard.js
```

Open `http://localhost:3000` in your browser.

**Optional: NFC reader**
```bash
node read-nfc.js
```

## Usage

**Dashboard:** `index.html` - view race timer, results, and controls  
**Register:** `register.html` - add/edit participants and bibs  
**Participant:** `participant.html` - view individual split times

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/race/start` | POST | Start the race |
| `/api/race/stop` | POST | Stop the race |
| `/api/scan-uid` | POST | Record a scanned UID |
| `/api/participants` | GET | List all participants |
| `/api/register` | POST | Register a new participant |
| `/api/participants/update` | POST | Update participant name/bib |
| `/results` | GET | Flat list of all results |
| `/grouped-results` | GET | Results grouped by participant |
| `/results/:uid` | GET | Results for one participant |
| `/start` | GET | Get race start/stop times |

## Database

SQLite database (`race-timing.db`) is created automatically on first run.

**Tables:**
- `participants` - name, bib, registration dates
- `results` - scan timestamps and split numbers
- `race_start` - race start/stop times

To reset everything, delete `race-timing.db` and restart the server.

## Troubleshooting

**Port already in use:** Change `PORT` in `dashboard.js`

**Database errors:** Delete `race-timing.db` and restart

## Contributing

PRs welcome. Keep changes small and test before submitting.

## License

MIT License

Copyright (c) 2025

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
MIT-style: use as you like, attribution appreciated.
