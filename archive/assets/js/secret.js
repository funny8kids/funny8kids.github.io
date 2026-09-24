/* 秘密关卡：口令 2026 解锁后揭示（隐藏小游戏）
   复用 main.js 的 f8k-unlock 事件；三盏品牌色灯按序点亮，成则揭示 + 粒子迸发 */
(function () {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sec = document.getElementById('secret');
  if (!sec) return;

  const reveal = () => {
    sec.classList.add('is-open');
    sec.setAttribute('aria-hidden', 'false');
    if (!reduced) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else sec.scrollIntoView({ behavior: 'auto', block: 'start' });
  };

  /* 粒子迸发（复用品牌斜线/像素语言，transform/opacity 合成层，零布局抖动） */
  const burst = () => {
    if (reduced) return;
    const host = sec.querySelector('.secret__stage') || sec;
    const colors = ['var(--accent)', 'var(--accent-mint)', 'var(--accent-sun)'];
    for (let i = 0; i < 30; i++) {
      const sp = document.createElement('span');
      sp.className = 'secret-spark';
      const a = Math.random() * Math.PI * 2;
      const dist = 40 + Math.random() * 90;
      sp.style.setProperty('--dx', (Math.cos(a) * dist).toFixed(0) + 'px');
      sp.style.setProperty('--dy', (Math.sin(a) * dist + 130 + Math.random() * 70).toFixed(0) + 'px');
      sp.style.setProperty('--r', (Math.random() * 360 | 0) + 'deg');
      sp.style.background = colors[(Math.random() * colors.length) | 0];
      sp.style.left = '50%';
      sp.style.top = '38%';
      host.appendChild(sp);
      setTimeout(() => sp.remove(), 950);
    }
  };

  const gate = sec.querySelector('.secret__gate');
  if (gate) {
    const seq = (gate.dataset.seq || '0,1,2').split(',').map(Number);
    const pads = [...gate.querySelectorAll('.secret__pad')];
    let step = 0;
    const done = () => {
      gate.classList.add('is-done');
      const msg = sec.querySelector('.secret__msg');
      if (msg) msg.classList.add('is-on');
      if (window.__f8kSound) window.__f8kSound(880, .22, 'triangle');
      burst();
    };
    pads.forEach((p) => p.addEventListener('click', () => {
      const idx = pads.indexOf(p);
      if (idx === seq[step]) {
        p.classList.add('is-lit');
        step++;
        if (window.__f8kSound) window.__f8kSound(440 + step * 130, .1, 'sine');
        if (step >= seq.length) done();
      } else {
        step = 0;
        pads.forEach((x) => x.classList.remove('is-lit'));
        gate.classList.remove('is-wrong');
        void gate.offsetWidth; /* 重启抖动 */
        gate.classList.add('is-wrong');
        if (window.__f8kSound) window.__f8kSound(120, .18, 'sawtooth');
      }
    }), { passive: true });
  }

  document.addEventListener('f8k-unlock', reveal);
})();
