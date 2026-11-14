// Bestuurt een eigen Edge-venster (vast profiel = 1x inloggen) en vult het plaatsingsformulier in.
// De gebruiker klikt zelf op "Plaats je advertentie".
const { chromium } = require('playwright-core');
const { categoryFor, plaatsUrl, matchOption, wantedForLabel } = require('./mapping');

let context = null;

async function getPage(profileDir) {
  if (!context) {
    context = await chromium.launchPersistentContext(profileDir, {
      channel: 'msedge', headless: false, viewport: null, args: ['--start-maximized'],
    });
    context.on('close', () => { context = null; });
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
// opts: {profileDir, beschrijving, fotos[], uitwijk (categorie|null), shop}
async function fillAd(ad, opts) {
  const log = [];
  const step = async (naam, fn) => {
    try { const info = await fn(); log.push({ ok: info !== false, naam, info: info === false ? 'niet gevonden' : info || '' }); } catch (e) { log.push({ ok: false, naam, info: e.message.split('\n')[0] }); }
  };
  const page = await getPage(opts.profileDir);

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

  // Plaats-knop in beeld en markeren; de gebruiker klikt zelf.
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => /Plaats je advertentie|Naar betalen/.test(b.innerText));
    if (btn) { btn.scrollIntoView({ block: 'center' }); btn.style.outline = '4px solid #f5a623'; btn.style.outlineOffset = '3px'; }
  });
  return { log, betaald, categorie: cat.naam };
}

// Eigen advertenties met verloopdatum, via de JSON die "Mijn Marktplaats" zelf laadt.
async function fetchListings(profileDir) {
  await getPage(profileDir);
  const page = await context.newPage();
  try {
    await gotoLoggedIn(page, 'https://www.marktplaats.nl/my-account/sell/index.html');
    return await page.evaluate(async () => {
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
  } finally {
    await page.close();
  }
}

module.exports = { fillAd, fetchListings, getPage };
