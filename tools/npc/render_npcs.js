// Renders tools/npc/npc_art.js to sprites/<id>_<pose>.webp with Playwright's Chromium.
// Usage: node tools/npc/render_npcs.js [--preview out.png]
const fs = require('fs'), path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const ROOT = path.resolve(__dirname, '..', '..');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent('<html><body></body></html>');
  await page.addScriptTag({ path: path.join(__dirname, 'npc_art.js') });
  const { res: out, info } = await page.evaluate(async () => {
    const res = {}, info = {};
    for (const id of Object.keys(NPC.CAST)) for (const pose of Object.keys(NPC.POSES[id])) {
      const svg = NPC.renderSvg(id, pose);
      const img = new Image();
      await new Promise((ok, bad) => { img.onload = ok; img.onerror = () => bad(new Error(id + ' ' + pose)); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
      const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
      const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0);
      const d = cx.getImageData(0, 0, cv.width, cv.height).data;
      let x0 = cv.width, y0 = cv.height, x1 = 0, y1 = 0;
      for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) if (d[(y * cv.width + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      const w = x1 - x0 + 1, h = y1 - y0 + 1, k = 0.72; // one scale for every pose, so the game can size frames consistently
      info[`${id}_${pose}`] = { w: Math.round(w * k), h: Math.round(h * k), ax: +((420 - x0) / w).toFixed(3), headX: +((430 - x0) / w).toFixed(3), headY: +((960 - NPC.CAST[id].hipY - 300 - y0) / h).toFixed(3), headR: +(130 / w).toFixed(3) };
      const o = document.createElement('canvas'); o.width = Math.round(w * k); o.height = Math.round(h * k);
      const ox = o.getContext('2d'); ox.imageSmoothingQuality = 'high'; ox.drawImage(cv, x0, y0, w, h, 0, 0, o.width, o.height);
      res[`${id}_${pose}`] = o.toDataURL('image/webp', 0.9);
    }
    return { res, info };
  });
  for (const [name, url] of Object.entries(out)) fs.writeFileSync(path.join(ROOT, 'sprites', name + '.webp'), Buffer.from(url.split(',')[1], 'base64'));
  const i = process.argv.indexOf('--preview');
  if (i > 0) {
    const imgs = Object.entries(out).map(([n, u]) => `<img src="${u}" title="${n}">`).join('');
    await page.setContent(`<body style="margin:0;background:#3c9a5a;display:flex;align-items:flex-end;gap:12px;padding:10px">${imgs.replace(/<img /g, '<img style="height:380px" ')}</body>`);
    await page.setViewportSize({ width: 2400, height: 420 });
    await page.screenshot({ path: process.argv[i + 1] });
  }
  console.log(JSON.stringify(info, null, 1));
  await browser.close();
})();
