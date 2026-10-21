// Procedural low-poly character rigs with hand-written animation.
// HumanRig: civilians, police, hunters, vampires, witches, ghouls, demons,
//           the player's human form — and, with { hybrid: true }, the
//           half-human, half-wolf form.
// WolfRig:  the player's full beast form and rival pack members.
// QuadRig:  wildlife (deer, rabbits).
import * as THREE from 'three';
import { clamp, damp, lerp } from './util.js';

const geoCache = new Map();
function capsule(r, len) {
  const k = `c${r.toFixed(3)}_${len.toFixed(3)}`;
  if (!geoCache.has(k)) geoCache.set(k, new THREE.CapsuleGeometry(r, len, 3, 8));
  return geoCache.get(k);
}
const sphereGeo = new THREE.SphereGeometry(0.5, 12, 9);
const lowSphere = new THREE.SphereGeometry(0.5, 7, 5);
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const coneGeo = new THREE.ConeGeometry(0.5, 1, 6);
const tuftGeo = new THREE.ConeGeometry(0.5, 1, 4);
const cylGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 10, 1, true);
const snoutGeo = new THREE.CylinderGeometry(0.5, 0.75, 1, 8);
snoutGeo.rotateX(Math.PI / 2);
const skirtGeo = new THREE.CylinderGeometry(0.5, 0.75, 1, 10, 1, true);

const matCache = new Map();
function mat(color, opts = {}) {
  if (color instanceof THREE.Material) return color;
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) {
    const { double, ...rest } = opts;
    matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.85, side: double ? THREE.DoubleSide : THREE.FrontSide, ...rest }));
  }
  return matCache.get(key);
}

function mesh(parent, geo, material, { pos = [0, 0, 0], scale = [1, 1, 1], rot = [0, 0, 0], shadow = true } = {}) {
  const m = new THREE.Mesh(geo, mat(material));
  m.position.set(...pos);
  m.scale.set(...scale);
  m.rotation.set(...rot);
  m.castShadow = shadow;
  parent.add(m);
  return m;
}

function pivot(parent, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

// a limb segment hanging down from its pivot
function limb(parent, material, r, len, { shadow = true, x = 0, z = 0 } = {}) {
  return mesh(parent, capsule(r, len), material, { pos: [x, -len / 2 - r * 0.3, z], shadow });
}

// a ring of fur tufts (manes, cuffs, ruffs)
function ruff(parent, material, { count = 10, radius = 0.3, y = 0, len = 0.3, width = 0.12, tilt = -0.9, arc = Math.PI * 2, start = 0 } = {}) {
  for (let i = 0; i < count; i++) {
    const a = start + (i / count) * arc;
    const t = mesh(parent, tuftGeo, material, {
      pos: [Math.sin(a) * radius, y, Math.cos(a) * radius],
      scale: [width, len * (0.8 + ((i * 37) % 10) / 25), width],
      shadow: false,
    });
    // point outward and back
    t.rotation.set(0, a, 0);
    t.rotateX(-tilt);
  }
}

// The werewolf head, shared by the beast and the hybrid.
function buildWolfHead(parent, { fur, dark, eyeMat, teeth = '#e8e2d0', size = 1 }) {
  const head = pivot(parent, 0, 0, 0);
  head.scale.setScalar(size);
  mesh(head, sphereGeo, fur, { scale: [0.5, 0.44, 0.52], pos: [0, 0.05, 0] });
  mesh(head, boxGeo, dark, { scale: [0.46, 0.1, 0.18], pos: [0, 0.2, 0.18], rot: [0.3, 0, 0], shadow: false }); // brow ridge
  mesh(head, snoutGeo, dark, { scale: [0.24, 0.2, 0.46], pos: [0, -0.04, 0.4] });
  mesh(head, sphereGeo, '#0c0c0c', { scale: [0.13, 0.09, 0.1], pos: [0, 0.03, 0.64], shadow: false });
  const jaw = pivot(head, 0, -0.14, 0.18);
  mesh(jaw, boxGeo, dark, { scale: [0.22, 0.07, 0.4], pos: [0, -0.02, 0.2] });
  const toothM = mat(teeth, { roughness: 0.4 });
  for (let i = 0; i < 5; i++) {
    for (const s of [-1, 1]) {
      mesh(jaw, coneGeo, toothM, { scale: [0.025, 0.06, 0.025], pos: [s * 0.08, 0.04, 0.06 + i * 0.065], shadow: false });
      mesh(head, coneGeo, toothM, { scale: [0.025, i === 0 ? 0.13 : 0.06, 0.025], pos: [s * 0.085, -0.16, 0.26 + i * 0.065], rot: [Math.PI, 0, 0], shadow: false });
    }
  }
  for (const sx of [-0.12, 0.12]) mesh(head, sphereGeo, eyeMat, { scale: [0.09, 0.05, 0.05], pos: [sx, 0.12, 0.23], rot: [0, 0, -sx * 2], shadow: false });
  const ears = [];
  for (const sx of [-0.16, 0.16]) {
    const ear = pivot(head, sx, 0.26, -0.06);
    mesh(ear, coneGeo, dark, { scale: [0.14, 0.34, 0.08], pos: [0, 0.14, 0] });
    mesh(ear, coneGeo, '#7a4848', { scale: [0.08, 0.24, 0.04], pos: [0, 0.12, 0.03], shadow: false });
    ear.rotation.z = -Math.sign(sx) * 0.35;
    ears.push(ear);
  }
  // cheek fur
  ruff(head, fur, { count: 7, radius: 0.22, y: -0.05, len: 0.22, width: 0.1, tilt: -1.5, arc: Math.PI * 1.3, start: Math.PI * 0.35 });
  return { head, jaw, ears };
}

// ---------------------------------------------------------------------------
export class HumanRig {
  constructor(o = {}) {
    const {
      skin = '#c99a7a', shirt = '#4a5a6a', pants = '#2a2a33', hair = '#2a1d14', hairStyle = 'short',
      hat = null, coat = null, cape = null, eyes = null, weapon = null, scale = 1, build = 1, female = false,
      skirt = null, sleeves = 'long', backpack = null, glasses = false, beard = null, horns = null, hunch = 0,
      robe = null, badge = false, shoes = '#1a1512', hybrid = false, fur = '#6a5442', furDark = '#3a2d23', mask = null,
    } = o;
    this.hybrid = hybrid;
    this.root = new THREE.Group();
    this.body = pivot(this.root, 0, 0, 0);
    this.body.scale.setScalar(scale);
    this.hunch = hunch;
    const sw = (female ? 0.88 : 1) * build; // shoulder width factor
    const limbSkin = hybrid ? fur : skin;
    const clawM = mat('#e8e2d0', { roughness: 0.4 });

    this.hips = pivot(this.body, 0, 0.95, 0);
    mesh(this.hips, sphereGeo, skirt || pants, { scale: [0.36 * build, 0.24, 0.24] });
    // legs: thigh → knee → shin → foot
    this.legL = pivot(this.hips, -0.11 * build, -0.02, 0);
    this.legR = pivot(this.hips, 0.11 * build, -0.02, 0);
    this.knees = [];
    for (const leg of [this.legL, this.legR]) {
      limb(leg, pants, 0.085 * build, 0.3);
      const knee = pivot(leg, 0, -0.44, 0);
      limb(knee, hybrid ? furDark : pants, 0.07 * build, 0.3);
      if (hybrid) {
        // torn trouser hems, furred shins and clawed bare feet
        mesh(knee, cylGeo, pants, { scale: [0.17 * build, 0.1, 0.17 * build], pos: [0, -0.05, 0], shadow: false });
        mesh(knee, boxGeo, furDark, { scale: [0.13, 0.08, 0.3], pos: [0, -0.45, 0.06] });
        for (let c = -1; c <= 1; c++) mesh(knee, coneGeo, clawM, { scale: [0.025, 0.08, 0.025], pos: [c * 0.04, -0.47, 0.23], rot: [Math.PI / 2, 0, 0], shadow: false });
      } else {
        mesh(knee, boxGeo, shoes, { scale: [0.13, 0.09, 0.27], pos: [0, -0.45, 0.05] });
      }
      this.knees.push(knee);
    }
    if (skirt) mesh(this.hips, skirtGeo, skirt, { scale: [0.36, 0.42, 0.3], pos: [0, -0.18, 0], shadow: false });

    // torso
    this.torso = pivot(this.hips, 0, 0.05, 0);
    const torsoCol = coat || shirt;
    mesh(this.torso, sphereGeo, torsoCol, { scale: [0.36 * build, 0.42, 0.24], pos: [0, 0.16, 0] }); // abdomen
    mesh(this.torso, sphereGeo, torsoCol, { scale: [0.48 * sw, 0.38, 0.27], pos: [0, 0.48, 0] }); // chest
    if (female) mesh(this.torso, sphereGeo, torsoCol, { scale: [0.36, 0.16, 0.16], pos: [0, 0.46, 0.09], shadow: false });
    if (hybrid) {
      // the shirt is torn open: fur bursts through the chest and shoulders
      mesh(this.torso, sphereGeo, fur, { scale: [0.44 * sw, 0.34, 0.2], pos: [0, 0.47, 0.06] });
      ruff(this.torso, fur, { count: 12, radius: 0.2, y: 0.62, len: 0.3, width: 0.13, tilt: -1.1 });
      ruff(this.torso, furDark, { count: 6, radius: 0.12, y: 0.3, len: 0.2, width: 0.1, tilt: -1.4, arc: Math.PI, start: -Math.PI / 2 });
    }
    if (badge) mesh(this.torso, boxGeo, '#d8c060', { scale: [0.06, 0.07, 0.02], pos: [-0.12, 0.55, 0.25], shadow: false });
    if (coat) {
      this.coatSkirt = pivot(this.torso, 0, 0.0, 0);
      mesh(this.coatSkirt, skirtGeo, coat, { scale: [0.44 * build, 0.6, 0.3], pos: [0, -0.32, 0], shadow: false });
    }
    if (robe) {
      this.coatSkirt = pivot(this.torso, 0, 0.0, 0);
      mesh(this.coatSkirt, skirtGeo, robe, { scale: [0.5, 1.0, 0.42], pos: [0, -0.55, 0] });
    }
    if (backpack) mesh(this.torso, boxGeo, backpack, { scale: [0.32, 0.38, 0.16], pos: [0, 0.45, -0.22] });

    // neck + head
    this.neck = pivot(this.torso, 0, 0.66, 0);
    mesh(this.neck, capsule(0.065, 0.06), hybrid ? fur : skin, { pos: [0, 0.04, 0], shadow: false });
    this.head = pivot(this.neck, 0, 0.12, 0);
    if (hybrid) {
      this.eyeMat = new THREE.MeshStandardMaterial({ color: eyes || '#ffcc33', emissive: eyes || '#ffcc33', emissiveIntensity: 4 });
      const wh = buildWolfHead(this.head, { fur, dark: furDark, eyeMat: this.eyeMat, size: 0.95 });
      wh.head.position.set(0, 0.02, 0.06);
      this.jaw = wh.jaw;
    } else {
      const hs = female ? 0.95 : 1;
      mesh(this.head, sphereGeo, skin, { scale: [0.22 * hs, 0.27 * hs, 0.24 * hs], pos: [0, 0.13, 0] });
      // face: nose, eyes, brows, mouth, ears
      mesh(this.head, boxGeo, skin, { scale: [0.035, 0.06, 0.05], pos: [0, 0.12, 0.12], shadow: false });
      const eyeM = eyes ? mat(eyes, { emissive: eyes, emissiveIntensity: 3 }) : mat('#1a1a1a');
      for (const sx of [-0.05, 0.05]) {
        if (!eyes) mesh(this.head, lowSphere, '#f0ece4', { scale: [0.04, 0.025, 0.02], pos: [sx, 0.155, 0.105], shadow: false });
        mesh(this.head, lowSphere, eyeM, { scale: [0.022, 0.022, 0.02], pos: [sx, 0.155, 0.113], shadow: false });
        mesh(this.head, boxGeo, hair, { scale: [0.05, 0.012, 0.02], pos: [sx, 0.185, 0.11], shadow: false });
        mesh(this.head, lowSphere, skin, { scale: [0.03, 0.06, 0.04], pos: [sx * 2.3, 0.13, 0], shadow: false });
      }
      mesh(this.head, boxGeo, '#7a4a42', { scale: [0.06, 0.012, 0.02], pos: [0, 0.075, 0.108], shadow: false });
      if (glasses) {
        for (const sx of [-0.05, 0.05]) mesh(this.head, boxGeo, '#111', { scale: [0.055, 0.035, 0.01], pos: [sx, 0.155, 0.125], shadow: false });
      }
      if (beard) mesh(this.head, sphereGeo, beard, { scale: [0.19, 0.14, 0.12], pos: [0, 0.05, 0.06], shadow: false });
      if (mask) mesh(this.head, boxGeo, mask, { scale: [0.2, 0.08, 0.05], pos: [0, 0.08, 0.1], shadow: false });
      // hair styles
      if (hairStyle === 'short') mesh(this.head, sphereGeo, hair, { scale: [0.235, 0.16, 0.25], pos: [0, 0.22, -0.01], shadow: false });
      else if (hairStyle === 'long') {
        mesh(this.head, sphereGeo, hair, { scale: [0.24, 0.17, 0.26], pos: [0, 0.22, -0.01], shadow: false });
        mesh(this.head, boxGeo, hair, { scale: [0.22, 0.32, 0.08], pos: [0, 0.02, -0.11], shadow: false });
      } else if (hairStyle === 'bun') {
        mesh(this.head, sphereGeo, hair, { scale: [0.235, 0.16, 0.25], pos: [0, 0.22, -0.01], shadow: false });
        mesh(this.head, sphereGeo, hair, { scale: [0.1, 0.1, 0.1], pos: [0, 0.27, -0.12], shadow: false });
      } else if (hairStyle === 'mohawk') {
        mesh(this.head, boxGeo, hair, { scale: [0.04, 0.12, 0.24], pos: [0, 0.3, -0.01], shadow: false });
      } else if (hairStyle === 'ragged') {
        ruff(this.head, hair, { count: 8, radius: 0.1, y: 0.26, len: 0.16, width: 0.08, tilt: -0.6 });
      }
      if (horns) for (const sx of [-0.1, 0.1]) mesh(this.head, coneGeo, horns, { scale: [0.07, 0.26, 0.07], pos: [sx, 0.32, 0], rot: [-0.3, 0, -sx * 4], shadow: false });
    }
    if (hat === 'fedora' || hat === true) {
      mesh(this.head, cylGeo, '#161616', { scale: [0.5, 0.02, 0.5], pos: [0, 0.31, 0], shadow: false });
      mesh(this.head, sphereGeo, '#161616', { scale: [0.27, 0.16, 0.28], pos: [0, 0.35, 0] });
    } else if (hat === 'cap') {
      mesh(this.head, sphereGeo, o.hatColor || '#1a2a4a', { scale: [0.25, 0.14, 0.27], pos: [0, 0.27, 0] });
      mesh(this.head, boxGeo, o.hatColor || '#1a2a4a', { scale: [0.22, 0.02, 0.14], pos: [0, 0.25, 0.17], shadow: false });
    } else if (hat === 'witch') {
      mesh(this.head, cylGeo, '#141018', { scale: [0.6, 0.02, 0.6], pos: [0, 0.3, 0], shadow: false });
      mesh(this.head, coneGeo, '#141018', { scale: [0.3, 0.55, 0.3], pos: [0, 0.58, -0.04], rot: [-0.2, 0, 0] });
    } else if (hat === 'hood') {
      mesh(this.head, sphereGeo, o.hatColor || torsoCol, { scale: [0.3, 0.32, 0.31], pos: [0, 0.15, -0.03] });
    } else if (typeof hat === 'string' && hat.startsWith('#')) {
      mesh(this.head, cylGeo, hat, { scale: [0.5, 0.02, 0.5], pos: [0, 0.31, 0], shadow: false });
      mesh(this.head, sphereGeo, hat, { scale: [0.27, 0.16, 0.28], pos: [0, 0.35, 0] });
    }

    // arms: shoulder → elbow → hand
    this.armL = pivot(this.torso, -0.25 * sw, 0.6, 0);
    this.armR = pivot(this.torso, 0.25 * sw, 0.6, 0);
    this.elbows = [];
    this.hands = [];
    for (const arm of [this.armL, this.armR]) {
      mesh(arm, sphereGeo, hybrid ? fur : torsoCol, { scale: [0.17 * build, 0.15, 0.17], pos: [0, -0.02, 0] });
      limb(arm, hybrid ? fur : torsoCol, 0.06 * build, 0.2);
      const elbow = pivot(arm, 0, -0.3, 0);
      limb(elbow, hybrid ? furDark : sleeves === 'short' ? limbSkin : torsoCol, 0.05 * build, 0.2);
      const hand = pivot(elbow, 0, -0.29, 0);
      mesh(hand, sphereGeo, hybrid ? furDark : skin, { scale: [0.09, 0.11, 0.07], pos: [0, -0.03, 0] });
      if (hybrid) {
        ruff(elbow, fur, { count: 5, radius: 0.05, y: -0.02, len: 0.14, width: 0.07, tilt: -2.4 });
        for (let c = -1; c <= 1; c++) mesh(hand, coneGeo, clawM, { scale: [0.022, 0.15, 0.022], pos: [c * 0.03, -0.14, 0.03], rot: [Math.PI + 0.2, 0, 0], shadow: false });
      }
      this.elbows.push(elbow);
      this.hands.push(hand);
    }
    if (hybrid) {
      // short tail
      this.tail = [];
      let parent = this.hips;
      for (let i = 0; i < 3; i++) {
        const seg = pivot(parent, 0, i === 0 ? 0.02 : 0, i === 0 ? -0.2 : -0.22);
        mesh(seg, capsule(0.07 - i * 0.015, 0.16), i % 2 ? furDark : fur, { pos: [0, 0, -0.1], rot: [Math.PI / 2, 0, 0], shadow: false });
        this.tail.push(seg);
        parent = seg;
      }
    }
    if (cape) {
      this.cape = pivot(this.torso, 0, 0.66, -0.2);
      mesh(this.cape, boxGeo, mat(cape, { double: true }), { scale: [0.62, 1.25, 0.03], pos: [0, -0.62, 0] });
      mesh(this.cape, boxGeo, cape, { scale: [0.66, 0.16, 0.2], pos: [0, 0.02, 0.1], shadow: false }); // high collar
    }
    if (weapon === 'rifle') {
      this.weapon = pivot(this.armR, 0, -0.55, 0.1);
      mesh(this.weapon, boxGeo, '#222', { scale: [0.07, 0.07, 1.0], pos: [0, 0, 0.35] });
      mesh(this.weapon, boxGeo, '#5a3a22', { scale: [0.09, 0.14, 0.3], pos: [0, -0.04, -0.05] });
      mesh(this.weapon, boxGeo, '#c9d2dc', { scale: [0.04, 0.04, 0.12], pos: [0, 0, 0.9] }, true);
      mesh(this.weapon, boxGeo, '#111', { scale: [0.05, 0.06, 0.18], pos: [0, 0.07, 0.25], shadow: false }); // scope
    } else if (weapon === 'crossbow') {
      this.weapon = pivot(this.armR, 0, -0.55, 0.1);
      mesh(this.weapon, boxGeo, '#3a2a1a', { scale: [0.07, 0.07, 0.7], pos: [0, 0, 0.25] });
      mesh(this.weapon, boxGeo, '#555', { scale: [0.7, 0.04, 0.05], pos: [0, 0, 0.5] });
    } else if (weapon === 'pistol') {
      this.weapon = pivot(this.armR, 0, -0.58, 0.06);
      mesh(this.weapon, boxGeo, '#1a1a1a', { scale: [0.05, 0.1, 0.22], pos: [0, 0, 0.08] });
    } else if (weapon === 'staff') {
      this.weapon = pivot(this.armR, 0, -0.58, 0.05);
      mesh(this.weapon, capsule(0.025, 1.5), '#3a2a1a', { pos: [0, 0.2, 0] });
      this.staffGem = mesh(this.weapon, lowSphere, mat('#6aff9a', { emissive: '#6aff9a', emissiveIntensity: 3 }), { scale: [0.12, 0.12, 0.12], pos: [0, 1.0, 0], shadow: false });
    }
    this.phase = Math.random() * 10;
    this.attackT = 0;
    this.attackKind = 'punch';
    this.aim = 0;
    this.fear = 0;
    this.dead = false;
    this.float = 0;
  }

  playAttack(kind = 'punch', side = 1) {
    this.attackKind = kind;
    this.attackSide = side;
    this.attackT = kind === 'heavy' ? 0.5 : 0.35;
    this.attackDur = this.attackT;
  }

  animate(dt, { speed = 0, onGround = true, aiming = false, cower = false, quad = false, climbing = false, vy = 0, sliding = false } = {}) {
    if (this.dead) return;
    const run = clamp(speed / 6, 0, 1.8);
    this.phase += dt * (3 + speed * 1.3);
    const s = Math.sin(this.phase), c = Math.cos(this.phase);
    const amp = onGround ? 0.25 + run * 0.4 : 0.2;
    this.legL.rotation.x = s * amp;
    this.legR.rotation.x = -s * amp;
    // knees bend on the back-swing
    this.knees[0].rotation.x = onGround ? Math.max(0, -s) * (0.3 + run * 0.9) + 0.05 : 0.9;
    this.knees[1].rotation.x = onGround ? Math.max(0, s) * (0.3 + run * 0.9) + 0.05 : 0.6;
    if (!onGround) {
      this.legL.rotation.x = vy > 0 ? -0.9 : -0.3;
      this.legR.rotation.x = vy > 0 ? 0.2 : 0.3;
    }
    this.hips.position.y = 0.95 + Math.abs(c) * 0.05 * run + this.float;
    const lean = run * 0.22 + (cower ? 0.5 : 0) + this.hunch + (sliding ? -0.6 : 0);
    this.torso.rotation.x = damp(this.torso.rotation.x, lean, 8, dt);
    this.neck.rotation.x = -this.hunch * 0.7;
    this.aim = damp(this.aim, aiming ? 1 : 0, 10, dt);
    this.armL.rotation.x = lerp(-s * amp * 1.1, -1.2, this.aim);
    this.armR.rotation.x = lerp(s * amp * 1.1, -1.45, this.aim);
    this.armL.rotation.z = lerp(0.08, 0.4, this.aim) + this.hunch * 0.2;
    this.armR.rotation.z = -0.08 - this.hunch * 0.2;
    this.elbows[0].rotation.x = -0.25 - run * 0.7 * (0.5 + Math.max(0, s) * 0.5);
    this.elbows[1].rotation.x = -0.25 - run * 0.7 * (0.5 + Math.max(0, -s) * 0.5);
    if (cower) {
      this.armL.rotation.x = -2.2;
      this.armR.rotation.x = -2.2;
      this.elbows[0].rotation.x = this.elbows[1].rotation.x = -1.4;
    }
    if (sliding) {
      this.legL.rotation.x = -1.3;
      this.legR.rotation.x = -0.7;
      this.knees[1].rotation.x = 1.2;
    }
    if (climbing || quad) {
      // hybrid scramble: arms reach, legs push
      const cl = Math.sin(this.phase * 1.3);
      this.armL.rotation.x = climbing ? -2.7 + cl * 0.5 : -1.2 + cl * 0.7;
      this.armR.rotation.x = climbing ? -2.7 - cl * 0.5 : -1.2 - cl * 0.7;
      this.torso.rotation.x = climbing ? -0.2 : 0.9;
    }
    if (this.attackT > 0) {
      this.attackT -= dt;
      const k = 1 - this.attackT / (this.attackDur || 0.35);
      const sw = Math.sin(k * Math.PI);
      const R = this.attackSide < 0 ? this.armL : this.armR;
      const E = this.attackSide < 0 ? this.elbows[0] : this.elbows[1];
      if (this.attackKind === 'heavy') {
        this.armL.rotation.x = this.armR.rotation.x = k < 0.4 ? lerp(0, -2.9, k / 0.4) : lerp(-2.9, 0.4, (k - 0.4) / 0.6);
        this.torso.rotation.x += 0.4 * sw;
      } else if (this.attackKind === 'claw') {
        R.rotation.x = lerp(-2.4, 0.5, k);
        R.rotation.z = (this.attackSide || 1) * -(0.9 - k * 1.4);
        E.rotation.x = -0.4 * sw;
        this.torso.rotation.y = (this.attackSide || 1) * 0.5 * sw;
      } else if (this.attackKind === 'cast') {
        R.rotation.x = -1.6 * sw - 0.2;
        this.armL.rotation.x = -1.2 * sw;
      } else {
        R.rotation.x = -1.6 * sw;
        E.rotation.x = -1.2 * (1 - sw);
        this.torso.rotation.y = (this.attackSide || 1) * 0.3 * sw;
      }
    } else {
      this.torso.rotation.y = damp(this.torso.rotation.y, 0, 10, dt);
    }
    if (this.jaw) this.jaw.rotation.x = this.attackT > 0 ? 0.4 : damp(this.jaw.rotation.x, 0.05, 10, dt);
    if (this.cape) this.cape.rotation.x = 0.1 + run * 0.6 + Math.sin(this.phase * 0.5) * 0.05;
    if (this.coatSkirt) this.coatSkirt.rotation.x = -run * 0.15;
    if (this.tail) for (let i = 0; i < this.tail.length; i++) this.tail[i].rotation.y = Math.sin(this.phase * 0.6 - i) * 0.25;
    if (this.staffGem) this.staffGem.scale.setScalar(0.12 + Math.sin(this.phase * 2) * 0.02);
  }

  setEyeIntensity(v) {
    if (this.eyeMat) this.eyeMat.emissiveIntensity = v;
  }

  die() {
    this.dead = true;
    this.body.rotation.x = -Math.PI / 2;
    this.body.position.y = 0.15;
  }
}

// ---------------------------------------------------------------------------
export class WolfRig {
  constructor({ fur = '#6a5442', furDark = '#3a2d23', belly = '#8a735c', eyes = '#ffcc33', scale = 1 } = {}) {
    this.root = new THREE.Group();
    this.body = pivot(this.root, 0, 0, 0);
    this.body.scale.setScalar(scale);
    this.eyeColor = eyes;
    const furM = mat(fur), darkM = mat(furDark), bellyM = mat(belly);
    const clawM = mat('#e8e2d0', { roughness: 0.35 });

    this.hips = pivot(this.body, 0, 1.35, 0);
    mesh(this.hips, sphereGeo, furM, { scale: [0.72, 0.5, 0.55], pos: [0, 0.05, -0.05] });
    // digitigrade legs: thigh → shin → paw
    this.legs = [];
    for (const side of [-1, 1]) {
      const thigh = pivot(this.hips, side * 0.32, 0, 0);
      mesh(thigh, capsule(0.2, 0.42), furM, { pos: [0, -0.3, 0.1], rot: [-0.25, 0, 0] });
      ruff(thigh, darkM, { count: 4, radius: 0.18, y: -0.55, len: 0.2, width: 0.1, tilt: -2.4, arc: Math.PI, start: Math.PI / 2 });
      const shin = pivot(thigh, 0, -0.68, 0.22);
      mesh(shin, capsule(0.12, 0.42), darkM, { pos: [0, -0.28, -0.05] });
      const foot = pivot(shin, 0, -0.58, -0.1);
      mesh(foot, sphereGeo, darkM, { scale: [0.26, 0.14, 0.42], pos: [0, -0.06, 0.14] });
      for (let c = -1.5; c <= 1.5; c++) mesh(foot, coneGeo, clawM, { scale: [0.035, 0.14, 0.035], pos: [c * 0.06, -0.08, 0.36], rot: [Math.PI / 2, 0, 0], shadow: false });
      this.legs.push({ thigh, shin, foot });
    }
    // torso: lean waist, massive chest
    this.torso = pivot(this.hips, 0, 0.05, 0);
    mesh(this.torso, sphereGeo, furM, { scale: [0.66, 0.75, 0.52], pos: [0, 0.32, 0] });
    mesh(this.torso, sphereGeo, bellyM, { scale: [0.46, 0.55, 0.2], pos: [0, 0.3, 0.2], shadow: false });
    this.chest = pivot(this.torso, 0, 0.62, 0.05);
    mesh(this.chest, sphereGeo, furM, { scale: [1.2, 0.95, 0.85], pos: [0, 0.3, 0] });
    mesh(this.chest, sphereGeo, bellyM, { scale: [0.75, 0.62, 0.3], pos: [0, 0.22, 0.32], shadow: false });
    // pecs
    for (const s of [-1, 1]) mesh(this.chest, sphereGeo, bellyM, { scale: [0.38, 0.3, 0.18], pos: [s * 0.2, 0.34, 0.36], shadow: false });
    // mane: a thick ruff across shoulders and down the spine
    ruff(this.chest, darkM, { count: 16, radius: 0.42, y: 0.62, len: 0.5, width: 0.18, tilt: -1.0 });
    ruff(this.chest, furM, { count: 12, radius: 0.32, y: 0.75, len: 0.42, width: 0.16, tilt: -0.7 });
    for (let i = 0; i < 6; i++) {
      mesh(this.torso, tuftGeo, darkM, { pos: [0, 0.75 - i * 0.12, -0.42 + i * 0.03], scale: [0.14, 0.32, 0.14], rot: [-1.9, 0, 0], shadow: false });
    }
    // head
    this.neck = pivot(this.chest, 0, 0.68, 0.32);
    mesh(this.neck, capsule(0.2, 0.2), furM, { pos: [0, 0.05, 0.02], rot: [0.6, 0, 0] });
    this.head = pivot(this.neck, 0, 0.12, 0.12);
    this.eyeMat = new THREE.MeshStandardMaterial({ color: eyes, emissive: eyes, emissiveIntensity: 4 });
    const wh = buildWolfHead(this.head, { fur, dark: furDark, eyeMat: this.eyeMat });
    this.jaw = wh.jaw;
    this.ears = wh.ears;
    // arms: shoulder → forearm → clawed hand
    this.arms = [];
    for (const side of [-1, 1]) {
      const shoulder = pivot(this.chest, side * 0.68, 0.55, 0.05);
      mesh(shoulder, sphereGeo, furM, { scale: [0.42, 0.42, 0.42], pos: [0, -0.02, 0] });
      mesh(shoulder, capsule(0.16, 0.42), furM, { pos: [0, -0.32, 0] });
      const fore = pivot(shoulder, 0, -0.62, 0);
      mesh(fore, capsule(0.13, 0.44), darkM, { pos: [0, -0.3, 0] });
      ruff(fore, furM, { count: 5, radius: 0.12, y: -0.05, len: 0.22, width: 0.1, tilt: -2.5, arc: Math.PI, start: Math.PI / 2 });
      const hand = pivot(fore, 0, -0.66, 0);
      mesh(hand, sphereGeo, darkM, { scale: [0.26, 0.2, 0.28], pos: [0, -0.04, 0.02] });
      for (let c = -1.5; c <= 1.5; c++) mesh(hand, coneGeo, clawM, { scale: [0.04, 0.3, 0.04], pos: [c * 0.06, -0.24, 0.1], rot: [Math.PI + 0.3, 0, 0], shadow: false });
      this.arms.push({ shoulder, fore, hand, side });
    }
    // bushy tail
    this.tail = [];
    let parent = this.hips;
    let z = -0.35;
    for (let i = 0; i < 4; i++) {
      const seg = pivot(parent, 0, i === 0 ? 0.15 : 0, z);
      mesh(seg, capsule(0.15 - i * 0.02, 0.25), i % 2 ? darkM : furM, { pos: [0, 0, -0.2], rot: [Math.PI / 2, 0, 0] });
      if (i > 0) ruff(seg, i % 2 ? furM : darkM, { count: 4, radius: 0.08, y: 0, len: 0.2, width: 0.12, tilt: -1.4 });
      this.tail.push(seg);
      parent = seg;
      z = -0.38;
    }
    this.phase = 0;
    this.quad = 0;
    this.attack = null;
    this.howlT = 0;
    this.climb = 0;
    this.dead = false;
  }

  playAttack(kind, side = 1) {
    const dur = { light: 0.28, heavy: 0.55, pounce: 0.45, slam: 0.5, grab: 0.3, throw: 0.35, finisher: 0.9 }[kind] || 0.3;
    this.attack = { t: 0, dur, kind, side };
  }

  animate(dt, { speed = 0, onGround = true, quad = false, climbing = false, vy = 0, charge = 0, sliding = false, holding = false, block = false } = {}) {
    if (this.dead) return;
    this.quad = damp(this.quad, quad ? 1 : 0, 7, dt);
    this.climb = damp(this.climb, climbing ? 1 : 0, 10, dt);
    const q = this.quad;
    const gait = clamp(speed / 10, 0, 1.4);
    this.phase += dt * (2 + speed * (quad ? 0.55 : 0.9));
    const s = Math.sin(this.phase), c = Math.cos(this.phase);
    const crouch = charge * 0.35 + (sliding ? 0.4 : 0);
    this.hips.position.y = lerp(1.35, 1.15, q) - crouch + (onGround ? Math.abs(c) * 0.08 * gait : 0);
    this.torso.rotation.x = lerp(0.35, 1.15, q) + crouch * 0.5 - this.climb * 0.6;
    this.chest.rotation.x = lerp(0.15, 0.25, q);
    this.neck.rotation.x = lerp(-0.45, -1.25, q) + this.climb * 0.4;
    this.head.rotation.x = Math.sin(this.phase * 0.5) * 0.03;
    // ears flatten at speed
    if (this.ears) for (const e of this.ears) e.rotation.x = -gait * 0.6;

    const legAmp = onGround ? lerp(0.35 + gait * 0.35, 0.9, q) : 0.25;
    for (let i = 0; i < 2; i++) {
      const L = this.legs[i];
      const ph = quad ? s : i === 0 ? s : -s;
      L.thigh.rotation.x = -ph * legAmp - lerp(0.25, 0.55, q) - crouch;
      L.shin.rotation.x = 0.6 + Math.max(0, ph) * 0.4 * gait + crouch * 1.4;
      L.foot.rotation.x = -0.35 - crouch * 0.4;
      if (!onGround) {
        L.thigh.rotation.x = vy > 0 ? -1.0 : 0.3;
        L.shin.rotation.x = vy > 0 ? 1.4 : 0.4;
      }
      if (sliding) {
        L.thigh.rotation.x = i ? -1.4 : -0.4;
        L.shin.rotation.x = 1.6;
      }
      if (this.climb > 0.01) {
        const cl = Math.sin(this.phase * 1.4 + i * Math.PI);
        L.thigh.rotation.x = lerp(L.thigh.rotation.x, -1.0 + cl * 0.6, this.climb);
      }
    }

    for (const A of this.arms) {
      const ph = quad ? -s : A.side < 0 ? -s : s;
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
      if (holding) {
        A.shoulder.rotation.x = -2.9;
        A.shoulder.rotation.z = A.side * 0.35;
        A.fore.rotation.x = -0.5;
      }
      if (block) {
        A.shoulder.rotation.x = -1.6;
        A.shoulder.rotation.z = -A.side * 0.5;
        A.fore.rotation.x = -1.7;
      }
    }

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
      } else if (a.kind === 'throw') {
        for (const A of this.arms) A.shoulder.rotation.x = lerp(-3.0, -0.4, k);
        this.torso.rotation.x += 0.5 * swing;
      } else if (a.kind === 'finisher') {
        // lift, then tear apart
        for (const A of this.arms) {
          A.shoulder.rotation.x = k < 0.5 ? -2.4 : lerp(-2.4, 0.2, (k - 0.5) * 2);
          A.shoulder.rotation.z = A.side * (k < 0.5 ? 0.2 : 1.1 * (k - 0.5) * 2);
        }
        this.neck.rotation.x += 0.4 * swing;
      }
      this.jaw.rotation.x = 0.55 * swing;
      if (a.t >= a.dur) {
        this.attack = null;
        this.torso.rotation.y = 0;
      }
    } else {
      this.torso.rotation.y = damp(this.torso.rotation.y, 0, 10, dt);
      this.jaw.rotation.x = damp(this.jaw.rotation.x, 0.05, 10, dt);
    }

    if (this.howlT > 0) {
      this.howlT -= dt;
      const k = Math.min(1, this.howlT * 2, (1.6 - this.howlT) * 4);
      this.neck.rotation.x = lerp(this.neck.rotation.x, 0.9, k);
      this.torso.rotation.x = lerp(this.torso.rotation.x, -0.1, k);
      this.jaw.rotation.x = lerp(this.jaw.rotation.x, 0.7, k);
      for (const A of this.arms) A.shoulder.rotation.x = lerp(A.shoulder.rotation.x, -0.5, k);
    }

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

// ---------------------------------------------------------------------------
// Four-legged wildlife.
export class QuadRig {
  constructor({ kind = 'deer' } = {}) {
    this.root = new THREE.Group();
    this.body = pivot(this.root, 0, 0, 0);
    const deer = kind === 'deer';
    const S = deer ? 1 : 0.28;
    this.body.scale.setScalar(S);
    const coat = deer ? '#8a5a36' : '#9a8a78';
    const dark = deer ? '#5a3a22' : '#6a5a48';
    this.torso = pivot(this.body, 0, 1.15, 0);
    mesh(this.torso, capsule(0.32, 0.9), coat, { rot: [Math.PI / 2, 0, 0] });
    mesh(this.torso, sphereGeo, '#e8dcc8', { scale: [0.3, 0.2, 0.2], pos: [0, -0.05, -0.75], shadow: false }); // tail patch
    this.neck = pivot(this.torso, 0, 0.15, 0.55);
    mesh(this.neck, capsule(0.12, 0.45), coat, { pos: [0, 0.25, 0.08], rot: [0.5, 0, 0] });
    this.head = pivot(this.neck, 0, 0.55, 0.2);
    mesh(this.head, capsule(0.12, 0.22), coat, { rot: [Math.PI / 2 - 0.3, 0, 0], pos: [0, 0, 0.1] });
    mesh(this.head, lowSphere, '#111', { scale: [0.06, 0.05, 0.05], pos: [0, -0.02, 0.32], shadow: false });
    for (const s of [-1, 1]) {
      mesh(this.head, lowSphere, '#111', { scale: [0.04, 0.04, 0.04], pos: [s * 0.1, 0.06, 0.12], shadow: false });
      mesh(this.head, coneGeo, dark, { scale: deer ? [0.08, 0.2, 0.04] : [0.06, 0.45, 0.03], pos: [s * 0.1, 0.18, -0.05], rot: [0, 0, -s * 0.5], shadow: false });
      if (deer) {
        const antler = pivot(this.head, s * 0.06, 0.15, 0);
        mesh(antler, capsule(0.02, 0.4), '#d8ccb0', { pos: [0, 0.2, 0], rot: [0, 0, -s * 0.4], shadow: false });
        mesh(antler, capsule(0.02, 0.2), '#d8ccb0', { pos: [s * 0.12, 0.35, 0.05], rot: [0.5, 0, -s * 1.1], shadow: false });
      }
    }
    this.legs = [];
    for (const [x, z] of [[-0.18, 0.5], [0.18, 0.5], [-0.18, -0.5], [0.18, -0.5]]) {
      const leg = pivot(this.torso, x, -0.15, z);
      mesh(leg, capsule(0.06, 0.45), coat, { pos: [0, -0.28, 0] });
      const low = pivot(leg, 0, -0.55, 0);
      mesh(low, capsule(0.04, 0.4), dark, { pos: [0, -0.22, 0] });
      this.legs.push({ leg, low });
    }
    this.phase = Math.random() * 6;
    this.dead = false;
    this.graze = 0;
  }

  animate(dt, { speed = 0, onGround = true } = {}) {
    if (this.dead) return;
    const run = clamp(speed / 8, 0, 1.5);
    this.phase += dt * (2 + speed * 1.1);
    const s = Math.sin(this.phase);
    this.legs.forEach((L, i) => {
      const ph = run > 0.5 ? (i < 2 ? s : -s) : i === 0 || i === 3 ? s : -s;
      L.leg.rotation.x = onGround ? ph * (0.15 + run * 0.6) : i < 2 ? -0.9 : 0.9;
      L.low.rotation.x = Math.max(0, -ph) * 0.5;
    });
    this.torso.position.y = 1.15 + Math.abs(Math.cos(this.phase)) * 0.12 * run;
    this.graze = damp(this.graze, speed < 0.3 ? 1 : 0, 2, dt);
    this.neck.rotation.x = this.graze * 1.4;
  }

  die() {
    this.dead = true;
    this.body.rotation.z = Math.PI / 2;
    this.body.position.y = 0.3 * this.body.scale.y;
  }
}
