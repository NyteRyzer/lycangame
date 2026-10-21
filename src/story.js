// Morality, heat, faction standing, territory, story objectives, dynamic
// world events and contracts — the systems that decide whether you become
// Greyhaven's protector or its greatest threat.
import * as THREE from 'three';
import { DISTRICTS, LANDMARKS, districtAt, terrainHeight } from './world.js';
import { clamp, pick, rand } from './util.js';

export class EventBus {
  constructor() {
    this.handlers = {};
  }
  on(name, fn) {
    (this.handlers[name] ||= []).push(fn);
  }
  emit(name, data) {
    for (const fn of this.handlers[name] || []) fn(data);
  }
}

// ---------------------------------------------------------------------------
export class Reputation {
  constructor(game) {
    this.game = game;
    this.morality = 0; // -100 monster … +100 protector
    this.heat = 0; // 0…5 how hard the hunters are looking for you
    this.factions = { citizens: 0, hunters: -10, vampires: 0, pack: -20 };
    this.territory = Object.fromEntries(DISTRICTS.map((d) => [d, d === 'Northwood Forest' ? 10 : 0]));
    this.packAllied = false;
    this.huntersProvoked = 0;
    this.policeProvoked = 0;
    this.stats = { civiliansKilled: 0, civiliansSaved: 0, monstersSlain: 0, huntersKilled: 0, eventsWon: 0, policeKilled: 0, animalsHunted: 0 };
    this.lastWitness = 99;
  }

  get title() {
    const m = this.morality;
    if (this.packAllied && m <= -40) return 'Alpha of the Damned';
    if (this.packAllied && m >= 40) return 'Alpha Guardian';
    if (m >= 60) return 'Guardian of Greyhaven';
    if (m >= 20) return 'Protector';
    if (m > -20) return 'Wanderer';
    if (m > -60) return 'Feral Menace';
    return 'The Beast of Greyhaven';
  }

  changeMorality(d, reason) {
    const before = this.title;
    this.morality = clamp(this.morality + d, -100, 100);
    if (reason) this.game.hud.repPopup(d, reason);
    if (this.title !== before) this.game.hud.toast(`You are now known as: ${this.title}`, this.morality >= 0 ? 'gold' : 'red', 3.5);
  }

  changeFaction(f, d) {
    this.factions[f] = clamp(this.factions[f] + d, -100, 100);
  }

  addHeat(d) {
    const before = Math.floor(this.heat);
    this.heat = clamp(this.heat + d, 0, 5);
    if (Math.floor(this.heat) > before) {
      this.game.hud.toast(['', 'Rumours of a beast spread.', 'The police are alerted.', 'Hunters are tracking you.', 'The Order mobilizes!', 'GREYHAVEN HUNTS YOU.'][Math.floor(this.heat)], 'red', 2.5);
    }
  }

  // a civilian sees the beast
  witnessed(dt, civ) {
    this.lastWitness = 0;
    if (this.morality >= 50) return; // they know you as their guardian
    const mult = (this.morality < -30 ? 1.5 : this.morality > 20 ? 0.5 : 1) * (this.game.player.isHybrid ? 0.5 : 1);
    this.addHeat(0.05 * dt * mult * 6);
  }

  huntersHostile(hunter) {
    const p = this.game.player;
    if (hunter.eventId && hunter.forceHostile) return true;
    if (this.huntersProvoked > 0) return true;
    if (p.isWolf) {
      // an uneasy truce with a known protector
      if (this.morality >= 60 && this.factions.hunters >= 0 && this.heat < 2) return false;
      return true;
    }
    return this.heat >= 3;
  }

  provokeHunters() {
    this.huntersProvoked = 20;
  }

  // police: monsters past 1 heat, or anyone who shoots back
  policeHostile() {
    if (this.policeProvoked > 0) return true;
    if (this.game.player.isWolf) return this.heat >= 1;
    return this.heat >= 3; // Blend In: in human form they don't know your face
  }

  provokePolice() {
    this.policeProvoked = 25;
  }

  onKill(o, source) {
    const g = this.game;
    const byPlayer = source === g.player || source?.type === 'packmate';
    const d = districtAt(o.pos.x, o.pos.z);
    if (o.type === 'civilian') {
      if (byPlayer) {
        this.stats.civiliansKilled++;
        this.changeMorality(-8, 'Innocent killed');
        this.changeFaction('citizens', -6);
        this.changeFaction('vampires', 2);
        this.addHeat(1.1);
      }
      return;
    }
    if (!byPlayer) return;
    if (o.type === 'vampire') {
      this.stats.monstersSlain++;
      this.changeMorality(4, 'Vampire slain');
      this.changeFaction('vampires', -6);
      this.changeFaction('citizens', 2);
      this.claim(d, 4);
    } else if (o.type === 'hunter' || o.type === 'captain') {
      this.stats.huntersKilled++;
      this.changeMorality(o.type === 'captain' ? -2 : -1.5, o.type === 'captain' ? 'Hunter captain killed' : null);
      this.changeFaction('hunters', -6);
      this.addHeat(0.35);
      this.claim(d, 2);
    } else if (o.type === 'rival') {
      this.stats.monstersSlain++;
      this.changeFaction('pack', -4);
      this.claim(d, 5);
    } else if (o.type === 'alpha') {
      this.stats.monstersSlain++;
    } else if (o.type === 'police') {
      this.stats.policeKilled++;
      this.changeMorality(-3, 'Officer down');
      this.changeFaction('citizens', -3);
      this.addHeat(0.8);
    } else if (o.type === 'ghoul' || o.type === 'witch' || o.type === 'demon') {
      this.stats.monstersSlain++;
      this.changeMorality(o.type === 'demon' ? 8 : o.type === 'witch' ? 3 : 1, o.type === 'demon' ? 'Demon banished' : null);
      this.changeFaction('citizens', o.type === 'demon' ? 8 : 1);
      this.claim(d, o.type === 'demon' ? 20 : 3);
    } else if (o.def?.animal) {
      this.stats.animalsHunted++;
    }
  }

  onFeed(corpse) {
    if (corpse.type === 'civilian') {
      this.changeMorality(-4, 'Fed on an innocent');
      this.addHeat(0.3);
    } else if (corpse.type === 'hunter') {
      this.changeMorality(-1, null);
    }
  }

  onPlayerDeath() {
    this.heat = 0;
    this.huntersProvoked = 0;
  }

  claim(district, amount) {
    const before = this.territory[district];
    this.territory[district] = clamp(before + amount, 0, 100);
    if (before < 100 && this.territory[district] >= 100) this.game.hud.toast(`${district} is now YOUR territory.`, 'gold', 3);
  }

  update(dt) {
    const p = this.game.player;
    this.lastWitness += dt;
    this.huntersProvoked -= dt;
    // heat fades while unseen — faster when you look human
    this.policeProvoked -= dt;
    // Blend In: as a human you vanish into the crowd three times faster
    if (this.lastWitness > 6) this.addHeat(-dt * (p.isWolf ? 0.025 : 0.24));
    // standing in your own territory makes the beast stronger: handled by HUD display only
  }

  serialize() {
    return { morality: this.morality, heat: this.heat, factions: this.factions, territory: this.territory, packAllied: this.packAllied, stats: this.stats };
  }

  load(d) {
    if (!d) return;
    Object.assign(this, { morality: d.morality, heat: d.heat, packAllied: d.packAllied });
    Object.assign(this.factions, d.factions);
    Object.assign(this.territory, d.territory);
    Object.assign(this.stats, d.stats);
  }
}

// ---------------------------------------------------------------------------
// Story objectives (a light main thread) + dynamic events and contracts.
const STORY = [
  { id: 'transform', text: 'Feel the change. Press F to transform.' },
  { id: 'sprint', text: 'Run free. Hold Shift as the beast to drop to all fours.' },
  { id: 'climb', text: 'Own the skyline. Run into a building to climb it.' },
  { id: 'leap', text: 'Hold Space, then release, for a charged leap.' },
  { id: 'hybrid', text: 'Find the balance between man and wolf. Press 2 for your hybrid form.' },
  { id: 'wallrun', text: 'Sprint and jump alongside a wall to run along it. Jump again to kick off.' },
  { id: 'howl', text: 'Let the city hear you. Press Q to howl.' },
  { id: 'vantage', text: 'Climb a red-beacon Spire and press E to survey the city.', marker: 'vantage' },
  { id: 'shrine', text: 'Seek the Ancient Ruins in Northwood and learn the Old Magic (E).', marker: 'ruins' },
  { id: 'choose', text: 'Greyhaven is watching. Answer events and contracts as you see fit.' },
  { id: 'alpha', text: 'The Blackfang Alpha demands your submission. Defeat it at its den.', marker: 'den' },
  { id: 'free', text: 'Your legend is written. Greyhaven is your hunting ground.' },
];

export class Director {
  constructor(game) {
    this.game = game;
    this.step = 0;
    this.progress = {};
    this.events = [];
    this.eventTimer = 25;
    this.offer = null;
    this.offerTimer = 90;
    this.contract = null;
    this.alphaSpawned = false;
    this.alphaDefeated = false;
    this.ended = false;
    this.contractsDone = 0;
    this.eventSeq = 1;

    game.events.on('transform', ({ to }) => {
      if (to === 'wolf' || to === 'hybrid') this._complete('transform');
      if (to === 'hybrid') this._complete('hybrid');
    });
    game.events.on('howl', () => this._complete('howl'));
  }

  get objective() {
    return STORY[this.step];
  }

  _complete(id) {
    if (this.objective?.id !== id) return;
    this.step++;
    this.game.audio.chime();
    this.game.player.addXP(25);
    this.game.hud.toast('Objective complete', 'gold', 1.6);
    if (this.objective?.id === 'alpha') this.game.hud.toast('A distant howl answers yours from the Ashen Peaks...', 'gray', 4);
  }

  objectiveMarker() {
    const o = this.objective;
    if (o?.marker === 'vantage') {
      const p = this.game.player.pos;
      let best = null;
      for (const v of this.game.world.vantages) if (!v.done && (!best || v.pos.distanceTo(p) < best.pos.distanceTo(p))) best = v;
      return best ? { x: best.pos.x, z: best.pos.z, name: best.name } : null;
    }
    if (o?.marker) return LANDMARKS[o.marker];
    return null;
  }

  onTraversal(kind) {
    if (kind === 'wallrun') this._complete('wallrun');
  }

  markers() {
    const out = [];
    const m = this.objectiveMarker();
    if (m) out.push({ x: m.x, z: m.z, kind: 'story', label: m.name });
    for (const e of this.events) out.push({ x: e.pos.x, z: e.pos.z, kind: e.kind, label: e.title });
    if (this.contract?.target) out.push({ x: this.contract.target.x, z: this.contract.target.z, kind: 'contract', label: this.contract.title });
    return out;
  }

  // ---------------------------------------------------------------- events
  _spawnEvent() {
    const g = this.game;
    const w = g.world;
    const p = g.player.pos;
    const district = districtAt(p.x, p.z);
    const kinds = [];
    if (w.isNight) kinds.push('vampireAttack', 'vampireAttack', 'ghoulSwarm');
    kinds.push('hunterPatrol');
    if (district === 'Northwood Forest' || district === 'Ashen Peaks' || Math.random() < 0.3) kinds.push('rivalPack');
    if (w.isNight && (district === 'Northwood Forest' || Math.random() < 0.25)) kinds.push('coven');
    if (w.isNight && this.step >= STORY.findIndex((s) => s.id === 'choose')) kinds.push('hellgate');
    const kind = pick(kinds);
    let pos = null;
    if (kind === 'vampireAttack' || kind === 'ghoulSwarm' || kind === 'hellgate') {
      const pts = w.spawnPoints.sidewalks.filter((s) => {
        const d = s.distanceTo(p);
        return d > 60 && d < 220;
      });
      if (!pts.length) return;
      pos = pick(pts).clone();
    } else if (kind === 'rivalPack' || kind === 'coven') {
      const pts = w.spawnPoints.forest.filter((s) => {
        const d = s.distanceTo(p);
        return d > 70 && d < 260;
      });
      if (!pts.length) return;
      pos = pick(pts).clone();
    } else {
      const a = rand(0, Math.PI * 2), r = rand(90, 160);
      pos = new THREE.Vector3(clamp(p.x + Math.cos(a) * r, -600, 600), 0, clamp(p.z + Math.sin(a) * r, -600, 600));
      pos.y = terrainHeight(pos.x, pos.z);
    }
    const id = this.eventSeq++;
    const e = { id, kind, pos, t: 0, npcs: [], victims: [] };
    const npcs = g.npcs;
    if (kind === 'vampireAttack') {
      e.title = 'Vampire Attack';
      e.desc = 'Vampires are feeding on civilians. Save them — or let the city bleed.';
      e.timeLimit = 150;
      for (let i = 0; i < 4; i++) {
        const v = npcs.spawn('civilian', pos.clone().add(new THREE.Vector3(rand(-6, 6), 0, rand(-6, 6))), { eventId: id, state: 'cower' });
        e.victims.push(v);
      }
      for (let i = 0; i < 3 + (w.isFullMoonNight ? 1 : 0); i++) {
        const v = npcs.spawn('vampire', pos.clone().add(new THREE.Vector3(rand(-8, 8), 0, rand(-8, 8))), { eventId: id, state: 'hunt' });
        e.npcs.push(v);
      }
    } else if (kind === 'hunterPatrol') {
      e.title = 'Hunter Patrol';
      e.desc = 'A squad from the Order of the Silver Dawn sweeps the area.';
      e.timeLimit = 180;
      for (let i = 0; i < 4; i++) {
        const h = npcs.spawn('hunter', pos.clone().add(new THREE.Vector3(rand(-6, 6), 0, rand(-6, 6))), { eventId: id, state: 'pursue' });
        e.npcs.push(h);
      }
    } else if (kind === 'ghoulSwarm') {
      e.title = 'Ghoul Swarm';
      e.desc = 'The hungry dead have crawled up from Hollow Hill. Put them back.';
      e.timeLimit = 150;
      for (let i = 0; i < 3; i++) e.victims.push(npcs.spawn('civilian', pos.clone().add(new THREE.Vector3(rand(-6, 6), 0, rand(-6, 6))), { eventId: id, state: 'flee' }));
      for (let i = 0; i < 8; i++) e.npcs.push(npcs.spawn('ghoul', pos.clone().add(new THREE.Vector3(rand(-12, 12), 0, rand(-12, 12))), { eventId: id, state: 'hunt' }));
    } else if (kind === 'coven') {
      e.title = 'Coven Ritual';
      e.desc = 'Witches are chanting in Northwood. Break their circle before the ritual completes.';
      e.timeLimit = 180;
      for (let i = 0; i < 3; i++) e.npcs.push(npcs.spawn('witch', pos.clone().add(new THREE.Vector3(Math.cos(i * 2.1) * 8, 0, Math.sin(i * 2.1) * 8)), { eventId: id, state: 'guard' }));
      for (let i = 0; i < 3; i++) e.npcs.push(npcs.spawn('ghoul', pos.clone().add(new THREE.Vector3(rand(-6, 6), 0, rand(-6, 6))), { eventId: id, state: 'guard' }));
    } else if (kind === 'hellgate') {
      e.title = 'Hellgate';
      e.desc = 'A rift has torn open the street and something enormous is stepping through.';
      e.timeLimit = 240;
      e.npcs.push(npcs.spawn('demon', pos.clone(), { eventId: id, state: 'hunt' }));
      for (let i = 0; i < 4; i++) e.npcs.push(npcs.spawn('ghoul', pos.clone().add(new THREE.Vector3(rand(-10, 10), 0, rand(-10, 10))), { eventId: id, state: 'hunt' }));
      g.fx.ring(pos, 14, '#ff3a1a', 1.5);
      g.decals?.crater(pos, 5);
    } else {
      e.title = 'Rival Pack';
      e.desc = 'Blackfang wolves are marking territory. Drive them off.';
      e.timeLimit = 200;
      for (let i = 0; i < 3; i++) {
        const r = npcs.spawn('rival', pos.clone().add(new THREE.Vector3(rand(-8, 8), 0, rand(-8, 8))), { eventId: id, state: 'guard' });
        e.npcs.push(r);
      }
    }
    this.events.push(e);
    g.hud.toast(`EVENT: ${e.title} — ${e.desc}`, 'event', 5);
  }

  _resolveEvent(e, success) {
    const g = this.game;
    this.events.splice(this.events.indexOf(e), 1);
    const rep = g.rep;
    const d = districtAt(e.pos.x, e.pos.z);
    if (success) {
      rep.stats.eventsWon++;
      if (e.kind === 'vampireAttack') {
        const saved = e.victims.filter((v) => !v.dead).length;
        rep.stats.civiliansSaved += saved;
        if (saved > 0) {
          rep.changeMorality(4 + saved * 3, `${saved} civilians saved`);
          rep.changeFaction('citizens', 4 + saved * 2);
        }
        g.player.addXP(60 + saved * 20);
        rep.claim(d, 12);
      } else if (e.kind === 'hunterPatrol') {
        g.player.addXP(100);
        rep.claim(d, 10);
      } else if (e.kind === 'ghoulSwarm') {
        const saved = e.victims.filter((v) => !v.dead).length;
        rep.stats.civiliansSaved += saved;
        rep.changeMorality(3 + saved * 2, 'The dead stay buried');
        g.player.addXP(110);
        rep.claim(d, 12);
      } else if (e.kind === 'coven') {
        g.player.addXP(150);
        rep.changeMorality(4, 'The coven is broken');
        rep.claim(d, 15);
      } else if (e.kind === 'hellgate') {
        g.player.addXP(300);
        g.player.skillPoints++;
        rep.changeMorality(10, 'The Hellgate is sealed');
        rep.changeFaction('citizens', 12);
        rep.claim(d, 25);
        g.hud.toast('Hellgate sealed: +1 skill point', 'gold', 3);
      } else {
        g.player.addXP(120);
        rep.changeFaction('pack', -8);
        rep.claim(d, 15);
      }
      g.hud.toast(`${e.title}: COMPLETE`, 'gold', 2.5);
      g.audio.chime();
    } else {
      if (e.kind === 'vampireAttack') {
        g.hud.toast(`${e.title}: the vampires fed well tonight.`, 'red', 2.5);
        rep.changeFaction('vampires', 4);
      }
    }
    // release survivors back into the ambient world
    for (const n of [...e.npcs, ...e.victims]) {
      n.eventId = null;
      if (n.type === 'civilian' && !n.dead) { n.state = 'wander'; n.victimOf = null; n.home.copy(n.pos); }
    }
  }

  onNpcKilled(o) {
    const g = this.game;
    if (o.type === 'alpha') {
      this.alphaDefeated = true;
      g.rep.packAllied = true;
      g.rep.changeFaction('pack', 100);
      g.rep.claim('Ashen Peaks', 100);
      g.hud.toast('The Blackfang Alpha falls. The pack is YOURS.', 'gold', 5);
      g.audio.howl(1.2);
      if (this.objective?.id === 'alpha') {
        this.step++;
        setTimeout(() => this._ending(), 2500);
      }
    }
    if (this.contract && this.contract.onKill) this.contract.onKill(o);
  }

  // ---------------------------------------------------------------- contracts
  _makeOffer() {
    const g = this.game;
    const rep = g.rep;
    const options = [];
    options.push({
      id: 'court',
      from: 'The Vampire Court',
      title: 'Blood Tithe',
      text: 'The Court offers its favour, and power, in exchange for terror. Slaughter 5 citizens.',
      accept: () => this._startContract({
        title: 'Blood Tithe: kill 5 citizens', need: 5, count: 0,
        onKill: (o) => { if (o.type === 'civilian' && o.lastHitBy === g.player) this._contractTick(); },
        reward: () => { g.rep.changeFaction('vampires', 30); g.player.addXP(200); g.player.skillPoints++; g.hud.toast('The Court rewards you: +1 skill point', 'red', 3); },
      }),
    });
    options.push({
      id: 'citizens',
      from: 'Mayor Hollis (anonymous letter)',
      title: "Break the Lodge",
      text: "The Order's captain executes anyone he suspects of 'the curse'. End his crusade at the Hunters' Lodge.",
      accept: () => {
        const L = LANDMARKS.lodge;
        const center = new THREE.Vector3(L.x, terrainHeight(L.x, L.z), L.z);
        const c = this._startContract({
          title: "Break the Lodge: defeat the hunter captain", need: 1, count: 0, target: center,
          onKill: (o) => { if (o.type === 'captain') this._contractTick(); },
          reward: () => { g.rep.changeMorality(12, 'The crusade is over'); g.rep.changeFaction('citizens', 20); g.player.addXP(250); g.player.skillPoints++; g.hud.toast('Greyhaven breathes easier: +1 skill point', 'gold', 3); },
        });
        const cap = g.npcs.spawn('captain', center.clone().add(new THREE.Vector3(0, 0, 8)), { persistent: true, state: 'pursue' });
        cap.forceHostile = true;
        cap.eventId = 'contract';
        for (let i = 0; i < 5; i++) {
          const h = g.npcs.spawn('hunter', center.clone().add(new THREE.Vector3(rand(-14, 14), 0, rand(-14, 14))), { persistent: true, state: 'guard' });
          h.forceHostile = true;
          h.eventId = 'contract';
        }
        return c;
      },
    });
    options.push({
      id: 'order',
      from: 'The Order of the Silver Dawn',
      title: 'Uneasy Truce',
      text: 'The Order will look the other way if you purge the vampire nest at St. Corvin Cathedral. Kill 6 vampires.',
      accept: () => {
        const C = LANDMARKS.cathedral;
        return this._startContract({
          title: 'Uneasy Truce: kill 6 vampires', need: 6, count: 0, target: new THREE.Vector3(C.x, 0, C.z),
          onKill: (o) => { if (o.type === 'vampire' && o.lastHitBy === g.player) this._contractTick(); },
          reward: () => { g.rep.changeFaction('hunters', 40); g.rep.heat = 0; g.rep.changeMorality(6, 'Nest purged'); g.player.addXP(220); g.player.skillPoints++; g.hud.toast('The Order honours the truce: heat cleared, +1 skill point', 'gold', 3); },
        });
      },
    });
    // tailor offers to who you are becoming
    let pool = options;
    if (rep.morality > 40) pool = options.filter((o) => o.id !== 'court' || Math.random() < 0.3);
    if (rep.morality < -40) pool = options.filter((o) => o.id !== 'order' || Math.random() < 0.3);
    if (!g.world.isNight) pool = pool.filter((o) => o.id !== 'order');
    pool = pool.filter((o) => !this.doneContracts?.includes(o.id));
    if (!pool.length) return;
    this.offer = pick(pool);
    this.offerExpire = 30;
    g.hud.showOffer(this.offer);
    g.audio.chime();
  }

  _startContract(c) {
    c.id = this._accepting?.id;
    this.contract = c;
    this.game.hud.toast(`CONTRACT ACCEPTED: ${c.title}`, 'event', 3);
    return c;
  }

  _contractTick() {
    const c = this.contract;
    c.count++;
    this.game.hud.toast(`${c.title} (${c.count}/${c.need})`, 'gray', 1.5);
    if (c.count >= c.need) {
      c.reward();
      (this.doneContracts ||= []).push(c.id);
      this.contract = null;
      this.contractsDone++;
      this.game.audio.chime();
      if (this.objective?.id === 'choose' && this.contractsDone >= 1) this._complete('choose');
    }
  }

  // ---------------------------------------------------------------- ending
  _ending() {
    const g = this.game;
    const rep = g.rep;
    let title, text;
    if (rep.morality >= 30) {
      title = 'THE GUARDIAN OF GREYHAVEN';
      text = 'With the Blackfang pack at your side, the night belongs to you — and you spend it guarding the city that once feared you. The vampires whisper your name like a curse. Children leave meat on their windowsills under the full moon.';
    } else if (rep.morality <= -30) {
      title = 'THE BEAST OF GREYHAVEN';
      text = 'The pack hunts at your command and the city learns to lock its doors at dusk. The Order sends its best, and you send them back in pieces. Greyhaven has a new apex predator, and it answers to no one.';
    } else {
      title = 'THE LONE ALPHA';
      text = 'Neither saviour nor monster, you rule the wild places between. Humans, hunters and the undead all keep a wary distance. The city is your hunting ground — and what you hunt is your business.';
    }
    g.hud.showEnding(title, text, rep);
  }

  // ---------------------------------------------------------------- update
  update(dt) {
    const g = this.game;
    const p = g.player;
    const obj = this.objective;

    // tutorial-ish objectives tracked from player state
    if (obj?.id === 'sprint' && p.isWolf && p.quadPose && p.speed > 20) {
      this.progress.sprint = (this.progress.sprint || 0) + dt;
      if (this.progress.sprint > 1.2) this._complete('sprint');
    }
    if (obj?.id === 'climb' && p.climbing) {
      this.progress.climb = (this.progress.climb || 0) + dt;
      if (this.progress.climb > 1) this._complete('climb');
    }
    if (obj?.id === 'leap' && p.isWolf && !p.onGround && p.vel.y > 20) this._complete('leap');

    // the shrine at the ruins
    const shrine = g.world.shrine;
    const dShrine = p.pos.distanceTo(shrine.pos);
    if (dShrine < 6) {
      if (!p.hasMoonfire) {
        g.hud.prompt(g.world.isNight ? 'E — Commune with the Moon Shrine' : 'The shrine is dormant. Return at night.');
        if (g.world.isNight && g.input.hit('interact') && !g.interactConsumed) {
          g.interactConsumed = true;
          p.hasMoonfire = true;
          g.audio.magic();
          g.audio.chime();
          g.fx.burst(shrine.pos.clone().add(new THREE.Vector3(0, 2, 0)), { count: 120, color: new THREE.Color('#8fc0ff'), speed: 10, size: 0.5, life: 1.5, gravity: 0 });
          g.hud.toast('You learned MOONFIRE (R): hurl lunar flame. Costs 30 rage.', 'gold', 5);
          p.skillPoints += 1;
          if (obj?.id === 'shrine') this._complete('shrine');
        }
      }
    }
    if (obj?.id === 'shrine' && p.hasMoonfire) this._complete('shrine');

    this._updateWorldInteractions(dt);

    // the alpha waits at the den once the story reaches it
    if (obj?.id === 'alpha' && !this.alphaSpawned) {
      const D = LANDMARKS.den;
      const den = new THREE.Vector3(D.x, terrainHeight(D.x, D.z), D.z + 8);
      if (p.pos.distanceTo(den) < 180) {
        this.alphaSpawned = true;
        g.npcs.spawn('alpha', den, { persistent: true, state: 'guard', home: den });
        for (let i = 0; i < 2; i++) g.npcs.spawn('rival', den.clone().add(new THREE.Vector3(rand(-10, 10), 0, rand(2, 10))), { persistent: true, state: 'guard', home: den });
        g.hud.toast('The Blackfang Alpha awaits.', 'red', 3);
      }
    }
    // after a couple of contracts or enough events, move the story along
    if (obj?.id === 'choose' && (g.rep.stats.eventsWon + this.contractsDone >= 3 || g.player.level >= 5)) this._complete('choose');

    // dynamic events
    this.eventTimer -= dt;
    if (this.eventTimer <= 0 && this.events.length < 2 && this.step >= 1) {
      this.eventTimer = rand(60, 100);
      this._spawnEvent();
    }
    for (const e of [...this.events]) {
      e.t += dt;
      const alive = e.npcs.filter((n) => !n.dead).length;
      if (alive === 0) this._resolveEvent(e, true);
      else if (e.kind === 'vampireAttack' && e.victims.every((v) => v.dead)) this._resolveEvent(e, false);
      else if (e.t > e.timeLimit) {
        this._resolveEvent(e, false);
        for (const n of e.npcs) if (!n.dead && n.distToPlayer > 120) g.npcs.remove(n);
      }
    }

    // contract offers
    if (this.offer) {
      this.offerExpire -= dt;
      if (g.input.hit('accept')) {
        const o = this.offer;
        this.offer = null;
        g.hud.showOffer(null);
        this._accepting = o;
        o.accept();
      } else if (g.input.hit('decline') || this.offerExpire <= 0) {
        this.offer = null;
        g.hud.showOffer(null);
      }
    } else if (!this.contract && this.step >= 5) {
      this.offerTimer -= dt;
      if (this.offerTimer <= 0) {
        this.offerTimer = rand(120, 200);
        this._makeOffer();
      }
    }
  }

  // vantage points, moonstones and the safehouse
  _updateWorldInteractions(dt) {
    const g = this.game;
    const p = g.player;
    const w = g.world;
    const E = () => g.input.hit('interact') && !g.interactConsumed && (g.interactConsumed = true);
    for (const v of w.vantages) {
      if (v.done) continue;
      if (Math.hypot(p.pos.x - v.pos.x, p.pos.z - v.pos.z) < 6 && Math.abs(p.pos.y - v.pos.y) < 3) {
        g.hud.prompt(`E: Survey Greyhaven from the ${v.name}`);
        if (E()) {
          v.done = true;
          v.beacon.visible = false;
          g.hud.reveal(v.pos, 420);
          p.addXP(60);
          g.audio.howl(0.7);
          if (p.isBeast) p.wolf.howlT = 1.6;
          g.hud.toast(`${v.name} surveyed: the surrounding area is revealed.`, 'gold', 3);
          this._complete('vantage');
        }
      }
    }
    for (const st of w.moonstones) {
      if (st.taken || st.pos.distanceTo(p.pos.clone().setY(p.pos.y + 1)) > 2.4) continue;
      st.taken = true;
      p.moonstones++;
      g.audio.chime();
      g.fx.burst(st.pos, { count: 30, color: new THREE.Color('#9fe8ff'), speed: 5, size: 0.4, life: 0.8, gravity: 0 });
      let msg = `Moonstone ${p.moonstones}/${w.moonstones.length}`;
      if (p.moonstones % 4 === 0) {
        p.skillPoints++;
        p.hpBonus += 0.05;
        msg += ': +1 skill point, +5% max health';
      }
      g.hud.toast(msg, 'gold', 2.5);
    }
    const home = w.safehouse.pos;
    if (Math.hypot(p.pos.x - home.x, p.pos.z - home.z) < 4 && p.pos.y < 2) {
      g.hud.prompt(`E: Rest at the safehouse (sleep until ${w.isNight ? 'morning' : 'dusk'}, heal, save)`);
      if (E()) {
        if (w.isNight) {
          if (w.time > 12) w.day += 1;
          w.time = 7;
        } else w.time = 19.4;
        p.healthFrac = 1;
        g.rep.heat = 0;
        g.save();
        g.hud.fadeSleep();
        g.hud.toast('You rest. Game saved.', 'gold', 2.5);
      }
    }
  }

  serialize() {
    const w = this.game.world;
    return {
      step: this.step, alphaDefeated: this.alphaDefeated, contractsDone: this.contractsDone, doneContracts: this.doneContracts || [],
      vantages: w.vantages.filter((v) => v.done).map((v) => v.name),
      moonstones: w.moonstones.map((m, i) => (m.taken ? i : -1)).filter((i) => i >= 0),
    };
  }

  load(d) {
    if (!d) return;
    this.step = d.step;
    this.alphaDefeated = d.alphaDefeated;
    this.contractsDone = d.contractsDone;
    this.doneContracts = d.doneContracts;
    if (this.step === STORY.findIndex((s) => s.id === 'alpha')) this.alphaSpawned = false;
    const w = this.game.world;
    for (const v of w.vantages) if (d.vantages?.includes(v.name)) {
      v.done = true;
      v.beacon.visible = false;
      this.game.hud.reveal(v.pos, 420);
    }
    for (const i of d.moonstones || []) if (w.moonstones[i]) w.moonstones[i].taken = true;
  }
}
