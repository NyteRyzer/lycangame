// Interactive street furniture and vehicles. Everything here is instanced
// (hundreds of objects, a handful of draw calls) and simulated as a rigid
// body only while disturbed: knocked, thrown, smashed, exploded or driven.
import * as THREE from 'three';
import { downtownRoads } from './world.js';
import { clamp, pick, rand } from './util.js';

const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const cyl = (rt, rb, h, x = 0, y = 0, z = 0, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y, z);
const wheel = (x, z) => new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10).rotateZ(Math.PI / 2).translate(x, -0.42, z);
function merge(geos) {
  // tiny merge (all non-indexed after toNonIndexed) so each part is one draw call
  const parts = geos.map((g) => g.toNonIndexed());
  const total = parts.reduce((s, g) => s + g.attributes.position.count, 0);
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3);
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}

const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...o });

// Each type: half extents (geometry is centred), mass, grab tier and parts.
const DEFS = {
  hydrant: { half: [0.25, 0.45, 0.25], mass: 1, tier: 9, parts: () => [[merge([cyl(0.18, 0.22, 0.75, 0, -0.07), cyl(0.12, 0.2, 0.2, 0, 0.38), cyl(0.07, 0.07, 0.5, 0, 0.05).rotateZ(Math.PI / 2)]), M('#b8241c')]] },
  bench: { half: [1.0, 0.45, 0.35], mass: 3, tier: 2, parts: () => [[merge([box(2, 0.08, 0.6, 0, 0, 0), box(2, 0.5, 0.06, 0, 0.3, -0.28)]), M('#6a4a2e')], [merge([box(0.08, 0.45, 0.6, -0.9, -0.23, 0), box(0.08, 0.45, 0.6, 0.9, -0.23, 0)]), M('#2a2a2a', { metalness: 0.6 })]] },
  trash: { half: [0.32, 0.5, 0.32], mass: 1, tier: 1, parts: () => [[merge([cyl(0.3, 0.26, 0.95, 0, -0.02), cyl(0.33, 0.33, 0.06, 0, 0.47)]), M('#3a5a3a', { metalness: 0.3 })]] },
  newsbox: { half: [0.3, 0.55, 0.3], mass: 1, tier: 1, parts: () => [[box(0.55, 1.1, 0.55), M('#2a5a9a')], [box(0.4, 0.3, 0.02, 0, 0.25, 0.28), M('#e8e4da', { emissive: '#333333' })]] },
  mailbox: { half: [0.32, 0.7, 0.32], mass: 1.5, tier: 1, parts: () => [[merge([box(0.6, 0.7, 0.6, 0, 0.35), box(0.1, 0.7, 0.1, 0, -0.35)]), M('#1f3a7a')]] },
  dumpster: { half: [1.2, 0.8, 0.8], mass: 6, tier: 2, parts: () => [[box(2.4, 1.6, 1.6), M('#2a5a3a', { metalness: 0.4 })], [box(2.45, 0.1, 1.65, 0, 0.82), M('#1a3a2a')]] },
  barrel: { half: [0.35, 0.5, 0.35], mass: 1.5, tier: 1, explosive: true, parts: () => [[cyl(0.34, 0.34, 1, 0, 0, 0, 12), M('#b8401c', { metalness: 0.4 })], [merge([cyl(0.36, 0.36, 0.06, 0, 0.3), cyl(0.36, 0.36, 0.06, 0, -0.3)]), M('#2a2a2a')]] },
  car: {
    half: [1.0, 0.75, 2.2], mass: 10, tier: 3, car: true,
    parts: () => [
      [merge([box(2, 0.7, 4.4, 0, -0.2, 0), box(1.9, 0.12, 1.2, 0, 0.18, 1.5)]), M('#ffffff', { metalness: 0.5, roughness: 0.35 }), 'color'],
      [box(1.7, 0.6, 2.1, 0, 0.45, -0.2), M('#ffffff', { metalness: 0.5, roughness: 0.35 }), 'color'],
      [merge([box(1.72, 0.45, 1.9, 0, 0.47, -0.2)]), M('#18222c', { metalness: 0.8, roughness: 0.1 })],
      [merge([wheel(-0.95, 1.35), wheel(0.95, 1.35), wheel(-0.95, -1.35), wheel(0.95, -1.35)]), M('#111')],
      [merge([box(0.3, 0.14, 0.05, -0.65, -0.1, 2.21), box(0.3, 0.14, 0.05, 0.65, -0.1, 2.21)]), new THREE.MeshBasicMaterial({ color: '#fff4c8', toneMapped: false }), 'lights'],
      [merge([box(0.3, 0.14, 0.05, -0.65, -0.1, -2.21), box(0.3, 0.14, 0.05, 0.65, -0.1, -2.21)]), new THREE.MeshBasicMaterial({ color: '#ff2a1a', toneMapped: false })],
    ],
  },
};
const CAR_COLORS = ['#a01818', '#1a3a8a', '#d8d8d0', '#202020', '#5a6a70', '#c8a020', '#2a6a3a', '#7a2a6a', '#b85a20'];
const TIER = { human: 1, hybrid: 2, wolf: 3 };
const CELL = 16;

export class PropSystem {
  constructor(game) {
    this.game = game;
    this.items = [];
    this.sets = {};
    this.grid = new Map();
    this.dynamic = new Set();
    this.traffic = [];
    this.geysers = [];
    this._q = [];
    this._m = new THREE.Matrix4();
    this._s = new THREE.Vector3(1, 1, 1);
    const w = game.world;
    const counts = {};
    for (const s of w.propSpots) counts[s.type] = (counts[s.type] || 0) + 1;
    counts.car = w.parkingSpots.length + 46;
    for (const [type, def] of Object.entries(DEFS)) {
      const cap = counts[type] || 0;
      if (!cap) continue;
      const parts = def.parts().map(([geo, mat, flag]) => {
        const im = new THREE.InstancedMesh(geo, mat, cap);
        im.castShadow = type === 'car' || type === 'dumpster' || type === 'bench';
        im.receiveShadow = true;
        im.count = 0;
        im.frustumCulled = false;
        game.scene.add(im);
        return { im, flag };
      });
      this.sets[type] = { parts, used: 0, cap, dirty: false };
    }
    // police light bars (few, so plain meshes)
    this.sirenGeo = new THREE.BoxGeometry(0.7, 0.14, 0.25);
    for (const s of w.propSpots) this._add(s.type, s.x, s.z, s.rot);
    for (const p of w.parkingSpots) this._add('car', p.x, p.z, p.yaw, { color: pick(CAR_COLORS) });
    this._spawnTraffic(26);
    for (const set of Object.values(this.sets)) for (const p of set.parts) p.im.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------ items
  _add(type, x, z, yaw, opts = {}) {
    const def = DEFS[type];
    const set = this.sets[type];
    if (!set || set.used >= set.cap) return null;
    const idx = set.used++;
    const ground = this.game.world.groundAt(x, z, 2, 3);
    const it = {
      type, def, idx, kind: def.car ? 'car' : 'prop',
      pos: new THREE.Vector3(x, ground + def.half[1], z),
      quat: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
      vel: new THREE.Vector3(), ang: new THREE.Vector3(),
      mass: def.mass, hp: def.car ? 120 : 25, held: false, broken: false, dynamic: false,
      hitCd: 0, thrownT: 0, alarmT: 0, cell: null, color: opts.color, police: !!opts.police,
    };
    for (const p of set.parts) {
      p.im.count = set.used;
      if (p.flag === 'color') p.im.setColorAt(idx, new THREE.Color(it.police ? (p === set.parts[1] ? '#f0f0f0' : '#141c2a') : opts.color || '#888'));
      if (p.im.instanceColor) p.im.instanceColor.needsUpdate = true;
    }
    if (it.police) {
      it.siren = [new THREE.Mesh(this.sirenGeo, new THREE.MeshBasicMaterial({ color: '#ff2020', toneMapped: false })), new THREE.Mesh(this.sirenGeo, new THREE.MeshBasicMaterial({ color: '#2040ff', toneMapped: false }))];
      it.siren.forEach((s, i) => { s.position.set(i ? 0.35 : -0.35, 0.82, -0.2); this.game.scene.add(s); });
    }
    this.items.push(it);
    this._rebucket(it);
    this._write(it);
    return it;
  }

  _key(cx, cz) {
    return cx * 92837111 ^ cz * 689287499;
  }

  _rebucket(it) {
    const cx = Math.floor(it.pos.x / CELL), cz = Math.floor(it.pos.z / CELL);
    const k = this._key(cx, cz);
    if (it.cell === k) return;
    if (it.cell !== null) this.grid.get(it.cell)?.delete(it);
    let s = this.grid.get(k);
    if (!s) this.grid.set(k, (s = new Set()));
    s.add(it);
    it.cell = k;
  }

  near(x, z, r, out = this._q) {
    out.length = 0;
    const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
    const z0 = Math.floor((z - r) / CELL), z1 = Math.floor((z + r) / CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const s = this.grid.get(this._key(cx, cz));
        if (s) for (const it of s) out.push(it);
      }
    }
    return out;
  }

  _write(it) {
    const set = this.sets[it.type];
    this._s.setScalar(it.gone ? 0 : 1);
    this._m.compose(it.pos, it.quat, this._s);
    for (const p of set.parts) p.im.setMatrixAt(it.idx, this._m);
    set.dirty = true;
    if (it.siren) {
      it.siren.forEach((s, i) => {
        s.position.set(i ? 0.35 : -0.35, 0.82, -0.2).applyQuaternion(it.quat).add(it.pos);
        s.quaternion.copy(it.quat);
      });
    }
  }

  _yaw(it) {
    const f = new THREE.Vector3(0, 0, 1).applyQuaternion(it.quat);
    return Math.atan2(f.x, f.z);
  }

  // vertical half-extent of the oriented box (so tumbled things rest correctly)
  _extentY(it) {
    const e = new THREE.Matrix4().makeRotationFromQuaternion(it.quat).elements;
    const [hx, hy, hz] = it.def.half;
    return Math.abs(e[1]) * hx + Math.abs(e[5]) * hy + Math.abs(e[9]) * hz;
  }

  _upright(it) {
    return new THREE.Vector3(0, 1, 0).applyQuaternion(it.quat).y > 0.9;
  }

  // ------------------------------------------------------------ disturbing things
  launch(it, vel, spin = 1) {
    if (it.gone || it.held) return;
    if (it.driving) this._stopDriving(it);
    it.vel.add(vel);
    it.ang.set(rand(-1, 1) * spin, rand(-1, 1) * spin, rand(-1, 1) * spin);
    if (!it.dynamic) {
      it.dynamic = true;
      this.dynamic.add(it);
    }
    if (it.kind === 'car' && it.alarmT <= 0) {
      it.alarmT = 18;
      this._panic(it.pos);
    }
    if (it.type === 'hydrant' && !it.broken) {
      it.broken = true;
      this.geysers.push({ pos: it.pos.clone().setY(it.pos.y - it.def.half[1] + 0.2), t: 20 });
      this.game.audio.splash();
    }
  }

  _damageItem(it, dmg) {
    it.hp -= dmg;
    if (it.def.explosive && it.hp <= 0 && !it.gone) this._explode(it);
    if (it.kind === 'car' && it.hp <= 0 && !it.wrecked) {
      it.wrecked = true;
      const set = this.sets.car;
      for (const p of set.parts) if (p.flag === 'color') { p.im.setColorAt(it.idx, new THREE.Color('#2a2420')); p.im.instanceColor.needsUpdate = true; }
      this.game.fx.burst(it.pos, { count: 30, color: new THREE.Color('#ff8a2a'), speed: 6, size: 0.6, life: 0.8, gravity: 0 });
      it.smokeT = 30;
      this.game.audio.crash();
    }
  }

  _explode(it) {
    const g = this.game;
    it.gone = true;
    this._write(it);
    this.dynamic.delete(it);
    g.fx.burst(it.pos, { count: 80, color: new THREE.Color('#ff8a2a'), speed: 14, size: 0.9, life: 0.9, gravity: 1 });
    g.fx.burst(it.pos, { count: 40, color: new THREE.Color('#2a2420'), speed: 5, size: 1.6, life: 2, gravity: 2 });
    g.fx.ring(it.pos, 10, '#ff8a2a', 0.6);
    g.camera.shake(0.5, 0.5);
    g.audio.explosion();
    g.npcs.shockwave(it.pos, 6, 45, 18, g.player);
    if (g.player.pos.distanceTo(it.pos) < 5) g.player.takeDamage(18);
    g.decals?.crater(it.pos, 2.5);
    this.shockwave(it.pos, 8, 18, it);
  }

  _panic(pos) {
    const g = this.game;
    for (const o of g.npcs.list) if (o.type === 'civilian' && !o.dead && o.pos.distanceTo(pos) < 25) { o.state = 'flee'; o.fear = 6; o.threat = pos.clone(); }
    if (g.player.isWolf && g.player.pos.distanceTo(pos) < 30 && g.world.isNight === false) g.rep.addHeat(0.1);
  }

  shockwave(p, r, force, except = null) {
    for (const it of this.near(p.x, p.z, r + 3, [])) {
      if (it === except || it.gone || it.held) continue;
      const d = it.pos.distanceTo(p);
      if (d > r + 1) continue;
      const f = 1 - d / (r + 1);
      const dir = it.pos.clone().sub(p).setY(0).normalize();
      const k = (force * f * 1.6) / Math.sqrt(it.mass);
      this.launch(it, dir.multiplyScalar(k).add(new THREE.Vector3(0, k * 0.7, 0)), 3 * f);
      this._damageItem(it, force * f);
    }
  }

  hitCone(origin, dir, range, minDot, force, dmg) {
    for (const it of this.near(origin.x, origin.z, range + 3, [])) {
      if (it.gone || it.held) continue;
      const dx = it.pos.x - origin.x, dz = it.pos.z - origin.z;
      const d = Math.hypot(dx, dz) - Math.max(it.def.half[0], it.def.half[2]) * 0.7;
      if (d > range) continue;
      if ((dx * dir.x + dz * dir.z) / (Math.hypot(dx, dz) || 1) < minDot) continue;
      const k = (force * 1.5) / Math.sqrt(it.mass);
      this.launch(it, dir.clone().setY(0).normalize().multiplyScalar(k).add(new THREE.Vector3(0, k * 0.5, 0)), 2);
      this._damageItem(it, dmg);
      this.game.audio.thud(it.kind === 'car');
    }
  }

  // something fast passes through (thrown body, bullet, charging demon)
  impactAt(p, speed, radius) {
    if (speed < 8) return;
    for (const it of this.near(p.x, p.z, radius + 3, [])) {
      if (it.gone || it.held || it.dynamic) continue;
      if (it.pos.distanceTo(p) > radius + Math.max(...it.def.half)) continue;
      const dir = it.pos.clone().sub(p).setY(0).normalize();
      this.launch(it, dir.multiplyScalar(speed * 0.4 / Math.sqrt(it.mass)).add(new THREE.Vector3(0, 3, 0)), 1.5);
      this._damageItem(it, speed * 0.6);
    }
  }

  // ------------------------------------------------------------ grabbing
  nearestGrabbable(p, range, form) {
    const tier = TIER[form];
    let best = null, bd = range;
    for (const it of this.near(p.x, p.z, range + 2, [])) {
      if (it.gone || it.held || it.def.tier > tier) continue;
      if (it.type === 'hydrant' && !it.broken) continue;
      const d = Math.hypot(it.pos.x - p.x, it.pos.z - p.z) - Math.max(it.def.half[0], it.def.half[2]) * 0.5;
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }

  grab(it) {
    if (it.driving) this._stopDriving(it);
    it.held = true;
    this.dynamic.delete(it);
    it.dynamic = false;
    if (it.kind === 'car' && it.alarmT <= 0) {
      it.alarmT = 18;
      this._panic(it.pos);
    }
  }

  holdAt(it, p, yaw) {
    it.pos.copy(p).add(new THREE.Vector3(0, it.def.half[1], 0));
    it.quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw + (it.kind === 'car' ? Math.PI / 2 : 0));
    this._rebucket(it);
    this._write(it);
  }

  release(it, vel, thrown = false) {
    it.held = false;
    it.vel.copy(vel);
    it.ang.set(rand(-2, 2), rand(-1, 1), rand(-2, 2));
    it.dynamic = true;
    this.dynamic.add(it);
    it.thrownT = thrown ? 2.5 : 0;
  }

  // ------------------------------------------------------------ player interaction
  collidePlayer(player) {
    const p = player.pos;
    const r = player.radius;
    for (const it of this.near(p.x, p.z, 4, this._q)) {
      if (it.gone || it.held) continue;
      const [hx, hy, hz] = it.def.half;
      const top = it.pos.y + this._extentY(it);
      const bottom = it.pos.y - this._extentY(it);
      if (p.y >= top - 0.35 || p.y + player.height <= bottom) continue;
      const yaw = this._yaw(it);
      const c = Math.cos(-yaw), s = Math.sin(-yaw);
      const dx = p.x - it.pos.x, dz = p.z - it.pos.z;
      const lx = dx * c + dz * s, lz = -dx * s + dz * c;
      const ex = this._upright(it) ? hx : Math.max(hx, hy), ez = this._upright(it) ? hz : Math.max(hz, hy);
      const qx = clamp(lx, -ex, ex), qz = clamp(lz, -ez, ez);
      const ox = lx - qx, oz = lz - qz;
      const d2 = ox * ox + oz * oz;
      if (d2 > r * r) continue;
      // a charging monster bowls light things (and a sprinting beast, cars) aside
      const sp = player.speed;
      const smash = (player.isWolf && it.mass <= 3 && sp > 4) || (player.isBeast && sp > 18) || (player.isHybrid && sp > 12 && it.mass <= 6);
      if (smash) {
        const dir = new THREE.Vector3(player.vel.x, 0, player.vel.z).normalize();
        const k = (sp * 0.9) / Math.sqrt(it.mass);
        this.launch(it, dir.multiplyScalar(k).add(new THREE.Vector3(0, k * 0.4 + 2, 0)), 2);
        this._damageItem(it, sp);
        if (it.mass > 3) {
          this.game.camera.shake(0.25, 0.2);
          this.game.audio.crash();
          player.vel.multiplyScalar(0.75);
        }
        continue;
      }
      let nx, nz, depth;
      if (d2 < 1e-6) {
        const pen = [ex - lx, ex + lx, ez - lz, ez + lz];
        const m = Math.min(...pen);
        const i = pen.indexOf(m);
        nx = i === 0 ? 1 : i === 1 ? -1 : 0;
        nz = i === 2 ? 1 : i === 3 ? -1 : 0;
        depth = m + r;
      } else {
        const d = Math.sqrt(d2);
        nx = ox / d; nz = oz / d;
        depth = r - d;
      }
      // back to world space
      const wx = nx * c - nz * s, wz = nx * s + nz * c;
      p.x += wx * depth;
      p.z += wz * depth;
      const into = player.vel.x * wx + player.vel.z * wz;
      if (into < 0) {
        player.vel.x -= wx * into;
        player.vel.z -= wz * into;
      }
    }
  }

  // tops of cars, dumpsters and benches are walkable
  groundAt(x, z, y) {
    let best = -Infinity;
    for (const it of this.near(x, z, 3, this._q)) {
      if (it.gone || it.held || it.mass < 2) continue;
      const [hx, , hz] = it.def.half;
      const yaw = this._yaw(it);
      const c = Math.cos(-yaw), s = Math.sin(-yaw);
      const dx = x - it.pos.x, dz = z - it.pos.z;
      const lx = dx * c + dz * s, lz = -dx * s + dz * c;
      if (Math.abs(lx) > hx || Math.abs(lz) > hz) continue;
      const top = it.pos.y + this._extentY(it);
      if (top <= y + 0.6 && top > best) best = top;
    }
    return best;
  }

  // ------------------------------------------------------------ traffic
  _lanePos(axis, road, dir, t) {
    // right-hand traffic, lanes 3.5m either side of the centre line
    if (axis === 'z') return new THREE.Vector3(road - dir * 3.5, 0, t);
    return new THREE.Vector3(t, 0, road + dir * 3.5);
  }

  _spawnTraffic(n) {
    const roads = downtownRoads();
    for (let i = 0; i < n; i++) {
      const it = this._add('car', 0, 0, 0, { color: pick(CAR_COLORS) });
      if (!it) break;
      this._placeOnRoad(it, roads, null);
      this.traffic.push(it);
    }
  }

  _placeOnRoad(it, roads, near) {
    const axis = Math.random() < 0.5 ? 'x' : 'z';
    const road = pick(roads);
    const dir = Math.random() < 0.5 ? 1 : -1;
    let t = rand(-260, 260);
    if (near) {
      const along = axis === 'z' ? near.z : near.x;
      t = clamp(along + (Math.random() < 0.5 ? -1 : 1) * rand(80, 180), -260, 260);
    }
    it.driving = { axis, road, dir, t, speed: rand(9, 13), brake: 0, nextTurn: null };
    it.gone = false;
    it.dynamic = false;
    it.held = false;
    it.vel.set(0, 0, 0);
    it.alarmT = 0;
    it.hp = 120;
    it.wrecked = false;
    const p = this._lanePos(axis, road, dir, t);
    it.pos.set(p.x, 0.75 + 0.04, p.z);
    const yaw = axis === 'z' ? (dir > 0 ? 0 : Math.PI) : dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    it.quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    this._rebucket(it);
    this._write(it);
  }

  _stopDriving(it) {
    it.driving = null;
    const i = this.traffic.indexOf(it);
    if (i >= 0) this.traffic.splice(i, 1);
  }

  _drive(it, dt) {
    const D = it.driving;
    const g = this.game;
    const roads = downtownRoads();
    // brake for anything in front
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(it.quat);
    let blocked = false;
    const probe = it.pos.clone().addScaledVector(fwd, 5);
    if (g.player.pos.distanceTo(probe) < 4 && g.player.pos.y < 3) blocked = true;
    if (!blocked) for (const o of g.npcs.list) if (!o.dead && o.pos.distanceToSquared(probe) < 9) { blocked = true; break; }
    if (!blocked) for (const c of this.near(probe.x, probe.z, 4, [])) if (c !== it && c.kind === 'car' && c.pos.distanceTo(probe) < 3.5) { blocked = true; break; }
    const want = blocked ? 0 : D.speed;
    D.cur = (D.cur ?? D.speed) + (want - (D.cur ?? D.speed)) * Math.min(1, dt * (blocked ? 4 : 1.2));
    if (blocked && (D.honkT = (D.honkT || 0) - dt) <= 0 && g.player.pos.distanceTo(it.pos) < 25) {
      D.honkT = 2.5;
      g.audio.horn();
    }
    const prevT = D.t;
    D.t += D.dir * D.cur * dt;
    // at an intersection: maybe turn
    for (const cross of roads) {
      if ((prevT - cross) * (D.t - cross) <= 0 && prevT !== cross) {
        const r = Math.random();
        if (r < 0.35 && Math.abs(cross) < 271) {
          const newDir = Math.random() < 0.5 ? 1 : -1;
          const along = D.road;
          D.axis = D.axis === 'z' ? 'x' : 'z';
          D.road = cross;
          D.dir = newDir;
          D.t = along;
        }
        break;
      }
    }
    if (Math.abs(D.t) > 268) {
      D.dir *= -1;
      D.t = clamp(D.t, -268, 268);
    }
    const p = this._lanePos(D.axis, D.road, D.dir, D.t);
    it.pos.x = p.x;
    it.pos.z = p.z;
    const yaw = D.axis === 'z' ? (D.dir > 0 ? 0 : Math.PI) : D.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    it.quat.slerp(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), Math.min(1, dt * 6));
    // cars knock pedestrians aside
    for (const o of g.npcs.list) {
      if (o.dead || o.held) continue;
      if (o.pos.distanceTo(it.pos) < 2.2 && D.cur > 4) g.npcs.damage(o, D.cur * 2, { knock: D.cur, from: it.pos });
    }
    this._rebucket(it);
    this._write(it);
  }

  spawnPoliceCar(near) {
    const roads = downtownRoads();
    const it = this._add('car', 0, 0, 0, { police: true });
    if (!it) return null;
    this._placeOnRoad(it, roads, near);
    it.driving = null; // parked across the lane, lights flashing
    this._write(it);
    this.game.audio.siren(it.pos.distanceTo(near));
    return it;
  }

  // ------------------------------------------------------------ simulation
  update(dt) {
    const g = this.game;
    const w = g.world;
    const pp = g.player.pos;
    for (const it of this.traffic) {
      if (!it.driving) continue;
      if (it.pos.distanceTo(pp) > 240) this._placeOnRoad(it, downtownRoads(), pp);
      else this._drive(it, dt);
    }
    if (this.traffic.length < 26 && Math.random() < dt) {
      // replace cars that were wrecked or stolen
      const it = this._add('car', 0, 0, 0, { color: pick(CAR_COLORS) });
      if (it) {
        this._placeOnRoad(it, downtownRoads(), pp);
        this.traffic.push(it);
      }
    }
    for (const it of this.dynamic) {
      it.hitCd -= dt;
      it.thrownT -= dt;
      it.vel.y -= 25 * dt;
      const sp = it.vel.length();
      it.pos.addScaledVector(it.vel, dt);
      const dq = new THREE.Quaternion().setFromEuler(new THREE.Euler(it.ang.x * dt, it.ang.y * dt, it.ang.z * dt));
      it.quat.premultiply(dq).normalize();
      const r = Math.min(it.def.half[0], it.def.half[2]) + 0.1;
      const n = new THREE.Vector3();
      if (w.collide(it.pos, r, this._extentY(it), 0.2, n)) {
        const into = it.vel.dot(n);
        if (into < 0) it.vel.addScaledVector(n, -into * 1.4);
        it.ang.multiplyScalar(0.7);
        if (sp > 10) {
          g.audio.thud(it.kind === 'car');
          this._damageItem(it, sp * 0.5);
        }
      }
      const ground = w.groundAt(it.pos.x, it.pos.z, it.pos.y, 1);
      const ey = this._extentY(it);
      if (it.pos.y - ey <= ground) {
        it.pos.y = ground + ey;
        if (it.vel.y < -4) {
          g.audio.thud(it.kind === 'car');
          if (it.vel.y < -12) this._damageItem(it, -it.vel.y);
          if (it.def.explosive && it.vel.y < -8) this._damageItem(it, 30);
        }
        it.vel.y = Math.max(0, -it.vel.y * 0.25);
        it.vel.x *= 0.85;
        it.vel.z *= 0.85;
        it.ang.multiplyScalar(0.8);
        // settle flat on whichever face is down
        if (sp < 1.2) {
          it.dynamic = false;
          it.vel.set(0, 0, 0);
          it.ang.set(0, 0, 0);
          this.dynamic.delete(it);
        }
      }
      // fast-moving objects hurt whatever they hit
      if (sp > 8 && it.hitCd <= 0) {
        const thrown = it.thrownT > 0;
        const hits = g.npcs.damageInRadius(it.pos, Math.max(...it.def.half) + 0.3, it.mass * sp * (thrown ? 0.6 : 0.3), sp * 0.5, thrown ? g.player : null);
        if (hits.length) {
          it.hitCd = 0.3;
          it.vel.multiplyScalar(0.6);
          if (thrown) g.player._registerHit?.(hits.length);
          g.audio.hit();
        }
        // and knock over other props
        for (const o of this.near(it.pos.x, it.pos.z, 3, [])) {
          if (o === it || o.gone || o.held || o.dynamic) continue;
          if (o.pos.distanceTo(it.pos) < Math.max(...o.def.half) + Math.max(...it.def.half)) {
            this.launch(o, it.vel.clone().multiplyScalar((it.mass / (it.mass + o.mass)) * 0.8), 2);
            this._damageItem(o, sp * it.mass * 0.2);
          }
        }
      }
      if (Math.abs(it.pos.x) > 900 || Math.abs(it.pos.z) > 900 || it.pos.y < -50) {
        it.gone = true;
        this.dynamic.delete(it);
      }
      this._rebucket(it);
      this._write(it);
    }
    // alarms, sirens, smoke, geysers
    const t = performance.now() / 1000;
    for (const it of this.items) {
      if (it.alarmT > 0) {
        it.alarmT -= dt;
        if ((it._beep = (it._beep || 0) - dt) <= 0) {
          it._beep = 0.5;
          const d = it.pos.distanceTo(pp);
          if (d < 80) g.audio.carAlarm(d);
        }
      }
      if (it.siren) {
        const on = Math.sin(t * 12) > 0;
        it.siren[0].material.color.set(on ? '#ff2020' : '#300000');
        it.siren[1].material.color.set(on ? '#000830' : '#2040ff');
      }
      if (it.smokeT > 0) {
        it.smokeT -= dt;
        if (Math.random() < 0.3) g.fx.spawn(it.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), new THREE.Vector3(rand(-0.5, 0.5), 2.5, rand(-0.5, 0.5)), new THREE.Color('#2a2826'), 1.4, 2, 0.5);
      }
    }
    for (let i = this.geysers.length - 1; i >= 0; i--) {
      const gz = this.geysers[i];
      gz.t -= dt;
      if (gz.pos.distanceTo(pp) < 120) {
        for (let k = 0; k < 5; k++) g.fx.spawn(gz.pos, new THREE.Vector3(rand(-1.2, 1.2), rand(10, 15), rand(-1.2, 1.2)), new THREE.Color('#cfe8ff'), 0.16, 1.2, -18);
      }
      // the spray knocks back anyone standing in it
      for (const o of g.npcs.list) if (!o.dead && o.pos.distanceTo(gz.pos) < 1.2) o.vel.y = Math.max(o.vel.y, 6);
      if (gz.t <= 0) this.geysers.splice(i, 1);
    }
    for (const set of Object.values(this.sets)) {
      if (!set.dirty) continue;
      set.dirty = false;
      for (const p of set.parts) p.im.instanceMatrix.needsUpdate = true;
    }
  }
}
