/* Sound effects (made with Web Audio, no files) and Sam's voice (the browser's speech) */
let ac = null, master = null;
export let muted = false;
export function initAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  try { ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.gain.value = 0.6; master.connect(ac.destination); } catch (e) { ac = null; }
}
export function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.6; if (m && window.speechSynthesis) speechSynthesis.cancel(); }

function tone(freq, dur, { type = 'sine', vol = .3, at = 0, slide = 0, attack = .005 } = {}) {
  if (!ac || muted) return;
  const t = ac.currentTime + at, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .05);
}
function noise(dur, { vol = .2, at = 0, lp = 2000, hp = 0 } = {}) {
  if (!ac || muted) return;
  const t = ac.currentTime + at, n = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = ac.createBufferSource(); s.buffer = buf; const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp;
  const g = ac.createGain(); g.gain.value = vol; s.connect(f);
  if (hp) { const h = ac.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = hp; f.connect(h); h.connect(g); } else f.connect(g);
  g.connect(master); s.start(t);
}
export function sfx(name) {
  switch (name) {
    case 'good': tone(660, .14, { type: 'triangle', vol: .25 }); tone(990, .22, { type: 'triangle', vol: .22, at: .1 }); break;
    case 'bad': tone(220, .28, { type: 'sawtooth', vol: .12, slide: -80 }); tone(160, .3, { type: 'square', vol: .06, at: .05 }); break;
    case 'pickup': tone(520, .08, { type: 'triangle', vol: .2, slide: 200 }); break;
    case 'drop': tone(300, .1, { type: 'triangle', vol: .2, slide: -120 }); break;
    case 'clink': tone(1800, .12, { vol: .15 }); tone(2400, .1, { vol: .08, at: .03 }); break;
    case 'beep': tone(1320, .09, { type: 'square', vol: .08 }); break;
    case 'unlock': tone(880, .1, { type: 'square', vol: .08 }); tone(1320, .16, { type: 'square', vol: .08, at: .1 }); noise(.12, { vol: .2, lp: 900, at: .05 }); break;
    case 'thud': tone(90, .22, { vol: .4, slide: -40 }); noise(.15, { vol: .25, lp: 400 }); break;
    case 'whoosh': noise(.35, { vol: .18, lp: 1800, hp: 300 }); break;
    case 'drawer': noise(.3, { vol: .15, lp: 700 }); tone(140, .2, { vol: .1, at: .2 }); break;
    case 'crumple': noise(.25, { vol: .25, lp: 4000, hp: 900 }); noise(.2, { vol: .2, lp: 3000, hp: 800, at: .12 }); break;
    case 'shred': for (let i = 0; i < 6; i++) noise(.09, { vol: .2, lp: 2500, hp: 400, at: i * .07 }); tone(120, .5, { type: 'sawtooth', vol: .05 }); break;
    case 'radio': noise(.18, { vol: .12, lp: 4000, hp: 1500 }); tone(1200, .05, { type: 'square', vol: .04 }); break;
    case 'chime': tone(784, .3, { vol: .18 }); tone(1047, .4, { vol: .15, at: .12 }); break;
    case 'win': [523, 659, 784, 1047].forEach((f, i) => tone(f, .35, { type: 'triangle', vol: .2, at: i * .13 })); break;
    case 'lose': [392, 330, 262].forEach((f, i) => tone(f, .45, { type: 'sawtooth', vol: .09, at: i * .22 })); break;
    case 'alarm': tone(880, .25, { type: 'square', vol: .06 }); tone(660, .25, { type: 'square', vol: .06, at: .25 }); break;
    case 'step': noise(.06, { vol: .08, lp: 600 }); break;
    case 'decoy': tone(400, .12, { type: 'square', vol: .06 }); tone(300, .14, { type: 'square', vol: .06, at: .1 }); break;
  }
}
/* phone ringtone loop; returns stop() */
export function ringtone() {
  let on = true; const go = () => { if (!on) return; for (let i = 0; i < 8; i++) { tone(1100, .045, { type: 'square', vol: .06, at: i * .05 }); tone(1400, .045, { type: 'square', vol: .05, at: i * .05 + .025 }); } setTimeout(go, 1800); };
  go(); return () => { on = false; };
}
/* hum for a room; returns stop() */
export function ambience(kind = 'hum') {
  if (!ac) return () => {};
  const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.value = kind === 'server' ? 110 : 55;
  g.gain.value = 0; o.connect(g); g.connect(master); o.start();
  g.gain.linearRampToValueAtTime(kind === 'server' ? .05 : .025, ac.currentTime + 1);
  return () => { try { g.gain.linearRampToValueAtTime(0, ac.currentTime + .4); o.stop(ac.currentTime + .5); } catch (e) {} };
}

/* ---------- voice ---------- */
let voice = null, voiceN = null;
function pickVoices() {
  if (!window.speechSynthesis) return;
  const vs = speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang)); if (!vs.length) return;
  const pref = n => vs.find(v => n.test(v.name));
  voice = pref(/Google UK English Male|Daniel|Guy|Ryan|George|Male/i) || vs[0];
  voiceN = pref(/Google UK English Female|Google US English|Samantha|Aria|Jenny|Libby|Female/i) || vs[1] || vs[0];
}
if (window.speechSynthesis) { pickVoices(); speechSynthesis.onvoiceschanged = pickVoices; }
/* speak text; resolves when done (or after a reading-time estimate if speech isn't available) */
export function speak(text, who = 'sam') {
  const est = Math.min(9000, 900 + text.length * 52);
  if (window.__fast) return new Promise(r => setTimeout(r, 60));
  if (muted || !window.speechSynthesis) return new Promise(r => setTimeout(r, est));
  speechSynthesis.cancel();
  return new Promise(res => {
    let done = false; const fin = () => { if (!done) { done = true; res(); } };
    try {
      const u = new SpeechSynthesisUtterance(text.replace(/[“”]/g, '"'));
      const v = who === 'sam' ? voice : voiceN; if (v) u.voice = v;
      u.rate = who === 'sam' ? 1.05 : 1.0; u.pitch = who === 'sam' ? .9 : 1.05; u.onend = fin; u.onerror = fin;
      speechSynthesis.speak(u);
      setTimeout(fin, est + 4000);
    } catch (e) { setTimeout(fin, est); }
  });
}
export function stopSpeech() { if (window.speechSynthesis) speechSynthesis.cancel(); }
