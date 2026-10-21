// Third-person orbit camera: speed-reactive FOV, collision, shake, kick,
// lock-on framing, finisher close-ups and a free photo-mode camera.
import * as THREE from 'three';
import { angleDiff, clamp, damp } from './util.js';

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
    this.time = 0;
    this.finisherT = 0;
    this.roll = 0;
    this.photo = null;
  }

  lookDir() {
    const cp = Math.cos(this.pitch);
    return new THREE.Vector3(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
  }

  flatLook() {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  shake(amount, duration = 0.4) {
    this.trauma = clamp(this.trauma + amount, 0, 1);
    this.traumaDecay = 1 / Math.max(duration, 0.05);
  }

  kick(amount) {
    this.kickV = Math.max(this.kickV, amount);
  }

  finisher(target, dur) {
    this.finisherT = dur;
    this.finisherTarget = target.clone();
  }

  // free-flying photo camera
  enterPhoto() {
    this.photo = { pos: this.cam.position.clone(), yaw: this.yaw, pitch: this.pitch };
  }

  exitPhoto() {
    this.photo = null;
  }

  updatePhoto(dt, input) {
    const P = this.photo;
    const look = input.look();
    P.yaw -= look.dx;
    P.pitch = clamp(P.pitch - look.dy, -1.5, 1.5);
    const mv = input.move();
    const fwd = new THREE.Vector3(Math.sin(P.yaw) * Math.cos(P.pitch), Math.sin(P.pitch), Math.cos(P.yaw) * Math.cos(P.pitch));
    const right = new THREE.Vector3(-Math.cos(P.yaw), 0, Math.sin(P.yaw));
    const sp = (input.down('sprint') ? 40 : 10) * dt;
    P.pos.addScaledVector(fwd, mv.y * sp).addScaledVector(right, mv.x * sp);
    if (input.down('jump')) P.pos.y += sp;
    this.cam.position.copy(P.pos);
    this.cam.lookAt(P.pos.clone().add(fwd));
    this.cam.fov = damp(this.cam.fov, this.baseFov, 6, dt);
    this.cam.updateProjectionMatrix();
  }

  update(dt, player, look) {
    this.time += dt;
    this.yaw -= look.dx;
    this.pitch = clamp(this.pitch - look.dy, -1.2, 0.9);

    // lock-on: keep both the player and the target in frame
    const t = player.lockTarget;
    if (t && !t.dead) {
      const d = t.pos.clone().sub(player.pos);
      const want = Math.atan2(d.x, d.z);
      this.yaw += angleDiff(this.yaw, want) * (1 - Math.exp(-6 * dt));
      const dist = d.length();
      this.pitch = damp(this.pitch, clamp(-0.12 - 3 / Math.max(dist, 3) * 0.3, -0.5, 0.1), 3, dt);
    }

    const beast = player.isBeast;
    const hybrid = player.isHybrid;
    const speed = player.speed;
    let targetDist = (beast ? 6.5 : hybrid ? 5.2 : 4.2) + (beast ? clamp((speed - 12) / 18, 0, 1) * 2.5 : clamp((speed - 8) / 10, 0, 1) * 1.2) + (player.climbing ? 2 : 0) + (t ? 1.5 : 0);
    if (this.finisherT > 0) targetDist = 3.2;
    this.dist = damp(this.dist, targetDist, this.finisherT > 0 ? 8 : 4, dt);
    const h = player.F.eye - 0.1;
    const target = player.pos.clone().add(new THREE.Vector3(0, h, 0));
    this.focus.x = damp(this.focus.x, target.x, 25, dt);
    this.focus.z = damp(this.focus.z, target.z, 25, dt);
    this.focus.y = damp(this.focus.y, target.y, player.onGround ? 14 : 6, dt);
    if (this.focus.distanceToSquared(target) > 400) this.focus.copy(target);

    let dir = this.lookDir();
    if (this.finisherT > 0) {
      // swing round to a dramatic side-on angle
      this.finisherT -= dt;
      const side = this.finisherTarget.clone().sub(player.pos).setY(0).normalize();
      const swing = new THREE.Vector3(-side.z, -0.25, side.x).normalize();
      dir = dir.lerp(swing, 0.6).normalize();
    }
    const right = new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    const pivot = this.focus.clone().addScaledVector(right, beast ? -0.6 : -0.45);
    const back = dir.clone().multiplyScalar(-1);
    const hit = this.world.raycast(pivot, back, this.dist + 0.4, true);
    const d = Math.max(0.8, Math.min(this.dist, hit - 0.4));
    const pos = pivot.clone().addScaledVector(back, d);

    if (this.trauma > 0) {
      const s = this.trauma * this.trauma;
      const tt = this.time * 40;
      pos.x += (Math.sin(tt * 1.1) + Math.sin(tt * 2.3)) * 0.25 * s;
      pos.y += (Math.sin(tt * 1.7) + Math.sin(tt * 3.1)) * 0.25 * s;
      pos.z += (Math.sin(tt * 1.3) + Math.sin(tt * 2.9)) * 0.25 * s;
      this.trauma = Math.max(0, this.trauma - dt * this.traumaDecay);
    }
    this.cam.position.copy(pos);
    this.cam.up.set(0, 1, 0);
    this.cam.lookAt(pos.clone().add(dir));
    // tilt into wall-runs
    this.roll = damp(this.roll, player.wallRunning ? -player.root.rotation.z * 0.6 : 0, 6, dt);
    if (Math.abs(this.roll) > 0.001) this.cam.rotateZ(this.roll);

    const speedFov = clamp((speed - 8) / 24, 0, 1) * 22;
    this.kickV = Math.max(0, this.kickV - dt * 1.5);
    const fov = this.baseFov + speedFov + this.kickV * 18 + (player.frenzyT > 0 ? 6 : 0) - (this.finisherT > 0 ? 12 : 0);
    this.cam.fov = damp(this.cam.fov, fov, 6, dt);
    this.cam.updateProjectionMatrix();
  }
}
