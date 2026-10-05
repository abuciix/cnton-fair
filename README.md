# Canton Fair Ledger

Offline phone web-app for logging booths and companies at the Canton Fair. Scan a QR code (business card, badge, booth sign) and the entry fills itself in.

## Features
- **QR scan → auto-fill**: understands vCard, MeCard, WhatsApp/WeChat/mailto/tel/website links, JSON, and `Label: value` text (`Booth:`, `Company:`, `展位:`, `公司:`, `微信:` …).
- **Sticky booth/company** at the top: everything you scan or add is filed under it until you change it.
- **Auto-save (continuous) mode**: scan a stack of cards in a row without any taps.
- **Dedupe/merge** by email, phone, WeChat, WhatsApp or booth+company.
- No QR? Add manually, attach a card/booth photo, star-rate, set follow-up status.
- **Pre-load** a booth list (paste `booth, company` lines) or import CSV/JSON.
- **Export** CSV (opens in Excel, UTF-8 w/ Chinese) and JSON backup.
- Works fully offline; data lives on the phone (IndexedDB). No external servers or CDNs (important in China).

## Using it on your phone
Live camera scanning requires HTTPS (or localhost). Options:
1. Host these static files anywhere with HTTPS (GitHub Pages, Netlify, Vercel — **load it once before you fly; the service worker then caches it for offline use**). Then "Add to Home Screen".
2. Without hosting, open `index.html` directly: live camera won't start, but the **📷 Photo / image** button decodes a QR from a photo and works fine.

Back up regularly (More → Backup JSON / Export CSV); clearing browser data erases the ledger.

## Files
`index.html`, `style.css`, `app.js` (UI/storage/scanner), `parse.js` (QR payload parser), `sw.js` + `manifest.webmanifest` (offline/PWA), `vendor/jsQR.js` (Apache-2.0 QR decoder; the native `BarcodeDetector` is used first when available).
