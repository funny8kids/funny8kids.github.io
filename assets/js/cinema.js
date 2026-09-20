/* LUMEN VIOLA — cinema layer: procedural sound design + chapter veil transitions */
(function () {
  'use strict';
  const gsap = window.gsap;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ============ sound (WebAudio, zero assets) ============ */
  let ctx = null, master = null;
  let on = true;
  try { on = localStorage.getItem('vn-sound') !== 'off'; } catch (e) { /* private mode */ }

  function ac() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
      master = ctx.createGain();
      master.gain.value = on ? 0.16 : 0;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(f0, dur, type, vol, delay, f1) {
    if (!on) return;
    const c = ac();
    if (!c) return;
    const t = c.currentTime + (delay || 0);
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.014);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.06);
  }

  function noise(dur, f0, f1, vol) {
    if (!on) return;
    const c = ac();
    if (!c) return;
    const n = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 1.6);
    const src = c.createBufferSource();
    src.buffer = buf;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.1;
    bp.frequency.setValueAtTime(f0, c.currentTime);
    bp.frequency.exponentialRampToValueAtTime(f1, c.currentTime + dur);
    const g = c.createGain();
    g.gain.value = vol;
    src.connect(bp);
    bp.connect(g);
    g.connect(master);
    src.start();
  }

  const sfx = {
    tick() { tone(1500, 0.05, 'triangle', 0.028, 0, 950); },
    plink() { tone(880, 0.16, 'sine', 0.05); tone(1318.5, 0.12, 'sine', 0.03, 0.018); },
    whoosh() { noise(0.46, 320, 2800, 0.09); },
    swell() {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.66 - i * 0.08, 'sine', 0.03, i * 0.085));
      noise(0.85, 170, 1900, 0.045);
    },
  };

  /* ============ 批次B③ 真实环境音（Freesound CC0 · 懒加载 · 章节交叉淡入淡出） ============ */
  const AMBS = {
    wind: { url: 'assets/audio/amb-wind.mp3', vol: 0.5, loop: true },
    rain: { url: 'assets/audio/amb-rain.mp3', vol: 0.55, loop: true },
    bees: { url: 'assets/audio/amb-bees.mp3', vol: 0.42, loop: true },
    glass: { url: 'assets/audio/fx-glass.mp3', vol: 0.5 },
    thunder: { url: 'assets/audio/fx-thunder.mp3', vol: 0.85 },
  };
  const ambBufs = {};
  const ambWaiters = {};
  function ambLoad(k, cb) {
    if (ambBufs[k]) { if (cb) cb(); return; }
    if (ambWaiters[k]) { if (cb) ambWaiters[k].push(cb); return; }
    ambWaiters[k] = cb ? [cb] : [];
    fetch(AMBS[k].url).then((r) => r.arrayBuffer()).then((b) => ac().decodeAudioData(b))
      .then((buf) => { ambBufs[k] = buf; const w = ambWaiters[k]; delete ambWaiters[k]; w.forEach((f) => f()); })
      .catch(() => { delete ambWaiters[k]; });
  }
  let loopKey = null, loopWant = 'wind', loopSrc = null, loopGain = null;
  let thunderWant = false, thunderT = 0, ambArmed = false;
  function loopStop(fade) {
    if (!loopSrc) return;
    const g = loopGain, n = loopSrc;
    loopSrc = loopGain = loopKey = null;
    try { g.gain.cancelScheduledValues(ctx.currentTime); g.gain.setValueAtTime(g.gain.value, ctx.currentTime); g.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + fade); } catch (e) { /* noop */ }
    setTimeout(() => { try { n.stop(); } catch (e) { /* noop */ } }, fade * 1000 + 150);
  }
  function loopStart(k) {
    if (!on || !ambBufs[k] || loopKey === k) return;
    const c = ac();
    if (!c) return;
    loopStop(1.1);
    const src = c.createBufferSource();
    src.buffer = ambBufs[k];
    src.loop = true;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, c.currentTime);
    g.gain.linearRampToValueAtTime(AMBS[k].vol, c.currentTime + 1.5);
    src.connect(g);
    g.connect(master);
    src.start();
    loopKey = k; loopSrc = src; loopGain = g;
  }
  function setLoop(k) {
    loopWant = k;
    if (!k) { loopStop(1.2); return; }
    if (!on || !ambArmed) return;
    ambLoad(k, () => loopStart(k));
  }
  function oneShot(k) {
    if (!on) return;
    ambLoad(k, () => {
      const c = ac();
      if (!c || !ambBufs[k]) return;
      const src = c.createBufferSource();
      src.buffer = ambBufs[k];
      const g = c.createGain();
      g.gain.value = AMBS[k].vol;
      src.connect(g);
      g.connect(master);
      src.start();
    });
  }
  function thunderTick() {
    clearTimeout(thunderT);
    if (!thunderWant) return;
    thunderT = setTimeout(() => { if (thunderWant) { oneShot('thunder'); thunderTick(); } }, 4200 + Math.random() * 5200);
  }
  const AMB_SECTIONS = ['hero', 'garden', 'bloom3dSec', 'storm', 'gallery', 'notes'];
  const AMB_BY_ID = { hero: 'wind', garden: 'wind', bloom3dSec: 'wind', storm: 'rain', gallery: 'bees', notes: 'rain' };
  function bindAmbience() {
    if (!('IntersectionObserver' in window)) return;
    const vis = {};
    let glassDone = false;
    const io = new IntersectionObserver((ens) => {
      ens.forEach((en) => {
        // 高章节(如 gallery)相交比可能永远 <0.3，改用"覆盖半个视口"判可见
        const cover = en.intersectionRect.height >= Math.min(en.boundingClientRect.height, innerHeight * 0.45);
        vis[en.target.id] = en.isIntersecting && (en.intersectionRatio >= 0.3 || cover);
      });
      if (vis.storm) {
        if (!thunderWant) { thunderWant = true; oneShot('thunder'); thunderTick(); }
      } else if (thunderWant) { thunderWant = false; clearTimeout(thunderT); }
      let want;
      if (vis.storm) want = 'rain';
      else {
        want = null;
        for (let i = AMB_SECTIONS.length - 1; i >= 0; i--) {
          const id = AMB_SECTIONS[i];
          if (id !== 'storm' && vis[id]) { want = AMB_BY_ID[id]; break; }
        }
      }
      if (vis.bloom3dSec && !glassDone) { glassDone = true; oneShot('glass'); }
      if (want !== loopWant) setLoop(want);
    }, { threshold: Array.from({ length: 21 }, (_, i) => i / 20) });
    AMB_SECTIONS.forEach((id) => { const el = document.getElementById(id); if (el) io.observe(el); });
  }

  const hoverSel = 'nav a,.chip,.btn,.pill,.lang,.gal__cell,a.brand,[data-magnetic]';
  let lastHover = null;
  document.addEventListener('pointerover', (e) => {
    const el = e.target && e.target.closest ? e.target.closest(hoverSel) : null;
    if (el && el !== lastHover) { lastHover = el; sfx.tick(); }
    if (!el) lastHover = null;
  }, { passive: true });

  document.addEventListener('pointerdown', () => { ac(); if (!ambArmed) { ambArmed = true; setLoop(loopWant); if (thunderWant) thunderTick(); } }, { passive: true });
  document.addEventListener('click', (e) => {
    const el = e.target && e.target.closest ? e.target.closest('a,button,.chip') : null;
    if (el) sfx.plink();
  }, { passive: true });

  const sndBtn = document.getElementById('soundToggle');
  function paintSnd() {
    if (!sndBtn) return;
    sndBtn.classList.toggle('is-off', !on);
    sndBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (master) master.gain.value = on ? 0.16 : 0;
  }
  if (sndBtn) {
    sndBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      on = !on;
      try { localStorage.setItem('vn-sound', on ? 'on' : 'off'); } catch (err) { /* noop */ }
      ac();
      if (on) { ambArmed = true; setLoop(loopWant); if (thunderWant) thunderTick(); }
      else { loopStop(0.5); clearTimeout(thunderT); }
      paintSnd();
      if (on) sfx.plink();
    });
  }
  paintSnd();

  /* ============ chapter veil sweep + rail flip ============ */
  const num = document.getElementById('chapterN');
  const ttl = document.getElementById('chapterT');
  const rail = document.querySelector('.chapter-rail');
  const veil = document.getElementById('veil');
  let lastCh = num ? num.textContent.trim() : null;
  let lockUntil = 0;

  function sweep() {
    sfx.whoosh();
    if (reduceMotion || !gsap) return;
    const now = performance.now();
    if (now < lockUntil) return;
    lockUntil = now + 1400;
    if (veil) {
      gsap
        .timeline({ onComplete() { gsap.set(veil, { autoAlpha: 0 }); } })
        .set(veil, { autoAlpha: 1, clipPath: 'inset(0 100% 0 0)' })
        .to(veil, { clipPath: 'inset(0 -12% 0 0)', duration: 0.42, ease: 'power2.in' })
        .to(veil, { clipPath: 'inset(0 0 0 112%)', duration: 0.55, ease: 'power2.out' });
    }
    if (rail) {
      gsap.fromTo(
        [num, ttl],
        { yPercent: 60, opacity: 0, filter: 'blur(5px)' },
        { yPercent: 0, opacity: 1, filter: 'blur(0px)', duration: 0.5, ease: 'power3.out', stagger: 0.06 }
      );
    }
  }

  if (num && 'MutationObserver' in window) {
    new MutationObserver(() => {
      const cur = num.textContent.trim();
      if (cur !== lastCh) { lastCh = cur; sweep(); }
    }).observe(num, { childList: true, characterData: true, subtree: true });
  }

  window.addEventListener('vn:ready', () => { sfx.swell(); bindAmbience(); });

  /* ============ light / dark theme ============ */
  const rootEl = document.documentElement;
  const themeBtn = document.getElementById('themeToggle');
  function setTheme(t, persist) {
    rootEl.setAttribute('data-theme', t);
    if (persist) { try { localStorage.setItem('vn-theme', t); } catch (e) { /* noop */ } }
    if (themeBtn) themeBtn.textContent = t === 'light' ? '☾' : '☀';
    window.dispatchEvent(new CustomEvent('vn:theme', { detail: { theme: t } }));
  }
  setTheme(rootEl.getAttribute('data-theme') || 'dark', false);
  if (themeBtn) {
    themeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setTheme(rootEl.getAttribute('data-theme') === 'light' ? 'dark' : 'light', true);
      sfx.plink();
    });
  }

  window.__vnCinema = {
    sfx,
    amb: () => ({ on, armed: ambArmed, want: loopWant, playing: loopKey, bufs: Object.keys(ambBufs), thunder: thunderWant }),
  };
})();
