/* Start-up: menu, entering VR, desktop buttons */
import { renderer, isXR } from './core.js';
import { G, startGame, setRooms, useHint, togglePause, repeatLine } from './game.js';
import { ROOMS, ZONE_MSG } from './rooms.js';
import { initAudio, setMuted, muted, stopSpeech } from './audio.js';

setRooms(ROOMS, ZONE_MSG);
const $ = s => document.querySelector(s);
const menu = $('#menu'), vrBtn = $('#enter-vr'), flatBtn = $('#play-flat'), note = $('#vr-note');

async function checkVR() {
  if (!navigator.xr) { note.textContent = 'No VR headset found in this browser. Open this page in the Meta Quest Browser to play in VR, or play on this screen.'; vrBtn.disabled = true; return; }
  try {
    const ok = await navigator.xr.isSessionSupported('immersive-vr');
    if (!ok) { vrBtn.disabled = true; note.textContent = 'This browser can\'t start VR. On a Meta Quest, open this page in the Quest Browser.'; }
    else note.textContent = 'Tip: put your controllers down and use your hands. Hand tracking must be on in the Quest settings.';
  } catch (e) { vrBtn.disabled = true; }
}
checkVR();
/* opened from the course (SCORM): say where the result goes */
if (/[?&]scorm=1/.test(location.search)) {
  const tip = document.createElement('p'); tip.style.cssText = 'color:#7be9ff;font-size:14px;margin-top:6px';
  tip.textContent = 'Opened from your course: your result is sent back when you finish. Keep the course window open.';
  note.after(tip);
}

let session = null, starting = false;
const XR_OPTS = { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] };
vrBtn.addEventListener('click', async () => {
  if (starting) return;                     // ignore double taps while the headset is starting up
  starting = true; vrBtn.disabled = true; note.textContent = 'Starting VR…';
  initAudio();
  try {
    // a session left over from an earlier try (e.g. after leaving VR with the Quest button): close it first
    const old = renderer.xr.getSession() || session;
    if (old) { try { await old.end(); } catch (e) {} session = null; await new Promise(r => setTimeout(r, 300)); }
    try { session = await navigator.xr.requestSession('immersive-vr', XR_OPTS); }
    catch (e) {
      if (!/already an active/i.test(e.message)) throw e;
      await new Promise(r => setTimeout(r, 1200));   // the old session may still be closing: try once more
      session = await navigator.xr.requestSession('immersive-vr', XR_OPTS);
    }
    session.addEventListener('end', onEnd);
    session.addEventListener('visibilitychange', () => togglePause(session && session.visibilityState !== 'visible'));
    await renderer.xr.setSession(session);
    if (renderer.xr.setFoveation) renderer.xr.setFoveation(0.6);
    note.textContent = '';
    menu.classList.add('hidden'); document.body.classList.add('in-vr');
    startGame();
  } catch (e) {
    note.textContent = /already an active/i.test(e.message)
      ? 'VR is already running in another tab or app. Close any other VR tabs or apps (on a PC: exit Quest Link / SteamVR games), then reload this page and press Enter VR once.'
      : 'Could not start VR: ' + e.message;
    if (session) { try { await session.end(); } catch (er) {} session = null; }
  } finally { starting = false; vrBtn.disabled = false; }
});
flatBtn.addEventListener('click', () => {
  initAudio(); menu.classList.add('hidden'); document.body.classList.add('flat');
  startGame();
});
function onEnd() {
  session = null; document.body.classList.remove('in-vr');
  G.runId++; G.state = 'idle'; stopSpeech();
  menu.classList.remove('hidden');
}

/* on-screen buttons (desktop) */
$('#b-hint').addEventListener('click', () => useHint());
$('#b-pause').addEventListener('click', () => togglePause());
$('#b-again').addEventListener('click', () => repeatLine());
$('#b-restart').addEventListener('click', () => { if (confirm('Start again from the car park? Your time, score and hints reset.')) { togglePause(false); startGame({ intro: false }); } });
$('#b-mute').addEventListener('click', e => { setMuted(!muted); e.currentTarget.textContent = muted ? '🔇' : '🔊'; });
$('#b-menu').addEventListener('click', () => { G.runId++; G.state = 'idle'; stopSpeech(); document.body.classList.remove('flat', 'paused'); menu.classList.remove('hidden'); });
addEventListener('keydown', e => { if (e.code === 'KeyR' && document.body.classList.contains('flat')) $('#b-restart').click(); });

import { scene, camera, THREE } from './core.js';
import { badge } from './game.js';
import { hud, BUTTONS, visible } from './ui.js';
import { DECISIONS } from './content.js';
import { rig, headPos } from './core.js';
import { pointers } from './input.js';
/* test hooks */
window.__game = { G, startGame, scene, camera, THREE, badge, hud,
  screen(o) { scene.updateMatrixWorld(true); camera.matrixWorldInverse.copy(camera.matrixWorld).invert(); const b = new THREE.Box3().setFromObject(o), c = b.getCenter(new THREE.Vector3()); c.project(camera);
    return { x: (c.x + 1) / 2 * innerWidth, y: (1 - c.y) / 2 * innerHeight, z: c.z }; },
  look(o) { const c = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()), h = camera.getWorldPosition(new THREE.Vector3());
    const d = c.sub(h); camera.rotation.y = Math.atan2(-d.x, -d.z) - rig.rotation.y; camera.rotation.x = Math.atan2(d.y, Math.hypot(d.x, d.z)); },
  goto(x, z) { rig.position.x = x; rig.position.z = z; },
  buttons() { return [...BUTTONS].filter(b => visible(b.panel) && b.enabled).map(b => ({ label: b.label, ...this.screen(b.mesh) })); },
  DECISIONS, rig, renderer, pointers, headPos };
window.__btns = () => [...BUTTONS].filter(b => visible(b.panel));
