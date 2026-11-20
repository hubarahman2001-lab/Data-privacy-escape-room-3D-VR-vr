/* 3D panels with canvas text: HUD, cards, choice panels, speech bubbles, progress rings, hint glows, wrist menu */
import { THREE, scene, camera, onFrame, headPos, headYaw, inFront, isXR, clamp } from './core.js';
import { pointers, input } from './input.js';

export const FONT = 'system-ui, "Segoe UI", Roboto, "Noto Sans", Arial, sans-serif';
export const C = { bg: 'rgba(9,18,32,0.92)', bg2: 'rgba(20,36,58,0.95)', line: 'rgba(123,233,255,0.55)', acc: '#7be9ff',
  text: '#eef6ff', dim: '#a9bdd3', good: '#2fcf84', bad: '#ff6b6b', warn: '#ffc857' };

export const uiRoot = new THREE.Group(); uiRoot.name = 'ui'; scene.add(uiRoot);
input.uiRoots.push(uiRoot);

export function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
export function wrap(ctx, text, maxW) {
  const out = []; for (const para of String(text).split('\n')) {
    let line = ''; for (const w of para.split(' ')) { const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; }
    out.push(line); }
  return out;
}
export function textBlock(ctx, text, x, y, maxW, size, color, weight = 500, lh = 1.28, maxLines = 99) {
  ctx.font = `${weight} ${size}px ${FONT}`; ctx.fillStyle = color; ctx.textBaseline = 'top';
  let lines = wrap(ctx, text, maxW); if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] += '…'; }
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * size * lh));
  return y + lines.length * size * lh;
}

/* ---------- Panel ---------- */
export const BUTTONS = new Set();
export class Panel extends THREE.Group {
  constructor(w, h, { res = 1600, onTop = false, bg = true } = {}) {
    super();
    this.w = w; this.h = h; this.W = Math.min(2048, Math.round(w * res)); this.H = Math.round(this.W * h / w);
    this.k = this.W / w; // px per metre
    this.canvas = document.createElement('canvas'); this.canvas.width = this.W; this.canvas.height = this.H;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 4;
    this.mat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, toneMapped: false, depthTest: !onTop, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.mat);
    if (onTop) this.mesh.renderOrder = 900;
    this.mesh.userData.panel = this;
    this.add(this.mesh);
    this.buttons = []; this.paint = null; this.hasBg = bg;
  }
  addButton(rect, label, onPress, opts = {}) {
    const [x, y, w, h] = rect;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w / this.k, h / this.k, 0.02), new THREE.MeshBasicMaterial({ visible: false }));
    m.position.set((x + w / 2) / this.k - this.w / 2, this.h / 2 - (y + h / 2) / this.k, 0.004);
    const b = { panel: this, mesh: m, rect, label, onPress, enabled: true, hover: false, state: '', last: 0, inside: new Map(), ...opts };
    m.userData.button = b; this.add(m); this.buttons.push(b); BUTTONS.add(b);
    return b;
  }
  redraw() {
    const { ctx, W, H } = this; ctx.clearRect(0, 0, W, H);
    if (this.hasBg) { rrect(ctx, 3, 3, W - 6, H - 6, Math.min(36, H * .12)); ctx.fillStyle = C.bg; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = C.line; ctx.stroke(); }
    if (this.paint) this.paint(ctx, W, H);
    for (const b of this.buttons) if (b.draw !== false) drawButton(ctx, b);
    this.tex.needsUpdate = true;
  }
  dispose() {
    for (const b of this.buttons) BUTTONS.delete(b);
    this.removeFromParent(); this.tex.dispose(); this.mat.dispose(); this.mesh.geometry.dispose();
  }
}
function drawButton(ctx, b) {
  const [x, y, w, h] = b.rect;
  rrect(ctx, x, y, w, h, Math.min(26, h * .3));
  const st = b.state;
  ctx.fillStyle = st === 'bad' ? 'rgba(120,30,40,0.9)' : st === 'good' ? 'rgba(20,110,70,0.95)' : b.hover ? 'rgba(40,90,130,0.98)' : C.bg2;
  ctx.fill(); ctx.lineWidth = b.hover ? 6 : 3; ctx.strokeStyle = st === 'bad' ? C.bad : st === 'good' ? C.good : b.hover ? C.acc : 'rgba(123,233,255,0.4)'; ctx.stroke();
  const size = b.size || Math.round(h * 0.36);
  ctx.font = `${b.weight || 600} ${size}px ${FONT}`; ctx.fillStyle = st === 'bad' ? '#ffb3b3' : C.text; ctx.textBaseline = 'middle';
  const lines = wrap(ctx, b.label, w - 40).slice(0, 3); const lh = size * 1.22;
  const align = b.align || 'center'; ctx.textAlign = align;
  lines.forEach((l, i) => ctx.fillText(l, align === 'center' ? x + w / 2 : x + 26, y + h / 2 + (i - (lines.length - 1) / 2) * lh));
  ctx.textAlign = 'left';
  if (st === 'bad') { ctx.strokeStyle = C.bad; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x + 18, y + h / 2); ctx.lineTo(x + w - 18, y + h / 2); ctx.stroke(); }
}

/* press buttons with a fingertip poke, a pinch (ray or touch), a trigger or a mouse click */
const _bb = new THREE.Box3(), _bp = new THREE.Vector3();
onFrame(now => {
  for (const b of BUTTONS) {
    if (!b.panel.parent || !visible(b.panel)) { if (b.hover) { b.hover = false; } continue; }
    let hov = false, press = null;
    const hw = b.rect[2] / b.panel.k / 2 + 0.012, hh = b.rect[3] / b.panel.k / 2 + 0.012;
    // test in the button's own space, so tilted panels still work: in front by up to 1.2 cm, pushed in by up to 3 cm
    const inBtn = pt => { b.mesh.worldToLocal(_bp.copy(pt)); return Math.abs(_bp.x) <= hw && Math.abs(_bp.y) <= hh && _bp.z <= 0.022 && _bp.z >= -0.04; };
    for (const p of pointers) {
      const rayOn = p.uiHit && p.uiHit.object === b.mesh;
      if (p.kind === 'mouse') { if (rayOn) { hov = true; if (p.pinchStart) press = p; } continue; }
      const inside = inBtn(p.tip);
      const was = b.inside.get(p) || false; b.inside.set(p, inside);
      if (inside || rayOn) hov = true;
      if (inside && !was) press = p;
      if (p.pinchStart && (rayOn || inBtn(p.pinchPos))) press = p;
    }
    if (hov !== b.hover) { b.hover = hov; b.panel.redraw(); }
    if (press && b.enabled && now - b.last > 450) { b.last = now; press.pinchStart = false; try { b.onPress(press); } catch (e) { console.error(e); } }
  }
});
export function visible(o) { let top = o; while (o) { if (!o.visible) return false; top = o; o = o.parent; } return top === scene; }

/* place a panel in front of the head, facing it */
const _hp = new THREE.Vector3();
export function placeInFront(obj, dist, dy, side = 0) {
  inFront(dist, dy, side, obj.position); headPos(_hp); obj.lookAt(_hp);
}

/* ---------- HUD (follows your view lazily) ---------- */
export const hud = new Panel(0.64, 0.205, { res: 1700, onTop: true });
hud.state = { time: '15:00', low: false, code: [], codeLen: 4, hints: 3, sam: '', obj: '', zone: '' };
hud.paint = (ctx, W, H) => {
  const s = hud.state, pad = 40;
  ctx.font = `700 50px ${FONT}`; ctx.textBaseline = 'top';
  ctx.fillStyle = s.low ? C.bad : C.text; ctx.fillText('⏱ ' + s.time, pad, 26);
  const codeTxt = 'CODE ' + Array.from({ length: s.codeLen }, (_, i) => s.code[i] ?? '•').join(' ');
  ctx.fillStyle = C.acc; ctx.textAlign = 'center'; ctx.fillText(codeTxt, W / 2, 26);
  ctx.fillStyle = C.warn; ctx.textAlign = 'right'; ctx.fillText('💡 ' + s.hints, W - pad, 26); ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(123,233,255,.25)'; ctx.fillRect(pad, 94, W - pad * 2, 3);
  if (s.sam) {
    ctx.font = `800 34px ${FONT}`; ctx.fillStyle = C.warn; ctx.fillText('📻 SAM', pad, 116);
    textBlock(ctx, s.sam, pad + 150, 112, W - pad * 2 - 150, 40, C.text, 500, 1.22, 3);
  }
  if (s.obj) { ctx.font = `600 34px ${FONT}`; ctx.fillStyle = C.acc; ctx.fillText('▸ ' + s.obj, pad, H - 58); }
  if (s.zone) { ctx.font = `600 30px ${FONT}`; ctx.fillStyle = C.dim; ctx.textAlign = 'right'; ctx.fillText(s.zone, W - pad, H - 54); ctx.textAlign = 'left'; }
};
hud.visible = false; hud.mesh.userData.noHit = true;
scene.add(hud);
export function setHud(patch) {
  const fresh = ('sam' in patch && patch.sam && patch.sam !== hud.state.sam) || ('obj' in patch && patch.obj && patch.obj !== hud.state.obj);
  Object.assign(hud.state, patch); hud.redraw(); if (wrist.redraw) wrist.redraw();
  if (fresh) hud.showUntil = performance.now() + 9000;
}
hud.active = false; hud.showUntil = 0;
/* In VR the HUD is a subtitle: it comes into view when Sam talks or the goal changes, follows your gaze lazily,
   then fades so it never covers what you're reaching for. The clock and code stay on your left wrist. */
let hudInit = false, hudMoving = false, hudOp = 0;
const _want = new THREE.Vector3(), _q = new THREE.Quaternion();
onFrame((n, dt) => {
  if (!isXR()) {
    hud.visible = hud.active; hud.mat.opacity = 1;
    if (hud.parent !== camera) { camera.add(hud); hud.position.set(0, -0.36, -0.82); hud.rotation.set(-0.25, 0, 0); hud.scale.setScalar(0.9); }
    return;
  }
  if (hud.parent !== scene) { scene.add(hud); hud.scale.setScalar(1); hudInit = false; }
  const target = hud.active && (n < hud.showUntil || hud.state.low) ? 1 : 0;
  hudOp += (target - hudOp) * Math.min(1, dt / 1000 * (target ? 6 : 1.5));
  hud.mat.opacity = hudOp; hud.visible = hudOp > 0.02;
  headPos(_hp); camera.getWorldQuaternion(_q);
  _want.set(0, -0.26, -0.9).applyQuaternion(_q).add(_hp);
  if (!hudInit || !hud.visible && target) { hud.position.copy(_want); hudInit = true; }
  if (hud.position.distanceTo(_want) > 0.3) hudMoving = true;
  if (hudMoving) { hud.position.lerp(_want, Math.min(1, dt / 1000 * 4)); if (hud.position.distanceTo(_want) < 0.03) hudMoving = false; }
  hud.lookAt(_hp);
});

/* ---------- cards: lessons, zone cleared, messages ---------- */
let card = null, cardTimer = null;
export function showCard(title, body, { color = C.acc, ms = 5200, big = '' } = {}) {
  hideCard();
  const p = new Panel(0.5, big ? 0.26 : 0.2, { res: 1800, onTop: true });
  p.paint = (ctx, W, H) => {
    ctx.fillStyle = color; ctx.fillRect(0, 22, 12, H - 44);
    let y = 34;
    ctx.font = `800 52px ${FONT}`; ctx.fillStyle = color; ctx.textBaseline = 'top'; ctx.fillText(title, 50, y); y += 76;
    if (big) { ctx.font = `800 150px ${FONT}`; ctx.fillStyle = C.text; ctx.textAlign = 'right'; ctx.fillText(big, W - 60, 40); ctx.textAlign = 'left'; }
    textBlock(ctx, body, 50, y, W - 100 - (big ? 160 : 0), 40, C.text, 500, 1.25, 5);
  };
  p.redraw(); p.mesh.userData.noHit = true; uiRoot.add(p);
  if (isXR()) placeInFront(p, 0.78, 0.1); else { camera.add(p); p.position.set(0, 0.2, -0.85); p.rotation.set(0, 0, 0); }
  card = p;
  cardTimer = setTimeout(hideCard, ms);
  return p;
}
export function hideCard() { if (cardTimer) clearTimeout(cardTimer); cardTimer = null; if (card) { card.dispose(); card = null; } }

/* ---------- speech bubble over a character ---------- */
export class Bubble extends Panel {
  constructor(text, { w = 0.62, color = C.text } = {}) {
    super(w, 0.17, { res: 1400, bg: false });
    this.color = color; this.say(text);
    this.off = onFrame(() => { if (!this.parent) return; headPos(_hp); this.lookAt(_hp.x, this.getWorldPosition(new THREE.Vector3()).y, _hp.z); });
  }
  say(text) {
    this.text = text;
    this.paint = (ctx, W, H) => {
      ctx.font = `600 54px ${FONT}`; const lines = wrap(ctx, this.text, W - 90).slice(0, 3);
      const bh = lines.length * 66 + 46, y0 = H - bh - 34;
      rrect(ctx, 6, y0, W - 12, bh, 34); ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(W / 2 - 26, y0 + bh - 2); ctx.lineTo(W / 2, H - 4); ctx.lineTo(W / 2 + 26, y0 + bh - 2); ctx.fill();
      ctx.fillStyle = '#122033'; ctx.textBaseline = 'top'; ctx.textAlign = 'center';
      lines.forEach((l, i) => ctx.fillText(l, W / 2, y0 + 24 + i * 66)); ctx.textAlign = 'left';
    };
    this.redraw();
  }
  dispose() { this.off(); super.dispose(); }
}

/* ---------- progress ring ---------- */
export class Ring extends THREE.Group {
  constructor(r = 0.07, color = 0x7be9ff) {
    super();
    this.r = r; this.mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .95, depthTest: false, side: THREE.DoubleSide });
    this.bgm = new THREE.Mesh(new THREE.RingGeometry(r * .82, r, 48), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .35, depthTest: false, side: THREE.DoubleSide }));
    this.bgm.renderOrder = 950; this.add(this.bgm);
    this.arc = new THREE.Mesh(new THREE.RingGeometry(r * .82, r, 48, 1, Math.PI / 2, 0.001), this.mat); this.arc.renderOrder = 951; this.add(this.arc);
    this.v = 0; this.off = onFrame(() => { headPos(_hp); this.lookAt(_hp); });
  }
  set(v, color) {
    v = clamp(v, 0, 1); if (color !== undefined) this.mat.color.set(color);
    if (Math.abs(v - this.v) < 0.01) return; this.v = v;
    this.arc.geometry.dispose(); this.arc.geometry = new THREE.RingGeometry(this.r * .82, this.r, 48, 1, Math.PI / 2, -Math.max(0.001, v * Math.PI * 2));
  }
  dispose() { this.off(); this.removeFromParent(); this.arc.geometry.dispose(); }
}

/* ---------- hint glow around an object ---------- */
export function glow(obj, color = 0xffc857) {
  const box = new THREE.Box3().setFromObject(obj); const size = box.getSize(new THREE.Vector3()).addScalar(0.04);
  const g = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .25, depthWrite: false, blending: THREE.AdditiveBlending }));
  const e = new THREE.LineSegments(new THREE.EdgesGeometry(g.geometry), new THREE.LineBasicMaterial({ color, transparent: true }));
  g.add(e); box.getCenter(g.position); scene.add(g);
  const t0 = performance.now();
  const off = onFrame(now => { const k = .5 + .5 * Math.sin((now - t0) / 220); g.material.opacity = .08 + .22 * k; e.material.opacity = .4 + .6 * k; });
  return { remove() { off(); g.removeFromParent(); g.geometry.dispose(); e.geometry.dispose(); } };
}

/* ---------- wrist menu (left hand / controller): clock, code, goal, hint and repeat ---------- */
export const wrist = new Panel(0.17, 0.1, { res: 2400 });
wrist.paint = (ctx, W, H) => {
  const s = hud.state; ctx.textBaseline = 'top';
  ctx.font = `700 46px ${FONT}`; ctx.fillStyle = s.low ? C.bad : C.text; ctx.fillText('⏱ ' + s.time, 26, 22);
  ctx.fillStyle = C.acc; ctx.textAlign = 'right'; ctx.fillText(Array.from({ length: s.codeLen }, (_, i) => s.code[i] ?? '•').join(' '), W - 26, 22); ctx.textAlign = 'left';
  ctx.font = `600 30px ${FONT}`; ctx.fillStyle = C.acc; const o = wrap(ctx, s.obj ? '▸ ' + s.obj : '', W - 52).slice(0, 2); o.forEach((l, i) => ctx.fillText(l, 26, 84 + i * 36));
};
wrist.visible = false; uiRoot.add(wrist);
export function setupWrist(onHint, onRepeat) {
  const y = wrist.H - 104;
  wrist.hintBtn = wrist.addButton([18, y, 200, 86], '💡 Hint', () => onHint(), { size: 38 });
  wrist.repBtn = wrist.addButton([232, y, 158, 86], '🔁 Again', () => onRepeat(), { size: 38 });
  wrist.redraw();
}
onFrame(() => {
  if (!isXR() || !wrist.enabledMenu) { wrist.visible = false; return; }
  const left = pointers.find(p => p.side === 'left' && p.kind !== 'mouse');
  if (!left) { wrist.visible = false; return; }
  wrist.visible = true;
  wrist.position.copy(left.palm).add(_up.set(0, left.kind === 'hand' ? 0.12 : 0.1, 0));
  headPos(_hp); wrist.lookAt(_hp);
});
const _up = new THREE.Vector3();
