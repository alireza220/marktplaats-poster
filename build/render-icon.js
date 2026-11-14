// Rendert build/logo.svg naar PNG's via Edge (headless). Gebruik: node build/render-icon.js
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

(async () => {
  const svg = fs.readFileSync(path.join(__dirname, 'logo.svg'), 'utf8');
  const browser = await chromium.launch({ channel: 'msedge' });
  for (const [size, out] of [[512, 'build/icon.png'], [128, 'renderer/icon.png']]) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{width:${size}px;height:${size}px;display:block}</style>${svg}`);
    await page.screenshot({ path: path.join(__dirname, '..', out), omitBackground: true });
    console.log('geschreven:', out);
  }
  await browser.close();
})();
