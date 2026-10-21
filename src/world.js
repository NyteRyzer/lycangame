// Greyhaven: the procedural open world. Terrain, districts, buildings,
// forest, lake, landmarks, colliders, sky and the day / moon cycle.
import * as THREE from 'three';
import { GeoBuilder } from './geo.js';
import { clamp, fbm, lerp, mulberry32, smoothstep } from './util.js';

export const WORLD_HALF = 850;
export const WATER_LEVEL = -2.2;
const FLAT = { x0: -540, x1: 540, z0: -300, z1: 540 };
const LAKE = { x: 420, z: -110, r: 105 };
const DOWNTOWN = 275;
const MOUNT_START = 680;

export const LANDMARKS = {
  ruins: { x: -300, z: -540, name: 'Ancient Ruins' },
  lodge: { x: 660, z: 430, name: "Hunters' Lodge" },
  cathedral: { x: -420, z: 200, name: 'St. Corvin Cathedral' },
  den: { x: -600, z: -690, name: 'Blackfang Den' },
  plaza: { x: 0, z: 0, name: 'Greyhaven Plaza' },
  cemetery: { x: -160, z: 450, name: 'Hollow Hill Cemetery' },
};

export const DISTRICTS = ['Downtown', 'Suburbs', 'Industrial', 'Lakeside', 'Northwood Forest', 'Ashen Peaks'];

export function districtAt(x, z) {
  const m = Math.max(Math.abs(x), Math.abs(z));
  if (m > MOUNT_START + 20) return 'Ashen Peaks';
  if (Math.abs(x) < DOWNTOWN + 8 && Math.abs(z) < DOWNTOWN + 8) return 'Downtown';
  if (z < FLAT.z0 || x > FLAT.x1 || x < FLAT.x0 || z > FLAT.z1) return 'Northwood Forest';
  if (x < -DOWNTOWN) return 'Industrial';
  if (x > DOWNTOWN && z < 200) return 'Lakeside';
  return 'Suburbs';
}

function hills(x, z) {
  const dx = Math.max(FLAT.x0 - x, 0, x - FLAT.x1);
  const dz = Math.max(FLAT.z0 - z, 0, z - FLAT.z1);
  const hillMask = smoothstep(0, 70, Math.hypot(dx, dz));
  let h = 0;
  if (hillMask > 0) h += hillMask * Math.max(1, fbm(x / 160, z / 160, 4) * 26 + 9 + fbm(x / 40, z / 40, 2) * 3);
  const m = Math.max(Math.abs(x), Math.abs(z));
  const mount = smoothstep(MOUNT_START, WORLD_HALF, m);
  if (mount > 0) h += mount * (90 + fbm(x / 90, z / 90, 4) * 60);
  return h;
}

// Analytic terrain height so physics never needs to sample a mesh.
export function terrainHeight(x, z) {
  let h = hills(x, z);
  const ld = Math.hypot(x - LAKE.x, z - LAKE.z);
  if (ld < LAKE.r + 25) h -= 9 * smoothstep(LAKE.r + 25, LAKE.r - 15, ld);
  // flatten landmark clearings so they read clearly
  for (const l of [LANDMARKS.ruins, LANDMARKS.lodge, LANDMARKS.den]) {
    const d = Math.hypot(x - l.x, z - l.z);
    if (d < 70) {
      const base = l._h ?? (l._h = hills(l.x, l.z));
      h = lerp(base, h, smoothstep(35, 70, d));
    }
  }
  return h;
}

// ---------------------------------------------------------------------------
// Collision store: axis-aligned boxes + vertical cylinders (tree trunks),
// bucketed in a uniform grid for fast neighbourhood queries.
class ColliderGrid {
  constructor(cell = 24) {
    this.cell = cell;
    this.map = new Map();
    this.boxes = [];
    this.circles = [];
    this._stamp = 0;
  }
  _key(ix, iz) {
    return (ix * 73856093) ^ (iz * 19349663);
  }
  _insert(obj, x0, z0, x1, z1) {
    const c = this.cell;
    for (let ix = Math.floor(x0 / c); ix <= Math.floor(x1 / c); ix++) {
      for (let iz = Math.floor(z0 / c); iz <= Math.floor(z1 / c); iz++) {
        const k = this._key(ix, iz);
        let arr = this.map.get(k);
        if (!arr) this.map.set(k, (arr = []));
        arr.push(obj);
      }
    }
  }
  addBox(minX, minY, minZ, maxX, maxY, maxZ, tag = 'building') {
    const b = { type: 'box', minX, minY, minZ, maxX, maxY, maxZ, tag, _s: 0 };
    this.boxes.push(b);
    this._insert(b, minX, minZ, maxX, maxZ);
    return b;
  }
  addCircle(x, z, r, y0, y1) {
    const c = { type: 'circle', x, z, r, y0, y1, _s: 0 };
    this.circles.push(c);
    this._insert(c, x - r, z - r, x + r, z + r);
    return c;
  }
  query(x0, z0, x1, z1, out) {
    out.length = 0;
    const stamp = ++this._stamp;
    const c = this.cell;
    for (let ix = Math.floor(x0 / c); ix <= Math.floor(x1 / c); ix++) {
      for (let iz = Math.floor(z0 / c); iz <= Math.floor(z1 / c); iz++) {
        const arr = this.map.get(this._key(ix, iz));
        if (!arr) continue;
        for (const o of arr) {
          if (o._s === stamp) continue;
          o._s = stamp;
          out.push(o);
        }
      }
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// Facade textures. Each style has a day map and a night (emissive) map.
function makeFacade(style, lit) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const rnd = mulberry32((lit ? 99 : 7) + style.length * 13);
  const base = { office: '#b4b8c0', glass: '#6f8aa6', brick: '#a0583f', gothic: '#7a7480' }[style];
  // the emissive map keeps a faint base so facades read as city light at night
  g.fillStyle = lit ? '#15171c' : base;
  g.fillRect(0, 0, 256, 256);
  if (!lit) {
    for (let i = 0; i < 1600; i++) {
      const v = style === 'brick' ? 60 + rnd() * 50 : 140 + rnd() * 50;
      g.fillStyle = style === 'brick' ? `rgba(${v + 40},${v * 0.5},${v * 0.4},0.25)` : `rgba(${v},${v},${v + 5},0.2)`;
      g.fillRect(rnd() * 256, rnd() * 256, 2, 2);
    }
    if (style === 'brick') {
      g.strokeStyle = 'rgba(40,20,15,0.35)';
      for (let y = 0; y < 256; y += 8) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(256, y);
        g.stroke();
      }
    }
  }
  const litColor = () => {
    const w = rnd();
    return w < 0.65 ? '#ffcf7a' : w < 0.88 ? '#cfe3ff' : w < 0.95 ? '#ff9a5c' : '#9affc8';
  };
  if (style === 'glass') {
    // continuous glass bands with mullions
    for (let r = 0; r < 4; r++) {
      const y = r * 64 + 10;
      if (lit) {
        for (let k = 0; k < 8; k++) if (rnd() < 0.4) { g.fillStyle = litColor(); g.fillRect(k * 32 + 2, y, 28, 44); }
      } else {
        const gr = g.createLinearGradient(0, y, 0, y + 44);
        gr.addColorStop(0, '#9fc3e6');
        gr.addColorStop(1, '#23384f');
        g.fillStyle = gr;
        g.fillRect(0, y, 256, 44);
        g.fillStyle = 'rgba(30,40,50,0.8)';
        for (let k = 0; k <= 8; k++) g.fillRect(k * 32, y, 2, 44);
      }
    }
  } else {
    const cols = style === 'brick' ? 3 : 4, rows = 4;
    const cw = 256 / cols, rh = 256 / rows;
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        const x = col * cw + cw * 0.22, y = r * rh + rh * (style === 'gothic' ? 0.15 : 0.22);
        const w = cw * 0.56, h = rh * (style === 'gothic' ? 0.66 : 0.5);
        if (lit) {
          if (rnd() < (style === 'gothic' ? 0.25 : 0.38)) {
            g.fillStyle = litColor();
            g.fillRect(x, y, w, h);
          }
        } else {
          g.fillStyle = '#1d2530';
          if (style === 'gothic') {
            g.beginPath();
            g.moveTo(x, y + h);
            g.lineTo(x, y + h * 0.3);
            g.lineTo(x + w / 2, y);
            g.lineTo(x + w, y + h * 0.3);
            g.lineTo(x + w, y + h);
            g.fill();
          } else g.fillRect(x, y, w, h);
          g.fillStyle = 'rgba(160,190,220,0.18)';
          g.fillRect(x, y + h * 0.3, w, h * 0.3);
          if (style === 'brick') {
            g.fillStyle = 'rgba(230,220,200,0.6)';
            g.fillRect(x - 3, y + h, w + 6, 4); // sills
          }
        }
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function makeBillboardTexture(i) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d');
  const ads = [
    ['#1b0a2a', '#ff3cac', 'LUPINE', 'ENERGY DRINK — UNLEASH IT'],
    ['#0a1f2a', '#3cf2ff', 'GREYHAVEN', 'BANK & TRUST · SINCE 1889'],
    ['#2a0a0a', '#e8e4da', 'SILVER DAWN', 'WE PROTECT. YOU SLEEP.'],
    ['#0a2a12', '#9aff6a', 'NIGHT MARKET', 'OPEN TILL DAWN · PIER 9'],
    ['#2a200a', '#ffc23c', 'FULL MOON', 'DINER · 24 HOURS · STEAKS RARE'],
    ['#100a2a', '#a98cff', 'MISSING?', 'HAVE YOU SEEN THIS DOG? CALL 555-0199'],
  ];
  const [bg, fg, t1, t2] = ads[i % ads.length];
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 256);
  g.strokeStyle = fg;
  g.lineWidth = 8;
  g.strokeRect(10, 10, 492, 236);
  g.fillStyle = fg;
  g.font = 'bold 92px Georgia, serif';
  g.textAlign = 'center';
  g.fillText(t1, 256, 140);
  g.font = 'bold 26px sans-serif';
  g.fillText(t2, 256, 200);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeDowntownGroundTexture() {
  const size = 4096;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const s = size / (DOWNTOWN * 2 + 20); // px per unit
  const toPx = (v) => (v + DOWNTOWN + 10) * s;
  g.fillStyle = '#9a9a96'; // sidewalk concrete
  g.fillRect(0, 0, size, size);
  // sidewalk slabs
  g.strokeStyle = 'rgba(70,70,70,0.25)';
  g.lineWidth = 1;
  for (let v = 0; v < size; v += 3 * s) {
    g.beginPath(); g.moveTo(v, 0); g.lineTo(v, size); g.stroke();
    g.beginPath(); g.moveTo(0, v); g.lineTo(size, v); g.stroke();
  }
  g.fillStyle = '#2b2c30'; // asphalt
  for (const r of downtownRoads()) {
    g.fillRect(toPx(r - 7), 0, 14 * s, size);
    g.fillRect(0, toPx(r - 7), size, 14 * s);
  }
  // kerbs
  g.fillStyle = '#c8c4b8';
  for (const r of downtownRoads()) {
    for (const o of [-7.3, 7]) {
      g.fillRect(toPx(r + o), 0, 0.3 * s, size);
      g.fillRect(0, toPx(r + o), size, 0.3 * s);
    }
  }
  // lane markings
  g.strokeStyle = '#d9c25a';
  g.lineWidth = 0.35 * s;
  g.setLineDash([3 * s, 3 * s]);
  for (const r of downtownRoads()) {
    g.beginPath(); g.moveTo(toPx(r), 0); g.lineTo(toPx(r), size); g.stroke();
    g.beginPath(); g.moveTo(0, toPx(r)); g.lineTo(size, toPx(r)); g.stroke();
  }
  g.setLineDash([]);
  // crosswalks
  g.fillStyle = '#e8e8e8';
  for (const rx of downtownRoads()) {
    for (const rz of downtownRoads()) {
      for (let i = -5; i <= 5; i += 2) {
        g.fillRect(toPx(rx + i), toPx(rz - 9.5), 1 * s, 2.5 * s);
        g.fillRect(toPx(rx + i), toPx(rz + 7), 1 * s, 2.5 * s);
        g.fillRect(toPx(rx - 9.5), toPx(rz + i), 2.5 * s, 1 * s);
        g.fillRect(toPx(rx + 7), toPx(rz + i), 2.5 * s, 1 * s);
      }
    }
  }
  // asphalt stains
  for (let i = 0; i < 400; i++) {
    g.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.1})`;
    g.beginPath();
    g.arc(Math.random() * size, Math.random() * size, Math.random() * 3 * s, 0, Math.PI * 2);
    g.fill();
  }
  // plaza
  g.fillStyle = '#6f7a5c';
  g.fillRect(toPx(-15.5), toPx(-15.5), 31 * s, 31 * s);
  g.fillStyle = '#b7aa8f';
  g.beginPath();
  g.arc(toPx(0), toPx(0), 9 * s, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function downtownRoads() {
  const out = [];
  for (let r = -DOWNTOWN + 5; r <= DOWNTOWN; r += 45) out.push(r);
  return out; // -270, -225, ..., 270
}

// ---------------------------------------------------------------------------
export class World {
  constructor(scene) {
    this.scene = scene;
    this.colliders = new ColliderGrid();
    this.time = 20.5; // hours
    this.day = 1; // the first full moon rises on the second night
    this.dayLengthSec = 720; // real seconds per in-game day
    this.spawnPoints = { sidewalks: [], forest: [], rooftops: [], graves: [] };
    this.propSpots = []; // street furniture for the prop system
    this.parkingSpots = []; // kerbside parking for the traffic system
    this.vantages = [];
    this.moonstones = [];
    this.shrine = null;
    this.safehouse = null;
    this._tmp = [];
    this.rnd = mulberry32(1337);
    // weather hooks (driven by Weather)
    this.fogMul = 1;
    this.lightMul = 1;
    this.flash = 0;
    this.wetness = 0;

    this._buildSky();
    this._buildLights();
    this._buildTerrain();
    this._buildDowntown();
    this._buildSuburbs();
    this._buildCemetery();
    this._buildIndustrial();
    this._buildLakeside();
    this._buildForest();
    this._buildLandmarks();
    this._buildStreetLights();
    this._placeVantages();
    this._placeMoonstones();
    this.mapCanvas = this._buildMapImage();
    this.update(0, new THREE.Vector3());
  }

  // ---------------- sky + lighting ----------------
  _buildSky() {
    const geo = new THREE.SphereGeometry(2200, 32, 16);
    this.skyUniforms = {
      top: { value: new THREE.Color('#0b1430') },
      bottom: { value: new THREE.Color('#283a5c') },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      sunColor: { value: new THREE.Color('#ffd28a') },
      sunVis: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunColor; uniform float sunVis; varying vec3 vDir;
        void main(){ float h = clamp(vDir.y*1.4+0.1,0.0,1.0); vec3 c = mix(bottom, top, pow(h,0.7));
          float s = max(dot(normalize(vDir), sunDir),0.0); c += sunColor * (pow(s,600.0)*2.0 + pow(s,8.0)*0.25) * sunVis;
          gl_FragColor = vec4(c,1.0); }`,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);

    const n = 2500;
    const pos = new Float32Array(n * 3);
    const r = mulberry32(5);
    for (let i = 0; i < n; i++) {
      const u = r() * 2 - 1, th = r() * Math.PI * 2;
      const y = Math.abs(u) * 0.95 + 0.05;
      const rr = Math.sqrt(1 - y * y);
      pos[i * 3] = Math.cos(th) * rr * 2000;
      pos[i * 3 + 1] = y * 2000;
      pos[i * 3 + 2] = Math.sin(th) * rr * 2000;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, fog: false, depthWrite: false });
    this.stars = new THREE.Points(sg, this.starMat);
    this.scene.add(this.stars);

    const moonTex = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const g = c.getContext('2d');
      const grd = g.createRadialGradient(128, 128, 40, 128, 128, 128);
      grd.addColorStop(0, 'rgba(255,250,235,0.55)');
      grd.addColorStop(1, 'rgba(255,250,235,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 256, 256);
      g.fillStyle = '#f4f0e2';
      g.beginPath();
      g.arc(128, 128, 52, 0, Math.PI * 2);
      g.fill();
      const rr = mulberry32(3);
      for (let i = 0; i < 18; i++) {
        g.fillStyle = `rgba(150,150,140,${0.15 + rr() * 0.25})`;
        g.beginPath();
        const a = rr() * Math.PI * 2, d = rr() * 40;
        g.arc(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 4 + rr() * 9, 0, Math.PI * 2);
        g.fill();
      }
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    this.moonMat = new THREE.SpriteMaterial({ map: moonTex, fog: false, depthWrite: false, transparent: true });
    this.moon = new THREE.Sprite(this.moonMat);
    this.moon.scale.setScalar(260);
    this.scene.add(this.moon);
  }

  _buildLights() {
    this.hemi = new THREE.HemisphereLight(0x8899cc, 0x223322, 0.6);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const s = this.sun.shadow.camera;
    s.left = -90; s.right = 90; s.top = 90; s.bottom = -90; s.near = 1; s.far = 700;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.6;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.scene.fog = new THREE.Fog(0x283a5c, 60, 650);
  }

  // ---------------- terrain ----------------
  _buildTerrain() {
    const size = WORLD_HALF * 2;
    const seg = 320;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position;
    const colors = new Float32Array(p.count * 3);
    const cGrass = new THREE.Color('#3d5a2c'), cGrass2 = new THREE.Color('#556b30');
    const cDirt = new THREE.Color('#5a4a35'), cRock = new THREE.Color('#6b6a66');
    const cSnow = new THREE.Color('#e6ecf2'), cConcrete = new THREE.Color('#6a6862');
    const cSand = new THREE.Color('#a59a76'), cLawn = new THREE.Color('#4f7a34');
    const tmp = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const h = terrainHeight(x, z);
      p.setY(i, h);
      const d = districtAt(x, z);
      const n = fbm(x / 30, z / 30, 2);
      if (d === 'Industrial') tmp.copy(cConcrete).lerp(cDirt, 0.2 + n * 0.2);
      else if (d === 'Suburbs') tmp.copy(cLawn).lerp(cGrass2, 0.5 + n * 0.5);
      else if (d === 'Downtown') tmp.copy(cConcrete);
      else tmp.copy(cGrass).lerp(cGrass2, 0.5 + n * 0.5).lerp(cDirt, clamp(n * 0.6, 0, 0.4));
      if (h > 40) tmp.lerp(cRock, smoothstep(40, 80, h));
      if (h > 120) tmp.lerp(cSnow, smoothstep(120, 150, h + n * 10));
      const ld = Math.hypot(x - LAKE.x, z - LAKE.z);
      if (ld < LAKE.r + 14) tmp.lerp(cSand, smoothstep(LAKE.r + 14, LAKE.r + 2, ld));
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    this.terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    this.terrain = new THREE.Mesh(geo, this.terrainMat);
    this.terrain.receiveShadow = true;
    this.scene.add(this.terrain);

    const wgeo = new THREE.CircleGeometry(LAKE.r + 30, 64);
    wgeo.rotateX(-Math.PI / 2);
    this.waterMat = new THREE.MeshStandardMaterial({ color: 0x1d3a52, roughness: 0.12, metalness: 0.35, transparent: true, opacity: 0.86 });
    const water = new THREE.Mesh(wgeo, this.waterMat);
    water.position.set(LAKE.x, WATER_LEVEL, LAKE.z);
    this.scene.add(water);

    const dsz = DOWNTOWN * 2 + 20;
    const dgeo = new THREE.PlaneGeometry(dsz, dsz);
    dgeo.rotateX(-Math.PI / 2);
    this.groundMat = new THREE.MeshStandardMaterial({ map: makeDowntownGroundTexture(), roughness: 0.85 });
    const dground = new THREE.Mesh(dgeo, this.groundMat);
    dground.position.y = 0.04;
    dground.receiveShadow = true;
    this.scene.add(dground);

    const roadMat = new THREE.MeshStandardMaterial({ color: 0x2b2c30, roughness: 0.9 });
    this.roadMat = roadMat;
    const roads = new GeoBuilder();
    const R = DOWNTOWN + 10;
    this.arterials = [
      [-540, -45, -R, -45], [-540, 135, -R, 135], [R, -45, 540, -45], [R, 135, 540, 135],
      [-45, R, -45, 540], [135, R, 135, 540], [-500, 400, 500, 400], [-500, 320, -500, 540],
      [330, R, 330, 540], [-330, R, -330, 540],
    ];
    for (const [x0, z0, x1, z1] of this.arterials) {
      const w = 14;
      roads.box((x0 + x1) / 2, 0.03, (z0 + z1) / 2, Math.abs(x1 - x0) || w, 0.01, Math.abs(z1 - z0) || w, { sides: false });
    }
    const rm = new THREE.Mesh(roads.build(), roadMat);
    rm.receiveShadow = true;
    this.scene.add(rm);
  }

  // ---------------- districts ----------------
  _buildDowntown() {
    const rnd = this.rnd;
    const roads = downtownRoads();
    const styles = ['office', 'glass', 'brick', 'gothic'];
    const tints = {
      office: ['#c8c3b8', '#9fa6ad', '#d6d0c4', '#8a8f99'],
      glass: ['#a8c4dc', '#8fb0c8', '#b8c8d8'],
      brick: ['#c08a6a', '#a87058', '#d09878'],
      gothic: ['#8a8490', '#7a7480'],
    };
    const builders = {};
    const bKey = (style, tint) => style + tint;
    const getB = (style, tint) => (builders[bKey(style, tint)] ||= { style, tint, g: new GeoBuilder() });
    const roofs = new GeoBuilder({ colors: true });
    const neon = new GeoBuilder({ colors: true });
    const escapes = new GeoBuilder({ colors: true });
    this.billboardSpots = [];
    this.waterTowers = [];
    const neonCols = ['#ff3cac', '#3cf2ff', '#ffc23c', '#9aff6a', '#ff5a3c', '#a98cff'];
    const roofC = new THREE.Color('#3b3d42'), ledgeC = new THREE.Color('#55575c');

    for (let i = 0; i < roads.length - 1; i++) {
      for (let j = 0; j < roads.length - 1; j++) {
        const bx0 = roads[i] + 9, bx1 = roads[i + 1] - 9;
        const bz0 = roads[j] + 9, bz1 = roads[j + 1] - 9;
        const cx = (bx0 + bx1) / 2, cz = (bz0 + bz1) / 2;
        this.spawnPoints.sidewalks.push(
          new THREE.Vector3(bx0 - 2.5, 0, cz), new THREE.Vector3(bx1 + 2.5, 0, cz),
          new THREE.Vector3(cx, 0, bz0 - 2.5), new THREE.Vector3(cx, 0, bz1 + 2.5),
        );
        // street furniture along the kerbs
        for (const [px, pz, rot] of [[bx0 - 4.6, cz, 0], [bx1 + 4.6, cz, 0], [cx, bz0 - 4.6, Math.PI / 2], [cx, bz1 + 4.6, Math.PI / 2]]) {
          const along = rot === 0 ? [0, 1] : [1, 0];
          for (let k = -1; k <= 1; k++) {
            const off = k * 9 + (rnd() - 0.5) * 3;
            const t = rnd();
            const type = t < 0.18 ? 'hydrant' : t < 0.38 ? 'bench' : t < 0.6 ? 'trash' : t < 0.72 ? 'newsbox' : t < 0.8 ? 'mailbox' : null;
            if (type) this.propSpots.push({ type, x: px + along[0] * off, z: pz + along[1] * off, rot });
          }
          // kerbside parking just off the sidewalk
          if (rnd() < 0.55) {
            const off = (rnd() - 0.5) * 10;
            const inward = rot === 0 ? (px < cx ? -2.6 : 2.6) : (pz < cz ? -2.6 : 2.6);
            const x = rot === 0 ? px + inward : px + off, z = rot === 0 ? pz + off : pz + inward;
            this.parkingSpots.push({ x, z, yaw: rot === 0 ? (rnd() < 0.5 ? 0 : Math.PI) : (rnd() < 0.5 ? Math.PI / 2 : -Math.PI / 2) });
          }
        }
        // central plaza stays open
        if (Math.abs(cx) < 30 && Math.abs(cz) < 30) continue;
        const centerFactor = 1 - clamp(Math.hypot(cx, cz) / 330, 0, 1);
        if (rnd() < 0.07) {
          this._parkBlock(bx0, bz0, bx1, bz1);
          continue;
        }
        // district flavour: gothic old town in the north-west, glass in the core
        const oldTown = cx < -60 && cz < -60 && Math.hypot(cx + 160, cz + 160) < 120;
        const splitX = rnd() < 0.65, splitZ = rnd() < 0.65;
        const xs = splitX ? [bx0, (bx0 + bx1) / 2 + (rnd() - 0.5) * 6, bx1] : [bx0, bx1];
        const zs = splitZ ? [bz0, (bz0 + bz1) / 2 + (rnd() - 0.5) * 6, bz1] : [bz0, bz1];
        for (let a = 0; a < xs.length - 1; a++) {
          for (let b = 0; b < zs.length - 1; b++) {
            // alleys between lots
            const gapX0 = a > 0 ? 2 : 0.6, gapX1 = a < xs.length - 2 ? 2 : 0.6;
            const gapZ0 = b > 0 ? 2 : 0.6, gapZ1 = b < zs.length - 2 ? 2 : 0.6;
            const lx0 = xs[a] + gapX0, lx1 = xs[a + 1] - gapX1, lz0 = zs[b] + gapZ0, lz1 = zs[b + 1] - gapZ1;
            const w = lx1 - lx0, d = lz1 - lz0;
            const lcx = (lx0 + lx1) / 2, lcz = (lz0 + lz1) / 2;
            let style;
            if (oldTown) style = rnd() < 0.7 ? 'gothic' : 'brick';
            else if (centerFactor > 0.55) style = rnd() < 0.55 ? 'glass' : 'office';
            else style = rnd() < 0.45 ? 'brick' : rnd() < 0.6 ? 'office' : 'glass';
            let h;
            if (style === 'brick') h = Math.round(10 + rnd() * 14);
            else if (style === 'gothic') h = Math.round(12 + rnd() * 16);
            else h = Math.round(16 + rnd() * 22 + centerFactor * centerFactor * (50 + rnd() * 90));
            const tintList = tints[style];
            const tint = tintList[Math.floor(rnd() * tintList.length)];
            const B = getB(style, tint);
            B.g.box(lcx, 0, lcz, w, h, d, { uvScaleX: 1 / 14, uvScaleY: 1 / 14, top: false, uvOffset: Math.floor(rnd() * 4) * 0.25 });
            roofs.box(lcx, h, lcz, w, 0.3, d, { color: roofC, sides: false });
            roofs.box(lcx, h, lcz, w + 0.6, 0.9, d + 0.6, { color: ledgeC, top: false });
            this.colliders.addBox(lx0 - 0.3, -5, lz0 - 0.3, lx1 + 0.3, h + 0.3, lz1 + 0.3);
            this.spawnPoints.rooftops.push(new THREE.Vector3(lcx, h + 0.3, lcz));
            if (style === 'gothic') {
              roofs.pyramid(lcx, h + 0.3, lcz, w * 0.9, 6 + rnd() * 6, d * 0.9, new THREE.Color('#2b2830'));
            }
            // fire escapes on brick buildings: zig-zag platforms on one side
            if (style === 'brick' && w > 8) {
              const side = rnd() < 0.5 ? -1 : 1;
              const fz = side > 0 ? lz1 + 0.9 : lz0 - 0.9;
              for (let y = 4; y < h - 2; y += 3.5) {
                escapes.box(lcx, y, fz, Math.min(6, w - 2), 0.15, 1.4, { color: new THREE.Color('#2a2a2a') });
                escapes.box(lcx, y + 0.15, fz + side * 0.65, Math.min(6, w - 2), 1, 0.06, { color: new THREE.Color('#2a2a2a'), top: false });
              }
            }
            // ground-floor neon shopfronts
            if (rnd() < 0.55 && style !== 'gothic') {
              const nc = new THREE.Color(neonCols[Math.floor(rnd() * neonCols.length)]);
              const face = Math.floor(rnd() * 4);
              const ox = face === 0 ? 0 : face === 1 ? 0 : face === 2 ? -w / 2 - 0.08 : w / 2 + 0.08;
              const oz = face === 0 ? d / 2 + 0.08 : face === 1 ? -d / 2 - 0.08 : 0;
              const sw = face < 2 ? Math.min(w * 0.6, 8) : 0.1, sd = face < 2 ? 0.1 : Math.min(d * 0.6, 8);
              neon.box(lcx + ox, 3.4, lcz + oz, sw, 0.5, sd, { color: nc });
              neon.box(lcx + ox, 0.3, lcz + oz, sw * 0.95 || 0.1, 2.6, sd * 0.95 || 0.1, { color: nc.clone().multiplyScalar(0.25), top: false });
            }
            // setback tower on tall buildings
            if (h > 55 && rnd() < 0.6) {
              const h2 = Math.round(h * (0.25 + rnd() * 0.35));
              const w2 = w * 0.6, d2 = d * 0.6;
              B.g.box(lcx, h, lcz, w2, h2, d2, { uvScaleX: 1 / 14, uvScaleY: 1 / 14, top: false });
              roofs.box(lcx, h + h2, lcz, w2, 0.3, d2, { color: roofC, sides: false });
              this.colliders.addBox(lcx - w2 / 2, h, lcz - d2 / 2, lcx + w2 / 2, h + h2 + 0.3, lcz + d2 / 2);
              if (rnd() < 0.5) roofs.box(lcx, h + h2, lcz, 0.5, 10 + rnd() * 10, 0.5, { color: new THREE.Color('#999') });
            } else if (rnd() < 0.35 && w > 10 && d > 10) {
              // billboard on the roof edge
              this.billboardSpots.push({ x: lcx, y: h + 0.9, z: lcz + d / 2 - 1.5, w: Math.min(12, w - 2) });
              this.colliders.addBox(lcx - 6, h, lcz + d / 2 - 2, lcx + 6, h + 7.5, lcz + d / 2 - 1, 'prop');
            } else if (rnd() < 0.3 && style !== 'glass') {
              this.waterTowers.push({ x: lcx + (rnd() - 0.5) * (w - 6), y: h + 0.3, z: lcz + (rnd() - 0.5) * (d - 6) });
            }
            // rooftop clutter: AC units, vents
            const props = Math.floor(rnd() * 3);
            for (let k = 0; k < props; k++) {
              const px = lcx + (rnd() - 0.5) * (w - 5), pz = lcz + (rnd() - 0.5) * (d - 5);
              const ps = 1.5 + rnd() * 2.5, ph = 1.2 + rnd() * 2;
              roofs.box(px, h + 0.3, pz, ps, ph, ps, { color: new THREE.Color(rnd() < 0.5 ? '#7c7f84' : '#5e4b3c') });
              this.colliders.addBox(px - ps / 2, h, pz - ps / 2, px + ps / 2, h + 0.3 + ph, pz + ps / 2, 'prop');
            }
            // dumpsters in alleys
            if (a > 0 && rnd() < 0.4) this.propSpots.push({ type: 'dumpster', x: xs[a] + 0.1, z: lcz + (rnd() - 0.5) * d * 0.5, rot: Math.PI / 2 });
          }
        }
      }
    }
    this.facadeTex = {};
    this.buildingMats = [];
    for (const s of styles) this.facadeTex[s] = { day: makeFacade(s, false), night: makeFacade(s, true) };
    for (const B of Object.values(builders)) {
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(B.tint),
        map: this.facadeTex[B.style].day,
        emissiveMap: this.facadeTex[B.style].night,
        emissive: new THREE.Color('#ffffff'),
        emissiveIntensity: 1,
        roughness: B.style === 'glass' ? 0.25 : 0.8,
        metalness: B.style === 'glass' ? 0.45 : 0.05,
      });
      this.buildingMats.push(mat);
      const mesh = new THREE.Mesh(B.g.build(), mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    }
    const roofMesh = new THREE.Mesh(roofs.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
    roofMesh.castShadow = roofMesh.receiveShadow = true;
    this.scene.add(roofMesh);
    const escMesh = new THREE.Mesh(escapes.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.5 }));
    escMesh.castShadow = true;
    this.scene.add(escMesh);
    this.neonMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    this.scene.add(new THREE.Mesh(neon.build(), this.neonMat));

    // billboards (lit panels)
    const bbMats = [0, 1, 2, 3, 4, 5].map((i) => new THREE.MeshStandardMaterial({ map: makeBillboardTexture(i), emissiveMap: makeBillboardTexture(i), emissive: 0xffffff, emissiveIntensity: 0.4, roughness: 0.6 }));
    this.billboardMats = bbMats;
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.6, roughness: 0.4 });
    this.billboardSpots.forEach((b, i) => {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.w * 0.5, 0.3), bbMats[i % bbMats.length]);
      panel.position.set(b.x, b.y + 2.4 + b.w * 0.25, b.z);
      panel.castShadow = true;
      this.scene.add(panel);
      for (const s of [-1, 1]) {
        const pole = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.6, 0.3), poleMat);
        pole.position.set(b.x + s * b.w * 0.35, b.y + 1.3, b.z);
        this.scene.add(pole);
      }
    });
    // water towers on old rooftops
    const tankGeo = new THREE.CylinderGeometry(2.2, 2.2, 3.4, 12);
    const capGeo = new THREE.ConeGeometry(2.4, 1.4, 12);
    const legGeo = new THREE.BoxGeometry(0.25, 3, 0.25);
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x6a4a32, roughness: 1 });
    const tanks = new THREE.InstancedMesh(tankGeo, woodMat, this.waterTowers.length || 1);
    const caps = new THREE.InstancedMesh(capGeo, new THREE.MeshStandardMaterial({ color: 0x2a2a2a }), this.waterTowers.length || 1);
    const legs = new THREE.InstancedMesh(legGeo, poleMat, (this.waterTowers.length || 1) * 4);
    const m = new THREE.Matrix4();
    this.waterTowers.forEach((t, i) => {
      m.makeTranslation(t.x, t.y + 4.7, t.z);
      tanks.setMatrixAt(i, m);
      m.makeTranslation(t.x, t.y + 7.1, t.z);
      caps.setMatrixAt(i, m);
      [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]].forEach(([ox, oz], k) => {
        m.makeTranslation(t.x + ox, t.y + 1.5, t.z + oz);
        legs.setMatrixAt(i * 4 + k, m);
      });
      this.colliders.addBox(t.x - 2.2, t.y + 3, t.z - 2.2, t.x + 2.2, t.y + 6.4, t.z + 2.2, 'prop');
    });
    tanks.count = caps.count = this.waterTowers.length;
    legs.count = this.waterTowers.length * 4;
    tanks.castShadow = caps.castShadow = true;
    this.scene.add(tanks, caps, legs);

    // plaza fountain + statue
    const stone = new THREE.MeshStandardMaterial({ color: 0x9a948a, roughness: 0.9 });
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(7, 7.5, 1, 32), stone);
    basin.position.set(0, 0.5, 0);
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.4, 6, 12), stone);
    pillar.position.set(0, 3, 0);
    for (const mm of [basin, pillar]) {
      mm.castShadow = mm.receiveShadow = true;
      this.scene.add(mm);
    }
    this.colliders.addBox(-1.4, 0, -1.4, 1.4, 6, 1.4, 'prop');

    // the safehouse: a brick walk-up a block from the plaza
    const sx = 49.5, sz = 22;
    this.safehouse = { pos: new THREE.Vector3(sx, 0, sz), name: 'Safehouse' };
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.6, 0.2), new THREE.MeshStandardMaterial({ color: 0x3a1f12, emissive: 0x000000 }));
    door.position.set(sx + 0.9, 1.3, sz);
    door.rotation.y = Math.PI / 2;
    this.scene.add(door);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.5, 1.6), new THREE.MeshBasicMaterial({ color: 0x9aff6a, toneMapped: false }));
    sign.position.set(sx + 1.0, 3.1, sz);
    this.scene.add(sign);
  }

  _parkBlock(x0, z0, x1, z1) {
    if (!this._parkTrees) this._parkTrees = [];
    for (let i = 0; i < 10; i++) {
      this._parkTrees.push([x0 + 3 + this.rnd() * (x1 - x0 - 6), z0 + 3 + this.rnd() * (z1 - z0 - 6)]);
    }
    for (let i = 0; i < 3; i++) this.propSpots.push({ type: 'bench', x: x0 + 4 + this.rnd() * (x1 - x0 - 8), z: z0 + 4 + this.rnd() * (z1 - z0 - 8), rot: this.rnd() * 3 });
  }

  _buildSuburbs() {
    const g = new GeoBuilder({ colors: true });
    const rnd = this.rnd;
    const wallCols = ['#d8cfc0', '#b9c4c9', '#c9b18f', '#e3e0d5', '#a8b59a', '#c2a2a0', '#d6c49a'];
    const roofCols = ['#5a3b32', '#3c4148', '#6b4a2e', '#40362f'];
    const C = LANDMARKS.cemetery;
    for (let x = -500; x <= 500; x += 26) {
      for (let z = DOWNTOWN + 35; z <= 525; z += 30) {
        if (Math.abs(z - 400) < 14) continue; // main street
        if ([-330, -45, 135, 330, -500].some((rx) => Math.abs(x - rx) < 12)) continue;
        if (Math.hypot(x - C.x, z - C.z) < 60) continue;
        if (rnd() < 0.15) continue;
        const w = 9 + rnd() * 4, d = 8 + rnd() * 4, h = 4 + (rnd() < 0.4 ? 3.5 : 0);
        const cx = x + (rnd() - 0.5) * 4, cz = z + (rnd() - 0.5) * 4;
        g.box(cx, 0, cz, w, h, d, { color: new THREE.Color(wallCols[Math.floor(rnd() * wallCols.length)]), top: false });
        g.pyramid(cx, h, cz, w + 1, 3.2, d + 1, new THREE.Color(roofCols[Math.floor(rnd() * roofCols.length)]));
        g.box(cx, 0, cz + d / 2 + 0.02, 1.4, 2.4, 0.05, { color: new THREE.Color('#3a2a1f'), top: false });
        // windows
        for (const ox of [-w / 3, w / 3]) g.box(cx + ox, 1.3, cz + d / 2 + 0.03, 1.4, 1.2, 0.05, { color: new THREE.Color('#e6d49a'), top: false });
        // chimney
        if (rnd() < 0.5) g.box(cx + w / 4, h, cz, 0.9, 3.4, 0.9, { color: new THREE.Color('#7a4a3a') });
        this.colliders.addBox(cx - w / 2, -2, cz - d / 2, cx + w / 2, h + 1.4, cz + d / 2, 'house');
        this.spawnPoints.sidewalks.push(new THREE.Vector3(cx + (rnd() - 0.5) * 6, 0, cz + d / 2 + 5));
        if (rnd() < 0.5) g.box(cx, 0, cz + d / 2 + 6, w + 4, 1, 0.15, { color: new THREE.Color('#e8e4da') });
        if (rnd() < 0.35) this.propSpots.push({ type: 'mailbox', x: cx + w / 2, z: cz + d / 2 + 6.5, rot: 0 });
        if (rnd() < 0.3) this.parkingSpots.push({ x: cx - w / 2 - 3, z: cz + d / 2 + 2, yaw: 0 });
      }
    }
    if (!this._parkTrees) this._parkTrees = [];
    for (let i = 0; i < 260; i++) {
      const x = -500 + rnd() * 1000, z = DOWNTOWN + 25 + rnd() * 255;
      if (this._nearBox(x, z, 2.5) || Math.abs(z - 400) < 9) continue;
      this._parkTrees.push([x, z]);
    }
    const mesh = new THREE.Mesh(g.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
    mesh.castShadow = mesh.receiveShadow = true;
    this.scene.add(mesh);
  }

  _buildCemetery() {
    const C = LANDMARKS.cemetery;
    const g = new GeoBuilder({ colors: true });
    const rnd = mulberry32(31);
    const stoneC = new THREE.Color('#8a8a86'), darkC = new THREE.Color('#55554f');
    for (let x = -40; x <= 40; x += 5) {
      for (let z = -32; z <= 32; z += 6) {
        if (Math.abs(x) < 6 || rnd() < 0.15) continue;
        const px = C.x + x + (rnd() - 0.5), pz = C.z + z + (rnd() - 0.5);
        const tall = rnd() < 0.2;
        g.box(px, 0, pz, tall ? 0.8 : 1.1, tall ? 2.4 : 1.1 + rnd() * 0.5, 0.3, { color: rnd() < 0.5 ? stoneC : darkC });
        if (tall) g.box(px, 1.7, pz, 1.4, 0.3, 0.32, { color: stoneC }); // cross arm
        this.spawnPoints.graves.push(new THREE.Vector3(px, 0, pz + 1.2));
      }
    }
    // mausoleum
    g.box(C.x, 0, C.z - 40, 10, 6, 8, { color: darkC });
    g.pyramid(C.x, 6, C.z - 40, 11, 3, 9, new THREE.Color('#3a3a36'));
    this.colliders.addBox(C.x - 5, -1, C.z - 44, C.x + 5, 7, C.z - 36, 'house');
    // iron fence
    for (let i = -46; i <= 46; i += 2) {
      for (const [fx, fz] of [[C.x + i, C.z - 48], [C.x + i, C.z + 38], [C.x - 46, C.z + i * 0.9], [C.x + 46, C.z + i * 0.9]]) {
        if (Math.abs(fx - C.x) < 5 && fz > C.z) continue; // gate
        g.box(fx, 0, fz, 0.12, 2.2, 0.12, { color: new THREE.Color('#1c1c1c') });
      }
    }
    const mesh = new THREE.Mesh(g.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
    mesh.castShadow = mesh.receiveShadow = true;
    this.scene.add(mesh);
    // eerie ground glow
    const glow = new THREE.PointLight(0x6aff9a, 18, 60, 1.4);
    glow.position.set(C.x, 3, C.z);
    this.scene.add(glow);
    this.cemeteryGlow = glow;
    // a few dead trees
    for (let i = 0; i < 14; i++) (this._parkTrees ||= []).push([C.x + (rnd() - 0.5) * 80, C.z + (rnd() - 0.5) * 64]);
  }

  _buildIndustrial() {
    const g = new GeoBuilder({ colors: true });
    const rnd = this.rnd;
    const metal = ['#6d7175', '#7a6a58', '#58636b', '#6b5e52'];
    const containerCols = ['#9b3b2b', '#2d5d8a', '#c08a2a', '#3f6e3a', '#7a7a7a'];
    for (let x = -525; x <= -DOWNTOWN - 35; x += 48) {
      for (let z = -275; z <= 270; z += 44) {
        if (Math.abs(z + 45) < 12 || Math.abs(z - 135) < 12) continue;
        if (Math.hypot(x - LANDMARKS.cathedral.x, z - LANDMARKS.cathedral.z) < 50) continue;
        if (rnd() < 0.28) {
          for (let k = 0; k < 9; k++) {
            const cx = x + (rnd() - 0.5) * 30, cz = z + (rnd() - 0.5) * 24;
            const stack = 1 + Math.floor(rnd() * 3);
            const rot = rnd() < 0.5;
            const w = rot ? 2.6 : 12, d = rot ? 12 : 2.6;
            for (let s = 0; s < stack; s++) g.box(cx, s * 2.7, cz, w, 2.6, d, { color: new THREE.Color(containerCols[Math.floor(rnd() * containerCols.length)]) });
            this.colliders.addBox(cx - w / 2, -1, cz - d / 2, cx + w / 2, stack * 2.7 - 0.1, cz + d / 2, 'prop');
          }
          // a crane over the yard
          g.box(x + 14, 0, z, 1.2, 30, 1.2, { color: new THREE.Color('#c0902a') });
          g.box(x + 4, 30, z, 26, 1.2, 1.2, { color: new THREE.Color('#c0902a') });
          this.colliders.addBox(x + 13.4, -1, z - 0.6, x + 14.6, 30, z + 0.6, 'prop');
          this.colliders.addBox(x - 9, 30, z - 0.6, x + 17, 31.2, z + 0.6, 'prop');
          continue;
        }
        const w = 28 + rnd() * 10, d = 24 + rnd() * 10, h = 9 + rnd() * 8;
        const c = new THREE.Color(metal[Math.floor(rnd() * metal.length)]);
        g.box(x, 0, z, w, h, d, { color: c });
        g.box(x, h, z, w * 0.8, 1.2, 2, { color: c.clone().multiplyScalar(0.7) });
        g.box(x, 0, z + d / 2 + 0.02, 6, 5, 0.05, { color: new THREE.Color('#3b3b3b'), top: false });
        this.colliders.addBox(x - w / 2, -2, z - d / 2, x + w / 2, h, z + d / 2);
        this.colliders.addBox(x - w * 0.4, h, z - 1, x + w * 0.4, h + 1.2, z + 1, 'prop');
        this.spawnPoints.rooftops.push(new THREE.Vector3(x, h, z));
        this.spawnPoints.sidewalks.push(new THREE.Vector3(x, 0, z + d / 2 + 4));
        if (rnd() < 0.5) this.propSpots.push({ type: 'barrel', x: x + w / 2 + 1.5, z: z + (rnd() - 0.5) * d, rot: 0 });
        if (rnd() < 0.35) {
          const sx = x + w / 2 - 3, sz = z - d / 2 + 3, sh = 25 + rnd() * 20;
          g.box(sx, h, sz, 3, sh, 3, { color: new THREE.Color('#5a4038') });
          g.box(sx, h + sh - 2, sz, 3.4, 1, 3.4, { color: new THREE.Color('#b3392b') });
          this.colliders.addBox(sx - 1.5, h, sz - 1.5, sx + 1.5, h + sh, sz + 1.5, 'prop');
        }
      }
    }
    const mesh = new THREE.Mesh(g.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.2 }));
    mesh.castShadow = mesh.receiveShadow = true;
    this.scene.add(mesh);
  }

  _buildLakeside() {
    const g = new GeoBuilder({ colors: true });
    const wood = new THREE.Color('#6b4f36');
    const docks = [[LAKE.x - LAKE.r - 6, LAKE.z, 22, 3], [LAKE.x, LAKE.z + LAKE.r + 4, 3, 22]];
    for (const [x, z, w, d] of docks) {
      const dx = w > d ? 1 : 0;
      const cx = x + (dx ? w / 2 - 4 : 0), cz = z - (dx ? 0 : d / 2 - 4);
      g.box(cx, -0.6, cz, w, 0.4, d, { color: wood });
      this.colliders.addBox(cx - w / 2, -3, cz - d / 2, cx + w / 2, -0.2, cz + d / 2, 'prop');
    }
    const rnd = this.rnd;
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + 0.2;
      const r = LAKE.r + 30 + rnd() * 12;
      const x = LAKE.x + Math.cos(a) * r, z = LAKE.z + Math.sin(a) * r;
      if (x < DOWNTOWN + 15 || x > 535 || z < -295 || z > 190) continue;
      const w = 7, d = 6, h = 3.6;
      const y = terrainHeight(x, z);
      g.box(x, y - 0.5, z, w, h + 0.5, d, { color: new THREE.Color('#7b5a3e'), top: false });
      g.pyramid(x, y + h, z, w + 1, 2.4, d + 1, new THREE.Color('#3b2e28'));
      this.colliders.addBox(x - w / 2, y - 2, z - d / 2, x + w / 2, y + h + 1, z + d / 2, 'house');
      this.spawnPoints.sidewalks.push(new THREE.Vector3(x + 6, 0, z));
    }
    const mesh = new THREE.Mesh(g.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
    mesh.castShadow = mesh.receiveShadow = true;
    this.scene.add(mesh);
  }

  _nearBox(x, z, pad) {
    const list = this.colliders.query(x - pad, z - pad, x + pad, z + pad, this._tmp);
    for (const b of list) {
      if (b.type !== 'box') continue;
      if (x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad) return true;
    }
    return false;
  }

  _buildForest() {
    const rnd = mulberry32(4242);
    const trees = [];
    for (let i = 0; i < 16000 && trees.length < 5200; i++) {
      const x = (rnd() * 2 - 1) * (WORLD_HALF - 20);
      const z = (rnd() * 2 - 1) * (WORLD_HALF - 20);
      const dist = districtAt(x, z);
      if (dist !== 'Northwood Forest' && dist !== 'Ashen Peaks') continue;
      const h = terrainHeight(x, z);
      if (h > 115 || h < WATER_LEVEL + 0.5) continue;
      if (fbm(x / 70, z / 70, 3) < -0.15) continue;
      let blocked = false;
      for (const l of Object.values(LANDMARKS)) if (Math.hypot(x - l.x, z - l.z) < 32) blocked = true;
      if (blocked) continue;
      trees.push([x, z]);
      if (rnd() < 0.04) this.spawnPoints.forest.push(new THREE.Vector3(x + 3, h, z + 3));
    }
    for (const t of this._parkTrees || []) trees.push(t);
    const n = trees.length;
    const trunkGeo = new THREE.CylinderGeometry(0.25, 0.45, 1, 6);
    trunkGeo.translate(0, 0.5, 0);
    const leafGeo = new THREE.ConeGeometry(1, 1, 7);
    leafGeo.translate(0, 0.5, 0);
    const trunk = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 1 }), n);
    const leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), n * 3);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const [x, z] = trees[i];
      const y = terrainHeight(x, z);
      const scale = 0.8 + rnd() * 0.9;
      const th = 9 * scale;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6.28);
      m.compose(p.set(x, y - 0.3, z), q, s.set(scale, th * 0.55, scale));
      trunk.setMatrixAt(i, m);
      for (let k = 0; k < 3; k++) {
        const ly = y + th * (0.22 + k * 0.24);
        const lr = (3.3 - k * 0.85) * scale;
        m.compose(p.set(x, ly, z), q, s.set(lr, th * (0.45 - k * 0.08), lr));
        leaves.setMatrixAt(i * 3 + k, m);
        col.setHSL(0.27 + rnd() * 0.06, 0.35 + rnd() * 0.15, 0.15 + rnd() * 0.08 + k * 0.02);
        leaves.setColorAt(i * 3 + k, col);
      }
      this.colliders.addCircle(x, z, 0.55 * scale, y - 2, y + th);
    }
    trunk.castShadow = leaves.castShadow = true;
    trunk.receiveShadow = leaves.receiveShadow = true;
    this.scene.add(trunk, leaves);
    this.treeCount = n;
    this.treePositions = trees;

    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    const rocks = new THREE.InstancedMesh(rockGeo, new THREE.MeshStandardMaterial({ color: 0x77736b, roughness: 1, flatShading: true }), 700);
    let rc = 0;
    for (let i = 0; i < 3000 && rc < 700; i++) {
      const x = (rnd() * 2 - 1) * (WORLD_HALF - 30), z = (rnd() * 2 - 1) * (WORLD_HALF - 30);
      const d = districtAt(x, z);
      if (d !== 'Northwood Forest' && d !== 'Ashen Peaks') continue;
      const y = terrainHeight(x, z);
      const sc = 1 + rnd() * 3.5;
      q.setFromEuler(new THREE.Euler(rnd(), rnd() * 6, rnd()));
      m.compose(p.set(x, y + sc * 0.2, z), q, s.set(sc, sc * 0.7, sc));
      rocks.setMatrixAt(rc++, m);
      if (sc > 2.2) this.colliders.addBox(x - sc * 0.7, y - 2, z - sc * 0.7, x + sc * 0.7, y + sc * 0.8, z + sc * 0.7, 'rock');
    }
    rocks.count = rc;
    rocks.castShadow = rocks.receiveShadow = true;
    this.scene.add(rocks);

    // ground cover: grass tufts around the edge of the city and in the forest
    const tuftGeo = new THREE.ConeGeometry(0.25, 0.9, 3);
    tuftGeo.translate(0, 0.45, 0);
    const tufts = new THREE.InstancedMesh(tuftGeo, new THREE.MeshStandardMaterial({ color: 0x4f6a2c, roughness: 1 }), 6000);
    let tc = 0;
    for (let i = 0; i < 20000 && tc < 6000; i++) {
      const x = (rnd() * 2 - 1) * (MOUNT_START), z = (rnd() * 2 - 1) * (MOUNT_START);
      const d = districtAt(x, z);
      if (d !== 'Northwood Forest' && d !== 'Suburbs') continue;
      if (d === 'Suburbs' && this._nearBox(x, z, 1)) continue;
      const y = terrainHeight(x, z);
      if (y < WATER_LEVEL + 0.3 || y > 60) continue;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6);
      const sc = 0.6 + rnd() * 0.8;
      m.compose(p.set(x, y, z), q, s.set(sc, sc, sc));
      tufts.setMatrixAt(tc++, m);
    }
    tufts.count = tc;
    tufts.receiveShadow = true;
    this.scene.add(tufts);
  }

  _buildLandmarks() {
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8a857a, roughness: 1, flatShading: true });
    const R = LANDMARKS.ruins;
    const ry = terrainHeight(R.x, R.z);
    const g = new GeoBuilder();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const x = R.x + Math.cos(a) * 18, z = R.z + Math.sin(a) * 18;
      const h = i % 3 === 0 ? 3 : 7 + (i % 2) * 2;
      const y = terrainHeight(x, z);
      g.box(x, y - 1, z, 2, h + 1, 2);
      this.colliders.addBox(x - 1, y - 2, z - 1, x + 1, y + h, z + 1, 'ruin');
      if (i % 2 === 0 && h > 5) {
        const a2 = ((i + 1) / 12) * Math.PI * 2;
        const x2 = R.x + Math.cos(a2) * 18, z2 = R.z + Math.sin(a2) * 18;
        g.box((x + x2) / 2, y + h, (z + z2) / 2, Math.abs(x2 - x) + 2, 1.2, Math.abs(z2 - z) + 2);
      }
    }
    g.box(R.x, ry - 1, R.z, 8, 1.6, 8);
    this.colliders.addBox(R.x - 4, ry - 2, R.z - 4, R.x + 4, ry + 0.6, R.z + 4, 'ruin');
    const ruins = new THREE.Mesh(g.build(), stoneMat);
    ruins.castShadow = ruins.receiveShadow = true;
    this.scene.add(ruins);
    const crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.3, 0),
      new THREE.MeshStandardMaterial({ color: 0x9fc7ff, emissive: 0x4f8cff, emissiveIntensity: 2.5, roughness: 0.2 }),
    );
    crystal.position.set(R.x, ry + 2.6, R.z);
    this.scene.add(crystal);
    const glow = new THREE.PointLight(0x6fa8ff, 40, 40, 1.6);
    glow.position.copy(crystal.position);
    this.scene.add(glow);
    this.shrine = { pos: new THREE.Vector3(R.x, ry + 0.6, R.z), crystal, glow };

    const L = LANDMARKS.lodge;
    const ly = terrainHeight(L.x, L.z);
    const lg = new GeoBuilder({ colors: true });
    const logC = new THREE.Color('#5b3f29');
    lg.box(L.x, ly - 1, L.z, 16, 6, 10, { color: logC, top: false });
    lg.pyramid(L.x, ly + 5, L.z, 17, 4, 11, new THREE.Color('#2c2420'));
    this.colliders.addBox(L.x - 8, ly - 2, L.z - 5, L.x + 8, ly + 6.5, L.z + 5, 'house');
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      if (i === 7 || i === 8) continue;
      const x = L.x + Math.cos(a) * 26, z = L.z + Math.sin(a) * 26;
      const y = terrainHeight(x, z);
      lg.box(x, y - 1, z, 1.2, 5, 1.2, { color: logC });
      this.colliders.addBox(x - 2.2, y - 2, z - 2.2, x + 2.2, y + 4, z + 2.2, 'fence');
    }
    const tx = L.x - 14, tz = L.z - 12, tyy = terrainHeight(tx, tz);
    for (const [ox, oz] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) lg.box(tx + ox, tyy - 1, tz + oz, 0.4, 12, 0.4, { color: logC });
    lg.box(tx, tyy + 10, tz, 5, 0.4, 5, { color: logC });
    this.colliders.addBox(tx - 2.5, tyy + 9.6, tz - 2.5, tx + 2.5, tyy + 10.4, tz + 2.5, 'prop');
    this.lodgeTower = new THREE.Vector3(tx, tyy + 10.4, tz);
    const lodge = new THREE.Mesh(lg.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
    lodge.castShadow = lodge.receiveShadow = true;
    this.scene.add(lodge);
    const fire = new THREE.PointLight(0xff7a2a, 30, 30, 1.5);
    fire.position.set(L.x, ly + 2, L.z + 10);
    this.scene.add(fire);
    this.lodgeFire = fire;

    const C = LANDMARKS.cathedral;
    const cg = new GeoBuilder({ colors: true });
    const darkStone = new THREE.Color('#4a4650');
    cg.box(C.x, 0, C.z, 18, 20, 40, { color: darkStone });
    cg.pyramid(C.x, 20, C.z, 18, 10, 40, new THREE.Color('#2b2830'));
    cg.box(C.x, 0, C.z - 24, 9, 42, 9, { color: darkStone });
    cg.pyramid(C.x, 42, C.z - 24, 9, 16, 9, new THREE.Color('#2b2830'));
    // flying buttresses
    for (let k = -15; k <= 15; k += 7.5) for (const s of [-1, 1]) cg.box(C.x + s * 11, 0, C.z + k, 2, 14, 1.5, { color: darkStone });
    this.colliders.addBox(C.x - 9, -2, C.z - 20, C.x + 9, 22, C.z + 20);
    this.colliders.addBox(C.x - 4.5, -2, C.z - 28.5, C.x + 4.5, 42, C.z - 19.5);
    cg.box(C.x, 12, C.z + 20.05, 5, 5, 0.1, { color: new THREE.Color('#ff3040'), top: false });
    const cath = new THREE.Mesh(cg.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
    cath.castShadow = cath.receiveShadow = true;
    this.scene.add(cath);
    const redGlow = new THREE.PointLight(0xff2030, 25, 35, 1.6);
    redGlow.position.set(C.x, 12, C.z + 23);
    this.scene.add(redGlow);
    this.cathedralSpire = new THREE.Vector3(C.x, 42, C.z - 24);

    const D = LANDMARKS.den;
    const dy = terrainHeight(D.x, D.z);
    const dg = new GeoBuilder();
    dg.box(D.x - 7, dy - 1, D.z, 4, 10, 6);
    dg.box(D.x + 7, dy - 1, D.z, 4, 10, 6);
    dg.box(D.x, dy + 9, D.z, 18, 3, 6);
    this.colliders.addBox(D.x - 9, dy - 2, D.z - 3, D.x - 5, dy + 9, D.z + 3, 'rock');
    this.colliders.addBox(D.x + 5, dy - 2, D.z - 3, D.x + 9, dy + 9, D.z + 3, 'rock');
    this.colliders.addBox(D.x - 9, dy + 9, D.z - 3, D.x + 9, dy + 12, D.z + 3, 'rock');
    const den = new THREE.Mesh(dg.build(), stoneMat);
    den.castShadow = den.receiveShadow = true;
    this.scene.add(den);
  }

  _buildStreetLights() {
    const roads = downtownRoads();
    const poleGeo = new THREE.CylinderGeometry(0.1, 0.12, 6, 5);
    poleGeo.translate(0, 3, 0);
    const headGeo = new THREE.SphereGeometry(0.35, 8, 6);
    const pts = [];
    for (const r of roads) {
      for (let t = -DOWNTOWN + 25; t < DOWNTOWN; t += 22) pts.push([r + 7.8, t], [t, r + 7.8]);
    }
    for (const [x0, z0, x1, z1] of this.arterials) {
      const len = Math.hypot(x1 - x0, z1 - z0);
      for (let t = 0; t < len; t += 30) {
        const f = t / len;
        const ox = z1 === z0 ? 0 : 8, oz = z1 === z0 ? 8 : 0;
        pts.push([x0 + (x1 - x0) * f + ox, z0 + (z1 - z0) * f + oz]);
      }
    }
    const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshStandardMaterial({ color: 0x222428 }), pts.length);
    this.lampMat = new THREE.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0xffc070, emissiveIntensity: 2 });
    const heads = new THREE.InstancedMesh(headGeo, this.lampMat, pts.length);
    const m = new THREE.Matrix4();
    pts.forEach(([x, z], i) => {
      m.makeTranslation(x, 0, z);
      poles.setMatrixAt(i, m);
      m.makeTranslation(x, 6.1, z);
      heads.setMatrixAt(i, m);
    });
    poles.castShadow = true;
    this.scene.add(poles, heads);
    this.lampPositions = pts;
  }

  // ---------------- vantage points + collectibles ----------------
  _placeVantages() {
    // the tallest roof in each part of the city, plus landmarks
    const quadrants = [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]];
    const used = new Set();
    for (const [qx, qz] of quadrants) {
      let best = null;
      for (const b of this.colliders.boxes) {
        if (b.tag !== 'building') continue;
        const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
        if (Math.abs(cx) > DOWNTOWN || Math.abs(cz) > DOWNTOWN) continue;
        const inQ = qx === 0 ? Math.abs(cx) < 90 && Math.abs(cz) < 90 : Math.sign(cx) === qx && Math.sign(cz) === qz && Math.abs(cx) > 60 && Math.abs(cz) > 60;
        if (!inQ || used.has(b)) continue;
        if (!best || b.maxY > best.maxY) best = b;
      }
      if (best) {
        used.add(best);
        this.vantages.push({ pos: new THREE.Vector3((best.minX + best.maxX) / 2, best.maxY, (best.minZ + best.maxZ) / 2), name: `${['North-West', 'North-East', 'South-West', 'South-East', 'Central'][quadrants.indexOf(quadrants.find((q) => q[0] === qx && q[1] === qz))]} Spire`, done: false });
      }
    }
    this.vantages.push({ pos: this.cathedralSpire.clone(), name: 'Cathedral Spire', done: false });
    this.vantages.push({ pos: this.lodgeTower.clone(), name: 'Lodge Watchtower', done: false });
    const peak = new THREE.Vector3(-200, 0, -760);
    peak.y = terrainHeight(peak.x, peak.z);
    this.vantages.push({ pos: peak, name: 'Ashen Summit', done: false });
    // red aircraft-warning beacons on each
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff3030, toneMapped: false });
    this.beaconMat = beaconMat;
    const geo = new THREE.SphereGeometry(0.5, 8, 6);
    for (const v of this.vantages) {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4, 5), new THREE.MeshStandardMaterial({ color: 0x888888 }));
      mast.position.copy(v.pos).add(new THREE.Vector3(0, 2, 0));
      const beacon = new THREE.Mesh(geo, beaconMat);
      beacon.position.copy(v.pos).add(new THREE.Vector3(0, 4.2, 0));
      this.scene.add(mast, beacon);
      v.beacon = beacon;
    }
  }

  _placeMoonstones() {
    const rnd = mulberry32(777);
    const pts = [];
    const roofs = this.spawnPoints.rooftops;
    for (let i = 0; i < 16; i++) pts.push(roofs[Math.floor(rnd() * roofs.length)].clone().add(new THREE.Vector3(0, 1.2, 0)));
    for (let i = 0; i < 12; i++) {
      const f = this.spawnPoints.forest[Math.floor(rnd() * this.spawnPoints.forest.length)];
      if (f) pts.push(f.clone().add(new THREE.Vector3(0, 1.2, 0)));
    }
    for (let i = 0; i < 6; i++) {
      const s = this.spawnPoints.sidewalks[Math.floor(rnd() * this.spawnPoints.sidewalks.length)];
      pts.push(s.clone().add(new THREE.Vector3(0, 1.2, 0)));
    }
    for (const l of [LANDMARKS.ruins, LANDMARKS.den, LANDMARKS.cemetery, LANDMARKS.lodge]) {
      const x = l.x + 12, z = l.z + 12;
      pts.push(new THREE.Vector3(x, terrainHeight(x, z) + 1.2, z));
    }
    pts.push(this.cathedralSpire.clone().add(new THREE.Vector3(0, 17, 0)));
    pts.push(new THREE.Vector3(LAKE.x, WATER_LEVEL + 1.2, LAKE.z)); // the middle of the lake
    const geo = new THREE.OctahedronGeometry(0.45, 0);
    this.moonstoneMat = new THREE.MeshBasicMaterial({ color: 0x9fe8ff, toneMapped: false });
    this.moonstoneMesh = new THREE.InstancedMesh(geo, this.moonstoneMat, pts.length);
    this.moonstones = pts.map((p) => ({ pos: p, taken: false }));
    this.scene.add(this.moonstoneMesh);
    this._updateMoonstones(0);
  }

  _updateMoonstones(t) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    this.moonstones.forEach((st, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t * 1.5 + i);
      s.setScalar(st.taken ? 0 : 1);
      m.compose(st.pos.clone().add(new THREE.Vector3(0, Math.sin(t * 2 + i) * 0.2, 0)), q, s);
      this.moonstoneMesh.setMatrixAt(i, m);
    });
    this.moonstoneMesh.instanceMatrix.needsUpdate = true;
  }

  _buildMapImage() {
    const size = 512;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const x = (px / size) * 2 * WORLD_HALF - WORLD_HALF;
        const z = (py / size) * 2 * WORLD_HALF - WORLD_HALF;
        const h = terrainHeight(x, z);
        const d = districtAt(x, z);
        let r = 40, gg = 70, b = 40;
        if (h < WATER_LEVEL - 0.3) { r = 30; gg = 60; b = 95; }
        else if (d === 'Downtown') { r = 70; gg = 70; b = 74; }
        else if (d === 'Industrial') { r = 78; gg = 72; b = 64; }
        else if (d === 'Suburbs') { r = 60; gg = 88; b = 52; }
        else if (h > 110) { r = 200; gg = 205; b = 210; }
        else if (h > 45) { r = 100; gg = 98; b = 92; }
        const shade = 1 + (terrainHeight(x + 4, z + 4) - h) * -0.03;
        const i = (py * size + px) * 4;
        img.data[i] = clamp(r * shade, 0, 255);
        img.data[i + 1] = clamp(gg * shade, 0, 255);
        img.data[i + 2] = clamp(b * shade, 0, 255);
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    const toPx = (v) => ((v + WORLD_HALF) / (2 * WORLD_HALF)) * size;
    g.fillStyle = '#2a2a2e';
    for (const r of downtownRoads()) {
      g.fillRect(toPx(r - 7), toPx(-DOWNTOWN), (14 / (2 * WORLD_HALF)) * size, toPx(DOWNTOWN) - toPx(-DOWNTOWN));
      g.fillRect(toPx(-DOWNTOWN), toPx(r - 7), toPx(DOWNTOWN) - toPx(-DOWNTOWN), (14 / (2 * WORLD_HALF)) * size);
    }
    g.fillStyle = '#b8b2a6';
    for (const b of this.colliders.boxes) {
      if (b.tag !== 'building' && b.tag !== 'house') continue;
      g.fillRect(toPx(b.minX), toPx(b.minZ), Math.max(1, toPx(b.maxX) - toPx(b.minX)), Math.max(1, toPx(b.maxZ) - toPx(b.minZ)));
    }
    return c;
  }

  // ---------------- physics queries ----------------
  groundAt(x, z, y, stepUp = 0.6) {
    let best = terrainHeight(x, z);
    const list = this.colliders.query(x, z, x, z, this._tmp);
    for (const b of list) {
      if (b.type !== 'box') continue;
      if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) {
        if (b.maxY <= y + stepUp && b.maxY > best) best = b.maxY;
      }
    }
    return best;
  }

  // Pushes a vertical capsule (circle in XZ) out of walls. Returns true on
  // contact and writes the deepest wall's outward normal (+ top height).
  collide(pos, radius, height, stepUp = 0.6, outNormal) {
    const list = this.colliders.query(pos.x - radius, pos.z - radius, pos.x + radius, pos.z + radius, this._tmp);
    let hit = false;
    let bestDepth = 0;
    for (const o of list) {
      if (o.type === 'box') {
        if (o.maxY <= pos.y + stepUp || o.minY >= pos.y + height) continue;
        const cx = clamp(pos.x, o.minX, o.maxX), cz = clamp(pos.z, o.minZ, o.maxZ);
        const dx = pos.x - cx, dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 > radius * radius) continue;
        let nx, nz, depth;
        if (d2 < 1e-8) {
          const l = pos.x - o.minX, r = o.maxX - pos.x, f = pos.z - o.minZ, k = o.maxZ - pos.z;
          const mm = Math.min(l, r, f, k);
          if (mm === l) { nx = -1; nz = 0; } else if (mm === r) { nx = 1; nz = 0; } else if (mm === f) { nx = 0; nz = -1; } else { nx = 0; nz = 1; }
          depth = mm + radius;
        } else {
          const d = Math.sqrt(d2);
          nx = dx / d; nz = dz / d;
          depth = radius - d;
        }
        pos.x += nx * depth;
        pos.z += nz * depth;
        if (depth > bestDepth) {
          bestDepth = depth;
          if (outNormal) {
            outNormal.set(nx, 0, nz);
            outNormal.top = o.maxY;
            outNormal.tree = false;
          }
          hit = true;
        }
      } else {
        if (o.y1 <= pos.y + stepUp || o.y0 >= pos.y + height) continue;
        const dx = pos.x - o.x, dz = pos.z - o.z;
        const d = Math.hypot(dx, dz);
        const rr = radius + o.r;
        if (d >= rr || d < 1e-6) continue;
        const depth = rr - d;
        pos.x += (dx / d) * depth;
        pos.z += (dz / d) * depth;
        if (depth > bestDepth && outNormal) {
          bestDepth = depth;
          outNormal.set(dx / d, 0, dz / d);
          outNormal.top = o.y1;
          outNormal.tree = true;
          hit = true;
        }
      }
    }
    return hit;
  }

  raycast(origin, dir, maxDist, foliage = false) {
    const ex = origin.x + dir.x * maxDist, ez = origin.z + dir.z * maxDist;
    const list = this.colliders.query(Math.min(origin.x, ex), Math.min(origin.z, ez), Math.max(origin.x, ex), Math.max(origin.z, ez), this._tmp);
    let best = maxDist;
    for (const b of list) {
      if (b.type === 'circle') {
        if (!foliage) continue;
        const R = b.r * 4.5;
        const ox = origin.x - b.x, oz = origin.z - b.z;
        const a = dir.x * dir.x + dir.z * dir.z;
        if (a < 1e-9) continue;
        const bq = 2 * (ox * dir.x + oz * dir.z);
        const c = ox * ox + oz * oz - R * R;
        const disc = bq * bq - 4 * a * c;
        if (disc < 0) continue;
        const t = c < 0 ? 0 : (-bq - Math.sqrt(disc)) / (2 * a);
        if (t < 0 || t >= best) continue;
        const y = origin.y + dir.y * t;
        if (y > b.y0 + (b.y1 - b.y0) * 0.25 && y < b.y1 + 2) best = t;
        continue;
      }
      if (b.type !== 'box') continue;
      let tmin = 0, tmax = best;
      let ok = true;
      for (const [o, d, mn, mx] of [[origin.x, dir.x, b.minX, b.maxX], [origin.y, dir.y, b.minY, b.maxY], [origin.z, dir.z, b.minZ, b.maxZ]]) {
        if (Math.abs(d) < 1e-9) {
          if (o < mn || o > mx) { ok = false; break; }
        } else {
          let t1 = (mn - o) / d, t2 = (mx - o) / d;
          if (t1 > t2) [t1, t2] = [t2, t1];
          tmin = Math.max(tmin, t1);
          tmax = Math.min(tmax, t2);
          if (tmin > tmax) { ok = false; break; }
        }
      }
      if (ok && tmin < best) best = tmin;
    }
    for (let t = 0; t < best; t += 1.5) {
      const x = origin.x + dir.x * t, y = origin.y + dir.y * t, z = origin.z + dir.z * t;
      if (y < terrainHeight(x, z) + 0.3) { best = Math.max(0, t - 1.5); break; }
    }
    return best;
  }

  // ---------------- time of day ----------------
  get isNight() {
    return this.time >= 19 || this.time < 5.5;
  }
  get moonPhase() {
    // 3-night cycle: 0 waxing, 1 gibbous, 2 full. The night belongs to the day it started on.
    const d = this.time < 12 ? this.day - 1 : this.day;
    return ((d % 3) + 3) % 3;
  }
  get isFullMoonNight() {
    return this.isNight && this.moonPhase === 2;
  }
  get moonPhaseName() {
    return ['Waxing Crescent', 'Waxing Gibbous', 'FULL MOON'][this.moonPhase];
  }
  get nightFactor() {
    const t = this.time;
    if (t >= 6.5 && t <= 18) return 0;
    if (t > 18 && t < 20) return smoothstep(18, 20, t);
    if (t > 5 && t < 6.5) return 1 - smoothstep(5, 6.5, t);
    return 1;
  }

  update(dt, focus) {
    this.time += (dt / this.dayLengthSec) * 24;
    if (this.time >= 24) {
      this.time -= 24;
      this.day += 1;
    }
    const nf = this.nightFactor;
    const full = this.moonPhase === 2;
    const sunAng = ((this.time - 6) / 12) * Math.PI;
    const sunDir = new THREE.Vector3(Math.cos(sunAng), Math.sin(sunAng), 0.35).normalize();
    // the moon hangs low over the northern hills so it frames the skyline
    const moonDir = new THREE.Vector3(-Math.cos(sunAng) * 0.9, 0.42 + 0.25 * Math.max(0, -Math.sin(sunAng)), -0.75).normalize();
    this.moonDir = moonDir;
    const lightDir = nf > 0.5 ? moonDir : sunDir;
    const overcast = 1 - this.lightMul;

    const dayTop = new THREE.Color('#4f86c6'), dayBot = new THREE.Color('#bcd2e6');
    const nightTop = full ? new THREE.Color('#0a1530') : new THREE.Color('#05070f');
    const nightBot = full ? new THREE.Color('#2a3d66') : new THREE.Color('#141c2e');
    const duskBot = new THREE.Color('#d9774a');
    const grey = new THREE.Color(nf > 0.5 ? '#151820' : '#7a8088');
    const dusk = Math.max(0, 1 - Math.abs(nf - 0.5) * 2.2);
    this.skyUniforms.top.value.copy(dayTop).lerp(nightTop, nf).lerp(grey, overcast * 0.8);
    this.skyUniforms.bottom.value.copy(dayBot).lerp(nightBot, nf).lerp(duskBot, dusk * 0.6 * (1 - overcast)).lerp(grey, overcast * 0.7);
    if (this.flash > 0) {
      this.skyUniforms.top.value.lerp(new THREE.Color('#c8d0ff'), this.flash * 0.7);
      this.skyUniforms.bottom.value.lerp(new THREE.Color('#e8ecff'), this.flash * 0.7);
    }
    this.skyUniforms.sunDir.value.copy(sunDir);
    this.skyUniforms.sunVis.value = (1 - nf) * this.lightMul;
    this.scene.fog.color.copy(this.skyUniforms.bottom.value);
    this.scene.fog.near = lerp(80, 30, nf) * this.fogMul;
    this.scene.fog.far = lerp(1000, full ? 560 : 420, nf) * this.fogMul;

    this.starMat.opacity = nf * this.lightMul;
    this.moon.position.copy(focus).addScaledVector(moonDir, 1900);
    this.moon.scale.setScalar(full ? 400 : 240);
    this.moonMat.opacity = (0.3 + nf * 0.7) * (0.25 + 0.75 * this.lightMul);
    this.moonMat.color.set(full ? '#fff6e0' : '#d0d6e0');
    this.sky.position.copy(focus);
    this.stars.position.copy(focus);

    this.sun.position.copy(focus).addScaledVector(lightDir, 300);
    this.sun.target.position.copy(focus);
    this.sun.color.set(nf > 0.5 ? (full ? '#b8c8ff' : '#8090c0') : '#fff1d8');
    this.sun.intensity = (nf > 0.5 ? (full ? 1.1 : 0.45) * smoothstep(0.5, 1, nf) : 2.6 * (1 - smoothstep(0, 0.5, nf))) * (0.35 + 0.65 * this.lightMul);
    this.hemi.intensity = lerp(1.0, full ? 1.0 : 0.75, nf) + this.flash * 3;
    this.hemi.color.set(nf > 0.5 ? '#7080b8' : '#cfe0ff');
    for (const mat of this.buildingMats) mat.emissiveIntensity = nf * 0.9;
    for (const mat of this.billboardMats) mat.emissiveIntensity = 0.15 + nf * 0.9;
    this.lampMat.emissiveIntensity = nf * 3;
    this.neonMat.color.setScalar(0.35 + nf * 0.9);
    // wet streets shine in the rain
    this.groundMat.roughness = lerp(0.85, 0.25, this.wetness);
    this.roadMat.roughness = lerp(0.9, 0.2, this.wetness);
    this.terrainMat.roughness = lerp(0.95, 0.6, this.wetness);

    const t = performance.now() / 1000;
    if (this.shrine) {
      this.shrine.crystal.rotation.y += dt * 0.8;
      this.shrine.crystal.position.y = this.shrine.pos.y + 2 + Math.sin(t * 2) * 0.3;
    }
    if (this.lodgeFire) this.lodgeFire.intensity = 25 + Math.sin(t * 20) * 6 + Math.random() * 4;
    if (this.cemeteryGlow) this.cemeteryGlow.intensity = nf * (14 + Math.sin(t * 1.3) * 5);
    this.beaconMat.color.setRGB(Math.sin(t * 3) > 0 ? 1 : 0.15, 0.1, 0.1);
    this._updateMoonstones(t);
  }
}
