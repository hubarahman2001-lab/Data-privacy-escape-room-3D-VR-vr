/* The ten rooms, from the car park to the server room. Each room: build() makes the 3D space, run() plays it.
   Story, questions and lessons come from the 2D game (see content.js). */
import { THREE, onFrame, headPos, clamp, camera, body } from './core.js';
import { pointers, at, boxOf, inputKind } from './input.js';
import { Panel, C, FONT, textBlock, Bubble, Ring, glow, showCard, rrect, wrap } from './ui.js';
import { sfx, ringtone, speak } from './audio.js';
import { M, TEX, GLASS, box, cyl, group, sign, shell, lightRig, zone, person, walkTo, idCard, led } from './world.js';
import { G, CFG, say, objective, penalty, addScore, assess, lesson, pushHint, decide, hunt, dragTask, holdGesture, tapReader,
  setBadge, badge, dropHeldCard, loop, wait, track, show, shuffle } from './game.js';
import { DECISIONS, PAGES, LINES } from './content.js';

export const ZONE_MSG = { 1: 'The entrance is secured: no stray visitor gets in tonight.', 2: 'The lifts and the office door are covered.',
  3: 'Your desk and the meeting room are clean.', 4: 'The print room is cleared.' };

/* ---------- small helpers ---------- */
const _v = new THREE.Vector3(), _w = new THREE.Vector3();
function tween(ms, fn) { return new Promise(res => { const t0 = performance.now(); const off = onFrame(now => { const k = clamp((now - t0) / ms, 0, 1); fn(k * k * (3 - 2 * k)); if (k >= 1) { off(); res(); } }); }); }
function faceOrigin(p) { p.rotation.y = Math.atan2(-p.position.x, -p.position.z); }
/* wait until someone pinches (or, with a hand, touches) the object */
function waitPinch(obj, { r = 0.05, touch = true } = {}) {
  obj.userData.interactive = true;
  return new Promise(res => loop((n, dt, off) => {
    for (const p of pointers) {
      if (p.captured || p.uiHit) continue;
      if ((p.pinchStart && at(p, obj, r)) || (touch && p.kind !== 'mouse' && at(p, obj, 0.01, 'tip'))) { p.pinchStart = false; off(); res(p); return; }
    }
  }));
}
function bubbleOn(personObj, text, y = 2.02) { const b = new Bubble(text); b.position.set(0, y, 0); personObj.add(b); track(() => b.dispose()); return b; }
function sheet(parent, w, h, draw, x, y, z, rx = -Math.PI / 2, ry = 0, res = 900) {
  const m = sign(parent, w, h, { draw, res }, x, y, z); m.rotation.set(rx, 0, 0); if (ry) m.rotation.z = ry; return m;
}
function lines(ctx, x, y, w, n, gap, color = '#9aa6b5') { ctx.fillStyle = color; for (let i = 0; i < n; i++) ctx.fillRect(x, y + i * gap, w * (0.6 + 0.4 * ((i * 37) % 10) / 10), 6); }
function label(parent, text, w, h, x, y, z, ry = 0, bg = '#ffffff', fg = '#1b2a3d', size = .55) { return sign(parent, w, h, { text, bg, fg, size }, x, y, z, ry); }
const F = {
  concrete: () => M('#a3a6ab', { map: TEX.concrete([7, 7]), r: .85 }),
  marble: () => M('#ffffff', { map: TEX.marble([3, 3]), r: .25, m: .05 }),
  carpet: () => M('#ffffff', { map: TEX.carpet('#3a4656', [4, 4]), r: .95 }),
  tiles: () => M('#ffffff', { map: TEX.tiles('#c9ccd1', '#9ea3aa', 4, [3, 3]), r: .5 }),
  wall: (c = '#dfe3e8') => M('#ffffff', { map: TEX.wall(c), r: .9 }),
  wood: (c = '#8a6040') => M('#ffffff', { map: TEX.wood(c), r: .55 }),
  steel: () => M('#b9c0c8', { r: .3, m: .85 }),
  dark: () => M('#1c2129', { r: .6 }),
  white: () => M('#f2f3f5', { r: .5 }),
};
function nightWindow(parent, w, h, x, y, z, ry = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: TEX.city(), toneMapped: false }));
  m.position.set(x, y, z); m.rotation.y = ry; parent.add(m);
  const fr = M('#2a2f36', { r: .4, m: .6 });
  for (let i = 0; i <= 4; i++) { const mul = new THREE.Mesh(new THREE.BoxGeometry(.05, h, .05), fr); mul.position.set(-w / 2 + i * w / 4, 0, .03); m.add(mul); }
  return m;
}
function plant(parent, x, z) {
  cyl(parent, .2, .16, .45, M('#e9e5dd', { r: .6 }), x, 0, z);
  for (let i = 0; i < 9; i++) { const l = new THREE.Mesh(new THREE.SphereGeometry(.16, 10, 8), M(i % 2 ? '#2f6b3a' : '#3f8a4a', { r: .8 }));
    l.scale.set(.6, 1.4, .3); l.position.set(x + Math.sin(i * 2.4) * .14, .7 + (i % 3) * .14, z + Math.cos(i * 2.4) * .14); l.rotation.set(Math.sin(i) * .5, i, Math.cos(i) * .5); parent.add(l); }
}
function chair(parent, x, z, ry = 0) {
  const g = group(parent, x, 0, z, ry), d = M('#2b3038', { r: .6 });
  cyl(g, .03, .03, .42, F.steel(), 0, 0, 0, 8); box(g, .5, .08, .48, d, 0, .44, 0); box(g, .48, .5, .07, d, 0, .55, .24);
  for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5; box(g, .04, .03, .3, F.steel(), Math.sin(a) * .14, .02, Math.cos(a) * .14, a); }
  return g;
}
function deskUnit(parent, x, z, ry = 0, w = 1.4, d = .7) {
  const g = group(parent, x, 0, z, ry);
  box(g, w, .035, d, F.wood('#c9b394'), 0, .72, 0); box(g, .04, .72, d, F.steel(), -w / 2 + .03, 0, 0); box(g, .04, .72, d, F.steel(), w / 2 - .03, 0, 0);
  box(g, w, .4, .02, M('#5a6573', { r: .8 }), 0, .9 + .2 - .2, -d / 2 + .01);
  return g;
}

/* ======================================================================
   1. CAR PARK
   ====================================================================== */
function buildCar(parent) {
  const car = group(parent), paint = M('#1d3a5c', { r: .28, m: .7 }), dark = M('#15181d', { r: .5 }), glass = M('#6f8fa8', { r: .05, m: .2, t: .32 });
  box(car, 4.2, .55, 1.8, paint, 0, .22, 0);
  box(car, 4.25, .1, 1.82, dark, 0, .2, 0);
  box(car, 2.05, .05, 1.56, paint, .3, 1.32, 0);
  // windscreen and rear screen (slanted)
  const ws = box(car, .012, .62, 1.5, glass, -0.89, .77, 0); ws.position.y = 1.06; ws.rotation.z = -0.56;
  const rs = box(car, .012, .6, 1.5, glass, 1.48, .77, 0); rs.position.y = 1.05; rs.rotation.z = 0.62;
  // pillars
  for (const s of [-1, 1]) {
    const a = box(car, .06, .62, .06, paint, -0.89, .77, s * .76); a.position.y = 1.06; a.rotation.z = -0.56;
    box(car, .08, .55, .06, paint, .32, .77, s * .77);
    const c = box(car, .06, .6, .06, paint, 1.48, .77, s * .76); c.position.y = 1.05; c.rotation.z = 0.62;
  }
  // side glass: far side full, near (+z, driver) side only the rear window: the driver's window is down
  box(car, 1.16, .5, .012, glass, -0.28, .8, -.78); box(car, 1.02, .5, .012, glass, .88, .8, -.78);
  box(car, 1.02, .5, .012, glass, .88, .8, .78);
  box(car, 1.16, .04, .05, dark, -0.28, .77, .79); // empty window sill
  // doors and handles
  box(car, .01, .5, .01, dark, .32, .25, .905); box(car, .01, .5, .01, dark, 1.3, .25, .905);
  box(car, .14, .03, .03, F.steel(), 0, .66, .91); box(car, .14, .03, .03, F.steel(), 1.0, .66, .91);
  // interior
  box(car, .42, .16, 1.62, dark, -0.66, .77, 0);                 // dashboard (top at .93)
  const wheelRing = new THREE.Mesh(new THREE.TorusGeometry(.17, .022, 8, 24), dark); wheelRing.position.set(-0.43, .97, .38); wheelRing.rotation.y = Math.PI / 2; wheelRing.rotation.x = .45; car.add(wheelRing);
  for (const z of [-.4, .4]) { box(car, .5, .14, .5, M('#3a3f47', { r: .9 }), 0, .45, z); box(car, .12, .6, .5, M('#3a3f47', { r: .9 }), .3, .55, z); }
  box(car, .55, .14, 1.4, M('#3a3f47', { r: .9 }), 1.05, .45, 0);
  // wheels and lights
  for (const x of [-1.38, 1.38]) for (const z of [-.82, .82]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(.33, .33, .22, 24), dark); w.rotation.x = Math.PI / 2; w.position.set(x, .33, z); car.add(w);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(.18, .18, .23, 16), F.steel()); hub.rotation.x = Math.PI / 2; hub.position.copy(w.position); car.add(hub); }
  for (const z of [-.62, .62]) { box(car, .04, .1, .3, M('#ffffff', { e: '#fff8e0', ei: 1.2 }), -2.11, .56, z); box(car, .04, .1, .3, M('#a01010', { e: '#ff2020', ei: .6 }), 2.11, .58, z); }
  sign(car, .5, .12, { text: 'A 12345', bg: '#f4f4f4', fg: '#111', size: .7 }, 2.13, .42, 0, Math.PI / 2);
  // mirror
  box(car, .12, .08, .1, paint, -0.72, .95, .95);
  return car;
}

const parking = {
  id: 'parking', name: 'Car park', floor: 'P', zone: 1, zoneName: 'Arrival', line: '7:45 pm. You came back for your charger.',
  outro: "Card's in your pocket. Take the stairs up.", bounds: [-3.1, 3.1, -4.6, 2.1],
  build(root) {
    const g = group(root);
    shell(g, { x0: -3.5, x1: 3.5, z0: -5, z1: 2.5, h: 2.7, floor: F.concrete(), wall: M('#ffffff', { map: TEX.concrete([4, 1]), r: .9 }), ceil: M('#77797e', { map: TEX.concrete([5, 5]), r: .95 }),
      lights: [[-1.8, -1.2, 1.4, .12], [1.8, -1.2, 1.4, .12], [-1.8, -3.8, 1.4, .12], [1.8, -3.8, 1.4, .12], [0, 1.4, 1.4, .12]] });
    lightRig(g, { hemi: [0xd8e6ff, 0x404040, .7], points: [[0, 2.4, -1.4, 0xeaf2ff, 5, 8], [2.4, 2.4, -2.4, 0xeaf2ff, 3, 6]], amb: .12 });
    const yel = M('#e8c547', { r: .6 });
    for (const x of [-2.4, -0.25, 2.0]) box(g, .08, .004, 2.8, yel, x, 0, -1.9);
    box(g, 6.6, .004, .1, yel, 0, 0, -3.35);
    for (const [x, z] of [[-3.0, -3.7], [3.0, -0.2], [-3.0, 0.9], [3.0, -4.5]]) { box(g, .5, 2.7, .5, M('#ffffff', { map: TEX.concrete([1, 3]) }), x, 0, z); box(g, .52, .35, .52, M('#e8c547'), x, .25, z); }
    sign(g, .7, .7, { text: 'P1', bg: '#1f4e8c', size: .7 }, -3.48, 1.8, -2.0, Math.PI / 2);
    const car = buildCar(g); car.position.set(.25, 0, -1.75);
    // a second car in the far bay
    const car2 = buildCar(g); car2.position.set(-1.2, 0, -4.25); car2.rotation.y = Math.PI; car2.children[0].material = M('#7b1e1e', { r: .3, m: .6 });
    // your ID card on the dashboard, just inside the open driver's window
    const card = idCard('staff', 1.25); card.position.set(-0.6, .935, .58); card.rotation.set(-Math.PI / 2, 0, 0.5); car.add(card);
    // stairs door on the right wall
    box(g, .08, 2.15, 1.1, M('#3d4a57', { r: .5, m: .4 }), 3.46, 0, -2.2);
    const door = box(g, .06, 2.05, .98, M('#6d7f8f', { r: .45, m: .5 }), 3.42, 0, -2.2);
    sign(g, .7, .2, { text: '🚶 STAIRS ↑  Ground floor', bg: '#137a3f', size: .55, glow: true }, 3.44, 2.32, -2.2, -Math.PI / 2);
    box(g, .04, .03, .3, F.steel(), 3.37, 1.0, -1.85);
    // colleague
    const maya = person(g, { shirt: '#8a3d5c', trousers: '#2d2a3a', skin: '#b98a68', hijab: '#2d2a3a' }, 2.6, -2.3, -Math.PI / 2);
    return { car, card, maya, door };
  },
  async run(r) {
    say("Sam here, Security. A visitor badge went missing today, so I'm sealing the building. Your hands are your tools tonight. Heads up: someone's coming over.");
    await walkTo(r.maya, 1.05, -0.85, 3200); faceOrigin(r.maya);
    await wait(1200);
    // --- the colleague without her card ---
    const bub = bubbleOn(r.maya, 'Hey! I left my card at home. Can you badge me through upstairs?');
    r.maya.userData.talk = true; setTimeout(() => r.maya.userData.talk = false, 2200);
    speak('Hey! I left my card at home. Can you badge me through upstairs?', 'narrator');
    objective('What do you do?');
    let first = true;
    await new Promise(res => {
      const kind = inputKind(); let P = null;
      const move = '✋ Hold up your open hand to stop her · 👍 a thumbs up lets her through';
      if (kind !== 'hand') {
        P = new Panel(0.44, 0.1, { res: 1800 }); P.paint = () => {};
        P.addButton([16, 16, P.W / 2 - 24, P.H - 32], '✋ Stop her', () => choose('palm'), { size: 44 });
        P.addButton([P.W / 2 + 8, 16, P.W / 2 - 24, P.H - 32], '👍 Let her through', () => choose('thumb'), { size: 44 });
        P.redraw(); show(P, 0.55, -0.25);
      }
      const pop = pushHint(() => objective(move));
      const tv = setTimeout(() => objective(move), CFG.VAGUE_MS);
      const ring = new Ring(0.07); r.maya.add(ring); ring.position.set(0, 1.25, .25); ring.visible = false;
      let pPalm = 0, pThumb = 0, cool = 0, done = false;
      loop((now, dt, off) => {
        let palm = false, thumb = false; headPos(_v);
        for (const p of pointers) {
          if (p.kind === 'hand') { const raised = p.palm.y > _v.y - 0.5 && Math.hypot(p.palm.x - _v.x, p.palm.z - _v.z) > 0.18; if (p.pose === 'open' && raised) palm = true; if (p.pose === 'thumb') thumb = true; }
          if (p.kind === 'ctrl') { if (p.pose === 'open') palm = true; if (p.pose === 'thumb') thumb = true; }
        }
        pPalm = palm ? pPalm + dt : Math.max(0, pPalm - dt * 2);
        pThumb = thumb && now > cool ? pThumb + dt : Math.max(0, pThumb - dt * 2);
        const k = Math.max(pPalm, pThumb) / 900; ring.visible = k > 0; ring.set(k, pPalm >= pThumb ? 0x7be9ff : 0x2fcf84);
        if (pPalm >= 900) choose('palm'); else if (pThumb >= 900) { pThumb = 0; cool = now + 1500; choose('thumb'); }
        if (done) off();
      });
      function choose(k) {
        if (done) return;
        if (k === 'thumb') { first = false; penalty(CFG.WRONG_PENALTY); bub.say('Thanks! Right behind you…');
          showCard('Hold on', "That's exactly how badges go missing. Cards are personal: stop her and send her to Security.", { color: C.bad }); return; }
        done = true; clearTimeout(tv); pop(); ring.dispose(); if (P) P.dispose(); sfx('good'); addScore(first ? 100 : 40);
        bub.say("Fair enough. I'll get a temporary pass from Security."); res();
      }
    });
    assess(first, { title: 'The colleague without her card', why: 'Cards are personal. A forgotten card means a temporary pass from Security.' });
    lesson(['Cards are personal', "A forgotten card means a temporary pass from Security, never someone else's badge."]);
    await wait(2500);
    walkTo(r.maya, 2.9, -2.2, 2600).then(() => { r.maya.visible = false; });
    // --- your own card is in the car ---
    await hunt({ brief: "Good call. She's on her way to the Security desk. One more thing before you head up: you'll need your own ID card tonight, and it isn't on you. Did you leave it in the car?",
      find: 'Find your ID card', risks: [{ obj: r.card, hint: 'You drove here. Check your car, through the open window.', ask: 'Take it with you', move: 'Pinch your ID card to take it',
        task: async (p, risk) => { if (!p.pinching) await waitPinch(r.card); sfx('pickup');
          await tween(450, k => { r.card.scale.setScalar(1 - k * .9); }); r.card.visible = false; setBadge('pocket'); sfx('clink'); addScore(50);
          objective('ID card in your pocket'); },
        lesson: ['Keep your card on you', 'An ID card left in a car can be taken and used by someone else.'] }] });
  },
  exit: r => ({ target: r.door, pos: [2.9, -2.2], label: 'Take the stairs up', travel: 'Taking the stairs up to the ground floor…', sound: 'stairs' }),
};

/* ======================================================================
   2. GROUND FLOOR (escalator)
   ====================================================================== */
const ground = {
  id: 'escalator', name: 'Ground floor', floor: 'G', zone: 1, zoneName: 'Arrival', line: 'The escalator is still running.',
  bounds: [-2.6, 2.6, -1.4, 1.8],
  build(root) {
    const g = group(root);
    shell(g, { x0: -3, x1: 3, z0: -6, z1: 2.2, h: 3.4, floor: F.marble(), wall: F.wall('#e4e1db'), lights: [[-1.5, 0, 2, .3], [1.5, 0, 2, .3], [0, -2.5, 2, .3]] });
    lightRig(g, { hemi: [0xfff4e6, 0x3a3328, .9], points: [[0, 3, -.5, 0xfff1dc, 5, 9], [0, 3, -4, 0xfff1dc, 3, 8]], amb: .15 });
    nightWindow(g, 5.8, 2.6, 0, 1.4, 2.18, Math.PI);
    // escalator going up toward the back wall
    const esc = group(g, 0, 0, -1.5);
    const stepTex = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 256; const x = c.getContext('2d'); x.fillStyle = '#3b3f45'; x.fillRect(0, 0, 64, 256);
      x.fillStyle = '#9aa0a8'; for (let i = 0; i < 256; i += 8) x.fillRect(0, i, 64, 3); x.fillStyle = '#e8c547'; x.fillRect(0, 0, 64, 10); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 3); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    const L = 4.4, ang = 0.52, rise = Math.sin(ang) * L, run = Math.cos(ang) * L;
    const steps = new THREE.Mesh(new THREE.PlaneGeometry(1.0, L), new THREE.MeshStandardMaterial({ map: stepTex, roughness: .5, metalness: .6 }));
    steps.rotation.x = -Math.PI / 2 + ang; steps.position.set(0, rise / 2 + .02, -run / 2 - .5); esc.add(steps);
    box(esc, 1.0, .02, .5, F.steel(), 0, 0, -.25);
    for (const s of [-1, 1]) {
      const bal = new THREE.Mesh(new THREE.BoxGeometry(.02, .9, L + .6), GLASS()); bal.rotation.x = ang; bal.position.set(s * .56, rise / 2 + .5, -run / 2 - .4); esc.add(bal);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(.08, .05, L + .9), M('#111111', { r: .4 })); rail.rotation.x = ang; rail.position.set(s * .56, rise / 2 + .97, -run / 2 - .35); esc.add(rail);
      const skirt = new THREE.Mesh(new THREE.BoxGeometry(.06, .3, L + .4), F.steel()); skirt.rotation.x = ang; skirt.position.set(s * .53, rise / 2 + .05, -run / 2 - .45); esc.add(skirt);
      box(esc, .12, 1.0, .5, F.steel(), s * .56, 0, -.15);
    }
    box(g, 6, .3, 4, M('#cfcac2', { r: .7 }), 0, 3.1, -4.2);
    sign(g, 1.6, .32, { text: 'Level 1 ↑  Reception · Gates · Lifts', bg: '#1b2a3d', size: .45, glow: true }, 0, 2.75, -1.35);
    plant(g, -1.9, -0.9); plant(g, 2.0, -0.5);
    const bench = group(g, -2.3, 0, .6, Math.PI / 2); box(bench, 1.4, .06, .45, F.wood('#6b4a30'), 0, .42, 0); box(bench, .06, .42, .4, F.steel(), -.6, 0, 0); box(bench, .06, .42, .4, F.steel(), .6, 0, 0);
    g.userData.off = onFrame((n, dt) => { stepTex.offset.y -= dt / 4000; });
    return { esc, steps };
  },
  async run(r) {
    await say('Ground floor is clear on my cameras. Before you ride up, is anything missing?');
    objective('Is anything missing?');
    const move = 'Take your ID card from your pocket and clip it on your chest';
    let shown = false; const showMove = () => { shown = true; objective('✋ ' + move); };
    const tv = setTimeout(() => { if (!shown) showMove(); }, CFG.VAGUE_MS);
    const pop = pushHint(() => { if (!shown) { say("Your card's in your pocket. Where should it be once you're inside the building?", { wait: false }); return showMove(); }
      if (badge.card) { const gl = glow(badge.card); setTimeout(() => gl.remove(), 5000); } });
    await new Promise(res => loop((n, dt, off) => {
      if (inputKind() === 'mouse') { for (const p of pointers) if (p.pinchStart && badge.card && at(p, badge.card, .02)) { off(); res(); } return; }
      if (!badge.held || !badge.card) return;   // pinch the card at your hip: it follows your hand
      body.localToWorld(_w.set(0, -0.38, -0.15)); badge.card.getWorldPosition(_v);
      if (_v.distanceTo(_w) < 0.17) { off(); res(); }
    }));
    clearTimeout(tv); pop();
    dropHeldCard(); setBadge('staff'); sfx('clink'); addScore(50);
    lesson(['Badge on inside, away outside', 'Wear your card where it can be seen in the building. Outside, put it away: a badge tells strangers where you work.']);
    await wait(800);
  },
  exit: r => ({ target: r.steps, pos: [0, -1.4, 1.6], label: 'Ride the escalator up', travel: 'Riding the escalator up to Level 1…', sound: 'escalator' }),
};

/* ======================================================================
   3. RECEPTION
   ====================================================================== */
const reception = {
  id: 'reception', name: 'Reception', floor: '1', zone: 1, zoneName: 'Arrival', line: "Reception has gone home. The paperwork hasn't.",
  outro: 'Desk secured. The gates are next.', bounds: [-2.4, 2.4, -0.5, 1.8],
  build(root) {
    const g = group(root);
    shell(g, { x0: -2.6, x1: 2.6, z0: -2.4, z1: 2.2, h: 3.0, floor: F.marble(), wall: F.wall('#e9e4dc'), lights: [[0, -.5, 2.4, .3], [0, 1.2, 2.4, .3]] });
    lightRig(g, { hemi: [0xfff1e0, 0x3a3328, .85], points: [[0, 2.7, -.9, 0xffe8c8, 5, 7], [-1.5, 2.6, .5, 0xffe8c8, 2, 6]], amb: .15 });
    // back wall: wood panelling and sign
    box(g, 4.2, 2.6, .05, F.wood('#7a5638'), 0, 0, -2.36);
    sign(g, 1.6, .3, { text: 'RECEPTION', bg: null, fg: '#f3e6cf', size: .8, glow: true }, 0, 2.1, -2.32);
    sign(g, 1.3, .2, { text: 'Visitors please sign in and wear your badge', bg: null, fg: '#e9dcc4', size: .5 }, 0, 1.75, -2.32);
    // counter
    const front = box(g, 2.6, 1.02, .08, F.wood('#5a3d28'), 0, 0, -0.7);
    box(g, 2.6, 1.0, .5, F.wood('#6b4a30'), 0, 0, -1.0);
    box(g, 2.7, .04, .62, M('#f5f2ec', { r: .3 }), 0, 1.02, -0.95);
    // drawer in the counter front
    const drawer = group(g, -0.55, .7, -0.66);
    box(drawer, .46, .17, .02, F.wood('#4a3220'), 0, 0, 0);
    const handle = box(drawer, .18, .025, .03, F.steel(), 0, .075, .02);
    box(drawer, .42, .02, .4, F.wood('#3a2818'), 0, .005, -.21); box(drawer, .02, .12, .4, F.wood('#3a2818'), -.2, .0, -.21); box(drawer, .02, .12, .4, F.wood('#3a2818'), .2, 0, -.21);
    const drawerZone = zone(drawer, .4, .2, .38, 0, .01, -.2);
    const lockLed = led(g, '#ff3b3b', -0.25, .86, -0.655, .02);
    // visitor log: open book with names and phone numbers
    const log = sheet(g, .38, .27, (c, W, H) => { c.fillStyle = '#fbf8f1'; c.fillRect(0, 0, W, H); c.fillStyle = '#c9c2b4'; c.fillRect(W / 2 - 2, 0, 4, H);
      c.fillStyle = '#1b2a3d'; c.font = `800 26px ${FONT}`; c.fillText('VISITOR LOG', 16, 34); c.font = `500 16px ${FONT}`;
      const rows = [['N. Haddad', '050 418 2231', 'Floor 4'], ['K. Osei', '055 902 1170', 'Floor 2'], ['L. Moreau', '052 663 0094', 'Floor 4'], ['R. Iyer', '050 771 4408', 'Floor 6'], ['T. Brandt', '056 219 8836', 'Floor 4']];
      rows.forEach((rw, i) => { const y = 70 + i * 34; c.fillStyle = '#1e2c40'; c.fillText(rw[0], 16, y); c.fillText(rw[1], 140, y); c.fillText(rw[2], W / 2 + 20, y); c.fillStyle = '#5b6b80'; c.fillText('19:0' + i + '  ✍', W / 2 + 120, y);
        c.fillStyle = '#d8d1c3'; c.fillRect(12, y + 12, W - 24, 1); }); }, -0.55, 1.066, -0.9, -Math.PI / 2 + .12, 0, 1000);
    const pen = cyl(g, .006, .006, .14, M('#1f4e8c', { r: .4 }), -0.28, 1.05, -0.86); pen.rotation.z = Math.PI / 2; pen.rotation.y = .5; pen.position.y = 1.068;
    // badge tray: four slots, one empty
    const tray = group(g, .25, 1.06, -0.92);
    box(tray, .34, .03, .14, M('#2b3038', { r: .6 }), 0, 0, 0);
    for (let i = 0; i < 4; i++) { if (i === 2) { sign(tray, .05, .02, { text: 'EMPTY', bg: '#2b3038', fg: '#ff8080', size: .7 }, -0.12 + i * .08, .035, .072); continue; }
      const c = idCard('visitor', 1); c.position.set(-0.12 + i * .08, .07, 0); c.rotation.x = -.15; tray.add(c); }
    sign(tray, .2, .03, { text: 'VISITOR BADGES  1 · 2 · 3 · 4', bg: '#2b3038', fg: '#fff', size: .6 }, 0, .016, .071);
    // magazines (harmless)
    const mags = group(g, .95, 1.06, -0.9);
    for (let i = 0; i < 3; i++) { const m = box(mags, .21, .012, .28, M(['#c04848', '#3c7bb8', '#e0b440'][i], { r: .5 }), (i - 1) * .01, i * .012, 0, i * .2); }
    // bin (wrong place for the log)
    const bin = cyl(g, .16, .13, .42, M('#5b636e', { r: .5, m: .3 }), -1.55, 0, -0.5);
    sign(g, .2, .06, { text: 'WASTE', bg: '#5b636e', fg: '#fff', size: .7 }, -1.55, .3, -0.335);
    // seating area, plant
    chair(g, 1.8, .9, -Math.PI / 2); chair(g, 1.8, .2, -Math.PI / 2); plant(g, -2.1, -1.8);
    // exit to the gates
    box(g, .06, 2.2, 1.1, M('#1b2a3d', { r: .4 }), 2.58, 0, -0.4);
    const exitSign = sign(g, .9, .22, { text: 'Security gates →', bg: '#1b2a3d', size: .55, glow: true }, 2.55, 2.4, -0.4, -Math.PI / 2);
    return { log, pen, tray, mags, bin, drawer, handle, drawerZone, lockLed, exitSign };
  },
  async run(r) {
    let open = false;
    const openDrawer = async () => { if (open) return; open = true; sfx('drawer'); await tween(350, k => r.drawer.position.z = -0.66 + k * .32); };
    await hunt({ brief: "Reception's gone home, but they've left things lying out. Two of them are a problem. Find them.", find: 'Find the problems',
      risks: [
        { obj: r.log, found: 'The visitor log. Look at how it\'s been left.', hint: 'Check the counter, on the left.', ask: 'Deal with the visitor log',
          move: 'Open the drawer under the counter, then put the visitor log in it', target: r.handle,
          task: async (p) => {
            const offD = loop(() => { for (const q of pointers) if (!q.captured && ((q.pinchStart && at(q, r.handle, .05)) || (q.kind !== 'mouse' && at(q, r.handle, .012, 'tip')))) openDrawer(); });
            r.handle.userData.interactive = true;
            const res = await dragTask({ item: r.log, grabbedBy: p, zones: [
              { obj: r.drawerZone, ok: true, shut: () => !open, onShut: () => { say("The drawer's shut. Open it first.", { wait: false }); tween(300, k => r.drawer.position.x = -0.55 + Math.sin(k * 18) * .01 * (1 - k)); } },
              { obj: r.bin, ok: false, title: "Don't bin it", why: "The log is a record that's still needed. Keep it, but out of sight." }],
              success: async (z, item) => { r.drawer.attach(item); await tween(300, k => { item.position.lerp(_v.set(0, .03, -.2), k); item.rotation.set(-Math.PI / 2, 0, 0); });
                await wait(200); sfx('drawer'); await tween(350, k => r.drawer.position.z = -0.34 - k * .32); r.lockLed.material.color.set('#2fcf84'); sfx('clink'); } });
            offD(); assess(res.first, { title: 'The visitor log', why: 'Visitor details are personal data. Put the log away, out of sight.' });
          },
          lesson: ['Visitor details are personal data', "Keep the log out of sight so the next visitor can't read the last one's."] },
        { obj: r.tray, found: 'The badge tray. Count what\'s in it.', hint: 'Something on the counter is incomplete.', ask: 'Think it through',
          task: async () => { await wait(900); await decide(DECISIONS.badgeIssue); } }],
      decoys: [{ obj: r.pen, say: 'Just a pen. Nothing to worry about.' }, { obj: r.mags, say: 'Old magazines. Nothing personal in there.' }] });
  },
  exit: r => ({ target: r.exitSign, pos: [2.1, -0.4], label: 'Walk to the gates', travel: 'Walking over to the security gates…', sound: 'walk' }),
};

/* ======================================================================
   4. SECURITY GATES
   ====================================================================== */
const gates = {
  id: 'gates', name: 'Security gates', floor: '1', zone: 1, zoneName: 'Arrival', zoneEnd: true, line: 'The line between public and private.',
  outro: 'Ground floor sealed. The lifts are yours.', bounds: [-1.8, 1.8, -0.9, 1.6],
  build(root) {
    const g = group(root);
    shell(g, { x0: -2.2, x1: 2.0, z0: -4.0, z1: 2.0, h: 3.0, floor: F.tiles(), wall: F.wall('#d6dbe1'), lights: [[0, -0.5, 2.4, .25], [0, -2.8, 2.4, .25]] });
    lightRig(g, { hemi: [0xe6f0ff, 0x30343a, .9], points: [[0, 2.7, -1.0, 0xeaf2ff, 5, 8]], amb: .15 });
    const readers = [], flaps = [];
    for (const x of [-0.8, 0, 0.8]) {
      box(g, .18, .98, 1.2, M('#c9ced5', { r: .25, m: .7 }), x, 0, -1.4);
      box(g, .19, .02, 1.21, M('#20252c', { r: .3 }), x, .98, -1.4);
      const rd = box(g, .12, .025, .13, M('#111418', { r: .3 }), x, .985, -0.9);
      sign(rd, .09, .09, { text: '💳', bg: '#111418', size: .7, glow: true }, 0, .0135, 0).rotation.x = -Math.PI / 2;
      rd.userData.led = led(g, '#ff3b3b', x, 1.03, -0.97, .025);
      readers.push(rd);
    }
    for (const x of [-0.4, 0.4]) for (const s of [-1, 1]) {
      const piv = group(g, x + s * .3, .45, -1.4);
      const f = new THREE.Mesh(new THREE.BoxGeometry(.28, .7, .015), M('#bfe3ff', { r: .05, t: .35 })); f.position.set(-s * .14, .2, 0); piv.add(f);
      flaps.push({ piv, s });
    }
    sign(g, 1.4, .25, { text: 'STAFF ONLY BEYOND THIS POINT', bg: '#1b2a3d', size: .45, glow: true }, 0, 2.5, -3.98);
    // lift lobby beyond
    box(g, 4.2, .02, 2, M('#8a919a', { r: .6 }), 0, 0, -3.0);
    // side door on the right wall, left ajar
    const hinge = group(g, 1.96, 0, -0.3);
    const slab = box(hinge, .05, 2.1, .9, M('#7d8995', { r: .4, m: .5 }), 0, 0, -.45);
    sign(hinge, .4, .12, { text: 'KEEP SHUT', bg: '#b3261e', size: .6 }, -0.03, 1.5, -.45, -Math.PI / 2);
    box(hinge, .04, .03, .14, F.steel(), -0.04, 1.0, -.8);
    hinge.rotation.y = 1.0;
    box(g, .02, 2.1, .9, M('#05070a'), 1.995, 0, -0.75); // the dark gap behind
    sign(g, .5, .12, { text: 'EMERGENCY EXIT', bg: '#137a3f', size: .55, glow: true }, 1.97, 2.3, -0.75, -Math.PI / 2);
    plant(g, -1.8, .8);
    return { readers, flaps, hinge, slab };
  },
  async run(r) {
    await hunt({ brief: "Camera three, by the gates. Something here isn't right. Find it.", find: 'Find the problem',
      risks: [{ obj: r.slab, found: 'The side door. Take a look at it.', hint: 'Look to the right of the gates.', ask: 'Deal with the side door', move: 'Push the door shut with your hand',
        task: async () => {
          await new Promise(res => loop((n, dt, off) => {
            for (const p of pointers) {
              if (p.kind === 'mouse') { if (p.pinching && p.hit && at(p, r.slab)) { if (!p._d0) p._d0 = p.hit.point.clone(); else if (p.hit.point.distanceTo(p._d0) > 0.1) { p._d0 = null; off(); res(); return; } } else if (!p.pinching) p._d0 = null; continue; }
              const b = boxOf(r.slab).expandByScalar(0.06);
              if ((b.containsPoint(p.palm) || b.containsPoint(p.tip)) && p.vel.length() > 0.2) { off(); res(); return; }
            }
          }));
          const a0 = r.hinge.rotation.y; await tween(450, k => r.hinge.rotation.y = a0 * (1 - k)); sfx('thud'); addScore(100);
        }, lesson: ['Doors stay shut', 'A door left open gets round the card readers. Close it, then report it.'] }] });
    await hunt({ brief: "Door's shut. Now get yourself through.", find: 'Find your way through',
      risks: [{ obj: r.readers[1], alt: [r.readers[0], r.readers[2]], hint: "The gates won't open on their own. Look at the posts.", ask: 'Get through the gates',
        move: 'Take the card on your chest and hold it to a reader', target: r.readers[1],
        task: async () => {
          const rd = await tapReader(r.readers, { onBare: () => say('The reader wants a card.', { wait: false }) });
          rd.userData.led.material.color.set('#2fcf84');
          await tween(500, k => r.flaps.forEach(f => f.piv.rotation.y = f.s * k * 1.45));
        }, lesson: ['One tap, one person', 'Never let anyone follow you through on your card.'] }] });
  },
  exit: r => ({ target: r.readers[1], pos: [0.4, -2.2], label: 'Head for the lifts', travel: 'Through the gates, over to the lifts…', sound: 'walk' }),
};

/* ======================================================================
   5. LIFT LOBBY
   ====================================================================== */
function liftDoor(parent, x, z, open = 0) {
  const g = group(parent, x, 0, z);
  const fr = M('#9aa3ad', { r: .3, m: .7 });
  box(g, .1, 2.2, .14, fr, -.6, 0, .02); box(g, .1, 2.2, .14, fr, .6, 0, .02); box(g, 1.3, .25, .14, fr, 0, 2.2, .02);
  // car interior
  const inner = group(g, 0, 0, -0.75);
  box(inner, 1.1, .02, 1.3, F.wood('#6b4a30'), 0, 0, 0); box(inner, 1.1, 2.2, .02, F.steel(), 0, 0, -.65);
  box(inner, .02, 2.2, 1.3, F.steel(), -.55, 0, 0); box(inner, .02, 2.2, 1.3, F.steel(), .55, 0, 0);
  box(inner, 1.0, .02, 1.2, M('#ffffff', { e: '#fff6e8', ei: 1.1 }), 0, 2.18, 0);
  const lp = new THREE.PointLight(0xfff0dd, 1.5, 3); lp.position.set(0, 2, -.2); inner.add(lp);
  const L = box(g, .5, 2.1, .04, M('#c3c9d0', { r: .25, m: .9 }), -.25, 0, .1), R = box(g, .5, 2.1, .04, M('#c3c9d0', { r: .25, m: .9 }), .25, 0, .1);
  const set = p => { L.position.x = -.25 - p * .5; R.position.x = .25 + p * .5; };
  set(open);
  sign(g, .32, .12, { text: '4 ▲', bg: '#111418', fg: '#ff9a3c', size: .7, glow: true }, 0, 2.3, .1);
  return { g, set, L, R, inner };
}
const lifts = {
  id: 'lifts', name: 'Lift lobby', floor: '1', zone: 2, zoneName: 'Access', line: 'One lift is still open.',
  outro: "That's our missing badge. I'm on my way up to escort them out. Nice work. Ride up to Floor 4.", bounds: [-1.8, 1.8, -1.3, 1.5],
  build(root) {
    const g = group(root);
    shell(g, { x0: -2.2, x1: 2.2, z0: -1.75, z1: 2.0, h: 2.9, floor: F.marble(), wall: F.wall('#d9d4cb'), lights: [[0, -.4, 2.2, .3]], skipWalls: ['back'] });
    const bwm = F.wall('#d9d4cb');
    for (const [x0, x1] of [[-2.2, -1.3], [-0.2, 0.2], [1.3, 2.2]]) box(g, x1 - x0, 2.9, .1, bwm, (x0 + x1) / 2, 0, -1.8);
    box(g, 4.4, .55, .1, bwm, 0, 2.35, -1.8);
    lightRig(g, { hemi: [0xfff3e2, 0x3a3328, .85], points: [[0, 2.6, -.5, 0xfff1dc, 4, 7]], amb: .15 });
    const A = liftDoor(g, -0.75, -1.68, 0), B = liftDoor(g, 0.75, -1.68, 1);
    box(g, .1, .2, .03, F.steel(), 0, 1.0, -1.6); led(g, '#7be9ff', 0, 1.12, -1.57, .03); led(g, '#7be9ff', 0, 1.05, -1.57, .03);
    const visitor = person(B.inner, { shirt: '#c8b28a', trousers: '#3b3b3b', skin: '#e0b896', hair: '#8a6a40', badge: 'visitor' }, 0, -0.1, 0);
    const gap = zone(g, 1.1, 1.5, .55, 0.75, 0.55, -1.42);
    plant(g, -1.9, -1.3); plant(g, 1.9, -1.3);
    return { A, B, visitor, gap };
  },
  async run(r) {
    say("Camera six: someone just stepped into that lift wearing a visitor badge, heading for Floor 4. No escort. The doors are closing. Stop them!", { wait: false });
    const bub = bubbleOn(r.visitor, 'Floor 4, please. I know my way.', 1.98);
    objective('Stop the lift!');
    const CLOSE = 9000, HOLD = 550; let t = 0, hold = 0;
    const ring = new Ring(.08); r.B.g.add(ring); ring.position.set(0, 1.3, .3); ring.visible = false;
    const pop = pushHint(() => { objective('✋ Put your hand in the doorway to stop the doors'); const gl = glow(r.gap); setTimeout(() => gl.remove(), 5000); });
    const ok = await new Promise(res => loop((now, dt, off) => {
      t += dt; const p = clamp(t / CLOSE, 0, 1); r.B.set(1 - (p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2));
      let inGap = false; const gb = boxOf(r.gap);
      for (const q of pointers) { if (q.kind === 'mouse') { if (q.pinching && at(q, r.B.g)) inGap = true; } else if (gb.containsPoint(q.palm) || gb.containsPoint(q.tip)) inGap = true; }
      hold = inGap ? hold + dt : Math.max(0, hold - dt * 1.5); ring.visible = hold > 0; ring.set(hold / HOLD);
      if (hold >= HOLD) { off(); res(true); } else if (p >= 1) { off(); res(false); }
    }));
    pop(); ring.dispose();
    if (ok) { sfx('thud'); addScore(100); } else { sfx('bad'); say("Missed them. I've reopened the doors from here.", { wait: false }); await wait(500); }
    const cur = r.B.L.position.x; const o0 = (-cur - .25) / .5;
    await tween(500, k => r.B.set(o0 + (1 - o0) * k));
    bub.say("Oh. Er… I'm meeting someone up there?"); speak("Oh. Er… I'm meeting someone up there?", 'narrator');
    await wait(1200);
    await decide(DECISIONS.liftVisitor);
    bub.say("Fine. I'll wait at reception."); lesson(['Visitors are escorted', 'A visitor badge never means free access. Walk them back to reception or call their host.']);
    await wait(1500);
    await walkTo(r.visitor, 0, .9, 1400); r.visitor.visible = false;
    await tween(600, k => r.B.set(1 - k));
  },
  exit: r => { r.A.set(0); tween(900, k => r.A.set(k)); return { target: r.A.g, pos: [-0.75, -1.5], label: 'Ride up to Floor 4', travel: 'Going up to Floor 4…', sound: 'lift' }; },
};

/* ======================================================================
   6. FLOOR 4 ENTRANCE
   ====================================================================== */
const entrance = {
  id: 'entrance', name: 'Floor 4 entrance', floor: '4', zone: 2, zoneName: 'Access', zoneEnd: true, line: 'Your office is through these doors.',
  outro: 'Floor 4 is covered. Your desk is straight ahead.', bounds: [-1.6, 1.6, -1.0, 1.6],
  build(root) {
    const g = group(root);
    shell(g, { x0: -2.0, x1: 2.0, z0: -5.0, z1: 2.0, h: 2.8, floor: F.carpet(), wall: F.wall('#e6e8eb'), lights: [[0, -.2, 2, .3], [0, -3.2, 2, .3]] });
    lightRig(g, { hemi: [0xeef4ff, 0x30343a, .8], points: [[0, 2.5, -.3, 0xf3f6ff, 4, 7], [0, 2.5, -3.5, 0xf3f6ff, 3, 6]], amb: .12 });
    // glass partition with double doors
    box(g, 1.1, 2.8, .1, F.wall('#cfd5dc'), -1.45, 0, -1.3); box(g, 1.1, 2.8, .1, F.wall('#cfd5dc'), 1.45, 0, -1.3);
    box(g, 1.8, .6, .1, F.wall('#cfd5dc'), 0, 2.2, -1.3);
    const dl = box(g, .88, 2.18, .03, GLASS(), -0.45, 0, -1.3), dr = box(g, .88, 2.18, .03, GLASS(), 0.45, 0, -1.3);
    sign(g, .8, .08, { text: 'FLOOR 4 · STAFF ONLY', bg: 'rgba(255,255,255,.75)', fg: '#1b2a3d', size: .6 }, -0.45, 1.2, -1.28);
    for (const x of [-0.06, .06]) box(g, .02, .5, .03, F.steel(), x, .85, -1.26);
    const reader = box(g, .09, .13, .03, M('#111418', { r: .3 }), 1.1, 1.1, -1.235);
    sign(reader, .06, .06, { text: '💳', bg: '#111418', size: .7, glow: true }, 0, .015, .0165);
    const rled = led(g, '#ff3b3b', 1.1, 1.22, -1.21, .025);
    const tray = box(g, .2, .02, .12, F.steel(), 1.1, .95, -1.18);
    sign(g, .2, .04, { text: 'SECURITY DROP', bg: '#1b2a3d', size: .6 }, 1.1, .92, -1.12);
    // the office beyond
    deskUnit(g, -1.0, -3.0); deskUnit(g, 1.0, -3.0); deskUnit(g, -1.0, -4.3); deskUnit(g, 1.0, -4.3);
    nightWindow(g, 3.8, 2, 0, 1.4, -4.98);
    // lift doors on the left wall and the two people talking
    const ld = group(g, -1.98, 0, -0.1, Math.PI / 2); box(ld, 1.1, 2.1, .04, M('#c3c9d0', { r: .25, m: .9 }), 0, 0, 0);
    const pA = person(g, { shirt: '#2f5d50', skin: '#8d5a3b', hair: '#111' }, -1.25, 0.25, 0), pB = person(g, { shirt: '#5a4a8a', skin: '#d8ae8c', hair: '#5b3a1e' }, -1.4, -0.55, 0);
    pA.rotation.y = Math.atan2(-1.4 + 1.25, -0.55 - .25); pB.rotation.y = Math.atan2(-1.25 + 1.4, .25 + .55);
    const pair = new THREE.Group(); g.add(pair);
    const pairZone = zone(g, .7, 1.8, 1.3, -1.32, 0, -0.15);
    // volume meter next to them
    const meter = group(g, -0.62, 1.5, -0.15); meter.visible = false; const bars = [];
    for (let i = 0; i < 8; i++) { const b = box(meter, .05, .025, .02, M(i > 5 ? '#ff5a5a' : i > 3 ? '#ffc857' : '#2fcf84', { e: i > 5 ? '#ff2020' : i > 3 ? '#ffb000' : '#20c060', ei: .8 }), 0, i * .035, 0); bars.push(b); }
    return { dl, dr, reader, rled, tray, pA, pB, pairZone, meter, bars };
  },
  async run(r) {
    setBadge('lost');
    await hunt({ brief: 'Floor 4. Your desk is through those doors.', find: 'Find your way in',
      risks: [{ obj: r.reader, alt: [r.dl, r.dr], hint: 'The doors are locked. Look beside them.', ask: 'Get in',
        task: async () => {
          sfx('bad'); showCard('Your ID card is gone', 'It was on you at the gates. It must have dropped somewhere.', { color: C.bad });
          await say(LINES.lostGone);
          await decide(DECISIONS.lostCard);
          await say(LINES.lostBlocked);
          const tc = idCard('temp', 1.25); tc.position.set(1.1, .975, -1.18); tc.rotation.set(-Math.PI / 2, 0, .3); r.dl.parent.add(tc); sfx('clink');
          r.tempCard = tc; const gl = glow(tc); objective('Take the temporary card');
          await waitPinch(tc, { r: .05 }); gl.remove(); tc.removeFromParent(); setBadge('temp'); sfx('pickup');
          objective('Tap it on the reader');
          await tapReader(r.reader);
          r.rled.material.color.set('#2fcf84');
          await tween(700, k => { r.dl.position.x = -0.45 - k * .8; r.dr.position.x = 0.45 + k * .8; });
        }, lesson: ['Report lost cards fast', 'A blocked card is useless to whoever finds it.'] }] });
    // the loud conversation
    const bub = bubbleOn(r.pA, '…so her booking reference is EK-4471, passport ending 3302…', 2.05);
    r.pA.userData.talk = true; r.pB.userData.talk = true; r.meter.visible = true;
    let v = 1; const setV = x => { v = clamp(x, 0, 1); r.bars.forEach((b, i) => b.visible = i < Math.ceil(v * 8)); };
    const flick = loop(n => { if (v > .15) r.bars.forEach((b, i) => b.visible = i < Math.ceil(v * 8) - (Math.sin(n / 90 + i) > .7 ? 1 : 0)); });
    await hunt({ brief: "Floor 4 is meant to be quiet tonight. Something here isn't.", find: 'Find the problem',
      risks: [{ obj: r.pairZone, alt: [r.pA, r.pB], found: "Hear that? Listen to what they're saying.", hint: 'Listen. Over by the lift.', ask: 'Bring it down', touch: true,
        move: 'Hold up your open hand and lower it slowly to bring the volume down', target: r.meter,
        task: async () => {
          let lastDir = null;
          await new Promise(res => loop((n, dt, off) => {
            for (const p of pointers) {
              if (p.kind === 'mouse') { if (p.pinching) { const y = p.ray.direction.y; if (lastDir != null && y < lastDir) setV(v - (lastDir - y) * 3); lastDir = y; } else lastDir = null; continue; }
              if ((p.pose === 'open') && p.vel.y < -0.05) setV(v - (-p.vel.y * dt / 1000) / 0.35);
            }
            if (v <= .1) { off(); res(); }
          }));
          flick(); setV(0); sfx('good'); addScore(100);
          r.pA.userData.talk = r.pB.userData.talk = false;
          bub.say("Oh! Sorry. We'll take it to a meeting room."); speak("Oh! Sorry. We'll take it to a meeting room.", 'narrator');
          await wait(2200); r.meter.visible = false; bub.visible = false;
          walkTo(r.pA, -1.0, -3.5, 2500).then(() => r.pA.visible = false); walkTo(r.pB, -0.8, -3.8, 2700).then(() => r.pB.visible = false);
        }, lesson: ['Need to know, not nice to know', 'Discuss customer details in private, with the people who need them.'] }] });
  },
  exit: r => ({ target: r.dl, pos: [0, -1.9], label: 'Walk to your desk', travel: 'Across the office to your desk…', sound: 'walk' }),
};

/* ======================================================================
   7. YOUR DESK
   ====================================================================== */
function screenSheet(c, W, H, locked) {
  if (locked) { const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#0b3a6b'); g.addColorStop(1, '#061a33'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.fillStyle = '#fff'; c.font = `300 ${H * .2}px ${FONT}`; c.textAlign = 'center'; c.fillText('19:48', W / 2, H * .42); c.font = `500 ${H * .07}px ${FONT}`; c.fillText('🔒 Locked', W / 2, H * .6); c.textAlign = 'left'; return; }
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, H); c.fillStyle = '#1f6f43'; c.fillRect(0, 0, W, H * .1);
  c.fillStyle = '#fff'; c.font = `700 ${H * .055}px ${FONT}`; c.fillText('Customer_Bookings_Q4.xlsx  —  CONFIDENTIAL', 12, H * .07);
  const cols = ['Name', 'Passport', 'Phone', 'Booking'], rows = [['A. Farouk', 'P4471209', '050 113 2287', 'EK-2210'], ['M. Silva', 'X8820331', '055 640 1192', 'EK-4471'], ['J. Okafor', 'B1937746', '052 908 5543', 'EK-0937'], ['H. Tanaka', 'TK902114', '056 331 7720', 'EK-3318'], ['S. Novak', 'C7310058', '050 772 0091', 'EK-1186'], ['D. Mensah', 'G2290417', '058 114 6605', 'EK-5520']];
  c.font = `600 ${H * .05}px ${FONT}`; c.fillStyle = '#e8f0ea'; c.fillRect(0, H * .1, W, H * .09); c.fillStyle = '#1b2a3d'; cols.forEach((t, i) => c.fillText(t, 12 + i * W / 4, H * .17));
  c.font = `500 ${H * .048}px ${FONT}`; rows.forEach((rw, j) => { const y = H * (.27 + j * .11); rw.forEach((t, i) => c.fillText(t, 12 + i * W / 4, y)); c.fillStyle = '#dde3ea'; c.fillRect(0, y + H * .03, W, 1); c.fillStyle = '#1b2a3d'; });
}
const desk = {
  id: 'desk', name: 'Your desk', floor: '4', zone: 3, zoneName: 'Workspace', line: "Exactly as you left it. That's the problem.",
  outro: "Desk's clean. The meeting room's next.", bounds: [-1.7, 1.8, -0.35, 1.6],
  build(root) {
    const g = group(root);
    shell(g, { x0: -2.0, x1: 2.2, z0: -2.6, z1: 2.2, h: 2.8, floor: F.carpet(), wall: F.wall('#e6e8eb'), lights: [[0, -.8, 1.6, .3], [0, 1.0, 1.6, .3]] });
    lightRig(g, { hemi: [0xeef4ff, 0x30343a, .7], points: [[0, 2.5, -.6, 0xf3f6ff, 4, 6], [.4, 1.4, -.6, 0xffe6c0, 1.2, 2.5]], amb: .12 });
    nightWindow(g, 4.0, 1.9, 0.1, 1.45, -2.58);
    const d = deskUnit(g, 0, -0.75);
    box(g, .5, .02, .3, M('#2b3038', { r: .5 }), 0.25, .755, -0.58); // desk mat
    // laptop
    const lap = group(g, -0.3, .755, -0.68, .15);
    box(lap, .34, .018, .23, M('#9aa0a8', { r: .35, m: .7 }), 0, 0, 0);
    const kb = sign(lap, .3, .12, { draw: (c, W, H) => { c.fillStyle = '#2b2f35'; c.fillRect(0, 0, W, H); c.fillStyle = '#4a5058'; for (let y = 6; y < H - 6; y += 22) for (let x = 6; x < W - 6; x += 22) c.fillRect(x, y, 18, 18); } }, 0, .019, .03); kb.rotation.x = -Math.PI / 2;
    const lid = group(lap, 0, .018, -.112); lid.rotation.x = -0.25;
    box(lid, .34, .225, .012, M('#9aa0a8', { r: .35, m: .7 }), 0, 0, 0);
    const scr = sign(lid, .31, .195, { draw: (c, W, H) => screenSheet(c, W, H, false), glow: true, res: 1600 }, 0, .1125, .0065);
    // monitor and sticky note
    const mon = group(g, 0.3, .755, -0.98);
    box(mon, .2, .015, .16, M('#222', { r: .4 }), 0, 0, 0); box(mon, .04, .3, .03, M('#222', { r: .4 }), 0, 0, -.02);
    const monBody = box(mon, .62, .37, .03, M('#16181b', { r: .4 }), 0, .26, 0);
    sign(mon, .58, .33, { glow: true, res: 1400, draw: (c, W, H) => { c.fillStyle = '#f3f5f8'; c.fillRect(0, 0, W, H); c.fillStyle = '#0f6cbd'; c.fillRect(0, 0, W, H * .1); c.fillStyle = '#fff'; c.font = `600 ${H * .06}px ${FONT}`; c.fillText('Inbox (14)', 12, H * .07);
      for (let i = 0; i < 7; i++) { c.fillStyle = i === 1 ? '#dbe9f8' : '#fff'; c.fillRect(8, H * (.14 + i * .12), W - 16, H * .1); c.fillStyle = '#1b2a3d'; c.font = `600 ${H * .045}px ${FONT}`; c.fillText(['Payroll run – Nov', 'RE: Customer complaint #4471', 'Team lunch Thursday', 'Q3 restructure (confidential)', 'IT: password expiry', 'Booking changes', 'Weekly report'][i], 20, H * (.2 + i * .12)); } } }, 0, .445, .017);
    const note = new THREE.Group(); note.position.set(0.56, 1.06, -0.96); g.add(note);
    const nf = sign(note, .075, .075, { draw: (c, W, H) => { c.fillStyle = '#ffe66b'; c.fillRect(0, 0, W, H); c.fillStyle = '#7a6410'; c.font = `700 ${H * .16}px ${FONT}`; c.fillText('IMPORTANT', 6, H * .28); c.font = `500 ${H * .13}px ${FONT}`; c.fillText('see back ↻', 6, H * .55); } }, 0, 0, .001);
    const nb = sign(note, .075, .075, { draw: (c, W, H) => { c.fillStyle = '#ffe66b'; c.fillRect(0, 0, W, H); c.fillStyle = '#1b2a3d'; c.font = `700 ${H * .17}px ${FONT}`; c.fillText('pw:', 8, H * .28); c.fillText('Summer2026!', 6, H * .52); c.font = `500 ${H * .12}px ${FONT}`; c.fillText("(don't forget!)", 6, H * .78); } }, 0, 0, -.001, Math.PI);
    // coffee
    const mug = group(g, 0.62, .755, -0.55); cyl(mug, .04, .036, .1, M('#f2f2f2', { r: .3 }), 0, 0, 0); cyl(mug, .036, .036, .005, M('#3a2416', { r: .2 }), 0, .09, 0);
    const handleM = new THREE.Mesh(new THREE.TorusGeometry(.025, .007, 6, 12), M('#f2f2f2', { r: .3 })); handleM.position.set(.045, .05, 0); handleM.rotation.y = Math.PI / 2; mug.add(handleM);
    // desk phone
    const ph = group(g, -0.62, .755, -0.5, .2);
    box(ph, .2, .05, .18, M('#2b2f35', { r: .4 }), 0, 0, 0);
    const handset = new THREE.Mesh(new THREE.CapsuleGeometry(.022, .16, 4, 8), M('#1e2126', { r: .4 })); handset.rotation.z = Math.PI / 2; handset.position.set(0, .075, -.045); ph.add(handset);
    for (let i = 0; i < 9; i++) box(ph, .025, .006, .02, M('#555', { r: .5 }), -.04 + (i % 3) * .035, .05, .01 + Math.floor(i / 3) * .03);
    const phLed = led(ph, '#ff3b3b', .08, .06, .06, .02); phLed.visible = false;
    // pedestal drawer (a wrong place for the note)
    const ped = group(g, 0.45, 0, -0.75); box(ped, .42, .55, .55, M('#c7ccd2', { r: .5, m: .3 }), 0, 0, 0);
    const pd = box(ped, .4, .14, .3, M('#b6bcc3', { r: .5, m: .3 }), 0, .56 - .16, .3); box(ped, .14, .02, .03, F.steel(), 0, .5, .46);
    const pedZone = zone(ped, .38, .14, .3, 0, .4, .3);
    // confidential waste console
    const cw = group(g, 1.05, 0, -0.45, -0.5);
    box(cw, .46, .85, .4, M('#4a5563', { r: .5, m: .3 }), 0, 0, 0); box(cw, .3, .015, .04, M('#111', { r: .3 }), 0, .85, .05);
    sign(cw, .4, .1, { text: 'CONFIDENTIAL WASTE', bg: '#4a5563', size: .4 }, 0, .7, .201); sign(cw, .14, .14, { text: '🔒', bg: '#4a5563', size: .7 }, 0, .5, .201);
    const cwZone = zone(cw, .46, .3, .4, 0, .78, 0);
    chair(g, 0.0, 0.6, 0); chair(g, 1.6, 1.0, -2.2);
    deskUnit(g, -1.4, 1.2, Math.PI / 2); deskUnit(g, 1.4, -1.9);
    // meeting room door on the left
    box(g, .06, 2.2, 1.0, GLASS(), -1.97, 0, 0.6); sign(g, .6, .15, { text: 'Meeting room 4.12', bg: '#1b2a3d', size: .5, glow: true }, -1.95, 2.35, 0.6, Math.PI / 2);
    return { lap, lid, scr, mon, monBody, note, nf, nb, mug, ph, handset, phLed, pedZone, cw, cwZone };
  },
  async run(r) {
    await hunt({ brief: "Your desk, exactly as you left it at five. Something here is giving away more than it should. Two things, actually.", find: 'Find the problems',
      risks: [
        { obj: r.lap, found: 'Your laptop. Look at the screen.', hint: 'Something on your desk is still on.', ask: 'Deal with the laptop', move: 'Close your hand into a fist over the laptop to lock it', target: r.lap,
          task: async () => {
            await holdGesture({ target: r.lap, pose: 'fist', ms: 700, r: .25 });
            const c = r.scr.userData.ctx, cv = r.scr.userData.canvas; screenSheet(c, cv.width, cv.height, true); r.scr.userData.tex.needsUpdate = true; sfx('chime'); addScore(100);
          }, lesson: ['Lock it when you leave it', 'Windows + L, or Ctrl + Cmd + Q on a Mac, every time you step away.'] },
        { obj: r.note, found: 'A sticky note on your monitor. What\'s on the back?', hint: 'Something is stuck to your monitor.', ask: 'Deal with the sticky note',
          move: 'Peel the sticky note off and put it in the confidential waste', target: r.note,
          task: async (p) => {
            let told = false;
            const res = await dragTask({ item: r.note, grabbedBy: p, showBack: true, onGrab: () => { if (!told) { told = true; say(LINES.stickyBack, { wait: false }); } },
              zones: [{ obj: r.cwZone, ok: true },
                { obj: r.pedZone, ok: false, title: 'Not in a drawer', why: 'A written password is still readable in a drawer. Destroy it, then change the password.' },
                { obj: r.monBody, ok: false, title: 'Not on the monitor', why: 'Anyone walking past can read it there.' }],
              success: async (z, item) => { sfx('crumple'); await tween(350, k => { item.scale.setScalar(1 - k); item.position.y -= .002; }); item.removeFromParent(); } });
            assess(res.first, { title: 'The password on a sticky note', why: 'Destroy written passwords and change them. Use a password manager instead.' });
          }, lesson: ['Passwords never go on paper', 'Use a password manager or a passphrase you can remember, and change any password that was written down.'] }],
      decoys: [{ obj: r.mug, say: "Just coffee. It's gone cold." }] });
    // the phone
    say('Your desk phone is ringing.', { wait: false });
    const stop = ringtone(); track(stop); r.phLed.visible = true;
    const jig = loop(n => { r.handset.position.y = .075 + Math.abs(Math.sin(n / 40)) * .004; r.phLed.visible = Math.sin(n / 150) > 0; });
    objective('Your phone is ringing');
    const pop = pushHint(() => { const gl = glow(r.handset); setTimeout(() => gl.remove(), 5000); objective('Pick up the handset'); });
    await waitPinch(r.handset, { r: .05 });
    pop(); stop(); jig(); r.phLed.visible = true; sfx('pickup');
    await tween(300, k => r.handset.position.y = .075 + k * .12);
    await decide(DECISIONS.phoneCall);
    await tween(300, k => r.handset.position.y = .195 - k * .12); sfx('drop'); r.phLed.visible = false;
    showCard('Call ended', 'Reported to IT through the official channel.', { color: C.good, ms: 3500 });
    lesson(['Real IT never asks for your password', 'Urgency is a red flag. Hang up and report the call.']);
    await wait(1200);
  },
  exit: r => ({ target: null, pos: [-1.55, 0.6, 2.3], label: 'Check the meeting room', travel: 'Into meeting room 4.12…', sound: 'walk' }),
};

/* ======================================================================
   8. MEETING ROOM
   ====================================================================== */
const meeting = {
  id: 'meeting', name: 'Meeting room', floor: '4', zone: 3, zoneName: 'Workspace', zoneEnd: true, line: 'Half the meeting is still on the table.',
  outro: "Room's clear. The print station is the last zone.", bounds: [-1.6, 0.9, -0.3, 1.4],
  build(root) {
    const g = group(root);
    shell(g, { x0: -1.9, x1: 1.25, z0: -2.2, z1: 1.8, h: 2.7, floor: F.carpet(), wall: F.wall('#eceae6'), lights: [[-0.3, -0.8, 1.4, .3], [-0.3, .8, 1.4, .3]] });
    lightRig(g, { hemi: [0xeef4ff, 0x30343a, .75], points: [[-0.3, 2.4, -.6, 0xf3f6ff, 4, 6]], amb: .12 });
    nightWindow(g, 2.9, 1.8, -0.3, 1.45, -2.18);
    // table and chairs
    const tbl = group(g, -0.35, 0, -1.05); box(tbl, 1.5, .04, .85, F.wood('#5b3d28'), 0, .72, 0); box(tbl, .1, .72, .5, F.steel(), 0, 0, 0);
    for (const [x, z, ry] of [[-0.5, -.7, 0], [.3, -.7, 0], [-0.5, .7, Math.PI], [.3, .7, Math.PI]]) chair(tbl, x, z, ry);
    // whiteboard on the right wall
    const bw = 1.2, bh = 1.0;
    const boardFrame = box(g, .03, bh + .06, bw + .06, M('#aab2bb', { r: .3, m: .7 }), 1.235, .9 - .03, -0.95);
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = Math.round(1024 * bh / bw); const bc = cv.getContext('2d');
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), new THREE.MeshStandardMaterial({ map: tex, roughness: .25 }));
    board.position.set(1.215, .9 + bh / 2, -0.95); board.rotation.y = -Math.PI / 2; g.add(board);
    // ink on its own layer so erasing reveals the white board
    const ink = document.createElement('canvas'); ink.width = cv.width; ink.height = cv.height; const ic = ink.getContext('2d');
    ic.strokeStyle = '#1d3f8f'; ic.fillStyle = '#1d3f8f'; ic.lineWidth = 6; ic.font = `600 54px "Comic Sans MS", "Segoe Print", ${FONT}`;
    ic.fillText('Q3 RESTRUCTURE — CONFIDENTIAL', 40, 90); ic.beginPath(); ic.moveTo(40, 110); ic.lineTo(900, 110); ic.stroke();
    ic.font = `500 46px "Comic Sans MS", "Segoe Print", ${FONT}`;
    ['• N. Varga – redundancy, 2 Mar', '• P. Castillo – salary 38k → 31k', '• L. Brennan – on sick leave (back)', '• Customer: M. Silva  055 640 1192', '  wants refund, angry!!'].forEach((t, i) => { ic.fillStyle = i === 3 ? '#b3261e' : '#1d3f8f'; ic.fillText(t, 50, 190 + i * 78); });
    ic.strokeStyle = '#b3261e'; ic.beginPath(); ic.arc(860, 480, 70, 0, 7); ic.stroke();
    const paintBoard = () => { bc.fillStyle = '#fbfcfd'; bc.fillRect(0, 0, cv.width, cv.height); bc.drawImage(ink, 0, 0); tex.needsUpdate = true; };
    paintBoard();
    // which cells have ink, to measure how clean it is
    const GX = 64, GY = Math.round(64 * cv.height / cv.width), cell = [], data = ic.getImageData(0, 0, ink.width, ink.height).data;
    for (let y = 0; y < GY; y++) for (let x = 0; x < GX; x++) { let n = 0; const x0 = Math.floor(x * ink.width / GX), y0 = Math.floor(y * ink.height / GY), x1 = Math.floor((x + 1) * ink.width / GX), y1 = Math.floor((y + 1) * ink.height / GY);
      for (let yy = y0; yy < y1; yy += 2) for (let xx = x0; xx < x1; xx += 2) if (data[(yy * ink.width + xx) * 4 + 3] > 40) n++; if (n > 2) cell.push([x, y]); }
    // binders on the table
    const binders = new THREE.Group(); binders.position.set(-0.05, .76, -0.85); g.add(binders);
    for (let i = 0; i < 3; i++) { const b = box(binders, .05, .29, .23, M('#2a4d7a', { r: .5 }), (i - 1) * .055, 0, 0);
      sign(binders, .045, .26, { draw: (c, W, H) => { c.fillStyle = '#2a4d7a'; c.fillRect(0, 0, W, H); c.save(); c.translate(W / 2, H / 2); c.rotate(-Math.PI / 2); c.fillStyle = '#fff'; c.font = `800 ${W * .38}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('FINANCE Q3', 0, -W * .14); c.fillStyle = '#ffb3b3'; c.font = `700 ${W * .26}px ${FONT}`; c.fillText('CONFIDENTIAL', 0, W * .24); c.restore(); }, res: 2000 }, (i - 1) * .055, .145, .1155); }
    const glassW = group(g, -0.6, .76, -0.75); cyl(glassW, .032, .028, .11, M('#cfe8ff', { r: .05, t: .35 }), 0, 0, 0); cyl(glassW, .029, .026, .07, M('#9fd0ff', { r: .05, t: .3 }), 0, 0, 0);
    // lockable cabinet with its top drawer open, shredder, backpack
    const cab = group(g, -1.55, 0, -0.35, Math.PI / 2);
    box(cab, .5, 1.0, .45, M('#c7ccd2', { r: .45, m: .4 }), 0, 0, 0);
    const cdr = group(cab, 0, .82, .2); box(cdr, .46, .14, .02, M('#b6bcc3', { r: .45, m: .4 }), 0, 0, .2); box(cdr, .44, .02, .4, M('#9aa0a8'), 0, 0, 0);
    sign(cab, .3, .07, { text: 'LOCKABLE', bg: '#c7ccd2', fg: '#1b2a3d', size: .6 }, 0, .55, .226);
    const cabZone = zone(cdr, .44, .2, .42, 0, .02, 0); const cabLed = led(cab, '#ff3b3b', .18, .97, .23, .02);
    const shr = group(g, -1.6, 0, -1.55, Math.PI / 2); box(shr, .4, .62, .3, M('#2b3038', { r: .5 }), 0, 0, 0); box(shr, .28, .012, .03, M('#000'), 0, .62, 0);
    sign(shr, .3, .07, { text: 'SHREDDER', bg: '#2b3038', size: .6 }, 0, .45, .151); const shrZone = zone(shr, .4, .25, .3, 0, .6, 0);
    const bag = group(g, 0.6, 0, -0.2); box(bag, .32, .4, .16, M('#3f5f3a', { r: .8 }), 0, 0, 0); box(bag, .24, .16, .05, M('#4d7247', { r: .8 }), 0, .08, .1);
    const bagZone = zone(bag, .34, .45, .2, 0, 0, 0);
    box(g, .06, 2.2, 1.0, GLASS(), -1.87, 0, 1.1); sign(g, .6, .15, { text: 'Print station →', bg: '#1b2a3d', size: .5, glow: true }, -1.85, 2.35, 1.1, Math.PI / 2); sign(bag, .2, .05, { text: 'take home?', bg: null, fg: '#e7f1e4', size: .7 }, 0, .3, .085);
    return { board, bc, ink, ic, cv, tex, paintBoard, cell, GX, GY, bw, bh, binders, glassW, cdr, cabZone, cabLed, shrZone, bagZone };
  },
  async run(r) {
    await hunt({ brief: "The five o'clock meeting left in a hurry. Two things in here shouldn't be seen by the cleaners at nine.", find: 'Find the problems',
      risks: [
        { obj: r.board, found: 'The whiteboard. Read what\'s still on it.', hint: "Whose writing is that on the wall?", ask: 'Deal with the whiteboard', move: 'Rub your hand across the board to wipe it clean',
          task: async () => {
            const cleared = new Set(), total = r.cell.length, W = r.cv.width, H = r.cv.height;
            const prog = new Ring(.07); r.board.add(prog); prog.position.set(.5, .62, .02); prog.visible = false;
            const erase = (lx, ly, rad) => { // local plane coords (m) -> canvas px
              const px = (lx / r.bw + .5) * W, py = (.5 - ly / r.bh) * H, rp = rad / r.bw * W;
              r.ic.save(); r.ic.globalCompositeOperation = 'destination-out'; r.ic.beginPath(); r.ic.arc(px, py, rp, 0, 7); r.ic.fill(); r.ic.restore();
              for (const [cx, cy] of r.cell) { const k = cx + ',' + cy; if (cleared.has(k)) continue; const ccx = (cx + .5) * W / r.GX, ccy = (cy + .5) * H / r.GY; if ((ccx - px) ** 2 + (ccy - py) ** 2 < rp * rp) cleared.add(k); }
              dirty = true;
            };
            let dirty = false; const last = new Map();
            // wipe along the path since the last frame, so fast strokes leave no gaps
            const stroke = (key, x, y, rad) => { const l = last.get(key);
              if (l) { const d = Math.hypot(x - l[0], y - l[1]), n = Math.min(40, Math.ceil(d / (rad * .5))); for (let i = 1; i <= n; i++) erase(l[0] + (x - l[0]) * i / n, l[1] + (y - l[1]) * i / n, rad); }
              else erase(x, y, rad); last.set(key, [x, y]); };
            await new Promise(res => loop((n, dt, off) => {
              for (const p of pointers) {
                if (p.kind === 'mouse') { if (p.pinching && p.hit && p.hit.object === r.board) { r.board.worldToLocal(_v.copy(p.hit.point)); stroke(p, _v.x, _v.y, .07); } else last.delete(p); continue; }
                for (const [pt, rad, lim, k] of [[p.tip, .04, .045, 't'], [p.palm, .075, .07, 'p']]) {
                  r.board.worldToLocal(_v.copy(pt)); const key = p.side + k;
                  if (Math.abs(_v.z) < lim && Math.abs(_v.x) < r.bw / 2 + .03 && Math.abs(_v.y) < r.bh / 2 + .03) stroke(key, _v.x, _v.y, rad); else last.delete(key);
                }
              }
              if (dirty) { dirty = false; r.paintBoard(); const k = cleared.size / total; prog.visible = k > 0; prog.set(k / .9); if (k >= .9) { off(); res(); } }
            }));
            r.ic.clearRect(0, 0, W, H); r.paintBoard(); prog.dispose(); sfx('good'); addScore(100);
          }, lesson: ['Wipe before you leave', "Clear boards after meetings, and don't photograph them on a personal phone."] },
        { obj: r.binders, found: 'Those binders. Read the spines.', hint: 'Read the spines of those binders.', ask: 'Deal with the binders', move: 'Pick up the Finance binders and put them somewhere safe',
          task: async (p) => {
            const res = await dragTask({ item: r.binders, grabbedBy: p, zones: [{ obj: r.cabZone, ok: true },
              { obj: r.shrZone, ok: false, title: "Don't destroy it", why: "It's still needed. Lock it away instead." },
              { obj: r.bagZone, ok: false, title: 'Not home', why: 'Confidential papers stay in the office, locked away.' }],
              success: async (z, item) => { r.cdr.attach(item); await tween(300, k => { item.position.lerp(_v.set(0, .16, 0), k); item.quaternion.slerp(new THREE.Quaternion(), k); });
                sfx('thud'); await tween(350, k => { r.cdr.position.z = .2 - k * .2; item.position.y = .16 - k * .0; }); item.visible = false; r.cabLed.material.color.set('#2fcf84'); sfx('clink'); } });
            assess(res.first, { title: 'The Finance Q3 binders', why: 'Unreleased financials are confidential: lock them away.' });
          }, lesson: ['Confidential means locked away', 'Unreleased financials stay locked up and go only to people who need them.'] }],
      decoys: [{ obj: r.glassW, say: 'Just water. Nothing to protect.' }] });
  },
  exit: r => ({ target: null, pos: [-1.45, 1.1, 2.2], label: 'Go to the print station', travel: 'Down the corridor to the print station…', sound: 'walk' }),
};

/* ======================================================================
   9. PRINT STATION
   ====================================================================== */
function printout(pg) {
  return sign(new THREE.Group(), .21, .297, { res: 1200, draw: (c, W, H) => {
    c.fillStyle = '#fdfdfb'; c.fillRect(0, 0, W, H);
    c.font = `${W * .13}px ${FONT}`; c.fillText(pg.icon, W * .07, H * .13);
    c.fillStyle = '#1b2a3d'; c.font = `800 ${W * .07}px ${FONT}`; wrap(c, pg.title, W * .86).forEach((l, i) => c.fillText(l, W * .07, H * .2 + i * W * .085));
    c.fillStyle = '#5b6b80'; c.font = `500 ${W * .05}px ${FONT}`; c.fillText(pg.sub, W * .07, H * .32);
    lines(c, W * .07, H * .38, W * .86, 14, H * .04);
  } });
}
const printer = {
  id: 'printer', name: 'Print station', floor: '4', zone: 4, zoneName: 'Print room', zoneEnd: true, line: 'The printer is still warm.',
  outro: "Print room's clean. One door left: the server room.", bounds: [-1.5, 1.0, -0.2, 1.4],
  build(root) {
    const g = group(root);
    shell(g, { x0: -1.95, x1: 1.6, z0: -1.6, z1: 1.8, h: 2.7, floor: F.tiles(), wall: F.wall('#e3e6ea'), lights: [[0, -.5, 1.4, .3], [0, 1.0, 1.4, .3]] });
    lightRig(g, { hemi: [0xeef4ff, 0x30343a, .8], points: [[0, 2.4, -.4, 0xf3f6ff, 4, 6]], amb: .13 });
    // printer
    const pr = group(g, 0, 0, -1.0);
    box(pr, .62, .8, .55, M('#e8eaed', { r: .5 }), 0, 0, 0); box(pr, .62, .2, .3, M('#d4d7db', { r: .5 }), 0, .8, -.125);
    box(pr, .4, .02, .3, M('#9aa0a8', { r: .4 }), 0, .8, .14); // output tray
    sign(pr, .14, .07, { glow: true, draw: (c, W, H) => { c.fillStyle = '#0a2a44'; c.fillRect(0, 0, W, H); c.fillStyle = '#7be9ff'; c.font = `600 ${H * .3}px ${FONT}`; c.fillText('4 jobs held', 8, H * .6); } }, .2, .93, .03).rotation.x = -.5;
    for (let i = 0; i < 3; i++) box(pr, .5, .015, .02, M('#9aa0a8'), 0, .2 + i * .2, .276);
    const stack = new THREE.Group(); stack.position.set(0, .825, -0.86); g.add(stack);
    for (let i = 0; i < 4; i++) { const s = sign(stack, .21, .297, { draw: (c, W, H) => { c.fillStyle = '#fdfdfb'; c.fillRect(0, 0, W, H); lines(c, W * .08, H * .1, W * .84, 18, H * .045); } }, 0, i * .004, 0); s.rotation.x = -Math.PI / 2; s.rotation.z = (i - 1.5) * .04; }
    // three places for paper
    const shr = group(g, -0.8, 0, -0.8, .5); box(shr, .42, .7, .32, M('#2b3038', { r: .5 }), 0, 0, 0); box(shr, .3, .012, .03, M('#000'), 0, .7, 0);
    sign(shr, .32, .08, { text: 'SHREDDER', bg: '#2b3038', size: .6 }, 0, .5, .161); const shrZone = zone(shr, .42, .32, .34, 0, .66, 0);
    const cab = group(g, 0.8, 0, -0.85, -.5); box(cab, .5, .8, .45, M('#1f4e8c', { r: .45, m: .3 }), 0, 0, 0); box(cab, .32, .012, .04, M('#000'), 0, .8, .1);
    sign(cab, .44, .1, { text: 'CONFIDENTIAL · LOCKED', bg: '#1f4e8c', size: .45 }, 0, .6, .226); sign(cab, .1, .1, { text: '🔒', bg: '#1f4e8c', size: .7 }, 0, .42, .226);
    const cabZone = zone(cab, .5, .32, .47, 0, .76, 0);
    const rec = group(g, -0.45, 0, -0.25); cyl(rec, .2, .17, .55, M('#2c8a4a', { r: .5 }), 0, 0, 0);
    sign(rec, .2, .08, { text: '♻ RECYCLE', bg: '#2c8a4a', size: .6 }, 0, .4, .195); const recZone = zone(rec, .42, .35, .42, 0, .45, 0);
    // HR cabinet on the right wall with the key left in the lock
    const hr = group(g, 1.35, 0, -0.05, -Math.PI / 2);
    box(hr, .9, 1.35, .45, M('#c7ccd2', { r: .45, m: .4 }), 0, 0, 0);
    for (let i = 0; i < 3; i++) { box(hr, .86, .4, .02, M('#b6bcc3', { r: .45, m: .4 }), 0, .06 + i * .43, .225); box(hr, .2, .025, .03, F.steel(), 0, .38 + i * .43, .24); }
    sign(hr, .5, .09, { text: 'HR · PERSONNEL FILES', bg: '#b3261e', size: .55 }, 0, 1.25, .236);
    const lockPlate = cyl(hr, .025, .025, .01, M('#c9a227', { r: .3, m: .9 }), .3, 1.15, .236); lockPlate.rotation.x = Math.PI / 2; lockPlate.position.set(.3, 1.15, .236);
    const key = new THREE.Group(); key.position.set(.3, 1.15, .25); hr.add(key);
    const brass = M('#d4a72c', { r: .3, m: .9 });
    const shaft = cyl(key, .006, .006, .05, brass, 0, 0, 0); shaft.rotation.x = Math.PI / 2; shaft.position.set(0, 0, .02);
    const bow = new THREE.Mesh(new THREE.TorusGeometry(.022, .007, 8, 20), brass); bow.position.set(0, 0, .065); key.add(bow);
    const tag = sign(key, .05, .03, { text: 'HR', bg: '#ffcf4a', fg: '#111', size: .7 }, 0, -.04, .065);
    const keyHit = new THREE.Mesh(new THREE.BoxGeometry(.06, .07, .09), new THREE.MeshBasicMaterial({ visible: false })); keyHit.position.set(0, -.01, .045); key.add(keyHit);
    const hrLed = led(hr, '#ff3b3b', .3, 1.21, .24, .02);
    // exit door to the server corridor
    box(g, .06, 2.2, 1.0, M('#3d4a57', { r: .5, m: .4 }), -1.92, 0, 0.9); sign(g, .6, .14, { text: 'Server room →', bg: '#1b2a3d', size: .5, glow: true }, -1.9, 2.35, .9, Math.PI / 2);
    return { stack, shrZone, cabZone, recZone, key, hr, hrLed, pr };
  },
  async run(r) {
    await hunt({ brief: "Last zone. The printer's still warm, and this corner has two problems.", find: 'Find the problems',
      risks: [
        { obj: r.stack, found: 'Print jobs nobody collected.', hint: 'The printer tray is full.', ask: 'Sort the printouts', move: 'Put each printout in the shredder, the locked cabinet or the recycling',
          task: async (p) => {
            const kids = r.stack.children.slice(); let firstGrab = p;
            for (const pg of shuffle(PAGES.slice())) {
              const k = kids.pop(); if (k) k.visible = false;
              const sh = printout(pg); const holder = new THREE.Group(); holder.add(sh); sh.rotation.x = -Math.PI / 2 + .15;
              holder.position.set(0, .845 + kids.length * .004, -0.86); r.stack.parent.add(holder); sfx('whoosh'); r.page = { holder, zone: pg.zone };
              objective(`${pg.icon} ${pg.title}: where does it go?`);
              const Z = (id, obj) => ({ obj, ok: pg.zone === id, title: 'Wrong place', why: pg.why });
              const res = await dragTask({ item: holder, grabbedBy: firstGrab, zones: [Z('shred', r.shrZone), Z('cabinet', r.cabZone), Z('recycle', r.recZone)],
                success: async (z, item) => { sfx(pg.zone === 'shred' ? 'shred' : pg.zone === 'cabinet' ? 'thud' : 'drop'); const y0 = item.position.y;
                  await tween(400, k2 => { item.position.y = y0 - k2 * .15; item.scale.setScalar(1 - k2 * .7); }); item.removeFromParent(); } });
              firstGrab = null;
              assess(res.first, { title: pg.title, why: pg.why }); showCard(res.first ? 'Right' : 'Got there', pg.why, { color: res.first ? C.good : C.warn, ms: 3500 });
              await wait(500);
            }
          }, lesson: ['Shred it, lock it or recycle it', 'Personal or confidential and not needed: shred. Still needed: lock it away. Nothing sensitive: recycle.'] },
        { obj: r.key, found: 'The HR cabinet. Look closely.', hint: 'Check the corner of the room.', ask: 'Deal with the cabinet', move: 'Pinch the key and turn your hand like you are locking a door',
          task: async (fp) => {
            const axis = new THREE.Vector3(0, 0, 1).transformDirection(r.hr.matrixWorld); // out of the cabinet front
            let grab = null, q0 = new THREE.Quaternion(), d0 = new THREE.Vector3(), ang = 0;
            if (fp && fp.pinching && !fp.captured && at(fp, r.key, .06)) { grab = fp; fp.captured = r.key; q0.copy(fp.quat); d0.copy(fp.ray.direction); }
            await new Promise(res => loop((n, dt, off) => {
              if (!grab) { for (const p of pointers) if (p.pinchStart && !p.captured && at(p, r.key, .05)) { grab = p; p.captured = r.key; q0.copy(p.quat); d0.copy(p.ray.direction); sfx('pickup'); break; } }
              if (grab) {
                if (!grab.active || !grab.pinching) { grab.captured = null; grab = null; }
                else {
                  let a;
                  if (grab.kind === 'mouse') a = d0.angleTo(grab.ray.direction) * 6;
                  else { const dq = grab.quat.clone().multiply(q0.clone().invert()); const t = dq.x * axis.x + dq.y * axis.y + dq.z * axis.z; a = Math.abs(2 * Math.atan2(t, dq.w)); if (a > Math.PI) a = 2 * Math.PI - a; a *= 1.2; }
                  ang = Math.max(ang, clamp(a, 0, Math.PI / 2));
                }
              } else ang = Math.max(0, ang - dt / 1000 * 0.8);
              r.key.rotation.z = -ang;
              if (ang >= 1.45) { off(); if (grab) grab.captured = null; res(); }
            }));
            r.key.rotation.z = -Math.PI / 2; sfx('clink'); setTimeout(() => sfx('thud'), 130); r.hrLed.material.color.set('#2fcf84'); addScore(100);
            await wait(500); await tween(350, k => r.key.position.z = .25 + k * .06); r.key.visible = false;
            showCard('Key in your pocket', "You'll hand it to Security on the way out.", { color: C.acc, ms: 3000 });
          }, lesson: ['Keys stay with their owner', 'Lock up, and hand a found key to its named holder or to Security.'] }] });
  },
  exit: r => ({ target: null, pos: [-1.5, 0.9, 2.3], label: 'Enter the server room', travel: 'To the server room door…', sound: 'walk' }),
};

/* ======================================================================
   10. SERVER ROOM
   ====================================================================== */
const server = {
  id: 'server', name: 'Server room', floor: '4', zone: 5, zoneName: 'Lockdown', final: true, line: 'Send the all-clear before the doors lock.', amb: 'server',
  bounds: [-0.9, 0.9, -0.4, 1.4],
  build(root) {
    const g = group(root);
    shell(g, { x0: -1.2, x1: 1.2, z0: -4.0, z1: 1.8, h: 2.6, floor: M('#5d636b', { map: TEX.tiles('#5d636b', '#3a3f45', 6, [3, 4]), r: .6 }), wall: F.wall('#9aa3ad'), lights: [[0, .4, .8, .2]] });
    lightRig(g, { hemi: [0x9fc8ff, 0x101418, .55], points: [[0, 2.3, .3, 0xbfd8ff, 2.5, 5], [0, 2.2, -2.5, 0x4aa8ff, 4, 5]], amb: .08 });
    // wall with the door
    box(g, .7, 2.6, .15, F.wall('#8d96a0'), -0.85, 0, -1.2); box(g, .7, 2.6, .15, F.wall('#8d96a0'), 0.85, 0, -1.2); box(g, 1.0, .4, .15, F.wall('#8d96a0'), 0, 2.2, -1.2);
    const door = group(g, 0, 0, -1.2);
    box(door, .98, 2.18, .08, M('#4a5563', { r: .4, m: .6 }), 0, 0, 0);
    const win = box(door, .4, .5, .085, M('#9fd8ff', { r: .05, t: .25 }), 0, 1.3, 0);
    sign(door, .6, .14, { text: 'SERVER ROOM\nAuthorised staff only', bg: '#b3261e', size: .7 }, 0, 1.8, .045);
    // racks behind
    for (const x of [-0.7, 0.7]) for (const z of [-2.2, -3.2]) {
      const rk = group(g, x, 0, z, x < 0 ? Math.PI / 2 : -Math.PI / 2); box(rk, .7, 2.0, .6, M('#15181c', { r: .5 }), 0, 0, 0);
      for (let i = 0; i < 14; i++) { box(rk, .62, .1, .01, M('#22262c', { r: .4 }), 0, .15 + i * .13, .301); led(rk, Math.random() < .7 ? '#38ff8a' : '#4aa8ff', -.25 + Math.random() * .1, .2 + i * .13, .31, .018); }
    }
    const blink = [];
    g.traverse(o => { if (o.isSprite) blink.push(o); });
    g.userData.off = onFrame(n => { blink.forEach((s, i) => s.visible = Math.sin(n / (90 + (i % 7) * 23) + i) > -0.6); });
    // keypad (a panel you can poke)
    const pad = new Panel(0.2, 0.29, { res: 3000 });
    pad.position.set(0.78, 1.3, -1.12); g.add(pad);
    box(g, .23, .32, .02, M('#22262c', { r: .4 }), 0.78, 1.3 - .16, -1.135);
    return { door, pad };
  },
  async run(r) {
    await say('This is it. The door needs the all-clear code.');
    objective('Enter the all-clear code');
    const P = r.pad; let entry = '', flash = '', flashCol = C.text, first = true;
    P.paint = (ctx, W, H) => {
      rrect(ctx, 40, 40, W - 80, 130, 20); ctx.fillStyle = '#05080d'; ctx.fill();
      ctx.font = `700 ${flash ? 54 : 84}px ${FONT}`; ctx.fillStyle = flash ? flashCol : C.acc; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(flash || (entry.padEnd(4, '•').split('').join(' ')), W / 2, 106); ctx.textAlign = 'left';
    };
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✓'];
    const kw = (P.W - 80 - 40) / 3, kh = (P.H - 210 - 50) / 4;
    let resolve;
    const press = k => {
      if (flash) return; sfx('beep');
      if (k === '⌫') entry = entry.slice(0, -1); else if (k === '✓') check(); else if (entry.length < 4) { entry += k; if (entry.length === 4) setTimeout(check, 250); }
      P.redraw();
    };
    keys.forEach((k, i) => P.addButton([40 + (i % 3) * (kw + 20), 200 + Math.floor(i / 3) * (kh + 16), kw, kh], k, () => press(k), { size: 70 }));
    P.redraw();
    const onKey = e => { if (/^Digit\d$|^Numpad\d$/.test(e.code)) press(e.key); if (e.code === 'Backspace') press('⌫'); if (e.code === 'Enter') press('✓'); };
    addEventListener('keydown', onKey); track(() => removeEventListener('keydown', onKey));
    const pop = pushHint(() => { objective('Enter: ' + G.code.join(' ')); });
    function check() {
      if (entry.length < 4) return;
      if (entry === G.code.join('')) { flash = 'ACCESS GRANTED'; flashCol = C.good; P.redraw(); sfx('unlock'); addScore(first ? 150 : 50); assess(first, { title: 'The all-clear code', why: 'Each zone you cleared gave you one digit, in order.' }); resolve(); }
      else { first = false; flash = 'ACCESS DENIED'; flashCol = C.bad; P.redraw(); penalty(CFG.WRONG_PENALTY); setTimeout(() => { flash = ''; entry = ''; P.redraw(); }, 1200); }
    }
    await new Promise(res => { resolve = res; });
    pop(); removeEventListener('keydown', onKey);
    await tween(900, k => r.door.position.x = k * .95);
    await say('Code accepted. One last check before I lift the lockdown.');
    await decide(DECISIONS.breach);
    await say("Lockdown lifted. Building's secure. Thanks for tonight. Grab that charger and go home.");
  },
};

export const ROOMS = [parking, ground, reception, gates, lifts, entrance, desk, meeting, printer, server];
