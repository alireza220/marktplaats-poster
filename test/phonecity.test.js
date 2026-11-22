const test = require('node:test');
const assert = require('node:assert');
const pc = require('../lib/phonecity');

const SLUGS = [
  'iphone-13-soft-oled-lcd-scherm', 'iphone-13-pro-service-pack-lcd-scherm', 'iphone-13-service-pack-lcd-scherm',
  'iphone-13-diagnostic-soft-oled-lcd-scherm', 'iphone-16e-17e-soft-oled-lcd-scherm', 'iphone-16-soft-oled-lcd-scherm-120hz',
  'samsung-galaxy-s23-5g-sm-s911b-service-pack-lcd-scherm-met-frame-zwart', 'samsung-galaxy-s23-ultra-5g-sm-s918b-service-pack-lcd-scherm',
  'samsung-galaxy-a16-a165f-service-pack-lcd-scherm-met-frame-zwart', 'samsung-galaxy-s23-plus-sm-s916b-service-pack-lcd-scherm',
  'google-pixel-8a-service-pack-lcd-scherm', 'google-pixel-8-oled-lcd-scherm-met-frame',
];

test('parseSitemap: alleen schermen, geen beschermglas of camera', () => {
  const xml = ['iphone-13-soft-oled-lcd-scherm', 'iphone-13-scherm-beschermer-glas', 'iphone-13-camera-lens-scherm', 'iphone-13-oplaadpoort-zwart']
    .map((s) => `<url><loc>https://phone-city.nl/${s}</loc></url>`).join('');
  assert.deepEqual(pc.parseSitemap(xml), ['iphone-13-soft-oled-lcd-scherm']);
});

test('matchSchermen: juiste model, geen Pro/Ultra/8a, service pack eerst', () => {
  assert.deepEqual(pc.matchSchermen(SLUGS, 'iPhone 13'), ['iphone-13-service-pack-lcd-scherm', 'iphone-13-soft-oled-lcd-scherm', 'iphone-13-diagnostic-soft-oled-lcd-scherm']);
  assert.deepEqual(pc.matchSchermen(SLUGS, 'iPhone 16'), ['iphone-16-soft-oled-lcd-scherm-120hz']);
  assert.deepEqual(pc.matchSchermen(SLUGS, 'iPhone 16e'), ['iphone-16e-17e-soft-oled-lcd-scherm']);
  assert.deepEqual(pc.matchSchermen(SLUGS, 'Galaxy S23'), ['samsung-galaxy-s23-5g-sm-s911b-service-pack-lcd-scherm-met-frame-zwart']);
  assert.deepEqual(pc.matchSchermen(SLUGS, 'Galaxy S23+'), ['samsung-galaxy-s23-plus-sm-s916b-service-pack-lcd-scherm']);
  assert.deepEqual(pc.matchSchermen(SLUGS, 'Galaxy A16 5G'), ['samsung-galaxy-a16-a165f-service-pack-lcd-scherm-met-frame-zwart']);
  assert.deepEqual(pc.matchSchermen(SLUGS, 'Pixel 8'), ['google-pixel-8-oled-lcd-scherm-met-frame']);
  assert.deepEqual(pc.matchSchermen(SLUGS, 'Nokia 3310'), []);
});

test('parseFotos: volle grootte, geen thumbnails of logo', () => {
  const html = `<img src="https://afosto-cdn-01.afosto.com/215kg/product/400/12-A.jpg">
    <meta content="https://afosto-cdn-01.afosto.com/215kg/product/12-A.jpg"><a href="https://afosto-cdn-01.afosto.com/215kg/product/34-B-2.png">
    <img src="https://afosto-cdn-01.afosto.com/215kg/logo/1-logo.png">`;
  assert.deepEqual(pc.parseFotos(html), ['https://afosto-cdn-01.afosto.com/215kg/product/12-A.jpg', 'https://afosto-cdn-01.afosto.com/215kg/product/34-B-2.png']);
});
