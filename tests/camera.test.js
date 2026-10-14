// Live-camera path using Chromium's fake video device. usage: node tests/camera.test.js <video.y4m>
const { chromium } = require('playwright-core'), path = require('path'), assert = require('assert');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-video-capture=' + path.resolve(process.argv[2])] });
  const p = await (await b.newContext({ viewport: { width: 390, height: 800 }, permissions: ['camera'] })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await p.goto('file://' + path.resolve(__dirname, '../index.html'));
  await p.click('#btnScan');
  await p.waitForSelector('#editor:not([hidden])', { timeout: 15000 });
  assert.equal(await p.inputValue('[name=company]'), 'Live Camera Ltd');
  assert.equal(await p.inputValue('[name=email]'), 'cam@live.com');
  assert.deepEqual(errs, []);
  console.log('ok - live camera frame decoded and form autofilled');
  await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
