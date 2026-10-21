// Stages the README screenshots: builds the game, boots it headless and
// poses the player, NPCs, camera, weather and time of day for each shot.
// Usage: npm run screenshots   (needs the `playwright` package, local or global)
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

const only = process.argv.slice(2); // optional: names of shots to (re)take
const outDir = path.resolve('docs/screenshots');
fs.mkdirSync(outDir, { recursive: true });
const browser = await playwright.chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.setDefaultTimeout(300000);
page.on('pageerror', (e) => console.error('PAGE ERROR', e));

await page.goto(pathToFileURL(path.resolve('app/index.html')).href);
await page.waitForFunction(() => window.__lycan, null, { timeout: 300000 });
if (!only.length || only.includes('title')) {
  await page.evaluate(() => {
    const g = window.__lycan;
    g.world.time = 21.5;
    g.world.update(0, g.player.pos);
  });
  await page.screenshot({ path: path.join(outDir, 'title.png') });
}

await page.evaluate(() => {
  const g = window.__lycan;
  g.renderer.setAnimationLoop(null);
  g.start(false);
  g.director.eventTimer = 1e9; // no random events while staging
  g.director.offerTimer = 1e9;
  g.npcs._populate = () => {}; // only the NPCs each shot places
  g.weather.timer = 1e9;
  // freeze every NPC's brain: shots pose them by hand
  for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(g.npcs))) if (k.startsWith('_ai_')) g.npcs[k] = () => null;
  // stage the story past the tutorial so the objective line reads well
  while (g.director.objective && g.director.objective.id !== 'choose') g.director.step++;
  g.hud.toast = () => {}; // no tutorial toasts in the shots
  // explicit over-the-shoulder camera aimed at what's in front of the player
  window.__shoulder = (lateral = 4.5, back = 4.5, up = 2.6, lookD = 9, lookUp = 1.8) => {
    const p = g.player;
    const f = p.forward;
    const r = { x: -f.z, z: f.x };
    g.camera3.position.set(p.pos.x - f.x * back + r.x * lateral, p.pos.y + up, p.pos.z - f.z * back + r.z * lateral);
    g.camera3.lookAt(p.pos.x + f.x * lookD, p.pos.y + lookUp, p.pos.z + f.z * lookD);
  };
  // put an NPC in front of the player: d metres ahead, s metres to the side
  window.__ahead = (type, d, side = 0, opts = {}) => {
    const p = g.player;
    const f = p.forward;
    const pos = p.pos.clone().add({ x: f.x * d + f.z * side, y: 0, z: f.z * d - f.x * side });
    const o = g.npcs.spawn(type, pos, { state: 'hunt', ...opts });
    window.__face(o, p.pos);
    return o;
  };
  window.__step = (n, keys = []) => {
    for (let i = 0; i < n; i++) {
      for (const k of keys) g.input.keys.add(k);
      g.step(1 / 60);
    }
    for (const k of keys) g.input.keys.delete(k);
  };
  window.__clear = () => {
    for (const o of [...g.npcs.list]) g.npcs.remove(o);
    document.getElementById('toasts').innerHTML = '';
    document.querySelectorAll('.rep-pop').forEach((e) => e.remove());
    g.fx.parts.forEach((p) => (p.alive = false));
    g.hud.floats.length = 0;
    const p = g.player;
    p.dropHeld();
    Object.assign(p, { senses: false, frenzyT: 0, hitCount: 0, lockTarget: null, blocking: false, wallRunning: false, slideT: 0, mantleT: 0, held: null });
    g.weather.set('clear');
    g.weather.timer = 1e9;
    Object.assign(g.weather.cur, { fog: 1, light: 1, rain: 0, wet: 0 });
  };
  window.__place = ({ x, z, y = null, form = 'wolf', time = 22, day = 1, yaw = 0 }) => {
    const p = g.player;
    g.world.time = time;
    g.world.day = day;
    p.pos.set(x, y ?? g.world.groundAt(x, z, 500, 1000), z);
    p.vel.set(0, 0, 0);
    p.form = form;
    p.transformTo = null;
    for (const [k, r] of Object.entries(p.rigs)) {
      r.root.visible = k === form;
      r.root.scale.setScalar(1);
    }
    p.yaw = yaw;
    p.climbing = false;
    p.onGround = true;
    p.healthFrac = 1;
    g.camera.focus.copy(p.pos).y += p.F.eye;
  };
  window.__cam = (yaw, pitch, dist) => {
    g.camera.yaw = yaw;
    g.camera.pitch = pitch;
    if (dist) g.camera.dist = dist;
  };
  window.__face = (o, target) => {
    o.yaw = Math.atan2(target.x - o.pos.x, target.z - o.pos.z);
    o.rig.root.rotation.y = o.yaw;
  };
  window.__hud = (on) => {
    document.getElementById('hud').style.visibility = on ? 'visible' : 'hidden';
    document.getElementById('overlay').style.visibility = on ? 'visible' : 'hidden';
  };
  window.__render = () => g.render();
});

const want = (name) => !only.length || only.includes(name.replace('.png', ''));
const stage = async (name, hud, fn) => {
  if (!want(name)) return;
  await page.evaluate(fn);
  await page.evaluate((h) => {
    window.__hud(h);
    document.getElementById('toasts').innerHTML = '';
    window.__lycan.hud.update(0.001);
    window.__render();
  }, hud);
  await page.screenshot({ path: path.join(outDir, name) });
  console.log('saved', name);
};

// the beast, front-on under the moon in the plaza
await stage('beast.png', false, () => {
  window.__clear();
  window.__place({ x: 4, z: 24, time: 22.5, day: 2, yaw: 0.35 });
  window.__cam(Math.PI, 0.18, 5.5);
  window.__step(40);
  window.__cam(Math.PI, 0.18, 5.5);
  window.__step(2);
});

// the hybrid: half human, half wolf, under neon
await stage('hybrid.png', false, () => {
  window.__clear();
  window.__place({ x: -90 + 3.5, z: 40, form: 'hybrid', time: 22.8, day: 1, yaw: 0.2 });
  window.__cam(Math.PI + 0.35, 0.12, 3.6);
  window.__step(40);
  window.__cam(Math.PI + 0.35, 0.12, 3.6);
  window.__step(2);
});

// the human form and its passives
await stage('human.png', true, () => {
  window.__clear();
  window.__place({ x: -135 + 3.5, z: 60, form: 'human', time: 21.4, day: 1, yaw: Math.PI });
  const g = window.__lycan;
  for (let i = 0; i < 6; i++) {
    const c = g.npcs.spawn('civilian', g.player.pos.clone().add({ x: (i % 3) * 3 - 3, y: 0, z: -6 - Math.floor(i / 3) * 4 }), { state: 'wander' });
    window.__face(c, g.player.pos);
  }
  window.__cam(Math.PI, -0.05, 4.2);
  window.__step(30);
});

// mid-transformation: human tearing into hybrid
await stage('transform.png', true, () => {
  const g = window.__lycan;
  window.__clear();
  window.__place({ x: 2, z: 22, form: 'human', time: 21.2, yaw: 0.6 });
  window.__cam(0.6 + Math.PI - 0.5, 0.12, 4.5);
  window.__step(20);
  g.player.transformCooldown = 0;
  g.player.startTransform('wolf');
  window.__step(48);
  g.camera.dist = 6.5;
  window.__step(1);
});

// sprinting on all fours down an avenue
await stage('sprint.png', true, () => {
  const g = window.__lycan;
  window.__clear();
  window.__place({ x: -135 + 3.5, z: 230, time: 21, yaw: Math.PI });
  window.__cam(Math.PI, -0.12, 7);
  for (let i = 0; i < 110; i++) {
    g.input.keys.add('KeyW');
    g.input.keys.add('ShiftLeft');
    g.camera.yaw = Math.PI;
    g.step(1 / 60);
  }
  const keep = g.player.yaw;
  g.camera.yaw = Math.PI + 0.55;
  g.camera.pitch = -0.1;
  g.input.keys.clear();
  g.player.yaw = keep;
  g.step(1 / 60);
});

// the hybrid running along a wall
await stage('wallrun.png', true, () => {
  const g = window.__lycan;
  window.__clear();
  let b = null;
  // a long, tall facade near the centre with open street in front of it
  for (const x of g.world.colliders.boxes) {
    if (x.tag !== 'building' || x.maxY < 25 || x.maxX - x.minX < 14 || Math.abs(x.minX) > 200 || Math.abs(x.maxZ) > 200) continue;
    if (!b || x.maxX - x.minX > b.maxX - b.minX) b = x;
  }
  window.__place({ x: b.minX + 1, z: b.maxZ + 0.85, form: 'hybrid', time: 21.6, yaw: Math.PI / 2 });
  g.camera.yaw = Math.PI / 2 + 0.3;
  for (let i = 0; i < 46; i++) {
    g.input.keys.add('KeyW');
    g.input.keys.add('ShiftLeft');
    if (i === 25) { g.input.pressed.add('Space'); g.input.keys.add('Space'); }
    g.step(1 / 60);
    g.input.keys.delete('Space');
  }
  g.camera.yaw = Math.PI / 2 + 0.75;
  g.camera.pitch = 0.08;
  g.camera.dist = 6;
  g.step(1 / 60);
  g.input.keys.clear();
});

// climbing a tower
await stage('climb.png', true, () => {
  const g = window.__lycan;
  window.__clear();
  let best = null;
  for (const b of g.world.colliders.boxes) {
    if (b.tag !== 'building' || b.maxY < 70) continue;
    if (!best || Math.hypot(b.minX, b.maxZ) < Math.hypot(best.minX, best.maxZ)) best = b;
  }
  window.__place({ x: (best.minX + best.maxX) / 2, z: best.maxZ + 3, time: 21.8, yaw: Math.PI });
  g.camera.yaw = Math.PI;
  for (let i = 0; i < 150; i++) {
    g.input.keys.add('KeyW');
    g.step(1 / 60);
  }
  g.input.keys.clear();
  g.camera.yaw = Math.PI - 0.7;
  g.camera.pitch = 0.45;
  window.__step(2);
});

// dusk on a rooftop, looking over Greyhaven
await stage('rooftop-dusk.png', false, () => {
  const g = window.__lycan;
  window.__clear();
  let best = null;
  for (const b of g.world.colliders.boxes) {
    if (b.tag !== 'building') continue;
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    if (cz < 140 || cz > 260 || Math.abs(cx) > 70) continue;
    if (!best || b.maxY > best.maxY) best = b;
  }
  window.__place({ x: (best.minX + best.maxX) / 2, z: best.minZ + 2, y: best.maxY, time: 18.7, yaw: Math.PI });
  window.__cam(Math.PI + 0.35, -0.08, 6.5);
  window.__step(30);
  window.__cam(Math.PI + 0.35, -0.08, 6.5);
  window.__step(1);
});

// charged leap over the city by day
await stage('leap-day.png', true, () => {
  const g = window.__lycan;
  window.__clear();
  window.__place({ x: 45 + 3.5, z: 240, time: 11, yaw: Math.PI });
  window.__cam(Math.PI, -0.05, 7);
  window.__step(60, ['Space']);
  g.input.released.add('Space');
  window.__step(38);
  g.camera.pitch = -0.3;
  window.__step(1);
});

// a beast hoisting a car over its head in traffic
await stage('car-throw.png', true, () => {
  const g = window.__lycan;
  window.__clear();
  window.__place({ x: 90 + 3.5, z: 110, time: 20.8, yaw: Math.PI });
  const car = g.props.items.find((it) => it.kind === 'car' && !it.driving && !it.police && !it.gone && it.pos.distanceTo(g.player.pos) < 60);
  g.props.grab(car);
  g.player.held = { kind: 'prop', ref: car };
  window.__cam(Math.PI + 0.6, 0.08, 8);
  window.__step(30);
  window.__cam(Math.PI + 0.6, 0.08, 8);
  window.__step(1);
});

// vampires surround the beast; a combo builds
await stage('vampires.png', true, () => {
  const g = window.__lycan;
  window.__clear();
  window.__place({ x: -135, z: -90, time: 23, day: 2, yaw: Math.PI * 0.3 });
  const p = g.player;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const v = g.npcs.spawn('vampire', p.pos.clone().add({ x: Math.cos(a) * 3.6, y: 0, z: Math.sin(a) * 3.6 }), { state: 'attack' });
    window.__face(v, p.pos);
    v.hp = v.maxHp * (0.3 + i * 0.2);
    v.rig.playAttack('claw', i % 2 ? 1 : -1);
  }
  window.__cam(Math.PI * 0.3 + 0.5, -0.42, 9);
  p.hitCount = 27;
  p.hitTimer = 2.4;
  window.__step(4);
  p.wolf.playAttack('light', 1);
  window.__step(7);
  g.fx.blood(p.pos.clone().add({ x: 2.5, y: 1.4, z: 2.2 }), 2, '#3a0006');
  g.hud.damageNumber(p.pos.clone().add({ x: 2.4, y: 2.6, z: 2.0 }), 34);
  g.hud.damageNumber(p.pos.clone().add({ x: -2.2, y: 2.4, z: 2.6 }), 58);
  window.__step(3);
});

// police standoff
await stage('police.png', true, () => {
  const g = window.__lycan;
  window.__clear();
  window.__place({ x: 180 + 3.5, z: -60, time: 22.2, yaw: 0 });
  const p = g.player;
  g.rep.heat = 2.4;
  const car = g.props.spawnPoliceCar(p.pos);
  car.pos.set(p.pos.x - 3, 0.79, p.pos.z + 13);
  car.quat.setFromAxisAngle(new p.pos.constructor(0, 1, 0), 1.2);
  g.props._write(car);
  const cops = [[8, -6], [9, -1], [8, 4]].map(([d, sd]) => window.__ahead('police', d, sd));
  window.__step(3);
  window.__shoulder(4, 5, 2.4, 9, 1.4);
  for (const o of cops) {
    o.rig.aim = 1;
    o.rig.armR.rotation.x = -1.45;
    o.rig.armL.rotation.x = -1.2;
    o.rig.armL.rotation.z = 0.4;
    const m = o.pos.clone().add({ x: 0, y: 1.45, z: 0 });
    g.fx.tracer(m, p.pos.clone().add({ x: (Math.random() - 0.5) * 2, y: 1.5 + Math.random(), z: 0 }), '#ffe9b0');
    g.fx.sparks(m);
  }
  g.fx.update(0.001);
});

// demon brute stepping out of a Hellgate
await stage('demon.png', true, () => {
  const g = window.__lycan;
  window.__clear();
  window.__place({ x: -400, z: -45 + 3, form: 'hybrid', time: 23.5, day: 2, yaw: -Math.PI / 2 });
  const d = window.__ahead('demon', 7.5, -2.5);
  d.rig.playAttack('heavy', 1);
  [[5, -4], [6, 4], [9, -6], [10, 6]].forEach(([dd, sd]) => window.__ahead('ghoul', dd, sd));
  g.decals.crater(d.pos, 5);
  g.fx.ring(d.pos, 12, '#ff3a1a', 1.5);
  window.__step(6);
  g.fx.burst(d.pos.clone().add({ x: 0, y: 0.2, z: 0 }), { count: 40, color: g.world.sun.color.clone().setRGB(1, 0.45, 0.1), speed: 6, size: 0.35, life: 0.6, gravity: 0 });
  window.__step(3);
  window.__shoulder(4, 4.5, 2.6, 8, 2.2);
});

// a coven of witches in Northwood
await stage('witches.png', true, () => {
  const g = window.__lycan;
  window.__clear();
  const S = g.world.shrine.pos;
  window.__place({ x: S.x, z: S.z + 14, time: 0.6, day: 3, yaw: Math.PI });
  const p = g.player;
  [[8, -6], [11, 0], [8, 6]].forEach(([d, sd]) => {
    const w = window.__ahead('witch', d, sd);
    w.pos.y += 1.3;
    w.rig.root.position.copy(w.pos);
    w.rig.playAttack('cast', 1);
    const from = w.pos.clone().add({ x: 0, y: 2.2, z: 0 });
    g.npcs.spawnProjectile({ from, dir: p.eye.sub(from), speed: 20, owner: 'enemy', damage: 0, color: '#6aff9a', magic: true, homing: 0, source: w });
  });
  window.__step(10);
  window.__shoulder(5.5, 9, 3.5, 10, 2.2);
});

// ghouls clawing out of Hollow Hill cemetery
await stage('ghouls.png', true, () => {
  const g = window.__lycan;
  window.__clear();
  const C = g.landmarks.cemetery;
  window.__place({ x: C.x - 24, z: C.z + 1, form: 'hybrid', time: 1.2, day: 2, yaw: Math.PI / 2 });
  [[6, -3], [7, 0], [6, 3], [9, -5], [10, 2], [11, 6], [8, -7]].forEach(([d, sd], i) => {
    const gh = window.__ahead('ghoul', d, sd);
    gh.rig.playAttack('claw', i % 2 ? 1 : -1);
  });
  window.__step(9);
  window.__shoulder(3.5, 4.5, 2.4, 8, 1.2);
});

// a thunderstorm over downtown
await stage('storm.png', false, () => {
  const g = window.__lycan;
  window.__clear();
  window.__place({ x: 45 + 3.5, z: -30, time: 21.9, yaw: Math.PI });
  g.weather.set('storm');
  g.weather.timer = 1e9;
  Object.assign(g.weather.cur, { fog: 0.45, light: 0.4, rain: 1, wet: 1 });
  window.__cam(Math.PI + 0.3, 0.05, 6.5);
  window.__step(30);
  g.world.flash = 0.45;
  g.world.update(0, g.player.pos);
});

// keen senses: heartbeats through walls and the scent trail
await stage('senses.png', true, () => {
  const g = window.__lycan;
  window.__clear();
  window.__place({ x: -45 + 3.5, z: 160, form: 'human', time: 21.3, yaw: Math.PI });
  const p = g.player;
  for (let i = 0; i < 10; i++) {
    const o = g.npcs.spawn(i < 3 ? 'vampire' : 'civilian', p.pos.clone().add({ x: (i % 5) * 9 - 18, y: 0, z: -15 - Math.floor(i / 5) * 18 }), { state: 'wander' });
  }
  p.senses = true;
  window.__cam(Math.PI, -0.05, 4.2);
  window.__step(20);
});

// full moon over the lake
await stage('full-moon-lake.png', false, () => {
  const g = window.__lycan;
  window.__clear();
  window.__place({ x: 418, z: 25, time: 23.8, day: 2, yaw: Math.PI + 0.1 });
  window.__cam(Math.PI + 0.05, 0.36, 9);
  window.__step(20);
  g.player.wolf.howlT = 0.9;
  window.__step(12);
  window.__cam(Math.PI + 0.05, 0.36, 9);
});

// the Moon Shrine in the Ancient Ruins
await stage('ruins.png', true, () => {
  const g = window.__lycan;
  window.__clear();
  const s = g.world.shrine.pos;
  window.__place({ x: s.x + 3, z: s.z + 11, time: 0.5, day: 3, yaw: Math.PI });
  window.__cam(Math.PI - 0.2, 0.05, 7);
  window.__step(30);
});

// the Blackfang Alpha at its den
await stage('alpha.png', true, () => {
  const g = window.__lycan;
  window.__clear();
  const D = g.landmarks.den;
  window.__place({ x: D.x + 6, z: D.z + 24, time: 2, day: 3, yaw: Math.PI - 0.3 });
  const a = g.npcs.spawn('alpha', g.player.pos.clone().add({ x: -5, y: 0, z: -9 }), { state: 'guard' });
  a.yaw = 0.4;
  a.rig.playAttack('heavy');
  for (const dx of [-6, 6]) {
    const r = g.npcs.spawn('rival', g.player.pos.clone().add({ x: dx, y: 0, z: -6 }), { state: 'guard' });
    r.yaw = 0;
  }
  window.__cam(Math.PI + 0.35, 0.05, 8.5);
  window.__step(14);
});

// map + skills menus
if (want('map') || want('skills')) {
  await page.evaluate(() => {
    const g = window.__lycan;
    window.__clear();
    window.__place({ x: 30, z: 40, time: 22 });
    for (const [x, z, r] of [[0, 0, 320], [-300, -500, 160], [420, -110, 180], [-160, 450, 140]]) g.hud.reveal({ x, z }, r);
    g.rep.territory.Downtown = 45;
    g.rep.territory['Northwood Forest'] = 70;
    Object.assign(g.player.skills, { swift: 2, leap: 1, howl: 1, parry: 1 });
    g.player.skillPoints = 2;
    g.player.level = 6;
    g.player.moonstones = 9;
    g.world.vantages[0].done = true;
    window.__step(2);
    window.__hud(true);
    window.__render();
    g.openMenu('map');
  });
  await page.screenshot({ path: path.join(outDir, 'map.png') });
  await page.evaluate(() => window.__lycan.openMenu('skills'));
  await page.screenshot({ path: path.join(outDir, 'skills.png') });
  console.log('saved map.png, skills.png');
}

await browser.close();
