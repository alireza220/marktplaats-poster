const test = require('node:test');
const assert = require('node:assert');
const m = require('../lib/mapping');

const opts = (list) => list.map((t) => ({ value: t, text: t }));

test('matchOption: exact, langste prefix, fallback', () => {
  const samsung = opts(['', 'Galaxy A', 'Galaxy S2', 'Galaxy S23', 'Galaxy S24', 'Overige modellen']);
  assert.equal(m.matchOption(samsung, ['Galaxy S23 Ultra']), 'Galaxy S23');
  assert.equal(m.matchOption(samsung, ['Galaxy A54 5G']), 'Galaxy A');
  assert.equal(m.matchOption(samsung, ['Pixel 9', 'Overige modellen']), 'Overige modellen');
  const storage = opts(['8 GB', '128 GB', '1 TB of meer']);
  assert.equal(m.matchOption(storage, ['128GB']), '128 GB');
  assert.equal(m.matchOption(storage, ['1TB']), '1 TB of meer');
  const apple = opts(['iPhone 13', 'iPhone 13 mini', 'iPhone 13 Pro']);
  assert.equal(m.matchOption(apple, ['iPhone 13 mini']), 'iPhone 13 mini');
  assert.equal(m.matchOption(apple, ['iPhone 16 Pro']), null);
});

test('mpColor: marketingkleur naar basiskleur', () => {
  assert.equal(m.mpColor('Midnight'), 'Zwart');
  assert.equal(m.mpColor('Starlight'), 'Wit');
  assert.equal(m.mpColor('Blue Titanium'), 'Blauw');
  assert.equal(m.mpColor('Natural Titanium'), 'Zilver');
  assert.equal(m.mpColor('Graphite'), 'Grijs');
  assert.equal(m.mpColor('Titanium Black'), 'Zwart');
  assert.equal(m.mpColor('Onbekend'), '');
});

test('renderTemplate laat regels met lege velden weg', () => {
  const out = m.renderTemplate('A {x}\nBatterij: {b}%\n\n\n\nC {y}', { x: '1', y: '2', b: '' });
  assert.equal(out, 'A 1\n\nC 2');
});

test('categoryFor en plaatsUrl', () => {
  assert.equal(m.categoryFor('telefoon', 'Apple').l3, '1953');
  assert.equal(m.categoryFor('telefoon', 'Xiaomi').l3, '837');
  assert.equal(m.categoryFor('reparatie', 'Apple').l2, '365');
  assert.equal(m.plaatsUrl(m.categoryFor('smartwatch'), 'Watch 9'),
    'https://www.marktplaats.nl/plaats/820/3041?bucketId=426&title=Watch%209');
});

test('renderTitle: winkelnaam vooraan, lege velden weg, max 60 op woordgrens', () => {
  const tpl = '{winkelkort} | {merk} {model} {opslag} {kleurnl} {staat} & Garantie';
  assert.equal(m.renderTitle(tpl, { winkelkort: 'Telecom AE', merk: 'Samsung', model: 'A07', opslag: '64GB', kleurnl: 'zwart', staat: 'Nieuw' }),
    'Telecom AE | Samsung A07 64GB zwart Nieuw & Garantie');
  assert.equal(m.renderTitle(tpl, { merk: 'Apple', model: 'iPhone 13', staat: 'Gebruikt' }), 'Apple iPhone 13 Gebruikt & Garantie');
  const lang = m.renderTitle(tpl, { winkelkort: 'Telecom AE', merk: 'Apple', model: 'iPhone 13 Pro Max', opslag: '256GB', kleurnl: 'zilver', staat: 'Zo goed als nieuw' });
  assert.ok(lang.length <= 60, lang);
  assert.doesNotMatch(lang, /[&|\s]$/);
  assert.equal(m.renderTitle('{winkelkort} l {model} Scherm incl monteren garantie', { winkelkort: 'Telecom AE', model: 'iPhone 16 Plus' }),
    'Telecom AE l iPhone 16 Plus Scherm incl monteren garantie');
});

test('shopBlock: openingstijden over meerdere regels, lege velden weg', () => {
  const out = m.shopBlock({ tekst: 'Contact:\n{naam}\n{website}\n\nOpeningstijden:\n{openingstijden}', naam: 'Winkel', openingstijden: 'ma 13-18\ndi 10-18' });
  assert.equal(out, 'Contact:\nWinkel\n\nOpeningstijden:\nma 13-18\ndi 10-18');
  assert.equal(m.merkGroep('Apple'), 'Apple');
  assert.equal(m.merkGroep('Xiaomi'), 'Overig');
});

test('wantedForLabel', () => {
  const ad = { kind: 'telefoon', merk: 'Apple', model: 'iPhone 13', opslag: '128GB', kleur: 'Midnight', staat: 'Refurbished', batterij: '89', cameraMp: '12' };
  assert.deepEqual(m.wantedForLabel('Conditie', ad), ['Refurbished', 'Zo goed als nieuw']);
  assert.deepEqual(m.wantedForLabel('Resolutie camera', ad), ['10 megapixel of meer']);
  assert.equal(m.wantedForLabel('Onbekend veld', ad), null);
});
