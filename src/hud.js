// DOM HUD, overlay canvas (health bars, markers, damage numbers, senses,
// speed lines), fog-of-war map and menus.
import * as THREE from 'three';
import { FORMS, PASSIVES, SKILLS } from './player.js';
import { DISTRICTS, WORLD_HALF, districtAt } from './world.js';
import { clamp } from './util.js';

const $ = (id) => document.getElementById(id);

export const CONTROLS = [
  ['WASD', 'Move'],
  ['Mouse', 'Look'],
  ['F · 1 / 2 / 3', 'Transform · pick human / hybrid / beast'],
  ['Shift', 'Sprint (beast drops to all fours)'],
  ['Space', 'Jump · beast: hold & release to leap'],
  ['Run into wall', 'Climb or mantle · Space on wall = wall-jump'],
  ['Shift + jump by a wall', 'Wall-run'],
  ['C / Ctrl', 'Dash (slide while sprinting)'],
  ['LMB', 'Combo attack · in the air: pounce'],
  ['RMB', 'Heavy · high in the air: ground slam'],
  ['X (hold)', 'Block · tap just before a hit to PARRY'],
  ['T / MMB', 'Lock on'],
  ['G', 'Grab · G or LMB again to throw'],
  ['E', 'Finisher on weakened foes · feed · interact'],
  ['Z', 'Blood Moon Frenzy (full rage)'],
  ['Q', 'Howl'],
  ['R', 'Moonfire (learned at the Ancient Ruins)'],
  ['V', 'Keen Senses'],
  ['Y / N', 'Accept / decline contract'],
  ['Tab · M · P', 'Skills · map · photo mode'],
  ['Esc', 'Pause'],
  ['Gamepad', 'Supported (Xbox layout)'],
];

const RANKS = ['', 'C', 'B', 'A', 'S', 'SAVAGE'];
const FOG = 128;

export class HUD {
  constructor(game) {
    this.game = game;
    this.overlay = $('overlay');
    this.octx = this.overlay.getContext('2d');
    this.mini = $('minimap').getContext('2d');
    this.big = $('bigmap').getContext('2d');
    this.toastsEl = $('toasts');
    this.hurtV = 0;
    this._promptText = '';
    this._promptSet = false;
    this.floats = [];
    this.speedLines = [];
    for (let i = 0; i < 70; i++) this.speedLines.push({ a: Math.random() * Math.PI * 2, r: Math.random(), s: 0.5 + Math.random() });
    const grid = CONTROLS.map(([k, v]) => `<kbd>${k}</kbd><span>${v}</span>`).join('');
    $('controls-title').innerHTML = grid;
    $('controls-pause').innerHTML = grid;
    $('passives').innerHTML = '<div class="ph">HUMAN PASSIVES</div>' + PASSIVES.map((p) => `<div class="pv" title="${p.desc}">◆ ${p.name}</div>`).join('');
    // fog of war: what you've explored (or surveyed from a spire)
    this.fog = document.createElement('canvas');
    this.fog.width = this.fog.height = FOG;
    this.fctx = this.fog.getContext('2d');
    this.fctx.fillStyle = '#000';
    this.fctx.fillRect(0, 0, FOG, FOG);
    this.fctx.globalCompositeOperation = 'destination-out';
    this._revealT = 0;
    this._resize();
    addEventListener('resize', () => this._resize());
  }

  _resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.overlay.width = innerWidth * dpr;
    this.overlay.height = innerHeight * dpr;
    this.octx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  show(on) {
    $('hud').classList.toggle('hidden', !on);
  }

  toast(text, kind = 'gray', dur = 2.5) {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = text;
    this.toastsEl.appendChild(el);
    while (this.toastsEl.children.length > 4) this.toastsEl.firstChild.remove();
    setTimeout(() => el.remove(), dur * 1000);
  }

  repPopup(d, reason) {
    const el = document.createElement('div');
    el.className = `rep-pop ${d >= 0 ? 'good' : 'bad'}`;
    el.textContent = `${d >= 0 ? '▲' : '▼'} ${reason}`;
    $('hud').appendChild(el);
    setTimeout(() => el.remove(), 1800);
  }

  hurt(v) {
    this.hurtV = Math.max(this.hurtV, v);
  }

  prompt(text) {
    this._promptText = text;
    this._promptSet = true;
  }

  floatText(pos, text, color = '#fff', size = 18) {
    this.floats.push({ pos: pos.clone(), text, color, t: 1.1, size, vy: 1.2 });
  }

  damageNumber(pos, amount, crit = false) {
    const p = pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 0, (Math.random() - 0.5) * 0.8));
    this.floats.push({ pos: p, text: String(Math.round(amount)), color: crit ? '#ff5050' : amount > 40 ? '#ffd27a' : '#f0ece4', t: 0.8, size: crit || amount > 40 ? 20 : 15, vy: 2 });
  }

  reveal(pos, radius) {
    const s = FOG / (2 * WORLD_HALF);
    const x = (pos.x + WORLD_HALF) * s, y = (pos.z + WORLD_HALF) * s, r = radius * s;
    const grd = this.fctx.createRadialGradient(x, y, r * 0.6, x, y, r);
    grd.addColorStop(0, 'rgba(0,0,0,1)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    this.fctx.fillStyle = grd;
    this.fctx.beginPath();
    this.fctx.arc(x, y, r, 0, Math.PI * 2);
    this.fctx.fill();
  }

  fadeSleep() {
    const el = $('sleep-fade');
    el.classList.remove('hidden');
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    setTimeout(() => el.classList.add('hidden'), 2600);
  }

  showOffer(o) {
    const el = $('offer');
    if (!o) { el.classList.add('hidden'); return; }
    el.innerHTML = `<h4>${o.title}</h4><div class="from">${o.from}</div><p>${o.text}</p><div class="keys">[Y] Accept &nbsp; [N] Decline</div>`;
    el.classList.remove('hidden');
  }

  showDeath(on) {
    $('death-screen').classList.toggle('hidden', !on);
  }

  showEnding(title, text, rep) {
    $('ending-title').textContent = title;
    $('ending-text').textContent = text;
    const s = rep.stats;
    $('ending-stats').innerHTML = `Morality ${Math.round(rep.morality)} · ${rep.title}<br>Monsters slain ${s.monstersSlain} · Hunters killed ${s.huntersKilled}<br>Civilians saved ${s.civiliansSaved} · Civilians killed ${s.civiliansKilled}<br>Best combo ${this.game.player.bestCombo} · Moonstones ${this.game.player.moonstones}`;
    $('ending-screen').classList.remove('hidden');
    this.game.setPaused(true, 'ending');
  }

  showPhoto(on) {
    $('photo-hint').classList.toggle('hidden', !on);
    $('hud').style.visibility = on ? 'hidden' : 'visible';
    this.overlay.style.visibility = on ? 'hidden' : 'visible';
  }

  renderSkills() {
    const p = this.game.player;
    $('skill-points').textContent = `Skill points: ${p.skillPoints}   ·   Level ${p.level}   ·   Moonstones ${p.moonstones}`;
    const list = $('skill-list');
    list.innerHTML = '';
    for (const [id, s] of Object.entries(SKILLS)) {
      const rank = p.skills[id];
      const el = document.createElement('div');
      el.className = 'skill' + (rank >= s.max ? ' maxed' : '');
      el.innerHTML = `<span class="rank">${'●'.repeat(rank)}${'○'.repeat(s.max - rank)}</span><div class="name">${s.name}</div><div class="desc">${s.desc}</div>`;
      el.onclick = () => {
        if (p.skillPoints > 0 && p.skills[id] < s.max) {
          p.skills[id]++;
          p.skillPoints--;
          this.game.audio.chime();
          this.renderSkills();
        }
      };
      list.appendChild(el);
    }
  }

  renderStats() {
    const g = this.game;
    const r = g.rep, s = r.stats;
    const f = r.factions;
    const v = g.world.vantages.filter((x) => x.done).length;
    $('stats').innerHTML = `Title: <b>${r.title}</b><br>Morality ${Math.round(r.morality)}<br>
      Citizens ${Math.round(f.citizens)} · Hunters ${Math.round(f.hunters)}<br>Vampire Court ${Math.round(f.vampires)} · Blackfang ${Math.round(f.pack)}<br>
      Monsters slain ${s.monstersSlain} · Saved ${s.civiliansSaved} · Innocents killed ${s.civiliansKilled}<br>
      Best combo ${g.player.bestCombo} · Moonstones ${g.player.moonstones}/${g.world.moonstones.length} · Spires ${v}/${g.world.vantages.length}`;
  }

  _drawFog(ctx, x, y, w, h) {
    ctx.save();
    ctx.globalAlpha = 0.82;
    ctx.drawImage(this.fog, x, y, w, h);
    ctx.restore();
  }

  renderBigMap() {
    const g = this.game;
    const ctx = this.big;
    const S = 640;
    ctx.drawImage(g.world.mapCanvas, 0, 0, S, S);
    this._drawFog(ctx, 0, 0, S, S);
    const toPx = (v) => ((v + WORLD_HALF) / (2 * WORLD_HALF)) * S;
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    for (const v of g.world.vantages) {
      ctx.fillStyle = v.done ? '#9a9a9a' : '#ff4040';
      ctx.beginPath();
      ctx.moveTo(toPx(v.pos.x), toPx(v.pos.z) - 7);
      ctx.lineTo(toPx(v.pos.x) + 5, toPx(v.pos.z) + 4);
      ctx.lineTo(toPx(v.pos.x) - 5, toPx(v.pos.z) + 4);
      ctx.fill();
    }
    const home = g.world.safehouse.pos;
    ctx.fillStyle = '#9aff6a';
    ctx.fillRect(toPx(home.x) - 4, toPx(home.z) - 4, 8, 8);
    for (const m of g.director.markers()) {
      ctx.fillStyle = m.kind === 'story' ? '#e8c26a' : m.kind === 'contract' ? '#ff5a5a' : '#ffffff';
      ctx.beginPath();
      ctx.arc(toPx(m.x), toPx(m.z), 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText(m.label, toPx(m.x), toPx(m.z) - 10);
    }
    for (const l of Object.values(g.landmarks)) {
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText(l.name, toPx(l.x), toPx(l.z) + 18);
    }
    this._drawArrow(ctx, toPx(g.player.pos.x), toPx(g.player.pos.z), g.player.yaw, 9, '#ffb44a');
    $('territory').innerHTML = DISTRICTS.map((d) => `<span>${d}: <b style="color:#e8c26a">${Math.round(g.rep.territory[d])}%</b></span>`).join('') + '<span>▲ spire · ■ safehouse</span>';
  }

  _drawArrow(ctx, x, y, yaw, s, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-yaw + Math.PI);
    ctx.fillStyle = color;
    ctx.strokeStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.lineTo(s * 0.7, s * 0.8);
    ctx.lineTo(0, s * 0.4);
    ctx.lineTo(-s * 0.7, s * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  _minimap() {
    const g = this.game;
    const ctx = this.mini;
    const S = 200;
    const p = g.player.pos;
    const range = 160;
    const mapPx = g.world.mapCanvas.width;
    const scale = mapPx / (2 * WORLD_HALF);
    ctx.save();
    ctx.clearRect(0, 0, S, S);
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, S, S);
    ctx.translate(S / 2, S / 2);
    ctx.rotate(g.camera.yaw - Math.PI);
    const k = S / (2 * range);
    ctx.scale(k, k);
    ctx.drawImage(g.world.mapCanvas, -WORLD_HALF - p.x, -WORLD_HALF - p.z, mapPx / scale, mapPx / scale);
    this._drawFog(ctx, -WORLD_HALF - p.x, -WORLD_HALF - p.z, 2 * WORLD_HALF, 2 * WORLD_HALF);
    for (const o of g.npcs.list) {
      if (o.dead) continue;
      const dx = o.pos.x - p.x, dz = o.pos.z - p.z;
      if (Math.abs(dx) > range * 1.5 || Math.abs(dz) > range * 1.5) continue;
      let c = null;
      const hostile = g.npcs.isHostileToPlayer(o);
      if (o.type === 'civilian') c = 'rgba(220,220,220,0.6)';
      else if (o.type === 'police') c = hostile ? '#4a7aff' : '#9ab0ff';
      else if (o.type === 'hunter' || o.type === 'captain') c = hostile ? '#ff3b3b' : '#ffb0b0';
      else if (o.type === 'vampire') c = '#c04aff';
      else if (o.type === 'witch' || o.type === 'ghoul') c = '#6aff9a';
      else if (o.type === 'demon') c = '#ff7a1a';
      else if (o.type === 'rival' || o.type === 'alpha') c = hostile ? '#ff7a2a' : '#8a8a8a';
      else if (o.type === 'packmate') c = '#7fd0ff';
      else if (o.def.animal) c = '#c8a878';
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(dx, dz, o.type === 'civilian' || o.def.animal ? 2.2 : o.type === 'demon' ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    for (const m of g.director.markers()) {
      const dx = m.x - p.x, dz = m.z - p.z;
      const a = Math.atan2(dz, dx) + (g.camera.yaw - Math.PI);
      const d = Math.min(Math.hypot(dx, dz) * k, S / 2 - 8);
      const x = S / 2 + Math.cos(a) * d, y = S / 2 + Math.sin(a) * d;
      ctx.fillStyle = m.kind === 'story' ? '#e8c26a' : m.kind === 'contract' ? '#ff5a5a' : '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.stroke();
    }
    this._drawArrow(ctx, S / 2, S / 2, g.player.yaw - g.camera.yaw + Math.PI, 8, '#ffb44a');
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    const na = -Math.PI / 2 + (g.camera.yaw - Math.PI);
    ctx.fillText('N', S / 2 + Math.cos(na) * 88, S / 2 + Math.sin(na) * 88 + 4);
  }

  _project(v, cam, W, H) {
    v.project(cam);
    if (v.z > 1) return null;
    return [(v.x * 0.5 + 0.5) * W, (-v.y * 0.5 + 0.5) * H];
  }

  _overlay(dt) {
    const g = this.game;
    const ctx = this.octx;
    const W = innerWidth, H = innerHeight;
    ctx.clearRect(0, 0, W, H);
    const cam = g.camera3;
    const v = new THREE.Vector3();
    const player = g.player;

    // Keen Senses: heartbeats through walls, scent trail, moonstones
    if (player.senses) {
      const range = player.isWolf ? 90 : 160;
      const pulse = 0.5 + Math.sin(performance.now() * 0.008) * 0.5;
      for (const o of g.npcs.list) {
        if (o.dead || o.distToPlayer > range) continue;
        const s = this._project(v.copy(o.pos).setY(o.pos.y + o.def.height * 0.6), cam, W, H);
        if (!s) continue;
        const hostile = g.npcs.isHostileToPlayer(o);
        ctx.strokeStyle = hostile ? `rgba(255,60,60,${0.5 + pulse * 0.4})` : o.victimOf ? 'rgba(255,200,80,0.9)' : o.def.animal ? 'rgba(200,170,120,0.7)' : 'rgba(200,220,255,0.5)';
        ctx.lineWidth = 2;
        const r = (6 + pulse * 4) * clamp(30 / Math.max(o.distToPlayer, 5), 0.5, 2.5);
        ctx.beginPath();
        ctx.arc(s[0], s[1], r, 0, Math.PI * 2);
        ctx.stroke();
      }
      const m = g.director.objectiveMarker() || g.director.events[0]?.pos;
      if (m) {
        const dir = new THREE.Vector3(m.x - player.pos.x, 0, m.z - player.pos.z);
        const len = dir.length();
        dir.normalize();
        ctx.fillStyle = 'rgba(255,200,90,0.75)';
        for (let i = 1; i < 14 && i * 4 < len; i++) {
          const wob = Math.sin(i * 1.3 + performance.now() * 0.002) * 0.6;
          v.set(player.pos.x + dir.x * i * 4 - dir.z * wob, player.pos.y + 0.2, player.pos.z + dir.z * i * 4 + dir.x * wob);
          const s = this._project(v, cam, W, H);
          if (s) {
            ctx.beginPath();
            ctx.arc(s[0], s[1], 3.5 - i * 0.15, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      for (const st of g.world.moonstones) {
        if (st.taken || st.pos.distanceTo(player.pos) > 140) continue;
        const s = this._project(v.copy(st.pos), cam, W, H);
        if (!s) continue;
        ctx.fillStyle = '#9fe8ff';
        ctx.beginPath();
        ctx.moveTo(s[0], s[1] - 8);
        ctx.lineTo(s[0] + 6, s[1]);
        ctx.lineTo(s[0], s[1] + 8);
        ctx.lineTo(s[0] - 6, s[1]);
        ctx.fill();
      }
    }

    // health bars
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    for (const o of g.npcs.list) {
      if (o.dead || o.distToPlayer > 60) continue;
      const hostile = g.npcs.isHostileToPlayer(o);
      if (!hostile && o.hp >= o.maxHp && o.type !== 'packmate') continue;
      const s = this._project(v.copy(o.pos).setY(o.pos.y + o.def.height + 0.5), cam, W, H);
      if (!s) continue;
      const [x, y] = s;
      const big = o.type === 'alpha' || o.type === 'demon';
      const w = big ? 90 : 46;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x - w / 2, y, w, 5);
      ctx.fillStyle = o.type === 'packmate' ? '#7fd0ff' : hostile ? '#d8283a' : '#d8d0c0';
      ctx.fillRect(x - w / 2, y, w * clamp(o.hp / o.maxHp, 0, 1), 5);
      const label = { alpha: 'BLACKFANG ALPHA', captain: 'HUNTER CAPTAIN', demon: 'DEMON BRUTE' }[o.type];
      if (label) {
        ctx.fillStyle = '#fff';
        ctx.fillText(label, x, y - 4);
      }
      if (o.stun > 0) {
        ctx.fillStyle = '#9fc7ff';
        ctx.fillText('✦ STUNNED', x, y - (label ? 16 : 4));
      }
      // finisher prompt
      const finish = (o.hp / o.maxHp < (big || o.type === 'captain' ? 0.15 : 0.3) || o.stun > 0.2) && o.distToPlayer < 3.6 && player.isWolf;
      if (finish && hostile) {
        ctx.fillStyle = '#ff4040';
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText('[E] FINISH', x, y + 18);
        ctx.font = '11px sans-serif';
      }
      if (o.windup > 0) {
        ctx.fillStyle = '#ff7a1a';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText('!', x, y - 20);
        ctx.font = '11px sans-serif';
      }
    }
    // victims needing rescue
    for (const o of g.npcs.list) {
      if (o.dead || !o.victimOf || o.distToPlayer > 150) continue;
      const s = this._project(v.copy(o.pos).setY(o.pos.y + 2.4), cam, W, H);
      if (!s) continue;
      ctx.fillStyle = '#ff5050';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText('!', s[0], s[1]);
    }
    // lock-on reticle
    const t = player.lockTarget;
    if (t && !t.dead) {
      const s = this._project(v.copy(t.pos).setY(t.pos.y + t.def.height * 0.6), cam, W, H);
      if (s) {
        const r = 16 + Math.sin(performance.now() * 0.01) * 2;
        ctx.strokeStyle = '#ff4040';
        ctx.lineWidth = 2;
        for (let i = 0; i < 4; i++) {
          const a = (i * Math.PI) / 2 + performance.now() * 0.002;
          ctx.beginPath();
          ctx.arc(s[0], s[1], r, a, a + 0.9);
          ctx.stroke();
        }
      }
    }
    // world markers
    for (const m of g.director.markers()) {
      v.set(m.x, player.pos.y + 4, m.z);
      const d = Math.hypot(m.x - player.pos.x, m.z - player.pos.z);
      v.project(cam);
      if (v.z > 1) continue;
      const x = clamp((v.x * 0.5 + 0.5) * W, 30, W - 30), y = clamp((-v.y * 0.5 + 0.5) * H, 30, H - 30);
      ctx.fillStyle = m.kind === 'story' ? '#e8c26a' : m.kind === 'contract' ? '#ff5a5a' : '#ffffff';
      ctx.beginPath();
      ctx.moveTo(x, y + 8);
      ctx.lineTo(x - 6, y - 4);
      ctx.lineTo(x + 6, y - 4);
      ctx.fill();
      ctx.font = '11px sans-serif';
      ctx.fillText(`${m.label} ${Math.round(d)}m`, x, y - 10);
    }
    // floating damage numbers / callouts
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.t -= dt;
      f.pos.y += f.vy * dt;
      if (f.t <= 0) { this.floats.splice(i, 1); continue; }
      const s = this._project(v.copy(f.pos), cam, W, H);
      if (!s) continue;
      ctx.globalAlpha = clamp(f.t * 2, 0, 1);
      ctx.font = `900 ${f.size}px sans-serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText(f.text, s[0], s[1]);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, s[0], s[1]);
      ctx.globalAlpha = 1;
    }
    // speed lines
    const sp = player.speed;
    const intensity = clamp((sp - 18) / 16, 0, 1);
    if (intensity > 0) {
      ctx.strokeStyle = `rgba(255,255,255,${0.18 * intensity})`;
      ctx.lineWidth = 1.5;
      for (const l of this.speedLines) {
        l.r += dt * l.s * 2.5;
        if (l.r > 1) { l.r = 0.25; l.a = Math.random() * Math.PI * 2; }
        const r0 = Math.max(W, H) * (0.3 + l.r * 0.5);
        const r1 = r0 + 60 * l.s * intensity;
        ctx.beginPath();
        ctx.moveTo(W / 2 + Math.cos(l.a) * r0, H / 2 + Math.sin(l.a) * r0);
        ctx.lineTo(W / 2 + Math.cos(l.a) * r1, H / 2 + Math.sin(l.a) * r1);
        ctx.stroke();
      }
    }
  }

  update(dt) {
    const g = this.game;
    const p = g.player;
    const w = g.world;
    const r = g.rep;
    const fk = p.formKey;
    const formEl = $('form-label');
    formEl.textContent = p.form === 'transforming' ? 'CHANGING…' : FORMS[fk].name + (p.frenzyT > 0 ? ' · FRENZY' : '');
    formEl.className = fk === 'human' ? '' : fk === 'hybrid' ? 'hybrid' : 'wolf';
    $('forms').innerHTML = ['human', 'hybrid', 'wolf'].map((k, i) => `<span class="${k === fk ? 'on' : ''}">${i + 1} ${FORMS[k].name}</span>`).join('');
    $('passives').classList.toggle('hidden', fk !== 'human');
    $('hp-fill').style.width = `${p.healthFrac * 100}%`;
    $('hp-text').textContent = `${Math.ceil(p.health)} / ${p.maxHealth}`;
    $('rage-fill').style.width = `${p.rage}%`;
    $('rage-fill').classList.toggle('full', p.rage >= 100);
    $('xp-fill').style.width = `${(p.xp / p.xpToNext) * 100}%`;
    $('level').textContent = `LV ${p.level}${p.skillPoints ? `  ·  ${p.skillPoints} SKILL PT (Tab)` : ''}${p.rage >= 100 && p.isWolf && p.frenzyT <= 0 ? '  ·  [Z] FRENZY READY' : ''}`;
    const ab = [
      ['Q', 'Howl', p.howlCd, 14, p.isWolf],
      ['R', 'Moon', p.spellCd, 1.2, p.hasMoonfire],
      ['C', 'Dash', p.dashCd, 1, true],
      ['F', 'Shift', p.transformCooldown, 1.2, true],
      ['G', p.held ? 'Throw' : 'Grab', 0, 1, true],
      ['V', 'Sense', 0, 1, true],
    ];
    const abHtml = ab.map(([k, n, cd, max, ok]) => `<div class="ab ${ok ? '' : 'locked'} ${k === 'V' && p.senses ? 'active' : ''}"><b>${k}</b>${n}${cd > 0 ? `<div class="cd" style="height:${clamp(cd / max, 0, 1) * 100}%"></div>` : ''}</div>`).join('');
    if (abHtml !== this._abHtml) $('abilities').innerHTML = this._abHtml = abHtml;

    const hh = Math.floor(w.time), mm = Math.floor((w.time % 1) * 60);
    $('clock').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}  ·  DAY ${w.day}`;
    const moonEl = $('moon');
    const tonight = ((w.day % 3) + 3) % 3; // a night belongs to the day it starts on
    moonEl.textContent = (w.isNight ? `☾ ${w.moonPhaseName}` : `☀ Tonight: ${['Waxing Crescent', 'Waxing Gibbous', 'FULL MOON'][tonight]}`) + `  ·  ${g.weather.label}`;
    moonEl.classList.toggle('full', w.isFullMoonNight);
    const d = districtAt(p.pos.x, p.pos.z);
    $('district').textContent = `${d} · territory ${Math.round(r.territory[d])}%`;
    const heat = Math.ceil(r.heat - 0.05);
    $('heat').innerHTML = [0, 1, 2, 3, 4].map((i) => `<span class="${i < heat ? 'on' : ''}">✸</span>`).join('');
    $('title').textContent = r.title;
    $('morality-marker').style.left = `calc(${(r.morality + 100) / 2}% - 2px)`;
    const obj = g.director.objective;
    $('objective').textContent = obj ? obj.text : '';
    const c = g.director.contract;
    $('contract').textContent = c ? `CONTRACT: ${c.title} (${c.count}/${c.need})` : g.director.events.length ? `EVENT: ${g.director.events.map((e) => e.title).join(', ')}` : '';
    $('charge-ring').style.strokeDashoffset = `${138 * (1 - p.charge)}`;
    // combo + flow
    const comboEl = $('combo');
    if (p.hitCount >= 3) {
      comboEl.classList.remove('hidden');
      comboEl.innerHTML = `<div class="n">${p.hitCount}</div><div class="r r${p.comboRank}">${RANKS[p.comboRank] || 'HITS'}</div><div class="bar"><i style="width:${clamp(p.hitTimer / 3, 0, 1) * 100}%"></i></div>`;
    } else comboEl.classList.add('hidden');
    $('flow').textContent = p.flow > 0 ? `FLOW ×${p.flow}` : '';
    $('prompt').textContent = this._promptSet ? this._promptText : '';
    if (!this._promptSet && p.isWolf && !p.dead) {
      if (g.npcs.nearestFinishable(p.pos, 3.6, p.formKey)) $('prompt').textContent = 'E: Finisher';
      else if (g.npcs.nearestCorpse(p.pos, 3.5)) $('prompt').textContent = 'E: Feed';
    }
    this._promptSet = false;

    this.hurtV = Math.max(0, this.hurtV - dt * 1.5);
    const lowHp = p.healthFrac < 0.3 ? 0.35 + Math.sin(performance.now() * 0.006) * 0.15 : 0;
    $('hurt').style.opacity = Math.max(this.hurtV, lowHp);
    $('frenzy').style.opacity = p.frenzyT > 0 ? 0.55 + Math.sin(performance.now() * 0.01) * 0.15 : 0;
    g.canvas.style.filter = p.senses ? 'saturate(0.25) brightness(1.15) sepia(0.35) hue-rotate(-20deg)' : g.slowmoT > 0 ? 'saturate(0.6) contrast(1.1)' : '';

    // explore the map as you move
    this._revealT -= dt;
    if (this._revealT <= 0) {
      this._revealT = 0.5;
      this.reveal(p.pos, 110);
    }
    this._minimap();
    this._overlay(dt);
  }
}
