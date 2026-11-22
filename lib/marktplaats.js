// Bestuurt een eigen browservenster (vast profiel per browser = 1x inloggen) en vult het plaatsingsformulier in.
// Daarna klikt de app zelf op "Plaats je advertentie" (alleen als gratis en opts.plaatsen), anders doet de gebruiker dat.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium, firefox } = require('playwright-core');
const { categoryFor, plaatsUrl, matchOption, wantedForLabel } = require('./mapping');

const BROWSERS = {
  msedge: { naam: 'Microsoft Edge', profiel: 'edge-profiel' },
  chrome: { naam: 'Google Chrome', profiel: 'chrome-profiel' },
  firefox: { naam: 'Firefox', profiel: 'firefox-profiel' },
};

let context = null;
let actief = null;   // browser van de huidige context
let browser = 'msedge';
let profileRoot = null;

function setBrowser(root, keuze) {
  profileRoot = root;
  browser = BROWSERS[keuze] ? keuze : 'msedge';
}

// Playwright kan alleen zijn eigen Firefox-build besturen; die eenmalig downloaden (~90 MB).
function installFirefox() {
  if (fs.existsSync(firefox.executablePath())) return Promise.resolve();
  const cli = path.join(path.dirname(require.resolve('playwright-core/package.json')), 'cli.js').replace('app.asar', 'app.asar.unpacked');
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [cli, 'install', 'firefox'], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: 'ignore' });
    p.on('error', reject);
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`Firefox downloaden mislukt (code ${code})`))));
  });
}

async function launch() {
  const dir = path.join(profileRoot, BROWSERS[browser].profiel);
  if (browser === 'firefox') {
    await installFirefox();
    return firefox.launchPersistentContext(dir, { headless: false, viewport: null });
  }
  try {
    return await chromium.launchPersistentContext(dir, { channel: browser, headless: false, viewport: null, chromiumSandbox: true, args: ['--start-maximized'] });
  } catch (e) {
    if (/is not found|executable doesn't exist|Chromium distribution/i.test(e.message)) throw new Error(`${BROWSERS[browser].naam} is niet geïnstalleerd op deze pc. Kies een andere browser bij Instellingen.`);
    if (/existing browser session|profile is already in use/i.test(e.message)) throw new Error(`Het Marktplaats-venster (${BROWSERS[browser].naam}) is nog open van een eerdere keer. Sluit dat venster en probeer opnieuw.`);
    throw e;
  }
}

// Eén browser tegelijk: start de app al een venster (bijv. advertenties ophalen bij opstarten), dan daarop wachten
let starten = null;
async function getPage() {
  if (context && actief !== browser) { await context.close().catch(() => {}); context = null; }
  if (!context) {
    starten ||= launch().then((ctx) => {
      context = ctx;
      actief = browser;
      ctx.on('close', () => { if (context === ctx) context = null; });
    }).finally(() => { starten = null; });
    await starten;
  }
  const page = context.pages().find((p) => !p.isClosed()) || await context.newPage();
  await page.bringToFront();
  return page;
}

// Na een login-redirect wachten tot de gebruiker zelf heeft ingelogd (max 5 min).
async function gotoLoggedIn(page, url, readySelector) {
  await page.goto(url);
  if (page.url().includes('/identity/')) {
    await page.waitForURL((u) => !u.pathname.includes('/identity/'), { timeout: 300000 });
    if (!page.url().startsWith(url.split('?')[0])) await page.goto(url);
  }
  if (readySelector) await page.waitForSelector(readySelector, { timeout: 30000 });
}

async function isPaid(page) {
  const text = await page.locator('body').innerText();
  return text.includes('betaalde categorie') || !text.includes('Plaats je gratis advertentie');
}

// ad: {kind, merk, model, opslag, kleur, mpKleur, staat, batterij, garantie, prijs, os, cameraMp, titel}
// opts: {beschrijving, fotos[], uitwijk (categorie|null), shop, plaatsen}
async function fillAd(ad, opts) {
  const log = [];
  const step = async (naam, fn) => {
    try { const info = await fn(); log.push({ ok: info !== false, naam, info: info === false ? 'niet gevonden' : info || '' }); } catch (e) { log.push({ ok: false, naam, info: e.message.split('\n')[0] }); }
  };
  const page = await getPage();

  let cat = categoryFor(ad.kind, ad.merk);
  await gotoLoggedIn(page, plaatsUrl(cat, ad.titel), '#title_nl-NL');
  let betaald = await isPaid(page);
  if (betaald && opts.uitwijk) {
    log.push({ ok: true, naam: 'Categorie', info: `${cat.naam} is betaald → uitwijken naar ${opts.uitwijk.naam}` });
    cat = opts.uitwijk;
    await gotoLoggedIn(page, plaatsUrl(cat, ad.titel), '#title_nl-NL');
    betaald = await isPaid(page);
  }
  log.push({ ok: !betaald, naam: 'Gratis plaatsen', info: betaald ? `Let op: ${cat.naam} is betaald` : `${cat.naam} is gratis` });

  if (opts.fotos.length) {
    await step('Foto\'s', async () => {
      await page.setInputFiles('#imageUploader-hiddenInput', opts.fotos);
      await page.getByText(`${opts.fotos.length}/24`).first().waitFor({ timeout: 90000 });
      return `${opts.fotos.length} geüpload`;
    });
  }

  await step('Titel', () => page.fill('#title_nl-NL', ad.titel));

  await step('Beschrijving', async () => {
    const editor = page.locator('#DescriptionEditor_nl-NL');
    await editor.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Delete');
    for (const [i, line] of opts.beschrijving.split('\n').entries()) {
      if (i) await page.keyboard.press('Enter');
      if (line) await page.keyboard.insertText(line);
    }
  });

  // Kenmerken: per label de beste optie kiezen (namen/opties verschillen per merk)
  const selects = await page.$$eval('select[name*="Attribute"]', (els) => els.map((e) => ({
    name: e.name,
    label: ((e.id && document.querySelector(`label[for="${CSS.escape(e.id)}"]`)?.innerText) || '').replace(/\(verplicht\)/, '').trim(),
    options: [...e.options].map((o) => ({ value: o.value, text: o.text.trim() })),
  })));
  for (const s of selects) {
    const wanted = wantedForLabel(s.label, ad);
    if (!wanted) continue;
    const value = matchOption(s.options, wanted);
    await step(s.label, async () => value !== null && (await page.selectOption(`select[name="${s.name}"]`, value), value));
  }

  const fillIf = async (naam, selector, value) => {
    if (!value || !(await page.locator(selector).count())) return;
    await step(naam, () => page.fill(selector, String(value)));
  };
  await fillIf('Merk', 'input[name="textAttribute[brand]"]', ad.merk);
  await fillIf('Batterijconditie', 'input[name="numericAttribute[battery health]"]', ad.batterij);

  if (ad.kind === 'reparatie' && Number(ad.garantie) > 0) {
    await step('Service: Garantie', async () => {
      const id = await page.$$eval('input[type=checkbox][name*="Attribute"]', (els) => els.find((e) => document.querySelector(`label[for="${CSS.escape(e.id)}"]`)?.innerText.trim() === 'Garantie')?.id);
      if (!id) return false;
      await page.check(`[id="${id}"]`, { force: true });
    });
  }

  await step('Prijs', async () => {
    await page.selectOption('#Dropdown-prijstype', 'FIXED');
    await page.fill('input[name="price.value"]', String(ad.prijs).replace('.', ','));
  });

  if (opts.shop.levering) {
    await step('Levering', () => page.check(`input[name="deliveryMethod"][value="${opts.shop.levering}"]`, { force: true }));
  }
  await fillIf('Postcode', '#postCode', opts.shop.postcode && opts.shop.postcode.replace(/\s/g, ''));
  if (await page.locator('#feature-FREE').count()) await step('Advertentievorm: Gratis', () => page.check('#feature-FREE', { force: true }));

  // Gratis: zelf plaatsen. Betaald nooit: dan blijft de knop gemarkeerd staan voor de gebruiker.
  let geplaatst = false;
  if (opts.plaatsen && !betaald) geplaatst = await plaats(page, log);
  if (!geplaatst) {
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => /Plaats je advertentie|Naar betalen/.test(b.innerText));
      if (btn) { btn.scrollIntoView({ block: 'center' }); btn.style.outline = '4px solid #f5a623'; btn.style.outlineOffset = '3px'; }
    });
  }
  return { log, betaald, categorie: cat.naam, geplaatst, url: geplaatst ? page.url() : null };
}

// Klikt op "Plaats je advertentie" en wacht tot Marktplaats het formulier verlaat of de plaatsing bevestigt.
// Blijft het formulier staan, dan staan er fouten op: die komen in het log.
async function plaats(page, log) {
  const knop = page.getByRole('button', { name: /Plaats je (gratis )?advertentie/i }).first();
  if (!(await knop.count())) { log.push({ ok: false, naam: 'Plaatsen', info: 'knop niet gevonden, klik zelf op Plaats je advertentie' }); return false; }
  await page.waitForTimeout(1500); // editor en foto's laten bijwerken
  const start = new URL(page.url()).pathname;
  await knop.click();
  const klaar = await page.waitForFunction((pad) => location.pathname !== pad || /advertentie (staat online|is geplaatst)|gefeliciteerd/i.test(document.body.innerText), start, { timeout: 60000 })
    .then(() => true, () => false);
  if (klaar && /betaal|payment|checkout/i.test(page.url())) {
    log.push({ ok: false, naam: 'Plaatsen', info: 'Marktplaats vraagt om te betalen. Niet geplaatst, rond dit zelf af of annuleer.' });
    return false;
  }
  if (!klaar) {
    const fouten = await page.$$eval('[role=alert], [class*="error" i], [class*="Error"]', (els) => [...new Set(els.map((e) => e.innerText.trim()).filter((t) => t && t.length < 200))].slice(0, 3)).catch(() => []);
    log.push({ ok: false, naam: 'Plaatsen', info: `niet gelukt${fouten.length ? `: ${fouten.join(' / ')}` : ''}. Controleer het formulier en klik zelf op Plaats je advertentie.` });
    return false;
  }
  log.push({ ok: true, naam: 'Plaatsen', info: 'advertentie geplaatst' });
  return true;
}

// Venster openen op Marktplaats (geen lege startpagina)
async function openMarktplaats() {
  const page = await getPage();
  if (!page.url().startsWith('https://www.marktplaats.nl')) await page.goto('https://www.marktplaats.nl/');
  return page;
}

// Eigen advertenties met verloopdatum, via de JSON die "Mijn Marktplaats" zelf laadt.
// In hetzelfde venster als het invullen: één Marktplaats-sessie, geen extra lege pagina.
async function fetchListings() {
  const page = await getPage();
  await gotoLoggedIn(page, 'https://www.marktplaats.nl/my-account/sell/index.html');
  return page.evaluate(async () => {
    const all = [];
    for (let batch = 1; batch <= 20; batch++) {
      const res = await fetch(`/my-account/sell/api/listings?batchNumber=${batch}&batchSize=50&query=&categoryId=&inExpirationWindow=`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Marktplaats gaf ${res.status} bij ophalen advertenties`);
      const { ads = [] } = await res.json();
      all.push(...ads.map((a) => ({
        itemId: a.itemId, titel: a.title, categorie: a.categoryName, verloopt: a.closeDate,
        url: 'https://www.marktplaats.nl' + a.vipUrl, views: a.viewCount, prijsCent: a.priceCents,
      })));
      if (ads.length < 50) break;
    }
    return all;
  });
}

module.exports = { fillAd, fetchListings, getPage, openMarktplaats, setBrowser, BROWSERS };
