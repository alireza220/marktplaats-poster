const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fileUrl = (p) => 'file:///' + p.replace(/\\/g, '/');

let data = null;
let model = null;        // opgehaald GSMArena-model
let gekozen = null;      // zoekresultaat
let bewerkId = null;     // id van opgeslagen advertentie die opnieuw wordt ingevuld
let eigenTekst = false;  // titel/beschrijving met de hand aangepast

function melding(tekst, fout = false) {
  const el = $('#melding');
  el.hidden = !tekst; el.textContent = tekst || ''; el.classList.toggle('fout', fout);
}
async function call(name, ...args) {
  try { return await window.api(name, ...args); } catch (e) { melding(e.message, true); throw e; }
}

// ---------- tabs ----------
function toonTab(naam) {
  $$('nav button').forEach((b) => b.classList.toggle('actief', b.dataset.tab === naam));
  $$('main > section').forEach((s) => { s.hidden = s.id !== `tab-${naam}`; });
}
$$('nav button').forEach((b) => b.addEventListener('click', () => toonTab(b.dataset.tab)));
$('#open-browser').addEventListener('click', async () => {
  if (data.browser === 'firefox') melding('Firefox openen… de eerste keer wordt Firefox eerst gedownload (±1 minuut).');
  await call('browser:open');
  melding('');
});

// ---------- nieuwe advertentie ----------
const soort = () => $('input[name=soort]:checked').value;

function resetModel() {
  model = null; gekozen = null; bewerkId = null; eigenTekst = false;
  $('#model').hidden = $('#velden').hidden = $('#voorbeeld-kaart').hidden = true;
  $('#log').innerHTML = '';
}
$$('input[name=soort]').forEach((r) => r.addEventListener('change', () => {
  resetModel();
  $$('.toestel').forEach((el) => { el.hidden = soort() === 'reparatie'; });
  $('#zoek').value = ''; $('#resultaten').innerHTML = ''; $('#zoek').focus();
}));

let zoekTimer;
$('#zoek').addEventListener('input', () => {
  clearTimeout(zoekTimer);
  zoekTimer = setTimeout(async () => {
    const q = $('#zoek').value.trim();
    if (q.length < 2) { $('#resultaten').innerHTML = ''; return; }
    const lijst = await call('models:search', q, soort() === 'smartwatch');
    $('#resultaten').innerHTML = lijst.length ? lijst.map((d, i) => `
      <li tabindex="0" data-i="${i}"><img src="https://fdn2.gsmarena.com/vv/bigpic/${esc(d.img)}" alt="">
      <span>${esc(d.brand)} ${esc(d.name)}${data.models[d.id] ? ' <span class="klein">(opgeslagen)</span>' : ''}</span></li>`).join('')
      : '<li class="klein">Geen modellen gevonden</li>';
    $$('#resultaten li[data-i]').forEach((li) => {
      const kies = () => kiesModel(lijst[li.dataset.i]);
      li.addEventListener('click', kies);
      li.addEventListener('keydown', (e) => { if (e.key === 'Enter') kies(); });
    });
  }, 250);
});

async function kiesModel(item, opnieuw = false) {
  gekozen = item;
  $('#resultaten').innerHTML = '';
  $('#zoek').value = `${item.brand} ${item.name}`;
  melding(data.models[item.id] && !opnieuw ? '' : 'Specs en foto\'s ophalen bij GSMArena…');
  model = await call('models:get', item, opnieuw);
  data.models[item.id] = model;
  melding('');
  const s = model.specs;
  $('#model-naam').textContent = `${model.brand} ${model.name}`;
  $('#model-specs').textContent = [s.chipset, s.maxGhz && `${s.maxGhz} GHz`, s.scherm, s.netwerk, s.jaar].filter(Boolean).join(' · ');
  $('#fotos').innerHTML = model.fotos.map((f) => `<img src="${esc(fileUrl(f))}" alt="">`).join('') || '<span class="klein">Geen foto\'s gevonden</span>';
  const opties = (lijst) => lijst.map((v) => `<option>${esc(v)}</option>`).join('');
  $('#opslag').innerHTML = opties(s.opslag.length ? s.opslag : ['']);
  $('#kleur').innerHTML = opties(s.kleuren.length ? s.kleuren : ['']);
  $('#model').hidden = $('#velden').hidden = $('#voorbeeld-kaart').hidden = false;
  await vulLaatstePrijs();
  await voorbeeld();
}
$('#model-opnieuw').addEventListener('click', () => gekozen && kiesModel(gekozen, true));

function formAd() {
  const ad = { id: bewerkId || undefined, kind: soort(), modelId: model.id, prijs: $('#prijs').value, garantie: $('#garantie').value };
  if (ad.kind !== 'reparatie') {
    Object.assign(ad, { opslag: $('#opslag').value, kleur: $('#kleur').value, mpKleur: $('#mpKleur').value, staat: $('#staat').value, batterij: $('#batterij').value, opmerking: $('#opmerking').value.trim() });
  }
  if (eigenTekst) Object.assign(ad, { titel: $('#titel').value.trim(), beschrijving: $('#beschrijving').value });
  return ad;
}

async function vulLaatstePrijs() {
  const p = await call('ad:lastPrice', formAd());
  if (p) $('#prijs').value = p;
}

async function voorbeeld() {
  if (!model || eigenTekst) return;
  const v = await call('ad:preview', formAd());
  $('#titel').value = v.titel;
  $('#beschrijving').value = v.beschrijving;
}
$('#velden').addEventListener('input', voorbeeld);
$('#velden').addEventListener('change', async (e) => {
  if (['opslag', 'staat'].includes(e.target.id)) await vulLaatstePrijs();
  voorbeeld();
});
['#titel', '#beschrijving'].forEach((s) => $(s).addEventListener('input', () => { eigenTekst = true; }));
$('#tekst-reset').addEventListener('click', () => { eigenTekst = false; voorbeeld(); });

$('#invullen').addEventListener('click', async () => {
  if (!model) return;
  if (!$('#prijs').value) { melding('Vul een prijs in.', true); $('#prijs').focus(); return; }
  const knop = $('#invullen');
  knop.disabled = true; knop.textContent = 'Bezig met invullen…';
  $('#log').innerHTML = '';
  melding(`Het Marktplaats-venster opent${data.browser === 'firefox' ? ' (eerste keer: Firefox wordt eerst gedownload, ±1 minuut)' : ''}. Niet ingelogd? Log daar in, de app gaat daarna vanzelf verder.`);
  try {
    const res = await call('ad:fill', formAd());
    $('#log').innerHTML = res.log.map((l) => `<li class="${l.ok ? '' : 'fout'}"><b>${esc(l.naam)}</b> ${esc(l.info)}</li>`).join('');
    melding(`Ingevuld in ${res.categorie}. Controleer het formulier in het Marktplaats-venster en klik zelf op "Plaats je advertentie".`);
    data = await call('data:get');
    toonOpgeslagen();
  } finally {
    knop.disabled = false; knop.textContent = 'Invullen op Marktplaats';
  }
});

// Opgeslagen advertentie terugzetten in het formulier (en eventueel direct invullen)
async function laadAdvertentie(ad, direct) {
  const m = data.models[ad.modelId];
  if (!m) { melding('Model van deze advertentie niet meer gevonden.', true); return; }
  toonTab('nieuw');
  $(`input[name=soort][value="${ad.kind}"]`).checked = true;
  $(`input[name=soort][value="${ad.kind}"]`).dispatchEvent(new Event('change'));
  await kiesModel(m);
  for (const k of ['opslag', 'kleur', 'mpKleur', 'staat', 'batterij', 'garantie', 'prijs', 'opmerking']) if (ad[k] !== undefined) $(`#${k}`).value = ad[k];
  bewerkId = ad.id;
  eigenTekst = !!ad.beschrijving;
  if (eigenTekst) { $('#titel').value = ad.titel; $('#beschrijving').value = ad.beschrijving; } else await voorbeeld();
  if (direct) $('#invullen').click();
}

// ---------- advertenties ----------
const datum = (iso) => new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const dagenTot = (iso) => Math.ceil((new Date(iso) - Date.now()) / 864e5);

function toonOpgeslagen() {
  $('#opgeslagen tbody').innerHTML = data.ads.map((a) => `<tr>
    <td>${esc(a.titel)}</td><td>€ ${esc(a.prijs)}</td><td>${datum(a.ingevuld)}</td>
    <td><button class="secundair" data-laad="${a.id}">Opnieuw invullen</button><button class="link" data-wis="${a.id}">verwijderen</button></td></tr>`).join('')
    || '<tr><td colspan="4" class="klein">Nog niets ingevuld.</td></tr>';
  $$('[data-laad]').forEach((b) => b.addEventListener('click', () => laadAdvertentie(data.ads.find((a) => a.id === b.dataset.laad), true)));
  $$('[data-wis]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Deze opgeslagen advertentie verwijderen uit de app? (Op Marktplaats verandert niets.)')) return;
    data = await call('ads:delete', b.dataset.wis); toonOpgeslagen();
  }));
}

async function vernieuwOnline() {
  const knop = $('#vernieuwen');
  knop.disabled = true; knop.textContent = 'Ophalen…';
  try {
    const lijst = (await call('listings:get')).sort((a, b) => new Date(a.verloopt) - new Date(b.verloopt));
    $('#online-leeg').hidden = lijst.length > 0;
    $('#online-leeg').textContent = 'Geen actieve advertenties gevonden.';
    $('#online tbody').innerHTML = lijst.map((l, i) => {
      const d = dagenTot(l.verloopt);
      const opgeslagen = data.ads.find((a) => a.titel === l.titel);
      return `<tr><td>${esc(l.titel)}</td><td>${esc(l.categorie)}</td>
        <td class="${d <= 3 ? 'bijna' : ''}">${datum(l.verloopt)} (${d <= 0 ? 'verlopen' : `nog ${d} d`})</td><td>${esc(l.views)}</td>
        <td>${opgeslagen ? `<button class="secundair" data-opnieuw="${opgeslagen.id}">Opnieuw plaatsen</button>` : '<span class="klein">niet via app geplaatst</span>'}</td></tr>`;
    }).join('');
    $$('[data-opnieuw]').forEach((b) => b.addEventListener('click', () => laadAdvertentie(data.ads.find((a) => a.id === b.dataset.opnieuw), true)));
    return lijst;
  } finally {
    knop.disabled = false; knop.textContent = 'Vernieuwen';
  }
}
$('#vernieuwen').addEventListener('click', vernieuwOnline);

// ---------- instellingen ----------
function vulForm(form, waarden) {
  for (const el of form.elements) if (el.name && waarden[el.name] !== undefined) el.value = waarden[el.name] ?? '';
}
function leesForm(form) {
  return Object.fromEntries([...form.elements].filter((el) => el.name).map((el) => [el.name, el.value]));
}
function opslaanForm(id, key, omzetten = (v) => v) {
  $(id).addEventListener('submit', async (e) => {
    e.preventDefault();
    data = await call('data:set', key, omzetten(leesForm(e.target)));
    melding('Opgeslagen.');
    setTimeout(() => melding(''), 2000);
  });
}
$('#browser').addEventListener('change', async (e) => {
  data = await call('data:set', 'browser', e.target.value);
  melding(`${e.target.selectedOptions[0].text} is nu de standaardbrowser.`);
  setTimeout(() => melding(''), 2500);
});
opslaanForm('#winkel', 'shop');
opslaanForm('#sjablonen', 'templates');
opslaanForm('#uitwijk', 'uitwijk', (v) => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x || null])));

// ---------- start ----------
(async () => {
  data = await call('data:get');
  $('#browser').value = data.browser;
  vulForm($('#winkel'), data.shop);
  vulForm($('#sjablonen'), data.templates);
  vulForm($('#uitwijk'), Object.fromEntries(Object.entries(data.uitwijk).map(([k, v]) => [k, v || ''])));
  toonOpgeslagen();
  if (!data.shop.naam) melding('Welkom! Vul eerst je winkelgegevens in bij Instellingen.');
  // Melding bij opstarten: advertenties die binnen 3 dagen verlopen
  if (data.ingelogdGeweest) {
    const lijst = await vernieuwOnline().catch(() => []);
    const bijna = lijst.filter((l) => dagenTot(l.verloopt) <= 3);
    if (bijna.length) {
      melding(`${bijna.length} advertentie(s) verlopen binnen 3 dagen. Zie tabblad Advertenties.`);
      toonTab('advertenties');
    }
  }
})();
