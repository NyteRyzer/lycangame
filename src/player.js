// The player: two forms, transformation, traversal (sprint, charged leap,
// wall-climb, wall-jump, dash, slam), combat, rage and progression.
import * as THREE from 'three';
import { HumanRig, WolfRig } from './characters.js';
import { WATER_LEVEL, terrainHeight, districtAt } from './world.js';
import { angleDiff, clamp, damp, dampAngle, lerp } from './util.js';

export const SKILLS = {
  swift: { name: 'Swift Paws', max: 3, desc: '+10% beast speed per rank.' },
  hide: { name: 'Iron Hide', max: 3, desc: '-12% damage taken per rank.' },
  bloodlust: { name: 'Bloodlust', max: 2, desc: 'Heal 5% of damage dealt per rank.' },
  leap: { name: 'Moon Leap', max: 2, desc: '+20% leap power. Rank 2: jump again in mid-air.' },
  howl: { name: 'Terrible Howl', max: 2, desc: 'Howl stuns hunters. Rank 2: wider, enemies take +30% damage.' },
  silver: { name: 'Silver Tolerance', max: 2, desc: 'Reduces bonus damage from silver weapons.' },
  leash: { name: "Moon's Leash", max: 1, desc: 'Resist the full moon: you may return to human form during it.' },
};

const UP = new THREE.Vector3(0, 1, 0);

export class Player {
  constructor(game) {
    this.game = game;
    this.root = new THREE.Group();
    this.human = new HumanRig({ shirt: '#3b4a3a', pants: '#25262d', hair: '#1b130e', skin: '#b98a6a' });
    this.wolf = new WolfRig({});
    this.root.add(this.human.root, this.wolf.root);
    this.wolf.root.visible = false;
    game.scene.add(this.root);
    // soft moonlit fill so the beast reads against the dark city
    this.fill = new THREE.PointLight(0xaabbee, 0, 16, 1.4);
    this.fill.position.set(0, 4.5, -2.5);
    this.root.add(this.fill);

    this.pos = new THREE.Vector3(0, 0, 24);
    this.vel = new THREE.Vector3();
    this.yaw = Math.PI; // facing -z (into the city)
    this.form = 'human';
    this.transformT = 0;
    this.transformTo = null;
    this.transformCooldown = 0;
    this.onGround = true;
    this.climbing = false;
    this.climbDetach = 0;
    this.wallN = new THREE.Vector3();
    this.charge = 0;
    this.airJumps = 0;
    this.dashT = 0;
    this.dashCd = 0;
    this.attackCd = 0;
    this.combo = 0;
    this.comboT = 0;
    this.pounceT = 0;
    this.slamming = false;
    this.howlCd = 0;
    this.howlBuff = 0;
    this.spellCd = 0;
    this.lastHurt = 99;
    this.invuln = 0;
    this.maxFallSpeed = 0;
    this.speed = 0;
    this.healthFrac = 1;
    this.rage = 40;
    this.xp = 0;
    this.level = 1;
    this.skillPoints = 1;
    this.skills = { swift: 0, hide: 0, bloodlust: 0, leap: 0, howl: 0, silver: 0, leash: 0 };
    this.hasMoonfire = false;
    this.dead = false;
    this.respawnT = 0;
    this.kills = 0;
    this._n = new THREE.Vector3();
    this._v = new THREE.Vector3();
  }

  get isWolf() {
    return this.form === 'wolf' || (this.form === 'transforming' && this.transformTo === 'human');
  }
  get maxHealth() {
    return this.isWolf ? 260 : 100;
  }
  get health() {
    return this.healthFrac * this.maxHealth;
  }
  get radius() {
    return this.isWolf ? 0.85 : 0.4;
  }
  get height() {
    return this.isWolf ? 2.8 : 1.8;
  }
  get forward() {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }
  get eye() {
    return this.pos.clone().add(new THREE.Vector3(0, this.isWolf ? 2.6 : 1.6, 0));
  }
  get xpToNext() {
    return 80 + this.level * 70;
  }
  get damageMult() {
    const g = this.game;
    let m = this.howlBuff > 0 ? 1.25 : 1;
    if (g.world.isFullMoonNight) m *= 1.3;
    else if (g.world.isNight) m *= 1.1;
    return m;
  }

  addXP(n) {
    this.xp += n;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level += 1;
      this.skillPoints += 1;
      this.game.hud.toast(`LEVEL ${this.level} — skill point earned (Tab)`, 'gold');
      this.game.audio.chime();
    }
  }

  addRage(n) {
    this.rage = clamp(this.rage + n, 0, 100);
  }

  // ---------------------------------------------------------------- transform
  startTransform(to, forced = false) {
    if (this.form === 'transforming' || this.form === to) return false;
    if (!forced && this.transformCooldown > 0) return false;
    const w = this.game.world;
    if (to === 'human' && w.isFullMoonNight && !this.skills.leash) {
      this.game.hud.toast('The full moon will not let you go.', 'red');
      this.game.audio.bad();
      return false;
    }
    if (to === 'human' && w.isFullMoonNight && this.skills.leash) {
      if (this.rage < 30) {
        this.game.hud.toast("Moon's Leash needs 30 rage.", 'red');
        return false;
      }
      this.rage -= 30;
    }
    this.transformFrom = this.form;
    this.transformTo = to;
    this.form = 'transforming';
    this.transformT = 0;
    this.climbing = false;
    this.charge = 0;
    if (to === 'wolf') {
      this.game.audio.bones();
      setTimeout(() => this.game.audio.roar(), 650);
    } else {
      this.game.audio.whoosh();
    }
    this.game.camera.shake(to === 'wolf' ? 0.6 : 0.2, 1.2);
    this.game.events.emit('transform', { to, pos: this.pos.clone(), forced });
    return true;
  }

  _updateTransform(dt) {
    const T = this.transformTo === 'wolf' ? 1.35 : 0.9;
    this.transformT += dt;
    const k = clamp(this.transformT / T, 0, 1);
    const toWolf = this.transformTo === 'wolf';
    const w = toWolf ? k : 1 - k;
    // human body swells and shudders; beast erupts out of it
    const jitter = Math.sin(this.transformT * 60) * 0.04 * Math.sin(k * Math.PI);
    this.human.root.visible = w < 0.6;
    this.wolf.root.visible = w > 0.35;
    this.human.root.scale.set(1 + w * 0.6 + jitter, 1 + w * 0.3, 1 + w * 0.6 - jitter);
    const ws = lerp(0.55, 1, w);
    this.wolf.root.scale.set(ws + jitter, ws, ws - jitter);
    this.human.torso.rotation.x = Math.sin(k * Math.PI) * 0.8;
    this.human.armL.rotation.x = -0.4 - Math.sin(k * Math.PI);
    this.human.armR.rotation.x = -0.4 - Math.sin(k * Math.PI);
    this.wolf.howlT = toWolf && k > 0.55 ? 0.8 : 0;
    if (toWolf) this.game.fx.transformStorm(this.pos, k);
    if (k >= 1) {
      this.form = this.transformTo;
      this.transformTo = null;
      this.transformCooldown = 1.5;
      this.human.root.visible = this.form === 'human';
      this.wolf.root.visible = this.form === 'wolf';
      this.human.root.scale.setScalar(1);
      this.wolf.root.scale.setScalar(1);
      if (this.form === 'wolf') {
        // shockwave on emergence
        this.game.fx.ring(this.pos, 10, '#ffb070', 0.6);
        this.game.fx.dust(this.pos, 1.5);
        this.game.npcs.shockwave(this.pos, 7, 10, 10, this);
        this.wolf.howlT = 0;
        this.addRage(15);
      }
    }
  }

  // ---------------------------------------------------------------- damage
  takeDamage(amount, { silver = false, source = null } = {}) {
    if (this.dead || this.invuln > 0) return;
    let dmg = amount;
    if (this.form === 'transforming') dmg *= 0.5;
    if (this.isWolf) {
      dmg *= 1 - this.skills.hide * 0.12;
      if (silver) dmg *= [1.6, 1.3, 1.05][this.skills.silver];
    }
    this.healthFrac -= dmg / this.maxHealth;
    this.lastHurt = 0;
    this.addRage(dmg * 0.25);
    this.game.hud.hurt(clamp(dmg / 40, 0.2, 1));
    this.game.camera.shake(clamp(dmg / 60, 0.08, 0.4), 0.25);
    this.game.fx.blood(this.pos.clone().add(new THREE.Vector3(0, this.height * 0.6, 0)), 0.6, silver ? '#c9d6ff' : '#7a0a0a');
    if (this.healthFrac <= 0) this._die(source);
  }

  heal(amount) {
    this.healthFrac = clamp(this.healthFrac + amount / this.maxHealth, 0, 1);
  }

  _die() {
    this.dead = true;
    this.healthFrac = 0;
    this.respawnT = 5;
    (this.isWolf ? this.wolf : this.human).die();
    this.game.hud.showDeath(true);
    this.game.rep.onPlayerDeath();
  }

  _respawn() {
    this.dead = false;
    this.healthFrac = 1;
    this.human.dead = false;
    this.wolf.dead = false;
    this.human.body.rotation.set(0, 0, 0);
    this.human.body.position.set(0, 0, 0);
    this.wolf.body.rotation.set(0, 0, 0);
    this.wolf.body.position.set(0, 0, 0);
    // wake up in the forest near the ruins, as the legends say
    this.pos.set(-232, 0, -400);
    this.pos.y = terrainHeight(this.pos.x, this.pos.z) + 0.2;
    this.vel.set(0, 0, 0);
    this.form = this.game.world.isFullMoonNight ? 'wolf' : 'human';
    this.human.root.visible = this.form === 'human';
    this.wolf.root.visible = this.form === 'wolf';
    this.game.hud.showDeath(false);
    this.game.hud.toast('You wake in Northwood, naked and bloodied.', 'gray');
  }

  // ---------------------------------------------------------------- main update
  update(dt) {
    const g = this.game;
    const input = g.input;
    if (this.dead) {
      this.respawnT -= dt;
      if (this.respawnT <= 0) this._respawn();
      return;
    }
    this.transformCooldown -= dt;
    this.dashCd -= dt;
    this.attackCd -= dt;
    this.comboT -= dt;
    this.howlCd -= dt;
    this.howlBuff -= dt;
    this.spellCd -= dt;
    this.invuln -= dt;
    this.lastHurt += dt;
    this.pounceT -= dt;
    if (this.comboT <= 0) this.combo = 0;

    // forced full-moon change
    if (g.world.isFullMoonNight && this.form === 'human') {
      if (!this._moonWarned) {
        g.hud.toast('THE FULL MOON RISES. You cannot resist it.', 'red', 4);
        this._moonWarned = true;
      }
      this.startTransform('wolf', true);
    }
    if (!g.world.isFullMoonNight) this._moonWarned = false;

    if (this.form === 'transforming') {
      this._updateTransform(dt);
    } else if (input.hit('transform') && !g.paused) {
      this.startTransform(this.form === 'human' ? 'wolf' : 'human');
    }

    // regeneration: the beast heals fast out of combat
    if (this.isWolf) {
      const regen = this.lastHurt > 2.5 ? 9 : 1.5;
      this.heal(regen * dt);
      if (g.world.isFullMoonNight) this.addRage(2 * dt);
      else this.addRage(-0.6 * dt);
    } else {
      if (this.lastHurt > 5) this.heal(3 * dt);
      this.addRage(-1.5 * dt);
    }

    this._move(dt);
    if (this.form !== 'transforming') this._combat(dt);
    this._animate(dt);
  }

  _move(dt) {
    const g = this.game;
    const input = g.input;
    const world = g.world;
    const wolf = this.isWolf;
    const locked = this.form === 'transforming';
    const mv = locked ? { x: 0, y: 0 } : input.move();
    const camYaw = g.camera.yaw;
    // camera-relative wish direction
    // camera forward = (sin yaw, 0, cos yaw), camera right = (-cos yaw, 0, sin yaw)
    const wish = new THREE.Vector3(
      Math.sin(camYaw) * mv.y - Math.cos(camYaw) * mv.x,
      0,
      Math.cos(camYaw) * mv.y + Math.sin(camYaw) * mv.x,
    );
    const wishLen = Math.min(1, wish.length());
    if (wishLen > 0.01) wish.normalize();

    const sprint = input.down('sprint') && wishLen > 0.1;
    const swift = 1 + this.skills.swift * 0.1;
    const inWater = this.pos.y < WATER_LEVEL - 0.6 && terrainHeight(this.pos.x, this.pos.z) < WATER_LEVEL - 0.6;
    let maxSpeed;
    if (wolf) maxSpeed = (sprint ? 30 : 12) * swift;
    else maxSpeed = sprint ? 8.5 : 4.5;
    if (inWater) maxSpeed *= wolf ? 0.45 : 0.55;
    if (this.charge > 0) maxSpeed *= 0.25;
    this.quadPose = wolf && sprint && this.onGround && this.speed > 14;

    const hv = this._v.set(this.vel.x, 0, this.vel.z);
    const speed = hv.length();

    // ---- dash
    if (!locked && input.hit('dash') && this.dashCd <= 0) {
      const dir = wishLen > 0.1 ? wish.clone() : this.forward;
      const p = wolf ? 26 : 13;
      this.vel.x = dir.x * p;
      this.vel.z = dir.z * p;
      if (!this.onGround) this.vel.y = Math.max(this.vel.y, 2);
      this.dashT = 0.22;
      this.dashCd = wolf ? 0.8 : 1.2;
      this.invuln = 0.25;
      g.audio.whoosh();
      g.fx.dust(this.pos, 0.5);
    }
    this.dashT -= dt;

    // ---- climbing
    if (this.climbing) {
      this._climb(dt, wish, wishLen, input);
      return;
    }

    // ---- ground / air acceleration with momentum (weighty at speed)
    if (this.dashT <= 0) {
      const target = wish.clone().multiplyScalar(maxSpeed * wishLen);
      let accel;
      if (this.onGround) {
        accel = wolf ? (sprint ? 3.2 : 9) : 12;
        // building to top speed takes a moment; braking is snappier
        if (target.lengthSq() < hv.lengthSq()) accel = wolf ? 6 : 14;
      } else {
        accel = wolf ? 1.6 : 1.2;
      }
      // at high speed, sharp turns cost momentum (drift feel)
      if (this.onGround && speed > 15 && wishLen > 0.1) {
        const turn = 1 - hv.clone().normalize().dot(wish);
        if (turn > 0.6) accel *= 2.2;
      }
      const t = 1 - Math.exp(-accel * dt);
      this.vel.x += (target.x - this.vel.x) * t;
      this.vel.z += (target.z - this.vel.z) * t;
    }

    // ---- jump / charged leap
    const leapMult = 1 + this.skills.leap * 0.2;
    if (!locked) {
      if (wolf && this.onGround && input.down('jump')) {
        this.charge = Math.min(1, this.charge + dt * 1.15);
        if (this.charge > 0.15 && Math.random() < 0.3) g.fx.dust(this.pos, 0.15);
      }
      if (wolf && this.onGround && this.charge > 0 && input.released_('jump')) {
        const c = this.charge;
        this.charge = 0;
        if (c < 0.18) {
          this.vel.y = 11.5 * leapMult;
        } else {
          // a charged leap launches along the camera's look direction
          const look = g.camera.lookDir();
          const fwd = new THREE.Vector3(look.x, 0, look.z).normalize();
          const up = 12 + c * 22;
          const out = 8 + c * 26;
          this.vel.y = up * leapMult;
          this.vel.x = fwd.x * out * leapMult + this.vel.x * 0.3;
          this.vel.z = fwd.z * out * leapMult + this.vel.z * 0.3;
          this.yaw = Math.atan2(fwd.x, fwd.z);
          g.audio.whoosh();
          g.camera.kick(0.25 + c * 0.3);
          g.fx.dust(this.pos, 1 + c);
          g.fx.ring(this.pos, 4 + c * 6, '#b8b0a0', 0.4);
        }
        this.onGround = false;
        this.airJumps = this.skills.leap >= 2 ? 1 : 0;
      } else if (!wolf && this.onGround && input.hit('jump')) {
        this.vel.y = 6;
        this.onGround = false;
      } else if (wolf && !this.onGround && input.hit('jump') && this.airJumps > 0) {
        this.airJumps--;
        this.vel.y = 13;
        const look = g.camera.lookDir();
        this.vel.x += look.x * 6;
        this.vel.z += look.z * 6;
        g.audio.whoosh();
        g.fx.ring(this.pos, 3, '#9fc7ff', 0.3);
      }
      if (!this.onGround) this.charge = 0;
    }

    // ---- gravity
    const gravity = wolf ? 32 : 22;
    if (inWater) {
      this.vel.y = damp(this.vel.y, (WATER_LEVEL - 0.9 - this.pos.y) * 3, 4, dt);
    } else {
      this.vel.y -= gravity * dt;
    }
    if (this.slamming) this.vel.y = Math.min(this.vel.y, -45);
    this.vel.y = Math.max(this.vel.y, -70);
    if (!this.onGround) this.maxFallSpeed = Math.min(this.maxFallSpeed, this.vel.y);

    // ---- integrate in sub-steps (fast wolf must not tunnel through walls)
    const steps = Math.ceil((this.vel.length() * dt) / 0.4) || 1;
    const sdt = dt / steps;
    let wallHit = false;
    for (let i = 0; i < steps; i++) {
      this.pos.x += this.vel.x * sdt;
      this.pos.z += this.vel.z * sdt;
      this.pos.y += this.vel.y * sdt;
      this._n.set(0, 0, 0);
      this._n.top = 0;
      this._n.tree = false;
      if (world.collide(this.pos, this.radius, this.height, 0.6, this._n)) {
        wallHit = true;
        // kill velocity into the wall
        const into = this.vel.x * this._n.x + this.vel.z * this._n.z;
        if (into < 0) {
          this.vel.x -= this._n.x * into;
          this.vel.z -= this._n.z * into;
        }
        this.wallN.copy(this._n);
        this.wallN.top = this._n.top;
        this.wallN.tree = this._n.tree;
      }
      const gy = world.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.1, 0.7);
      if (this.pos.y <= gy && this.vel.y <= 0) {
        if (!this.onGround) this._land(-this.maxFallSpeed);
        this.pos.y = gy;
        this.vel.y = 0;
        this.onGround = true;
        this.maxFallSpeed = 0;
      } else if (this.pos.y > gy + 0.35) {
        this.onGround = false;
      } else if (this.onGround && this.vel.y <= 0) {
        this.pos.y = gy; // stick to slopes / steps
      }
    }
    // world bounds
    const B = 690;
    this.pos.x = clamp(this.pos.x, -B, B);
    this.pos.z = clamp(this.pos.z, -B, B);

    // ---- start a climb: beast pushing into a wall
    if (wolf && wallHit && !locked && this.climbDetach <= 0 && wishLen > 0.3) {
      const intoWall = -(wish.x * this.wallN.x + wish.z * this.wallN.z);
      const tall = this.wallN.top - this.pos.y > 1.6;
      if (intoWall > 0.55 && tall) {
        this.climbing = true;
        this.onGround = false;
        this.vel.set(0, 0, 0);
        this.yaw = Math.atan2(-this.wallN.x, -this.wallN.z);
        g.fx.dust(this.pos.clone().add(new THREE.Vector3(0, 1, 0)), 0.4);
      }
    }
    this.climbDetach -= dt;

    // ---- facing
    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.speed = hs;
    if (this.attackLockT > 0) {
      this.attackLockT -= dt;
    } else if (wishLen > 0.1 && !locked) {
      const targetYaw = Math.atan2(wish.x, wish.z);
      this.yaw = dampAngle(this.yaw, targetYaw, wolf && hs > 15 ? 7 : 14, dt);
    }
  }

  _climb(dt, wish, wishLen, input) {
    const g = this.game;
    const world = g.world;
    const n = this.wallN;
    const sprint = input.down('sprint');
    const intoWall = -(wish.x * n.x + wish.z * n.z);
    // wall jump
    if (input.hit('jump')) {
      this.climbing = false;
      this.climbDetach = 0.35;
      const lat = wish.clone().addScaledVector(n, -wish.dot(n));
      this.vel.set(n.x * 13 + lat.x * 8, 14, n.z * 13 + lat.z * 8);
      this.yaw = Math.atan2(this.vel.x, this.vel.z);
      g.audio.whoosh();
      g.fx.dust(this.pos.clone().add(new THREE.Vector3(0, 1, 0)), 0.5);
      return;
    }
    // ascend while pushing into the wall; slide if released
    let vy;
    if (intoWall > 0.3) vy = sprint ? 17 : 11;
    else if (wishLen < 0.1) vy = -1.5;
    else vy = -4;
    // allow sideways scuttling along the wall
    const lat = wish.clone().addScaledVector(n, -wish.dot(n)).multiplyScalar(6);
    this.pos.x += lat.x * dt - n.x * dt * 2;
    this.pos.z += lat.z * dt - n.z * dt * 2;
    this.pos.y += vy * dt;
    this.speed = Math.abs(vy);
    this.vel.set(0, vy, 0);
    this._n.set(0, 0, 0);
    this._n.top = 0;
    const touching = world.collide(this.pos, this.radius + 0.15, this.height, 0.2, this._n);
    if (touching) {
      this.wallN.copy(this._n);
      this.wallN.top = this._n.top;
    }
    const gy = world.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.1, 0.5);
    if (this.pos.y <= gy) {
      this.pos.y = gy;
      this.climbing = false;
      this.onGround = true;
      this.climbDetach = 0.3;
      return;
    }
    if (!touching) {
      // reached the top edge: mantle over onto the roof
      this.climbing = false;
      this.climbDetach = 0.4;
      this.vel.set(-n.x * 7, 8, -n.z * 7);
      g.fx.dust(this.pos, 0.4);
      g.audio.land(0.6);
    }
  }

  _land(impact) {
    const g = this.game;
    if (impact > 6) g.audio.land(clamp(impact / 25, 0.3, 1.2));
    if (this.slamming || (this.isWolf && impact > 30)) {
      // ground slam: shockwave scales with fall speed
      const power = clamp(impact / 40, 0.8, 2);
      g.camera.shake(0.5 * power, 0.5);
      g.audio.slam();
      g.fx.dust(this.pos, 2.5 * power);
      g.fx.ring(this.pos, 9 * power, '#d8c8a8', 0.6);
      g.npcs.shockwave(this.pos, 6 + 3 * power, 45 * power * this.damageMult, 16, this);
      this.slamming = false;
    } else if (this.isWolf && impact > 18) {
      g.camera.shake(0.18, 0.25);
      g.fx.dust(this.pos, 0.8);
    } else if (!this.isWolf && impact > 16) {
      // humans are fragile
      this.takeDamage((impact - 16) * 6);
    }
  }

  // ---------------------------------------------------------------- combat
  _combat(dt) {
    const g = this.game;
    const input = g.input;
    if (g.paused) return;
    const wolf = this.isWolf;
    const fwd = this.forward;
    const npcs = g.npcs;
    const chest = this.pos.clone().add(new THREE.Vector3(0, wolf ? 1.6 : 1.1, 0));

    // light attack / combo / pounce
    if (input.hit('light') && this.attackCd <= 0 && !this.climbing) {
      this._faceCameraAim();
      const f = this.forward;
      if (wolf && !this.onGround && this.pounceT <= 0) {
        // pounce: dive at the nearest target in front
        const target = npcs.nearestInCone(this.pos, f, 22, 0.6);
        const dir = target ? target.pos.clone().sub(this.pos) : f.clone().setY(-0.6);
        dir.normalize();
        this.vel.copy(dir.multiplyScalar(34));
        this.pounceT = 0.8;
        this.wolf.playAttack('pounce');
        this.pouncing = 0.6;
        g.audio.roar();
        this.attackCd = 0.4;
      } else {
        this.combo = (this.combo % 3) + 1;
        this.comboT = 0.75;
        const finisher = this.combo === 3;
        const dmg = (wolf ? (finisher ? 34 : 20) : finisher ? 12 : 8) * this.damageMult;
        if (wolf) {
          this.wolf.playAttack(finisher ? 'heavy' : 'light', this.combo === 1 ? 1 : -1);
          this.vel.x += f.x * (finisher ? 9 : 5);
          this.vel.z += f.z * (finisher ? 9 : 5);
        } else {
          this.human.attackT = 0.35;
        }
        this.attackLockT = 0.25;
        g.audio.claw(finisher);
        const hits = npcs.damageInCone(chest, f, wolf ? 3.6 : 1.8, 0.35, dmg, finisher ? 14 : 5, this);
        this._onHits(hits, dmg);
        this.attackCd = wolf ? (finisher ? 0.45 : 0.24) : 0.4;
      }
    }
    if (this.pouncing > 0) {
      this.pouncing -= dt;
      const hits = npcs.damageInRadius(this.pos, 2.4, 55 * this.damageMult, 18, this, true);
      if (hits.length) {
        this.pouncing = 0;
        this._onHits(hits, 55);
        g.camera.shake(0.35, 0.3);
        g.fx.ring(this.pos, 4, '#ff6050', 0.35);
        this.vel.multiplyScalar(0.2);
      }
      if (this.onGround) this.pouncing = 0;
    }

    // heavy attack: overhead smash on the ground, dive-slam in the air
    if (input.hit('heavy') && this.attackCd <= 0 && !this.climbing) {
      this._faceCameraAim();
      const f = this.forward;
      if (wolf && !this.onGround && this.pos.y - this.game.world.groundAt(this.pos.x, this.pos.z, this.pos.y) > 3) {
        this.slamming = true;
        this.wolf.playAttack('slam');
        this.vel.x *= 0.3;
        this.vel.z *= 0.3;
        this.attackCd = 0.6;
      } else {
        const dmg = (wolf ? 48 : 14) * this.damageMult;
        if (wolf) this.wolf.playAttack('heavy');
        else this.human.attackT = 0.35;
        this.attackLockT = 0.45;
        g.audio.claw(true);
        setTimeout(() => {
          if (this.dead) return;
          const c = this.pos.clone().add(new THREE.Vector3(0, wolf ? 1.4 : 1, 0));
          const hits = npcs.damageInCone(c, this.forward, wolf ? 4.2 : 1.9, 0.1, dmg, wolf ? 22 : 6, this);
          this._onHits(hits, dmg);
          if (wolf) {
            g.fx.dust(this.pos.clone().addScaledVector(this.forward, 2.5), 0.6);
            g.camera.shake(0.2, 0.2);
          }
        }, wolf ? 220 : 150);
        this.attackCd = wolf ? 0.7 : 0.6;
      }
    }

    // howl
    if (wolf && input.hit('howl') && this.howlCd <= 0 && this.onGround) {
      this.howlCd = 14;
      this.howlBuff = 10;
      this.wolf.howlT = 1.6;
      g.audio.howl(1);
      g.camera.shake(0.12, 1.5);
      g.fx.ring(this.pos, 30 + this.skills.howl * 10, '#c8d8ff', 1.4);
      npcs.howl(this.pos, 30 + this.skills.howl * 12, this.skills.howl);
      this.addRage(20);
      g.events.emit('howl', { pos: this.pos.clone() });
    } else if (!wolf && input.hit('howl')) {
      g.hud.toast('Only the beast can howl. (F to transform)', 'gray', 1.5);
    }

    // Moonfire (ancient magic from the shrine)
    if (input.hit('spell')) {
      if (!this.hasMoonfire) g.hud.toast('You have not learned any magic. Seek the Ancient Ruins.', 'gray', 2);
      else if (this.spellCd > 0) { /* cooling */ }
      else if (this.rage < 30) g.hud.toast('Not enough rage (30).', 'red', 1.2);
      else {
        this.rage -= 30;
        this.spellCd = 1.2;
        const from = this.eye.addScaledVector(this.forward, 1);
        g.npcs.spawnProjectile({ from, dir: g.camera.lookDir(), speed: 45, owner: 'player', damage: 65 * this.damageMult, radius: 5, color: '#7fb2ff', magic: true });
        g.audio.magic();
      }
    }

    // feed on the fallen (beast only)
    if (wolf && input.hit('interact')) {
      const corpse = npcs.nearestCorpse(this.pos, 3.5);
      if (corpse) {
        npcs.consume(corpse);
        this.heal(70);
        this.addRage(25);
        this.wolf.playAttack('heavy');
        g.audio.claw(true);
        g.fx.blood(corpse.pos.clone().add(new THREE.Vector3(0, 0.4, 0)), 1.5);
        g.rep.onFeed(corpse);
      }
    }
  }

  _faceCameraAim() {
    // when attacking, snap to the camera direction (or the closest enemy ahead)
    const look = this.game.camera.lookDir();
    const f = new THREE.Vector3(look.x, 0, look.z).normalize();
    const t = this.game.npcs.nearestInCone(this.pos, f, this.isWolf ? 7 : 4, 0.5, true);
    if (t) {
      const d = t.pos.clone().sub(this.pos);
      this.yaw = Math.atan2(d.x, d.z);
    } else {
      this.yaw = Math.atan2(f.x, f.z);
    }
  }

  _onHits(hits, dmg) {
    if (!hits.length) return;
    const g = this.game;
    this.addRage(hits.length * 4);
    if (this.skills.bloodlust) this.heal(dmg * hits.length * 0.05 * this.skills.bloodlust * (this.isWolf ? 2.6 : 1));
    g.audio.hit();
    g.hitstop = 0.05;
  }

  _animate(dt) {
    this.fill.intensity = this.game.world.nightFactor * 22;
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    if (this.human.root.visible) {
      this.human.animate(dt, { speed: this.speed, onGround: this.onGround });
    }
    if (this.wolf.root.visible) {
      this.wolf.animate(dt, {
        speed: this.speed,
        onGround: this.onGround,
        quad: this.quadPose || this.charge > 0.2,
        climbing: this.climbing,
        vy: this.vel.y,
        charge: this.charge,
      });
      this.wolf.setEyeIntensity(this.game.world.isNight ? 6 : 2);
      // lean into turns
      this.wolf.root.rotation.z = damp(this.wolf.root.rotation.z, clamp(angleDiff(this._lastYaw ?? this.yaw, this.yaw) / dt, -3, 3) * -0.06, 8, dt);
    }
    this._lastYaw = this.yaw;
  }

  get district() {
    return districtAt(this.pos.x, this.pos.z);
  }

  serialize() {
    return {
      xp: this.xp, level: this.level, skillPoints: this.skillPoints, skills: this.skills,
      hasMoonfire: this.hasMoonfire, pos: [this.pos.x, this.pos.y, this.pos.z], kills: this.kills,
    };
  }

  load(d) {
    if (!d) return;
    Object.assign(this, { xp: d.xp, level: d.level, skillPoints: d.skillPoints, hasMoonfire: d.hasMoonfire, kills: d.kills || 0 });
    Object.assign(this.skills, d.skills || {});
    if (d.pos) this.pos.set(d.pos[0], d.pos[1] + 1, d.pos[2]);
  }
}
