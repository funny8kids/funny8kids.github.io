/* =========================================================
   F8K® — 彩蛋 · 时间的摆（Double Pendulum × Time Scale）
   单景、无多场景、无计分、无简单几何体 —— 只留一件「墨笔」。
   · 物理：brm.io/matter-js/demo/#doublePendulum 逐项同参
     （低重力 0.002、同组不互撞、frictionAir 0、chain 0.9/0/0.7、
       首臂销钉 + 次臂 -0.3π 起手）。
   · 渲染：摆臂画成渐细的墨色笔触（不是矩形），摆锤是一点镀金
     光晕，尾迹按速度由鸢尾紫渐染至镀金 —— 混沌如墨迹晕染。
   · 时间：#timescale 思路 —— 时间尺度旋钮在 0.1×–2× 间平滑缓动
     （bullet-time 慢镜），静置即可、不喧哗。
   ========================================================= */
(() => {
  'use strict';

  const canvas = document.getElementById('playCanvas');
  if (!canvas) return;
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const loadScript = (src) => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });

  document.addEventListener('f8k-idle', () => {
    // 与 pendulums.js 共享同一个加载 promise，避免重复注入脚本
    window.__f8kMatter = window.__f8kMatter || loadScript('assets/vendor/matter.min.js');
    window.__f8kMatter.then(init).catch(() => { /* 静默放弃 */ });
  }, { once: true });

  /* ---------- 题签文案（EN/ZH 内联，随 f8k-lang 重渲染） ---------- */
  const TXT = {
    en: { name: 'Double Pendulum', hint: 'drag an arm · dilate time' },
    zh: { name: '双摆', hint: '拽动摆臂 · 拉伸时间' }
  };

  function init() {
    if (!window.Matter) return;
    const M = window.Matter;
    const { Engine, Bodies, Body, Composite, Composites, Constraint, Mouse, MouseConstraint } = M;

    try {
      const ctx = canvas.getContext('2d');
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const WORLD_W = 800, WORLD_H = 600;
      const TWO_PI = Math.PI * 2;
      const LENGTH = 200;
      let W = 0, H = 0, S = 1, OX = 0, OY = 0;

      /* ---------- 色板（读 CSS 变量，随明暗主题联动） ---------- */
      const C = {};
      const readColors = () => {
        const s = getComputedStyle(document.documentElement);
        const v = (n, fb) => (s.getPropertyValue(n) || '').trim() || fb;
        C.ink = v('--ink', '#241b2f');
        C.muted = v('--muted', '#7e7484');
        C.accent = v('--accent', '#6b56d3');
        C.sun = v('--accent-sun', '#c19a44');
      };
      const toRgb = (c) => {
        const h = String(c).replace('#', '');
        const p = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
        return [parseInt(p.slice(0, 2), 16), parseInt(p.slice(2, 4), 16), parseInt(p.slice(4, 6), 16)];
      };
      const mix = (a, b, t) => {
        const A = toRgb(a), B = toRgb(b);
        return '#' + A.map((x, i) => Math.round(x + (B[i] - x) * t).toString(16).padStart(2, '0')).join('');
      };
      const rgba = (c, a) => 'rgba(' + toRgb(c).join(',') + ',' + a + ')';
      readColors();

      /* ---------- 引擎 + 双摆（官方同参） ---------- */
      const engine = Engine.create({ enableSleeping: false });
      engine.gravity.y = 1;
      engine.gravity.scale = 0.002; // 官方低重力：缓慢、优雅

      const mouse = Mouse.create(canvas);
      mouse.pixelRatio = dpr; // 与 canvas 后备缓冲 dpr 放大保持一致（HiDPI 命中校正）
      const mc = MouseConstraint.create(engine, {
        mouse,
        constraint: { stiffness: 0.2, angularStiffness: 0, render: { visible: false } }
      });
      Composite.add(engine.world, mc);

      const group = Body.nextGroup(true);
      const pendulum = Composites.stack(350, 160, 2, 1, -20, 0, (x, y) =>
        Bodies.rectangle(x, y, LENGTH, 22, { collisionFilter: { group }, frictionAir: 0, chamfer: 5 }));
      Composites.chain(pendulum, 0.45, 0, -0.45, 0, {
        stiffness: 0.9, length: 0, angularStiffness: 0.7, render: { visible: false }
      });
      Composite.add(pendulum, Constraint.create({
        bodyB: pendulum.bodies[0],
        pointB: { x: -LENGTH * 0.42, y: 0 },
        pointA: { x: pendulum.bodies[0].position.x - LENGTH * 0.42, y: pendulum.bodies[0].position.y },
        stiffness: 0.9, length: 0, render: { visible: false }
      }));
      const lowerArm = pendulum.bodies[1];
      Body.rotate(lowerArm, -Math.PI * 0.3, { x: lowerArm.position.x - 100, y: lowerArm.position.y });
      Composite.add(engine.world, pendulum);

      const pivot = { x: 350 - LENGTH * 0.42, y: 160 };
      const tipOf = (body) => {
        const h = LENGTH / 2;
        return { x: body.position.x + Math.cos(body.angle) * h, y: body.position.y + Math.sin(body.angle) * h };
      };
      const trail = [];

      /* ---------- 时间尺度旋钮（bullet-time 平滑缓动） ---------- */
      let timeScale = 1, timeScaleTarget = 1;
      const timeRange = document.getElementById('playTime');
      const timeVal = document.getElementById('playTimeVal');
      const paintTime = () => { if (timeVal) timeVal.textContent = '×' + timeScaleTarget.toFixed(2); };
      if (timeRange) {
        timeRange.addEventListener('input', () => {
          timeScaleTarget = parseFloat(timeRange.value);
          paintTime();
        });
      }
      paintTime();

      /* ---------- 测量 / 缩放 ---------- */
      const measure = () => {
        W = canvas.clientWidth;
        H = canvas.clientHeight;
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        S = Math.min(W / WORLD_W, H / WORLD_H);
        OX = (W - WORLD_W * S) / 2;
        OY = (H - WORLD_H * S) / 2;
        mc.mouse.scale = { x: 1 / S, y: 1 / S };
        mc.mouse.offset = { x: -OX / S, y: -OY / S };
      };

      /* ---------- 渲染：墨笔摆臂 + 镀金摆锤 + 尾迹 ---------- */
      const armStroke = (body, wA, wB) => {
        const dir = { x: Math.cos(body.angle), y: Math.sin(body.angle) };
        const h = LENGTH / 2;
        const ax = body.position.x - dir.x * h, ay = body.position.y - dir.y * h;
        const bx = body.position.x + dir.x * h, by = body.position.y + dir.y * h;
        const px = -dir.y, py = dir.x;
        ctx.fillStyle = C.ink;
        ctx.beginPath();
        ctx.moveTo(ax + px * wA / 2, ay + py * wA / 2);
        ctx.lineTo(ax - px * wA / 2, ay - py * wA / 2);
        ctx.lineTo(bx - px * wB / 2, by - py * wB / 2);
        ctx.lineTo(bx + px * wB / 2, by + py * wB / 2);
        ctx.closePath();
        ctx.fill();
      };

      const draw = () => {
        ctx.setTransform(dpr * S, 0, 0, dpr * S, dpr * OX, dpr * OY);
        ctx.clearRect(0, 0, WORLD_W, WORLD_H);

        // 销钉
        ctx.fillStyle = C.muted;
        ctx.beginPath(); ctx.arc(pivot.x, pivot.y, 3.5, 0, TWO_PI); ctx.fill();

        // 摆臂（销钉端粗 → 自由端细）
        armStroke(pendulum.bodies[0], 9, 4);
        armStroke(pendulum.bodies[1], 4, 2.5);

        // 镀金摆锤（光晕 + 芯）
        const tip = tipOf(lowerArm);
        const glow = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, 18);
        glow.addColorStop(0, rgba(C.sun, 0.55));
        glow.addColorStop(1, rgba(C.sun, 0));
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(tip.x, tip.y, 18, 0, TWO_PI); ctx.fill();
        ctx.fillStyle = C.sun;
        ctx.beginPath(); ctx.arc(tip.x, tip.y, 4.5, 0, TWO_PI); ctx.fill();

        // 尾迹：慢→鸢尾紫，快→镀金，逐帧淡出
        const n = trail.length;
        for (let i = 0; i < n; i += 2) {
          const p = trail[i];
          const t = Math.min(1, p.speed / 12);
          ctx.globalAlpha = Math.max(0, 1 - i / n) * 0.9;
          ctx.fillStyle = mix(C.accent, C.sun, t);
          ctx.fillRect(p.x, p.y, 1.8, 1.8);
        }
        ctx.globalAlpha = 1;
      };

      /* ---------- 循环：真实时间步长 × 时间尺度，离屏零计算 ---------- */
      let running = false, inView = false, rafId = 0, last = 0;
      const loop = (ts) => {
        if (!running) return;
        if (last === 0) last = ts;
        const delta = Math.min(ts - last, 33.3);
        last = ts;
        timeScale += (timeScaleTarget - timeScale) * 0.12; // 平滑缓动（bullet-time）
        Engine.update(engine, delta * timeScale);
        trail.unshift({ x: tipOf(lowerArm).x, y: tipOf(lowerArm).y, speed: lowerArm.speed });
        if (trail.length > 1600) trail.pop();
        draw();
        rafId = requestAnimationFrame(loop);
      };
      const setRunning = (on) => {
        if (reducedMotion) { draw(); return; } // 降级：只渲染单帧
        const want = on && inView && !document.hidden;
        if (want === running) return;
        running = want;
        last = 0;
        if (running) rafId = requestAnimationFrame(loop);
        else cancelAnimationFrame(rafId);
      };
      new IntersectionObserver((en) => {
        inView = en[0].isIntersecting;
        setRunning(true);
      }, { rootMargin: '120px' }).observe(canvas);
      document.addEventListener('visibilitychange', () => setRunning(true));
      if (window.ResizeObserver) new ResizeObserver(() => { measure(); draw(); }).observe(canvas);

      /* ---------- 题签 / 语言 / 主题 / resize ---------- */
      const lang = () => (window.F8K_LANG === 'zh' ? 'zh' : 'en');
      const nameEl = document.getElementById('playName');
      const hintEl = document.getElementById('playHint');
      const paintMeta = () => {
        if (nameEl) nameEl.textContent = TXT[lang()].name;
        if (hintEl) hintEl.textContent = TXT[lang()].hint;
      };
      paintMeta();
      document.addEventListener('f8k-lang', paintMeta);
      document.addEventListener('f8k-theme', () => { readColors(); draw(); });
      let rsz;
      window.addEventListener('resize', () => {
        clearTimeout(rsz);
        rsz = setTimeout(() => { measure(); draw(); }, 200);
      });

      measure();
      draw();
      window.__f8kPlay = {
        scene: () => 'pendulum',
        bodies: () => Composite.allBodies(engine.world).filter((b) => !b.isStatic).length,
        constraints: () => Composite.allConstraints(engine.world).length,
        timeScale: () => timeScaleTarget,
        gravity: () => engine.gravity.y,
        scale: () => S
      }; // 调试验证标记
    } catch (e) {
      canvas.style.display = 'none';
    }
  }
})();
