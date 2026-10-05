// QR / text payload -> ledger fields. Pure functions, usable in browser and node.
(function (root) {
  const FIELDS = ['booth', 'company', 'contact', 'title', 'phone', 'email', 'wechat', 'whatsapp', 'website', 'address', 'products', 'category', 'phase', 'rating', 'followup', 'notes'];

  function unfold(t) { return t.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, ''); }

  function parseVCard(text) {
    const out = {};
    const phones = [];
    for (const line of unfold(text).split('\n')) {
      const i = line.indexOf(':');
      if (i < 0) continue;
      const head = line.slice(0, i).toUpperCase();
      const val = line.slice(i + 1).trim();
      const key = head.split(';')[0].replace(/^ITEM\d+\./, '');
      if (!val) continue;
      if (key === 'FN') out.contact = val;
      else if (key === 'N' && !out.contact) out.contact = val.split(';').filter(Boolean).reverse().join(' ').trim();
      else if (key === 'ORG') out.company = val.split(';').filter(Boolean).join(' - ');
      else if (key === 'TITLE' || key === 'ROLE') out.title = val;
      else if (key === 'TEL') phones.push(val);
      else if (key === 'EMAIL' && !out.email) out.email = val;
      else if (key === 'URL' && !out.website) out.website = val;
      else if (key === 'ADR') out.address = val.split(';').filter(Boolean).join(', ');
      else if (key === 'NOTE') out.notes = val;
      else if (key.includes('WECHAT') || /WECHAT|WEIXIN/.test(head)) out.wechat = val;
      else if (key.includes('WHATSAPP') || /WHATSAPP/.test(head)) out.whatsapp = val;
    }
    if (phones.length) out.phone = phones.join(' / ');
    return out;
  }

  function parseMeCard(text) {
    const out = {};
    const body = text.replace(/^MECARD:/i, '');
    const parts = body.split(/(?<!\\);/);
    const phones = [];
    for (const p of parts) {
      const i = p.indexOf(':');
      if (i < 0) continue;
      const k = p.slice(0, i).toUpperCase();
      const v = p.slice(i + 1).replace(/\\([;:,\\])/g, '$1').trim();
      if (!v) continue;
      if (k === 'N') out.contact = v.split(',').reverse().join(' ').trim();
      else if (k === 'ORG') out.company = v;
      else if (k === 'TEL') phones.push(v);
      else if (k === 'EMAIL') out.email = v;
      else if (k === 'URL') out.website = v;
      else if (k === 'ADR') out.address = v.replace(/,+/g, ', ').trim();
      else if (k === 'NOTE') out.notes = v;
    }
    if (phones.length) out.phone = phones.join(' / ');
    return out;
  }

  const LABELS = {
    booth: /^(booth|booth\s*(no|number|#)|stand|展位号?|展位)$/i,
    company: /^(company|company\s*name|org|organization|exhibitor|firm|公司名?称?|企业)$/i,
    contact: /^(name|contact|contact\s*person|联系人|姓名)$/i,
    title: /^(title|position|job\s*title|职位)$/i,
    phone: /^(tel|phone|mobile|cell|telephone|电话|手机)$/i,
    email: /^(e-?mail|邮箱|电子邮件)$/i,
    wechat: /^(we-?chat|weixin|微信)$/i,
    whatsapp: /^(whats-?app)$/i,
    website: /^(web|website|url|site|网址|官网)$/i,
    address: /^(address|addr|地址)$/i,
    products: /^(products?|main\s*products?|产品|主营产品)$/i,
    category: /^(category|industry|行业|类别)$/i,
    phase: /^(phase|期数|展期)$/i,
    notes: /^(note|notes|remark|remarks|备注)$/i
  };

  function applyLabel(out, label, val) {
    label = label.trim();
    for (const f in LABELS) if (LABELS[f].test(label)) { if (!out[f]) out[f] = val; return true; }
    return false;
  }

  function parseJSON(text) {
    let o;
    try { o = JSON.parse(text); } catch (e) { return null; }
    if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
    const out = {};
    for (const k of Object.keys(o)) {
      if (o[k] == null || typeof o[k] === 'object') continue;
      const v = String(o[k]).trim();
      if (FIELDS.includes(k)) out[k] = v; else applyLabel(out, k, v);
    }
    return Object.keys(out).length ? out : null;
  }

  function parseURL(raw) {
    const t = raw.trim();
    if (/^mailto:/i.test(t)) return { email: decodeURIComponent(t.slice(7).split('?')[0]) };
    if (/^tel:/i.test(t)) return { phone: t.slice(4) };
    if (/^(weixin|wxp):\/\//i.test(t) || /(^|\/\/)(u\.wechat\.com|weixin\.qq\.com|mp\.weixin\.qq\.com)/i.test(t)) return { wechat: t };
    let m = t.match(/^https?:\/\/(?:wa\.me|api\.whatsapp\.com\/send\?phone=)\/?(\+?\d+)/i);
    if (m) return { whatsapp: m[1] };
    if (/^https?:\/\//i.test(t)) return { website: t };
    if (/^www\./i.test(t) || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(t) && !/\s/.test(t) && !/@/.test(t)) return { website: t };
    return null;
  }

  function parsePayload(raw) {
    const text = String(raw || '').trim();
    if (!text) return { fields: {}, kind: 'empty' };
    if (/^BEGIN:VCARD/i.test(text)) return { fields: parseVCard(text), kind: 'vCard' };
    if (/^MECARD:/i.test(text)) return { fields: parseMeCard(text), kind: 'MeCard' };
    const j = parseJSON(text);
    if (j) return { fields: j, kind: 'JSON' };
    const u = parseURL(text);
    if (u) return { fields: u, kind: 'link' };
    // "Label: value" lines
    const out = {};
    const rest = [];
    for (const line of text.split(/\n/)) {
      const m = line.match(/^\s*([^:：]{1,30})[:：]\s*(.+)$/);
      if (!(m && applyLabel(out, m[1], m[2].trim()))) if (line.trim()) rest.push(line.trim());
    }
    if (Object.keys(out).length) { if (rest.length) out.notes = [out.notes, rest.join(' | ')].filter(Boolean).join(' | '); return { fields: out, kind: 'text' }; }
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return { fields: { email: text }, kind: 'email' };
    return { fields: { notes: text }, kind: 'text (unrecognised)' };
  }

  const api = { FIELDS, parsePayload, parseVCard, parseMeCard };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CFParse = api;
})(typeof self !== 'undefined' ? self : this);
