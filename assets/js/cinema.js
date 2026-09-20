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

  const hoverSel = 'nav a,.chip,.btn,.pill,.lang,.gal__cell,a.brand,[data-magnetic]';
  let lastHover = null;
  document.addEventListener('pointerover', (e) => {
    const el = e.target && e.target.closest ? e.target.closest(hoverSel) : null;
    if (el && el !== lastHover) { lastHover = el; sfx.tick(); }
    if (!el) lastHover = null;
  }, { passive: true });

  document.addEventListener('pointerdown', () => { ac(); }, { passive: true });
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

  window.addEventListener('vn:ready', () => { sfx.swell(); });

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

  window.__vnCinema = { sfx };
})();
