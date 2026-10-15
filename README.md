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

## Using it on your phone (no hosting): `dist/canton-ledger.html`
This is the whole app in one file (`node build.js` regenerates it).
1. Send the file to your phone (email, WeChat file transfer, USB, cloud drive) and save it to the phone's storage.
2. Open it in **Chrome (Android)**. Bookmark it or use ⋮ → Add to Home screen.
3. Tap **Scan QR → 📷 Photo / image**: the phone's camera app opens, take a picture of the QR code and the form fills in. (Live video scanning needs HTTPS and is not available when opened as a file.)

Notes
- Data is stored per file location. Always open the same file from the same place; a moved or re-downloaded copy starts with an empty ledger.
- iPhone Safari has trouble opening local HTML files; Android Chrome is recommended.
- Export a CSV/JSON backup every day (More tab).

With HTTPS hosting (optional), serve the repo root; the service worker then caches everything for offline use and live camera scanning works.

## Files
`index.html`, `style.css`, `app.js` (UI/storage/scanner), `parse.js` (QR payload parser), `sw.js` + `manifest.webmanifest` (offline/PWA), `vendor/jsQR.js` (Apache-2.0 QR decoder; the native `BarcodeDetector` is used first when available).

## Tests
- `node tests/parse.test.js` – QR payload parser (no dependencies).
- `node tests/e2e.test.js` – full app flow in headless Chromium (scan from image, merge, auto-save, persistence, sort, CSV/JSON round-trip, delete). Needs `playwright-core` and `qrcode` on `NODE_PATH`.
- `node tests/camera.test.js <video.y4m>` – live-camera scanning using Chromium's fake camera fed with a QR video.
