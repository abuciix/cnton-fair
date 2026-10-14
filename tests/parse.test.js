const assert = require('assert');
const { parsePayload: p } = require('../parse.js');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok -', name); };

t('vCard', () => { const r = p('BEGIN:VCARD\nVERSION:3.0\nFN:Li Wei\nORG:Foshan Lamp Co.;\nTITLE:Sales\nTEL;TYPE=CELL:+86 138 0000 0000\nTEL:+86 757 111\nEMAIL:li@lamp.cn\nURL:https://lamp.cn\nEND:VCARD'); assert.equal(r.kind, 'vCard'); assert.equal(r.fields.company, 'Foshan Lamp Co.'); assert.equal(r.fields.phone, '+86 138 0000 0000 / +86 757 111'); assert.equal(r.fields.email, 'li@lamp.cn'); });
t('vCard N only + folded line', () => { const r = p('BEGIN:VCARD\nN:Wang;Mei;;;\nNOTE:long\n  note\nEND:VCARD'); assert.equal(r.fields.contact, 'Mei Wang'); });
t('MeCard', () => { const r = p('MECARD:N:Wang,Mei;ORG:ABC Ltd;TEL:+8613900001111;EMAIL:m@abc.com;;'); assert.equal(r.fields.contact, 'Mei Wang'); assert.equal(r.fields.company, 'ABC Ltd'); });
t('Chinese labels', () => { const r = p('展位: 9.1 K12\n公司：佛山灯具有限公司\n微信: wxid_abc\n联系人: 李伟'); assert.equal(r.fields.booth, '9.1 K12'); assert.equal(r.fields.company, '佛山灯具有限公司'); assert.equal(r.fields.wechat, 'wxid_abc'); assert.equal(r.fields.contact, '李伟'); });
t('JSON', () => { const r = p('{"booth":"1.2A03","公司":"X","tel":"1"}'); assert.equal(r.fields.booth, '1.2A03'); assert.equal(r.fields.company, 'X'); });
t('links', () => {
  assert.equal(p('https://wa.me/8613800000000').fields.whatsapp, '8613800000000');
  assert.equal(p('mailto:a@b.com?subject=x').fields.email, 'a@b.com');
  assert.equal(p('tel:+8613800000000').fields.phone, '+8613800000000');
  assert.equal(p('https://example.com/x').fields.website, 'https://example.com/x');
  assert.equal(p('www.example.com').fields.website, 'www.example.com');
  assert.ok(p('https://u.wechat.com/abc').fields.wechat);
});
t('fallback + empty', () => { assert.equal(p('hello world').fields.notes, 'hello world'); assert.equal(p('').kind, 'empty'); assert.equal(p(null).kind, 'empty'); });
console.log(n + ' parser tests passed');
