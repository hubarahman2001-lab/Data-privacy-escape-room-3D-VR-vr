/* Game state, timer, scoring, hints, and the shared task helpers (hunt, decide, drag, hold, readers, exits) */
import { THREE, scene, camera, body, onFrame, sleep, headPos, isXR, inFront, fade, recenter, fitHeight, clamp, V } from './core.js';
import { pointers, input, at, raycastAll, inputKind, boxOf } from './input.js';
import { Panel, C, FONT, textBlock, wrap, rrect, hud, setHud, showCard, hideCard, placeInFront, Ring, glow, uiRoot, wrist, setupWrist } from './ui.js';
import { sfx, speak, stopSpeech, initAudio, ambience } from './audio.js';
import { idCard } from './world.js';

export const CFG = { TIME_LIMIT: 900, WRONG_PENALTY: 10, MAX_HINTS: 3, PASS_MARK: 0.8, DECOY_PENALTY: 5, VAGUE_MS: 40000, FREE_NUDGE_MS: 60000 };
export const G = { runId: 0, state: 'idle', timeLeft: CFG.TIME_LIMIT, score: 0, hints: CFG.MAX_HINTS, code: [], got: [], choices: [], penalties: 0,
  paused: false, badge: 'none', lastLine: '', hintStack: [], cleanups: [] };

/* ---------- run guards: when the game restarts, old task chains freeze instead of carrying on ---------- */
export function loop(fn) { const id = G.runId; const off = onFrame((n, dt) => { if (id !== G.runId) { off(); return; } if (G.paused) return; fn(n, dt, off); }); return off; }
export function wait(ms) { const id = G.runId; return new Promise(r => setTimeout(() => { if (id === G.runId) r(); }, ms)); }
function guard(p) { const id = G.runId; return p.then(v => (id === G.runId ? v : new Promise(() => {}))); }
export function track(fn) { G.cleanups.push(fn); return fn; }

/* ---------- timer ---------- */
let lastHud = 0;
onFrame((now, dt) => {
  if (G.state !== 'play' || G.paused) return;
  G.timeLeft -= dt / 1000;
  if (now - lastHud > 250) { lastHud = now; updateClock(); }
  if (G.timeLeft <= 0) { G.timeLeft = 0; updateClock(); timeUp(); }
});
function fmt(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
function updateClock() { setHud({ time: fmt(G.timeLeft), low: G.timeLeft < 60 }); }

/* ---------- talking, scoring ---------- */
export function say(text, { wait: w = true, who = 'sam' } = {}) {
  sfx('radio'); G.lastLine = text; setHud({ sam: text });
  const p = speak(text, who);
  return w ? guard(p) : Promise.resolve();
}
export function objective(t) { setHud({ obj: t || '' }); }
export function penalty(sec) { G.timeLeft -= sec; G.penalties += sec; sfx('bad'); updateClock(); flashHud(); }
function flashHud() { hud.state.low = true; hud.redraw(); setTimeout(() => { hud.state.low = G.timeLeft < 60; hud.redraw(); }, 700); }
export function addScore(n) { G.score += n; }
export function assess(first, { title, why }) { G.choices.push({ title, first, why }); }
export function lesson(l, color) { if (l) showCard(l[0], l[1], { color: color || C.good, ms: 6500 }); }

/* ---------- hints: the latest activity decides what a hint does ---------- */
export function pushHint(fn) { G.hintStack.push(fn); return () => { const i = G.hintStack.lastIndexOf(fn); if (i >= 0) G.hintStack.splice(i, 1); }; }
export function useHint() {
  if (G.state !== 'play') return;
  const fn = G.hintStack[G.hintStack.length - 1];
  if (!fn) { say("Nothing to look for right now. Keep going."); return; }
  if (G.hints <= 0) { say("No hints left. You've got this."); return; }
  if (fn() !== false) { G.hints--; setHud({ hints: G.hints }); sfx('chime'); }
}
export function repeatLine() { if (G.lastLine) say(G.lastLine, { wait: false }); }
input.onHint = useHint;
input.onPause = () => togglePause();
export function togglePause(force) {
  if (G.state !== 'play') return;
  G.paused = force !== undefined ? force : !G.paused;
  document.body.classList.toggle('paused', G.paused);
  if (G.paused) stopSpeech();
}

/* ---------- your ID card: hip pocket, then clipped on your chest ---------- */
export const badge = { pocket: new THREE.Group(), chest: new THREE.Group(), card: null, held: null, heldBy: null };
body.add(badge.pocket, badge.chest);
badge.pocket.visible = badge.chest.visible = false;
function cardKind() { return G.badge === 'temp' ? 'temp' : 'staff'; }
export function setBadge(state) {
  G.badge = state;
  for (const g of [badge.pocket, badge.chest]) g.clear();
  badge.card = null;
  if (state === 'pocket') { const c = idCard('staff', 1.25); badge.pocket.add(c); badge.card = c; c.userData.interactive = true; }
  if (state === 'staff' || state === 'temp') { const c = idCard(state, 1.25); badge.chest.add(c); badge.card = c; c.userData.interactive = true; }
  badge.pocket.visible = state === 'pocket'; badge.chest.visible = state === 'staff' || state === 'temp';
}
const _hp = new THREE.Vector3();
onFrame(() => {
  // anchor: in VR on your body; on a screen, in the lower right of the view
  const xr = isXR();
  for (const [g, xrPos, scrPos] of [[badge.pocket, [0.22, -0.68, -0.12], [0.36, -0.25, -0.62]], [badge.chest, [0, -0.4, -0.17], [0.27, -0.24, -0.6]]]) {
    const want = xr ? body : camera;
    if (g.parent !== want && !(badge.held && g === (G.badge === 'pocket' ? badge.pocket : badge.chest))) { want.add(g); }
    if (g.parent === want) { g.position.set(...(xr ? xrPos : scrPos)); }
  }
  if (badge.card && !badge.held) {
    headPos(_hp);
    if (xr) badge.card.lookAt(_hp); else badge.card.rotation.set(-0.2, -0.2, 0);
  }
  // pinch your own card to hold it (VR)
  if (xr && badge.card && !badge.held && G.state === 'play') {
    for (const p of pointers) if (p.pinchStart && !p.captured && at(p, badge.card, 0.05)) { holdCard(p); break; }
  }
  if (badge.held) {
    const p = badge.heldBy;
    if (!p || !p.active || !p.pinching) { releaseCard(); }
    else { badge.card.position.copy(p.pinchPos); headPos(_hp); badge.card.lookAt(_hp); }
  }
});
function holdCard(p) {
  badge.held = true; badge.heldBy = p; p.captured = badge.card; scene.attach(badge.card); sfx('pickup');
  if (badge.onHold) badge.onHold(p);
}
function releaseCard() {
  const p = badge.heldBy; if (p) p.captured = null;
  badge.held = false; badge.heldBy = null;
  const home = G.badge === 'pocket' ? badge.pocket : badge.chest;
  if (badge.card) { home.add(badge.card); badge.card.position.set(0, 0, 0); }
  if (badge.onRelease) badge.onRelease();
}
export function dropHeldCard() { if (badge.held) { if (badge.heldBy) badge.heldBy.captured = null; badge.held = false; badge.heldBy = null; if (badge.card) badge.card.removeFromParent(); } }
export function cardPos(out = new THREE.Vector3()) { return badge.card ? badge.card.getWorldPosition(out) : null; }

/* ---------- decisions: a question panel within reach ---------- */
export function decide(D) {
  const id = G.runId;
  return new Promise(res => {
    const P = new Panel(0.58, 0.44, { res: 2000 });
    const opts = shuffle(D.opts.slice());
    let first = true, solved = false, msg = '', msgColor = C.dim;
    P.paint = (ctx, W, H) => {
      ctx.font = `800 46px ${FONT}`; ctx.fillStyle = C.acc; ctx.textBaseline = 'top'; ctx.fillText(D.title.toUpperCase(), 44, 34);
      if (!solved) textBlock(ctx, D.text, 44, 100, W - 88, 40, C.text, 500, 1.25, 4);
      else { ctx.font = `800 52px ${FONT}`; ctx.fillStyle = C.good; ctx.fillText('✓ Correct', 44, 104); textBlock(ctx, D.why, 44, 180, W - 88, 44, C.text, 500, 1.3, 6); }
      if (msg && !solved) { ctx.font = `600 34px ${FONT}`; ctx.fillStyle = msgColor; ctx.fillText(msg, 44, H - 50); }
    };
    const top = 300, bh = 150, gap = 18;
    const btns = opts.map((o, i) => P.addButton([44, top + i * (bh + gap), P.W - 88, bh], `${'ABC'[i]}.  ${o.t}`, () => pick(o, btns[i]), { size: 36, align: 'left', weight: 600 }));
    btns.forEach(b => b.enabled = false); setTimeout(() => btns.forEach(b => { if (!b.state) b.enabled = true; }), 700);
    P.redraw(); show(P, 0.5, -0.14);
    speak(D.text, 'narrator');
    const popHint = pushHint(() => {
      const wrong = opts.map((o, i) => [o, btns[i]]).filter(([o, b]) => !o.ok && !b.state);
      if (!wrong.length) return false;
      const [o, b] = wrong[Math.floor(Math.random() * wrong.length)]; b.state = 'bad'; b.enabled = false; msg = 'Hint: one wrong answer crossed out.'; P.redraw();
    });
    function pick(o, b) {
      if (id !== G.runId || solved) return;
      if (!o.ok) { first = false; b.state = 'bad'; b.enabled = false; penalty(CFG.WRONG_PENALTY); msg = `Not that one. −${CFG.WRONG_PENALTY}s`; msgColor = C.bad; P.redraw(); return; }
      solved = true; b.state = 'good'; sfx('good'); addScore(first ? 150 : 50); assess(first, { title: D.title, why: D.why }); popHint();
      btns.forEach(x => { x.enabled = false; x.draw = false; P.remove(x.mesh); });
      const cont = P.addButton([P.W / 2 - 220, P.H - 160, 440, 120], 'Continue  ›', () => close(), { size: 46 });
      cont.enabled = false; setTimeout(() => cont.enabled = true, 900);
      P.redraw(); speak('Correct. ' + D.why, 'narrator');
      const t = setTimeout(close, 14000);
      function close() { clearTimeout(t); if (P.parent) { P.dispose(); stopSpeech(); if (id === G.runId) res(first); } }
    }
  });
}
export function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
/* show a panel: in VR fixed in the world in front of you; on a screen in front of the camera */
export function show(P, dist = 0.5, dy = -0.14, side = 0) {
  uiRoot.add(P);
  if (isXR()) placeInFront(P, dist, dy, side);
  else { camera.add(P); P.position.set(side * 0.8, dy * 0.4 + 0.04, -0.72); P.rotation.set(0, 0, 0); }
}

/* ---------- hunt: find the risks in a room yourself ---------- */
const _hc = new THREE.Vector3();
export async function hunt({ brief, find, risks, decoys = [] }) {
  if (brief) await say(brief);
  let done = 0; const n = risks.length;
  const setObj = () => objective(find && n === 1 ? find : `${find || 'Find the problems'}  (${done}/${n})`);
  setObj();
  risks.forEach(r => [r.obj, ...(r.alt || [])].forEach(o => o.userData.interactive = true));
  decoys.forEach(d => d.obj.userData.interactive = true);
  let lastProgress = performance.now(), nudged = new Set();
  const popHint = pushHint(() => {
    const left = risks.filter(r => !r.done); if (!left.length) return false;
    const r = left[0]; const g = glow(r.obj); setTimeout(() => g.remove(), 7000); say(r.hint, { wait: false });
  });
  while (done < n) {
    const { risk, p } = await new Promise(res => {
      loop((now, dt, off) => {
        if (now - lastProgress > CFG.FREE_NUDGE_MS) { const r = risks.find(x => !x.done && !nudged.has(x)); if (r) { nudged.add(r); say(r.hint, { wait: false }); } lastProgress = now; }
        if (badge.held && badge.card) { // holding your card up to something counts as finding it
          badge.card.getWorldPosition(_hc);
          for (const r of risks) if (!r.done && [r.obj, ...(r.alt || [])].some(o => boxOf(o).expandByScalar(0.045).containsPoint(_hc))) { off(); res({ risk: r, p: badge.heldBy }); return; }
        }
        for (const p of pointers) {
          if (p.captured || p.uiHit) continue;
          const pinch = p.pinchStart;
          for (const r of risks) {
            if (r.done) continue;
            const objs = [r.obj, ...(r.alt || [])];
            const hit = objs.some(o => (pinch && at(p, o, 0.06)) || (p.kind !== 'mouse' && r.touch !== false && at(p, o, 0.012, 'tip')));
            if (hit) { off(); res({ risk: r, p }); return; }
          }
          if (pinch) for (const d of decoys) if (at(p, d.obj, 0.03)) {
            p.pinchStart = false; sfx('decoy'); say(d.say, { wait: false });
            if (!d.used) { d.used = true; penalty(CFG.DECOY_PENALTY); }
          }
        }
      });
    });
    lastProgress = performance.now();
    sfx('beep');
    if (risk.found) say(risk.found, { wait: false });
    // the task itself: after a while (or with a hint) it shows the exact move
    let shown = false;
    const showMove = () => { if (!risk.move) return false; shown = true; objective('✋ ' + risk.move); };
    const t = setTimeout(() => { if (!shown) showMove(); }, CFG.VAGUE_MS);
    const pop2 = pushHint(() => { if (shown) { const g = glow(risk.target || risk.obj); setTimeout(() => g.remove(), 6000); return; } return showMove(); });
    objective(risk.ask || 'Deal with it');
    await guard(Promise.resolve(risk.task ? risk.task(p, risk) : null));
    clearTimeout(t); pop2();
    risk.done = true; done++; lastProgress = performance.now();
    if (risk.lesson) lesson(risk.lesson);
    sfx('good'); setObj();
    await wait(600);
  }
  popHint(); objective('');
}

/* ---------- drag: pick something up and put it in the right place ---------- */
const _v = new THREE.Vector3(), _c = new THREE.Vector3(), zr = new THREE.Raycaster();
export function dragTask({ item, zones, grabbedBy = null, onGrab, showBack = false, success, label }) {
  item.userData.interactive = true;
  const homeParent = item.parent, homePos = item.position.clone(), homeQuat = item.quaternion.clone();
  let held = null, dist = 0, first = true, busy = false; const off = new THREE.Vector3(), grabAt = new THREE.Vector3();
  return new Promise(res => {
    const start = p => {
      held = p; p.captured = item; scene.attach(item); sfx('pickup'); item.getWorldPosition(grabAt);
      if (p.kind === 'mouse') { dist = p.hit ? p.hit.distance : item.getWorldPosition(_v).distanceTo(p.ray.origin); off.subVectors(item.position, p.ray.at(dist, _v)); dist = Math.min(dist, 1.4); }
      else if (item.position.distanceTo(p.pinchPos) > 0.2) off.set(0, 0, 0); // grabbed with the laser: it flies to your hand
      else off.subVectors(item.position, p.pinchPos);
      if (showBack) off.set(0, 0, 0);
      if (onGrab) onGrab(p);
    };
    if (grabbedBy && grabbedBy.active && grabbedBy.pinching && !grabbedBy.captured) start(grabbedBy);
    loop(async (now, dt, stop) => {
      if (busy) return;
      if (!held) { for (const p of pointers) if (p.pinchStart && !p.captured && !p.uiHit && at(p, item, 0.05)) { p.pinchStart = false; start(p); break; } return; }
      const p = held;
      if (p.active && p.pinching) {
        if (p.kind === 'mouse') item.position.copy(p.ray.at(dist, _v)).add(off); else item.position.copy(p.pinchPos).add(off);
        if (showBack) { headPos(_c); item.lookAt(_c); item.rotateY(Math.PI); }
        return;
      }
      // let go: where did it land?
      held = null; p.captured = null;
      if (item.getWorldPosition(_v).distanceTo(grabAt) < 0.06) { busy = true; await goHome(); busy = false; return; } // just picked up and let go
      let z = null; boxOf(item).getCenter(_c);
      for (const zz of zones) if (boxOf(zz.obj).expandByScalar(0.09).containsPoint(_c)) { z = zz; break; }
      if (!z && p.kind === 'mouse') { zr.ray.copy(p.ray); const h = zr.intersectObjects(zones.map(q => q.obj), true)[0]; if (h) z = zones.find(q => q.obj === h.object || q.obj.getObjectById(h.object.id)); }
      if (!z) { sfx('drop'); busy = true; await goHome(); busy = false; return; }
      if (z.shut && z.shut()) { z.onShut && z.onShut(); busy = true; await goHome(); busy = false; return; }
      if (!z.ok) { first = false; penalty(CFG.WRONG_PENALTY); showCard(z.title || 'Not there', z.why || 'Try somewhere else.', { color: C.bad, ms: 5000 }); busy = true; await goHome(); busy = false; return; }
      stop(); addScore(first ? 100 : 40);
      if (success) await success(z, item); else { item.removeFromParent(); }
      res({ first, zone: z });
    });
    function goHome() {
      homeParent.attach(item);
      const p0 = item.position.clone(), q0 = item.quaternion.clone(), t0 = performance.now();
      return new Promise(r => { const o = onFrame(now => { const k = clamp((now - t0) / 350, 0, 1), e = k * (2 - k);
        item.position.lerpVectors(p0, homePos, e); item.quaternion.slerpQuaternions(q0, homeQuat, e); if (k >= 1) { o(); r(); } }); });
    }
  });
}

/* ---------- hold a hand shape at something (open palm, fist...) ---------- */
export function holdGesture({ target, pose, ms = 700, r = 0.25, where = 'palm', test = null, onProgress = null }) {
  const ring = new Ring(0.06); scene.add(ring); ring.visible = false;
  const ctr = boxOf(target).getCenter(new THREE.Vector3());
  let prog = 0;
  return new Promise(res => {
    loop((now, dt, off) => {
      let ok = false;
      for (const p of pointers) {
        if (p.kind === 'mouse') { if (p.pinching && at(p, target)) ok = true; continue; }
        const poseOk = pose === 'any' || p.pose === pose || (Array.isArray(pose) && pose.includes(p.pose));
        if (poseOk && at(p, target, r, where) && (!test || test(p))) ok = true;
      }
      prog = ok ? prog + dt : Math.max(0, prog - dt * 1.5);
      headPos(_c); ring.position.copy(ctr).lerp(_c, 0.12); ring.visible = prog > 0; ring.set(prog / ms);
      if (onProgress) onProgress(prog / ms);
      if (prog >= ms) { off(); ring.dispose(); res(); }
    });
  });
}

/* ---------- card readers: hold your card to the reader ---------- */
export function tapReader(readers, { onBare } = {}) {
  readers = [].concat(readers); readers.forEach(r => r.userData.interactive = true);
  let lastBare = 0;
  return new Promise(res => {
    loop((now, dt, off) => {
      const okCard = G.badge === 'staff' || G.badge === 'temp';
      for (const rd of readers) {
        const b = boxOf(rd).expandByScalar(0.045);
        if (okCard && badge.held && badge.card && b.containsPoint(badge.card.getWorldPosition(_c))) { off(); finish(rd); return; }
        for (const p of pointers) {
          if (p.kind === 'mouse') { if (p.pinchStart && at(p, rd)) { if (okCard) { off(); finish(rd); return; } else bare(now); } continue; }
          // point at the reader and pull the trigger / pinch: taps the card you're wearing
          if (p.pinchStart && p !== badge.heldBy && !p.captured && p.hit && at(p, rd)) { if (okCard) { off(); finish(rd); return; } else bare(now); }
          if (!badge.held && at(p, rd, 0.01, 'tip')) bare(now);
        }
      }
    });
    function bare(now) { if (now - lastBare < 2500) return; lastBare = now; sfx('decoy'); if (onBare) onBare(); }
    function finish(rd) { sfx('unlock'); addScore(50); res(rd); }
  });
}

/* ---------- leaving a room: walk to the exit, or press the button ---------- */
export function exitRoom({ target, pos, label }) {
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.18, 16), new THREE.MeshBasicMaterial({ color: 0x7be9ff }));
  arrow.rotation.x = Math.PI; arrow.position.set(pos[0], pos[2] ?? 2.2, pos[1]); scene.add(arrow);
  const P = new Panel(0.34, 0.085, { res: 1800 });
  P.paint = () => {};
  const eb = P.addButton([16, 16, P.W - 32, P.H - 32], label + '  →', () => go(), { size: 54 }); eb.enabled = false; setTimeout(() => eb.enabled = true, 900);
  P.redraw();
  objective(label);
  let gone = false, resolve;
  if (isXR()) { uiRoot.add(P); placeInFront(P, 0.45, -0.32, 0.12); } else { camera.add(P); P.position.set(0, -0.12, -0.72); }
  if (target) target.userData.interactive = true;
  function go() { if (gone) return; gone = true; sfx('whoosh'); P.dispose(); arrow.removeFromParent(); objective(''); resolve(); }
  return new Promise(res => {
    resolve = res;
    loop((now, dt, off) => {
      arrow.position.y = (pos[2] ?? 2.2) + Math.sin(now / 250) * 0.06; arrow.rotation.y += dt / 600;
      headPos(_c); if (Math.hypot(_c.x - pos[0], _c.z - pos[1]) < 0.75) { off(); go(); }
      if (target) for (const p of pointers) if (p.pinchStart && !p.captured && !p.uiHit && at(p, target, 0.04)) { off(); go(); }
    });
  });
}

/* ---------- running the rooms ---------- */
let ROOMS = [], ZONE_MSG = {}, current = null;
export function setRooms(r, zm) { ROOMS = r; ZONE_MSG = zm; }
export const roomRoot = new THREE.Group(); roomRoot.name = 'rooms'; scene.add(roomRoot);
input.rayRoots.push(roomRoot, body, camera);
let ambStop = () => {};

function clearRoom() {
  for (const f of G.cleanups.splice(0)) { try { f(); } catch (e) {} }
  const panels = new Set();
  roomRoot.traverse(o => { if (o.userData && o.userData.off) o.userData.off(); if (o.userData && o.userData.panel) panels.add(o.userData.panel); });
  panels.forEach(p => p.dispose());
  roomRoot.clear(); ambStop(); ambStop = () => {};
}

export async function startGame({ intro = true, from = 0 } = {}) {
  initAudio();
  G.runId++; const id = G.runId;
  clearRoom(); hideCard(); stopSpeech();
  uiRoot.children.slice().forEach(c => { if (c !== wrist && c.userData && c !== hud) { if (c.dispose) c.dispose(); else c.removeFromParent(); } });
  camera.children.slice().forEach(c => { if (c instanceof Panel && c !== hud) c.dispose(); });
  Object.assign(G, { state: 'intro', timeLeft: CFG.TIME_LIMIT, score: 0, hints: CFG.MAX_HINTS, code: Array.from({ length: 4 }, () => 1 + Math.floor(Math.random() * 9)),
    got: [], choices: [], penalties: 0, paused: false, lastLine: '', hintStack: [] });
  dropHeldCard(); setBadge('none');
  setHud({ time: fmt(G.timeLeft), low: false, code: [], hints: G.hints, sam: '', obj: '', zone: '' });
  wrist.enabledMenu = true;
  await fade(1, 200);
  if (from > 0) { // testing: jump ahead
    setBadge(from >= 6 ? 'temp' : from >= 2 ? 'staff' : from >= 1 ? 'pocket' : 'none'); intro = false;
    ROOMS.slice(0, from).forEach(R => { if (R.zoneEnd) G.got[R.zone - 1] = G.code[R.zone - 1]; }); setHud({ code: G.got.slice() });
  }
  for (let i = from; i < ROOMS.length; i++) {
    if (id !== G.runId) return;
    const R = ROOMS[i];
    clearRoom(); current = R;
    const refs = R.build(roomRoot); G.refs = refs; G.roomId = R.id;
    input.bounds = R.bounds || null;
    recenter(); if (i === from) fitHeight();
    ambStop = ambience(R.amb || 'hum');
    setHud({ zone: `${R.floor} · ${R.name}` });
    await fade(0, 500); if (id !== G.runId) return;
    if (i === from && intro) { hud.active = false; await introPanel(); if (id !== G.runId) return; }
    G.state = 'play'; hud.active = true; hud.showUntil = performance.now() + 9000;
    if (R.line) await say(R.line);
    await guard(R.run(refs));
    if (R.zoneEnd) {
      const d = G.code[R.zone - 1]; G.got[R.zone - 1] = d; setHud({ code: G.got.slice() }); sfx('chime');
      showCard(`${R.zoneName} cleared`, `${ZONE_MSG[R.zone]} Digit ${R.zone} of the all-clear code. It's at the top of your view.`, { big: String(d), ms: 6500 });
      await wait(1800);
    }
    if (R.outro) await say(R.outro);
    if (R.exit) await guard(exitRoom(R.exit(refs)));
    await fade(1, 450);
  }
  if (id === G.runId) results(true);
}

function introPanel() {
  return new Promise(res => {
    const P = new Panel(0.66, 0.5, { res: 1900, onTop: true });
    const kind = inputKind();
    P.paint = (ctx, W, H) => {
      ctx.font = `800 64px ${FONT}`; ctx.fillStyle = C.acc; ctx.textBaseline = 'top'; ctx.fillText('LOCK DOWN THE OFFICE', 50, 40);
      let y = textBlock(ctx, "7:45 pm. You came back for your charger. A visitor badge went missing today, so Security is sealing the building in 15 minutes. Find and fix every privacy risk between the car park and the server room, collect the four-digit all-clear code, and enter it before the doors lock.", 50, 130, W - 100, 38, C.text, 500, 1.3);
      y += 24;
      const how = kind === 'ctrl'
        ? 'Controllers: point the laser at something (it turns yellow) and pull the trigger to pick it up or use it. Hold the trigger to carry it. Grip = make a fist · A or X = open hand · B or Y = hint · left stick walks, right stick turns.'
        : kind === 'hand'
          ? 'Point at something (a yellow line shows) and pinch thumb + index to grab it, or reach out and pinch it up close. Keep pinching to carry it. Poke buttons, push, turn. Nobody tells you which move to use. Look at your left wrist for 💡 Hint.'
          : 'Click things to pick them, drag to carry them, hold the mouse on something to hold your hand there. Drag empty space to look around, WASD to walk, H for a hint.';
      textBlock(ctx, how, 50, y, W - 100, 34, C.dim, 500, 1.3);
    };
    const sb = P.addButton([P.W / 2 - 260, P.H - 170, 520, 120], 'Start  ›', () => { P.dispose(); res(); }, { size: 52 }); sb.enabled = false; setTimeout(() => sb.enabled = true, 1200);
    P.redraw(); show(P, 0.62, -0.08);
  });
}

function timeUp() {
  if (G.state !== 'play') return;
  G.state = 'over'; sfx('alarm'); setTimeout(() => sfx('lose'), 600);
  results(false);
}

function results(won) {
  const id = ++G.runId; G.state = 'over'; stopSpeech(); objective('');
  const total = G.choices.length, firstRight = G.choices.filter(c => c.first).length;
  const share = total ? firstRight / total : 0, passed = won && share >= CFG.PASS_MARK;
  if (won) { sfx('win'); G.score += Math.round(G.timeLeft) * 2; }
  const used = CFG.TIME_LIMIT - Math.max(0, G.timeLeft);
  const missed = G.choices.filter(c => !c.first);
  fade(0, 300);
  const P = new Panel(0.66, 0.56, { res: 1900, onTop: true });
  P.paint = (ctx, W, H) => {
    ctx.textBaseline = 'top';
    ctx.font = `800 66px ${FONT}`; ctx.fillStyle = won ? (passed ? C.good : C.warn) : C.bad;
    ctx.fillText(won ? (passed ? 'All clear. You passed.' : 'All clear, but not a pass yet') : 'Lockdown. The doors sealed.', 50, 40);
    ctx.font = `600 40px ${FONT}`; ctx.fillStyle = C.text;
    const rows = [['Score', String(G.score)], ['Right first time', `${firstRight} of ${total}  (${Math.round(share * 100)}%, pass mark ${Math.round(CFG.PASS_MARK * 100)}%)`],
      ['Time used', fmt(used) + (G.penalties ? `  (incl. ${G.penalties}s in penalties)` : '')], ['Hints used', `${CFG.MAX_HINTS - G.hints} of ${CFG.MAX_HINTS}`]];
    rows.forEach(([a, b], i) => { ctx.fillStyle = C.dim; ctx.fillText(a, 50, 150 + i * 62); ctx.fillStyle = C.text; ctx.fillText(b, 400, 150 + i * 62); });
    let y = 420;
    if (missed.length) { ctx.font = `700 36px ${FONT}`; ctx.fillStyle = C.warn; ctx.fillText('Worth another look:', 50, y); y += 52;
      for (const m of missed.slice(0, 4)) y = textBlock(ctx, `• ${m.title}: ${m.why}`, 50, y, W - 100, 31, C.text, 500, 1.25, 2) + 8; }
    else if (!won) textBlock(ctx, 'Time ran out before the all-clear code was sent. Try again: hints and the wrist menu can help.', 50, y, W - 100, 36, C.text);
    else textBlock(ctx, 'Every call right the first time. Nice work.', 50, y, W - 100, 38, C.text);
  };
  P.addButton([P.W / 2 - 260, P.H - 150, 520, 110], '↻  Play again', () => { P.dispose(); startGame({ intro: false }); }, { size: 48 });
  P.redraw(); show(P, 0.62, -0.06);
  hud.active = false;
  reportResult({ won, passed, score: G.score, share, right: firstRight, total, used: Math.round(used) });
}
/* tell a SCORM launcher (the window that opened this one, or the page around it) how the run went */
function reportResult(detail) {
  const msg = { type: 'escape-result', ...detail, at: Date.now() };
  try { window.dispatchEvent(new CustomEvent('escape-result', { detail: msg })); } catch (e) {}
  try { localStorage.setItem('escape-result', JSON.stringify(msg)); } catch (e) {}
  for (const w of [window.opener, window.parent !== window ? window.parent : null]) { try { if (w) w.postMessage(msg, '*'); } catch (e) {} }
}

setupWrist(() => useHint(), () => repeatLine());
