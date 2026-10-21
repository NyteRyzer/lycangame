// The player: three forms (human, hybrid, beast), transformation, human
// passives, traversal (sprint, charged leap, climb, wall-run, wall-jump,
// mantle, slide, dash, slam, flow) and combat (combos, block/parry,
// lock-on, grab & throw, finishers, frenzy, howl, Moonfire), rage and
// progression.
import * as THREE from 'three';
import { HumanRig, WolfRig } from './characters.js';
import { WATER_LEVEL, terrainHeight, districtAt } from './world.js';
import { angleDiff, clamp, damp, dampAngle, lerp } from './util.js';

export const SKILLS = {
  swift: { name: 'Swift Paws', max: 3, desc: '+10% speed in hybrid and beast form per rank.' },
  hide: { name: 'Iron Hide', max: 3, desc: '-12% damage taken per rank.' },
  bloodlust: { name: 'Bloodlust', max: 2, desc: 'Heal 5% of damage dealt per rank.' },
  leap: { name: 'Moon Leap', max: 2, desc: '+20% leap power. Rank 2: jump again in mid-air.' },
  howl: { name: 'Terrible Howl', max: 2, desc: 'Howl stuns hunters. Rank 2: wider, enemies take +30% damage.' },
  silver: { name: 'Silver Tolerance', max: 2, desc: 'Reduces bonus damage from silver weapons.' },
  leash: { name: "Moon's Leash", max: 1, desc: 'Resist the full moon: you may return to human form during it.' },
  parry: { name: 'Riposte', max: 2, desc: 'Wider parry window. Rank 2: parries reflect bullets back at the shooter.' },
  frenzy: { name: 'Blood Moon', max: 2, desc: 'Frenzy lasts 4s longer per rank.' },
};

// Per-form movement and combat stats.
export const FORMS = {
  human: { name: 'HUMAN', hp: 100, radius: 0.4, height: 1.8, eye: 1.6, walk: 4.5, sprint: 9, jump: 6.5, gravity: 22, climb: 0, wallRun: 0.55, reach: 2.4, light: 8, heavy: 14, range: 1.8, accel: 12 },
  hybrid: { name: 'HYBRID', hp: 180, radius: 0.55, height: 2.3, eye: 2.1, walk: 7, sprint: 18, jump: 10.5, gravity: 26, climb: 9, wallRun: 1.6, reach: 3.3, light: 15, heavy: 32, range: 2.6, accel: 10 },
  wolf: { name: 'BEAST', hp: 260, radius: 0.85, height: 2.8, eye: 2.6, walk: 12, sprint: 30, jump: 11.5, gravity: 32, climb: 11, wallRun: 1.3, reach: 3.7, light: 20, heavy: 48, range: 3.6, accel: 9 },
};

export const PASSIVES = [
  { name: 'Keen Senses', desc: 'V: see heartbeats through walls and follow the scent to your goal.' },
  { name: 'Blend In', desc: 'Heat fades 3x faster. Hunters and police ignore you below 3 heat.' },
  { name: 'Lunar Vitality', desc: 'Regenerate quickly at night.' },
  { name: 'Feral Reflexes', desc: 'A dash at the last moment slows time.' },
  { name: 'Freerunner', desc: 'Vault obstacles, mantle ledges and run along walls.' },
];

export class Player {
  constructor(game) {
    this.game = game;
    this.root = new THREE.Group();
    const look = { shirt: '#2f3d2f', pants: '#25262d', hair: '#1b130e', skin: '#b98a6a', hairStyle: 'short', coat: '#3a2c22', beard: '#2a1a10' };
    this.human = new HumanRig(look);
    this.hybrid = new HumanRig({ ...look, coat: null, hybrid: true, scale: 1.22, build: 1.15, hunch: 0.3, fur: '#5a4434', furDark: '#2e241c' });
    this.wolf = new WolfRig({});
    this.rigs = { human: this.human, hybrid: this.hybrid, wolf: this.wolf };
    this.root.add(this.human.root, this.hybrid.root, this.wolf.root);
    this.hybrid.root.visible = false;
    this.wolf.root.visible = false;
    game.scene.add(this.root);
    // soft moonlit key light from the camera side so the player always reads
    this.fill = new THREE.PointLight(0xb8c4ee, 0, 18, 1.3);
    game.scene.add(this.fill);

    this.pos = new THREE.Vector3(0, 0, 24);
    this.vel = new THREE.Vector3();
    this.yaw = Math.PI;
    this.form = 'human';
    this.lastMonsterForm = 'wolf';
    this.transformT = 0;
    this.transformTo = null;
    this.transformFrom = null;
    this.transformCooldown = 0;
    this.onGround = true;
    this.climbing = false;
    this.climbDetach = 0;
    this.wallRunning = false;
    this.wallRunT = 0;
    this.wallRunCd = 0;
    this.mantleT = 0;
    this.slideT = 0;
    this.wallN = new THREE.Vector3();
    this.charge = 0;
    this.airJumps = 0;
    this.dashT = 0;
    this.dashCd = 0;
    this.attackCd = 0;
    this.attackLockT = 0;
    this.combo = 0;
    this.comboT = 0;
    this.pounceT = 0;
    this.pouncing = 0;
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
    this.skills = Object.fromEntries(Object.keys(SKILLS).map((k) => [k, 0]));
    this.hasMoonfire = false;
    this.dead = false;
    this.respawnT = 0;
    this.kills = 0;
    this.moonstones = 0;
    this.hpBonus = 0;
    // combat state
    this.blocking = false;
    this.blockT = 0;
    this.lockTarget = null;
    this.held = null; // { kind: 'npc'|'prop', ref }
    this.frenzyT = 0;
    this.finisherT = 0;
    this.hitCount = 0;
    this.hitTimer = 0;
    this.bestCombo = 0;
    this.flow = 0;
    this.flowT = 0;
    this.senses = false;
    this.bulldozeCd = 0;
    this._n = new THREE.Vector3();
    this._v = new THREE.Vector3();
  }

  // ---------------------------------------------------------------- form queries
  get formKey() {
    if (this.form !== 'transforming') return this.form;
    // the body counts as the new form past the midpoint
    return this.transformT / this._transformDur > 0.5 ? this.transformTo : this.transformFrom;
  }
  get F() {
    return FORMS[this.formKey];
  }
  // "monstrous": anything with fur and claws
  get isWolf() {
    return this.formKey !== 'human';
  }
  get isBeast() {
    return this.formKey === 'wolf';
  }
  get isHybrid() {
    return this.formKey === 'hybrid';
  }
  get rig() {
    return this.rigs[this.formKey];
  }
  get maxHealth() {
    return Math.round(this.F.hp * (1 + this.hpBonus));
  }
  get health() {
    return this.healthFrac * this.maxHealth;
  }
  get radius() {
    return this.F.radius;
  }
  get height() {
    return this.slideT > 0 ? this.F.height * 0.55 : this.F.height;
  }
  get forward() {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }
  get eye() {
    return this.pos.clone().add(new THREE.Vector3(0, this.F.eye, 0));
  }
  get xpToNext() {
    return 80 + this.level * 70;
  }
  get comboRank() {
    const n = this.hitCount;
    if (n < 5) return 0;
    if (n < 10) return 1;
    if (n < 20) return 2;
    if (n < 35) return 3;
    if (n < 50) return 4;
    return 5;
  }
  get damageMult() {
    const g = this.game;
    let m = this.howlBuff > 0 ? 1.25 : 1;
    if (g.world.isFullMoonNight) m *= 1.3;
    else if (g.world.isNight) m *= 1.1;
    if (this.frenzyT > 0) m *= 1.6;
    return m;
  }

  addXP(n) {
    this.xp += n;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level += 1;
      this.skillPoints += 1;
      this.game.hud.toast(`LEVEL ${this.level}: skill point earned (Tab)`, 'gold');
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
    if (to === 'human' && w.isFullMoonNight) {
      if (!this.skills.leash) {
        this.game.hud.toast('The full moon will not let you go.', 'red');
        this.game.audio.bad();
        return false;
      }
      if (this.rage < 30) {
        this.game.hud.toast("Moon's Leash needs 30 rage.", 'red');
        return false;
      }
      this.rage -= 30;
    }
    this.dropHeld();
    this.transformFrom = this.form;
    this.transformTo = to;
    if (to !== 'human') this.lastMonsterForm = to;
    this.form = 'transforming';
    this.transformT = 0;
    const big = (a) => (a === 'wolf' ? 2 : a === 'hybrid' ? 1 : 0);
    const growing = big(to) > big(this.transformFrom);
    this._transformDur = to === 'wolf' && this.transformFrom === 'human' ? 1.35 : growing ? 1.0 : 0.75;
    this.climbing = false;
    this.wallRunning = false;
    this.charge = 0;
    if (growing) {
      this.game.audio.bones();
      setTimeout(() => (to === 'wolf' ? this.game.audio.roar() : this.game.audio.snarl()), this._transformDur * 480);
    } else {
      this.game.audio.whoosh();
    }
    this.game.camera.shake(growing ? 0.5 : 0.2, this._transformDur);
    this.game.events.emit('transform', { to, pos: this.pos.clone(), forced });
    return true;
  }

  _updateTransform(dt) {
    const T = this._transformDur;
    this.transformT += dt;
    const k = clamp(this.transformT / T, 0, 1);
    const from = this.rigs[this.transformFrom], to = this.rigs[this.transformTo];
    const jitter = Math.sin(this.transformT * 60) * 0.04 * Math.sin(k * Math.PI);
    from.root.visible = k < 0.6;
    to.root.visible = k > 0.35;
    const big = (a) => (a === 'wolf' ? 2 : a === 'hybrid' ? 1 : 0);
    const growing = big(this.transformTo) > big(this.transformFrom);
    // the old body strains and swells (or shrinks), the new one erupts out of it
    const fs = growing ? 1 + k * 0.5 : 1 - k * 0.35;
    from.root.scale.set(fs + jitter, fs * (growing ? 0.9 + k * 0.2 : 1), fs - jitter);
    const ts = lerp(growing ? 0.6 : 1.3, 1, k);
    to.root.scale.set(ts + jitter, ts, ts - jitter);
    if (from.torso) from.torso.rotation.x = Math.sin(k * Math.PI) * 0.8;
    if (from.armL) {
      from.armL.rotation.x = -0.4 - Math.sin(k * Math.PI);
      from.armR.rotation.x = -0.4 - Math.sin(k * Math.PI);
    }
    if (this.transformTo === 'wolf') this.wolf.howlT = k > 0.55 ? 0.8 : 0;
    if (growing) this.game.fx.transformStorm(this.pos, k);
    if (k >= 1) {
      this.form = this.transformTo;
      this.transformTo = null;
      this.transformCooldown = 1.2;
      for (const [key, r] of Object.entries(this.rigs)) {
        r.root.visible = key === this.form;
        r.root.scale.setScalar(1);
      }
      if (growing) {
        this.game.fx.ring(this.pos, this.form === 'wolf' ? 10 : 6, '#ffb070', 0.6);
        this.game.fx.dust(this.pos, 1.5);
        this.game.npcs.shockwave(this.pos, this.form === 'wolf' ? 7 : 4, 10, 10, this);
        this.game.props.shockwave(this.pos, 7, 10);
        this.wolf.howlT = 0;
        this.addRage(15);
      }
    }
  }

  // ---------------------------------------------------------------- damage
  // Returns 'parry' | 'block' | 'dodge' | 'hit' | 'none'.
  takeDamage(amount, { silver = false, source = null, melee = false, ranged = false } = {}) {
    if (this.dead) return 'none';
    const g = this.game;
    if (this.invuln > 0 || this.finisherT > 0) {
      // a last-moment dash is a perfect dodge
      if (this.dashT > 0 && !this._perfectDodgeT) {
        this._perfectDodgeT = 1;
        g.slowmo(0.3, this.isWolf ? 1.2 : 2.2);
        g.hud.floatText(this.pos.clone().add(new THREE.Vector3(0, this.height + 0.5, 0)), 'PERFECT DODGE', '#9fe8ff');
        this.addRage(10);
      }
      return 'dodge';
    }
    let dmg = amount;
    if (this.blocking) {
      const window = 0.22 + this.skills.parry * 0.08;
      if (this.blockT < window) {
        g.audio.parry();
        g.slowmo(0.35, 0.4);
        g.fx.sparks(this.pos.clone().add(new THREE.Vector3(0, this.height * 0.7, 0)));
        g.hud.floatText(this.pos.clone().add(new THREE.Vector3(0, this.height + 0.5, 0)), 'PARRY!', '#ffe08a');
        this.addRage(15);
        this.rig.playAttack?.(this.isBeast ? 'light' : 'claw', 1);
        if (source && ranged && this.skills.parry >= 2 && !source.dead) {
          g.npcs.damage(source, amount * 2, { source: this, knock: 6, from: this.pos });
          g.fx.tracer(this.eye, source.pos.clone().add(new THREE.Vector3(0, 1.4, 0)), '#ffe08a');
        }
        return 'parry';
      }
      dmg *= this.isWolf ? 0.3 : 0.5;
      g.audio.block();
    }
    if (this.form === 'transforming') dmg *= 0.5;
    if (this.isWolf) {
      dmg *= 1 - this.skills.hide * 0.12;
      if (silver) dmg *= [1.6, 1.3, 1.05][this.skills.silver];
    }
    if (this.frenzyT > 0) dmg *= 0.6;
    this.healthFrac -= dmg / this.maxHealth;
    this.lastHurt = 0;
    this.addRage(dmg * 0.25);
    g.hud.hurt(clamp(dmg / 40, 0.2, 1));
    g.camera.shake(clamp(dmg / 60, 0.08, 0.4), 0.25);
    g.fx.blood(this.pos.clone().add(new THREE.Vector3(0, this.height * 0.6, 0)), 0.6, silver ? '#c9d6ff' : '#7a0a0a');
    if (!this.blocking) this.dropHeld();
    if (this.healthFrac <= 0) this._die(source);
    return this.blocking ? 'block' : 'hit';
  }

  heal(amount) {
    this.healthFrac = clamp(this.healthFrac + amount / this.maxHealth, 0, 1);
  }

  _die() {
    this.dead = true;
    this.healthFrac = 0;
    this.respawnT = 5;
    this.frenzyT = 0;
    this.dropHeld();
    this.lockTarget = null;
    this.rig.die();
    this.game.hud.showDeath(true);
    this.game.rep.onPlayerDeath();
  }

  _respawn() {
    this.dead = false;
    this.healthFrac = 1;
    for (const r of Object.values(this.rigs)) {
      r.dead = false;
      r.body.rotation.set(0, 0, 0);
      r.body.position.set(0, 0, 0);
    }
    const home = this.game.world.safehouse.pos;
    this.pos.set(home.x - 3, 0, home.z);
    this.vel.set(0, 0, 0);
    this.form = this.game.world.isFullMoonNight ? 'wolf' : 'human';
    for (const [key, r] of Object.entries(this.rigs)) r.root.visible = key === this.form;
    this.game.hud.showDeath(false);
    this.game.hud.toast('You wake at the safehouse, bloodied but alive.', 'gray');
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
    for (const k of ['transformCooldown', 'dashCd', 'attackCd', 'comboT', 'howlCd', 'howlBuff', 'spellCd', 'invuln', 'pounceT', 'wallRunCd', 'bulldozeCd']) this[k] -= dt;
    this.lastHurt += dt;
    if (this._perfectDodgeT) this._perfectDodgeT -= dt;
    if (this._perfectDodgeT <= 0) this._perfectDodgeT = 0;
    if (this.comboT <= 0) this.combo = 0;
    this.hitTimer -= dt;
    if (this.hitTimer <= 0 && this.hitCount > 0) {
      if (this.hitCount >= 10) g.hud.toast(`${this.hitCount}-hit combo!`, 'gold', 1.5);
      this.hitCount = 0;
    }
    this.flowT -= dt;
    if (this.flowT <= 0 && this.onGround) this.flow = 0;

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
    } else {
      let want = null;
      if (input.hit('transform')) want = this.form === 'human' ? this.lastMonsterForm : 'human';
      if (input.hit('form1')) want = 'human';
      if (input.hit('form2')) want = 'hybrid';
      if (input.hit('form3')) want = 'wolf';
      if (want && want !== this.form) this.startTransform(want);
    }

    // senses
    if (input.hit('senses')) {
      this.senses = !this.senses;
      g.audio.sense(this.senses);
    }

    // frenzy
    if (this.frenzyT > 0) {
      this.frenzyT -= dt;
      this.rage = Math.max(0, this.rage - dt * (100 / this._frenzyDur));
      if (this.frenzyT <= 0) g.hud.toast('The frenzy fades.', 'gray', 1.5);
    } else if (input.hit('frenzy')) {
      if (!this.isWolf) g.hud.toast('Frenzy needs hybrid or beast form.', 'gray', 1.5);
      else if (this.rage < 100) g.hud.toast('Frenzy needs full rage.', 'red', 1.2);
      else {
        this._frenzyDur = 12 + this.skills.frenzy * 4;
        this.frenzyT = this._frenzyDur;
        g.audio.roar();
        g.camera.shake(0.6, 0.8);
        g.fx.ring(this.pos, 14, '#ff3030', 0.8);
        g.npcs.shockwave(this.pos, 8, 20, 14, this);
        g.props.shockwave(this.pos, 9, 16);
        g.hud.toast('BLOOD MOON FRENZY', 'red', 2.5);
      }
    }

    // regeneration
    const night = g.world.isNight;
    if (this.isWolf) {
      const regen = this.lastHurt > 2.5 ? (this.isBeast ? 9 : 7) : 1.5;
      this.heal(regen * dt);
      if (g.world.isFullMoonNight) this.addRage(2 * dt);
      else if (this.frenzyT <= 0) this.addRage(-0.6 * dt);
    } else {
      // Lunar Vitality: humans heal fast under the moon
      if (this.lastHurt > 4) this.heal((night ? 9 : 3) * dt);
      this.addRage(-1.5 * dt);
    }
    if (this.frenzyT > 0) this.heal(4 * dt);

    this._updateBlock(dt, input);
    this._updateLock(dt, input);
    this._move(dt);
    if (this.form !== 'transforming') this._combat(dt);
    this._updateHeld(dt);
    this._animate(dt);
  }

  _updateBlock(dt, input) {
    const want = input.down('block') && this.onGround && !this.climbing && this.form !== 'transforming' && !this.held;
    if (want && !this.blocking) this.blockT = 0;
    this.blocking = want;
    if (this.blocking) this.blockT += dt;
  }

  _updateLock(dt, input) {
    const g = this.game;
    if (input.hit('lock')) {
      if (this.lockTarget) this.lockTarget = null;
      else {
        this.lockTarget = g.npcs.nearestInCone(this.pos, g.camera.flatLook(), 40, 0.3, false, true);
        if (this.lockTarget) g.audio.lock();
      }
    }
    const t = this.lockTarget;
    if (t && (t.dead || t.distToPlayer > 50 || t.held)) this.lockTarget = null;
  }

  // ---------------------------------------------------------------- movement
  _move(dt) {
    const g = this.game;
    const input = g.input;
    const world = g.world;
    const F = this.F;
    const wolf = this.isWolf;
    const locked = this.form === 'transforming' || this.finisherT > 0;
    const mv = locked ? { x: 0, y: 0 } : input.move();
    const camYaw = g.camera.yaw;
    // camera forward = (sin yaw, 0, cos yaw), camera right = (-cos yaw, 0, sin yaw)
    const wish = new THREE.Vector3(
      Math.sin(camYaw) * mv.y - Math.cos(camYaw) * mv.x,
      0,
      Math.cos(camYaw) * mv.y + Math.sin(camYaw) * mv.x,
    );
    const wishLen = Math.min(1, wish.length());
    if (wishLen > 0.01) wish.normalize();

    const sprint = input.down('sprint') && wishLen > 0.1 && !this.blocking;
    const swift = wolf ? 1 + this.skills.swift * 0.1 : 1;
    const flowMult = 1 + this.flow * 0.08;
    const inWater = this.pos.y < WATER_LEVEL - 0.6 && terrainHeight(this.pos.x, this.pos.z) < WATER_LEVEL - 0.6;
    let maxSpeed = (sprint ? F.sprint : F.walk) * swift * flowMult;
    if (this.frenzyT > 0) maxSpeed *= 1.2;
    if (inWater) maxSpeed *= wolf ? 0.45 : 0.55;
    if (this.charge > 0) maxSpeed *= 0.25;
    if (this.blocking) maxSpeed *= 0.35;
    if (this.held) maxSpeed *= 0.8;
    this.quadPose = this.isBeast && sprint && this.onGround && this.speed > 14;

    const hv = this._v.set(this.vel.x, 0, this.vel.z);
    const speed = hv.length();

    // ---- mantle in progress: glide up and over the ledge
    if (this.mantleT > 0) {
      this.mantleT -= dt;
      const k = 1 - Math.max(0, this.mantleT) / this._mantleDur;
      this.pos.lerpVectors(this._mantleFrom, this._mantleTo, k * k * (3 - 2 * k));
      this.vel.set(0, 0, 0);
      if (this.mantleT <= 0) {
        this.onGround = true;
        const f = this.forward;
        this.vel.set(f.x * Math.max(4, this._mantleSpeed * 0.7), 0, f.z * Math.max(4, this._mantleSpeed * 0.7));
      }
      this.speed = 4;
      return;
    }

    // ---- slide / dash share the C key: slide when sprinting fast on the ground
    if (!locked && input.hit('dash')) {
      if (this.onGround && sprint && speed > 7 && this.slideT <= 0) {
        this.slideT = 0.85;
        const d = hv.clone().normalize();
        const boost = Math.max(speed, F.sprint * 0.8) * 1.15;
        this.vel.x = d.x * boost;
        this.vel.z = d.z * boost;
        g.audio.slide();
        g.fx.dust(this.pos, 0.6);
      } else if (this.dashCd <= 0) {
        const dir = wishLen > 0.1 ? wish.clone() : this.forward;
        const p = wolf ? 26 : 14;
        this.vel.x = dir.x * p;
        this.vel.z = dir.z * p;
        if (!this.onGround) this.vel.y = Math.max(this.vel.y, 2);
        this.dashT = 0.22;
        this.dashCd = wolf ? 0.8 : 1.0;
        this.invuln = 0.28;
        g.audio.whoosh();
        g.fx.dust(this.pos, 0.5);
      }
    }
    this.dashT -= dt;
    if (this.slideT > 0) {
      this.slideT -= dt;
      if (!this.onGround) this.slideT = 0;
    }

    if (this.climbing) {
      this._climb(dt, wish, wishLen, input);
      return;
    }
    if (this.wallRunning) {
      this._wallRun(dt, wish, wishLen, input);
      return;
    }

    // ---- ground / air acceleration with momentum (weighty at speed)
    if (this.dashT <= 0 && this.slideT <= 0) {
      const target = wish.clone().multiplyScalar(maxSpeed * wishLen);
      let accel;
      if (this.onGround) {
        accel = this.isBeast ? (sprint ? 3.2 : 9) : F.accel * (sprint && wolf ? 0.5 : 1);
        if (target.lengthSq() < hv.lengthSq()) accel = wolf ? 6 : 14;
      } else {
        accel = wolf ? 1.6 : 1.4;
      }
      if (this.onGround && speed > 15 && wishLen > 0.1) {
        const turn = 1 - hv.clone().normalize().dot(wish);
        if (turn > 0.6) accel *= 2.2;
      }
      const t = 1 - Math.exp(-accel * dt);
      this.vel.x += (target.x - this.vel.x) * t;
      this.vel.z += (target.z - this.vel.z) * t;
    } else if (this.slideT > 0) {
      const t = 1 - Math.exp(-0.9 * dt);
      this.vel.x -= this.vel.x * t;
      this.vel.z -= this.vel.z * t;
    }

    // ---- jump / charged leap
    const leapMult = 1 + this.skills.leap * 0.2;
    if (!locked) {
      if (this.isBeast && this.onGround && input.down('jump')) {
        this.charge = Math.min(1, this.charge + dt * 1.15);
        if (this.charge > 0.15 && Math.random() < 0.3) g.fx.dust(this.pos, 0.15);
      }
      if (this.isBeast && this.onGround && this.charge > 0 && input.released_('jump')) {
        const c = this.charge;
        this.charge = 0;
        if (c < 0.18) {
          this.vel.y = F.jump * leapMult;
        } else {
          const look = g.camera.lookDir();
          const fwd = new THREE.Vector3(look.x, 0, look.z).normalize();
          const up = 12 + c * 22;
          const out = 8 + c * 26;
          this.vel.y = up * leapMult;
          this.vel.x = fwd.x * out * leapMult * flowMult + this.vel.x * 0.3;
          this.vel.z = fwd.z * out * leapMult * flowMult + this.vel.z * 0.3;
          this.yaw = Math.atan2(fwd.x, fwd.z);
          g.audio.whoosh();
          g.camera.kick(0.25 + c * 0.3);
          g.fx.dust(this.pos, 1 + c);
          g.fx.ring(this.pos, 4 + c * 6, '#b8b0a0', 0.4);
          // chaining leaps quickly builds flow
          if (this._landedAgo < 0.6) this._addFlow();
        }
        this.onGround = false;
        this.airJumps = this.skills.leap >= 2 ? 1 : 0;
      } else if (!this.isBeast && this.onGround && input.hit('jump')) {
        this.vel.y = F.jump * (this.slideT > 0 ? 1.15 : 1) * (this.isHybrid ? leapMult : 1);
        if (this.slideT > 0) {
          // slide-jump keeps all your speed
          this.slideT = 0;
          this._addFlow();
        }
        this.onGround = false;
        this.airJumps = this.isHybrid && this.skills.leap >= 2 ? 1 : 0;
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
    if (inWater) {
      this.vel.y = damp(this.vel.y, (WATER_LEVEL - 0.9 - this.pos.y) * 3, 4, dt);
    } else {
      this.vel.y -= F.gravity * dt;
    }
    if (this.slamming) this.vel.y = Math.min(this.vel.y, -45);
    this.vel.y = Math.max(this.vel.y, -70);
    if (!this.onGround) this.maxFallSpeed = Math.min(this.maxFallSpeed, this.vel.y);
    this._landedAgo = (this._landedAgo ?? 9) + dt;

    // ---- integrate in sub-steps (fast forms must not tunnel through walls)
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
        const into = this.vel.x * this._n.x + this.vel.z * this._n.z;
        this._wallImpact = -into;
        if (into < 0) {
          this.vel.x -= this._n.x * into;
          this.vel.z -= this._n.z * into;
        }
        this.wallN.copy(this._n);
        this.wallN.top = this._n.top;
        this.wallN.tree = this._n.tree;
      }
      g.props.collidePlayer(this);
      const gy = world.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.1, 0.7);
      const pgy = g.props.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.1);
      const ground = Math.max(gy, pgy);
      if (this.pos.y <= ground && this.vel.y <= 0) {
        if (!this.onGround) this._land(-this.maxFallSpeed);
        this.pos.y = ground;
        this.vel.y = 0;
        this.onGround = true;
        this.maxFallSpeed = 0;
      } else if (this.pos.y > ground + 0.35) {
        this.onGround = false;
      } else if (this.onGround && this.vel.y <= 0) {
        this.pos.y = ground;
      }
    }
    const B = 840;
    this.pos.x = clamp(this.pos.x, -B, B);
    this.pos.z = clamp(this.pos.z, -B, B);

    // ---- walls: mantle short ledges, climb tall ones, wall-run along them
    if (wallHit && !locked && wishLen > 0.3) {
      const intoWall = -(wish.x * this.wallN.x + wish.z * this.wallN.z);
      const rise = this.wallN.top - this.pos.y;
      if (intoWall > 0.5 && rise > 0.5 && rise <= F.reach && !this.wallN.tree && (this.onGround || this.vel.y < 6)) {
        this._startMantle(speed);
      } else if (F.climb && intoWall > 0.55 && rise > F.reach && this.climbDetach <= 0 && !this.held) {
        this.climbing = true;
        this.onGround = false;
        this.vel.set(0, 0, 0);
        this.yaw = Math.atan2(-this.wallN.x, -this.wallN.z);
        g.fx.dust(this.pos.clone().add(new THREE.Vector3(0, 1, 0)), 0.4);
      } else if (!this.onGround && sprint && this.wallRunCd <= 0 && rise > 1.5 && !this.wallN.tree && speed > 6) {
        const along = Math.abs(hv.clone().normalize().dot(this.wallN));
        if (along < 0.6) this._startWallRun(hv);
      }
    }
    this.climbDetach -= dt;

    // ---- facing
    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.speed = hs;
    if (this.lockTarget && !this.climbing && this.onGround) {
      const d = this.lockTarget.pos.clone().sub(this.pos);
      this.yaw = dampAngle(this.yaw, Math.atan2(d.x, d.z), 10, dt);
    } else if (this.attackLockT > 0) {
      this.attackLockT -= dt;
    } else if (wishLen > 0.1 && !locked && this.slideT <= 0) {
      const targetYaw = Math.atan2(wish.x, wish.z);
      this.yaw = dampAngle(this.yaw, targetYaw, wolf && hs > 15 ? 7 : 14, dt);
    }

    // ---- bulldoze: a sprinting beast tramples what's in its way
    if (this.isBeast && this.quadPose && hs > 20 && this.bulldozeCd <= 0) {
      const hits = g.npcs.damageInRadius(this.pos.clone().addScaledVector(this.forward, 1.2), 1.6, 25 * this.damageMult, 16, this);
      if (hits.length) {
        this.bulldozeCd = 0.4;
        this._onHits(hits, 25);
        g.camera.shake(0.25, 0.2);
      }
    }
    if (this.slideT > 0 && this.isWolf) {
      const hits = g.npcs.damageInRadius(this.pos, 1.8, 12, 10, this);
      for (const o of hits) o.stun = Math.max(o.stun, 1.2);
    }
  }

  _addFlow() {
    this.flow = Math.min(3, this.flow + 1);
    this.flowT = 2.5;
    if (this.flow >= 2) this.game.hud.floatText(this.pos.clone().add(new THREE.Vector3(0, this.height + 0.6, 0)), `FLOW x${this.flow}`, '#9fe8ff');
    if (this.game.director) this.game.director.onTraversal('flow');
  }

  _startMantle(speed) {
    const n = this.wallN;
    this._mantleFrom = this.pos.clone();
    this._mantleTo = new THREE.Vector3(this.pos.x - n.x * (this.radius + 0.6), n.top + 0.05, this.pos.z - n.z * (this.radius + 0.6));
    const rise = n.top - this.pos.y;
    this._mantleDur = 0.12 + rise * 0.06;
    this.mantleT = this._mantleDur;
    this._mantleSpeed = speed;
    this.yaw = Math.atan2(-n.x, -n.z);
    this.climbing = false;
    this.game.audio.land(0.4);
    if (rise > 1.2) this.game.director?.onTraversal('mantle');
  }

  _startWallRun(hv) {
    const n = this.wallN;
    const t = new THREE.Vector3(-n.z, 0, n.x);
    if (t.dot(hv) < 0) t.negate();
    this.wallRunning = true;
    this.wallRunT = this.F.wallRun;
    this._wallRunTangent = t;
    this._wallRunSpeed = Math.max(hv.length(), this.isBeast ? 22 : this.isHybrid ? 15 : 8);
    this.vel.y = Math.max(this.vel.y, 3);
    this.yaw = Math.atan2(t.x, t.z);
    this.game.audio.whoosh();
    this.game.director?.onTraversal('wallrun');
  }

  _wallRun(dt, wish, wishLen, input) {
    const g = this.game;
    const world = g.world;
    const n = this.wallN;
    const t = this._wallRunTangent;
    this.wallRunT -= dt;
    if (input.hit('jump')) {
      // kick off the wall: keeps speed, adds flow
      this.wallRunning = false;
      this.wallRunCd = 0.3;
      this.vel.set(n.x * 10 + t.x * this._wallRunSpeed * 0.85, 11.5, n.z * 10 + t.z * this._wallRunSpeed * 0.85);
      this.yaw = Math.atan2(this.vel.x, this.vel.z);
      this._addFlow();
      g.audio.whoosh();
      g.fx.dust(this.pos.clone().add(new THREE.Vector3(0, 1, 0)), 0.4);
      return;
    }
    this.vel.y = Math.max(this.vel.y - 6 * dt, -1.5);
    this.vel.x = t.x * this._wallRunSpeed - n.x * 2;
    this.vel.z = t.z * this._wallRunSpeed - n.z * 2;
    this.pos.addScaledVector(this.vel, dt);
    this.speed = this._wallRunSpeed;
    this._n.set(0, 0, 0);
    this._n.top = 0;
    const touching = world.collide(this.pos, this.radius + 0.2, this.height, 0.2, this._n);
    if (touching && !this._n.tree) {
      this.wallN.copy(this._n);
      this.wallN.top = this._n.top;
    }
    const gy = world.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.1, 0.5);
    if (this.pos.y <= gy) {
      this.pos.y = gy;
      this.onGround = true;
      this.wallRunning = false;
    } else if (!touching || this.wallRunT <= 0 || !input.down('sprint')) {
      this.wallRunning = false;
      this.wallRunCd = 0.4;
    }
    if (Math.random() < 0.5) g.fx.spawn(this.pos.clone().add(new THREE.Vector3(0, 0.3, 0)), new THREE.Vector3(n.x, 1, n.z), new THREE.Color('#8a8070'), 0.4, 0.4, 0);
  }

  _climb(dt, wish, wishLen, input) {
    const g = this.game;
    const world = g.world;
    const n = this.wallN;
    const sprint = input.down('sprint');
    const intoWall = -(wish.x * n.x + wish.z * n.z);
    if (input.hit('jump')) {
      this.climbing = false;
      this.climbDetach = 0.35;
      const lat = wish.clone().addScaledVector(n, -wish.dot(n));
      this.vel.set(n.x * 13 + lat.x * 8, 14, n.z * 13 + lat.z * 8);
      this.yaw = Math.atan2(this.vel.x, this.vel.z);
      this._addFlow();
      g.audio.whoosh();
      g.fx.dust(this.pos.clone().add(new THREE.Vector3(0, 1, 0)), 0.5);
      return;
    }
    const base = this.F.climb;
    let vy;
    if (intoWall > 0.3) vy = sprint ? base * 1.55 : base;
    else if (wishLen < 0.1) vy = -1.5;
    else vy = -4;
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
      this.climbing = false;
      this.climbDetach = 0.4;
      this.vel.set(-n.x * 7, 8, -n.z * 7);
      g.fx.dust(this.pos, 0.4);
      g.audio.land(0.6);
    }
  }

  _land(impact) {
    const g = this.game;
    this._landedAgo = 0;
    if (impact > 6) g.audio.land(clamp(impact / 25, 0.3, 1.2));
    if (impact > 8) g.decals?.footprint(this.pos, this.isWolf);
    if (this.slamming || (this.isBeast && impact > 30)) {
      const power = clamp(impact / 40, 0.8, 2);
      g.camera.shake(0.5 * power, 0.5);
      g.audio.slam();
      g.fx.dust(this.pos, 2.5 * power);
      g.fx.ring(this.pos, 9 * power, '#d8c8a8', 0.6);
      g.npcs.shockwave(this.pos, 6 + 3 * power, 45 * power * this.damageMult, 16, this);
      g.props.shockwave(this.pos, 8 + 3 * power, 18 * power);
      g.decals?.crater(this.pos, 2 + power * 1.5);
      this.slamming = false;
    } else if (this.isWolf && impact > 18) {
      g.camera.shake(0.18, 0.25);
      g.fx.dust(this.pos, 0.8);
    } else if (!this.isWolf && impact > 17) {
      this.takeDamage((impact - 17) * 6);
    }
  }

  // ---------------------------------------------------------------- held objects
  dropHeld() {
    if (!this.held) return;
    const h = this.held;
    this.held = null;
    if (h.kind === 'npc') this.game.npcs.release(h.ref, new THREE.Vector3(0, 2, 0));
    else this.game.props.release(h.ref, new THREE.Vector3(0, 2, 0));
  }

  _updateHeld() {
    if (!this.held) return;
    const f = this.forward;
    const hp = this.pos.clone().addScaledVector(f, this.isBeast ? 0.8 : 0.6);
    hp.y += this.height + (this.held.kind === 'npc' ? 0.2 : 0.4);
    if (this.held.kind === 'npc') this.game.npcs.holdAt(this.held.ref, hp, this.yaw);
    else this.game.props.holdAt(this.held.ref, hp, this.yaw);
  }

  _throwHeld() {
    const g = this.game;
    const h = this.held;
    this.held = null;
    const look = g.camera.lookDir();
    let dir = look.clone();
    if (this.lockTarget) dir = this.lockTarget.pos.clone().add(new THREE.Vector3(0, 1, 0)).sub(this.eye).normalize();
    const power = this.isBeast ? 34 : this.isHybrid ? 26 : 16;
    const vel = dir.multiplyScalar(power).add(new THREE.Vector3(0, 5, 0));
    if (h.kind === 'npc') g.npcs.release(h.ref, vel, true);
    else g.props.release(h.ref, vel, true);
    this.rig.playAttack?.(this.isBeast ? 'throw' : 'heavy', 1);
    g.audio.whoosh();
    this.attackCd = 0.4;
  }

  // ---------------------------------------------------------------- combat
  _combat(dt) {
    const g = this.game;
    const input = g.input;
    if (g.paused) return;
    const wolf = this.isWolf;
    const F = this.F;
    const npcs = g.npcs;

    // finisher in progress
    if (this.finisherT > 0) {
      this.finisherT -= dt;
      const t = this._finisherTarget;
      if (t && !t.dead && this.finisherT < 0.35) {
        npcs.finish(t, this);
        g.fx.blood(t.pos.clone().add(new THREE.Vector3(0, 1.2, 0)), 3, t.type === 'vampire' ? '#3a0006' : '#8a0a0a');
        g.camera.shake(0.5, 0.4);
        g.audio.gore();
        g.hud.floatText(t.pos.clone().add(new THREE.Vector3(0, 2.5, 0)), ['BRUTAL', 'SAVAGE', 'TORN APART', 'NO MERCY'][Math.floor(Math.random() * 4)], '#ff4040');
        this.heal(this.maxHealth * 0.15);
        this.addRage(20);
        this._registerHit(5);
        g.decals?.blood(t.pos, 2.2);
      }
      return;
    }

    // grab / throw
    if (input.hit('grab')) {
      if (this.held) this._throwHeld();
      else {
        const npc = wolf ? npcs.grabbable(this.pos, this.forward, 3.2) : null;
        const prop = g.props.nearestGrabbable(this.pos, this.isBeast ? 4.5 : 3, this.formKey);
        if (npc && (!prop || npc.pos.distanceTo(this.pos) < prop.pos.distanceTo(this.pos))) {
          npcs.hold(npc);
          this.held = { kind: 'npc', ref: npc };
        } else if (prop) {
          g.props.grab(prop);
          this.held = { kind: 'prop', ref: prop };
        } else {
          g.hud.toast(wolf ? 'Nothing to grab.' : 'Too weak to grab that in human form.', 'gray', 1);
        }
        if (this.held) {
          g.audio.grab();
          this.rig.playAttack?.(this.isBeast ? 'grab' : 'claw', 1);
        }
      }
      return;
    }
    if (this.held && input.hit('light')) {
      this._throwHeld();
      return;
    }

    // finisher / feed / interact (E)
    if (input.hit('interact')) {
      const target = npcs.nearestFinishable(this.pos, 3.6, this.formKey);
      if (target) {
        this._finisherTarget = target;
        this.finisherT = 0.9;
        target.stun = 2;
        const d = target.pos.clone().sub(this.pos);
        this.yaw = Math.atan2(d.x, d.z);
        g.slowmo(0.3, 0.9);
        g.camera.finisher(target.pos, 0.9);
        if (this.isBeast) this.wolf.playAttack('finisher');
        else this.rig.playAttack('heavy', 1);
        g.audio.snarl();
        g.interactConsumed = true;
        return;
      }
      if (wolf) {
        const corpse = npcs.nearestCorpse(this.pos, 3.5);
        if (corpse) {
          npcs.consume(corpse);
          this.heal(70);
          this.addRage(25);
          this.rig.playAttack?.('heavy', 1);
          g.audio.claw(true);
          g.fx.blood(corpse.pos.clone().add(new THREE.Vector3(0, 0.4, 0)), 1.5);
          g.rep.onFeed(corpse);
          g.interactConsumed = true;
          return;
        }
      }
    }

    if (this._pendingHeavy) {
      const ph = this._pendingHeavy;
      ph.t -= dt;
      if (ph.t <= 0) {
        this._pendingHeavy = null;
        const c = this.pos.clone().add(new THREE.Vector3(0, F.height * 0.5, 0));
        const hits = npcs.damageInCone(c, this.forward, F.range + 0.6, 0.1, ph.dmg, wolf ? 22 : 6, this);
        // the hybrid's uppercut launches enemies skyward
        if (this.isHybrid) for (const o of hits) if (o.type !== 'alpha' && o.type !== 'demon') { o.vel.y += 12; o.onGround = false; o.stun = Math.max(o.stun, 1.2); }
        g.props.hitCone(c, this.forward, F.range + 1, 0.1, wolf ? 22 : 6, ph.dmg);
        this._onHits(hits, ph.dmg);
        if (wolf) {
          g.fx.dust(this.pos.clone().addScaledVector(this.forward, 2.5), 0.6);
          g.camera.shake(0.2, 0.2);
        }
      }
    }

    if (this.blocking) return;
    const chest = this.pos.clone().add(new THREE.Vector3(0, F.height * 0.58, 0));

    // light attack / combo / pounce
    if (input.hit('light') && this.attackCd <= 0 && !this.climbing && !this.wallRunning) {
      this._faceAim();
      const f = this.forward;
      if (wolf && !this.onGround && this.pounceT <= 0) {
        const target = this.lockTarget || npcs.nearestInCone(this.pos, f, 22, 0.6);
        const dir = target ? target.pos.clone().sub(this.pos) : f.clone().setY(-0.6);
        dir.normalize();
        this.vel.copy(dir.multiplyScalar(this.isBeast ? 34 : 26));
        this.pounceT = 0.8;
        this.rig.playAttack(this.isBeast ? 'pounce' : 'claw', 1);
        this.pouncing = 0.6;
        g.audio.snarl();
        this.attackCd = 0.4;
      } else {
        this.combo = (this.combo % 3) + 1;
        this.comboT = 0.75;
        const finisher = this.combo === 3;
        const dmg = (finisher ? F.light * 1.7 : F.light) * this.damageMult;
        if (this.isBeast) {
          this.wolf.playAttack(finisher ? 'heavy' : 'light', this.combo === 1 ? 1 : -1);
        } else {
          this.rig.playAttack(this.isHybrid ? 'claw' : 'punch', this.combo === 2 ? -1 : 1);
        }
        if (wolf) {
          this.vel.x += f.x * (finisher ? 9 : 5);
          this.vel.z += f.z * (finisher ? 9 : 5);
        }
        this.attackLockT = 0.25;
        g.audio.claw(finisher);
        const hits = npcs.damageInCone(chest, f, F.range, 0.35, dmg, finisher ? 14 : 5, this);
        g.props.hitCone(chest, f, F.range + 0.5, 0.3, wolf ? (finisher ? 14 : 8) : 4, dmg);
        this._onHits(hits, dmg);
        this.attackCd = this.isBeast ? (finisher ? 0.45 : 0.24) : this.isHybrid ? (finisher ? 0.38 : 0.2) : 0.4;
      }
    }
    if (this.pouncing > 0) {
      this.pouncing -= dt;
      const hits = npcs.damageInRadius(this.pos, 2.4, (this.isBeast ? 55 : 38) * this.damageMult, 18, this, true);
      if (hits.length) {
        this.pouncing = 0;
        this._onHits(hits, 55);
        g.camera.shake(0.35, 0.3);
        g.fx.ring(this.pos, 4, '#ff6050', 0.35);
        this.vel.multiplyScalar(0.2);
      }
      if (this.onGround) this.pouncing = 0;
    }

    // heavy attack: smash / uppercut on the ground, dive-slam in the air
    if (input.hit('heavy') && this.attackCd <= 0 && !this.climbing && !this.wallRunning) {
      this._faceAim();
      if (wolf && !this.onGround && this.pos.y - g.world.groundAt(this.pos.x, this.pos.z, this.pos.y) > 3) {
        this.slamming = true;
        this.rig.playAttack(this.isBeast ? 'slam' : 'heavy', 1);
        this.vel.x *= 0.3;
        this.vel.z *= 0.3;
        this.attackCd = 0.6;
      } else {
        const dmg = F.heavy * this.damageMult;
        this.rig.playAttack('heavy', 1);
        this.attackLockT = 0.45;
        g.audio.claw(true);
        // the blow lands after the wind-up (game time, so pause/slow-mo apply)
        this._pendingHeavy = { t: this.isBeast ? 0.22 : 0.15, dmg };
        this.attackCd = this.isBeast ? 0.7 : 0.6;
      }
    }

    // howl
    if (wolf && input.hit('howl') && this.howlCd <= 0 && this.onGround) {
      this.howlCd = 14;
      this.howlBuff = 10;
      if (this.isBeast) this.wolf.howlT = 1.6;
      g.audio.howl(this.isBeast ? 1 : 0.8);
      g.camera.shake(0.12, 1.5);
      g.fx.ring(this.pos, 30 + this.skills.howl * 10, '#c8d8ff', 1.4);
      npcs.howl(this.pos, 30 + this.skills.howl * 12, this.skills.howl);
      this.addRage(20);
      g.events.emit('howl', { pos: this.pos.clone() });
    } else if (!wolf && input.hit('howl')) {
      g.hud.toast('Only the wolf can howl. (F or 2/3 to transform)', 'gray', 1.5);
    }

    // Moonfire
    if (input.hit('spell')) {
      const cost = this.isHybrid ? 20 : 30;
      if (!this.hasMoonfire) g.hud.toast('You have not learned any magic. Seek the Ancient Ruins.', 'gray', 2);
      else if (this.spellCd > 0) { /* cooling */ }
      else if (this.rage < cost) g.hud.toast(`Not enough rage (${cost}).`, 'red', 1.2);
      else {
        this.rage -= cost;
        this.spellCd = 1.2;
        const from = this.eye.addScaledVector(this.forward, 1);
        let dir = g.camera.lookDir();
        if (this.lockTarget) dir = this.lockTarget.pos.clone().add(new THREE.Vector3(0, 1, 0)).sub(from).normalize();
        npcs.spawnProjectile({ from, dir, speed: 45, owner: 'player', damage: 65 * this.damageMult, radius: 5, color: '#7fb2ff', magic: true });
        this.rig.playAttack?.(this.isBeast ? 'light' : 'cast', 1);
        g.audio.magic();
      }
    }
  }

  _faceAim() {
    if (this.lockTarget) {
      const d = this.lockTarget.pos.clone().sub(this.pos);
      this.yaw = Math.atan2(d.x, d.z);
      return;
    }
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

  _registerHit(n = 1) {
    this.hitCount += n;
    this.hitTimer = 3;
    this.bestCombo = Math.max(this.bestCombo, this.hitCount);
  }

  _onHits(hits, dmg) {
    if (!hits.length) return;
    const g = this.game;
    this.addRage(hits.length * 4);
    this._registerHit(hits.length);
    let heal = 0;
    if (this.skills.bloodlust) heal += dmg * hits.length * 0.05 * this.skills.bloodlust * (this.isWolf ? 2.6 : 1);
    if (this.frenzyT > 0) heal += dmg * hits.length * 0.1;
    if (heal) this.heal(heal);
    g.audio.hit();
    g.hitstop = 0.05;
  }

  _animate(dt) {
    const cam = this.game.camera3.position;
    const toCam = cam.clone().sub(this.pos).setY(0);
    if (toCam.lengthSq() > 0.01) toCam.normalize();
    this.fill.position.copy(this.pos).addScaledVector(toCam, 3).add(new THREE.Vector3(0, this.F.height + 1.5, 0));
    this.fill.intensity = (0.25 + this.game.world.nightFactor * 0.75) * 45;
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    const holding = !!this.held;
    if (this.human.root.visible) this.human.animate(dt, { speed: this.speed, onGround: this.onGround || this.mantleT > 0, sliding: this.slideT > 0, climbing: this.wallRunning, vy: this.vel.y });
    if (this.hybrid.root.visible) {
      this.hybrid.animate(dt, { speed: this.speed, onGround: this.onGround || this.mantleT > 0, climbing: this.climbing, sliding: this.slideT > 0, vy: this.vel.y });
      if (holding) {
        this.hybrid.armL.rotation.x = this.hybrid.armR.rotation.x = -2.9;
      }
      if (this.blocking) {
        this.hybrid.armL.rotation.x = this.hybrid.armR.rotation.x = -1.5;
        this.hybrid.elbows[0].rotation.x = this.hybrid.elbows[1].rotation.x = -1.8;
      }
      this.hybrid.setEyeIntensity(this.game.world.isNight ? 6 : 2.5);
    }
    if (this.wolf.root.visible) {
      this.wolf.animate(dt, {
        speed: this.speed,
        onGround: this.onGround,
        quad: this.quadPose || this.charge > 0.2,
        climbing: this.climbing,
        vy: this.vel.y,
        charge: this.charge,
        sliding: this.slideT > 0,
        holding,
        block: this.blocking,
      });
      this.wolf.setEyeIntensity((this.game.world.isNight ? 6 : 2) * (this.frenzyT > 0 ? 2 : 1));
      this.wolf.root.rotation.z = damp(this.wolf.root.rotation.z, clamp(angleDiff(this._lastYaw ?? this.yaw, this.yaw) / dt, -3, 3) * -0.06, 8, dt);
    }
    // lean into wall-runs
    const lean = this.wallRunning ? (this._wallRunTangent.clone().cross(new THREE.Vector3(0, 1, 0)).dot(this.wallN) > 0 ? -0.35 : 0.35) : 0;
    this.root.rotation.z = damp(this.root.rotation.z, lean, 10, dt);
    this._lastYaw = this.yaw;
  }

  get district() {
    return districtAt(this.pos.x, this.pos.z);
  }

  serialize() {
    return {
      xp: this.xp, level: this.level, skillPoints: this.skillPoints, skills: this.skills, hasMoonfire: this.hasMoonfire,
      pos: [this.pos.x, this.pos.y, this.pos.z], kills: this.kills, moonstones: this.moonstones, hpBonus: this.hpBonus, bestCombo: this.bestCombo,
    };
  }

  load(d) {
    if (!d) return;
    Object.assign(this, { xp: d.xp, level: d.level, skillPoints: d.skillPoints, hasMoonfire: d.hasMoonfire, kills: d.kills || 0, moonstones: d.moonstones || 0, hpBonus: d.hpBonus || 0, bestCombo: d.bestCombo || 0 });
    Object.assign(this.skills, d.skills || {});
    if (d.pos) this.pos.set(d.pos[0], d.pos[1] + 1, d.pos[2]);
  }
}
