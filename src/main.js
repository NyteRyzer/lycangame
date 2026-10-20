// LYCAN — entry point: renderer, game loop, menus, save/load.
import * as THREE from 'three';
import { Audio } from './audio.js';
import { CameraRig } from './camera.js';
import { FX } from './fx.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { NPCManager } from './npcs.js';
import { Player } from './player.js';
import { Director, EventBus, Reputation } from './story.js';
import { LANDMARKS, World } from './world.js';

const SAVE_KEY = 'lycan-save-v1';
const SETTINGS_KEY = 'lycan-settings-v1';
const $ = (id) => document.getElementById(id);

function storageGet(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}
function storageSet(key, v) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage unavailable: play on without saving */
  }
}

class Game {
  constructor() {
    this.canvas = $('game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.scene = new THREE.Scene();
    this.camera3 = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 4000);
    addEventListener('resize', () => {
      this.renderer.setSize(innerWidth, innerHeight);
      this.camera3.aspect = innerWidth / innerHeight;
      this.camera3.updateProjectionMatrix();
    });

    this.events = new EventBus();
    this.input = new Input(this.canvas);
    this.audio = new Audio();
    this.world = new World(this.scene);
    this.landmarks = LANDMARKS;
    this.fx = new FX(this.scene);
    this.camera = new CameraRig(this.camera3, this.world);
    this.hud = new HUD(this);
    this.rep = new Reputation(this);
    this.npcs = new NPCManager(this);
    this.player = new Player(this);
    this.director = new Director(this);
    this.paused = true;
    this.menu = 'title';
    this.hitstop = 0;
    this.saveTimer = 30;
    this.started = false;
    this.clock = new THREE.Clock();
    this.fpsSmoothed = 60;

    this._loadSettings();
    this._wireMenus();
    // Esc releases pointer lock before the page sees the key: treat that as pause
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && this.started && !this.paused) this.setPaused(true);
    });
    this.renderer.compile(this.scene, this.camera3);
    $('loading').classList.add('hidden');
    $('title-buttons').classList.remove('hidden');
    if (storageGet(SAVE_KEY)) $('btn-continue').classList.remove('hidden');
    this.camera.update(0, this.player, { dx: 0, dy: 0 });
    this.renderer.setAnimationLoop(() => this.frame());
  }

  _loadSettings() {
    const s = storageGet(SETTINGS_KEY) || {};
    this.settings = { sens: 1, vol: 0.7, fov: 70, invert: false, shadows: true, ...s };
    this._applySettings();
    $('set-sens').value = this.settings.sens;
    $('set-vol').value = this.settings.vol;
    $('set-fov').value = this.settings.fov;
    $('set-invert').checked = this.settings.invert;
    $('set-shadows').checked = this.settings.shadows;
  }

  _applySettings() {
    const s = this.settings;
    this.input.sensitivity = s.sens;
    this.input.invertY = s.invert;
    this.audio.setVolume(s.vol);
    this.camera.baseFov = s.fov;
    this.world.sun.castShadow = s.shadows;
    storageSet(SETTINGS_KEY, s);
  }

  _wireMenus() {
    const bind = (id, key, parse) => {
      $(id).addEventListener('input', (e) => {
        this.settings[key] = parse(e.target);
        this._applySettings();
      });
    };
    bind('set-sens', 'sens', (t) => parseFloat(t.value));
    bind('set-vol', 'vol', (t) => parseFloat(t.value));
    bind('set-fov', 'fov', (t) => parseFloat(t.value));
    bind('set-invert', 'invert', (t) => t.checked);
    bind('set-shadows', 'shadows', (t) => t.checked);

    $('btn-new').onclick = () => this.start(false);
    $('btn-continue').onclick = () => this.start(true);
    $('btn-resume').onclick = () => this.setPaused(false);
    $('btn-skills').onclick = () => this.openMenu('skills');
    $('btn-save').onclick = () => {
      this.save();
      this.hud.toast('Game saved.', 'gold');
    };
    $('btn-quit').onclick = () => {
      this.save();
      if (window.lycanNative?.quit) window.lycanNative.quit();
      else location.reload();
    };
    $('btn-skills-close').onclick = () => this.setPaused(false);
    $('btn-ending-close').onclick = () => {
      $('ending-screen').classList.add('hidden');
      this.setPaused(false);
    };
  }

  start(continueGame) {
    this.audio.unlock();
    if (continueGame) this.load();
    $('title-screen').classList.add('hidden');
    this.hud.show(true);
    this.started = true;
    this.setPaused(false);
    if (!continueGame) {
      this.hud.toast('Greyhaven. The night you were bitten, everything changed.', 'gray', 5);
      setTimeout(() => this.hud.toast('Click to capture the mouse. Esc to pause.', 'gray', 4), 1500);
    }
  }

  setPaused(p, menu = null) {
    this.paused = p;
    this.menu = p ? menu || 'pause' : null;
    $('pause-screen').classList.toggle('hidden', this.menu !== 'pause');
    $('skills-screen').classList.toggle('hidden', this.menu !== 'skills');
    $('map-screen').classList.toggle('hidden', this.menu !== 'map');
    if (this.menu === 'pause') this.hud.renderStats();
    if (this.menu === 'skills') this.hud.renderSkills();
    if (this.menu === 'map') this.hud.renderBigMap();
    this.input.wantLock = !p;
    if (p && document.pointerLockElement) document.exitPointerLock?.();
    if (!p && this.started) this.canvas.requestPointerLock?.();
  }

  openMenu(m) {
    this.setPaused(true, m);
  }

  save() {
    if (!this.started) return;
    storageSet(SAVE_KEY, {
      player: this.player.serialize(),
      rep: this.rep.serialize(),
      story: this.director.serialize(),
      world: { time: this.world.time, day: this.world.day },
    });
  }

  load() {
    const d = storageGet(SAVE_KEY);
    if (!d) return;
    this.player.load(d.player);
    this.rep.load(d.rep);
    this.director.load(d.story);
    if (d.world) {
      this.world.time = d.world.time;
      this.world.day = d.world.day;
    }
  }

  frame() {
    const dt = Math.min(this.clock.getDelta(), 1 / 20);
    this.fpsSmoothed = this.fpsSmoothed * 0.95 + (1 / Math.max(dt, 1e-4)) * 0.05;
    this.step(dt);
    this.renderer.render(this.scene, this.camera3);
  }

  // one simulation tick (separate from rendering so tests can drive it)
  step(dt) {
    const input = this.input;
    input.pollGamepad();

    if (this.started) {
      if (input.hit('pause')) {
        if (this.menu === 'ending') { /* ignore */ }
        else this.setPaused(!this.paused);
      } else if (input.hit('skills')) {
        this.menu === 'skills' ? this.setPaused(false) : this.openMenu('skills');
      } else if (input.hit('map')) {
        this.menu === 'map' ? this.setPaused(false) : this.openMenu('map');
      }
    }

    if (this.hitstop > 0) {
      this.hitstop -= dt;
      dt *= 0.1;
    }

    if (!this.paused && this.started) {
      // pointer lock is re-requested on click; until then, arrow keys still work
      this.audio.unlock();
      this.world.update(dt, this.player.pos);
      this.player.update(dt);
      this.npcs.update(dt);
      this.rep.update(dt);
      this.director.update(dt);
      this.camera.update(dt, this.player, input.look());
      this.fx.update(dt);
      this.hud.update(dt);
      let danger = 0;
      for (const o of this.npcs.list) if (!o.dead && o.distToPlayer < 40 && this.npcs.isHostileToPlayer(o)) danger += 0.25;
      this.audio.updateAmbience(dt, this.player.speed, Math.min(1, danger + (1 - this.player.healthFrac) * 0.6));
      this.saveTimer -= dt;
      if (this.saveTimer <= 0) {
        this.saveTimer = 30;
        this.save();
      }
    } else if (!this.started) {
      // title screen: slow orbit over the city at night
      this.world.update(0, this.player.pos);
      this.camera.yaw += dt * 0.05;
      this.camera.pitch = 0.05;
      this.camera.update(dt, this.player, { dx: 0, dy: 0 });
      this.camera3.position.y += 30;
      this.camera3.lookAt(0, 30, 0);
    }
    input.endFrame();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  // let the loading text paint before the heavy world build
  setTimeout(() => {
    try {
      window.__lycan = new Game();
    } catch (e) {
      $('loading').textContent = 'Failed to start: ' + e.message;
      console.error(e);
    }
  }, 30);
});
