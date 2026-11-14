// Pure functies: Marktplaats-categorieën, kleur/optie-matching en sjablonen. Getest in test/mapping.test.js.

// Telecommunicatie (820) > Mobiele telefoons (225) > merk
const PHONE_BRANDS = {
  apple: '1953', blackberry: '1954', htc: '1685', huawei: '2897', lg: '1632',
  motorola: '834', nokia: '836', samsung: '841', sony: '843',
};

const CATEGORIES = {
  toebehoren: { l1: '820', l2: '227', l3: '1959', naam: 'Telefoon-accessoires > Toebehoren en Onderdelen' },
  smartwatch: { l1: '820', l2: '426', l3: '3041', naam: 'Wearables > Smartwatches' },
  reparatie: { l1: '820', l2: '365', l3: '1664', naam: 'Reparaties' },
};

function categoryFor(kind, brand) {
  if (kind === 'reparatie') return CATEGORIES.reparatie;
  if (kind === 'smartwatch') return CATEGORIES.smartwatch;
  const l3 = PHONE_BRANDS[String(brand).toLowerCase()] || '837';
  return { l1: '820', l2: '225', l3, naam: `Mobiele telefoons > ${brand}` };
}

function plaatsUrl(cat, title) {
  return `https://www.marktplaats.nl/plaats/${cat.l1}/${cat.l3}?bucketId=${cat.l2}&title=${encodeURIComponent(title)}`;
}

// Marketingkleur (GSMArena) -> Marktplaats-basiskleur. Eerste match wint.
const COLOR_WORDS = [
  [/black|midnight(?! green)|onyx|obsidian|jet|carbon|zwart/i, 'Zwart'],
  [/starlight|white|cream|ivory|pearl|wit/i, 'Wit'],
  [/gr[ae]y|graphite|slate|grijs/i, 'Grijs'],
  [/silver|platinum|natural|^titanium$|zilver/i, 'Zilver'],
  [/gold|champagne|sand|goud/i, 'Goud'],
  [/blue|navy|sierra|pacific|teal|ultramarine|blauw/i, 'Blauw'],
  [/green|mint|olive|alpine|sage|groen/i, 'Groen'],
  [/purple|violet|lavender|lilac|paars/i, 'Paars'],
  [/red|product|rood/i, 'Rood'],
  [/pink|rose|roze/i, 'Roze'],
  [/yellow|lemon|geel/i, 'Geel'],
  [/orange|oranje/i, 'Oranje'],
];

function mpColor(color) {
  const hit = COLOR_WORDS.find(([re]) => re.test(color || ''));
  return hit ? hit[1] : '';
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Kies de beste optie uit een Marktplaats-select. wanted = kandidaten op volgorde van voorkeur.
// options = [{value, text}]. Geeft value terug of null.
function matchOption(options, wanted) {
  const opts = options.filter((o) => o.value !== '');
  for (const w of [].concat(wanted).filter(Boolean)) {
    const nw = norm(w);
    if (!nw) continue;
    const exact = opts.find((o) => norm(o.text) === nw || norm(o.value) === nw);
    if (exact) return exact.value;
    // langste optie die in de gezochte tekst zit ("Galaxy S23" in "Galaxy S23 Ultra")
    const contained = opts.filter((o) => norm(o.text) && nw.startsWith(norm(o.text)))
      .sort((a, b) => norm(b.text).length - norm(a.text).length)[0];
    if (contained) return contained.value;
    const starts = opts.find((o) => norm(o.text).startsWith(nw));
    if (starts) return starts.value;
  }
  return null;
}

const CONDITIE_FALLBACK = { Refurbished: ['Refurbished', 'Zo goed als nieuw'], 'Niet werkend': ['Niet werkend', 'Gebruikt'] };

// Wat we invullen per Marktplaats-label. Geeft lijst kandidaten (of null = overslaan).
function wantedForLabel(label, ad) {
  const l = label.toLowerCase();
  if (l.startsWith('conditie')) return CONDITIE_FALLBACK[ad.staat] || [ad.staat];
  if (l.startsWith('opslag')) return [ad.opslag, ad.opslag && ad.opslag.replace(/(\d)(GB|TB)/i, '$1 $2'), 'of meer'];
  if (l.startsWith('model')) return [ad.model, ad.model && ad.model.replace(/\s+\S+$/, ''), 'Overige modellen', 'Overige'];
  if (l.startsWith('kleur')) return [ad.mpKleur, 'Overige kleuren'];
  if (l.startsWith('abonnement')) return ['Zonder abonnement'];
  if (l.startsWith('simlock')) return ['Zonder simlock'];
  if (l.startsWith('besturing')) return [ad.os, ad.os === 'Android' ? 'Android OS' : null, 'Overige systemen'];
  if (l.startsWith('resolutie camera')) {
    const mp = parseFloat(ad.cameraMp) || 0;
    return [mp >= 10 ? '10 megapixel of meer' : mp >= 6 ? '6 tot 10 megapixel' : mp >= 3 ? '3 tot 6 megapixel' : mp > 0 ? 'Minder dan 3 megapixel' : null];
  }
  if (l === 'type' && ad.kind === 'reparatie') return ['Smartphone- of Pda-reparatie', 'Mobiele-telefoonreparatie'];
  if (l === 'type' && ad.kind !== 'reparatie') return ['Overige typen'];
  return null;
}

// Sjabloon: {veld} vervangen. Een regel met een leeg veld valt weg.
function renderTemplate(tpl, data) {
  return tpl.split('\n').map((line) => {
    let empty = false;
    const out = line.replace(/\{(\w+)\}/g, (_, k) => {
      const v = data[k];
      if (v === undefined || v === null || String(v).trim() === '') { empty = true; return ''; }
      return String(v);
    });
    return empty ? null : out;
  }).filter((l) => l !== null).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

const WINKELTEKST = '{naam}\nBekijk ook onze andere advertenties of kom langs in de winkel voor ons volledige aanbod.\n\nAdres: {adres}, {postcode} {plaats}\nTelefoon: {telefoon}\nE-mail: {email}\nWebsite: {website}\n\nOpeningstijden:\n{openingstijden}';

// Vast winkelblok onder elke advertentie, uit het winkeltekst-sjabloon + winkelgegevens
function shopBlock(shop) {
  return renderTemplate(shop.tekst || WINKELTEKST, shop);
}

// Titel, max 60 tekens (Marktplaats-limiet). [lang|kort] = wordt korter en valt daarna weg als de titel
// te lang is, bijv. [& Garantie|& Gar.]. Past het dan nog niet: afkappen op een woordgrens.
function renderTitle(tpl, data) {
  const tidy = (s) => s.replace(/\s+/g, ' ').replace(/^[\s|–-]+/, '').trim().replace(/[\s|&–-]+$/, '');
  const fill = (s) => tidy(s.replace(/\{(\w+)\}/g, (_, k) => (data[k] ?? '')));
  const groups = [...tpl.matchAll(/\[([^\]]*)\]/g)].map((m) => m[1].split('|'));
  const levels = Math.max(0, ...groups.map((g) => g.length));
  let t = '';
  for (let lvl = 0; lvl <= levels; lvl++) {
    let gi = 0;
    t = fill(tpl.replace(/\[([^\]]*)\]/g, () => groups[gi++][lvl] ?? ''));
    if (t.length <= 60) return t;
  }
  return tidy(t.slice(0, 61).replace(/\s+\S*$/, ''));
}

// Korte staat voor in de titel
const staatKort = (staat) => ({ 'Zo goed als nieuw': 'ZGAN' }[staat] || staat || '');

const merkGroep = (merk) => (/apple/i.test(merk) ? 'Apple' : /samsung/i.test(merk) ? 'Samsung' : 'Overig');

module.exports = { categoryFor, plaatsUrl, CATEGORIES, mpColor, matchOption, wantedForLabel, renderTemplate, renderTitle, staatKort, shopBlock, merkGroep, WINKELTEKST, norm };
