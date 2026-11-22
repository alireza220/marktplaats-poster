// Phone City (leverancier): schermfoto's voor schermreparatie-advertenties.
// Schermproducten komen uit de productsitemap, foto's van de productpagina. Eenmalig per model, daarna lokaal.
const fs = require('fs');
const path = require('path');

const BASE = 'https://phone-city.nl';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

async function get(url, type = 'text') {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Phone City gaf ${res.status} voor ${url}`);
  return type === 'buffer' ? Buffer.from(await res.arrayBuffer()) : res.text();
}

// "iphone16-pro" en "iPhone 16 Pro" → ['iphone','16','pro']; "s23" → ['s','23'], maar "8a", "16e" en "5g" blijven heel
const tokens = (s) => String(s).toLowerCase().replace(/\+/g, ' plus ').replace(/([a-z])(?=\d)/g, '$1 ')
  .split(/[^a-z0-9]+/).filter(Boolean);

// Woorden die een ander model maken: "iphone-13-pro" is geen iPhone 13
const VARIANT = new Set(['pro', 'max', 'mini', 'plus', 'ultra', 'fe', 'lite', 'edge', 'e', 'neo', 'prime', 'note', 'xl']);
// Wel "scherm" in de naam, maar geen scherm
const GEEN_SCHERM = new Set(['beschermer', 'protector', 'glas', 'glass', 'tempered', 'camera', 'lens', 'flex', 'kabel', 'cable', 'folie', 'sticker', 'tape', 'adhesive', 'backlight', 'tool', 'tools']);

// Alle schermproducten uit de sitemap: ['iphone-13-soft-oled-lcd-scherm', ...]
function parseSitemap(xml) {
  return [...xml.matchAll(/<loc>https:\/\/phone-city\.nl\/([^<]+)<\/loc>/g)].map((m) => m[1])
    .filter((slug) => { const t = tokens(slug); return t.includes('scherm') && !t.some((w) => GEEN_SCHERM.has(w)); });
}
const fetchSchermen = async () => parseSitemap(await get(`${BASE}/product.xml`));

// Voorkeur: originele service packs en pulled schermen eerst
function score(slug) {
  const s = slug.toLowerCase();
  let n = /service-pack/.test(s) ? 0 : /pulled|original/.test(s) ? 1 : /soft-oled/.test(s) ? 2 : /oled/.test(s) ? 3 : /in-cell/.test(s) ? 4 : 5;
  if (/diagnostic/.test(s)) n += 10;
  return n;
}

// Schermproducten voor dit model, beste eerst. modelName zoals op GSMArena ("iPhone 13", "Galaxy S23 Ultra").
function matchSchermen(slugs, modelName) {
  const model = tokens(modelName.replace(/\s+[45]G$/i, ''));
  if (!model.length) return [];
  return slugs.filter((slug) => {
    const t = tokens(slug);
    for (let i = 0; i + model.length <= t.length; i++) {
      if (model.every((w, j) => t[i + j] === w) && !VARIANT.has(t[i + model.length]) && !/^\d+$/.test(t[i + model.length] || '')) return true;
    }
    return false;
  }).sort((a, b) => score(a) - score(b));
}

// Productfoto's op volle grootte, in galerijvolgorde (zonder /100/, /400/ enz. thumbnails)
function parseFotos(html) {
  return [...new Set([...html.matchAll(/https:\/\/afosto-cdn-\d+\.afosto\.com\/[a-z0-9]+\/product\/\d+-[^"'\s)<>/]+?\.(?:jpe?g|png)/gi)].map((m) => m[0]))];
}

// Schermfoto's van de beste 2 producten lokaal opslaan in dir. slugs = uit fetchSchermen (gecachet door aanroeper).
async function fetchSchermFotos(slugs, modelName, dir) {
  const producten = matchSchermen(slugs, modelName).slice(0, 2);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const fotos = [];
  for (const slug of producten) {
    let urls = [];
    try { urls = parseFotos(await get(`${BASE}/${slug}`)).slice(0, 3); } catch { continue; }
    for (const url of urls) {
      const file = path.join(dir, `${String(fotos.length + 1).padStart(2, '0')}${path.extname(new URL(url).pathname).toLowerCase()}`);
      try { fs.writeFileSync(file, await get(url, 'buffer')); fotos.push(file); } catch { /* foto overslaan */ }
    }
  }
  return { schermFotos: fotos, schermBron: producten.map((s) => `${BASE}/${s}`) };
}

module.exports = { tokens, parseSitemap, matchSchermen, parseFotos, fetchSchermen, fetchSchermFotos };
