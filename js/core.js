/* Core: renderer, scene, camera rig, body anchors, frame loop, fade, timing helpers */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
export { THREE };

export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;

export const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.domElement.id = 'gl';
document.body.appendChild(renderer.domElement);

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05080d);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.45;

export const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.02, 80);
camera.rotation.order = 'YXZ';
camera.position.set(0, 1.6, 0);
/* the rig is "you": moving it moves the player through the world */
export const rig = new THREE.Group();
rig.name = 'rig';
rig.add(camera);
scene.add(rig);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

export const isXR = () => renderer.xr.isPresenting;

/* head pose in world space */
const _hp = new THREE.Vector3(), _hq = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
export function headPos(out = new THREE.Vector3()) { camera.getWorldPosition(out); return out; }
export function headYaw() { camera.getWorldQuaternion(_hq); _e.setFromQuaternion(_hq, 'YXZ'); return _e.y; }
export function headDir(out = new THREE.Vector3()) { camera.getWorldDirection(out); return out; }
/* a point in front of the head on the horizontal plane */
export function inFront(dist, dy = 0, side = 0, out = new THREE.Vector3()) {
  const y = headYaw(); headPos(_hp);
  out.set(_hp.x - Math.sin(y) * dist + Math.cos(y) * side, _hp.y + dy, _hp.z - Math.cos(y) * dist - Math.sin(y) * side);
  return out;
}

/* body: follows the head (yaw only, smoothed). Chest badge and hip pocket live here. */
export const body = new THREE.Group(); body.name = 'body'; scene.add(body);
let bodyYaw = 0;
function updateBody(dt) {
  headPos(_hp); const y = headYaw();
  let d = y - bodyYaw; d = Math.atan2(Math.sin(d), Math.cos(d));
  if (Math.abs(d) > 0.6) bodyYaw += d * Math.min(1, dt * 4); else bodyYaw += d * Math.min(1, dt * 1.2);
  body.position.copy(_hp); body.rotation.set(0, bodyYaw, 0);
}
export function snapBody() { headPos(body.position); bodyYaw = headYaw(); body.rotation.set(0, bodyYaw, 0); }

/* frame loop: register per-frame callbacks; they get (now ms, dt ms) */
const frameFns = new Set();
export function onFrame(fn) { frameFns.add(fn); return () => frameFns.delete(fn); }
export const sleep = ms => new Promise(r => setTimeout(r, ms));
/* wait for a condition checked every frame */
export function until(pred) { return new Promise(res => { const off = onFrame((n, dt) => { if (pred(n, dt)) { off(); res(); } }); }); }

let preFns = [];
export function beforeFrame(fn) { preFns.push(fn); }
let last = performance.now();
renderer.setAnimationLoop((t, frame) => {
  const now = performance.now(); const dt = Math.min(100, now - last); last = now;
  for (const f of preFns) f(now, dt, frame);
  updateBody(dt / 1000);
  for (const f of [...frameFns]) { try { f(now, dt); } catch (e) { console.error(e); frameFns.delete(f); } }
  renderer.render(scene, camera);
});

/* fade to black (a sphere around the head) */
const fadeMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 1, side: THREE.BackSide, depthTest: false, depthWrite: false });
const fadeMesh = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 12), fadeMat);
fadeMesh.renderOrder = 10000; fadeMesh.frustumCulled = false; fadeMesh.userData.noHit = true;
camera.add(fadeMesh);
export function fade(to, ms = 450) {
  const from = fadeMat.opacity, t0 = performance.now();
  fadeMesh.visible = true;
  return new Promise(res => { const off = onFrame(now => {
    const k = clamp((now - t0) / ms, 0, 1); fadeMat.opacity = lerp(from, to, k * k * (3 - 2 * k));
    if (k >= 1) { off(); if (to === 0) fadeMesh.visible = false; res(); } }); });
}

/* comfort vignette: darkens the edges of your view while the game moves you */
const vigTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  const g = x.createRadialGradient(128, 128, 40, 128, 128, 128); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(.55, 'rgba(0,0,0,0)'); g.addColorStop(.85, 'rgba(0,0,0,.75)'); g.addColorStop(1, 'rgba(0,0,0,1)');
  x.fillStyle = g; x.fillRect(0, 0, 256, 256); const t = new THREE.CanvasTexture(c); return t; })();
const vigMat = new THREE.MeshBasicMaterial({ map: vigTex, transparent: true, opacity: 0, depthTest: false, depthWrite: false });
const vigMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), vigMat);
vigMesh.position.z = -0.22; vigMesh.renderOrder = 9990; vigMesh.frustumCulled = false; vigMesh.userData.noHit = true; vigMesh.visible = false;
camera.add(vigMesh);
export function vignette(op) { vigMat.opacity = op; vigMesh.visible = op > 0.01; }

/* put the player's head at world (0, y, 0) facing -Z, whatever their real position in the play space */
export function recenter() {
  if (isXR()) {
    const p = camera.position, q = camera.quaternion; // local to rig
    _e.setFromQuaternion(q, 'YXZ'); const yaw = _e.y;
    rig.rotation.set(0, -yaw, 0);
    const c = Math.cos(-yaw), s = Math.sin(-yaw);
    // world = rigPos + R(-yaw) * p  -> want x,z = 0
    rig.position.x = -(c * p.x + s * p.z);
    rig.position.z = -(-s * p.x + c * p.z);
  } else {
    rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0); camera.rotation.set(0, 0, 0);
  }
  rig.updateMatrixWorld(true); snapBody();
}
/* seated players: lift the rig so the head sits at standing height */
export function fitHeight() {
  if (!isXR()) return;
  const h = camera.position.y;
  rig.position.y = h > 0.3 && h < 1.35 ? 1.6 - h : 0;
}
