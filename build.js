// Builds dist/canton-ledger.html: one self-contained file (CSS + JS + QR decoder inlined).
const fs = require('fs'), r = f => fs.readFileSync(f, 'utf8');
let h = r('index.html');
const safe = s => s.replace(/<\/script/gi, '<\\/script');
h = h.replace(/<link rel="manifest"[^>]*>\n?/, '').replace(/<link rel="icon"[^>]*>\n?/, '<link rel="icon" href="data:image/svg+xml;base64,' + Buffer.from(r('icons/icon.svg')).toString('base64') + '">\n')
  .replace('<link rel="stylesheet" href="style.css">', () => '<style>' + r('style.css') + '</style>')
  .replace('<script src="vendor/jsQR.js"></script>', () => '<script>' + safe(r('vendor/jsQR.js')) + '</script>')
  .replace('<script src="parse.js"></script>', () => '<script>' + safe(r('parse.js')) + '</script>')
  .replace('<script src="app.js"></script>', () => '<script>' + safe(r('app.js')) + '</script>');
fs.writeFileSync('dist/canton-ledger.html', h);
console.log('dist/canton-ledger.html', (h.length / 1024).toFixed(0) + ' KB');
