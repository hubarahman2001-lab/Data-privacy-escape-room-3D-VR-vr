/* Input: tracked hands, controllers and mouse/keyboard, all turned into the same "pointer" shape.
   pointer.tip       index fingertip (or controller tip)
   pointer.pinchPos  between thumb and index (or controller tip)
   pointer.palm      middle of the palm
   pointer.pinching / pinchStart / pinchEnd
   pointer.pose      'open' | 'fist' | 'thumb' | 'point' | 'none'
   pointer.quat      hand / controller rotation (for turning the key) */
import { THREE, renderer, scene, camera, rig, beforeFrame, isXR, headPos, headYaw, clamp } from './core.js';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';

class Pointer {
  constructor(kind, side) {
    this.kind = kind; this.side = side; this.active = false;
    this.tip = new THREE.Vector3(); this.pinchPos = new THREE.Vector3(); this.palm = new THREE.Vector3();
    this.prevPalm = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.pinching = false; this.pinchStart = false; this.pinchEnd = false;
    this.pose = 'none'; this.ray = new THREE.Ray(); this.hasRay = false;
    this.hit = null; this.uiHit = null; this.btnA = false; this.btnB = false; this.btnBStart = false;
    this.captured = null; // a task that owns this pointer's pinch (grabbing)
  }
  setPinch(v) { this.pinchStart = v && !this.pinching; this.pinchEnd = !v && this.pinching; this.pinching = v; }
}

export const pointers = [];            // active this frame
const handPtrs = [new Pointer('hand', 'left'), new Pointer('hand', 'right')];
const ctrlPtrs = [new Pointer('ctrl', 'left'), new Pointer('ctrl', 'right')];
export const mouse = new Pointer('mouse', 'none');
export const input = { onHint: null, onPause: null, rayRoots: [], uiRoots: [], bounds: null, moveLocked: false };

/* ---------- XR hands and controllers ---------- */
const handFactory = new XRHandModelFactory(); handFactory.setPath('./assets/hands/');
const slots = [0, 1].map(i => {
  const ctrl = renderer.xr.getController(i), grip = renderer.xr.getControllerGrip(i), hand = renderer.xr.getHand(i);
  rig.add(ctrl, grip, hand);
  const s = { i, ctrl, grip, hand, src: null };
  ctrl.addEventListener('connected', e => { s.src = e.data; });
  ctrl.addEventListener('disconnected', () => { s.src = null; });
  const model = handFactory.createHandModel(hand, 'mesh'); hand.add(model);
  grip.add(controllerModel());
  // pointer line (shown when aiming at a panel)
  // the line runs along +Z because lookAt() turns an object's +Z toward the target
  const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)]);
  s.line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0x7be9ff, transparent: true, opacity: .8, depthTest: false }));
  s.line.renderOrder = 999; s.line.visible = false; s.line.frustumCulled = false; scene.add(s.line);
  s.dot = new THREE.Mesh(new THREE.SphereGeometry(0.008, 10, 8), new THREE.MeshBasicMaterial({ color: 0x7be9ff, depthTest: false }));
  s.dot.renderOrder = 999; s.dot.visible = false; scene.add(s.dot);
  return s;
});
function controllerModel() {
  const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: 0x23272e, roughness: .5, metalness: .2 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.11, 16), m);
  body.rotation.x = Math.PI / 2 - 0.5; body.position.set(0, -0.01, 0.03); g.add(body);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.006, 8, 24), new THREE.MeshStandardMaterial({ color: 0x3b4250, roughness: .4 }));
  ring.position.set(0, 0.01, -0.035); ring.rotation.x = 0.4; g.add(ring);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.009, 12, 8), new THREE.MeshBasicMaterial({ color: 0x7be9ff }));
  tip.position.set(0, -0.005, -0.06); g.add(tip);
  return g;
}

const J = ['wrist', 'thumb-metacarpal', 'thumb-tip', 'index-finger-phalanx-proximal', 'index-finger-tip',
  'middle-finger-phalanx-proximal', 'middle-finger-tip', 'ring-finger-phalanx-proximal', 'ring-finger-tip',
  'pinky-finger-phalanx-proximal', 'pinky-finger-tip', 'middle-finger-metacarpal'];
const jp = {}; J.forEach(n => jp[n] = new THREE.Vector3());
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion();

function readHand(s, p) {
  const joints = s.hand.joints; if (!joints || !joints['wrist'] || !joints['wrist'].visible || !joints['index-finger-tip']) return false;
  for (const n of J) { const j = joints[n]; if (!j) return false; j.getWorldPosition(jp[n]); }
  joints['wrist'].getWorldQuaternion(p.quat);
  p.tip.copy(jp['index-finger-tip']);
  p.pinchPos.copy(jp['thumb-tip']).add(jp['index-finger-tip']).multiplyScalar(.5);
  p.palm.copy(jp['wrist']).lerp(jp['middle-finger-phalanx-proximal'], .6);
  const pd = jp['thumb-tip'].distanceTo(jp['index-finger-tip']);
  p.setPinch(p.pinching ? pd < 0.04 : pd < 0.022);
  const w = jp['wrist'];
  const ratio = (tip, prox) => jp[tip].distanceTo(w) / Math.max(1e-4, jp[prox].distanceTo(w));
  const f = [ratio('index-finger-tip', 'index-finger-phalanx-proximal'), ratio('middle-finger-tip', 'middle-finger-phalanx-proximal'),
    ratio('ring-finger-tip', 'ring-finger-phalanx-proximal'), ratio('pinky-finger-tip', 'pinky-finger-phalanx-proximal')];
  const ext = f.map(r => r > 1.55), curl = f.map(r => r < 1.3);
  const thumbOut = jp['thumb-tip'].distanceTo(jp['index-finger-phalanx-proximal']) > 0.06;
  const thumbUp = thumbOut && _v.subVectors(jp['thumb-tip'], jp['thumb-metacarpal']).normalize().y > 0.55;
  let pose = 'none';
  if (ext.every(Boolean) && pd > 0.035) pose = 'open';
  else if (curl.every(Boolean) && thumbUp) pose = 'thumb';
  else if (curl.every(Boolean)) pose = 'fist';
  else if (ext[0] && curl[1] && curl[2]) pose = 'point';
  p.pose = pose;
  // ray for panels: from the shoulder through the knuckle
  const yaw = headYaw(), side = p.side === 'left' ? -1 : 1; headPos(_v2);
  _v2.x += Math.cos(yaw) * 0.17 * side; _v2.z -= Math.sin(yaw) * 0.17 * side; _v2.y -= 0.22;
  p.ray.origin.copy(jp['index-finger-phalanx-proximal']);
  p.ray.direction.subVectors(jp['index-finger-phalanx-proximal'], _v2).normalize();
  p.hasRay = true;
  return true;
}
function readCtrl(s, p) {
  const src = s.src, gp = src && src.gamepad; if (!gp) return false;
  s.grip.getWorldPosition(p.palm); s.grip.getWorldQuaternion(p.quat);
  s.ctrl.getWorldPosition(_v); s.ctrl.getWorldQuaternion(_q);
  p.ray.origin.copy(_v); p.ray.direction.set(0, 0, -1).applyQuaternion(_q); p.hasRay = true;
  p.tip.copy(p.palm).add(_v2.set(0, -0.005, -0.06).applyQuaternion(p.quat));
  p.pinchPos.copy(p.tip);
  const b = i => gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > .5);
  p.setPinch(b(0));
  const prevB = p.btnB; p.btnA = b(4); p.btnB = b(5); p.btnBStart = p.btnB && !prevB;
  p.pose = b(1) ? 'fist' : p.btnA ? 'open' : (b(3) ? 'thumb' : 'none');
  p.axes = gp.axes;
  return true;
}

/* ---------- mouse and keyboard ---------- */
const keys = new Set();
const mstate = { x: 0, y: 0, down: false, look: false, lx: 0, ly: 0, moved: 0, pressHit: null, rdown: false };
const ndc = new THREE.Vector2(), ray = new THREE.Raycaster();
const el = renderer.domElement;
el.addEventListener('contextmenu', e => e.preventDefault());
el.addEventListener('pointerdown', e => {
  if (isXR()) return; el.setPointerCapture(e.pointerId);
  mstate.x = e.clientX; mstate.y = e.clientY; mstate.lx = e.clientX; mstate.ly = e.clientY; mstate.moved = 0;
  if (e.button === 2) { mstate.look = true; mstate.rdown = true; return; }
  mstate.down = true; mstate.latch = true; mstate.look = false; mstate.pressHit = null; mstate.needHit = true;
});
el.addEventListener('pointermove', e => {
  mstate.x = e.clientX; mstate.y = e.clientY;
  const dx = e.clientX - mstate.lx, dy = e.clientY - mstate.ly; mstate.lx = e.clientX; mstate.ly = e.clientY;
  if (mstate.down || mstate.rdown) mstate.moved += Math.abs(dx) + Math.abs(dy);
  if (mstate.down && !mstate.look && !mstate.pressHit && !mouse.captured && mstate.moved > 6) mstate.look = true;
  if (mstate.look && (mstate.down || mstate.rdown) && !mouse.captured) {
    camera.rotation.y -= dx * 0.004; camera.rotation.x = clamp(camera.rotation.x - dy * 0.004, -1.3, 1.3);
  }
});
const up = () => { mstate.down = false; mstate.rdown = false; mstate.look = false; };
el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
addEventListener('keydown', e => {
  if (e.target && e.target.tagName === 'INPUT') return;
  keys.add(e.code);
  if (e.code === 'KeyH' && input.onHint) input.onHint();
  if (e.code === 'KeyP' && input.onPause) input.onPause();
  if (input.onKey) input.onKey(e);
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

const GRAB_RANGE = 6; // metres: how far away you can point at something and grab it
function heldByAny(o) { for (const p of [...handPtrs, ...ctrlPtrs]) if (p.captured && isIn(o, p.captured)) return true; return false; }
function interactive(o) { while (o) { if (o.userData && (o.userData.interactive || o.userData.button)) return true; o = o.parent; } return false; }
function visibleChain(o) { while (o) { if (!o.visible) return false; o = o.parent; } return true; }
export function raycastAll(r, roots) {
  ray.ray.copy(r); ray.far = 30;
  const hits = ray.intersectObjects(roots.filter(Boolean), true);
  return hits.filter(h => visibleChain(h.object) && !(h.object.userData && h.object.userData.noHit));
}

function readMouse(p) {
  ndc.set(mstate.x / innerWidth * 2 - 1, -(mstate.y / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera); p.ray.copy(ray.ray); p.hasRay = true;
  const hits = raycastAll(p.ray, [...input.uiRoots, ...input.rayRoots]);
  p.hit = hits[0] || null;
  if (mstate.needHit) { mstate.needHit = false; mstate.pressHit = p.hit && interactive(p.hit.object) ? p.hit : null; }
  p.setPinch((mstate.down && !mstate.look) || !!mstate.latch); mstate.latch = false;
  p.pose = p.pinching ? 'any' : 'none';
  if (p.hit) { p.tip.copy(p.hit.point); p.pinchPos.copy(p.hit.point); p.palm.copy(p.hit.point); }
  else { p.ray.at(1.2, p.tip); p.pinchPos.copy(p.tip); p.palm.copy(p.tip); }
  // keyboard walking
  const f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  const s = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  const tr = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0);
  if (tr) camera.rotation.y -= tr * 0.035;
  if ((f || s) && !input.moveLocked) moveFlat(f, s, 1.8 / 60);
  return true;
}
const _m = new THREE.Vector3();
function moveFlat(f, s, step) {
  const y = headYaw();
  _m.set(-Math.sin(y) * f + Math.cos(y) * s, 0, -Math.cos(y) * f - Math.sin(y) * s).multiplyScalar(step);
  rig.position.add(_m);
  const b = input.bounds; if (b) {
    headPos(_v);
    const cx = clamp(_v.x, b[0], b[1]) - _v.x, cz = clamp(_v.z, b[2], b[3]) - _v.z;
    rig.position.x += cx; rig.position.z += cz;
  }
}

/* ---------- per frame ---------- */
let snapReady = true;
beforeFrame((now, dt) => {
  rig.updateMatrixWorld(true);
  pointers.length = 0;
  if (isXR()) {
    for (const s of slots) {
      const side = s.src ? (s.src.handedness === 'left' ? 0 : 1) : s.i;
      let p = null;
      if (s.src && s.src.hand) { p = handPtrs[side]; p.side = side ? 'right' : 'left'; if (!readHand(s, p)) p = null; }
      else if (s.src && s.src.gamepad) { p = ctrlPtrs[side]; p.side = side ? 'right' : 'left'; if (!readCtrl(s, p)) p = null; }
      s.p = p;
      if (p) {
        p.active = true; pointers.push(p);
        p.vel.subVectors(p.palm, p.prevPalm).divideScalar(Math.max(dt, 1) / 1000); p.prevPalm.copy(p.palm);
        // panels under the ray
        const hits = raycastAll(p.ray, input.uiRoots);
        p.uiHit = hits[0] || null;
        // things you can pick up / use under the ray (point + trigger/pinch grabs from a distance)
        p.hit = null;
        if (!p.uiHit && !p.captured) {
          for (const h of raycastAll(p.ray, input.rayRoots)) {
            if (h.distance > GRAB_RANGE) break;
            if (interactive(h.object) && !heldByAny(h.object)) { p.hit = h; break; }
          }
        }
        const tgt = p.uiHit || p.hit;
        const show = !!tgt && tgt.distance > 0.12;
        s.line.material.color.setHex(p.hit ? 0xffd34d : 0x7be9ff); s.dot.material.color.copy(s.line.material.color);
        if (show) {
          s.line.visible = s.dot.visible = true; s.line.material.opacity = .9;
          s.line.position.copy(p.ray.origin);
          s.line.scale.setScalar(1); s.line.lookAt(tgt.point); s.line.scale.set(1, 1, tgt.distance);
          s.dot.position.copy(tgt.point);
        } else if (p.kind === 'ctrl' && !p.captured) {
          // controllers: always show a faint laser so you know you can point with it
          s.line.visible = true; s.dot.visible = false; s.line.material.opacity = .25;
          s.line.position.copy(p.ray.origin); s.line.scale.setScalar(1);
          p.ray.at(1.5, _v); s.line.lookAt(_v); s.line.scale.set(1, 1, 1.5);
        } else { s.line.visible = s.dot.visible = false; }
        if (p.kind === 'ctrl' && p.btnBStart && input.onHint) input.onHint();
        // controller sticks: left moves, right turns
        if (p.kind === 'ctrl' && p.axes && p.axes.length >= 4 && !input.moveLocked) {
          const ax = p.axes[2], ay = p.axes[3];
          if (p.side === 'left' && Math.hypot(ax, ay) > .2) moveFlat(-ay, ax, 1.4 * dt / 1000);
          if (p.side === 'right') {
            if (Math.abs(ax) > .7 && snapReady) { snapReady = false; snapTurn(ax > 0 ? -Math.PI / 6 : Math.PI / 6); }
            if (Math.abs(ax) < .3) snapReady = true;
          }
        }
      } else { s.line.visible = s.dot.visible = false; }
    }
    handPtrs.forEach(p => { if (!pointers.includes(p)) { p.active = false; p.setPinch(false); } });
    ctrlPtrs.forEach(p => { if (!pointers.includes(p)) { p.active = false; p.setPinch(false); } });
  } else {
    mouse.active = true; readMouse(mouse); pointers.push(mouse);
    mouse.vel.subVectors(mouse.palm, mouse.prevPalm).divideScalar(Math.max(dt, 1) / 1000); mouse.prevPalm.copy(mouse.palm);
    mouse.uiHit = mouse.hit && mouse.hit.object.userData.button ? mouse.hit : null;
  }
});
function snapTurn(a) {
  headPos(_v);
  rig.position.sub(_v); rig.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), a); rig.position.add(_v);
  rig.rotation.y += a;
}

/* ---------- helpers for tasks ---------- */
const _b = new THREE.Box3();
export function boxOf(obj) { return _b.setFromObject(obj); }
/* is this pointer at the object? hands/controllers: within r metres; mouse: the ray hits it */
export function at(p, obj, r = 0.05, where = 'pinch') {
  if (!obj) return false;
  if (p.kind === 'mouse') return !!(p.hit && isIn(p.hit.object, obj));
  if (where === 'pinch' && p.hit && isIn(p.hit.object, obj)) return true; // pointing at it with the laser
  const pt = where === 'tip' ? p.tip : where === 'palm' ? p.palm : p.pinchPos;
  return boxOf(obj).expandByScalar(r).containsPoint(pt);
}
export function isIn(o, root) { while (o) { if (o === root) return true; o = o.parent; } return false; }
/* any pointer pinching on obj this frame (returns the pointer) */
export function pinchedOn(obj, r = 0.06) {
  for (const p of pointers) if (p.pinchStart && !p.captured && !p.uiHit && at(p, obj, r)) return p;
  return null;
}
export const isHandMode = () => pointers.some(p => p.kind === 'hand');
export const isCtrlMode = () => pointers.some(p => p.kind === 'ctrl');
export const inputKind = () => isXR() ? (isHandMode() ? 'hand' : isCtrlMode() ? 'ctrl' : 'hand') : 'mouse';
