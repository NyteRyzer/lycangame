// DOM HUD, overlay canvas (health bars, markers, speed lines) and menus.
import * as THREE from 'three';
import { SKILLS } from './player.js';
import { DISTRICTS, WORLD_HALF, districtAt } from './world.js';
import { clamp } from './util.js';

const $ = (id) => document.getElementById(id);

export const CONTROLS = [
  ['WASD', 'Move'],
  ['Mouse', 'Look'],
  ['Shift', 'Sprint (beast: drop to all fours)'],
  ['Space', 'Jump · hold & release for charged leap (beast)'],
  ['Run into wall', 'Climb (beast) · Space on wall = wall-jump'],
  ['F', 'Transform (human ⇄ beast)'],
  ['LMB', 'Claw combo · in the air: pounce'],
  ['RMB', 'Heavy smash · high in the air: ground slam'],
  ['C / Alt', 'Dash'],
  ['Q', 'Howl (fear, stun, damage buff)'],
  ['R', 'Moonfire (learned at the Ancient Ruins)'],
  ['E', 'Interact · feed on the fallen (heals)'],
  ['Y / N', 'Accept / decline contract'],
  ['Tab', 'Skills'],
  ['M', 'Map'],
  ['Esc', 'Pause'],
  ['Gamepad', 'Supported (Xbox layout)'],
];

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
    this.speedLines = [];
    for (let i = 0; i < 70; i++) this.speedLines.push({ a: Math.random() * Math.PI * 2, r: Math.random(), s: 0.5 + Math.random() });
    const grid = CONTROLS.map(([k, v]) => `<kbd>${k}</kbd><span>${v}</span>`).join('');
    $('controls-title').innerHTML = grid;
    $('controls-pause').innerHTML = grid;
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
    $('ending-stats').innerHTML = `Morality ${Math.round(rep.morality)} · ${rep.title}<br>Monsters slain ${s.monstersSlain} · Hunters killed ${s.huntersKilled}<br>Civilians saved ${s.civiliansSaved} · Civilians killed ${s.civiliansKilled}`;
    $('ending-screen').classList.remove('hidden');
    this.game.setPaused(true, 'ending');
  }

  renderSkills() {
    const p = this.game.player;
    $('skill-points').textContent = `Skill points: ${p.skillPoints}   ·   Level ${p.level}`;
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
    const r = this.game.rep, s = r.stats;
    const f = r.factions;
    $('stats').innerHTML = `Title: <b>${r.title}</b><br>Morality ${Math.round(r.morality)}<br>
      Citizens ${Math.round(f.citizens)} · Hunters ${Math.round(f.hunters)}<br>Vampire Court ${Math.round(f.vampires)} · Blackfang ${Math.round(f.pack)}<br>
      Monsters slain ${s.monstersSlain} · Saved ${s.civiliansSaved} · Innocents killed ${s.civiliansKilled}`;
  }

  renderBigMap() {
    const g = this.game;
    const ctx = this.big;
    const S = 640;
    ctx.drawImage(g.world.mapCanvas, 0, 0, S, S);
    const toPx = (v) => ((v + WORLD_HALF) / (2 * WORLD_HALF)) * S;
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    for (const m of g.director.markers()) {
      ctx.fillStyle = m.kind === 'story' ? '#e8c26a' : m.kind === 'contract' ? '#ff5a5a' : '#ffffff';
      ctx.beginPath();
      ctx.arc(toPx(m.x), toPx(m.z), 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText(m.label, toPx(m.x), toPx(m.z) - 10);
    }
    for (const [k, l] of Object.entries({ ...g.landmarks })) {
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText(l.name, toPx(l.x), toPx(l.z) + 18);
    }
    this._drawArrow(ctx, toPx(g.player.pos.x), toPx(g.player.pos.z), g.player.yaw, 9, '#ffb44a');
    $('territory').innerHTML = DISTRICTS.map((d) => `<span>${d}: <b style="color:#e8c26a">${Math.round(g.rep.territory[d])}%</b></span>`).join('');
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
    const range = 160; // world units across radius
    const mapPx = g.world.mapCanvas.width;
    const scale = mapPx / (2 * WORLD_HALF);
    ctx.save();
    ctx.clearRect(0, 0, S, S);
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, S, S);
    // rotate with camera so "up" is where you look
    ctx.translate(S / 2, S / 2);
    ctx.rotate(g.camera.yaw - Math.PI);
    const k = S / (2 * range);
    ctx.scale(k, k);
    ctx.drawImage(g.world.mapCanvas, (-WORLD_HALF - p.x), (-WORLD_HALF - p.z), mapPx / scale, mapPx / scale);
    // NPC dots
    for (const o of g.npcs.list) {
      if (o.dead) continue;
      const dx = o.pos.x - p.x, dz = o.pos.z - p.z;
      if (Math.abs(dx) > range * 1.5 || Math.abs(dz) > range * 1.5) continue;
      let c = null;
      if (o.type === 'civilian') c = 'rgba(220,220,220,0.6)';
      else if (o.type === 'hunter' || o.type === 'captain') c = g.npcs.isHostileToPlayer(o) ? '#ff3b3b' : '#ffb0b0';
      else if (o.type === 'vampire') c = '#c04aff';
      else if (o.type === 'rival' || o.type === 'alpha') c = g.npcs.isHostileToPlayer(o) ? '#ff7a2a' : '#8a8a8a';
      else if (o.type === 'packmate') c = '#7fd0ff';
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(dx, dz, o.type === 'civilian' ? 2.2 : 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // markers clamped to the rim
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

  _overlay(dt) {
    const g = this.game;
    const ctx = this.octx;
    const W = innerWidth, H = innerHeight;
    ctx.clearRect(0, 0, W, H);
    const cam = g.camera3;
    const v = new THREE.Vector3();
    // health bars above hostile / damaged NPCs
    for (const o of g.npcs.list) {
      if (o.dead || o.distToPlayer > 60) continue;
      const hostile = g.npcs.isHostileToPlayer(o);
      if (!hostile && o.hp >= o.maxHp && o.type !== 'packmate') continue;
      v.copy(o.pos).setY(o.pos.y + o.def.height + 0.5).project(cam);
      if (v.z > 1) continue;
      const x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H;
      const w = o.type === 'alpha' ? 90 : 46;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x - w / 2, y, w, 5);
      ctx.fillStyle = o.type === 'packmate' ? '#7fd0ff' : hostile ? '#d8283a' : '#d8d0c0';
      ctx.fillRect(x - w / 2, y, w * clamp(o.hp / o.maxHp, 0, 1), 5);
      if (o.type === 'alpha' || o.type === 'captain') {
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff';
        ctx.fillText(o.type === 'alpha' ? 'BLACKFANG ALPHA' : 'HUNTER CAPTAIN', x, y - 4);
      }
      if (o.stun > 0) {
        ctx.fillStyle = '#9fc7ff';
        ctx.fillText('✦', x, y - 4);
      }
    }
    // victim indicators
    for (const o of g.npcs.list) {
      if (o.dead || !o.victimOf || o.distToPlayer > 150) continue;
      v.copy(o.pos).setY(o.pos.y + 2.4).project(cam);
      if (v.z > 1) continue;
      ctx.fillStyle = '#ff5050';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('!', (v.x * 0.5 + 0.5) * W, (-v.y * 0.5 + 0.5) * H);
    }
    // world markers
    for (const m of g.director.markers()) {
      v.set(m.x, g.player.pos.y + 4, m.z);
      const d = Math.hypot(m.x - g.player.pos.x, m.z - g.player.pos.z);
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
      ctx.textAlign = 'center';
      ctx.fillText(`${m.label} ${Math.round(d)}m`, x, y - 10);
    }
    // speed lines when the beast is flying
    const sp = g.player.speed;
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
    const formEl = $('form-label');
    const form = p.form === 'transforming' ? 'CHANGING…' : p.isWolf ? 'BEAST' : 'HUMAN';
    formEl.textContent = form;
    formEl.classList.toggle('wolf', p.isWolf);
    $('hp-fill').style.width = `${p.healthFrac * 100}%`;
    $('hp-text').textContent = `${Math.ceil(p.health)} / ${p.maxHealth}`;
    $('rage-fill').style.width = `${p.rage}%`;
    $('xp-fill').style.width = `${(p.xp / p.xpToNext) * 100}%`;
    $('level').textContent = `LV ${p.level}${p.skillPoints ? `  ·  ${p.skillPoints} SKILL PT (Tab)` : ''}`;
    const ab = [
      ['Q', 'Howl', p.howlCd, 14, p.isWolf],
      ['R', 'Moon', p.spellCd, 1.2, p.hasMoonfire],
      ['C', 'Dash', p.dashCd, 1, true],
      ['F', 'Shift', p.transformCooldown, 1.5, true],
    ];
    $('abilities').innerHTML = ab.map(([k, n, cd, max, ok]) => `<div class="ab ${ok ? '' : 'locked'}"><b>${k}</b>${n}${cd > 0 ? `<div class="cd" style="height:${clamp(cd / max, 0, 1) * 100}%"></div>` : ''}</div>`).join('');

    const hh = Math.floor(w.time), mm = Math.floor((w.time % 1) * 60);
    $('clock').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}  ·  DAY ${w.day}`;
    const moonEl = $('moon');
    const tonight = ((w.day % 3) + 3) % 3; // a night belongs to the day it starts on
    moonEl.textContent = w.isNight ? `☾ ${w.moonPhaseName}` : `☀ Tonight: ${['Waxing Crescent', 'Waxing Gibbous', 'FULL MOON'][tonight]}`;
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
    $('prompt').textContent = this._promptSet ? this._promptText : '';
    if (!this._promptSet && p.isWolf && !p.dead && g.npcs.nearestCorpse(p.pos, 3.5)) $('prompt').textContent = 'E — Feed';
    this._promptSet = false;

    this.hurtV = Math.max(0, this.hurtV - dt * 1.5);
    const lowHp = p.healthFrac < 0.3 ? 0.35 + Math.sin(performance.now() * 0.006) * 0.15 : 0;
    $('hurt').style.opacity = Math.max(this.hurtV, lowHp);

    this._minimap();
    this._overlay(dt);
  }
}
