/* Violet Garden — procedural sound. No audio files: everything is synthesized.
   Default OFF; the #sound pill toggles. */
(function () {
  let ctx = null, master = null, windGain = null, writing = null, enabled = false;

  function noiseBuffer(sec, brown) {
    const n = ctx.sampleRate * sec, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      else d[i] = w;
    }
    return b;
  }
  let brownBuf = null, whiteBuf = null;

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
    brownBuf = noiseBuffer(4, true); whiteBuf = noiseBuffer(2, false);

    const wind = ctx.createBufferSource(); wind.buffer = brownBuf; wind.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 0.6;
    windGain = ctx.createGain(); windGain.gain.value = 0.16;
    wind.connect(lp); lp.connect(windGain); windGain.connect(master);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lfoG = ctx.createGain(); lfoG.gain.value = 240;
    lfo.connect(lfoG); lfoG.connect(lp.frequency);
    wind.start(); lfo.start();
  }

  function env(g, t0, peak, dur, hold) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + (hold || 0.012));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }
  function noiseBurst(t0, dur, type, freq, q, peak) {
    const s = ctx.createBufferSource(); s.buffer = whiteBuf; s.loop = true;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); env(g, t0, peak, dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t0); s.stop(t0 + dur + 0.05);
  }
  function bell(t0, freq, dur, peak) {
    [[1, 1], [2.01, 0.32], [3.03, 0.12]].forEach(function (p) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq * p[0];
      const g = ctx.createGain(); env(g, t0, peak * p[1], dur);
      o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.05);
    });
  }

  function event(name) {
    if (!enabled || !ctx) return;
    const t = ctx.currentTime;
    if (name === 'unfold') {
      for (let i = 0; i < 5; i++) noiseBurst(t + i * 0.09 + Math.random() * 0.04, 0.16, 'highpass', 1400 + Math.random() * 1800, 0.7, 0.10);
    } else if (name === 'write-start') {
      const s = ctx.createBufferSource(); s.buffer = whiteBuf; s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = 1.4;
      const g = ctx.createGain(); g.gain.value = 0.0001;
      const m = ctx.createOscillator(); m.frequency.value = 7.3;
      const mg = ctx.createGain(); mg.gain.value = 0.028;
      m.connect(mg); mg.connect(g.gain);
      s.connect(f); f.connect(g); g.connect(master);
      s.start(t); m.start(t);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.035, t + 0.25);
      writing = { s: s, m: m, g: g };
    } else if (name === 'write-stop' && writing) {
      const w = writing; writing = null;
      w.g.gain.cancelScheduledValues(t);
      w.g.gain.setValueAtTime(Math.max(w.g.gain.value, 0.0001), t);
      w.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      w.s.stop(t + 0.3); w.m.stop(t + 0.3);
    } else if (name === 'bloom') {
      const base = 523.25; // C5 pentatonic rise
      [0, 2, 4, 7].forEach(function (semi, i) {
        bell(t + i * 0.16, base * Math.pow(2, semi / 12), 1.8 - i * 0.2, 0.09);
      });
      noiseBurst(t, 0.9, 'bandpass', 900, 0.9, 0.05);
    } else if (name === 'root') {
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(46, t + 0.35);
      const g = ctx.createGain(); env(g, t, 0.14, 0.4, 0.02);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.5);
      for (let i = 0; i < 3; i++) noiseBurst(t + 0.05 + i * 0.07, 0.12, 'bandpass', 2200 + Math.random() * 1500, 1.2, 0.05);
    }
  }

  function setEnabled(on) {
    init(); if (!ctx) return;
    enabled = on;
    if (ctx.state === 'suspended') ctx.resume();
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), ctx.currentTime);
    master.gain.linearRampToValueAtTime(on ? 0.9 : 0.0001, ctx.currentTime + (on ? 1.2 : 0.4));
    try { localStorage.setItem('vn-sound', on ? 'on' : 'off'); } catch (e) {}
    const pill = document.getElementById('sound');
    if (pill) { pill.textContent = 'Sound · ' + (on ? 'on' : 'off'); pill.setAttribute('aria-pressed', on ? 'true' : 'false'); }
  }

  window.VNAUDIO = {
    toggle: function () { setEnabled(!enabled); },
    event: event,
    isOn: function () { return enabled; },
    clock: function () { return ctx ? ctx.currentTime : -1; }
  };

  const pill = document.getElementById('sound');
  if (pill) {
    pill.addEventListener('click', function () { window.VNAUDIO.toggle(); });
    pill.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.VNAUDIO.toggle(); } });
    let want = false;
    try { want = localStorage.getItem('vn-sound') === 'on'; } catch (e) {}
    if (want) {
      const arm = function () { setEnabled(true); window.removeEventListener('pointerdown', arm); };
      window.addEventListener('pointerdown', arm);
    }
  }
})();
