// GSMArena: modellijst (quicksearch), specpagina en officiële foto's.
// De zoekpagina zit achter Cloudflare; deze drie bronnen niet.
const fs = require('fs');
const path = require('path');

const BASE = 'https://www.gsmarena.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

async function get(url, type = 'text') {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Referer: BASE + '/' } });
  if (!res.ok) throw new Error(`GSMArena gaf ${res.status} voor ${url}`);
  return type === 'buffer' ? Buffer.from(await res.arrayBuffer()) : res.text();
}

// Volledige modellijst: [{id, brand, name, img, smartwatch}]
async function fetchModelList() {
  const home = await get(BASE + '/');
  const file = (home.match(/quicksearch-\d+\.jpg/) || [])[0];
  if (!file) throw new Error('Modellijst-link niet gevonden op GSMArena');
  return parseModelList(JSON.parse(await get(`${BASE}/${file}`)));
}

function parseModelList([brands, devices]) {
  return devices.map(([brandId, id, name, keywords, img]) => ({
    id: String(id), brand: brands[brandId] || '', name, img,
    smartwatch: /smartwatch/i.test(keywords || ''),
  }));
}

const decode = (s) => s.replace(/<script[\s\S]*?(<\/script>|$)/gi, '').replace(/<br\s*\/?>/gi, ', ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();

function parseSpecs(html) {
  const raw = {};
  for (const m of html.matchAll(/data-spec="([^"]+)"[^>]*>([\s\S]*?)<\/(?:td|span|div)>/g)) {
    if (!(m[1] in raw)) raw[m[1]] = decode(m[2]);
  }
  const storages = [...new Set((raw.internalmemory || '').match(/\d+\s?(?:GB|TB)(?=\s+\d+\s?GB RAM)/g) || [])]
    .map((s) => s.replace(/\s/g, ''));
  const ram = [...new Set((raw.internalmemory || '').match(/\d+\s?GB(?= RAM)/g) || [])].map((s) => s.replace(/\s/g, ''));
  const net = /5G/.test(raw.nettech || '') ? '5G' : /LTE/.test(raw.nettech || '') ? '4G' : '';
  const ghz = ((raw.cpu || '').match(/[\d.]+\s?GHz/g) || []).map((g) => parseFloat(g));
  return {
    naam: raw.modelname || '',
    chipset: raw.chipset || '',
    cpu: raw.cpu || '',
    maxGhz: ghz.length ? Math.max(...ghz) : null,
    scherm: [raw.displaysize && raw.displaysize.split(',')[0], raw.displaytype && raw.displaytype.split(',')[0]].filter(Boolean).join(' '),
    resolutie: (raw.displayresolution || '').split(',')[0],
    camera: raw['camerapixels-hl'] ? `${raw['camerapixels-hl']} MP` : '',
    cameraMp: raw['camerapixels-hl'] || '',
    batterij: raw.batdescription1 || '',
    os: /ios|watchos/i.test(raw.os || '') ? 'iOS' : /android|wear os/i.test(raw.os || '') ? 'Android' : '',
    osVersie: raw.os || '',
    netwerk: net,
    nfc: /^yes/i.test(raw.nfc || ''),
    opslag: storages,
    ram,
    kleuren: (raw.colors || '').split(',').map((c) => c.trim()).filter(Boolean),
    jaar: (raw.year || '').match(/\d{4}/)?.[0] || '',
  };
}

// Officiële renders staan op fdn2.gsmarena.com/vv/pics/ (geen lifestyle/review-foto's).
function parsePictures(html) {
  return [...new Set([...html.matchAll(/<img[^>]*\ssrc="(https:\/\/fdn2?\.gsmarena\.com\/vv\/pics\/[^"]+)"/g)].map((m) => m[1]))];
}

// Specs + foto's ophalen, foto's lokaal opslaan in dir. Geeft model-object terug.
async function fetchModel(item, dir) {
  const [specHtml, picHtml] = await Promise.all([get(`${BASE}/x-${item.id}.php`), get(`${BASE}/x-pictures-${item.id}.php`)]);
  const specs = parseSpecs(specHtml);
  let urls = parsePictures(picHtml);
  if (!urls.length && item.img) urls = [`https://fdn2.gsmarena.com/vv/bigpic/${item.img}`];
  fs.mkdirSync(dir, { recursive: true });
  const fotos = [];
  for (const [i, url] of urls.slice(0, 10).entries()) {
    const file = path.join(dir, `${String(i + 1).padStart(2, '0')}${path.extname(new URL(url).pathname) || '.jpg'}`);
    try { fs.writeFileSync(file, await get(url, 'buffer')); fotos.push(file); } catch { /* foto overslaan, rest gaat door */ }
  }
  return { ...item, specs, fotos, opgehaald: new Date().toISOString() };
}

// Specregels voor in de advertentietekst
function specLines(s) {
  return [
    s.chipset && `Processor: ${s.chipset}${s.maxGhz ? ` (tot ${s.maxGhz} GHz)` : ''}`,
    s.scherm && `Scherm: ${s.scherm}${s.resolutie ? `, ${s.resolutie}` : ''}`,
    s.camera && `Camera: ${s.camera}`,
    s.batterij && `Batterij: ${s.batterij}`,
    s.netwerk && `Netwerk: ${s.netwerk}${s.nfc ? ', NFC' : ''}`,
    s.osVersie && `Software: ${s.osVersie.replace(/upgradable to/i, 'update tot').replace(/,\s*up to \d+ major (OS )?(upgrades|updates)/i, '')}`,
  ].filter(Boolean).map((l) => `• ${l}`).join('\n');
}

module.exports = { fetchModelList, parseModelList, parseSpecs, parsePictures, fetchModel, specLines };
