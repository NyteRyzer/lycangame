// Everyone else in Greyhaven: civilians, monster hunters, vampires, rival
// werewolves (and later, packmates). Spawning, AI, combat and projectiles.
import * as THREE from 'three';
import { HumanRig, WolfRig } from './characters.js';
import { LANDMARKS, districtAt, terrainHeight } from './world.js';
import { clamp, damp, dampAngle, pick, rand } from './util.js';

const SKIN = ['#f1c9a5', '#d9a77f', '#b98a6a', '#8d5a3c', '#5e3a26', '#e8b896'];
const SHIRTS = ['#7a3b3b', '#3b5a7a', '#5a7a3b', '#7a6a3b', '#444', '#a0a0a0', '#6a3b7a', '#2f4f4f', '#b07a3a', '#d0c8b8'];
const PANTS = ['#22252e', '#3a3a44', '#4a3a2a', '#1f2a3a', '#55504a'];
const HAIR = ['#1b130e', '#3a2a1a', '#6b4a2a', '#b08a50', '#888', '#111'];

export const TYPES = {
  civilian: { hp: 30, speed: 2.2, run: 6.5, radius: 0.35, height: 1.8, xp: 5 },
  hunter: { hp: 75, speed: 3, run: 6.8, radius: 0.4, height: 1.8, xp: 30 },
  captain: { hp: 220, speed: 3, run: 6.5, radius: 0.45, height: 1.9, xp: 120 },
  vampire: { hp: 95, speed: 4, run: 10.5, radius: 0.4, height: 1.8, xp: 40 },
  rival: { hp: 170, speed: 5, run: 15, radius: 0.8, height: 2.6, xp: 55 },
  alpha: { hp: 750, speed: 5, run: 17, radius: 1.1, height: 3.4, xp: 400 },
  packmate: { hp: 200, speed: 5, run: 24, radius: 0.8, height: 2.6, xp: 0 },
};

let NPC_ID = 1;

export class NPCManager {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.projectiles = [];
    this._v = new THREE.Vector3();
    this._n = new THREE.Vector3();
    this.spawnTimer = 0;
    this.projGeo = new THREE.SphereGeometry(0.35, 10, 8);
  }

  // ------------------------------------------------------------ spawning
  spawn(type, pos, opts = {}) {
    const def = TYPES[type];
    let rig;
    if (type === 'civilian') {
      rig = new HumanRig({ skin: pick(SKIN), shirt: pick(SHIRTS), pants: pick(PANTS), hair: pick(HAIR), scale: rand(0.92, 1.06) });
    } else if (type === 'hunter' || type === 'captain') {
      rig = new HumanRig({
        skin: pick(SKIN), coat: type === 'captain' ? '#3a1f1a' : '#3b3428', pants: '#1f1f22', hair: pick(HAIR),
        hat: type === 'captain' ? '#161616' : '#2a241c', weapon: Math.random() < 0.75 || type === 'captain' ? 'rifle' : 'crossbow',
        scale: type === 'captain' ? 1.12 : 1,
      });
    } else if (type === 'vampire') {
      rig = new HumanRig({ skin: '#d8d4dc', shirt: '#1a1418', pants: '#111', hair: '#0c0c0c', cape: '#5a0d16', eyes: '#ff2030', scale: rand(1, 1.08) });
    } else if (type === 'rival') {
      rig = new WolfRig({ fur: pick(['#2b2b2e', '#3a3532', '#4a4440']), furDark: '#161616', belly: '#555', eyes: '#ff3a2a', scale: 0.92 });
    } else if (type === 'alpha') {
      rig = new WolfRig({ fur: '#cfcac0', furDark: '#7a746a', belly: '#e8e4dc', eyes: '#ff2010', scale: 1.35 });
    } else if (type === 'packmate') {
      rig = new WolfRig({ fur: pick(['#6b5a48', '#5a4a3a', '#7a6650']), furDark: '#3a2e24', belly: '#8a7a68', eyes: '#7fd0ff', scale: 0.9 });
    }
    const npc = {
      id: NPC_ID++,
      type,
      def,
      rig,
      pos: pos.clone(),
      vel: new THREE.Vector3(),
      yaw: rand(0, Math.PI * 2),
      hp: def.hp * (opts.hpMult || 1),
      maxHp: def.hp * (opts.hpMult || 1),
      state: opts.state || 'idle',
      t: 0,
      target: null,
      goal: null,
      attackCd: rand(0.5, 2),
      stun: 0,
      fear: 0,
      seenWolf: 0,
      dead: false,
      corpseT: 0,
      onGround: true,
      eventId: opts.eventId || null,
      persistent: !!opts.persistent,
      home: opts.home ? opts.home.clone() : pos.clone(),
      vuln: 0,
      lastHitBy: null,
      feeding: null,
      victimOf: null,
      speed: 0,
      cheer: 0,
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

    // despawn far ambient NPCs
    for (const o of [...this.list]) {
      const d = o.pos.distanceTo(p);
      if (!o.persistent && !o.eventId && (d > 260 || (o.dead && o.corpseT > 90))) this.remove(o);
      else if (o.dead && o.corpseT > 120) this.remove(o);
    }

    const district = districtAt(p.x, p.z);
    const night = w.isNight;
    const heat = g.rep.heat;
    const civTarget = { Downtown: 34, Suburbs: 18, Lakeside: 8, Industrial: 7 }[district] || 0;
    const civWanted = Math.round(civTarget * (night ? 0.6 : 1) * (1 - heat * 0.12));
    const civNear = this.count('civilian', (o) => o.pos.distanceTo(p) < 200);
    if (civNear < civWanted) {
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
    // the cathedral is always infested after dark
    const C = LANDMARKS.cathedral;
    if (night && Math.hypot(p.x - C.x, p.z - C.z) < 160 && this.count('vampire', (o) => o.pos.distanceTo(new THREE.Vector3(C.x, 0, C.z)) < 60) < 5) {
      this.spawn('vampire', new THREE.Vector3(C.x + rand(-12, 12), 0, C.z + 26 + rand(0, 8)), { state: 'guard' });
    }

    // hunters answer heat
    const huntersWanted = Math.floor(heat) * 2 + (heat >= 4 ? 2 : 0);
    if (this.count('hunter', (o) => !o.eventId && !o.persistent) < huntersWanted && Math.random() < 0.3) {
      const a = rand(0, Math.PI * 2), r = rand(60, 95);
      const sp = new THREE.Vector3(p.x + Math.cos(a) * r, 0, p.z + Math.sin(a) * r);
      const n = this.spawn('hunter', sp, { state: 'pursue' });
      n.target = 'player';
    }

    // rival werewolves roam Northwood
    if (district === 'Northwood Forest' || district === 'Ashen Peaks') {
      const rWanted = (night ? 3 : 1) - (g.rep.packAllied ? 99 : 0);
      if (this.count('rival', (o) => !o.eventId && o.pos.distanceTo(p) < 220) < rWanted && Math.random() < 0.05) {
        const sp = this._spawnPointNear(w.spawnPoints.forest, p, 80, 200);
        if (sp) this.spawn('rival', sp, { state: 'roam' });
      }
    }

    // packmates follow an Alpha
    if (g.rep.packAllied && this.count('packmate') < 2 && !g.player.dead) {
      const a = rand(0, Math.PI * 2);
      const sp = new THREE.Vector3(p.x + Math.cos(a) * 40, 0, p.z + Math.sin(a) * 40);
      this.spawn('packmate', sp, { state: 'follow', persistent: true });
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
      case 'civilian': return false;
      case 'packmate': return false;
      case 'hunter':
      case 'captain': return g.rep.huntersHostile(o);
      case 'vampire': return true;
      case 'rival':
      case 'alpha': return !g.rep.packAllied;
      default: return false;
    }
  }

  nearestInCone(p, dir, range, minDot = 0.5, hostileOnly = false) {
    let best = null, bestD = range;
    for (const o of this.list) {
      if (o.dead || o.type === 'packmate') continue;
      if (hostileOnly && !this.isHostileToPlayer(o) && o.type !== 'civilian') continue;
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

  // ------------------------------------------------------------ damage
  damage(o, amount, { knock = 0, from = null, source = null, silver = false } = {}) {
    if (o.dead) return false;
    const g = this.game;
    if (o.vuln > 0) amount *= 1.3;
    o.hp -= amount;
    o.lastHitBy = source;
    o.hitFlash = 0.15;
    if (from && knock > 0) {
      const d = o.pos.clone().sub(from).setY(0).normalize();
      const resist = o.type === 'alpha' ? 0.25 : o.type === 'rival' ? 0.6 : 1;
      o.vel.x += d.x * knock * resist;
      o.vel.z += d.z * knock * resist;
      o.vel.y += knock * 0.35 * resist;
      o.onGround = false;
      if (knock > 12 && o.type !== 'alpha') o.stun = Math.max(o.stun, 0.8);
    }
    const isBeast = o.type === 'rival' || o.type === 'alpha' || o.type === 'packmate';
    g.fx.blood(o.pos.clone().add(new THREE.Vector3(0, o.def.height * 0.6, 0)), 0.8, o.type === 'vampire' ? '#3a0006' : '#8a0a0a');
    if (source === g.player && o.type !== 'civilian') {
      // anyone you strike becomes your enemy
      if (o.type === 'hunter' || o.type === 'captain') g.rep.provokeHunters();
      if (isBeast && o.type !== 'packmate') o.target = 'player';
    }
    if (o.type === 'civilian') {
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
    o.rig.die();
    o.rig.root.position.copy(o.pos);
    if (o.feeding) { o.feeding.victimOf = null; o.feeding = null; }
    if (o.type === 'vampire') {
      // vampires burst into ash
      g.fx.burst(o.pos.clone().add(new THREE.Vector3(0, 1, 0)), { count: 40, color: new THREE.Color('#2a2224'), speed: 4, size: 0.6, life: 1.4, gravity: 1.5 });
      g.audio.hiss(o.pos.distanceTo(g.player.pos));
      o.rig.root.visible = false;
      o.consumed = true;
    } else if (o.type === 'civilian') {
      g.audio.scream(o.pos.distanceTo(g.player.pos));
    }
    if (source === g.player || source?.type === 'packmate') {
      g.player.kills++;
      g.player.addXP(o.def.xp);
    }
    g.rep.onKill(o, source);
    g.director.onNpcKilled(o, source);
  }

  damageInCone(origin, dir, range, minDot, dmg, knock, source) {
    const hits = [];
    for (const o of this.list) {
      if (o.dead || o.type === 'packmate') continue;
      const dx = o.pos.x - origin.x, dz = o.pos.z - origin.z;
      const dy = o.pos.y + o.def.height * 0.5 - origin.y;
      const flat = Math.hypot(dx, dz);
      if (flat > range + o.def.radius || Math.abs(dy) > 2.5) continue;
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
      if (o.dead || o.type === 'packmate') continue;
      if (o.pos.distanceTo(p) > r + o.def.radius) continue;
      this.damage(o, dmg, { knock, from: p, source });
      hits.push(o);
      if (single) break;
    }
    return hits;
  }

  shockwave(p, r, dmg, knock, source) {
    for (const o of this.list) {
      if (o.dead || o.type === 'packmate') continue;
      const d = o.pos.distanceTo(p);
      if (d > r) continue;
      const f = 1 - d / r;
      if (o.type === 'civilian' && dmg < 15) {
        // knock civilians down without killing them
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
      } else if (o.type === 'hunter' || o.type === 'captain') {
        if (rank >= 1) o.stun = 3;
        else o.attackCd += 1.5;
        if (rank >= 2) o.vuln = 8;
      } else if (o.type === 'vampire') {
        o.stun = 1.2;
        if (rank >= 2) o.vuln = 8;
      } else if (o.type === 'rival') {
        if (rank >= 2) o.vuln = 8;
        o.stun = 0.6;
      }
    }
  }

  spawnProjectile({ from, dir, speed, owner, damage, radius = 0, color = '#fff', magic = false, silver = false }) {
    const mesh = new THREE.Mesh(this.projGeo, new THREE.MeshBasicMaterial({ color }));
    mesh.position.copy(from);
    if (magic) {
      const l = new THREE.PointLight(color, 25, 18, 1.5);
      mesh.add(l);
      mesh.scale.setScalar(1.4);
    }
    this.game.scene.add(mesh);
    this.projectiles.push({ pos: from.clone(), vel: dir.clone().normalize().multiplyScalar(speed), owner, damage, radius, color, mesh, life: 3, magic, silver });
  }

  _updateProjectiles(dt) {
    const g = this.game;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.life -= dt;
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
              if (d < pr.radius + o.def.radius) this.damage(o, pr.damage * (1 - (d / (pr.radius + 1)) * 0.5), { knock: 14, from: pr.pos, source: g.player });
            }
          }
        }
        g.scene.remove(pr.mesh);
        pr.mesh.material.dispose();
        this.projectiles.splice(i, 1);
      }
    }
  }

  // ------------------------------------------------------------ AI
  update(dt) {
    const g = this.game;
    this._populate(dt);
    this._updateProjectiles(dt);
    const player = g.player;
    const pp = player.pos;
    for (const o of this.list) {
      const dist = o.pos.distanceTo(pp);
      o.distToPlayer = dist;
      if (o.dead) {
        o.corpseT += dt;
        // let a corpse settle onto the ground
        if (!o.onGround) {
          o.vel.y -= 25 * dt;
          o.pos.addScaledVector(o.vel, dt);
          const gy = g.world.groundAt(o.pos.x, o.pos.z, o.pos.y + 0.5, 1);
          if (o.pos.y <= gy) { o.pos.y = gy; o.onGround = true; }
          o.rig.root.position.copy(o.pos);
        }
        continue;
      }
      if (dist > 320 && !o.persistent) continue; // frozen far away
      o.t += dt;
      o.attackCd -= dt;
      o.stun -= dt;
      o.vuln -= dt;
      o.hitFlash = (o.hitFlash || 0) - dt;
      o.cheer -= dt;
      let wish = null, wantSpeed = 0;
      if (o.stun > 0) {
        wish = null;
      } else {
        const r = this['_ai_' + o.type](o, dt, dist);
        if (r) { wish = r.dir; wantSpeed = r.speed; }
      }
      this._physics(o, dt, wish, wantSpeed);
    }
  }

  _physics(o, dt, wish, wantSpeed) {
    const w = this.game.world;
    if (wish && wantSpeed > 0) {
      wish.y = 0;
      wish.normalize();
      const k = 1 - Math.exp(-(o.onGround ? 8 : 1) * dt);
      o.vel.x += (wish.x * wantSpeed - o.vel.x) * k;
      o.vel.z += (wish.z * wantSpeed - o.vel.z) * k;
      o.yaw = dampAngle(o.yaw, Math.atan2(wish.x, wish.z), 10, dt);
    } else {
      const k = 1 - Math.exp(-(o.onGround ? 6 : 0.5) * dt);
      o.vel.x -= o.vel.x * k;
      o.vel.z -= o.vel.z * k;
    }
    if (o.faceYaw !== undefined && o.faceYaw !== null) {
      o.yaw = dampAngle(o.yaw, o.faceYaw, 12, dt);
      o.faceYaw = null;
    }
    o.vel.y -= 25 * dt;
    o.pos.addScaledVector(o.vel, dt);
    this._n.set(0, 0, 0);
    this._n.top = 0;
    const big = o.def.radius > 0.6;
    if (w.collide(o.pos, o.def.radius, o.def.height, big ? 0.9 : 0.5, this._n)) {
      // beasts hop obstacles; humans slide along them
      if (big && o.onGround && this._n.top - o.pos.y < 6 && wantSpeed > 4) {
        o.vel.y = 12;
        o.onGround = false;
      }
    }
    const gy = w.groundAt(o.pos.x, o.pos.z, o.pos.y + 0.2, big ? 0.9 : 0.6);
    if (o.pos.y <= gy) {
      o.pos.y = gy;
      if (o.vel.y < 0) o.vel.y = 0;
      o.onGround = true;
    } else if (o.pos.y > gy + 0.3) {
      o.onGround = false;
    } else {
      o.pos.y = gy;
    }
    o.speed = Math.hypot(o.vel.x, o.vel.z);
    o.rig.root.position.copy(o.pos);
    o.rig.root.rotation.y = o.yaw;
    if (o.rig instanceof WolfRig) {
      o.rig.animate(dt, { speed: o.speed, onGround: o.onGround, quad: o.speed > 9, vy: o.vel.y });
    } else {
      o.rig.animate(dt, { speed: o.speed, onGround: o.onGround, aiming: o.aiming, cower: o.state === 'cower' });
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
      if (x === o || x.dead || !pred(x)) continue;
      const d = x.pos.distanceTo(o.pos);
      if (d < bd) { bd = d; best = x; }
    }
    return best;
  }

  _wander(o, speed, dt = 1 / 60) {
    if (!o.goal || o.pos.distanceTo(o.goal) < 2 || o.t > 25) {
      o.t = 0;
      const a = rand(0, Math.PI * 2), r = rand(10, 35);
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
    // line-of-sight checks are throttled; the result is cached between checks
    o.losT = (o.losT || 0) - dt;
    if (o.losT <= 0) {
      o.losT = 0.4;
      o.seenRecently = player.isWolf && !player.dead && dist < 35 && this._canSee(o, player.eye, 35);
    }
    if (o.seenRecently && player.isWolf) {
      g.rep.witnessed(dt, o);
      if (g.rep.morality >= 50 && o.state !== 'flee') {
        // Greyhaven's guardian: people stop to watch rather than run
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
    // danger nearby: vampires, gunfire
    const vamp = this._nearest(o, (x) => x.type === 'vampire' && (x.state === 'feed' || x.state === 'attack'), 18);
    if (vamp) { o.state = 'flee'; o.fear = 6; o.threat = vamp.pos.clone(); }
    if (o.state === 'flee') {
      o.fear -= dt;
      if (o.fear <= 0) { o.state = 'wander'; o.home.copy(o.pos); }
      const from = o.threat && !player.isWolf ? o.threat : player.pos;
      const away = o.pos.clone().sub(from).setY(0);
      if (away.lengthSq() < 0.01) away.set(1, 0, 0);
      // slight zig-zag looks frantic
      away.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.sin(o.t * 3 + o.id) * 0.5);
      return { dir: away, speed: o.def.run };
    }
    if (o.state === 'cower') return null;
    return this._wander(o, o.def.speed, dt);
  }

  // --- hunters: keep range, strafe, fire silver; harder to hit a fast target
  _ai_hunter(o, dt, dist) {
    const g = this.game;
    const player = g.player;
    // hunters also fight the other monsters
    let target = null, tpos = null;
    if (g.rep.huntersHostile(o) && !player.dead && dist < 120) {
      target = 'player';
      tpos = player.pos;
    } else {
      const m = this._nearest(o, (x) => x.type === 'vampire' || x.type === 'rival' || x.type === 'packmate', 60);
      if (m) { target = m; tpos = m.pos; }
    }
    if (!target) {
      if (o.state === 'pursue' && dist < 300) return { dir: player.pos.clone().sub(o.pos), speed: o.def.speed };
      return this._wander(o, o.def.speed, dt);
    }
    const to = tpos.clone().sub(o.pos);
    const d = to.length();
    const ideal = o.type === 'captain' ? 12 : 18;
    let dir;
    if (d > ideal + 8) dir = to.clone();
    else if (d < ideal - 8) dir = to.clone().negate();
    else dir = new THREE.Vector3(-to.z, 0, to.x).multiplyScalar(Math.sin(o.t * 0.7 + o.id) > 0 ? 1 : -1);
    const speed = d > ideal + 8 ? o.def.run : o.def.speed * 1.2;
    o.faceYaw = Math.atan2(to.x, to.z);
    o.aiming = d < 70;
    if (o.attackCd <= 0 && d < 70) {
      const targetHeight = target === 'player' ? player.height * 0.6 : target.def.height * 0.6;
      const aimPos = tpos.clone().add(new THREE.Vector3(0, targetHeight, 0));
      if (this._canSee(o, aimPos, 75)) {
        o.attackCd = o.type === 'captain' ? rand(0.8, 1.2) : rand(1.4, 2.4);
        const muzzle = o.pos.clone().add(new THREE.Vector3(0, 1.45, 0)).addScaledVector(to.clone().normalize(), 0.9);
        // accuracy falls off with distance and target speed: keep moving!
        const tSpeed = target === 'player' ? player.speed : target.speed;
        const hitChance = clamp(0.92 - d / 110 - tSpeed / 38 - (player.climbing ? 0.2 : 0), 0.08, 0.9);
        const hit = Math.random() < hitChance;
        const end = aimPos.clone();
        if (!hit) end.add(new THREE.Vector3(rand(-3, 3), rand(-1, 2), rand(-3, 3)));
        g.fx.tracer(muzzle, end, '#d8e4ff');
        g.fx.sparks(muzzle);
        g.audio.gunshot(dist);
        if (hit) {
          const dmg = o.type === 'captain' ? 22 : 13;
          if (target === 'player') g.player.takeDamage(dmg, { silver: true, source: o });
          else this.damage(target, dmg * 1.5, { source: o });
        }
        // gunfire scatters civilians
        for (const c of this.list) if (c.type === 'civilian' && !c.dead && c.pos.distanceTo(o.pos) < 30) { c.state = 'flee'; c.fear = 6; c.threat = o.pos.clone(); }
      }
    }
    return { dir, speed };
  }

  _ai_captain(o, dt, dist) {
    return this._ai_hunter(o, dt, dist);
  }

  // --- vampires: prey on civilians, lunge at the player
  _ai_vampire(o, dt, dist) {
    const g = this.game;
    const player = g.player;
    if (!g.world.isNight && !o.eventId) {
      // dawn: they burn
      if (Math.random() < dt * 0.5) this.kill(o, null);
    }
    if (o.state === 'guard' && dist > 40) return this._wander(o, o.def.speed, dt);
    // feeding on a victim
    if (o.feeding) {
      const v = o.feeding;
      if (v.dead) { o.feeding = null; o.state = 'hunt'; return null; }
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
        o.rig.attackT = 0.35;
        player.takeDamage(14, { source: o });
        g.audio.hiss(dist);
      } else if (d < 12 && d > 5 && o.onGround && o.attackCd <= 0 && Math.random() < dt * 2) {
        // blink-lunge
        to.normalize();
        o.vel.set(to.x * 22, 6, to.z * 22);
        o.onGround = false;
        g.fx.burst(o.pos.clone().add(new THREE.Vector3(0, 1, 0)), { count: 10, color: new THREE.Color('#300'), speed: 2, size: 0.5, life: 0.5, gravity: 0 });
      }
      // circle the beast rather than charging straight in
      const side = new THREE.Vector3(-to.z, 0, to.x).normalize().multiplyScalar(Math.sin(o.t + o.id) * 0.8);
      return { dir: to.normalize().add(side), speed: d < 3 ? 2 : o.def.run };
    }
    // hunt civilians
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

  // --- rival werewolves: territorial, fast, leap at you
  _ai_rival(o, dt, dist) {
    const g = this.game;
    const player = g.player;
    if (g.rep.packAllied && o.type === 'rival') {
      // the pack bows to its alpha
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
          if (o.dead || g.player.dead) return;
          if (o.pos.distanceTo(g.player.pos) < reach + 1) {
            g.player.takeDamage(o.type === 'alpha' ? 30 : 16, { source: o });
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
        // alpha roar: knockback burst
        o.attackCd = 2;
        g.audio.roar();
        g.fx.ring(o.pos, 12, '#ff5040', 0.6);
        g.camera.shake(0.4, 0.6);
        if (d < 10) {
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
    const g = this.game;
    const player = g.player;
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
      // too far behind: catch up out of sight
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
}
