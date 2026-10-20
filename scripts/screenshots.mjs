// Stages the README screenshots: builds the game, boots it headless and
// poses the player, NPCs, camera and time of day for each shot.
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
await page.evaluate(() => {
  const g = window.__lycan;
  g.world.time = 21.5;
  g.world.update(0, g.player.pos);
});
await page.screenshot({ path: path.join(outDir, 'title.png') });

await page.evaluate(() => {
  const g = window.__lycan;
  g.renderer.setAnimationLoop(null);
  g.start(false);
  g.director.eventTimer = 1e9; // no random events while staging
  g.director.offerTimer = 1e9;
  g.npcs._populate = () => {}; // only the NPCs each shot places
  window.__step = (n) => {
    for (let i = 0; i < n; i++) g.step(1 / 60);
  };
  window.__clear = () => {
    for (const o of [...g.npcs.list]) g.npcs.remove(o);
    document.getElementById('toasts').innerHTML = '';
    document.querySelectorAll('.rep-pop').forEach((e) => e.remove());
    g.fx.parts.forEach((p) => (p.alive = false));
  };
  // put the player somewhere, in a form, at a time of day
  window.__place = ({ x, z, y = null, form = 'wolf', time = 22, day = 1, yaw = 0 }) => {
    const p = g.player;
    g.world.time = time;
    g.world.day = day;
    p.pos.set(x, y ?? g.world.groundAt(x, z, 500, 1000), z);
    p.vel.set(0, 0, 0);
    p.form = form;
    p.transformTo = null;
    p.human.root.visible = form === 'human';
    p.wolf.root.visible = form === 'wolf';
    p.human.root.scale.setScalar(1);
    p.wolf.root.scale.setScalar(1);
    p.yaw = yaw;
    p.climbing = false;
    p.onGround = true;
    p.healthFrac = 1;
    g.camera.focus.copy(p.pos).y += form === 'wolf' ? 2.5 : 1.6;
  };
  window.__cam = (yaw, pitch, dist) => {
    g.camera.yaw = yaw;
    g.camera.pitch = pitch;
    if (dist) g.camera.dist = dist;
  };
  window.__hud = (on) => {
    document.getElementById('hud').style.visibility = on ? 'visible' : 'hidden';
    document.getElementById('overlay').style.visibility = on ? 'visible' : 'hidden';
  };
  window.__render = () => g.renderer.render(g.scene, g.camera3);
});

const shot = async (name, hud = true) => {
  await page.evaluate((h) => {
    window.__hud(h);
    document.getElementById('toasts').innerHTML = '';
    window.__render();
  }, hud);
  await page.screenshot({ path: path.join(outDir, name) });
  console.log('saved', name);
};

// 1. the beast, front-on under a waxing moon in the plaza
await page.evaluate(() => {
  window.__clear();
  window.__place({ x: 4, z: 24, time: 22.5, day: 2, yaw: 0.35 });
  window.__cam(0.35 + Math.PI - 0.35, 0.18, 5.5);
  window.__step(40);
  window.__cam(0.35 + Math.PI - 0.35, 0.18, 5.5);
  window.__lycan.player.wolf.howlT = 0;
  window.__step(2);
});
await shot('beast.png', false);

// 2. mid-transformation
await page.evaluate(() => {
  const g = window.__lycan;
  window.__clear();
  window.__place({ x: 2, z: 22, form: 'human', time: 21.2, yaw: 0.6 });
  window.__cam(0.6 + Math.PI - 0.5, 0.12, 4.5);
  window.__step(20);
  g.player.transformCooldown = 0;
  g.player.startTransform('wolf');
  window.__step(44);
  g.camera.dist = 6.5;
  window.__step(1);
});
await shot('transform.png');

// 3. sprinting on all fours down an avenue
await page.evaluate(() => {
  const g = window.__lycan;
  window.__clear();
  window.__place({ x: -135, z: 150, time: 21, yaw: Math.PI });
  window.__cam(Math.PI, -0.12, 7);
  for (let i = 0; i < 110; i++) {
    g.input.keys.add('KeyW');
    g.input.keys.add('ShiftLeft');
    g.camera.yaw = Math.PI;
    g.step(1 / 60);
  }
  // swing the camera round without changing where the beast is heading
  const keep = g.player.yaw;
  g.camera.yaw = Math.PI + 0.55;
  g.camera.pitch = -0.1;
  g.input.keys.clear();
  g.player.yaw = keep;
  g.step(1 / 60);
});
await shot('sprint.png');
await page.evaluate(() => {
  window.__lycan.input.keys.clear();
});

// 4. climbing a tower
await page.evaluate(() => {
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
await shot('climb.png');

// 5. dusk on a rooftop, looking over Greyhaven
await page.evaluate(() => {
  const g = window.__lycan;
  window.__clear();
  let best = null;
  for (const b of g.world.colliders.boxes) {
    if (b.tag !== 'building') continue;
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    if (cz < 100 || Math.abs(cx) > 60) continue;
    if (!best || b.maxY > best.maxY) best = b;
  }
  window.__place({ x: (best.minX + best.maxX) / 2, z: best.minZ + 2, y: best.maxY, time: 18.7, yaw: Math.PI });
  window.__cam(Math.PI + 0.35, -0.08, 6.5);
  window.__step(30);
  window.__cam(Math.PI + 0.35, -0.08, 6.5);
  window.__step(1);
});
await shot('rooftop-dusk.png', false);

// 6. charged leap over the city by day
await page.evaluate(() => {
  const g = window.__lycan;
  window.__clear();
  window.__place({ x: 60, z: 190, time: 11, yaw: Math.PI });
  window.__cam(Math.PI, -0.05, 7);
  for (let i = 0; i < 60; i++) {
    g.input.keys.add('Space');
    g.step(1 / 60);
  }
  g.input.keys.delete('Space');
  g.input.released.add('Space');
  window.__step(38);
  g.camera.pitch = -0.25;
  window.__step(1);
});
await shot('leap-day.png');

// 7. vampires surround the beast
await page.evaluate(() => {
  const g = window.__lycan;
  window.__clear();
  window.__place({ x: -135, z: -90, time: 23, day: 2, yaw: Math.PI * 0.3 });
  const p = g.player;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const v = g.npcs.spawn('vampire', p.pos.clone().add({ x: Math.cos(a) * 3.6, y: 0, z: Math.sin(a) * 3.6 }), { state: 'attack' });
    v.yaw = Math.atan2(p.pos.x - v.pos.x, p.pos.z - v.pos.z);
    v.hp = v.maxHp * (0.3 + i * 0.2);
    v.stun = 999;
    v.rig.attackT = i % 2 ? 0.2 : 0;
  }
  window.__cam(Math.PI * 0.3 + 0.5, -0.42, 9);
  window.__step(4);
  g.player.wolf.playAttack('light', 1);
  window.__step(7);
  g.fx.blood(p.pos.clone().add({ x: 2.5, y: 1.4, z: 2.2 }), 2, '#3a0006');
  window.__step(3);
});
await shot('vampires.png');

// 8. hunters of the Silver Dawn opening fire in Northwood
await page.evaluate(() => {
  const g = window.__lycan;
  window.__clear();
  window.__place({ x: -150, z: -300, time: 15.5, yaw: 0 });
  const p = g.player;
  const hs = [];
  for (let i = 0; i < 4; i++) {
    const h = g.npcs.spawn('hunter', p.pos.clone().add({ x: -9 + i * 6, y: 0, z: 16 + (i % 2) * 3 }), { state: 'pursue' });
    h.yaw = Math.atan2(p.pos.x - h.pos.x, p.pos.z - h.pos.z);
    h.stun = 999;
    hs.push(h);
  }
  window.__cam(0.15, -0.12, 7.5);
  for (let k = 0; k < 20; k++) {
    for (const h of hs) h.aiming = true;
    g.step(1 / 60);
  }
  for (const h of hs) {
    const m = h.pos.clone().add({ x: 0, y: 1.45, z: 0 });
    g.fx.tracer(m, p.pos.clone().add({ x: (Math.random() - 0.5) * 3, y: 1.5 + Math.random(), z: 0 }), '#d8e4ff');
    g.fx.sparks(m);
    h.aiming = true;
  }
  g.fx.update(0.001);
});
await shot('hunters.png');

// 9. full moon over the lake
await page.evaluate(() => {
  const g = window.__lycan;
  window.__clear();
  window.__place({ x: 318, z: 45, time: 23.8, day: 2, yaw: Math.PI + 0.1 });
  window.__cam(Math.PI + 0.05, 0.36, 9);
  window.__step(20);
  g.player.wolf.howlT = 0.9;
  window.__step(12);
  window.__cam(Math.PI + 0.05, 0.36, 9);
  window.__step(1);
});
await shot('full-moon-lake.png', false);

// 10. the Moon Shrine in the Ancient Ruins
await page.evaluate(() => {
  const g = window.__lycan;
  window.__clear();
  const s = g.world.shrine.pos;
  window.__place({ x: s.x + 3, z: s.z + 11, time: 0.5, day: 3, yaw: Math.PI });
  window.__cam(Math.PI - 0.2, 0.05, 7);
  window.__step(30);
});
await shot('ruins.png');

// 11. the Blackfang Alpha at its den
await page.evaluate(() => {
  const g = window.__lycan;
  window.__clear();
  const D = g.landmarks.den;
  window.__place({ x: D.x + 6, z: D.z + 24, time: 2, day: 3, yaw: Math.PI - 0.3 });
  const a = g.npcs.spawn('alpha', g.player.pos.clone().add({ x: -5, y: 0, z: -9 }), { state: 'guard' });
  a.yaw = 0.4;
  a.stun = 999;
  a.rig.playAttack('heavy');
  for (const dx of [-6, 6]) {
    const r = g.npcs.spawn('rival', g.player.pos.clone().add({ x: dx, y: 0, z: -6 }), { state: 'guard' });
    r.yaw = 0;
    r.stun = 999;
  }
  window.__cam(Math.PI + 0.35, 0.05, 8.5);
  window.__step(14);
});
await shot('alpha.png');

// 12. map + skills menus
await page.evaluate(() => {
  const g = window.__lycan;
  window.__clear();
  window.__place({ x: 30, z: 40, time: 22 });
  g.rep.territory.Downtown = 45;
  g.rep.territory['Northwood Forest'] = 70;
  g.player.skills.swift = 2;
  g.player.skills.leap = 1;
  g.player.skills.howl = 1;
  g.player.skillPoints = 2;
  g.player.level = 4;
  window.__step(2);
  window.__hud(true);
  window.__render();
  g.openMenu('map');
});
await page.screenshot({ path: path.join(outDir, 'map.png') });
await page.evaluate(() => window.__lycan.openMenu('skills'));
await page.screenshot({ path: path.join(outDir, 'skills.png') });
console.log('saved map.png, skills.png');

await browser.close();
