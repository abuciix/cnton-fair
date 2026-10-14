// usage: node tests/e2e.test.js   (needs playwright-core + qrcode resolvable; set NODE_PATH)
const { chromium } = require('playwright-core'), QR = require('qrcode'), fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-')), URL = 'file://' + path.resolve(__dirname, '../index.html');
const qr = async (name, text) => { const f = path.join(dir, name + '.png'); await QR.toFile(f, text, { width: 500 }); return f; };
let pass = 0; const ok = (c, m) => { assert.ok(c, 'FAIL: ' + m); pass++; console.log('ok -', m); };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 800 }, acceptDownloads: true });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await p.goto(URL);
  const count = () => p.textContent('#count');
  const scan = async f => { await p.click('#btnScan'); await p.setInputFiles('#scanImg', f); };
  const booths = () => p.$$eval('.item .b', e => e.map(x => x.textContent));
  const companies = () => p.$$eval('.item .c', e => e.map(x => x.firstChild.textContent));

  // 1. scan vCard -> form autofilled with sticky booth, save
  await p.fill('#ctxBooth', '9.1 K12');
  await scan(await qr('v1', 'BEGIN:VCARD\nVERSION:3.0\nFN:Li Wei\nORG:Foshan Lamp Co.\nTEL:+8613800000000\nEMAIL:li@lamp.cn\nEND:VCARD'));
  await p.waitForSelector('#editor:not([hidden])');
  ok(await p.inputValue('[name=company]') === 'Foshan Lamp Co.' && await p.inputValue('[name=booth]') === '9.1 K12', 'QR vCard autofills form and uses sticky booth');
  await p.click('#formSave'); await p.click('#scanClose');
  ok((await count()).startsWith('1 shown'), 'entry saved');

  // 2. duplicate scan (same email) merges, no new row
  await scan(await qr('v2', 'BEGIN:VCARD\nFN:Li Wei\nTITLE:Sales Manager\nEMAIL:li@lamp.cn\nEND:VCARD'));
  await p.waitForSelector('#editor:not([hidden])');
  ok(await p.inputValue('[name=title]') === 'Sales Manager' && await p.inputValue('[name=company]') === 'Foshan Lamp Co.', 'duplicate scan opens existing entry and merges new field');
  await p.click('#formSave'); await p.click('#scanClose');
  ok((await count()).startsWith('1 shown'), 'no duplicate row created');

  // 3. auto-save mode, text QR with labels (Chinese)
  await p.click('#btnScan'); await p.check('#scanAuto'); await p.click('#scanClose');
  await p.fill('#ctxBooth', '3.2 B05'); await p.fill('#ctxCompany', '宁波工具有限公司');
  await scan(await qr('v3', 'MECARD:N:Wang,Mei;TEL:+8613900001111;EMAIL:mei@nb.cn;;'));
  await p.waitForTimeout(500); await p.click('#scanClose');
  ok((await count()).startsWith('2 shown') && (await p.textContent('#list')).includes('宁波工具有限公司'), 'auto-save files scan under sticky booth/company without tapping');

  // 4. persistence across reload
  await p.reload(); await p.waitForSelector('.item');
  ok((await count()).startsWith('2 shown'), 'data persists after reload (IndexedDB)');
  ok(await p.inputValue('#ctxBooth') === '3.2 B05', 'sticky booth persists');

  // 5. bulk paste + sort
  await p.click('[data-tab=more]');
  await p.fill('#bulk', '11.2 D18, Yiwu Toys\n15.3 A02\tShaoxing Textile\n1.1 C07, Alpha Co\n11.2 D18, Yiwu Toys');
  await p.click('#bulkGo'); await p.click('[data-tab=ledger]');
  ok((await count()).startsWith('5 shown'), 'bulk paste adds 3 and skips the duplicate');
  ok((await booths()).join('|') === '1.1 C07|3.2 B05|9.1 K12|11.2 D18|15.3 A02', 'sort by booth number is numeric (9.1 before 11.2)');
  await p.selectOption('#sortBy', 'company');
  const cs = await companies(); ok(JSON.stringify(cs) === JSON.stringify([...cs].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))), 'sort by company is alphabetical');
  await p.reload(); ok(await p.inputValue('#sortBy') === 'company', 'sort choice persists');

  // 6. search + filter
  await p.fill('#search', 'yiwu'); ok((await count()).startsWith('1 shown'), 'search filters list'); await p.fill('#search', '');

  // 7. edit with tricky chars, export CSV, wipe, re-import round trip
  await p.click('.item >> text=Yiwu Toys');
  await p.fill('[name=notes]', 'He said "best price", MOQ 500\nsecond line, 中文'); await p.fill('[name=products]', 'plush, toys'); await p.click('#stars span:nth-child(4)'); await p.click('#formSave');
  await p.click('[data-tab=more]');
  const [d] = await Promise.all([p.waitForEvent('download'), p.click('#exCsv')]);
  const csvPath = path.join(dir, 'out.csv'); await d.saveAs(csvPath);
  const raw = fs.readFileSync(csvPath, 'utf8'); ok(raw.charCodeAt(0) === 0xFEFF && raw.includes('宁波工具有限公司'), 'CSV has BOM and Chinese text');
  const [dj] = await Promise.all([p.waitForEvent('download'), p.click('#exJson')]); const jp = path.join(dir, 'out.json'); await dj.saveAs(jp);
  ok(JSON.parse(fs.readFileSync(jp, 'utf8')).length === 5, 'JSON backup has all 5 entries');
  await p.click('#wipe'); await p.click('[data-tab=ledger]'); ok((await count()).startsWith('0 shown'), 'delete-all works');
  await p.click('[data-tab=more]'); await p.setInputFiles('#imFile', csvPath); await p.click('[data-tab=ledger]'); await p.waitForTimeout(500);
  ok((await count()).startsWith('5 shown'), 'CSV re-import restores 5 entries');
  await p.click('.item >> text=Yiwu Toys');
  ok((await p.inputValue('[name=notes]')) === 'He said "best price", MOQ 500\nsecond line, 中文' && await p.inputValue('[name=rating]') === '4', 'quotes/commas/newlines/Chinese/rating survive CSV round trip');
  await p.click('#formDel'); await p.waitForTimeout(300); ok((await count()).startsWith('4 shown'), 'delete single entry');

  // 8. JSON import merges (no dupes)
  await p.click('[data-tab=more]'); await p.setInputFiles('#imFile', jp); await p.click('[data-tab=ledger]'); await p.waitForTimeout(500);
  ok((await count()).startsWith('5 shown'), 'JSON import merges without duplicating');

  ok(errs.length === 0, 'no JS errors (' + errs.join('; ') + ')');
  await b.close(); console.log('\n' + pass + ' e2e checks passed');
})().catch(e => { console.error(e.message); process.exit(1); });
