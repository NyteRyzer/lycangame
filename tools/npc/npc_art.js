// Cartoon character art for the fighters that have no sprite sheet (Mr. Lahey, Randy, J-Roc).
// Each character is a cut-out rig of vector parts in the reference sheet's style:
// heavy ink outlines, hard cel shading, 3/4 view heads. Runs in a browser page; see
// render_npcs.js. Units: the figure stands about 780 tall with its feet at y = 0.
'use strict';
const INK = '#151016';
const SW = 7;

const fmt = n => +n.toFixed(2);
const P = (d, fill, extra = '') => `<path d="${d}" fill="${fill}" stroke="${INK}" ${extra.includes('stroke-width') ? '' : `stroke-width="${SW}" `}stroke-linejoin="round" stroke-linecap="round" ${extra}/>`;
const shade = (d, a = 0.24) => `<path d="${d}" fill="#1a0e26" opacity="${a}"/>`;
const line = (d, w = 3, col = INK, op = 1) => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" opacity="${op}"/>`;
const g = (tf, body) => `<g transform="${tf}">${body}</g>`;
const rot = deg => `rotate(${fmt(-deg)})`; // forward-positive angles: 0 = straight down

// tapered limb from (0,0) down to (0,len); the back side (-x) gets the shadow
function limb(len, w0, w1, fill, bulge = 0, shadeA = 0.24) {
  const a = w0 / 2, b = w1 / 2, m = (a + b) / 2 + bulge;
  const d = `M ${-a},0 Q ${-m},${len / 2} ${-b},${len} A ${b},${b} 0 0 0 ${b},${len} Q ${m},${len / 2} ${a},0 A ${a},${a} 0 0 0 ${-a},0 Z`;
  const s = `M ${-a},0 Q ${-m},${len / 2} ${-b},${len} L ${-b * 0.15},${len} Q ${-m * 0.2},${len / 2} ${-a * 0.25},0 Z`;
  const hl = `M ${a * 0.55},${a * 0.4} Q ${m * 0.62},${len / 2} ${b * 0.55},${len - b * 0.2}`;
  return `<path d="${d}" fill="${fill}"/>` + shade(s, shadeA) + line(hl, Math.max(2, w1 * 0.12), '#ffffff', 0.22) + `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${SW}" stroke-linejoin="round"/>`;
}

function fist(skin) {
  return P('M -15,-4 Q -18,22 -10,30 L 12,31 Q 20,28 19,10 L 17,-4 Z', skin) +
    shade('M -15,-4 Q -18,22 -10,30 L -2,30 Q -6,14 -6,-4 Z', 0.25) +
    line('M 2,8 L 17,9 M 1,16 L 17,17 M 2,24 L 15,24', 2.6) +
    P('M -12,2 Q -4,14 8,10 Q 12,6 6,2', skin, 'stroke-width="3.5"');
}
function openHand(skin) {
  return P('M -14,-2 Q -20,20 -12,30 L -16,52 Q -14,58 -9,54 L -4,34 L -4,58 Q 0,64 4,58 L 4,34 L 10,56 Q 15,60 16,53 L 12,32 Q 20,40 22,30 Q 22,16 16,-2 Z', skin) +
    shade('M -14,-2 Q -20,20 -12,30 L -16,52 Q -14,58 -9,54 L -6,34 Q -8,16 -6,-2 Z', 0.22);
}

// arm: shoulder at origin, forward-positive shoulder and elbow angles
function arm(L, sh, el, back, hand) {
  const [uw, fw] = L.arm, sleeve = L.sleeve, fill = L.skin;
  const upFill = sleeve === 'long' || sleeve === 'short' ? L.shirt : fill;
  const UA = 118, FA = 108;
  let s = limb(UA, uw, fw + 4, sleeve === 'long' ? L.shirt : fill, L.bulge || 2);
  if (sleeve === 'short') s += limb(62, uw + 16, uw + 12, L.shirt, 3, 0.28) + line(`M ${-(uw + 10) / 2},56 L ${(uw + 10) / 2},56`, 2, INK, 0.5);
  let fore = limb(FA, fw + 4, fw - 2, sleeve === 'long' ? L.shirt : fill, (L.bulge || 2) * 0.6);
  if (sleeve === 'long') fore += P(`M ${-(fw + 6) / 2},${FA - 22} L ${(fw + 6) / 2},${FA - 22} L ${(fw + 4) / 2},${FA} L ${-(fw + 4) / 2},${FA} Z`, L.cuff || L.shirt);
  let h = '';
  if (hand === 'fist') h = fist(L.skin);
  else if (hand === 'open') h = openHand(L.skin);
  else if (hand && L.held && L.held[hand]) h = g(rot(-(sh + el)), L.held[hand]());
  else h = fist(L.skin);
  const forearm = g(`translate(0,${UA}) ${rot(el)}`, fore + g(`translate(0,${FA - 4})`, h));
  const out = g(rot(sh), s + forearm);
  return back ? `<g filter="url(#dim)">${out}</g>` : out;
}

function shoe(L) {
  const sole = L.shoeType === 'boot' ? '#1d1515' : '#f3f0e8';
  let s = P('M -26,-26 Q -30,10 -26,22 L 58,22 Q 72,18 64,2 Q 52,-12 30,-16 L 18,-30 L -20,-32 Z', L.shoes) +
    shade('M -26,-26 Q -30,10 -26,22 L 8,22 Q 0,0 -4,-32 L -20,-32 Z', 0.25) +
    P('M -30,14 L 68,14 Q 74,22 62,28 L -28,28 Z', sole, 'stroke-width="5"');
  if (L.shoeStripe) s += line('M 6,-14 L 20,10 M 18,-14 L 32,10 M 30,-12 L 44,10', 5, L.shoeStripe);
  if (L.shoeType !== 'boot') s += line('M 16,-22 L 30,-10 M 24,-24 L 36,-14', 2.5, '#d9d4c8');
  return s;
}
// leg: hip at origin, forward-positive hip angle, knee bend (positive bends the shin back)
function leg(L, hip, knee, back) {
  const [tw, sw] = L.leg;
  let thigh = limb(160, tw, sw + 6, L.pants, 5);
  let shin = limb(150, sw + 6, sw, L.pants, 3);
  if (L.pantsStripe) { thigh += line(`M ${tw * 0.32},10 L ${(sw + 6) * 0.32},156`, 6, L.pantsStripe); shin += line(`M ${(sw + 6) * 0.32},4 L ${sw * 0.32},146`, 6, L.pantsStripe); }
  if (L.jeans) { thigh += line(`M ${tw * 0.18},20 L ${sw * 0.2},152`, 3, '#ffffff', 0.25) + line('M -14,128 Q 0,136 14,128 M -12,142 Q 0,148 12,142', 2.2, INK, 0.45); shin += line(`M ${sw * 0.18},20 L ${sw * 0.15},140`, 3, '#ffffff', 0.22); }
  if (L.baggy) shin += line('M -20,120 Q 0,132 22,118 M -22,145 Q 0,156 22,142', 2.4, INK, 0.45);
  const total = hip - knee;
  const lower = g(`translate(0,160) ${rot(-knee)}`, shin + g(`translate(0,144) ${rot(-total)}`, shoe(L)));
  const out = g(rot(hip), thigh + lower);
  return back ? `<g filter="url(#dim)">${out}</g>` : out;
}

// ---------------------------------------------------------------- heads
function eye(x, y, w, h, iris, face, far) {
  if (face === 'yell' || face === 'angry') {
    return P(`M ${x - w},${y} Q ${x},${y - h * 0.7} ${x + w},${y - 2} Q ${x},${y + h} ${x - w},${y} Z`, '#fbf8ee', 'stroke-width="3"') +
      `<circle cx="${x + w * 0.2}" cy="${y + 1}" r="${h * 0.42}" fill="${iris}"/><circle cx="${x + w * 0.2}" cy="${y + 1}" r="${h * 0.22}" fill="${INK}"/>` +
      line(`M ${x - w - 3},${y - h * 0.15} L ${x + w + 3},${y - h * 0.65}`, far ? 4 : 6);
  }
  if (face === 'happy') return line(`M ${x - w},${y + 2} Q ${x},${y - h} ${x + w},${y + 2}`, 5);
  return P(`M ${x - w},${y} Q ${x},${y - h * 1.15} ${x + w},${y - 2} Q ${x},${y + h} ${x - w},${y} Z`, '#fbf8ee', 'stroke-width="3"') +
    `<circle cx="${x + w * 0.22}" cy="${y}" r="${h * 0.48}" fill="${iris}"/><circle cx="${x + w * 0.22}" cy="${y}" r="${h * 0.25}" fill="${INK}"/><circle cx="${x + w * 0.38}" cy="${y - h * 0.22}" r="${h * 0.14}" fill="#fff"/>` +
    line(`M ${x - w - 2},${y - 1} Q ${x},${y - h * 1.3} ${x + w + 3},${y - 3}`, far ? 3.5 : 5);
}
function mouth(face, x, y) {
  if (face === 'yell') return P(`M ${x - 18},${y - 4} Q ${x},${y - 10} ${x + 12},${y - 6} Q ${x + 10},${y + 22} ${x - 6},${y + 20} Q ${x - 18},${y + 12} ${x - 18},${y - 4} Z`, '#4a1418', 'stroke-width="4"') +
    `<path d="M ${x - 15},${y - 3} Q ${x},${y - 8} ${x + 10},${y - 5} L ${x + 9},${y} Q ${x},${y - 3} ${x - 14},${y + 2} Z" fill="#f4efe2"/>` + `<ellipse cx="${x - 2}" cy="${y + 15}" rx="9" ry="5" fill="#d86b78"/>`;
  if (face === 'happy') return P(`M ${x - 20},${y - 4} Q ${x - 2},${y + 2} ${x + 14},${y - 8} Q ${x + 10},${y + 16} ${x - 6},${y + 14} Q ${x - 18},${y + 8} ${x - 20},${y - 4} Z`, '#4a1418', 'stroke-width="4"') +
    `<path d="M ${x - 17},${y - 2} Q ${x - 2},${y + 3} ${x + 12},${y - 6} L ${x + 11},${y - 1} Q ${x - 2},${y + 7} ${x - 16},${y + 3} Z" fill="#f4efe2"/>`;
  if (face === 'angry') return P(`M ${x - 16},${y - 2} L ${x + 12},${y - 5} L ${x + 11},${y + 8} L ${x - 15},${y + 9} Z`, '#f4efe2', 'stroke-width="3.5"') + line(`M ${x - 15},${y + 3} L ${x + 11},${y + 1} M ${x - 6},${y - 3} L ${x - 6},${y + 9} M ${x + 3},${y - 4} L ${x + 3},${y + 8}`, 1.8);
  return line(`M ${x - 16},${y} Q ${x - 2},${y + 6} ${x + 12},${y - 4}`, 4.5) + line(`M ${x - 8},${y + 10} Q ${x},${y + 13} ${x + 6},${y + 9}`, 2.5, INK, 0.45);
}
// skull + jaw in 3/4 view facing right; (0,0) is roughly between the ears
function headShape(L) {
  const j = L.jaw || 0;
  return `M -50,22 C -64,-24 -50,-76 0,-80 C 42,-82 60,-52 57,-18 L 59,-8 Q 58,0 62,6 L 74,24 Q 76,32 66,34 L 64,40 Q 70,46 63,52 Q 64,${66 + j} ${44 - j},${76 + j} Q ${16},${84 + j} ${-6 - j},${70 + j} Q -34,60 -50,22 Z`;
}
function head(L, face) {
  let s = '';
  if (L.hairBack) s += L.hairBack;
  const hs = headShape(L);
  s += P(hs, L.skin);
  s += `<clipPath id="hc${L.id}${face}"><path d="${hs}"/></clipPath><g clip-path="url(#hc${L.id}${face})">` +
    `<ellipse cx="-46" cy="10" rx="34" ry="90" fill="#1a0e26" opacity="0.2"/>` +
    (L.stubble ? `<ellipse cx="34" cy="58" rx="40" ry="24" fill="${L.stubble}" opacity="0.28"/>` : '') +
    (L.flush ? `<ellipse cx="34" cy="26" rx="16" ry="10" fill="#e0565e" opacity="${L.flush}"/><ellipse cx="66" cy="24" rx="8" ry="8" fill="#e0565e" opacity="${L.flush}"/>` : '') +
    `<ellipse cx="22" cy="-52" rx="20" ry="9" fill="#fff" opacity="${L.bald ? 0.35 : 0.12}"/></g>`;
  s += P(hs, 'none');
  // ear
  s += P('M -20,-12 Q -40,-14 -38,8 Q -36,28 -18,26 Q -12,10 -20,-12 Z', L.skin, 'stroke-width="5"') + line('M -24,-4 Q -32,6 -24,18', 3, INK, 0.6);
  if (L.hair) s += L.hair;
  // eyes, brows
  s += eye(30, -14, 18, 14, L.iris, face, false) + eye(63, -14, 8, 11, L.iris, face, true);
  const bc = L.brow || INK, up = face === 'angry' || face === 'yell' ? 1 : 0;
  s += line(`M 12,${-34 + up * 2} Q 30,${-44 + up * 6} 46,${-36 + up * 10}`, 7, bc) + line(`M 56,${-34 + up * 8} L 70,${-38 - up * 2}`, 5, bc);
  // nose
  if (L.nose) s += P('M 54,0 Q 52,-14 64,-12 Q 84,-8 84,14 Q 82,30 64,30 Q 52,28 54,14 Z', L.nose, 'stroke-width="5"') + `<ellipse cx="72" cy="0" rx="5" ry="4" fill="#fff" opacity="0.6"/>`;
  else s += line('M 58,-8 L 72,22 Q 72,30 62,30', 4.5) + line('M 54,24 Q 58,30 64,28', 3);
  if (L.under) s += L.under;
  s += mouth(face, 46, 50);
  if (L.over) s += L.over;
  return s;
}

// ---------------------------------------------------------------- torsos
function torso(L) {
  const sw = L.sw, ww = L.ww, b = L.belly, top = -230;
  const d = `M ${-sw + 2},${top + 48} Q ${-sw - 2},${top - 2} ${-sw + 52},${top - 6} L ${sw - 46},${top - 6} Q ${sw + 12},${top - 2} ${sw + 10},${top + 56} C ${sw + 12 + b * 0.3},${top + 100} ${ww + b},${-70} ${ww + b * 0.55},${-6} Q ${ww * 0.6},${18} 0,${18} L ${-ww + 8},${16} C ${-ww - 6},${-50} ${-sw + 6},${top + 130} ${-sw + 2},${top + 48} Z`;
  let s = `<path d="${d}" fill="${L.shirt ? L.shirt : L.skin}"/>`;
  s += `<clipPath id="tc${L.id}"><path d="${d}"/></clipPath><g clip-path="url(#tc${L.id})">` + (L.torsoDetail || '') +
    `<ellipse cx="${-sw * 0.85}" cy="-110" rx="${sw * 0.55}" ry="200" fill="#1a0e26" opacity="0.24"/>` +
    `<ellipse cx="${sw * 0.35}" cy="${top + 50}" rx="${sw * 0.45}" ry="30" fill="#fff" opacity="0.14"/></g>`;
  s += `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${SW}" stroke-linejoin="round"/>`;
  if (L.belt) s += P(`M ${-ww - 6},-6 L ${ww + b * 0.55 + 4},-14 L ${ww + b * 0.55 + 6},14 L ${-ww - 4},20 Z`, L.belt, 'stroke-width="5"') + P(`M ${ww * 0.4 + b * 0.3},-14 L ${ww * 0.4 + b * 0.3 + 28},-16 L ${ww * 0.4 + b * 0.3 + 28},14 L ${ww * 0.4 + b * 0.3},16 Z`, '#cfcabd', 'stroke-width="4"');
  if (L.torsoOver) s += L.torsoOver;
  return s;
}

// ---------------------------------------------------------------- figure
function legsAndBody(L, pose) {
  const shF = [L.sw * 0.45, -212], shB = [-L.sw * 0.6, -212];
  const neck = limb(46, 58, 54, L.skin, 0, 0.3);
  let s = (L.behind || '') + g('translate(-16,0)', leg(L, pose.legB[0], pose.legB[1], true));
  let upper = '';
  if (!pose.backArmFront) upper += g(`translate(${shB[0]},${shB[1]})`, arm(L, pose.armB[0], pose.armB[1], true, pose.handB));
  upper += g('translate(10,-210) rotate(180)', neck);
  upper += torso(L);
  upper += g(`translate(${10 + (pose.headX || 0)},-300) rotate(${-(pose.headTilt || 0)})`, head(L, pose.face));
  s += g(rot(pose.lean || 0), upper);
  s += g('translate(18,0)', leg(L, pose.legF[0], pose.legF[1], false));
  let front = '';
  if (pose.backArmFront) front += g(`translate(${shB[0]},${shB[1]})`, arm(L, pose.armB[0], pose.armB[1], true, pose.handB));
  front += g(`translate(${shF[0]},${shF[1]})`, arm(L, pose.armF[0], pose.armF[1], false, pose.handF));
  s += g(rot(pose.lean || 0), front);
  if (pose.extra) s += pose.extra;
  return s;
}

function svgDoc(inner, w = 900, h = 1000, ox = 420, oy = 960) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs><filter id="dim" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0.74 0 0 0 0  0 0.72 0 0 0  0 0 0.78 0 0  0 0 0 1 0"/></filter></defs>
<g transform="translate(${ox},${oy})">${inner}</g></svg>`;
}

// ---------------------------------------------------------------- the cast
const bottle = () => P('M -14,-10 L 14,-10 L 16,70 Q 16,80 6,80 L -6,80 Q -16,80 -16,70 Z', '#2f6b33', 'stroke-width="5"') +
  P('M -6,-38 L 6,-38 L 6,-10 L -6,-10 Z', '#2f6b33', 'stroke-width="5"') + P('M -12,20 L 12,20 L 12,46 L -12,46 Z', '#efe3bd', 'stroke-width="3"') +
  `<text x="0" y="38" font-family="Impact, Arial Black, sans-serif" font-size="13" fill="#a32626" text-anchor="middle">XXX</text>` + line('M -9,-4 L -10,64', 4, '#fff', 0.35) +
  P('M -18,-6 Q -22,14 -14,22 L 14,22 Q 20,14 18,-6 Z', '#eeb39b', 'stroke-width="5"') + line('M -14,4 L 16,4 M -14,13 L 15,13', 2.4);
const burger = () => P('M -26,-6 Q -26,-34 0,-34 Q 26,-34 26,-6 Z', '#d9973f', 'stroke-width="5"') + P('M -30,-6 L 30,-6 L 26,2 L -26,2 Z', '#5fae3e', 'stroke-width="3"') +
  P('M -26,0 L 26,0 L 18,10 L -26,8 Z', '#f2c230', 'stroke-width="3"') + P('M -27,8 Q -28,20 -20,20 L 20,20 Q 28,20 27,8 Z', '#5b3a1e', 'stroke-width="4"') + P('M -24,20 L 24,20 Q 24,32 14,32 L -14,32 Q -24,32 -24,20 Z', '#c98a3a', 'stroke-width="4"') +
  `<g fill="#fff6d0"><ellipse cx="-8" cy="-24" rx="3" ry="1.6"/><ellipse cx="6" cy="-26" rx="3" ry="1.6"/><ellipse cx="14" cy="-18" rx="3" ry="1.6"/></g>`;
const mic = () => P('M -10,-10 L 10,-10 L 6,60 L -6,60 Z', '#2b2b2b', 'stroke-width="5"') + P('M -18,-44 Q -18,-62 0,-62 Q 18,-62 18,-44 Q 18,-24 0,-22 Q -18,-24 -18,-44 Z', '#b9bcc2', 'stroke-width="5"') +
  line('M -14,-48 L 14,-48 M -15,-38 L 15,-38 M -6,-60 L -6,-24 M 6,-60 L 6,-24', 2, INK, 0.5) + fist('#f1c6a2');

const CAST = {
  lahey: {
    id: 'lahey', hipY: 318, skin: '#efb59c', iris: '#5d7f93', jaw: 4, bald: true, flush: 0.45, nose: '#d9606b', brow: '#e9e4da',
    arm: [52, 40], leg: [70, 56], sw: 92, ww: 86, belly: 54,
    shirt: '#a7c0da', cuff: '#94adc8', sleeve: 'long', pants: '#30343f', shoes: '#191919', shoeType: 'boot', belt: '#1b1b1b',
    hairBack: P('M -40,-56 Q -64,-20 -56,24 Q -48,42 -34,46 Q -46,10 -30,-40 Z', '#e6e1d8', 'stroke-width="5"'),
    hair: line('M -30,-50 Q 0,-82 40,-66 M -26,-42 Q 6,-74 44,-58 M -20,-36 Q 10,-66 46,-50', 3.5, '#e8e3da'),
    over: P('M 22,38 Q 34,24 48,32 Q 62,24 76,36 Q 76,48 64,46 Q 50,42 46,48 Q 40,42 26,48 Q 18,46 22,38 Z', '#e6e1d8', 'stroke-width="4"') + line('M 32,34 L 30,44 M 40,32 L 38,44 M 56,32 L 56,44 M 66,34 L 66,44', 1.5, INK, 0.4),
    torsoDetail: line('M 30,-226 L 46,10', 3.5, INK, 0.55) + `<g fill="#f4f0e6" stroke="${INK}" stroke-width="2.5"><circle cx="35" cy="-180" r="4.5"/><circle cx="38" cy="-130" r="4.5"/><circle cx="42" cy="-80" r="4.5"/><circle cx="45" cy="-30" r="4.5"/></g>` +
      P('M -50,-190 L 4,-190 L 4,-150 L -50,-150 Z', '#93adc9', 'stroke-width="3.5"') + P('M -52,-194 L 6,-194 L 6,-182 L -52,-182 Z', '#8aa4c0', 'stroke-width="3"') +
      P('M -36,-176 L -18,-176 L -12,-160 L -27,-152 L -42,-160 Z', '#e7c24b', 'stroke-width="3"') +
      P('M 52,-196 L 92,-196 L 92,-178 L 52,-178 Z', '#f6f2e8', 'stroke-width="3"') + `<text x="72" y="-182" font-family="Arial Black, Impact, sans-serif" font-size="11" fill="#2a3a5a" text-anchor="middle">LAHEY</text>` +
      line('M -80,-110 Q -40,-96 0,-108 M 60,-70 Q 90,-60 110,-76', 3, INK, 0.35),
    torsoOver: P('M -10,-236 L 18,-212 L 40,-236 L 30,-246 L 18,-232 L 4,-246 Z', '#bcd0e6', 'stroke-width="4"') + P('M 10,-226 L 26,-226 L 30,-150 L 18,-134 L 6,-150 Z', '#38558a', 'stroke-width="4"'),
    held: { bottle },
  },
  randy: {
    id: 'randy', hipY: 316, skin: '#f0b994', iris: '#4a3524', jaw: 10, flush: 0.35, brow: '#2a1d14',
    arm: [58, 46], leg: [76, 60], sw: 104, ww: 104, belly: 96, shirt: null, sleeve: null,
    pants: '#3f5b84', jeans: true, shoes: '#2a2a2a', shoeStripe: '#cfcfcf', shoeType: 'sneaker', belt: '#3a2414',
    hair: P('M -52,10 Q -66,-40 -40,-70 Q -30,-96 -6,-86 Q 10,-104 30,-88 Q 54,-96 60,-70 Q 70,-56 58,-38 Q 44,-58 24,-50 Q 10,-62 -6,-52 Q -20,-60 -30,-44 Q -40,-30 -36,6 Z', '#2a1d14', 'stroke-width="5"') +
      line('M -30,-70 Q -16,-80 -8,-68 M 8,-80 Q 22,-86 28,-72 M 36,-78 Q 50,-80 52,-64', 3, '#5a4030'),
    over: P('M 18,38 Q 30,22 46,32 Q 62,22 78,36 Q 80,50 66,46 Q 52,40 46,48 Q 40,40 24,48 Q 14,46 18,38 Z', '#2a1d14', 'stroke-width="4"'),
    torsoDetail: (() => { let h = ''; for (let i = 0; i < 46; i++) { const x = -10 + (i % 9) * 12 + (i % 3), y = -205 + Math.floor(i / 9) * 14; h += `<path d="M ${x},${y} q 4,-6 8,0" fill="none" stroke="#3a2a1e" stroke-width="2"/>`; } for (let i = 0; i < 14; i++) { const x = 120 + (i % 3) * 10, y = -70 + Math.floor(i / 3) * 12; h += `<path d="M ${x},${y} q 4,-6 8,0" fill="none" stroke="#3a2a1e" stroke-width="2"/>`; } return h; })() +
      `<ellipse cx="18" cy="-160" rx="7" ry="5" fill="#c78070"/><ellipse cx="92" cy="-162" rx="7" ry="5" fill="#c78070"/>` + line('M -30,-150 Q 50,-120 120,-160', 3, INK, 0.35) + line('M -40,-30 Q 70,10 170,-40', 3, INK, 0.3) +
      P('M 150,-60 Q 158,-54 152,-46 Q 146,-52 150,-60 Z', '#a8664f', 'stroke-width="3"'),
    held: { burger: () => burger() + fist('#f0b994') },
  },
  jroc: {
    id: 'jroc', hipY: 320, skin: '#f2c8a4', iris: '#3c2a1e', jaw: 2, brow: '#4a3220', stubble: '#4a3220',
    arm: [48, 38], leg: [84, 76], sw: 90, ww: 82, belly: 0, shirt: '#f4f4f2', sleeve: 'short',
    pants: '#2f5aa8', jeans: true, baggy: true, shoes: '#f4f4f2', shoeStripe: '#c0392b', shoeType: 'sneaker', belt: null,
    hair: P('M -58,6 Q -66,-60 -10,-84 Q 40,-92 62,-52 Q 66,-34 60,-26 Q 20,-40 -20,-30 Q -40,-24 -48,0 Z', '#c0392b', 'stroke-width="6"') +
      P('M -46,-20 Q -96,-22 -110,-6 Q -84,6 -44,0 Z', '#a8301f', 'stroke-width="6"') + `<circle cx="-4" cy="-82" r="8" fill="#f4f4f2" stroke="${INK}" stroke-width="4"/>` +
      P('M 10,-70 L 34,-70 L 34,-48 L 10,-48 Z', '#f4f4f2', 'stroke-width="3"') + `<text x="22" y="-52" font-family="Arial Black, Impact, sans-serif" font-size="20" fill="#c0392b" text-anchor="middle">J</text>` +
      `<path d="M 40,-34 Q 50,-30 58,-28" stroke="${INK}" stroke-width="3" fill="none"/>`,
    under: P('M 36,60 Q 46,72 58,62 L 56,82 Q 46,90 38,80 Z', '#4a3220', 'stroke-width="3"') + line('M 30,42 Q 46,38 62,42', 4, '#4a3220'),
    torsoDetail: line('M -60,-150 Q -50,-100 -66,-40 M -20,-130 Q -14,-80 -26,-20 M 60,-60 Q 70,-30 64,0', 3, INK, 0.3) + `<text x="20" y="-90" font-family="Impact, Arial Black, sans-serif" font-size="58" fill="#2f5aa8" stroke="${INK}" stroke-width="3" text-anchor="middle">J</text>`,
    torsoOver: `<path d="M -30,-226 Q 20,-140 70,-224" fill="none" stroke="${INK}" stroke-width="12"/><path d="M -30,-226 Q 20,-140 70,-224" fill="none" stroke="#f2c53d" stroke-width="7" stroke-dasharray="7 4"/>` +
      P('M 8,-166 L 34,-166 L 34,-136 L 8,-136 Z', '#f2c53d', 'stroke-width="4"') + `<text x="21" y="-144" font-family="Impact, Arial Black, sans-serif" font-size="20" fill="${INK}" text-anchor="middle">$</text>`,
    held: { mic: () => mic() },
  },
};

// cameo NPCs: Cory and Trevor (Ricky and Julian's hapless helpers) and Bubbles as the Green Bastard
CAST.cory = { id: 'cory', hipY: 316, skin: '#8a5a3c', iris: '#2a1a12', jaw: 2, brow: '#1a1210',
  arm: [44, 36], leg: [66, 54], sw: 84, ww: 76, belly: 6, shirt: '#c0392b', sleeve: 'short', pants: '#2d3446', shoes: '#1d1d1d', shoeStripe: '#e8e8e8', shoeType: 'sneaker', belt: '#1a1a1a',
  hair: P('M -56,2 Q -64,-62 -6,-84 Q 44,-90 60,-50 Q 64,-36 58,-30 Q 16,-46 -24,-34 Q -42,-26 -46,-2 Z', '#222428', 'stroke-width="6"') + P('M 36,-40 Q 74,-46 90,-30 Q 70,-24 40,-28 Z', '#1a1b1e', 'stroke-width="5"'),
  torsoDetail: line('M -40,-150 Q -30,-100 -46,-40 M 40,-120 Q 50,-80 40,-30', 3, INK, 0.3) };
CAST.trevor = { id: 'trevor', hipY: 316, skin: '#f0c09c', iris: '#4a6a7a', jaw: 6, brow: '#7a5a3a', stubble: '#6a4a2a',
  arm: [46, 38], leg: [68, 56], sw: 88, ww: 80, belly: 14, shirt: '#e8c33a', sleeve: 'short', pants: '#4b6fa6', jeans: true, shoes: '#3a2a1a', shoeType: 'boot', belt: '#3a2414',
  hair: P('M -52,8 Q -64,-56 -10,-80 Q 40,-88 58,-50 Q 50,-60 20,-62 Q -20,-60 -40,-30 Q -46,-12 -44,10 Z', '#7a5a3a', 'stroke-width="5"'),
  under: P('M 34,58 Q 46,74 60,60 L 58,80 Q 46,92 36,80 Z', '#7a5a3a', 'stroke-width="3"'),
  torsoDetail: line('M -50,-140 Q -40,-90 -56,-30', 3, INK, 0.3) };
CAST.greenbastard = { id: 'greenbastard', hipY: 316, skin: '#2f8a3a', iris: '#3d7fc4', jaw: 8, brow: '#1d5a26',
  arm: [50, 42], leg: [72, 58], sw: 92, ww: 92, belly: 44, shirt: '#5d86c4', sleeve: 'long', cuff: '#4f75b0', pants: '#5a7eae', jeans: true, shoes: '#6b3f22', shoeType: 'boot', belt: '#5a3519',
  hair: line('M -30,-60 Q 10,-90 50,-60', 4, '#4fb85c', 0.8) + line('M -44,10 Q -30,40 0,60', 4, '#1d5a26', 0.6),
  over: `<g fill="none" stroke="${INK}" stroke-width="11"><circle cx="30" cy="-14" r="22"/><ellipse cx="64" cy="-14" rx="10" ry="20"/></g><g fill="none" stroke="#c4282a" stroke-width="6.5"><circle cx="30" cy="-14" r="22"/><ellipse cx="64" cy="-14" rx="10" ry="20"/></g>` + line('M 8,-16 L -18,-8', 6, '#c4282a') + line('M 52,-18 L 54,-18', 6, '#c4282a') + P('M 16,-34 L 44,-34 L 36,-26 L 22,-26 Z', '#f4f0e6', 'stroke-width="3" opacity="0.35"'),
  torsoDetail: (() => { let h = ''; for (let i = -120; i < 140; i += 22) h += line(`M ${i},-260 L ${i},40`, 6, '#2e4f86', 0.45) + line(`M -140,${i - 120} L 160,${i - 120}`, 6, '#2e4f86', 0.45); for (let i = -110; i < 140; i += 44) h += line(`M ${i},-260 L ${i},40`, 2, '#c84040', 0.7); return h; })(),
  behind: P('M -60,-236 Q -150,-110 -170,90 Q -70,120 30,96 Q 0,-100 44,-236 Z', '#2f8a3a', 'stroke-width="6"') + line('M -110,-150 Q -130,-40 -134,80 M -60,-150 Q -70,-30 -60,90', 3, '#1d5a26', 0.7) };
const POSES = {
  lahey: {
    idle: { face: 'n', lean: -3, armF: [22, 62], handF: 'fist', armB: [6, 78], handB: 'bottle', backArmFront: true, legF: [20, 16], legB: [-16, 10], headTilt: -4 },
    attack: { face: 'yell', lean: 12, armF: [150, 20], handF: 'bottle', armB: [-30, 40], handB: 'fist', legF: [28, 10], legB: [-26, 6] },
    run: { face: 'angry', lean: 14, armF: [-20, 90], handF: 'fist', armB: [40, 70], handB: 'bottle', legF: [40, 62], legB: [-14, 104] },
  },
  randy: {
    idle: { face: 'n', lean: -6, armF: [24, 70], handF: 'burger', armB: [-12, 30], handB: 'fist', legF: [20, 14], legB: [-18, 10] },
    attack: { face: 'yell', lean: -20, armF: [-40, 40], handF: 'fist', armB: [-56, 40], handB: 'fist', legF: [30, 26], legB: [-24, 8] },
    run: { face: 'angry', lean: 8, armF: [-24, 80], handF: 'fist', armB: [38, 70], handB: 'burger', legF: [38, 60], legB: [-12, 100] },
  },
  jroc: {
    idle: { face: 'n', lean: -4, armF: [40, 80], handF: 'mic', armB: [-8, 40], handB: 'open', legF: [22, 16], legB: [-18, 10], headTilt: -6 },
    attack: { face: 'yell', lean: 10, armF: [88, 4], handF: 'open', armB: [36, 90], handB: 'mic', legF: [26, 10], legB: [-24, 6] },
    run: { face: 'angry', lean: 12, armF: [-28, 86], handF: 'fist', armB: [40, 74], handB: 'mic', legF: [42, 64], legB: [-14, 106] },
  },
  cory: { carry: { face: 'angry', lean: 6, armF: [74, 30], handF: 'open', armB: [64, 30], handB: 'open', legF: [22, 30], legB: [-18, 20] } },
  trevor: { carry: { face: 'yell', lean: 6, armF: [74, 30], handF: 'open', armB: [64, 30], handB: 'open', legF: [22, 30], legB: [-18, 20] } },
  greenbastard: { cheer: { face: 'happy', lean: -6, armF: [150, -20], handF: 'fist', armB: [-150, 20], handB: 'fist', legF: [20, 12], legB: [-18, 10] } },
};

function renderSvg(id, pose) { return svgDoc(g(`translate(0,-${CAST[id].hipY})`, legsAndBody(CAST[id], POSES[id][pose]))); }
if (typeof window !== 'undefined') window.NPC = { renderSvg, CAST, POSES };
