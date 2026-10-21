// Everyone else in Greyhaven: civilians, police, monster hunters, vampires,
// witches, ghouls, demon brutes, rival werewolves, packmates and wildlife.
// Spawning, AI, combat, grabbing/throwing, finishers and projectiles.
import * as THREE from 'three';
import { HumanRig, QuadRig, WolfRig } from './characters.js';
import { LANDMARKS, districtAt, terrainHeight } from './world.js';
import { clamp, dampAngle, pick, rand } from './util.js';

const SKIN = ['#f1c9a5', '#d9a77f', '#b98a6a', '#8d5a3c', '#5e3a26', '#e8b896', '#c48d6a'];
const SHIRTS = ['#7a3b3b', '#3b5a7a', '#5a7a3b', '#7a6a3b', '#444', '#a0a0a0', '#6a3b7a', '#2f4f4f', '#b07a3a', '#d0c8b8', '#c84a4a', '#3a8a8a'];
const PANTS = ['#22252e', '#3a3a44', '#4a3a2a', '#1f2a3a', '#55504a', '#2a4a6a'];
const HAIR = ['#1b130e', '#3a2a1a', '#6b4a2a', '#b08a50', '#888', '#111', '#8a3a1a', '#d8c08a'];
const COATS = ['#5a4a3a', '#2a2a30', '#6a5a4a', '#3a4a5a', '#7a2a2a'];

export const TYPES = {
  civilian: { hp: 30, speed: 2.2, run: 6.5, radius: 0.35, height: 1.8, xp: 5 },
  police: { hp: 60, speed: 3, run: 7, radius: 0.4, height: 1.8, xp: 15 },
  hunter: { hp: 75, speed: 3, run: 6.8, radius: 0.4, height: 1.8, xp: 30 },
  captain: { hp: 220, speed: 3, run: 6.5, radius: 0.45, height: 1.9, xp: 120 },
  vampire: { hp: 95, speed: 4, run: 10.5, radius: 0.4, height: 1.8, xp: 40 },
  witch: { hp: 85, speed: 3, run: 6, radius: 0.4, height: 1.9, xp: 50 },
  ghoul: { hp: 40, speed: 4, run: 9.5, radius: 0.38, height: 1.6, xp: 15 },
  demon: { hp: 520, speed: 4, run: 8, radius: 0.95, height: 3.2, xp: 250 },
  rival: { hp: 170, speed: 5, run: 15, radius: 0.8, height: 2.6, xp: 55 },
  alpha: { hp: 750, speed: 5, run: 17, radius: 1.1, height: 3.4, xp: 400 },
  packmate: { hp: 200, speed: 5, run: 24, radius: 0.8, height: 2.6, xp: 0 },
  deer: { hp: 35, speed: 1.5, run: 13, radius: 0.5, height: 1.6, xp: 8, animal: true },
  rabbit: { hp: 6, speed: 1.2, run: 9, radius: 0.2, height: 0.4, xp: 2, animal: true },
};
const HUMANOID = new Set(['civilian', 'police', 'hunter', 'captain', 'vampire', 'witch', 'ghoul']);
const BOSSY = new Set(['alpha', 'demon', 'captain']);

let NPC_ID = 1;

function civilianLook() {
  const female = Math.random() < 0.45;
  const o = {
    skin: pick(SKIN), shirt: pick(SHIRTS), pants: pick(PANTS), hair: pick(HAIR), female,
    scale: rand(0.92, 1.06) * (female ? 0.96 : 1), build: rand(0.9, 1.2),
    hairStyle: female ? pick(['long', 'bun', 'short', 'long']) : pick(['short', 'short', 'bald', 'mohawk']),
    sleeves: Math.random() < 0.5 ? 'short' : 'long',
  };
  if (female && Math.random() < 0.35) o.skirt = pick(['#2a2a40', '#7a2a4a', '#3a5a3a', '#111']);
  if (Math.random() < 0.18) o.coat = pick(COATS);
  if (Math.random() < 0.15) o.backpack = pick(['#2a4a6a', '#6a2a2a', '#333']);
  if (Math.random() < 0.15) o.glasses = true;
  if (!female && Math.random() < 0.22) o.beard = o.hair;
  if (Math.random() < 0.1) { o.hat = 'cap'; o.hatColor = pick(['#a02020', '#2040a0', '#222']); }
  if (Math.random() < 0.08) o.hat = 'hood';
  return o;
}

export class NPCManager {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.projectiles = [];
    this._n = new THREE.Vector3();
    this.spawnTimer = 0;
    this.projGeo = new THREE.SphereGeometry(0.35, 10, 8);
  }

  // ------------------------------------------------------------ spawning
  _makeRig(type) {
    switch (type) {
      case 'civilian': return new HumanRig(civilianLook());
      case 'police': return new HumanRig({ skin: pick(SKIN), shirt: '#1f3050', pants: '#141c2a', hair: pick(HAIR), hat: 'cap', hatColor: '#141c2a', badge: true, weapon: 'pistol', female: Math.random() < 0.3, hairStyle: 'short', sleeves: 'short' });
      case 'hunter':
      case 'captain':
        return new HumanRig({
          skin: pick(SKIN), coat: type === 'captain' ? '#3a1f1a' : pick(['#3b3428', '#2a2a24', '#3a3020']), pants: '#1f1f22', hair: pick(HAIR),
          hat: type === 'captain' ? 'fedora' : Math.random() < 0.6 ? 'fedora' : 'hood', hatColor: '#2a241c', beard: Math.random() < 0.4 ? '#2a1a10' : null,
          weapon: Math.random() < 0.75 || type === 'captain' ? 'rifle' : 'crossbow', scale: type === 'captain' ? 1.12 : 1, build: 1.1,
          mask: type === 'hunter' && Math.random() < 0.3 ? '#2a2a2a' : null,
        });
      case 'vampire': {
        const female = Math.random() < 0.4;
        return new HumanRig({ skin: '#d8d4dc', shirt: '#1a1418', pants: '#111', hair: '#0c0c0c', cape: '#5a0d16', eyes: '#ff2030', scale: rand(1, 1.08), female, hairStyle: female ? 'long' : 'short' });
      }
      case 'witch': return new HumanRig({ skin: '#c8d0b8', shirt: '#1e1426', robe: '#1e1426', hair: '#0e0a10', hairStyle: 'long', hat: 'witch', eyes: '#6aff9a', weapon: 'staff', female: true });
      case 'ghoul': return new HumanRig({ skin: '#8a9488', shirt: '#3a3530', pants: '#2a2622', hair: '#444', hairStyle: 'ragged', eyes: '#ffef6a', hunch: 0.6, scale: 0.95, sleeves: 'short', shoes: '#5a5a50' });
      case 'demon': return new HumanRig({ skin: '#7a1a14', shirt: '#6a1410', pants: '#1a0806', hair: '#1a0806', hairStyle: 'bald', horns: '#1a1210', eyes: '#ff8a2a', scale: 1.75, build: 1.45, hunch: 0.3, sleeves: 'short', shoes: '#1a0806' });
      case 'rival': return new WolfRig({ fur: pick(['#2b2b2e', '#3a3532', '#4a4440']), furDark: '#161616', belly: '#555', eyes: '#ff3a2a', scale: 0.92 });
      case 'alpha': return new WolfRig({ fur: '#cfcac0', furDark: '#7a746a', belly: '#e8e4dc', eyes: '#ff2010', scale: 1.35 });
      case 'packmate': return new WolfRig({ fur: pick(['#6b5a48', '#5a4a3a', '#7a6650']), furDark: '#3a2e24', belly: '#8a7a68', eyes: '#7fd0ff', scale: 0.9 });
      case 'deer': return new QuadRig({ kind: 'deer' });
      case 'rabbit': return new QuadRig({ kind: 'rabbit' });
    }
    return null;
  }

  spawn(type, pos, opts = {}) {
    const def = TYPES[type];
    const rig = this._makeRig(type);
    const npc = {
      id: NPC_ID++, type, def, rig,
      pos: pos.clone(), vel: new THREE.Vector3(), yaw: rand(0, Math.PI * 2),
      hp: def.hp * (opts.hpMult || 1), maxHp: def.hp * (opts.hpMult || 1),
      state: opts.state || 'idle', t: 0, target: null, goal: null,
      attackCd: rand(0.5, 2), stun: 0, fear: 0, dead: false, corpseT: 0, onGround: true,
      eventId: opts.eventId || null, persistent: !!opts.persistent,
      home: opts.home ? opts.home.clone() : pos.clone(),
      vuln: 0, lastHitBy: null, feeding: null, victimOf: null, speed: 0, cheer: 0,
      held: false, thrown: 0, chargeT: 0, windup: 0,
    };
    npc.pos.y = this.game.world.groundAt(pos.x, pos.z, pos.y + 2, 3);
    rig.root.position.copy(npc.pos);
    this.game.scene.add(rig.root);
    this.list.push(npc);
    return npc;
  }

  remove(npc) {
    this.game.scene.remove(npc.rig.root);
    const i = this.list.indexOf(npc);
    if (i >= 0) this.list.splice(i, 1);
    if (this.game.player.lockTarget === npc) this.game.player.lockTarget = null;
  }

  count(type, pred) {
    let n = 0;
    for (const o of this.list) if (o.type === type && !o.dead && (!pred || pred(o))) n++;
    return n;
  }

  // population director: keeps the world alive around the player
  _populate(dt) {
    const g = this.game;
    const p = g.player.pos;
    const w = g.world;
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = 0.5;

    for (const o of [...this.list]) {
      const d = o.pos.distanceTo(p);
      if (!o.persistent && !o.eventId && !o.held && (d > 280 || (o.dead && o.corpseT > 90))) this.remove(o);
      else if (o.dead && o.corpseT > 120) this.remove(o);
    }

    const district = districtAt(p.x, p.z);
    const night = w.isNight;
    const heat = g.rep.heat;
    const weatherMul = g.weather?.state === 'storm' || g.weather?.state === 'rain' ? 0.6 : 1;
    const civTarget = { Downtown: 38, Suburbs: 18, Lakeside: 8, Industrial: 7 }[district] || 0;
    const civWanted = Math.round(civTarget * (night ? 0.6 : 1) * (1 - heat * 0.12) * weatherMul);
    if (this.count('civilian', (o) => o.pos.distanceTo(p) < 200) < civWanted) {
      const sp = this._spawnPointNear(w.spawnPoints.sidewalks, p, 50, 170);
      if (sp) this.spawn('civilian', sp, { state: 'wander' });
    }

    // vampires stalk the city at night
    if (night && (district === 'Downtown' || district === 'Industrial' || district === 'Suburbs')) {
      const vWanted = w.isFullMoonNight ? 6 : 4;
      if (this.count('vampire', (o) => !o.eventId && o.pos.distanceTo(p) < 220) < vWanted && Math.random() < 0.12) {
        const sp = this._spawnPointNear(w.spawnPoints.rooftops.concat(w.spawnPoints.sidewalks), p, 70, 180);
        if (sp) this.spawn('vampire', sp, { state: 'hunt' });
      }
    }
    const C = LANDMARKS.cathedral;
    if (night && Math.hypot(p.x - C.x, p.z - C.z) < 160 && this.count('vampire', (o) => o.pos.distanceTo(new THREE.Vector3(C.x, 0, C.z)) < 60) < 5) {
      this.spawn('vampire', new THREE.Vector3(C.x + rand(-12, 12), 0, C.z + 26 + rand(0, 8)), { state: 'guard' });
    }
    // ghouls crawl out of Hollow Hill after dark
    const CM = LANDMARKS.cemetery;
    if (night && Math.hypot(p.x - CM.x, p.z - CM.z) < 220 && this.count('ghoul', (o) => !o.eventId) < 8 && Math.random() < 0.25) {
      const sp = pick(w.spawnPoints.graves);
      if (sp) {
        const n = this.spawn('ghoul', sp, { state: 'guard', home: new THREE.Vector3(CM.x, 0, CM.z) });
        n.vel.y = 4; // clawing up out of the earth
        g.fx.dust(sp, 0.6);
      }
    }
    // witches gather in Northwood at night
    if (night && district === 'Northwood Forest' && this.count('witch', (o) => !o.eventId) < 2 && Math.random() < 0.03) {
      const sp = this._spawnPointNear(w.spawnPoints.forest, p, 80, 180);
      if (sp) this.spawn('witch', sp, { state: 'guard' });
    }

    // law and order answer heat in the city
    const inCity = district === 'Downtown' || district === 'Suburbs' || district === 'Lakeside' || district === 'Industrial';
    const policeWanted = inCity ? Math.min(8, Math.ceil(heat) * 2) : 0;
    if (heat >= 1 && this.count('police', (o) => !o.eventId) < policeWanted && Math.random() < 0.15) {
      const car = g.props.spawnPoliceCar(p);
      if (car) {
        for (let i = 0; i < 2; i++) {
          const n = this.spawn('police', car.pos.clone().add(new THREE.Vector3(rand(-2, 2), 0, rand(-2, 2))), { state: 'pursue' });
          n.target = 'player';
        }
      }
    }
    const huntersWanted = Math.floor(heat) >= 2 ? Math.floor(heat) * 2 - 2 + (heat >= 4 ? 2 : 0) : 0;
    if (this.count('hunter', (o) => !o.eventId && !o.persistent) < huntersWanted && Math.random() < 0.3) {
      const a = rand(0, Math.PI * 2), r = rand(60, 95);
      const n = this.spawn('hunter', new THREE.Vector3(p.x + Math.cos(a) * r, 0, p.z + Math.sin(a) * r), { state: 'pursue' });
      n.target = 'player';
    }

    // the wild
    if (district === 'Northwood Forest' || district === 'Ashen Peaks') {
      const rWanted = (night ? 3 : 1) - (g.rep.packAllied ? 99 : 0);
      if (this.count('rival', (o) => !o.eventId && o.pos.distanceTo(p) < 220) < rWanted && Math.random() < 0.05) {
        const sp = this._spawnPointNear(w.spawnPoints.forest, p, 80, 200);
        if (sp) this.spawn('rival', sp, { state: 'roam' });
      }
      if (this.count('deer', (o) => o.pos.distanceTo(p) < 220) < 7 && Math.random() < 0.15) {
        const sp = this._spawnPointNear(w.spawnPoints.forest, p, 60, 180);
        if (sp) for (let i = 0; i < 3; i++) this.spawn('deer', sp.clone().add(new THREE.Vector3(rand(-6, 6), 0, rand(-6, 6))), { state: 'graze' });
      }
      if (this.count('rabbit', (o) => o.pos.distanceTo(p) < 150) < 6 && Math.random() < 0.15) {
        const sp = this._spawnPointNear(w.spawnPoints.forest, p, 30, 120);
        if (sp) this.spawn('rabbit', sp, { state: 'graze' });
      }
    }

    if (g.rep.packAllied && this.count('packmate') < 2 && !g.player.dead) {
      const a = rand(0, Math.PI * 2);
      this.spawn('packmate', new THREE.Vector3(p.x + Math.cos(a) * 40, 0, p.z + Math.sin(a) * 40), { state: 'follow', persistent: true });
    }
  }

  _spawnPointNear(points, p, minD, maxD) {
    for (let i = 0; i < 12; i++) {
      const sp = pick(points);
      if (!sp) return null;
      const d = Math.hypot(sp.x - p.x, sp.z - p.z);
      if (d > minD && d < maxD) return sp.clone().add(new THREE.Vector3(rand(-2, 2), 0, rand(-2, 2)));
    }
    return null;
  }

  // ------------------------------------------------------------ queries
  isHostileToPlayer(o) {
    const g = this.game;
    if (o.dead) return false;
    switch (o.type) {
      case 'hunter':
      case 'captain': return g.rep.huntersHostile(o);
      case 'police': return g.rep.policeHostile(o);
      case 'vampire':
      case 'witch':
      case 'ghoul':
      case 'demon': return true;
      case 'rival':
      case 'alpha': return !g.rep.packAllied;
      default: return false;
    }
  }

  // hostileOnly: enemies + civilians (for auto-aim); lock: enemies only
  nearestInCone(p, dir, range, minDot = 0.5, hostileOnly = false, lock = false) {
    let best = null, bestD = range;
    for (const o of this.list) {
      if (o.dead || o.type === 'packmate' || o.held) continue;
      const hostile = this.isHostileToPlayer(o);
      if (lock && !hostile) continue;
      if (hostileOnly && !hostile && o.type !== 'civilian' && !o.def.animal) continue;
      const dx = o.pos.x - p.x, dz = o.pos.z - p.z, dy = o.pos.y - p.y;
      const d = Math.hypot(dx, dy, dz);
      if (d > bestD || d < 0.01) continue;
      const dot = (dx * dir.x + dz * dir.z) / (Math.hypot(dx, dz) || 1);
      if (dot < minDot) continue;
      best = o;
      bestD = d;
    }
    return best;
  }

  nearestCorpse(p, range) {
    let best = null, bd = range;
    for (const o of this.list) {
      if (!o.dead || o.consumed) continue;
      const d = o.pos.distanceTo(p);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  consume(o) {
    o.consumed = true;
    o.rig.root.visible = false;
    o.corpseT = 999;
  }

  // enemies (or civilians) that can be executed right now
  nearestFinishable(p, range, form) {
    let best = null, bd = range;
    for (const o of this.list) {
      if (o.dead || o.held || o.type === 'packmate') continue;
      const frac = o.hp / o.maxHp;
      const boss = BOSSY.has(o.type);
      const weak = boss ? frac < 0.15 : frac < 0.3 || o.stun > 0.2;
      if (!weak) continue;
      if (form === 'human' && !(HUMANOID.has(o.type) && o.stun > 0.2) && !o.def.animal) continue;
      const d = o.pos.distanceTo(p);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  finish(o, player) {
    o.finished = true;
    this.damage(o, o.hp + 1, { source: player, knock: 10, from: player.pos });
  }

  grabbable(p, fwd, range) {
    let best = null, bd = range;
    for (const o of this.list) {
      if (o.dead || o.held || BOSSY.has(o.type) || o.type === 'rival' || o.type === 'packmate') continue;
      const dx = o.pos.x - p.x, dz = o.pos.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > bd) continue;
      if ((dx * fwd.x + dz * fwd.z) / (d || 1) < 0.1) continue;
      best = o;
      bd = d;
    }
    return best;
  }

  hold(o) {
    o.held = true;
    o.stun = 99;
    o.feeding = null;
    if (o.victimOf) o.victimOf = null;
    if (o.type === 'civilian') this.game.audio.scream(0);
    this.game.player._registerHit?.(1);
  }

  holdAt(o, pos, yaw) {
    o.pos.copy(pos).add(new THREE.Vector3(0, -o.def.height * 0.35, 0));
    o.rig.root.position.copy(o.pos);
    o.rig.root.rotation.set(0, yaw + Math.PI / 2, 0);
    o.rig.body.rotation.z = Math.PI / 2;
    o.rig.phase += 0.3; // struggling legs
    o.rig.animate?.(1 / 60, { speed: 6 });
  }

  release(o, vel, thrown = false) {
    o.held = false;
    o.rig.body.rotation.z = 0;
    o.vel.copy(vel);
    o.onGround = false;
    o.stun = 1.5;
    o.thrown = thrown ? 2 : 0;
    o.lastHitBy = this.game.player;
  }

  // ------------------------------------------------------------ damage
  damage(o, amount, { knock = 0, from = null, source = null, silver = false } = {}) {
    if (o.dead) return false;
    const g = this.game;
    if (o.vuln > 0) amount *= 1.3;
    if (o.type === 'demon' && o.stun <= 0) amount *= 0.75; // armoured hide
    o.hp -= amount;
    o.lastHitBy = source;
    o.hitFlash = 0.15;
    if (source === g.player) g.hud.damageNumber(o.pos.clone().add(new THREE.Vector3(0, o.def.height + 0.2, 0)), amount, g.player.frenzyT > 0);
    if (from && knock > 0) {
      const d = o.pos.clone().sub(from).setY(0).normalize();
      const resist = o.type === 'alpha' || o.type === 'demon' ? 0.2 : o.type === 'rival' ? 0.6 : 1;
      o.vel.x += d.x * knock * resist;
      o.vel.z += d.z * knock * resist;
      o.vel.y += knock * 0.35 * resist;
      o.onGround = false;
      if (knock > 12 && !BOSSY.has(o.type)) o.stun = Math.max(o.stun, 0.8);
    }
    const isBeast = o.type === 'rival' || o.type === 'alpha' || o.type === 'packmate';
    const bloodC = o.type === 'vampire' ? '#3a0006' : o.type === 'ghoul' ? '#4a5a20' : o.type === 'demon' ? '#ff6a1a' : '#8a0a0a';
    g.fx.blood(o.pos.clone().add(new THREE.Vector3(0, o.def.height * 0.6, 0)), 0.8, bloodC);
    if (Math.random() < 0.4) g.decals?.blood(o.pos, 0.6 + Math.random() * 0.6, bloodC);
    if (source === g.player && o.type !== 'civilian') {
      if (o.type === 'hunter' || o.type === 'captain') g.rep.provokeHunters();
      if (o.type === 'police') g.rep.provokePolice();
      if (isBeast && o.type !== 'packmate') o.target = 'player';
    }
    if (source === g.player && o.type === 'police' && !g.player.isWolf) g.rep.addHeat(0.5);
    if (o.type === 'civilian' || o.def.animal) {
      o.state = 'flee';
      o.fear = 10;
    }
    if (o.hp <= 0) {
      this.kill(o, source);
      return true;
    }
    return true;
  }

  kill(o, source) {
    const g = this.game;
    o.dead = true;
    o.hp = 0;
    o.corpseT = 0;
    o.held = false;
    o.rig.die();
    o.rig.root.position.copy(o.pos);
    if (o.feeding) { o.feeding.victimOf = null; o.feeding = null; }
    if (o.type === 'vampire') {
      g.fx.burst(o.pos.clone().add(new THREE.Vector3(0, 1, 0)), { count: 40, color: new THREE.Color('#2a2224'), speed: 4, size: 0.6, life: 1.4, gravity: 1.5 });
      g.audio.hiss(o.pos.distanceTo(g.player.pos));
      o.rig.root.visible = false;
      o.consumed = true;
    } else if (o.type === 'witch') {
      g.fx.burst(o.pos.clone().add(new THREE.Vector3(0, 1, 0)), { count: 50, color: new THREE.Color('#6aff9a'), speed: 6, size: 0.5, life: 1.2, gravity: 0 });
      g.audio.magic();
    } else if (o.type === 'demon') {
      g.fx.burst(o.pos.clone().add(new THREE.Vector3(0, 1.5, 0)), { count: 90, color: new THREE.Color('#ff6a1a'), speed: 10, size: 0.7, life: 1.5, gravity: 2 });
      g.fx.ring(o.pos, 12, '#ff6a1a', 0.8);
      g.camera.shake(0.5, 0.6);
      g.audio.slam();
      o.rig.root.visible = false;
      o.consumed = true;
    } else if (o.type === 'civilian') {
      g.audio.scream(o.pos.distanceTo(g.player.pos));
    }
    g.decals?.blood(o.pos, 1.4, o.type === 'ghoul' ? '#4a5a20' : '#6a0808');
    if (source === g.player || source?.type === 'packmate') {
      g.player.kills++;
      const mult = (1 + g.player.comboRank * 0.1) * (o.finished ? 1.5 : 1);
      g.player.addXP(Math.round(o.def.xp * mult));
    }
    if (g.player.lockTarget === o) g.player.lockTarget = null;
    g.rep.onKill(o, source);
    g.director.onNpcKilled(o, source);
  }

  damageInCone(origin, dir, range, minDot, dmg, knock, source) {
    const hits = [];
    for (const o of this.list) {
      if (o.dead || o.type === 'packmate' || o.held) continue;
      const dx = o.pos.x - origin.x, dz = o.pos.z - origin.z;
      const dy = o.pos.y + o.def.height * 0.5 - origin.y;
      const flat = Math.hypot(dx, dz);
      if (flat > range + o.def.radius || Math.abs(dy) > 2.5 + o.def.height * 0.3) continue;
      const dot = flat < 0.6 ? 1 : (dx * dir.x + dz * dir.z) / flat;
      if (dot < minDot) continue;
      this.damage(o, dmg, { knock, from: origin, source });
      hits.push(o);
    }
    return hits;
  }

  damageInRadius(p, r, dmg, knock, source, single = false) {
    const hits = [];
    for (const o of this.list) {
      if (o.dead || o.type === 'packmate' || o.held) continue;
      if (o.pos.distanceTo(p) > r + o.def.radius) continue;
      this.damage(o, dmg, { knock, from: p, source });
      hits.push(o);
      if (single) break;
    }
    return hits;
  }

  shockwave(p, r, dmg, knock, source) {
    for (const o of this.list) {
      if (o.dead || o.type === 'packmate' || o.held) continue;
      const d = o.pos.distanceTo(p);
      if (d > r) continue;
      const f = 1 - d / r;
      if (o.type === 'civilian' && dmg < 15) {
        o.vel.add(o.pos.clone().sub(p).setY(0).normalize().multiplyScalar(knock * f));
        o.vel.y += 4 * f;
        o.state = 'flee';
        o.fear = 10;
        continue;
      }
      this.damage(o, dmg * (0.4 + 0.6 * f), { knock: knock * f + 4, from: p, source });
    }
  }

  howl(p, r, rank) {
    const g = this.game;
    for (const o of this.list) {
      if (o.dead) continue;
      const d = o.pos.distanceTo(p);
      if (d > r) continue;
      if (o.type === 'civilian') {
        if (g.rep.morality >= 50) o.cheer = 4;
        else { o.state = 'flee'; o.fear = 12; }
      } else if (o.def.animal) {
        o.state = 'flee'; o.fear = 15;
      } else if (o.type === 'hunter' || o.type === 'captain' || o.type === 'police') {
        if (rank >= 1 || o.type === 'police') o.stun = 3;
        else o.attackCd += 1.5;
        if (rank >= 2) o.vuln = 8;
      } else if (o.type === 'vampire' || o.type === 'ghoul' || o.type === 'witch') {
        o.stun = o.type === 'ghoul' ? 2.5 : 1.2;
        if (rank >= 2) o.vuln = 8;
      } else if (o.type === 'rival') {
        if (rank >= 2) o.vuln = 8;
        o.stun = 0.6;
      }
    }
  }

  spawnProjectile({ from, dir, speed, owner, damage, radius = 0, color = '#fff', magic = false, silver = false, homing = 0, source = null }) {
    const mesh = new THREE.Mesh(this.projGeo, new THREE.MeshBasicMaterial({ color, toneMapped: false }));
    mesh.position.copy(from);
    if (magic) {
      const l = new THREE.PointLight(color, 25, 18, 1.5);
      mesh.add(l);
      mesh.scale.setScalar(owner === 'player' ? 1.4 : 0.9);
    }
    this.game.scene.add(mesh);
    this.projectiles.push({ pos: from.clone(), vel: dir.clone().normalize().multiplyScalar(speed), speed, owner, damage, radius, color, mesh, life: 4, magic, silver, homing, source });
  }

  _updateProjectiles(dt) {
    const g = this.game;
    const player = g.player;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.life -= dt;
      if (pr.homing && pr.owner === 'enemy' && !player.dead) {
        const want = player.pos.clone().add(new THREE.Vector3(0, player.height * 0.6, 0)).sub(pr.pos).normalize().multiplyScalar(pr.speed);
        pr.vel.lerp(want, Math.min(1, pr.homing * dt));
      }
      const step = pr.vel.clone().multiplyScalar(dt);
      const dist = step.length();
      const hitWall = g.world.raycast(pr.pos, step.clone().normalize(), dist + 0.01) < dist;
      pr.pos.add(step);
      pr.mesh.position.copy(pr.pos);
      if (pr.magic) g.fx.spawn(pr.pos, new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)), new THREE.Color(pr.color), 0.6, 0.4, 0);
      let explode = hitWall || pr.life <= 0;
      if (!explode && pr.owner === 'player') {
        for (const o of this.list) {
          if (o.dead || o.type === 'packmate') continue;
          if (o.pos.clone().setY(o.pos.y + o.def.height * 0.5).distanceTo(pr.pos) < o.def.radius + 0.9) { explode = true; break; }
        }
      }
      if (!explode && pr.owner === 'enemy' && !player.dead) {
        const c = player.pos.clone().add(new THREE.Vector3(0, player.height * 0.55, 0));
        if (c.distanceTo(pr.pos) < player.radius + 0.6) {
          const r = player.takeDamage(pr.damage, { source: pr.source, ranged: true, silver: pr.silver });
          if (r === 'parry' && pr.source && !pr.source.dead) {
            // batted straight back
            pr.owner = 'player';
            pr.vel.copy(pr.source.pos.clone().add(new THREE.Vector3(0, 1, 0)).sub(pr.pos).normalize().multiplyScalar(pr.speed * 1.4));
            pr.damage *= 2;
            pr.homing = 0;
            continue;
          }
          explode = true;
        }
      }
      if (explode) {
        if (pr.radius > 0) {
          g.fx.burst(pr.pos, { count: 50, color: new THREE.Color(pr.color), speed: 12, size: 0.5, life: 0.7, gravity: 0 });
          g.fx.ring(pr.pos, pr.radius * 1.5, pr.color, 0.5);
          g.camera.shake(0.25, 0.3);
          g.audio.slam();
          if (pr.owner === 'player') {
            for (const o of this.list) {
              if (o.dead || o.type === 'packmate') continue;
              const d = o.pos.distanceTo(pr.pos);
              if (d < pr.radius + o.def.radius) this.damage(o, pr.damage * (1 - (d / (pr.radius + 1)) * 0.5), { knock: 14, from: pr.pos, source: player });
            }
            g.props.shockwave(pr.pos, pr.radius + 2, 14);
          }
        } else {
          g.fx.burst(pr.pos, { count: 14, color: new THREE.Color(pr.color), speed: 5, size: 0.3, life: 0.4, gravity: 0 });
          if (pr.owner === 'player') for (const o of this.list) if (!o.dead && o.type !== 'packmate' && o.pos.distanceTo(pr.pos) < 2) this.damage(o, pr.damage, { source: player, knock: 8, from: pr.pos });
        }
        g.scene.remove(pr.mesh);
        pr.mesh.material.dispose();
        this.projectiles.splice(i, 1);
      }
    }
  }

  // melee hit on the player that respects block/parry
  _strike(o, dmg, opts = {}) {
    const g = this.game;
    const r = g.player.takeDamage(dmg, { source: o, melee: true, ...opts });
    if (r === 'parry') {
      o.stun = 1.6;
      o.vuln = 3;
      const d = o.pos.clone().sub(g.player.pos).setY(0).normalize();
      o.vel.add(d.multiplyScalar(BOSSY.has(o.type) ? 3 : 9));
    }
    return r;
  }

  // ------------------------------------------------------------ AI
  update(dt) {
    const g = this.game;
    this._populate(dt);
    this._updateProjectiles(dt);
    const pp = g.player.pos;
    for (const o of this.list) {
      const dist = o.pos.distanceTo(pp);
      o.distToPlayer = dist;
      if (o.held) continue;
      if (o.dead) {
        o.corpseT += dt;
        if (!o.onGround) {
          o.vel.y -= 25 * dt;
          o.pos.addScaledVector(o.vel, dt);
          const gy = g.world.groundAt(o.pos.x, o.pos.z, o.pos.y + 0.5, 1);
          if (o.pos.y <= gy) { o.pos.y = gy; o.onGround = true; }
          o.rig.root.position.copy(o.pos);
        }
        continue;
      }
      if (dist > 340 && !o.persistent) continue;
      o.t += dt;
      o.attackCd -= dt;
      o.stun -= dt;
      o.vuln -= dt;
      o.hitFlash = (o.hitFlash || 0) - dt;
      o.cheer -= dt;
      let wish = null, wantSpeed = 0;
      if (o.stun <= 0 && o.thrown <= 0) {
        const r = this['_ai_' + o.type](o, dt, dist);
        if (r) { wish = r.dir; wantSpeed = r.speed; }
      }
      this._physics(o, dt, wish, wantSpeed);
    }
  }

  _physics(o, dt, wish, wantSpeed) {
    const g = this.game;
    const w = g.world;
    if (wish && wantSpeed > 0) {
      wish.y = 0;
      wish.normalize();
      const k = 1 - Math.exp(-(o.onGround ? 8 : 1) * dt);
      o.vel.x += (wish.x * wantSpeed - o.vel.x) * k;
      o.vel.z += (wish.z * wantSpeed - o.vel.z) * k;
      o.yaw = dampAngle(o.yaw, Math.atan2(wish.x, wish.z), 10, dt);
    } else if (o.thrown <= 0) {
      const k = 1 - Math.exp(-(o.onGround ? 6 : 0.5) * dt);
      o.vel.x -= o.vel.x * k;
      o.vel.z -= o.vel.z * k;
    }
    if (o.faceYaw !== undefined && o.faceYaw !== null) {
      o.yaw = dampAngle(o.yaw, o.faceYaw, 12, dt);
      o.faceYaw = null;
    }
    const floats = o.type === 'witch';
    o.vel.y -= (floats ? 6 : 25) * dt;
    const preSpeed = o.vel.length();
    o.pos.addScaledVector(o.vel, dt);
    this._n.set(0, 0, 0);
    this._n.top = 0;
    const big = o.def.radius > 0.6;
    if (w.collide(o.pos, o.def.radius, o.def.height, big ? 0.9 : 0.5, this._n)) {
      if (o.thrown > 0 && preSpeed > 10) {
        // splat against the wall
        this.damage(o, 20 + preSpeed * 1.5, { source: g.player });
        g.camera.shake(0.2, 0.2);
        g.audio.hit();
        g.decals?.blood(o.pos.clone().addScaledVector(this._n, -0.3), 1.2);
        o.vel.multiplyScalar(0.2);
        o.thrown = 0;
      } else if (o.chargeT > 0) {
        // a charging demon that hits a wall stuns itself: punish it!
        o.chargeT = 0;
        o.stun = 2.5;
        o.vuln = 3;
        g.camera.shake(0.3, 0.3);
        g.audio.slam();
        g.fx.dust(o.pos, 1);
      } else if (big && o.onGround && this._n.top - o.pos.y < 6 && wantSpeed > 4) {
        o.vel.y = 12;
        o.onGround = false;
      }
    }
    // thrown bodies bowl over whoever they hit
    if (o.thrown > 0) {
      o.thrown -= dt;
      for (const x of this.list) {
        if (x === o || x.dead || x.held || x.type === 'packmate') continue;
        if (x.pos.distanceTo(o.pos) < x.def.radius + o.def.radius + 0.4) {
          this.damage(x, 30, { source: g.player, knock: 14, from: o.pos });
          this.damage(o, 15, { source: g.player });
          o.thrown = 0;
          g.audio.hit();
          break;
        }
      }
      g.props.impactAt(o.pos, preSpeed, 1);
    }
    const gy = w.groundAt(o.pos.x, o.pos.z, o.pos.y + 0.2, big ? 0.9 : 0.6);
    const hover = floats ? 1.2 + Math.sin(o.t * 1.5) * 0.3 : 0;
    if (o.pos.y <= gy + hover) {
      if (o.thrown > 0 && preSpeed > 12) {
        this.damage(o, preSpeed, { source: g.player });
        o.thrown = 0;
      }
      if (floats) {
        o.pos.y = Math.max(o.pos.y, gy + hover * 0.98);
        o.vel.y = Math.max(o.vel.y, (gy + hover - o.pos.y) * 4);
      } else {
        o.pos.y = gy;
        if (o.vel.y < 0) o.vel.y = 0;
      }
      o.onGround = true;
    } else if (o.pos.y > gy + 0.3 + hover) {
      o.onGround = false;
    } else if (!floats) {
      o.pos.y = gy;
    }
    o.speed = Math.hypot(o.vel.x, o.vel.z);
    o.rig.root.position.copy(o.pos);
    o.rig.root.rotation.y = o.yaw;
    if (o.rig instanceof WolfRig) {
      o.rig.animate(dt, { speed: o.speed, onGround: o.onGround, quad: o.speed > 9, vy: o.vel.y });
    } else if (o.rig instanceof QuadRig) {
      o.rig.animate(dt, { speed: o.speed, onGround: o.onGround });
    } else {
      o.rig.animate(dt, { speed: o.speed, onGround: o.onGround || floats, aiming: o.aiming, cower: o.state === 'cower', quad: o.type === 'ghoul' && o.speed > 6 });
      o.aiming = false;
    }
  }

  _canSee(o, targetPos, maxDist) {
    const eye = o.pos.clone().add(new THREE.Vector3(0, o.def.height * 0.9, 0));
    const to = targetPos.clone().sub(eye);
    const d = to.length();
    if (d > maxDist) return false;
    return this.game.world.raycast(eye, to.normalize(), d) >= d - 0.5;
  }

  _nearest(o, pred, maxDist) {
    let best = null, bd = maxDist;
    for (const x of this.list) {
      if (x === o || x.dead || x.held || !pred(x)) continue;
      const d = x.pos.distanceTo(o.pos);
      if (d < bd) { bd = d; best = x; }
    }
    return best;
  }

  _wander(o, speed, dt = 1 / 60, radius = 35) {
    if (!o.goal || o.pos.distanceTo(o.goal) < 2 || o.t > 25) {
      o.t = 0;
      const a = rand(0, Math.PI * 2), r = rand(10, radius);
      o.goal = new THREE.Vector3(o.home.x + Math.cos(a) * r, 0, o.home.z + Math.sin(a) * r);
      o.pauseT = rand(0, 4);
    }
    if (o.pauseT > 0) { o.pauseT -= dt; return null; }
    return { dir: o.goal.clone().sub(o.pos), speed };
  }

  // --- civilians: wander, notice the beast, panic, report it
  _ai_civilian(o, dt, dist) {
    const g = this.game;
    const player = g.player;
    if (o.victimOf) {
      o.state = 'cower';
      return null;
    }
    o.losT = (o.losT || 0) - dt;
    if (o.losT <= 0) {
      o.losT = 0.4;
      o.seenRecently = player.isWolf && !player.dead && dist < 35 && this._canSee(o, player.eye, 35);
    }
    if (o.seenRecently && player.isWolf) {
      g.rep.witnessed(dt, o);
      if (g.rep.morality >= 50 && o.state !== 'flee') {
        o.cheer = 1;
        o.faceYaw = Math.atan2(player.pos.x - o.pos.x, player.pos.z - o.pos.z);
        return null;
      }
      if (o.state !== 'flee') {
        o.state = 'flee';
        o.fear = 8;
        if (Math.random() < 0.5) g.audio.scream(dist);
      }
    }
    const threat = this._nearest(o, (x) => (x.type === 'vampire' && (x.state === 'feed' || x.state === 'attack')) || x.type === 'ghoul' || x.type === 'demon', 18);
    if (threat) { o.state = 'flee'; o.fear = 6; o.threat = threat.pos.clone(); }
    if (o.state === 'flee') {
      o.fear -= dt;
      if (o.fear <= 0) { o.state = 'wander'; o.home.copy(o.pos); }
      const from = o.threat && !player.isWolf ? o.threat : player.pos;
      const away = o.pos.clone().sub(from).setY(0);
      if (away.lengthSq() < 0.01) away.set(1, 0, 0);
      away.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.sin(o.t * 3 + o.id) * 0.5);
      return { dir: away, speed: o.def.run };
    }
    if (o.state === 'cower') return null;
    return this._wander(o, o.def.speed, dt);
  }

  // --- gunmen (hunters, captains, police): keep range, strafe, fire
  _ai_hunter(o, dt, dist) {
    const g = this.game;
    const player = g.player;
    const police = o.type === 'police';
    let target = null, tpos = null;
    if (this.isHostileToPlayer(o) && !player.dead && dist < 120) {
      target = 'player';
      tpos = player.pos;
    } else {
      const m = this._nearest(o, (x) => x.type === 'vampire' || x.type === 'ghoul' || x.type === 'demon' || (!police && (x.type === 'rival' || x.type === 'packmate' || x.type === 'witch')), 60);
      if (m) { target = m; tpos = m.pos; }
    }
    if (!target) {
      if (o.state === 'pursue' && dist < 300 && (police ? g.rep.heat >= 1 : true)) return { dir: player.pos.clone().sub(o.pos), speed: o.def.speed };
      return this._wander(o, o.def.speed, dt);
    }
    const to = tpos.clone().sub(o.pos);
    const d = to.length();
    const ideal = o.type === 'captain' ? 12 : police ? 14 : 18;
    let dir;
    if (d > ideal + 8) dir = to.clone();
    else if (d < ideal - 8) dir = to.clone().negate();
    else dir = new THREE.Vector3(-to.z, 0, to.x).multiplyScalar(Math.sin(o.t * 0.7 + o.id) > 0 ? 1 : -1);
    const speed = d > ideal + 8 ? o.def.run : o.def.speed * 1.2;
    o.faceYaw = Math.atan2(to.x, to.z);
    const range = police ? 45 : 70;
    o.aiming = d < range;
    if (o.attackCd <= 0 && d < range) {
      const targetHeight = target === 'player' ? player.height * 0.6 : target.def.height * 0.6;
      const aimPos = tpos.clone().add(new THREE.Vector3(0, targetHeight, 0));
      if (this._canSee(o, aimPos, range + 5)) {
        o.attackCd = o.type === 'captain' ? rand(0.8, 1.2) : police ? rand(0.9, 1.6) : rand(1.4, 2.4);
        const muzzle = o.pos.clone().add(new THREE.Vector3(0, 1.45, 0)).addScaledVector(to.clone().normalize(), 0.9);
        const tSpeed = target === 'player' ? player.speed : target.speed;
        // accuracy falls off with distance and target speed: keep moving!
        const hitChance = clamp((police ? 0.75 : 0.92) - d / 110 - tSpeed / 38 - (player.climbing || player.wallRunning ? 0.2 : 0), 0.06, 0.9);
        const hit = Math.random() < hitChance;
        const end = aimPos.clone();
        if (!hit) end.add(new THREE.Vector3(rand(-3, 3), rand(-1, 2), rand(-3, 3)));
        g.fx.tracer(muzzle, end, police ? '#ffe9b0' : '#d8e4ff');
        g.fx.sparks(muzzle);
        g.audio.gunshot(dist, police);
        if (hit) {
          const dmg = o.type === 'captain' ? 22 : police ? 7 : 13;
          if (target === 'player') player.takeDamage(dmg, { silver: !police, source: o, ranged: true });
          else this.damage(target, dmg * 1.5, { source: o });
        } else {
          g.props.impactAt(end, 30, 0.3);
        }
        for (const c of this.list) if (c.type === 'civilian' && !c.dead && c.pos.distanceTo(o.pos) < 30) { c.state = 'flee'; c.fear = 6; c.threat = o.pos.clone(); }
      }
    }
    return { dir, speed };
  }

  _ai_captain(o, dt, dist) {
    return this._ai_hunter(o, dt, dist);
  }

  _ai_police(o, dt, dist) {
    return this._ai_hunter(o, dt, dist);
  }

  // --- vampires: prey on civilians, lunge at the player
  _ai_vampire(o, dt, dist) {
    const g = this.game;
    const player = g.player;
    if (!g.world.isNight && !o.eventId) {
      if (Math.random() < dt * 0.5) this.kill(o, null);
    }
    if (o.state === 'guard' && dist > 40) return this._wander(o, o.def.speed, dt);
    if (o.feeding) {
      const v = o.feeding;
      if (v.dead || v.held) { o.feeding = null; o.state = 'hunt'; return null; }
      o.faceYaw = Math.atan2(v.pos.x - o.pos.x, v.pos.z - o.pos.z);
      o.feedT += dt;
      if (o.feedT > 5.5) {
        this.kill(v, o);
        o.feeding = null;
        o.state = 'hunt';
        o.hp = Math.min(o.maxHp, o.hp + 40);
      }
      if (dist < 14 && !player.dead) { v.victimOf = null; o.feeding = null; o.state = 'attack'; }
      return null;
    }
    const engage = !player.dead && (dist < 28 || o.state === 'attack' || o.lastHitBy === player);
    if (engage) {
      o.state = 'attack';
      const to = player.pos.clone().sub(o.pos);
      const d = to.length();
      if (d < 2.2 + player.radius && o.attackCd <= 0) {
        o.attackCd = rand(0.9, 1.4);
        o.rig.playAttack('claw', Math.random() < 0.5 ? 1 : -1);
        this._strike(o, 14);
        g.audio.hiss(dist);
      } else if (d < 12 && d > 5 && o.onGround && o.attackCd <= 0 && Math.random() < dt * 2) {
        to.normalize();
        o.vel.set(to.x * 22, 6, to.z * 22);
        o.onGround = false;
        g.fx.burst(o.pos.clone().add(new THREE.Vector3(0, 1, 0)), { count: 10, color: new THREE.Color('#300'), speed: 2, size: 0.5, life: 0.5, gravity: 0 });
      }
      const side = new THREE.Vector3(-to.z, 0, to.x).normalize().multiplyScalar(Math.sin(o.t + o.id) * 0.8);
      return { dir: to.normalize().add(side), speed: d < 3 ? 2 : o.def.run };
    }
    const prey = this._nearest(o, (x) => x.type === 'civilian' && !x.victimOf, 45);
    if (prey) {
      const to = prey.pos.clone().sub(o.pos);
      if (to.length() < 1.4) {
        o.feeding = prey;
        o.feedT = 0;
        prey.victimOf = o;
        o.state = 'feed';
        g.audio.scream(dist);
        return null;
      }
      return { dir: to, speed: o.def.run * 0.8 };
    }
    return this._wander(o, o.def.speed, dt);
  }

  // --- witches: hover, hurl homing hexes, blink away when cornered
  _ai_witch(o, dt, dist) {
    const g = this.game;
    const player = g.player;
    if (player.dead || dist > 60) return this._wander(o, o.def.speed, dt, 20);
    const to = player.pos.clone().sub(o.pos);
    o.faceYaw = Math.atan2(to.x, to.z);
    if (dist < 6 && (o.blinkCd || 0) <= 0) {
      // blink away in a burst of green smoke
      o.blinkCd = 5;
      g.fx.burst(o.pos.clone().add(new THREE.Vector3(0, 1, 0)), { count: 30, color: new THREE.Color('#2a6a3a'), speed: 4, size: 0.9, life: 0.8, gravity: 1 });
      const a = rand(0, Math.PI * 2), r = rand(14, 20);
      o.pos.set(player.pos.x + Math.cos(a) * r, 0, player.pos.z + Math.sin(a) * r);
      o.pos.y = g.world.groundAt(o.pos.x, o.pos.z, 500, 1000) + 1.2;
      g.audio.magic();
      return null;
    }
    o.blinkCd = (o.blinkCd || 0) - dt;
    if (o.attackCd <= 0 && dist < 45 && this._canSee(o, player.eye, 50)) {
      o.attackCd = rand(2, 3);
      o.rig.playAttack('cast', 1);
      const from = o.pos.clone().add(new THREE.Vector3(0, 2.2, 0));
      this.spawnProjectile({ from, dir: player.eye.sub(from), speed: 20, owner: 'enemy', damage: 16, color: '#6aff9a', magic: true, homing: 1.4, source: o });
      g.audio.cast();
    }
    const ideal = 18;
    const dir = dist > ideal + 6 ? to : dist < ideal - 6 ? to.clone().negate() : new THREE.Vector3(-to.z, 0, to.x).multiplyScalar(Math.sin(o.t * 0.5 + o.id) > 0 ? 1 : -1);
    return { dir, speed: o.def.run * 0.7 };
  }

  // --- ghouls: swarm, scuttle, bite anything warm
  _ai_ghoul(o, dt, dist) {
    const g = this.game;
    const player = g.player;
    let target = null;
    if (!player.dead && dist < 40) target = player;
    else target = this._nearest(o, (x) => x.type === 'civilian' || x.def.animal, 30);
    if (!target) return this._wander(o, o.def.speed, dt, 25);
    const to = target.pos.clone().sub(o.pos);
    const d = to.length();
    if (d < 1.6 + (target.radius || target.def?.radius || 0.4) && o.attackCd <= 0) {
      o.attackCd = rand(0.6, 1);
      o.rig.playAttack('claw', Math.random() < 0.5 ? 1 : -1);
      if (target === player) this._strike(o, 8);
      else this.damage(target, 12, { source: o });
      g.audio.ghoul(dist);
    } else if (d < 9 && d > 3 && o.onGround && Math.random() < dt * 1.5) {
      to.normalize();
      o.vel.set(to.x * 14, 7, to.z * 14);
      o.onGround = false;
    }
    // pack flanking: spread around the target
    const side = new THREE.Vector3(-to.z, 0, to.x).normalize().multiplyScalar(((o.id % 3) - 1) * 0.7);
    return { dir: to.clone().normalize().add(side), speed: d < 1.5 ? 0 : o.def.run };
  }

  // --- demon brute: charges, stomps fire, shrugs off blows
  _ai_demon(o, dt, dist) {
    const g = this.game;
    const player = g.player;
    if (player.dead) return this._wander(o, o.def.speed, dt);
    const to = player.pos.clone().sub(o.pos);
    const d = to.length();
    if (o.chargeT > 0) {
      o.chargeT -= dt;
      const dir = o.chargeDir;
      if (d < 2.5 && !o.chargeHit) {
        o.chargeHit = true;
        const r = this._strike(o, 30);
        if (r !== 'parry' && r !== 'dodge') {
          player.vel.add(dir.clone().multiplyScalar(22)).setY(10);
          player.onGround = false;
        }
      }
      g.props.impactAt(o.pos, 26, 2);
      if (Math.random() < 0.6) g.fx.spawn(o.pos.clone().add(new THREE.Vector3(0, 0.3, 0)), new THREE.Vector3(rand(-2, 2), 2, rand(-2, 2)), new THREE.Color('#ff6a1a'), 0.6, 0.5, -2);
      return { dir: dir.clone(), speed: 26 };
    }
    if (o.windup > 0) {
      o.windup -= dt;
      o.faceYaw = Math.atan2(to.x, to.z);
      if (o.windup <= 0) {
        if (o.windKind === 'charge') {
          o.chargeT = 1.2;
          o.chargeHit = false;
          o.chargeDir = to.clone().setY(0).normalize();
          g.audio.roar();
        } else {
          // fire stomp
          g.fx.ring(o.pos, 7, '#ff6a1a', 0.6);
          g.fx.burst(o.pos.clone().add(new THREE.Vector3(0, 0.5, 0)), { count: 60, color: new THREE.Color('#ff7a2a'), speed: 9, size: 0.6, life: 0.6, gravity: 0 });
          g.camera.shake(0.4, 0.4);
          g.audio.slam();
          if (d < 7 && player.onGround) this._strike(o, 22);
          g.props.shockwave(o.pos, 8, 14);
          g.decals?.crater(o.pos, 3);
        }
      }
      return null;
    }
    if (o.attackCd <= 0) {
      if (d < 6) {
        o.windup = 0.6;
        o.windKind = 'stomp';
        o.attackCd = 2.5;
        o.rig.playAttack('heavy', 1);
        g.fx.ring(o.pos, 7, '#ff3a1a', 0.6); // telegraph
      } else if (d < 30) {
        o.windup = 0.7;
        o.windKind = 'charge';
        o.attackCd = 3.5;
        g.audio.snarl();
      }
    }
    return { dir: to, speed: d < 3 ? 0 : o.def.speed };
  }

  // --- rival werewolves: territorial, fast, leap at you
  _ai_rival(o, dt, dist) {
    const g = this.game;
    const player = g.player;
    if (g.rep.packAllied && o.type === 'rival') {
      o.state = 'roam';
      return this._wander(o, o.def.speed, dt);
    }
    const aggro = o.type === 'alpha' ? 45 : 38;
    if (!player.dead && (dist < aggro || o.target === 'player')) {
      o.target = 'player';
      const to = player.pos.clone().sub(o.pos);
      const d = to.length();
      const reach = o.def.radius + player.radius + (o.type === 'alpha' ? 1.6 : 1.1);
      if (d < reach && o.attackCd <= 0) {
        o.attackCd = o.type === 'alpha' ? rand(0.7, 1.1) : rand(0.8, 1.3);
        o.rig.playAttack(Math.random() < 0.3 ? 'heavy' : 'light', Math.random() < 0.5 ? 1 : -1);
        setTimeout(() => {
          if (o.dead || g.player.dead || o.stun > 0) return;
          if (o.pos.distanceTo(g.player.pos) < reach + 1) {
            this._strike(o, o.type === 'alpha' ? 30 : 16);
            g.audio.claw(true);
          }
        }, 180);
      } else if (d > 7 && d < 20 && o.onGround && Math.random() < dt * 1.2) {
        to.normalize();
        o.vel.set(to.x * 20, 9, to.z * 20);
        o.onGround = false;
        o.rig.playAttack('pounce');
      }
      if (o.type === 'alpha' && o.attackCd <= 0 && d < 9 && Math.random() < dt * 0.4) {
        o.attackCd = 2;
        g.audio.roar();
        g.fx.ring(o.pos, 12, '#ff5040', 0.6);
        g.camera.shake(0.4, 0.6);
        if (d < 10 && !player.blocking) {
          g.player.takeDamage(20, { source: o });
          g.player.vel.add(to.clone().normalize().multiplyScalar(18)).setY(8);
          g.player.onGround = false;
        }
      }
      return { dir: to, speed: d < reach * 0.8 ? 0 : o.def.run };
    }
    if (o.state === 'guard' && o.pos.distanceTo(o.home) > 15) return { dir: o.home.clone().sub(o.pos), speed: o.def.speed };
    return this._wander(o, o.def.speed, dt);
  }

  _ai_alpha(o, dt, dist) {
    return this._ai_rival(o, dt, dist);
  }

  // --- packmates: follow the player and tear into whatever they fight
  _ai_packmate(o, dt, dist) {
    const player = this.game.player;
    const enemy = this._nearest(o, (x) => this.isHostileToPlayer(x) && x.distToPlayer < 40, 40);
    if (enemy) {
      const to = enemy.pos.clone().sub(o.pos);
      const d = to.length();
      if (d < 2.4 && o.attackCd <= 0) {
        o.attackCd = rand(0.7, 1.1);
        o.rig.playAttack('light', 1);
        this.damage(enemy, 22, { knock: 6, from: o.pos, source: o });
      }
      return { dir: to, speed: d < 2 ? 0 : o.def.run * 0.7 };
    }
    if (dist > 220) {
      const a = rand(0, Math.PI * 2);
      o.pos.set(player.pos.x + Math.cos(a) * 30, player.pos.y + 2, player.pos.z + Math.sin(a) * 30);
    }
    if (dist > 7) {
      const side = (o.id % 2 ? 1 : -1) * 4;
      const goal = player.pos.clone().add(new THREE.Vector3(Math.cos(player.yaw) * side, 0, -Math.sin(player.yaw) * side));
      return { dir: goal.sub(o.pos), speed: clamp(dist * 1.2, 6, Math.max(o.def.run, player.speed * 1.1)) };
    }
    return null;
  }

  // --- wildlife: graze, startle, bolt
  _ai_deer(o, dt, dist) {
    const player = this.game.player;
    const startle = player.isWolf ? 26 : 10;
    if (dist < startle || o.state === 'flee') {
      if (o.state !== 'flee') { o.state = 'flee'; o.fear = 6; }
      o.fear -= dt;
      if (o.fear <= 0 && dist > startle) { o.state = 'graze'; o.home.copy(o.pos); }
      const away = o.pos.clone().sub(player.pos).setY(0).normalize();
      away.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.sin(o.t * 2 + o.id) * 0.6);
      if (o.onGround && Math.random() < dt * 1.5) o.vel.y = o.type === 'deer' ? 5 : 3; // bounding
      return { dir: away, speed: o.def.run };
    }
    return this._wander(o, o.def.speed, dt, 15);
  }

  _ai_rabbit(o, dt, dist) {
    return this._ai_deer(o, dt, dist);
  }
}
