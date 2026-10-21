// Dynamic weather: clear skies, fog banks, rain and thunderstorms with
// lightning. Drives world fog/light/wetness and the rain sound.
import * as THREE from 'three';
import { damp, pick, rand } from './util.js';

const STATES = {
  clear: { fog: 1, light: 1, rain: 0, wet: 0, label: 'Clear' },
  fog: { fog: 0.35, light: 0.8, rain: 0, wet: 0.2, label: 'Fog' },
  rain: { fog: 0.6, light: 0.6, rain: 0.6, wet: 1, label: 'Rain' },
  storm: { fog: 0.45, light: 0.4, rain: 1, wet: 1, label: 'Thunderstorm' },
};
const DROPS = 4000;
const BOX = 60;

export class Weather {
  constructor(game) {
    this.game = game;
    this.state = 'clear';
    this.timer = rand(150, 260);
    this.cur = { ...STATES.clear };
    this.lightningT = rand(5, 12);
    const pos = new Float32Array(DROPS * 6);
    for (let i = 0; i < DROPS; i++) {
      const x = rand(-BOX, BOX), y = rand(0, BOX), z = rand(-BOX, BOX);
      pos.set([x, y, z, x, y - 0.9, z], i * 6);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rainMat = new THREE.LineBasicMaterial({ color: 0x9fb4cc, transparent: true, opacity: 0 });
    this.rain = new THREE.LineSegments(geo, this.rainMat);
    this.rain.frustumCulled = false;
    game.scene.add(this.rain);
    this.drops = pos;
  }

  get label() {
    return STATES[this.state].label;
  }

  set(state) {
    this.state = state;
    this.timer = rand(150, 300);
  }

  update(dt, focus) {
    const g = this.game;
    const w = g.world;
    this.timer -= dt;
    if (this.timer <= 0) {
      const next = { clear: ['clear', 'fog', 'rain'], fog: ['clear', 'rain'], rain: ['clear', 'storm', 'rain'], storm: ['rain', 'clear'] }[this.state];
      this.set(pick(next));
      if (this.state === 'storm') g.hud.toast('A storm rolls over Greyhaven.', 'gray', 3);
    }
    const target = STATES[this.state];
    for (const k of ['fog', 'light', 'rain', 'wet']) this.cur[k] = damp(this.cur[k], target[k], 0.25, dt);
    w.fogMul = this.cur.fog;
    w.lightMul = this.cur.light;
    w.wetness = this.cur.wet;
    w.flash = Math.max(0, w.flash - dt * 4);

    // lightning
    if (this.state === 'storm') {
      this.lightningT -= dt;
      if (this.lightningT <= 0) {
        this.lightningT = rand(5, 14);
        w.flash = 1;
        setTimeout(() => (w.flash = 0.8), 120);
        g.audio.thunder(rand(0.3, 1.8), rand(0.6, 1));
      }
    }

    // rain streaks follow the camera
    this.rainMat.opacity = this.cur.rain * 0.55;
    this.rain.visible = this.cur.rain > 0.02;
    if (this.rain.visible) {
      this.rain.position.set(focus.x, focus.y - BOX * 0.4, focus.z);
      const fall = (38 + this.cur.rain * 12) * dt;
      const d = this.drops;
      for (let i = 0; i < DROPS; i++) {
        const o = i * 6;
        d[o + 1] -= fall;
        d[o + 4] -= fall;
        if (d[o + 4] < 0) {
          d[o + 1] += BOX;
          d[o + 4] += BOX;
        }
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }
    g.audio.setRain(this.cur.rain);
  }
}
