// Third-person orbit camera: speed-reactive FOV, collision, shake and kick.
import * as THREE from 'three';
import { clamp, damp } from './util.js';

export class CameraRig {
  constructor(camera, world) {
    this.cam = camera;
    this.world = world;
    this.yaw = Math.PI;
    this.pitch = -0.15;
    this.dist = 4.5;
    this.trauma = 0;
    this.traumaDecay = 1;
    this.kickV = 0;
    this.baseFov = 70;
    this.focus = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this.time = 0;
  }

  lookDir() {
    const cp = Math.cos(this.pitch);
    return new THREE.Vector3(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
  }

  shake(amount, duration = 0.4) {
    this.trauma = clamp(this.trauma + amount, 0, 1);
    this.traumaDecay = 1 / Math.max(duration, 0.05);
  }

  kick(amount) {
    this.kickV = Math.max(this.kickV, amount);
  }

  update(dt, player, look) {
    this.time += dt;
    this.yaw -= look.dx;
    this.pitch = clamp(this.pitch - look.dy, -1.2, 0.9);

    const wolf = player.isWolf;
    const speed = player.speed;
    const targetDist = (wolf ? 6.5 : 4.2) + (wolf ? clamp((speed - 12) / 18, 0, 1) * 2.5 : 0) + (player.climbing ? 2 : 0);
    this.dist = damp(this.dist, targetDist, 4, dt);
    const h = wolf ? 2.5 : 1.6;
    const target = player.pos.clone().add(new THREE.Vector3(0, h, 0));
    // smooth follow; vertical lag gives jumps a sense of height
    this.focus.x = damp(this.focus.x, target.x, 25, dt);
    this.focus.z = damp(this.focus.z, target.z, 25, dt);
    this.focus.y = damp(this.focus.y, target.y, player.onGround ? 14 : 6, dt);
    if (this.focus.distanceToSquared(target) > 400) this.focus.copy(target);

    const dir = this.lookDir();
    const right = new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    const pivot = this.focus.clone().addScaledVector(right, wolf ? -0.6 : -0.45);
    const back = dir.clone().multiplyScalar(-1);
    const hit = this.world.raycast(pivot, back, this.dist + 0.4, true);
    const d = Math.max(0.8, Math.min(this.dist, hit - 0.4));
    const pos = pivot.clone().addScaledVector(back, d);

    // shake
    if (this.trauma > 0) {
      const s = this.trauma * this.trauma;
      const t = this.time * 40;
      pos.x += (Math.sin(t * 1.1) + Math.sin(t * 2.3)) * 0.25 * s;
      pos.y += (Math.sin(t * 1.7) + Math.sin(t * 3.1)) * 0.25 * s;
      pos.z += (Math.sin(t * 1.3) + Math.sin(t * 2.9)) * 0.25 * s;
      this.trauma = Math.max(0, this.trauma - dt * this.traumaDecay);
    }
    this.cam.position.copy(pos);
    this.cam.lookAt(pos.clone().add(dir));

    // FOV widens at speed — the core of feeling fast
    const speedFov = clamp((speed - 8) / 24, 0, 1) * 22;
    this.kickV = Math.max(0, this.kickV - dt * 1.5);
    const fov = this.baseFov + speedFov + this.kickV * 18;
    this.cam.fov = damp(this.cam.fov, fov, 6, dt);
    this.cam.updateProjectionMatrix();
  }
}
