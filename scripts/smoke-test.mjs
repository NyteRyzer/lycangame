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
      window.__maxSpeed = Math.max(window.__maxSpeed || 0, g.player.speed);
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

await page.evaluate(() => {
  // an open avenue: x = -45 runs north-south through downtown
  const p = window.__lycan.player;
  p.pos.set(-45 - 3.5, 0, 200);
  p.vel.set(0, 0, 0);
  window.__lycan.camera.yaw = Math.PI;
});
await page.evaluate(() => (window.__maxSpeed = 0));
await sim(150, { hold: ['KeyW', 'ShiftLeft'] });
s = await state();
s.maxSpeed = +(await page.evaluate(() => window.__maxSpeed)).toFixed(1);
check('beast sprint on all fours reaches high speed', s.maxSpeed > 25, s);
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
  window.__climbBox = best;
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
await sim(180);
s = await state();
check('survives rooftop leap and lands', s.onGround && s.hp > 0, s);

// ---- combat, forms, interaction, world systems ---------------------------
const r = await page.evaluate(() => {
  const g = window.__lycan;
  const p = g.player;
  const inp = g.input;
  const step = (n, keys = [], press = []) => {
    for (let i = 0; i < n; i++) {
      for (const k of keys) inp.keys.add(k);
      if (i === 0) for (const k of press) { inp.pressed.add(k); inp.keys.add(k); }
      g.step(1 / 60);
      for (const k of press) inp.keys.delete(k);
    }
    for (const k of keys) inp.keys.delete(k);
  };
  const out = {};
  const clear = () => { for (const o of [...g.npcs.list]) g.npcs.remove(o); };
  g.npcs._populate = () => {};
  clear();
  p.pos.set(0, 0, 30);
  p.vel.set(0, 0, 0);

  // claws kill a vampire
  const v = g.npcs.spawn('vampire', p.pos.clone().add(p.forward.multiplyScalar(2.5)), { state: 'attack' });
  v.stun = 999;
  for (let i = 0; i < 12 && !v.dead; i++) { inp.mousePressed.add(0); step(20); }
  out.vampireDead = v.dead;

  // hybrid form
  p.transformCooldown = 0;
  step(80, [], ['Digit2']);
  out.hybrid = p.form;

  // wall-run along a building's south face
  const b = window.__climbBox;
  p.pos.set(b.minX + 1, 0, b.maxZ + p.radius + 0.2);
  p.vel.set(0, 0, 0);
  g.camera.yaw = Math.PI / 2 + 0.3;
  step(25, ['KeyW', 'ShiftLeft']);
  out.wallRun = false;
  for (let i = 0; i < 50; i++) {
    step(1, ['KeyW', 'ShiftLeft'], i === 0 ? ['Space'] : []);
    if (p.wallRunning) out.wallRun = true;
  }
  step(60);

  // grab and throw a trash can
  const can = g.props.items.find((it) => it.type === 'trash' && !it.gone && Math.abs(it.pos.x) < 200);
  p.pos.set(can.pos.x + 1.6, 0, can.pos.z);
  p.vel.set(0, 0, 0);
  p.yaw = -Math.PI / 2;
  step(2, [], ['KeyG']);
  out.grabbed = !!p.held;
  step(10);
  step(2, [], ['KeyG']);
  step(5);
  out.thrown = !p.held && can.dynamic;

  // block + parry a vampire's claws
  clear();
  p.pos.set(0, 0, 30);
  step(2);
  const v2 = g.npcs.spawn('vampire', p.pos.clone().add({ x: 0, y: 0, z: -2 }), { state: 'attack' });
  step(2, ['KeyX']);
  inp.keys.add('KeyX');
  out.parry = g.npcs._strike(v2, 14);
  out.parryStun = v2.stun > 0;
  inp.keys.delete('KeyX');
  step(30);

  // finisher on a weakened hunter
  clear();
  const h = g.npcs.spawn('hunter', p.pos.clone().add({ x: 0, y: 0, z: -2 }), { state: 'pursue' });
  h.hp = 10;
  h.stun = 5;
  step(1, [], ['KeyE']);
  out.finisherStarted = p.finisherT > 0;
  step(90);
  out.finisherKill = h.dead;

  // frenzy + senses
  p.rage = 100;
  step(2, [], ['KeyZ']);
  out.frenzy = p.frenzyT > 0;
  step(2, [], ['KeyV']);
  out.senses = p.senses;
  step(2, [], ['KeyV']);

  // a beast's heavy blow sends a parked car flying
  p.startTransform('wolf', true);
  step(100);
  const car = g.props.items.find((it) => it.kind === 'car' && !it.driving && !it.police && !it.gone && Math.abs(it.pos.x) < 200);
  p.pos.set(car.pos.x + 3.2, 0, car.pos.z);
  p.vel.set(0, 0, 0);
  g.camera.yaw = -Math.PI / 2;
  g.camera.pitch = -0.1;
  const before = car.pos.clone();
  inp.mousePressed.add(2);
  step(40);
  out.carSmashed = car.dynamic || car.pos.distanceTo(before) > 0.5;

  // police respond to a raised heat level
  out.policeCar = !!g.props.spawnPoliceCar(p.pos);

  // weather turns
  g.weather.set('storm');
  step(400);
  out.stormLight = +g.world.lightMul.toFixed(2);

  // collect a moonstone and survey from a spire
  const st = g.world.moonstones[0];
  p.pos.set(st.pos.x, st.pos.y - 1.2, st.pos.z);
  step(2);
  out.moonstones = p.moonstones;
  const vp = g.world.vantages[0];
  p.pos.set(vp.pos.x + 1, vp.pos.y + 0.1, vp.pos.z);
  p.vel.set(0, 0, 0);
  step(2);
  step(2, [], ['KeyE']);
  out.vantage = vp.done;
  out.props = g.props.items.length;
  out.traffic = g.props.traffic.length;
  g.weather.set('clear');
  return out;
});
console.log(JSON.stringify(r));
check('claws kill a vampire', r.vampireDead === true, r.vampireDead);
check('hybrid transformation', r.hybrid === 'hybrid', r.hybrid);
check('hybrid wall-runs', r.wallRun, r.wallRun);
check('grab and throw a prop', r.grabbed && r.thrown, { grabbed: r.grabbed, thrown: r.thrown });
check('perfect block parries and stuns', r.parry === 'parry' && r.parryStun, r.parry);
check('finisher executes a weakened enemy', r.finisherStarted && r.finisherKill, { started: r.finisherStarted, kill: r.finisherKill });
check('blood moon frenzy', r.frenzy, r.frenzy);
check('keen senses toggle', r.senses, r.senses);
check('heavy blow launches a parked car', r.carSmashed, r.carSmashed);
check('police cruiser spawns', r.policeCar, r.policeCar);
check('storm darkens the sky', r.stormLight < 0.8, r.stormLight);
check('moonstone collected', r.moonstones >= 1, r.moonstones);
check('spire surveyed', r.vantage, r.vantage);
check('city is full of props and traffic', r.props > 500 && r.traffic > 10, { props: r.props, traffic: r.traffic });

// map, skills, daytime forest
await page.evaluate(() => window.__lycan.openMenu('map'));
await page.screenshot({ path: path.join(outDir, '10-map.png') });
await page.evaluate(() => window.__lycan.openMenu('skills'));
await page.screenshot({ path: path.join(outDir, '11-skills.png') });
await page.evaluate(() => {
  const g = window.__lycan;
  g.setPaused(false);
  g.world.time = 13;
  g.player.pos.set(-250, 30, -430);
  g.camera.pitch = -0.1;
});
await sim(60);
await shot('12-forest-day.png');
await page.evaluate(() => {
  const g = window.__lycan;
  g.world.time = 23;
  g.world.day = 2; // full moon night
  g.player.pos.set(430, 2, 60);
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
