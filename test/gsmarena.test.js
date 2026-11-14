const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const g = require('../lib/gsmarena');

const fx = (f) => fs.readFileSync(path.join(__dirname, 'fixtures', f), 'utf8');

test('parseSpecs leest iPhone 13 specs', () => {
  const s = g.parseSpecs(fx('iphone13-specs.html'));
  assert.equal(s.naam, 'Apple iPhone 13');
  assert.deepEqual(s.opslag, ['128GB', '256GB', '512GB']);
  assert.equal(s.netwerk, '5G');
  assert.equal(s.maxGhz, 3.23);
  assert.equal(s.os, 'iOS');
  assert.ok(s.kleuren.includes('Midnight'));
  assert.match(g.specLines(s), /Processor: Apple A15 Bionic .*3\.23 GHz/);
});

test('parsePictures pakt alleen officiële renders', () => {
  const pics = g.parsePictures(fx('iphone13-pictures.html'));
  assert.equal(pics.length, 5);
  assert.ok(pics.every((u) => u.includes('/vv/pics/')));
});

test('parseModelList herkent smartwatches', () => {
  const list = g.parseModelList([{ 48: 'Apple' }, [[48, 1, 'Watch Ultra 4', 'smartwatch x', 'a.jpg', ''], [48, 2, 'iPhone 13', '5G', 'b.jpg', '']]]);
  assert.deepEqual(list.map((d) => [d.brand, d.smartwatch]), [['Apple', true], ['Apple', false]]);
});
