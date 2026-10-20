// Particle bursts, blood, shockwave rings, tracers and the transformation storm.
import * as THREE from 'three';
import { rand } from './util.js';

const MAX = 1500;

export class FX {
  constructor(scene) {
    this.scene = scene;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      uniforms: { scale: { value: 600 } },
      vertexShader: `attribute float size; varying vec3 vColor; uniform float scale;
        void main(){ vColor = color; vec4 mv = modelViewMatrix * vec4(position,1.0);
        gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vColor; void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c);
        if (d > 0.5) discard; gl_FragColor = vec4(vColor, smoothstep(0.5, 0.15, d)); }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.parts = [];
    for (let i = 0; i < MAX; i++) this.parts.push({ alive: false });
    this.cursor = 0;
    this.rings = [];
    this.tracers = [];
    this.ringGeo = new THREE.RingGeometry(0.85, 1, 48);
    this.ringGeo.rotateX(-Math.PI / 2);
  }

  spawn(p, v, color, size, life, gravity = -9.8, drag = 1) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX;
    const o = this.parts[i];
    o.alive = true;
    o.x = p.x; o.y = p.y; o.z = p.z;
    o.vx = v.x; o.vy = v.y; o.vz = v.z;
    o.r = color.r; o.g = color.g; o.b = color.b;
    o.size = size;
    o.life = o.max = life;
    o.grav = gravity;
    o.drag = drag;
  }

  burst(p, { count = 20, color = new THREE.Color('#ffffff'), speed = 5, size = 0.4, life = 0.8, gravity = -9.8, up = 2, spread = 1 } = {}) {
    const v = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      v.set(rand(-1, 1) * spread, rand(0, 1) + up / Math.max(speed, 0.01), rand(-1, 1) * spread).normalize().multiplyScalar(speed * rand(0.4, 1));
      const c = color.clone().multiplyScalar(rand(0.7, 1.2));
      this.spawn(p, v, c, size * rand(0.6, 1.3), life * rand(0.6, 1.2), gravity);
    }
  }

  blood(p, amount = 1, color = '#8a0a0a') {
    this.burst(p, { count: Math.floor(14 * amount), color: new THREE.Color(color), speed: 6, size: 0.25, life: 0.7, up: 3 });
  }

  dust(p, amount = 1) {
    this.burst(p, { count: Math.floor(18 * amount), color: new THREE.Color('#8a8070'), speed: 4 * amount, size: 0.9, life: 0.9, gravity: 1, up: 0.5 });
  }

  sparks(p) {
    this.burst(p, { count: 12, color: new THREE.Color('#ffd27a'), speed: 9, size: 0.15, life: 0.35, gravity: -15 });
  }

  // swirling dark mist + embers around a transforming body
  transformStorm(p, t) {
    for (let i = 0; i < 6; i++) {
      const a = rand(0, Math.PI * 2), r = rand(0.5, 2.2);
      const q = new THREE.Vector3(p.x + Math.cos(a) * r, p.y + rand(0, 2.8), p.z + Math.sin(a) * r);
      const v = new THREE.Vector3(-Math.sin(a) * 4, rand(1, 4), Math.cos(a) * 4);
      const ember = Math.random() < 0.3;
      this.spawn(q, v, ember ? new THREE.Color('#ffb040') : new THREE.Color(0.05 + t * 0.1, 0.04, 0.06), ember ? 0.2 : 1.2, rand(0.4, 0.9), 2);
    }
  }

  ring(p, radius, color = '#d8d0c0', life = 0.5) {
    const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
    m.position.copy(p).add(new THREE.Vector3(0, 0.15, 0));
    this.scene.add(m);
    this.rings.push({ m, life, max: life, radius });
  }

  tracer(a, b, color = '#ffe9b0') {
    const g = new THREE.BufferGeometry().setFromPoints([a, b]);
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1 }));
    this.scene.add(l);
    this.tracers.push({ l, life: 0.12 });
  }

  update(dt) {
    let n = 0;
    for (let i = 0; i < MAX; i++) {
      const o = this.parts[i];
      if (!o.alive) {
        this.size[i] = 0;
        continue;
      }
      o.life -= dt;
      if (o.life <= 0) {
        o.alive = false;
        this.size[i] = 0;
        continue;
      }
      o.vy += o.grav * dt;
      const d = Math.exp(-o.drag * dt);
      o.vx *= d; o.vz *= d;
      o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt;
      this.pos[i * 3] = o.x; this.pos[i * 3 + 1] = o.y; this.pos[i * 3 + 2] = o.z;
      this.col[i * 3] = o.r; this.col[i * 3 + 1] = o.g; this.col[i * 3 + 2] = o.b;
      this.size[i] = o.size * Math.min(1, (o.life / o.max) * 2);
      n++;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.attributes.size.needsUpdate = true;

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      const k = 1 - r.life / r.max;
      r.m.scale.setScalar(0.5 + k * r.radius);
      r.m.material.opacity = 0.8 * (1 - k);
      if (r.life <= 0) {
        this.scene.remove(r.m);
        r.m.material.dispose();
        this.rings.splice(i, 1);
      }
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      t.l.material.opacity = t.life / 0.12;
      if (t.life <= 0) {
        this.scene.remove(t.l);
        t.l.geometry.dispose();
        t.l.material.dispose();
        this.tracers.splice(i, 1);
      }
    }
    return n;
  }
}
