/* =========================================================
   F8K® — 紫罗兰花园 · 落花瓣氛围层（Violet Evergarden 母题）
   轻量、零依赖、纯 Canvas 2D：
   - 懒启动（监听 f8k-idle，同其他重资源模块）
   - 颜色读主题变量，f8k-theme 切换时同步重染
   - 微风随光标（仅精细指针），口令解锁 f8k-unlock 时来一阵「信风」
   - 性能纪律：DPR≤2、花瓣数按视口封顶、后台暂停、减少动效直接退出
   ========================================================= */
(() => {
  'use strict';

  const canvas = document.getElementById('petalsCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (reduced) { canvas.remove(); return; }

  const DPR = Math.min(window.devicePixelRatio || 1, 2);

  /* ---------- 配色：鸢尾紫 / 干枯玫瑰 / 镀金（读主题变量，暗色自动亮化） ---------- */
  const hexToRgb = (h) => {
    const m = h.replace('#', '').trim();
    const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
    const n = parseInt(full, 16);
    return isNaN(n) ? null : [n >> 16 & 255, n >> 8 & 255, n & 255];
  };
  const rgba = (rgb, a) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a.toFixed(3)})`;

  let PALETTE = []; // [{rgb, w}] w 为权重
  const readPalette = () => {
    const s = getComputedStyle(document.documentElement);
    const pick = (v, fb) => hexToRgb(s.getPropertyValue(v).trim() || fb);
    const iris = pick('--accent', '#6b56d3');
    const rose = pick('--accent-mint', '#b5657f');
    const gold = pick('--accent-sun', '#c19a44');
    PALETTE = [
      iris && { rgb: iris, w: 5 },
      rose && { rgb: rose, w: 5 },
      gold && { rgb: gold, w: 2 },
    ].filter(Boolean);
  };
  readPalette();
  const pickColor = () => {
    let total = 0;
    for (const c of PALETTE) total += c.w;
    let r = Math.random() * total;
    for (const c of PALETTE) { if ((r -= c.w) <= 0) return c.rgb; }
    return PALETTE[0].rgb;
  };

  /* ---------- 花瓣池 ---------- */
  let petals = [];
  let W = 0, H = 0;

  const makePetal = (spawnTop) => {
    const len = 7 + Math.random() * 13;              // 花瓣长度（近大远小）
    const depth = Math.random();                       // 0 远 → 1 近
    const size = len * (0.55 + depth * 0.7);
    const rgb = pickColor();
    return {
      x: Math.random() * W,
      y: spawnTop ? -size * 2 - Math.random() * H * 0.3 : Math.random() * H,
      size,
      rgb,
      depth,
      alpha: 0.28 + depth * 0.38,                     // 远的更淡
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 1.4,                // 自旋
      vy: 10 + depth * 26 + Math.random() * 14,       // 下落（px/s）
      swayAmp: 6 + depth * 16,
      swayFreq: 0.4 + Math.random() * 0.9,
      phase: Math.random() * Math.PI * 2,
      gust: 0,
    };
  };

  const seed = () => {
    const area = W * H;
    const n = Math.round(Math.min(26, Math.max(14, area / 48000)));
    petals = Array.from({ length: n }, () => makePetal(false));
  };

  const resize = () => {
    W = canvas.clientWidth || window.innerWidth;
    H = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    seed();
  };

  /* ---------- 微风：光标轻推（仅精细指针，非常克制） ---------- */
  let windX = 0, windY = 0;
  if (finePointer) {
    window.addEventListener('mousemove', (e) => {
      windX = (e.clientX / W - 0.5) * 2;
      windY = (e.clientY / H - 0.5) * 2;
    }, { passive: true });
    window.addEventListener('mouseleave', () => { windX = 0; windY = 0; });
  }

  /* ---------- 绘制：一片泪滴形花瓣 ---------- */
  const drawPetal = (p) => {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = rgba(p.rgb, 1);
    const L = p.size, w = L * 0.5;
    ctx.beginPath();
    ctx.moveTo(0, -L);
    ctx.bezierCurveTo(w * 0.9, -L * 0.42, w * 0.95, L * 0.28, 0, L * 0.55);
    ctx.bezierCurveTo(-w * 0.95, L * 0.28, -w * 0.9, -L * 0.42, 0, -L);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  let gust = 0; // 0..1 信风（口令解锁触发）
  const step = (dt, t) => {
    gust = Math.max(0, gust - dt / 2.2);
    for (const p of petals) {
      const sway = Math.sin(t * p.swayFreq + p.phase) * p.swayAmp;
      const lift = gust * 70 * p.depth;                 // 信风把花瓣向上托起
      p.y += (p.vy - lift) * dt;
      p.x += (sway + windX * (6 + p.depth * 16)) * dt;
      p.rot += (p.vr + gust * p.depth * 2.4) * dt;
      // 出界回收：掉到底 / 吹出左右都回到顶部重生
      if (p.y > H + p.size * 2 || p.x < -p.size * 3 || p.x > W + p.size * 3) {
        Object.assign(p, makePetal(true));
      }
    }
  };

  const draw = () => {
    ctx.clearRect(0, 0, W, H);
    for (const p of petals) drawPetal(p);
  };

  /* ---------- 运行循环（后台暂停 / 前台恢复） ---------- */
  let raf = null, running = false, started = false;
  const stop = () => { if (raf) cancelAnimationFrame(raf); raf = null; running = false; };
  const run = () => {
    if (running || !started || document.hidden) return;
    running = true;
    let last = performance.now();
    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      step(dt, now / 1000);
      draw();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  };

  document.addEventListener('visibilitychange', () => {
    document.hidden ? stop() : run();
  });

  /* ---------- 懒启动（同 hero3d / playground 纪律）+ 兜底 ---------- */
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

  /* ---------- 主题切换：重新取色并给现有花瓣重染 ---------- */
  document.addEventListener('f8k-theme', () => {
    readPalette();
    for (const p of petals) p.rgb = pickColor();
  });

  /* ---------- 彩蛋：口令解锁（f8k-unlock）时，来一阵紫罗兰「信风」 ---------- */
  document.addEventListener('f8k-unlock', () => { gust = 1; });
  window.F8K_PETALS = { gust: () => { gust = 1; } };
})();
