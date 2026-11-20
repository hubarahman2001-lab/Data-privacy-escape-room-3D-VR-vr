/* World building blocks: procedural textures, materials, boxes, signs, rooms, people, props */
import { THREE, onFrame } from './core.js';
import { FONT, wrap, rrect } from './ui.js';

const texCache = new Map();
function canvasTex(key, w, h, draw, repeat = [1, 1]) {
  const k = key + repeat.join('x');
  if (texCache.has(k)) return texCache.get(k);
  const c = document.createElement('canvas'); c.width = w; c.height = h; const ctx = c.getContext('2d'); draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]);
  texCache.set(k, t); return t;
}
function speckle(ctx, w, h, n, colors, size = 2, alpha = .5) {
  for (let i = 0; i < n; i++) { ctx.fillStyle = colors[i % colors.length]; ctx.globalAlpha = Math.random() * alpha; ctx.fillRect(Math.random() * w, Math.random() * h, size * Math.random() + 1, size * Math.random() + 1); }
  ctx.globalAlpha = 1;
}
function cloudy(ctx, w, h, n, alpha) { // soft, large-scale variation
  for (let i = 0; i < n; i++) { const x = Math.random() * w, y = Math.random() * h, r = 30 + Math.random() * 90;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r); const c = Math.random() < .5 ? '0,0,0' : '255,255,255';
    g.addColorStop(0, `rgba(${c},${alpha})`); g.addColorStop(1, `rgba(${c},0)`); ctx.fillStyle = g;
    for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) { ctx.save(); ctx.translate(dx, dy); ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore(); } }
}
export const TEX = {
  concrete: (r = [4, 4]) => canvasTex('concrete', 512, 512, (c, w, h) => { c.fillStyle = '#7d8086'; c.fillRect(0, 0, w, h); cloudy(c, w, h, 40, .06); speckle(c, w, h, 9000, ['#5c5f64', '#9a9da2', '#6b6e73'], 2, .35); }, r),
  tiles: (base, line, n = 4, r = [4, 4]) => canvasTex('tiles' + base + line + n, 512, 512, (c, w, h) => { c.fillStyle = base; c.fillRect(0, 0, w, h); speckle(c, w, h, 3000, ['#ffffff', '#000000'], 2);
    c.strokeStyle = line; c.lineWidth = 3; for (let i = 0; i <= n; i++) { const p = i * w / n; c.beginPath(); c.moveTo(p, 0); c.lineTo(p, h); c.stroke(); c.beginPath(); c.moveTo(0, p); c.lineTo(w, p); c.stroke(); } }, r),
  carpet: (base = '#3a4656', r = [3, 3]) => canvasTex('carpet' + base, 512, 512, (c, w, h) => { c.fillStyle = base; c.fillRect(0, 0, w, h); speckle(c, w, h, 26000, ['#222a35', '#56657a', '#2d3846', '#6a7a90'], 2);
    c.globalAlpha = .1; c.strokeStyle = '#000'; for (let i = 0; i < w; i += 64) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, h); c.stroke(); } c.globalAlpha = 1; }, r),
  wood: (base = '#8a6040', r = [1, 1]) => canvasTex('wood' + base, 512, 512, (c, w, h) => { c.fillStyle = base; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) { c.strokeStyle = `rgba(${Math.random() < .5 ? '40,20,10' : '255,230,200'},${Math.random() * .12})`; c.lineWidth = 1 + Math.random() * 3; const y = Math.random() * h; c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(w * .3, y + 8, w * .6, y - 8, w, y + 3); c.stroke(); } }, r),
  marble: (r = [2, 2]) => canvasTex('marble', 512, 512, (c, w, h) => { c.fillStyle = '#e9e6e1'; c.fillRect(0, 0, w, h); speckle(c, w, h, 4000, ['#cfcac2', '#ffffff'], 3);
    for (let i = 0; i < 14; i++) { c.strokeStyle = `rgba(120,110,100,${.08 + Math.random() * .15})`; c.lineWidth = 1 + Math.random() * 2; c.beginPath(); let x = Math.random() * w, y = 0; c.moveTo(x, y); while (y < h) { x += (Math.random() - .5) * 60; y += 30 + Math.random() * 40; c.lineTo(x, y); } c.stroke(); }
    c.strokeStyle = 'rgba(160,150,140,.5)'; c.lineWidth = 2; c.strokeRect(0, 0, w, h); }, r),
  wall: (base = '#d9dde2', r = [3, 1]) => canvasTex('wall' + base, 512, 256, (c, w, h) => { c.fillStyle = base; c.fillRect(0, 0, w, h); cloudy(c, w, h, 18, .025); speckle(c, w, h, 3000, ['#ffffff', '#000000'], 1, .07); }, r),
  city: () => canvasTex('city', 1024, 512, (c, w, h) => { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#05070f'); g.addColorStop(.6, '#101a33'); g.addColorStop(1, '#2b2140'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { const bw = 30 + Math.random() * 70, bh = 120 + Math.random() * 300, x = Math.random() * w; c.fillStyle = `rgb(${10 + Math.random() * 15},${14 + Math.random() * 15},${28 + Math.random() * 20})`; c.fillRect(x, h - bh, bw, bh);
      for (let yy = h - bh + 8; yy < h - 6; yy += 10) for (let xx = x + 4; xx < x + bw - 4; xx += 8) if (Math.random() < .35) { c.fillStyle = Math.random() < .8 ? '#ffd88a' : '#9fd8ff'; c.globalAlpha = .5 + Math.random() * .5; c.fillRect(xx, yy, 4, 5); } c.globalAlpha = 1; }
    c.fillStyle = '#c9b8ff'; c.globalAlpha = .7; c.fillRect(w * .62, h * .08, 6, h * .9); c.globalAlpha = 1; }),
};

const matCache = new Map();
export function M(color, o = {}) {
  const key = color + JSON.stringify(o, (k, v) => (v && v.isTexture ? v.uuid : v));
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({ color, roughness: o.r ?? .7, metalness: o.m ?? 0, map: o.map || null,
    emissive: o.e ? new THREE.Color(o.e) : new THREE.Color(0), emissiveIntensity: o.ei ?? 1, transparent: !!o.t, opacity: o.t ?? 1,
    side: o.ds ? THREE.DoubleSide : THREE.FrontSide, depthWrite: o.t ? o.dw ?? false : true });
  matCache.set(key, m); return m;
}
export const GLASS = () => M('#a8d8ff', { r: .05, m: .1, t: .18 });

const geoCache = new Map();
function boxGeo(w, h, d) { const k = [w, h, d].join(); if (!geoCache.has(k)) geoCache.set(k, new THREE.BoxGeometry(w, h, d)); return geoCache.get(k); }
/* box with its BOTTOM at y (easier for furniture). Returns the mesh. */
export function box(parent, w, h, d, mat, x = 0, y = 0, z = 0, ry = 0) {
  const m = new THREE.Mesh(boxGeo(w, h, d), mat); m.position.set(x, y + h / 2, z); m.rotation.y = ry; parent.add(m); return m;
}
export function cyl(parent, rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 20) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat); m.position.set(x, y + h / 2, z); parent.add(m); return m;
}
export function group(parent, x = 0, y = 0, z = 0, ry = 0) { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; parent.add(g); return g; }

/* a flat sign / sheet with text. draw(ctx,W,H) for custom art, or text. */
export function sign(parent, w, h, { text = '', bg = '#1b2a3d', fg = '#ffffff', size = 0.6, weight = 800, glow = false, res = 700, draw = null, align = 'center', pad = 0.08 } = {}, x = 0, y = 0, z = 0, ry = 0) {
  const W = Math.min(2048, Math.round(w * res)), H = Math.max(8, Math.round(W * h / w));
  const c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d');
  if (draw) draw(ctx, W, H); else {
    if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); }
    const fs = Math.round(H * size / Math.max(1, text.split('\n').length)); ctx.font = `${weight} ${fs}px ${FONT}`; ctx.fillStyle = fg; ctx.textBaseline = 'middle';
    const lines = text.split('\n').flatMap(l => wrap(ctx, l, W * (1 - pad * 2)));
    ctx.textAlign = align; const lh = fs * 1.2, x0 = align === 'center' ? W / 2 : W * pad;
    lines.forEach((l, i) => ctx.fillText(l, x0, H / 2 + (i - (lines.length - 1) / 2) * lh));
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const mat = glow ? new THREE.MeshBasicMaterial({ map: t, toneMapped: false, transparent: !bg }) : new THREE.MeshStandardMaterial({ map: t, roughness: .6, transparent: !bg });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(x, y, z); m.rotation.y = ry; parent.add(m);
  m.userData.canvas = c; m.userData.ctx = ctx; m.userData.tex = t;
  return m;
}

/* room shell: floor, walls, ceiling, light panels. Walls are inward-facing. */
export function shell(parent, { x0 = -2.5, x1 = 2.5, z0 = -4, z1 = 2, h = 2.8, floor, wall, ceil, lights = [], skipWalls = [] } = {}) {
  const W = x1 - x0, D = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const f = new THREE.Mesh(new THREE.PlaneGeometry(W, D), floor); f.rotation.x = -Math.PI / 2; f.position.set(cx, 0, cz); parent.add(f); f.userData.floor = true;
  const c = new THREE.Mesh(new THREE.PlaneGeometry(W, D), ceil || M('#c8ccd2', { r: .9 })); c.rotation.x = Math.PI / 2; c.position.set(cx, h, cz); parent.add(c);
  const walls = { back: [W, cx, z0, 0], front: [W, cx, z1, Math.PI], left: [D, x0, cz, Math.PI / 2], right: [D, x1, cz, -Math.PI / 2] };
  for (const [k, [len, x, z, ry]] of Object.entries(walls)) {
    if (skipWalls.includes(k)) continue;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, h), wall); m.position.set(x, h / 2, z); m.rotation.y = ry; parent.add(m);
  }
  for (const [lx, lz, lw = 1.2, ld = .3] of lights) {
    const p = new THREE.Mesh(boxGeo(lw, .03, ld), M('#ffffff', { e: '#fff6e8', ei: 1.4 })); p.position.set(lx, h - .016, lz); parent.add(p);
  }
}
export function lightRig(parent, { hemi = [0xdfe8ff, 0x3a3328, 1.1], points = [], amb = 0.15 } = {}) {
  const h = new THREE.HemisphereLight(hemi[0], hemi[1], hemi[2]); parent.add(h);
  if (amb) parent.add(new THREE.AmbientLight(0xffffff, amb));
  for (const [x, y, z, color = 0xfff1dc, I = 6, d = 9] of points) { const l = new THREE.PointLight(color, I, d, 1.6); l.position.set(x, y, z); parent.add(l); }
}

/* invisible but grabbable/hittable volume (for drop zones, hit areas) */
export function zone(parent, w, h, d, x, y, z) {
  const m = new THREE.Mesh(boxGeo(w, h, d), new THREE.MeshBasicMaterial({ visible: false })); m.position.set(x, y + h / 2, z); parent.add(m); m.userData.noHit = true; return m;
}

/* ---------- people ---------- */
export function person(parent, { shirt = '#3c5a7a', trousers = '#2a2f3a', skin = '#c99a74', hair = '#2a1d15', badge = null, scarf = null, hijab = null } = {}, x = 0, z = 0, ry = 0) {
  const g = group(parent, x, 0, z, ry);
  const sm = M(shirt, { r: .8 }), tm = M(trousers, { r: .8 }), km = M(skin, { r: .6 }), hm = M(hair, { r: .9 });
  const legs = [-0.09, 0.09].map(lx => { const l = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.72, 4, 10), tm); l.position.set(lx, 0.43, 0); g.add(l); return l; });
  [-0.09, 0.09].forEach(lx => box(g, .1, .07, .24, M('#1a1a1a', { r: .5 }), lx, 0, .03));
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.42, 6, 14), sm); torso.scale.set(1, 1, .62); torso.position.y = 1.12; g.add(torso);
  const arms = [-1, 1].map(s => { const a = new THREE.Group(); a.position.set(s * 0.22, 1.36, 0); g.add(a);
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.5, 4, 10), sm); m.position.y = -0.3; a.add(m);
    const hnd = new THREE.Mesh(new THREE.SphereGeometry(0.048, 12, 10), km); hnd.position.y = -0.6; a.add(hnd); a.rotation.z = s * 0.08; return a; });
  const neck = cyl(g, .05, .055, .1, km, 0, 1.44, 0);
  const head = new THREE.Group(); head.position.y = 1.62; g.add(head);
  const hd = new THREE.Mesh(new THREE.SphereGeometry(0.105, 24, 18), km); hd.scale.set(.92, 1.08, 1); head.add(hd);
  if (hijab) { const hj = new THREE.Mesh(new THREE.SphereGeometry(0.122, 24, 18, 0, Math.PI * 2, 0, Math.PI * .72), M(hijab, { r: .9 })); hj.rotation.x = -0.35; hj.position.set(0, .005, -.02); head.add(hj);
    const wrapM = new THREE.Mesh(new THREE.CylinderGeometry(.11, .17, .2, 20, 1, true), M(hijab, { r: .9, ds: true })); wrapM.position.y = -.16; head.add(wrapM); }
  else { const hr = new THREE.Mesh(new THREE.SphereGeometry(0.112, 24, 18, 0, Math.PI * 2, 0, Math.PI * .55), hm); hr.rotation.x = -0.3; hr.position.set(0, .015, -.012); head.add(hr); }
  const eyeM = M('#141414', { r: .3 });
  [-0.036, 0.036].forEach(ex => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), eyeM); e.position.set(ex, 0.02, 0.094); head.add(e); });
  const mouth = box(head, .04, .006, .01, M('#7a3b33'), 0, -0.05, 0.093);
  if (badge) {
    const lan = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.006, 6, 24, Math.PI), M(badge === 'visitor' ? '#d22' : '#1f4e8c')); lan.rotation.z = Math.PI; lan.position.set(0, 1.4, 0.1); lan.scale.set(.9, 1.3, 1); g.add(lan);
    const card = idCard(badge); card.position.set(0, 1.2, 0.115); card.scale.setScalar(1.2); g.add(card);
  }
  g.userData = { torso, head, arms, legs, t0: Math.random() * 6, walking: false };
  g.userData.off = onFrame(now => {
    const u = g.userData, t = now / 1000 + u.t0;
    torso.position.y = 1.12 + Math.sin(t * 2) * 0.004; head.position.y = 1.62 + Math.sin(t * 2) * 0.004;
    if (u.walking) { const s = Math.sin(t * 7); legs[0].rotation.x = s * .35; legs[1].rotation.x = -s * .35; arms[0].rotation.x = -s * .3; arms[1].rotation.x = s * .3; }
    else { legs.forEach(l => l.rotation.x *= .85); if (!u.posed) arms.forEach(a => a.rotation.x *= .85); }
    if (u.talk) mouth.scale.y = 1 + Math.abs(Math.sin(t * 14)) * 3; else mouth.scale.y = 1;
  });
  return g;
}
/* walk a person to (x,z) over ms */
export function walkTo(p, x, z, ms = 2000) {
  const sx = p.position.x, sz = p.position.z, t0 = performance.now(); p.userData.walking = true;
  const ang = Math.atan2(x - sx, z - sz); p.rotation.y = ang;
  return new Promise(res => { const off = onFrame(now => { const k = Math.min(1, (now - t0) / ms);
    p.position.x = sx + (x - sx) * k; p.position.z = sz + (z - sz) * k; if (k >= 1) { off(); p.userData.walking = false; res(); } }); });
}

/* ---------- ID cards ---------- */
export function idCardTex(kind = 'staff') {
  return canvasTex('id-' + kind, 256, 384, (c, w, h) => {
    const col = kind === 'visitor' ? '#d0312d' : kind === 'temp' ? '#f08c1a' : '#1f4e8c';
    c.fillStyle = '#fbfbfb'; rrect(c, 0, 0, w, h, 22); c.fill();
    c.fillStyle = col; c.fillRect(0, 0, w, 80); c.fillRect(0, h - 70, w, 70);
    c.fillStyle = '#fff'; c.font = `800 44px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(kind === 'visitor' ? 'VISITOR' : kind === 'temp' ? 'TEMP' : 'STAFF', w / 2, 42);
    c.fillStyle = '#c9d3df'; c.fillRect(w / 2 - 62, 100, 124, 140);
    c.fillStyle = '#8fa1b5'; c.beginPath(); c.arc(w / 2, 150, 34, 0, 7); c.fill(); c.beginPath(); c.ellipse(w / 2, 232, 56, 40, 0, Math.PI, 0); c.fill();
    c.fillStyle = '#20324a'; c.font = `700 28px ${FONT}`; c.fillText(kind === 'visitor' ? 'Escort required' : kind === 'temp' ? 'Valid tonight' : 'Floor 4 access', w / 2, 278);
    c.fillStyle = '#fff'; c.font = `600 24px ${FONT}`; c.fillText(kind === 'staff' ? 'Staff access' : kind === 'temp' ? 'Issued by Security' : 'Host must collect', w / 2, h - 35);
  });
}
export function idCard(kind = 'staff', s = 1) {
  const g = new THREE.Group();
  const front = new THREE.Mesh(new THREE.PlaneGeometry(0.054 * s, 0.081 * s), new THREE.MeshStandardMaterial({ map: idCardTex(kind), roughness: .35 }));
  front.position.z = 0.0011; g.add(front);
  const back = new THREE.Mesh(boxGeo(0.054 * s, 0.081 * s, 0.002), M('#e8e8e8', { r: .4 })); g.add(back);
  return g;
}

/* soft glow sprite (for LEDs, lamps) */
const glowTex = canvasTex('glowdot', 64, 64, (c, w, h) => { const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.3, 'rgba(255,255,255,.5)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); });
export function led(parent, color, x, y, z, s = 0.03) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  sp.scale.setScalar(s); sp.position.set(x, y, z); parent.add(sp); return sp;
}
