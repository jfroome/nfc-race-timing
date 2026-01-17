# NFC Race Timing

![Race Results](image.png)

Quick and dirty (mostly vibe coded) race timing system I made for a friend's beer mile birthday party. Uses a basic NFC reader like [this](https://www.amazon.ca/Reader-Copier-Writer-Duplicator-125kHz/dp/B0CYC6JDTM/ref=sr_1_19?dib=eyJ2IjoiMSJ9.8nnj_ySvSn87BvAWsWQT9buS55KDtsBmGH5hirnEu_Qnu8bhiLPzTujVFACi59T6pymmeYbcpeRSBIpUJXLGNAINpoyPNpuHeH4OBMBpOg1lt5wHbkmoMobDljCZznBsj7fpsvM1Eopa4F1kMNIOvoxCNd8luN4WUo0WXOaXXQUx7fgtdHTNh0nNSO165fUaLsmjYnrOzUUiowRq0stdqy3WE1fB81D6r3ualQ_hx_iHPRza0CkAp_W3xSZPVBSm4IXn8TXavqstoAMTgY4LIJQVC68bNcaVgtAQtY5YTeA.SOxhX4rHVKDqInUbkbbwAcJcQqhKO7mRH8_bjLwWizg&dib_tag=se&keywords=nfc+reader&qid=1768657608&sr=8-19)
and works with pretty much any type of nfc tag. We used rubberized bracelets with nfc embedded in them, similar to the ones you get a spa.

## Quick Start

**Requirements:** Node.js 18+, npm, and a PC/SC NFC reader

**Install and run:**

```bash
npm install
node read-nfc.js # starts the commandline prompt for your scanner
node dashboard.js # starts the web app dashboard
```

Open `http://localhost:3000` in your browser. 

## Usage
Use the terminal Option 1 to start the scanner and add tags to the database. Then go to the registration page in the dashboard and update the person's info for each tag there. Use Option 2 to put the scanner in "Race mode" which gets it ready to record the splits.

Click start race when the race starts. Have the participants tap when they finish the race or each time you want to take splits. After the race export using the terminal option 3. "Archive results to CSV" to save and analyze your results. You can also just view the live dashboard at index.html which polls and updates frequently.

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

