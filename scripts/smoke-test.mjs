// Headless smoke test: boots the game in Chromium, starts a new hunt and
// drives the simulation deterministically (fixed 60 Hz steps with scripted
// input) through transform, sprint, charged leap, climbing, combat and howl.
// Fails on any page error or broken traversal; writes screenshots to ./screenshots.
// Usage: npm run smoke   (needs the `playwright` package, local or global)
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  playwright = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
}

const outDir = path.resolve('screenshots');
fs.mkdirSync(outDir, { recursive: true });
const browser = await playwright.chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(180000);
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.stack || e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

await page.goto(pathToFileURL(path.resolve('app/index.html')).href);
await page.waitForFunction(() => window.__lycan, null, { timeout: 180000 });
await page.screenshot({ path: path.join(outDir, '01-title.png') });

// take over the loop: the test advances time itself
await page.evaluate(() => {
  const g = window.__lycan;
  g.renderer.setAnimationLoop(null);
  g.start(false);
  window.__sim = (frames, { hold = [], press = [], mouse = [], look = null } = {}) => {
    const inp = g.input;
    for (let i = 0; i < frames; i++) {
      for (const k of hold) inp.keys.add(k);
      if (i === 0) {
        for (const k of press) { inp.pressed.add(k); inp.keys.add(k); }
        for (const b of mouse) inp.mousePressed.add(b);
      }
      if (look) { inp.locked = true; inp.mouseDX = look[0]; inp.mouseDY = look[1]; }
      g.step(1 / 60);
      for (const k of press) inp.keys.delete(k);
    }
    for (const k of hold) inp.keys.delete(k);
    return g.player.pos.toArray().map((v) => Math.round(v * 10) / 10);
  };
  window.__release = (k) => {
    g.input.keys.delete(k);
    g.input.released.add(k);
    g.step(1 / 60);
  };
  window.__render = () => g.renderer.render(g.scene, g.camera3);
});
const sim = (frames, opts) => page.evaluate(([f, o]) => window.__sim(f, o), [frames, opts || {}]);
const shot = async (name) => {
  await page.evaluate(() => window.__render());
  await page.screenshot({ path: path.join(outDir, name) });
};
const state = () => page.evaluate(() => {
  const p = window.__lycan.player;
  return { form: p.form, y: +p.pos.y.toFixed(2), speed: +p.speed.toFixed(1), climbing: p.climbing, onGround: p.onGround, hp: Math.round(p.health), objective: window.__lycan.director.objective?.id };
});
const checks = [];
const check = (name, ok, info) => {
  checks.push({ name, ok, info });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${info ? JSON.stringify(info) : ''}`);
};

await sim(30);
await shot('02-start-human.png');
await sim(60, { hold: ['KeyW'] });
const humanWalk = await state();
check('human walks', humanWalk.speed > 3, humanWalk);

await sim(40, { press: ['KeyF'] });
await shot('03-transforming.png');
await sim(60);
let s = await state();
check('transformed into beast', s.form === 'wolf', s);
await shot('04-beast.png');

await sim(150, { hold: ['KeyW', 'ShiftLeft'] });
s = await state();
check('beast sprint on all fours reaches high speed', s.speed > 22, s);
await shot('05-sprint.png');

await sim(50, { hold: ['Space'] });
await page.evaluate(() => window.__release('Space'));
await sim(20);
s = await state();
check('charged leap launches high', s.y > 6 && !s.onGround, s);
await shot('06-leap.png');
await sim(120);

for (let i = 0; i < 3; i++) await sim(16, { mouse: [0] });
await sim(10, { press: ['KeyQ'] });
await sim(30);
await shot('07-howl.png');

// climb: put the beast in front of a tall building and run at it
const target = await page.evaluate(() => {
  const g = window.__lycan;
  const p = g.player;
  let best = null, bd = 1e9;
  for (const b of g.world.colliders.boxes) {
    if (b.tag !== 'building' || b.maxY < 30 || b.maxY > 60) continue;
    const d = Math.hypot((b.minX + b.maxX) / 2 - p.pos.x, (b.minZ + b.maxZ) / 2 - p.pos.z);
    if (d < bd) { bd = d; best = b; }
  }
  p.pos.set((best.minX + best.maxX) / 2, 0, best.maxZ + 6);
  p.vel.set(0, 0, 0);
  p.yaw = Math.PI;
  g.camera.yaw = Math.PI;
  g.camera.pitch = 0.2;
  return { top: best.maxY };
});
await sim(60, { hold: ['KeyW'] });
s = await state();
check('beast starts climbing on wall contact', s.climbing, s);
await shot('08-climb.png');
let mantled = false;
for (let i = 0; i < 50 && !mantled; i++) {
  await sim(10, { hold: ['KeyW'] });
  s = await state();
  mantled = s.y >= target.top - 0.5 && !s.climbing;
}
check('beast mantles onto the roof', mantled, { ...s, roof: target.top });
await page.evaluate(() => { window.__lycan.camera.pitch = -0.35; });
await sim(30);
await shot('09-rooftop.png');

// rooftop leap + ground slam
await sim(30, { hold: ['Space'] });
await page.evaluate(() => window.__release('Space'));
await sim(25);
await sim(5, { mouse: [2] });
await page.evaluate(() => window.__lycan.input.mousePressed.add(2));
await sim(180);
s = await state();
check('survives rooftop leap and lands', s.onGround && s.hp > 0, s);

// combat sanity: spawn a vampire and claw it to death
const killed = await page.evaluate(() => {
  const g = window.__lycan;
  const p = g.player;
  p.pos.set(0, 0, 25);
  p.vel.set(0, 0, 0);
  g.step(1 / 60);
  const v = g.npcs.spawn('vampire', p.pos.clone().add(p.forward.multiplyScalar(2.5)), { state: 'attack' });
  v.stun = 999; // test the damage pipeline, not the vampire's footwork
  for (let i = 0; i < 12 && !v.dead; i++) {
    g.input.mousePressed.add(0);
    for (let k = 0; k < 20; k++) g.step(1 / 60);
  }
  return v.dead || { hp: v.hp, vp: v.pos.toArray(), pp: p.pos.toArray() };
});
check('claws kill a vampire', killed === true, killed);

// map, skills, daytime forest
await page.evaluate(() => window.__lycan.openMenu('map'));
await page.screenshot({ path: path.join(outDir, '10-map.png') });
await page.evaluate(() => window.__lycan.openMenu('skills'));
await page.screenshot({ path: path.join(outDir, '11-skills.png') });
await page.evaluate(() => {
  const g = window.__lycan;
  g.setPaused(false);
  g.world.time = 13;
  g.player.pos.set(-200, 30, -330);
  g.camera.pitch = -0.1;
});
await sim(60);
await shot('12-forest-day.png');
await page.evaluate(() => {
  const g = window.__lycan;
  g.world.time = 23;
  g.world.day = 2; // full moon night
  g.player.pos.set(330, 2, 80);
  g.camera.yaw = Math.PI * 0.9;
});
await sim(120, { hold: ['KeyW'] });
await shot('13-lake-fullmoon.png');

const info = await page.evaluate(() => {
  const g = window.__lycan;
  return { npcs: g.npcs.list.length, calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles, title: g.rep.title, heat: g.rep.heat.toFixed(2), objective: g.director.objective?.id };
});
console.log(JSON.stringify(info));
await browser.close();

const failed = checks.filter((c) => !c.ok);
if (errors.length) console.error('PAGE ERRORS:\n' + errors.join('\n'));
if (errors.length || failed.length) process.exit(1);
console.log('Smoke test passed. Screenshots in', outDir);
