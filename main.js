const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const gsm = require('./lib/gsmarena');
const pc = require('./lib/phonecity');
const mp = require('./lib/marktplaats');
const { renderTemplate, renderTitle, staatKort, shopBlock, merkGroep, mpColor, CATEGORIES, WINKELTEKST } = require('./lib/mapping');

const DIR = app.getPath('userData');
const DATA_FILE = path.join(DIR, 'data.json');
const LIST_FILE = path.join(DIR, 'modellijst.json');
const SCHERM_FILE = path.join(DIR, 'phonecity-schermen.json');

const DEFAULTS = {
  // kort = winkelnaam vooraan in de titel; tekst = vast winkelblok ({winkel}) onder elke advertentie
  shop: { naam: '', kort: '', adres: '', postcode: '', plaats: '', telefoon: '', email: '', website: '', openingstijden: '', tekst: WINKELTEKST, levering: 'Ophalen of Verzenden' },
  templates: {
    titelToestel: '{winkelkort} | {merk} {model} {opslag} {kleurnl} {staatkort} [& Garantie|& Gar.]',
    titelReparatie: '{winkelkort} | {model} Scherm incl. montage [& Garantie|& Gar.]',
    toestel: '{merk} {model} | {opslag} | {kleurnl} | {staat}\nNu verkrijgbaar bij {winkelnaam}!\n\n• {garantie} maanden garantie\n• Batterijconditie: {batterij}%\n• Opmerking: {opmerking}\n\nSpecificaties:\n{specs}\n\n{winkel}',
    reparatie: '{merk} {model} scherm vervangen, incl. montage & garantie\nScherm kapot? Bij {winkelnaam} vervangen we het snel en vakkundig.\n\n• {garantie} maanden garantie\n• Prijs: € {prijs} incl. montage\n\nOok voor andere schade of problemen kun je bij ons terecht!\n\nPrijslijst schermreparatie:\n{prijslijst}\n\n{winkel}',
    // {prijslijst} in de reparatietekst, gekozen op merk
    prijslijstApple: '', prijslijstSamsung: '', prijslijstOverig: '',
  },
  // Uitwijkcategorie per type als de gewone categorie betaald is (null = niet uitwijken)
  uitwijk: { telefoon: 'toebehoren', smartwatch: 'toebehoren', reparatie: null },
  models: {},
  ads: [],
  lastPrices: {},
  ingelogdGeweest: false,
  browser: 'msedge', // msedge | chrome | firefox, standaard voor deze pc
  winkelfoto: null, // pad naar eigen winkelfoto, gaat altijd als laatste foto mee
  autoPlaatsen: true, // na invullen zelf op "Plaats je advertentie" klikken (alleen gratis)
};

const FOTO_TYPES = ['jpg', 'jpeg', 'png'];
const winkelfoto = () => (data.winkelfoto && fs.existsSync(data.winkelfoto) ? data.winkelfoto : null);
// Kopie in de app-map (gekozen bestand kan later verdwijnen); nieuwe naam per keer zodat de preview ververst
function zetWinkelfoto(ext, buffer) {
  if (data.winkelfoto) fs.rmSync(data.winkelfoto, { force: true });
  data.winkelfoto = null;
  if (buffer) {
    data.winkelfoto = path.join(DIR, `winkelfoto-${Date.now().toString(36)}.${ext}`);
    fs.writeFileSync(data.winkelfoto, buffer);
  }
  save();
  return data;
}

function load() {
  try {
    const saved = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    // nieuwe velden uit DEFAULTS aanvullen zonder opgeslagen waarden te overschrijven
    return { ...DEFAULTS, ...saved, shop: { ...DEFAULTS.shop, ...saved.shop }, templates: { ...DEFAULTS.templates, ...saved.templates } };
  } catch { return structuredClone(DEFAULTS); }
}
let data = load();
if (data.winkelfoto && !fs.existsSync(data.winkelfoto)) data.winkelfoto = null;
mp.setBrowser(DIR, data.browser);
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

// Schermproducten van Phone City, 3 dagen bewaard
async function schermLijst(vers = false) {
  try {
    if (!vers && Date.now() - fs.statSync(SCHERM_FILE).mtimeMs < 3 * 864e5) return JSON.parse(fs.readFileSync(SCHERM_FILE, 'utf8'));
  } catch { /* nog geen lijst */ }
  const list = await pc.fetchSchermen();
  fs.writeFileSync(SCHERM_FILE, JSON.stringify(list));
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
  const isRep = ad.kind === 'reparatie';
  const vars = {
    ...full,
    kleurnl: full.mpKleur.toLowerCase(),
    staatkort: staatKort(full.staat),
    winkelnaam: data.shop.naam,
    winkelkort: data.shop.kort || data.shop.naam,
    specs: gsm.specLines(model.specs),
    prijslijst: data.templates[`prijslijst${merkGroep(model.brand)}`],
    winkel: shopBlock(data.shop),
  };
  full.titel = ad.titel || renderTitle(data.templates[isRep ? 'titelReparatie' : 'titelToestel'], vars);
  const beschrijving = ad.beschrijving || renderTemplate(data.templates[isRep ? 'reparatie' : 'toestel'], vars);
  const uit = model.uitgesloten || [];
  // Schermreparatie: schermfoto's van Phone City, geen foto's van de telefoon.
  // Toestel: eerst eigen foto's van deze kleur, dan GSMArena. Winkelfoto altijd als laatste.
  const kleur = isRep ? [] : model.kleurFotos?.[ad.kleur] || [];
  const fotos = [...kleur, ...(isRep ? model.schermFotos || [] : model.fotos).filter((f) => !uit.includes(f))].filter((f) => fs.existsSync(f));
  if (winkelfoto()) fotos.push(winkelfoto());
  return { full, beschrijving, fotos };
}

const handlers = {
  'data:get': () => data,
  'app:versie': () => app.getVersion(),
  'data:set': (key, value) => {
    data[key] = value; save();
    if (key === 'browser') mp.setBrowser(DIR, value);
    return data;
  },

  'models:search': async (q, smartwatch) => {
    const words = String(q).toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return (await modelList())
      .filter((d) => d.smartwatch === smartwatch && words.every((w) => `${d.brand} ${d.name}`.toLowerCase().includes(w)))
      .slice(0, 30);
  },
  'models:get': async (item, opnieuw) => {
    if (!opnieuw && data.models[item.id]) return data.models[item.id];
    const oud = data.models[item.id];
    data.models[item.id] = { ...oud, ...await gsm.fetchModel(item, path.join(DIR, 'fotos', item.id)), uitgesloten: oud?.uitgesloten || [] };
    save();
    return data.models[item.id];
  },

  // Foto's die niet mee moeten (bijv. een persfoto van de binnenkant), onthouden per model
  'models:fotos': (id, uitgesloten) => {
    const m = data.models[id];
    m.uitgesloten = uitgesloten.filter((f) => m.fotos.includes(f) || m.schermFotos?.includes(f));
    save();
    return m;
  },
  // Eigen foto's per model en kleur (bijv. iPhone 13 Blue), gaan als eerste mee en worden onthouden
  'kleurfotos:toevoegen': async (id, kleur) => {
    const m = data.models[id];
    const { filePaths } = await dialog.showOpenDialog({ title: `Foto's voor ${m.name} ${kleur}`, filters: [{ name: 'Foto', extensions: FOTO_TYPES }], properties: ['openFile', 'multiSelections'] });
    if (!filePaths?.length) return null;
    const dir = path.join(DIR, 'kleurfotos', id);
    fs.mkdirSync(dir, { recursive: true });
    const lijst = (m.kleurFotos ||= {})[kleur] ||= [];
    for (const src of filePaths) {
      const ext = path.extname(src).slice(1).toLowerCase();
      if (!FOTO_TYPES.includes(ext) || lijst.length >= 10) continue;
      const file = path.join(dir, `${kleur.replace(/[^a-z0-9]+/gi, '-')}-${Date.now().toString(36)}${lijst.length}.${ext}`);
      fs.copyFileSync(src, file);
      lijst.push(file);
    }
    save();
    return m;
  },
  'kleurfotos:wis': (id, kleur, file) => {
    const m = data.models[id];
    const lijst = m.kleurFotos?.[kleur] || [];
    if (lijst.includes(file)) fs.rmSync(file, { force: true });
    m.kleurFotos[kleur] = lijst.filter((f) => f !== file);
    if (!m.kleurFotos[kleur].length) delete m.kleurFotos[kleur];
    save();
    return m;
  },
  // Schermfoto's voor schermreparatie: eenmalig per model van Phone City, daarna lokaal
  'models:schermfotos': async (id, opnieuw) => {
    const m = data.models[id];
    if (!opnieuw && m.schermFotos) return m;
    let lijst = await schermLijst(opnieuw);
    if (!pc.matchSchermen(lijst, m.name).length && !opnieuw) lijst = await schermLijst(true); // misschien nieuw in het assortiment
    Object.assign(m, await pc.fetchSchermFotos(lijst, m.name, path.join(DIR, 'schermfotos', id)));
    save();
    return m;
  },

  'ad:preview': (ad) => { const { full, beschrijving } = buildAd(ad); return { titel: full.titel, beschrijving, mpKleur: full.mpKleur }; },
  'ad:lastPrice': (ad) => data.lastPrices[priceKey(ad)] || '',
  'ad:fill': async (ad) => {
    const { full, beschrijving, fotos } = buildAd(ad);
    const uitwijkKey = data.uitwijk[ad.kind];
    const result = await mp.fillAd(full, {
      beschrijving, fotos, shop: data.shop,
      uitwijk: uitwijkKey ? CATEGORIES[uitwijkKey] : null,
      plaatsen: data.autoPlaatsen !== false,
    });
    data.lastPrices[priceKey(ad)] = ad.prijs;
    // beschrijving alleen bewaren als die met de hand is aangepast; anders bij opnieuw plaatsen vers uit sjabloon
    const saved = { ...ad, titel: full.titel, id: ad.id || Date.now().toString(36), ingevuld: new Date().toISOString() };
    if (result.geplaatst) saved.geplaatst = saved.ingevuld;
    data.ads = [saved, ...data.ads.filter((a) => a.id !== saved.id)];
    data.ingelogdGeweest = true;
    save();
    return result;
  },
  'ads:delete': (id) => { data.ads = data.ads.filter((a) => a.id !== id); save(); return data; },
  'listings:get': async () => {
    const list = await mp.fetchListings();
    data.ingelogdGeweest = true; save();
    return list;
  },
  'browser:open': async () => { await mp.openMarktplaats(); },

  'winkelfoto:kies': async () => {
    const { filePaths } = await dialog.showOpenDialog({ filters: [{ name: 'Foto', extensions: FOTO_TYPES }], properties: ['openFile'] });
    if (!filePaths?.length) return null;
    const ext = path.extname(filePaths[0]).slice(1).toLowerCase();
    if (!FOTO_TYPES.includes(ext)) throw new Error('Kies een foto (jpg of png).');
    return zetWinkelfoto(ext, fs.readFileSync(filePaths[0]));
  },
  'winkelfoto:wis': () => zetWinkelfoto(),

  // Instellingen meenemen naar een andere pc (winkel, sjablonen, uitwijk, browser)
  'settings:export': async () => {
    const { filePath } = await dialog.showSaveDialog({ defaultPath: 'marktplaats-poster-instellingen.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (!filePath) return false;
    const { shop, templates, uitwijk, browser } = data;
    const foto = winkelfoto();
    const fotoData = foto && { ext: path.extname(foto).slice(1), base64: fs.readFileSync(foto).toString('base64') };
    fs.writeFileSync(filePath, JSON.stringify({ shop, templates, uitwijk, browser, winkelfoto: fotoData || undefined }, null, 1));
    return true;
  },
  'settings:import': async () => {
    const { filePaths } = await dialog.showOpenDialog({ filters: [{ name: 'JSON', extensions: ['json'] }], properties: ['openFile'] });
    if (!filePaths?.length) return null;
    const imp = JSON.parse(fs.readFileSync(filePaths[0], 'utf8'));
    if (!imp || typeof imp.shop !== 'object' || typeof imp.templates !== 'object') throw new Error('Dit is geen instellingenbestand van Marktplaats Poster.');
    data.shop = { ...DEFAULTS.shop, ...imp.shop };
    data.templates = { ...DEFAULTS.templates, ...imp.templates };
    if (imp.uitwijk) data.uitwijk = { ...DEFAULTS.uitwijk, ...imp.uitwijk };
    if (imp.browser) { data.browser = imp.browser; mp.setBrowser(DIR, data.browser); }
    if (FOTO_TYPES.includes(imp.winkelfoto?.ext) && imp.winkelfoto.base64) zetWinkelfoto(imp.winkelfoto.ext, Buffer.from(imp.winkelfoto.base64, 'base64'));
    save();
    return data;
  },
};

for (const [name, fn] of Object.entries(handlers)) {
  ipcMain.handle(name, async (_e, ...args) => {
    try { return { ok: true, value: await fn(...args) }; } catch (e) { return { ok: false, error: e.message.split('\n')[0] }; }
  });
}

// Maar één app tegelijk: twee apps zouden hetzelfde browserprofiel en data.json delen
if (!app.requestSingleInstanceLock()) app.quit();
let win = null;
app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 1200, height: 860, title: 'Marktplaats Poster', icon: path.join(__dirname, 'renderer', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  if (app.isPackaged) require('electron-updater').autoUpdater.checkForUpdatesAndNotify().catch(() => {});
});

app.on('window-all-closed', () => app.quit());
