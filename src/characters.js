// Procedural low-poly character rigs with hand-written animation.
// Humanoid: civilians, hunters, vampires, the player's human form.
// Werewolf: the player's beast form and rival pack members.
import * as THREE from 'three';
import { clamp, damp, lerp } from './util.js';

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const coneGeo = new THREE.ConeGeometry(1, 1, 5);
const matCache = new Map();
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...opts }));
  return matCache.get(key);
}

function part(parent, color, sx, sy, sz, x, y, z, opts) {
  const m = new THREE.Mesh(boxGeo, typeof color === 'string' ? mat(color, opts) : color);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

function pivot(parent, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

// ---------------------------------------------------------------------------
export class HumanRig {
  constructor({ skin = '#c99a7a', shirt = '#4a5a6a', pants = '#2a2a33', hair = '#2a1d14', hat = null, coat = null, cape = null, eyes = null, weapon = null, scale = 1 } = {}) {
    this.root = new THREE.Group();
    this.body = pivot(this.root, 0, 0, 0);
    this.body.scale.setScalar(scale);
    this.hips = pivot(this.body, 0, 0.95, 0);
    this.legL = pivot(this.hips, -0.13, 0, 0);
    this.legR = pivot(this.hips, 0.13, 0, 0);
    for (const leg of [this.legL, this.legR]) {
      part(leg, pants, 0.22, 0.9, 0.24, 0, -0.45, 0);
      part(leg, '#1a1512', 0.24, 0.12, 0.34, 0, -0.9, 0.05);
    }
    this.torso = pivot(this.hips, 0, 0, 0);
    part(this.torso, coat || shirt, 0.55, 0.68, 0.3, 0, 0.34, 0);
    if (coat) part(this.torso, coat, 0.6, 0.55, 0.34, 0, -0.15, 0); // coat skirt
    this.head = pivot(this.torso, 0, 0.72, 0);
    part(this.head, skin, 0.3, 0.34, 0.3, 0, 0.17, 0);
    part(this.head, hair, 0.32, 0.12, 0.32, 0, 0.36, -0.01);
    if (hat) {
      part(this.head, hat, 0.5, 0.04, 0.5, 0, 0.36, 0);
      part(this.head, hat, 0.32, 0.18, 0.32, 0, 0.45, 0);
    }
    if (eyes) {
      part(this.head, eyes, 0.06, 0.04, 0.02, -0.07, 0.2, 0.155, { emissive: eyes, emissiveIntensity: 3 });
      part(this.head, eyes, 0.06, 0.04, 0.02, 0.07, 0.2, 0.155, { emissive: eyes, emissiveIntensity: 3 });
    }
    this.armL = pivot(this.torso, -0.36, 0.62, 0);
    this.armR = pivot(this.torso, 0.36, 0.62, 0);
    for (const arm of [this.armL, this.armR]) {
      part(arm, coat || shirt, 0.16, 0.42, 0.18, 0, -0.2, 0);
      part(arm, skin, 0.13, 0.3, 0.14, 0, -0.55, 0);
    }
    if (cape) {
      this.cape = pivot(this.torso, 0, 0.68, -0.17);
      part(this.cape, cape, 0.62, 1.25, 0.04, 0, -0.62, 0);
    }
    if (weapon === 'rifle') {
      this.weapon = pivot(this.armR, 0, -0.55, 0.1);
      part(this.weapon, '#222', 0.07, 0.07, 1.0, 0, 0, 0.35);
      part(this.weapon, '#5a3a22', 0.09, 0.14, 0.3, 0, -0.04, -0.05);
      part(this.weapon, '#c9d2dc', 0.04, 0.04, 0.12, 0, 0, 0.9, { emissive: '#8fb4ff', emissiveIntensity: 0.6 });
    } else if (weapon === 'crossbow') {
      this.weapon = pivot(this.armR, 0, -0.55, 0.1);
      part(this.weapon, '#3a2a1a', 0.07, 0.07, 0.7, 0, 0, 0.25);
      part(this.weapon, '#555', 0.7, 0.04, 0.05, 0, 0, 0.5);
    }
    this.phase = Math.random() * 10;
    this.attackT = 0;
    this.aim = 0;
    this.fear = 0;
    this.dead = false;
  }

  animate(dt, { speed = 0, onGround = true, aiming = false, cower = false } = {}) {
    if (this.dead) return;
    const run = clamp(speed / 6, 0, 1.6);
    this.phase += dt * (3 + speed * 1.4);
    const s = Math.sin(this.phase);
    const amp = onGround ? 0.25 + run * 0.45 : 0.2;
    this.legL.rotation.x = s * amp;
    this.legR.rotation.x = -s * amp;
    this.hips.position.y = 0.95 + Math.abs(Math.cos(this.phase)) * 0.05 * run;
    this.torso.rotation.x = damp(this.torso.rotation.x, run * 0.25 + (cower ? 0.5 : 0), 8, dt);
    this.aim = damp(this.aim, aiming ? 1 : 0, 10, dt);
    this.armL.rotation.x = lerp(-s * amp * 1.1, -1.2, this.aim);
    this.armR.rotation.x = lerp(s * amp * 1.1, -1.45, this.aim);
    this.armL.rotation.z = lerp(0.05, 0.4, this.aim);
    this.armR.rotation.z = -0.05;
    if (cower) {
      this.armL.rotation.x = -2.2;
      this.armR.rotation.x = -2.2;
    }
    if (this.attackT > 0) {
      this.attackT -= dt;
      const k = Math.sin((1 - this.attackT / 0.35) * Math.PI);
      this.armR.rotation.x = -1.8 * k;
      this.armL.rotation.x = -1.2 * k;
      this.torso.rotation.x = 0.3 * k;
    }
    if (this.cape) this.cape.rotation.x = 0.1 + run * 0.6 + Math.sin(this.phase * 0.5) * 0.05;
  }

  // collapse to the ground when killed
  die() {
    this.dead = true;
    this.body.rotation.x = -Math.PI / 2;
    this.body.position.y = 0.15;
  }
}

// ---------------------------------------------------------------------------
export class WolfRig {
  constructor({ fur = '#4a3b30', furDark = '#2a211b', belly = '#6b5847', eyes = '#ffcc33', scale = 1 } = {}) {
    this.root = new THREE.Group();
    this.body = pivot(this.root, 0, 0, 0);
    this.body.scale.setScalar(scale);
    this.eyeColor = eyes;
    const furM = mat(fur), darkM = mat(furDark), bellyM = mat(belly);
    const clawM = mat('#e8e2d0', { roughness: 0.4 });
    this.hips = pivot(this.body, 0, 1.35, 0);
    // digitigrade legs
    this.legs = [];
    for (const side of [-1, 1]) {
      const thigh = pivot(this.hips, side * 0.32, 0, 0);
      part(thigh, furM, 0.36, 0.75, 0.42, 0, -0.33, 0.1);
      const shin = pivot(thigh, 0, -0.68, 0.22);
      part(shin, darkM, 0.24, 0.62, 0.26, 0, -0.28, -0.05);
      const foot = pivot(shin, 0, -0.58, -0.1);
      part(foot, darkM, 0.28, 0.14, 0.45, 0, -0.06, 0.15);
      for (let c = -1; c <= 1; c++) {
        const claw = new THREE.Mesh(coneGeo, clawM);
        claw.scale.set(0.035, 0.14, 0.035);
        claw.rotation.x = Math.PI / 2;
        claw.position.set(c * 0.08, -0.08, 0.42);
        foot.add(claw);
      }
      this.legs.push({ thigh, shin, foot });
    }
    // torso
    this.torso = pivot(this.hips, 0, 0.05, 0);
    part(this.torso, furM, 0.8, 0.7, 0.6, 0, 0.3, 0);
    this.chest = pivot(this.torso, 0, 0.62, 0.05);
    part(this.chest, furM, 1.15, 0.85, 0.82, 0, 0.3, 0);
    part(this.chest, bellyM, 0.8, 0.6, 0.1, 0, 0.2, 0.42);
    // shoulder/back fur spikes for silhouette
    for (let i = 0; i < 7; i++) {
      const sp = new THREE.Mesh(coneGeo, darkM);
      sp.scale.set(0.16, 0.45, 0.16);
      sp.position.set((i - 3) * 0.14, 0.72, -0.3 + Math.abs(i - 3) * 0.04);
      sp.rotation.x = -0.7;
      sp.castShadow = true;
      this.chest.add(sp);
    }
    // head
    this.neck = pivot(this.chest, 0, 0.68, 0.32);
    this.head = pivot(this.neck, 0, 0.12, 0.12);
    part(this.head, furM, 0.52, 0.46, 0.5, 0, 0.05, 0);
    part(this.head, darkM, 0.3, 0.24, 0.48, 0, -0.04, 0.42); // snout
    part(this.head, '#111', 0.1, 0.08, 0.08, 0, 0.06, 0.66); // nose
    this.jaw = pivot(this.head, 0, -0.16, 0.2);
    part(this.jaw, darkM, 0.26, 0.08, 0.42, 0, -0.02, 0.2);
    for (const sx of [-0.08, 0.08]) {
      const fang = new THREE.Mesh(coneGeo, clawM);
      fang.scale.set(0.025, 0.09, 0.025);
      fang.rotation.x = Math.PI;
      fang.position.set(sx, -0.13, 0.62);
      this.head.add(fang);
    }
    this.eyeMat = new THREE.MeshStandardMaterial({ color: eyes, emissive: eyes, emissiveIntensity: 4 });
    for (const sx of [-0.13, 0.13]) part(this.head, this.eyeMat, 0.09, 0.05, 0.03, sx, 0.12, 0.25);
    for (const sx of [-0.17, 0.17]) {
      const ear = new THREE.Mesh(coneGeo, darkM);
      ear.scale.set(0.11, 0.32, 0.1);
      ear.position.set(sx, 0.4, -0.08);
      ear.rotation.z = -sx * 1.2;
      ear.castShadow = true;
      this.head.add(ear);
    }
    // arms
    this.arms = [];
    for (const side of [-1, 1]) {
      const shoulder = pivot(this.chest, side * 0.68, 0.55, 0.05);
      part(shoulder, furM, 0.34, 0.7, 0.36, 0, -0.3, 0);
      const fore = pivot(shoulder, 0, -0.62, 0);
      part(fore, darkM, 0.26, 0.66, 0.28, 0, -0.3, 0);
      const hand = pivot(fore, 0, -0.66, 0);
      part(hand, darkM, 0.26, 0.18, 0.3, 0, -0.06, 0.02);
      for (let c = -1; c <= 1; c++) {
        const claw = new THREE.Mesh(coneGeo, clawM);
        claw.scale.set(0.035, 0.26, 0.035);
        claw.rotation.x = Math.PI + 0.3;
        claw.position.set(c * 0.08, -0.25, 0.1);
        hand.add(claw);
      }
      this.arms.push({ shoulder, fore, hand, side });
    }
    // tail
    this.tail = [];
    let parent = this.hips;
    let z = -0.35;
    for (let i = 0; i < 4; i++) {
      const seg = pivot(parent, 0, i === 0 ? 0.15 : 0, z);
      part(seg, i % 2 ? darkM : furM, 0.22 - i * 0.03, 0.22 - i * 0.03, 0.4, 0, 0, -0.2);
      this.tail.push(seg);
      parent = seg;
      z = -0.38;
    }
    this.phase = 0;
    this.quad = 0;
    this.attack = null; // { t, dur, kind, side }
    this.howlT = 0;
    this.climb = 0;
    this.dead = false;
  }

  playAttack(kind, side = 1) {
    const dur = { light: 0.28, heavy: 0.55, pounce: 0.45, slam: 0.5 }[kind] || 0.3;
    this.attack = { t: 0, dur, kind, side };
  }

  animate(dt, { speed = 0, onGround = true, quad = false, climbing = false, vy = 0, charge = 0 } = {}) {
    if (this.dead) return;
    this.quad = damp(this.quad, quad ? 1 : 0, 7, dt);
    this.climb = damp(this.climb, climbing ? 1 : 0, 10, dt);
    const q = this.quad;
    const gait = clamp(speed / 10, 0, 1.4);
    this.phase += dt * (2 + speed * (quad ? 0.55 : 0.9));
    const s = Math.sin(this.phase), c = Math.cos(this.phase);

    // base posture
    const crouch = charge * 0.35;
    this.hips.position.y = lerp(1.35, 1.15, q) - crouch + (onGround ? Math.abs(c) * 0.08 * gait : 0);
    this.torso.rotation.x = lerp(0.35, 1.15, q) + crouch * 0.5 - this.climb * 0.6;
    this.chest.rotation.x = lerp(0.15, 0.25, q);
    this.neck.rotation.x = lerp(-0.45, -1.25, q) + this.climb * 0.4;
    this.head.rotation.x = Math.sin(this.phase * 0.5) * 0.03;

    // legs
    const legAmp = onGround ? lerp(0.35 + gait * 0.35, 0.9, q) : 0.25;
    for (let i = 0; i < 2; i++) {
      const L = this.legs[i];
      const ph = quad ? s : i === 0 ? s : -s; // bound gait: hind legs in sync
      L.thigh.rotation.x = -ph * legAmp - lerp(0.25, 0.55, q) - crouch;
      L.shin.rotation.x = 0.6 + Math.max(0, ph) * 0.4 * gait + crouch * 1.4;
      L.foot.rotation.x = -0.35 - crouch * 0.4;
      if (!onGround) {
        L.thigh.rotation.x = vy > 0 ? -1.0 : 0.3;
        L.shin.rotation.x = vy > 0 ? 1.4 : 0.4;
      }
      if (this.climb > 0.01) {
        const cl = Math.sin(this.phase * 1.4 + i * Math.PI);
        L.thigh.rotation.x = lerp(L.thigh.rotation.x, -1.0 + cl * 0.6, this.climb);
      }
    }

    // arms: upright swing ↔ quadruped forelegs ↔ climbing reach
    for (const A of this.arms) {
      const ph = quad ? -s : (A.side < 0 ? -s : s);
      const upright = -ph * (0.3 + gait * 0.6) + 0.15;
      const fore = -0.7 + ph * 0.9;
      A.shoulder.rotation.x = lerp(upright, fore - 0.6, q);
      A.shoulder.rotation.z = A.side * lerp(0.25, 0.05, q);
      A.fore.rotation.x = lerp(-0.5, -0.2 - Math.max(0, -ph) * 0.8, q);
      if (!onGround && !quad) {
        A.shoulder.rotation.x = vy > 0 ? -2.2 : -1.2;
        A.fore.rotation.x = -0.4;
      }
      if (this.climb > 0.01) {
        const cl = Math.sin(this.phase * 1.4 + (A.side > 0 ? Math.PI : 0));
        A.shoulder.rotation.x = lerp(A.shoulder.rotation.x, -2.6 + cl * 0.5, this.climb);
        A.fore.rotation.x = lerp(A.fore.rotation.x, -0.3, this.climb);
      }
    }

    // attacks override arm poses
    if (this.attack) {
      const a = this.attack;
      a.t += dt;
      const k = clamp(a.t / a.dur, 0, 1);
      const swing = Math.sin(k * Math.PI);
      if (a.kind === 'light') {
        const A = this.arms[a.side > 0 ? 1 : 0];
        A.shoulder.rotation.x = lerp(-2.4, 0.4, k);
        A.shoulder.rotation.z = A.side * (0.9 - k * 1.2);
        A.fore.rotation.x = -0.6 * swing;
        this.torso.rotation.y = A.side * -0.4 * swing;
      } else if (a.kind === 'heavy' || a.kind === 'slam') {
        const wind = k < 0.4 ? k / 0.4 : 1 - (k - 0.4) / 0.6;
        for (const A of this.arms) {
          A.shoulder.rotation.x = k < 0.4 ? lerp(0, -3.0, wind) : lerp(0.5, -3.0, wind);
          A.fore.rotation.x = -0.3;
        }
        this.torso.rotation.x += k < 0.4 ? -0.4 * wind : 0.6 * (1 - wind);
      } else if (a.kind === 'pounce') {
        for (const A of this.arms) {
          A.shoulder.rotation.x = -2.6 + swing * 0.6;
          A.shoulder.rotation.z = A.side * 0.6;
        }
        this.torso.rotation.x = 0.9;
      }
      this.jaw.rotation.x = 0.5 * swing;
      if (a.t >= a.dur) {
        this.attack = null;
        this.torso.rotation.y = 0;
      }
    } else {
      this.torso.rotation.y = damp(this.torso.rotation.y, 0, 10, dt);
      this.jaw.rotation.x = damp(this.jaw.rotation.x, 0.05, 10, dt);
    }

    // howl pose
    if (this.howlT > 0) {
      this.howlT -= dt;
      const k = Math.min(1, this.howlT * 2, (1.6 - this.howlT) * 4);
      this.neck.rotation.x = lerp(this.neck.rotation.x, 0.9, k);
      this.torso.rotation.x = lerp(this.torso.rotation.x, -0.1, k);
      this.jaw.rotation.x = lerp(this.jaw.rotation.x, 0.7, k);
      for (const A of this.arms) A.shoulder.rotation.x = lerp(A.shoulder.rotation.x, -0.5, k);
    }

    // tail sway
    for (let i = 0; i < this.tail.length; i++) {
      this.tail[i].rotation.y = Math.sin(this.phase * 0.7 - i * 0.6) * (0.12 + gait * 0.1);
      this.tail[i].rotation.x = (i === 0 ? lerp(-0.5, 0.2, q) : 0.12) - (onGround ? 0 : 0.2);
    }
  }

  setEyeIntensity(v) {
    this.eyeMat.emissiveIntensity = v;
  }

  die() {
    this.dead = true;
    this.body.rotation.z = Math.PI / 2;
    this.body.position.y = 0.3;
  }
}
