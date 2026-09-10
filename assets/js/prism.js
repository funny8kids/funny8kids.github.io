/* =========================================================
   F8K® — 紫罗兰花园 · 棱镜折射背景（React Bits <Prism /> 原生移植，MIT 思路）
   轻量、零依赖、纯 Canvas 2D：
   - 三道「光束」缓慢漂移，各自在棱镜点散成鸢尾紫 → 浅紫 → 干枯玫瑰 → 镀金的扇形光谱
   - 颜色读主题变量（f8k-theme 同步重染），暗色自动亮化
   - 光标视差（仅精细指针）、口令解锁 f8k-unlock 时整体「闪亮」一次
   - 性能纪律：DPR≤2、后台暂停、减少动效退出、懒启动（f8k-idle）
   ========================================================= */
(() => {
  'use strict';

  const canvas = document.getElementById('prismCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (reduced) { canvas.remove(); return; }

  const DPR = Math.min(window.devicePixelRatio || 1, 2);

  const hexToRgb = (h) => {
    const m = String(h).replace('#', '').trim();
    const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
    const n = parseInt(full, 16);
    return isNaN(n) ? null : [n >> 16 & 255, n >> 8 & 255, n & 255];
  };
  const rgba = (rgb, a) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;

  let C = { iris: [107, 86, 211], peri: [185, 168, 255], rose: [181, 101, 127], gold: [193, 154, 68] };
  const readColors = () => {
    const s = getComputedStyle(document.documentElement);
    const pick = (v, fb) => hexToRgb(s.getPropertyValue(v).trim() || '') || fb;
    C.iris = pick('--accent', C.iris);
    C.peri = pick('--accent-2', C.peri);
    C.rose = pick('--accent-mint', C.rose);
    C.gold = pick('--accent-sun', C.gold);
  };
  readColors();
  const SPECTRUM = [C.iris, C.peri, C.rose, C.gold];

  let W = 0, H = 0, D = 1;
  const resize = () => {
    W = canvas.clientWidth || window.innerWidth;
    H = canvas.clientHeight || window.innerHeight;
    D = Math.max(W, H);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  };

  /* ---------- 三道棱镜光束：位置 / 方向 / 展开角 / 速度 ---------- */
  const beams = [
    { px: 0.30, py: 0.40, ang: -Math.PI * 0.78, spread: 0.78, len: 0.72, speed: 0.05, phase: 0.0, rays: 5 },
    { px: 0.74, py: 0.60, ang: 0.12,               spread: 0.66, len: 0.70, speed: 0.04, phase: 2.1, rays: 4 },
    { px: 0.56, py: 0.22, ang: Math.PI * 0.5,       spread: 0.90, len: 0.80, speed: 0.06, phase: 4.2, rays: 5 },
  ];

  /* ---------- 光标视差（非常克制） ---------- */
  let mx = 0, my = 0;
  if (finePointer) {
    window.addEventListener('mousemove', (e) => {
      mx = (e.clientX / W - 0.5);
      my = (e.clientY / H - 0.5);
    }, { passive: true });
  }

  let flare = 0; // 0..1 口令解锁的「闪亮」
  const boost = () => { flare = 1; };

  /* ---------- 画一条柔光射线（分层描边模拟光晕，免 shadowBlur 开销） ---------- */
  const drawRay = (x0, y0, x1, y1, rgb, alpha) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, rgba(rgb, alpha));
    g.addColorStop(1, rgba(rgb, 0));
    ctx.strokeStyle = g;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    // 三层叠加：宽淡 → 窄亮，形成柔光
    ctx.lineWidth = 14; ctx.globalAlpha = 0.35; ctx.stroke();
    ctx.lineWidth = 5;  ctx.globalAlpha = 0.55; ctx.stroke();
    ctx.lineWidth = 1.6; ctx.globalAlpha = 0.9; ctx.stroke();
    ctx.globalAlpha = 1;
  };

  const draw = (t) => {
    ctx.clearRect(0, 0, W, H);
    flare = Math.max(0, flare - 0.0035);
    const bright = 1 + flare * 1.6;

    for (const b of beams) {
      const a = b.ang + t * b.speed;
      // 棱镜点：基础位置 + 缓慢小轨道 + 光标视差
      const ox = Math.cos(a * 0.35 + b.phase) * D * 0.03;
      const oy = Math.sin(a * 0.5 + b.phase) * D * 0.02;
      const cx = b.px * W + ox + mx * 26;
      const cy = b.py * H + oy + my * 20;

      // 入射线：从对侧打来的微弱白光
      const srcX = cx - Math.cos(a) * b.len * D;
      const srcY = cy - Math.sin(a) * b.len * D;
      drawRay(srcX, srcY, cx, cy, C.peri, 0.10 * bright);

      // 折射扇：棱镜点散出 N 条彩色光线
      const n = b.rays;
      for (let k = 0; k < n; k++) {
        const f = n === 1 ? 0.5 : k / (n - 1);
        const ra = a + (f - 0.5) * b.spread;
        const bend = Math.sin(a * 1.7 + k * 1.3 + t * 0.12) * 0.14; // 轻微摇曳
        const ex = cx + Math.cos(ra + bend) * b.len * D;
        const ey = cy + Math.sin(ra + bend) * b.len * D;
        drawRay(cx, cy, ex, ey, SPECTRUM[k % 4], (0.10 + 0.05 * Math.sin(t * 0.7 + k)) * bright);
      }

      // 棱镜点光核
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, D * 0.03);
      g.addColorStop(0, rgba(C.peri, 0.5 * bright));
      g.addColorStop(1, rgba(C.peri, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, D * 0.03, 0, Math.PI * 2); ctx.fill();
    }
  };

  /* ---------- 运行循环（后台暂停 / 前台恢复） ---------- */
  let raf = null, running = false, started = false;
  const stop = () => { if (raf) cancelAnimationFrame(raf); raf = null; running = false; };
  const run = () => {
    if (running || !started || document.hidden) return;
    running = true;
    let last = performance.now(), t = 0;
    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      draw(t);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  };

  document.addEventListener('visibilitychange', () => {
    document.hidden ? stop() : run();
  });

  const start = () => {
    if (started) return;
    started = true;
    resize();
    window.addEventListener('resize', resize, { passive: true });
    canvas.classList.add('is-on');
    run();
  };
  document.addEventListener('f8k-idle', start);
  setTimeout(start, 6000);

  document.addEventListener('f8k-theme', readColors);
  document.addEventListener('f8k-unlock', boost);
  window.F8K_PRISM = { boost };
})();
