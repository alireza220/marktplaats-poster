const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const gsm = require('./lib/gsmarena');
const mp = require('./lib/marktplaats');
const { renderTemplate, shopBlock, adTitle, mpColor, CATEGORIES } = require('./lib/mapping');

const DIR = app.getPath('userData');
const DATA_FILE = path.join(DIR, 'data.json');
const LIST_FILE = path.join(DIR, 'modellijst.json');
const PROFILE_DIR = path.join(DIR, 'edge-profiel');

const DEFAULTS = {
  shop: { naam: '', adres: '', postcode: '', plaats: '', telefoon: '', email: '', website: '', openingstijden: '', extra: 'Inruil mogelijk. Betalen met pin of contant.', levering: 'Ophalen' },
  templates: {
    toestel: '{merk} {model} {opslag} – {kleur}\n\nStaat: {staat}\nBatterijconditie: {batterij}%\nGarantie: {garantie} maanden\nOpmerking: {opmerking}\n\nSpecificaties:\n{specs}\n\n{winkel}',
    reparatie: 'Scherm kapot? Wij vervangen het scherm van je {merk} {model} snel en vakkundig.\n\nPrijs: € {prijs} inclusief montage\nGarantie: {garantie} maanden\n\nMaak een afspraak of loop gewoon binnen.\n\n{winkel}',
  },
  // Uitwijkcategorie per type als de gewone categorie betaald is (null = niet uitwijken)
  uitwijk: { telefoon: 'toebehoren', smartwatch: 'toebehoren', reparatie: null },
  models: {},
  ads: [],
  lastPrices: {},
  ingelogdGeweest: false,
};

function load() {
  try { return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) }; } catch { return structuredClone(DEFAULTS); }
}
let data = load();
function save() {
  // eerst naar tmp, dan hernoemen: een crash tijdens schrijven sloopt data.json niet
  fs.writeFileSync(DATA_FILE + '.tmp', JSON.stringify(data, null, 1));
  fs.renameSync(DATA_FILE + '.tmp', DATA_FILE);
}

async function modelList() {
  try {
    const stat = fs.statSync(LIST_FILE);
    if (Date.now() - stat.mtimeMs < 7 * 864e5) return JSON.parse(fs.readFileSync(LIST_FILE, 'utf8'));
  } catch { /* nog geen lijst */ }
  const list = await gsm.fetchModelList();
  fs.writeFileSync(LIST_FILE, JSON.stringify(list));
  return list;
}

const priceKey = (ad) => [ad.kind, ad.modelId, ad.opslag, ad.staat].join('|');

function buildAd(ad) {
  const model = data.models[ad.modelId];
  const full = {
    ...ad,
    merk: model.brand,
    model: model.name,
    os: model.specs.os,
    cameraMp: model.specs.cameraMp,
    mpKleur: ad.mpKleur || mpColor(ad.kleur),
  };
  full.titel = ad.titel || adTitle(full);
  const tpl = data.templates[ad.kind === 'reparatie' ? 'reparatie' : 'toestel'];
  const beschrijving = ad.beschrijving || renderTemplate(tpl, {
    ...full, specs: gsm.specLines(model.specs), winkel: shopBlock(data.shop),
  });
  return { full, beschrijving, fotos: model.fotos.filter((f) => fs.existsSync(f)) };
}

const handlers = {
  'data:get': () => data,
  'data:set': (key, value) => { data[key] = value; save(); return data; },

  'models:search': async (q, smartwatch) => {
    const words = String(q).toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return (await modelList())
      .filter((d) => d.smartwatch === smartwatch && words.every((w) => `${d.brand} ${d.name}`.toLowerCase().includes(w)))
      .slice(0, 30);
  },
  'models:get': async (item, opnieuw) => {
    if (!opnieuw && data.models[item.id]) return data.models[item.id];
    data.models[item.id] = await gsm.fetchModel(item, path.join(DIR, 'fotos', item.id));
    save();
    return data.models[item.id];
  },

  'ad:preview': (ad) => { const { full, beschrijving } = buildAd(ad); return { titel: full.titel, beschrijving, mpKleur: full.mpKleur }; },
  'ad:lastPrice': (ad) => data.lastPrices[priceKey(ad)] || '',
  'ad:fill': async (ad) => {
    const { full, beschrijving, fotos } = buildAd(ad);
    const uitwijkKey = data.uitwijk[ad.kind];
    const result = await mp.fillAd(full, {
      profileDir: PROFILE_DIR, beschrijving, fotos, shop: data.shop,
      uitwijk: uitwijkKey ? CATEGORIES[uitwijkKey] : null,
    });
    data.lastPrices[priceKey(ad)] = ad.prijs;
    // beschrijving alleen bewaren als die met de hand is aangepast; anders bij opnieuw plaatsen vers uit sjabloon
    const saved = { ...ad, titel: full.titel, id: ad.id || Date.now().toString(36), ingevuld: new Date().toISOString() };
    data.ads = [saved, ...data.ads.filter((a) => a.id !== saved.id)];
    data.ingelogdGeweest = true;
    save();
    return result;
  },
  'ads:delete': (id) => { data.ads = data.ads.filter((a) => a.id !== id); save(); return data; },
  'listings:get': async () => {
    const list = await mp.fetchListings(PROFILE_DIR);
    data.ingelogdGeweest = true; save();
    return list;
  },
  'browser:open': async () => { await mp.getPage(PROFILE_DIR); },
};

for (const [name, fn] of Object.entries(handlers)) {
  ipcMain.handle(name, async (_e, ...args) => {
    try { return { ok: true, value: await fn(...args) }; } catch (e) { return { ok: false, error: e.message.split('\n')[0] }; }
  });
}

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1200, height: 860, title: 'Marktplaats Poster',
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  if (app.isPackaged) require('electron-updater').autoUpdater.checkForUpdatesAndNotify().catch(() => {});
});

app.on('window-all-closed', () => app.quit());
