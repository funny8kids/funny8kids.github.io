/* =========================================================
   F8K® — 技能钟摆（学 jiejoe.com 的技能块小物理挂件）
   每个技能列挂一个软约束（stiffness .1）钟摆：
   抓住甩出去，松手速度够快就迸出火花粒子（check_phone_speed 式反馈）。
   三个挂件共享一个 Matter 引擎（世界坐标以 1000 为槽位步长，
   互不碰撞），全休眠时零计算，离屏/后台暂停。
   ========================================================= */
(() => {
  'use strict';

  const widgets = Array.from(document.querySelectorAll('.skill-widget'));
  if (!widgets.length) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const loadScript = (src) => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });

  document.addEventListener('f8k-idle', () => {
    loadScript('assets/vendor/matter.min.js').then(init).catch(() => { /* 静默放弃 */ });
  }, { once: true });

  function init() {
    if (!window.Matter) return;
    const M = window.Matter;
    const { Engine, Bodies, Body, Composite, Constraint, Query, Sleeping } = M;
    try {
      const doc = document.documentElement;
      const STRIDE = 1000; // 每个挂件的世界坐标槽位
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      const C = {};
      const readColors = () => {
        const s = getComputedStyle(doc);
        C.accent = s.getPropertyValue('--accent').trim() || '#2c43f5';
        C.mint = s.getPropertyValue('--accent-mint').trim() || '#12b77e';
        C.sun = s.getPropertyValue('--accent-sun').trim() || '#f2a93b';
        C.ink = s.getPropertyValue('--ink').trim() || '#171512';
        C.muted = s.getPropertyValue('--muted').trim() || '#6f6c63';
      };
      readColors();
      const colorOf = (name) => name === 'mint' ? C.mint : name === 'sun' ? C.sun : C.accent;

      const engine = Engine.create({ enableSleeping: true });
      engine.gravity.y = 1;

      /* ---------- 每个挂件：锚点 + 多边形重物 + 软约束 ---------- */
      const items = widgets.map((el, i) => {
        const canvas = el.querySelector('canvas');
        if (!canvas) return null;
        const slotX = i * STRIDE;
        const shape = el.dataset.shape || 'hex';
        const color = colorOf(el.dataset.color || 'accent');
        const L = 200, R = 20, anchor = { x: slotX + L / 2, y: 30 };

        let weight;
        if (shape === 'tri') weight = Bodies.polygon(anchor.x, anchor.y + 80 + 18, 3, 22, { restitution: 0.2, friction: 0.05 });
        else if (shape === 'sqr') weight = Bodies.rectangle(anchor.x, anchor.y + 80 + 18, 44, 44, { restitution: 0.2, friction: 0.05, chamfer: { radius: 9 } });
        else weight = Bodies.polygon(anchor.x, anchor.y + 80 + 18, 6, 22, { restitution: 0.2, friction: 0.05 });

        const rope = Constraint.create({
          pointA: anchor,
          bodyB: weight,
          pointB: { x: 0, y: -18 },
          length: 80,
          stiffness: 0.1,   // jiejoe.com 同款软绳手感
          damping: 0.05
        });
        Composite.add(engine.world, [weight, rope]);

        return { el, canvas, slotX, anchor, weight, rope, color, particles: [], drag: null, lastPt: null, speed: 0 };
      }).filter(Boolean);

      if (!items.length) return;
      widgets.forEach((w) => w.classList.add('is-live'));
      // 挂件撑开 150px 高度 → 通知主脚本刷新 ScrollTrigger 测量
      document.dispatchEvent(new CustomEvent('f8k-layout'));

      const toWorld = (item, x, y) => ({ x: item.slotX + x, y });
      const toLocal = (item, p) => ({ x: p.x - item.slotX, y: p.y });
      const relPos = (canvas, e) => {
        const r = canvas.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
      };

      /* ---------- 拖拽 + 甩出测速（jiejoe 的 check_speed 式反馈） ---------- */
      items.forEach((item) => {
        const { canvas } = item;
        canvas.addEventListener('pointerdown', (e) => {
          const local = relPos(canvas, e);
          const hit = Query.point([item.weight], toWorld(item, local.x, local.y))[0];
          if (!hit) return;
          e.preventDefault();
          canvas.setPointerCapture(e.pointerId);
          Sleeping.set(hit, false);
          item.drag = { last: local, t: performance.now() };
          item.lastPt = local;
        });
        canvas.addEventListener('pointermove', (e) => {
          if (!item.drag) return;
          const local = relPos(canvas, e);
          const now = performance.now();
          const dt = Math.max(1, now - item.drag.t);
          const dx = local.x - item.drag.last.x;
          const dy = local.y - item.drag.last.y;
          item.speed = Math.hypot(dx, dy) / dt; // 世界单位/毫秒
          item.drag = { last: local, t: now };
          item.lastPt = local;
          Body.setVelocity(item.weight, { x: 0, y: 0 });
          Body.setPosition(item.weight, toWorld(item, local.x, local.y));
        });
        const release = () => {
          if (!item.drag) return;
          item.drag = null;
          if (item.speed > 0.06) { // 甩得够快 → 火花迸发
            const n = Math.min(22, Math.round(item.speed * 90));
            for (let i = 0; i < n; i++) {
              const a = Math.random() * Math.PI * 2;
              const sp = 0.12 + Math.random() * 0.3 * Math.min(1, item.speed * 6);
              item.particles.push({
                x: (item.lastPt || { x: 100, y: 110 }).x,
                y: (item.lastPt || { x: 100, y: 110 }).y,
                vx: Math.cos(a) * sp,
                vy: Math.sin(a) * sp - 0.05,
                life: 1,
                color: Math.random() < 0.7 ? item.color : (Math.random() < 0.5 ? C.sun : C.mint)
              });
            }
            if (item.el.animate) {
              item.el.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-2.5deg)' }, { transform: 'rotate(1.5deg)' }, { transform: 'rotate(0)' }], { duration: 260, easing: 'ease-out' });
            }
          }
          item.speed = 0;
        };
        canvas.addEventListener('pointerup', release);
        canvas.addEventListener('pointercancel', release);
      });

      /* ---------- 绘制（局部坐标，槽位偏移） ---------- */
      const drawWidget = (item) => {
        const ctx = item.canvas.getContext('2d');
        const w = item.canvas.clientWidth, h = item.canvas.clientHeight;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        const ox = -item.slotX;

        // 绳
        ctx.beginPath();
        ctx.moveTo(item.anchor.x + ox, item.anchor.y);
        ctx.lineTo(item.weight.position.x + ox, item.weight.position.y);
        ctx.strokeStyle = C.muted;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // 锚点
        ctx.beginPath();
        ctx.arc(item.anchor.x + ox, item.anchor.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = item.color;
        ctx.fill();
        // 重物（多边形描边填充）
        const v = item.weight.vertices;
        ctx.beginPath();
        ctx.moveTo(v[0].x + ox, v[0].y);
        for (let i = 1; i < v.length; i++) ctx.lineTo(v[i].x + ox, v[i].y);
        ctx.closePath();
        ctx.fillStyle = item.color;
        ctx.fill();
        ctx.strokeStyle = C.ink;
        ctx.lineWidth = 1.4;
        ctx.stroke();
        // 火花粒子
        for (let i = item.particles.length - 1; i >= 0; i--) {
          const p = item.particles[i];
          p.x += p.vx; p.y += p.vy; p.vy += 0.004; p.life -= 0.028;
          if (p.life <= 0) { item.particles.splice(i, 1); continue; }
          ctx.globalAlpha = Math.max(0, p.life);
          ctx.beginPath();
          ctx.arc(p.x + ox, p.y, 2.4, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      };

      /* ---------- 循环：全休眠 + 无粒子 + 无拖拽 = 零计算 ---------- */
      let running = false, inView = false, rafId = 0;
      const active = () => items.some((it) => !it.weight.isSleeping || it.drag || it.particles.length);
      const loop = () => {
        if (!running) return;
        if (active()) {
          Engine.update(engine, 1000 / 60);
          items.forEach(drawWidget);
        }
        rafId = requestAnimationFrame(loop);
      };
      const setRunning = (on) => {
        const want = on && inView && !document.hidden;
        if (want === running) return;
        running = want;
        if (running) rafId = requestAnimationFrame(loop);
        else cancelAnimationFrame(rafId);
      };
      new IntersectionObserver((en) => {
        inView = en[0].isIntersecting;
        setRunning(true);
      }, { rootMargin: '120px' }).observe(items[0].el);
      document.addEventListener('visibilitychange', () => setRunning(true));

      document.addEventListener('f8k-theme', () => {
        readColors();
        items.forEach((it) => { it.color = colorOf(it.el.dataset.color || 'accent'); drawWidget(it); });
      });

      let rsz;
      window.addEventListener('resize', () => {
        clearTimeout(rsz);
        rsz = setTimeout(() => items.forEach((it) => {
          const c = it.canvas;
          c.width = Math.round(c.clientWidth * dpr);
          c.height = Math.round(c.clientHeight * dpr);
          drawWidget(it);
        }), 200);
      });

      items.forEach((it) => {
        it.canvas.width = Math.round(it.canvas.clientWidth * dpr);
        it.canvas.height = Math.round(it.canvas.clientHeight * dpr);
        drawWidget(it);
      });
      window.__f8kPend = true; // 调试验证标记
    } catch (e) { /* 静默降级 */ }
  }
})();
