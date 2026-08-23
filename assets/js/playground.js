/* =========================================================
   F8K® — 彩蛋物理游乐场 v2（Matter.js 官方 Constraints 演示 · 1:1 完全复刻）
   场景 = brm.io/matter-js/demo/#constraints 的 8 组约束设施，
   坐标与参数与官方 examples/constraints.js 逐项一致：
     ① 刚性全局约束（五边形）   ② 软性全局约束（三角形）
     ③ 阻尼软性全局约束（方形） ④ 转动约束（销钉转板 + 球）
     ⑤ 转动多体约束（转板 + 球，同组不互撞）
     ⑥ 刚性多体约束（六边形 + 1 边形）⑦ 软性多体约束（方形 + 三角形）
     ⑧ 阻尼软性多体约束（六边形 + 七边形）
   渲染复刻官方 Render：bodyColorPalette 色板、约束线 + 锚点圆、
   showAngleIndicator 角度指示线、showSleeping 睡眠半透明、
   鼠标 angularStiffness:0（拖拽时刚体可旋转）、拖拽约束不可见。
   世界坐标固定 800×600，等比例缩放居中（官方 Render.lookAt 同款思路）。
   与官方的差异仅一处站点性能设置：离屏/后台暂停（官方 Runner 常驻）；
   Dat.GUI 换成站内 HUD 按钮（样式/重力/添加/重置）。
   ========================================================= */
(() => {
  'use strict';

  const canvas = document.getElementById('playCanvas');
  if (!canvas) return;

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
    const { Engine, Bodies, Body, Composite, Constraint, Mouse, MouseConstraint, Query, Events, Sleeping } = M;
    try {
      const doc = document.documentElement;
      // 官方演示不启用休眠（场景始终活着）；站点省电改用离屏/后台暂停
      const engine = Engine.create();
      engine.gravity.y = 1;
      const ctx = canvas.getContext('2d');
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      /* ---------- 官方演示世界：800×600，等比缩放居中 ---------- */
      const WORLD_W = 800, WORLD_H = 600;
      let W = 0, H = 0, S = 1, OX = 0, OY = 0;

      /* ---------- 官方 bodyColorPalette（matter-js 0.19 Render 源码提取） ---------- */
      const PALETTE = ['#f19648', '#f5d259', '#f55a3c', '#063e7b', '#ececd1'];
      const fillOf = (b) => b.isStatic ? '#171512' : PALETTE[b.id % PALETTE.length];
      const strokeOf = (b) => (b.isStatic ? '#555' : 'rgba(23,21,18,.0)'); // 官方动态体 stroke #ccc 但 lineWidth 0（不描边）

      const C = {};
      const readColors = () => {
        const s = getComputedStyle(doc);
        C.accent = s.getPropertyValue('--accent').trim() || '#2c43f5';
        C.wire = s.getPropertyValue('--muted').trim() || '#6f6c63';
        C.ink = s.getPropertyValue('--ink').trim() || '#171512';
      };
      readColors();

      let bodies = []; // 全部动态体（渲染与激活判定用）
      let mc = null;
      let wireframe = false; // 样式[线]：官方 wireframes:true 渲染模式

      const wakeAll = () => Composite.allBodies(engine.world).forEach((b) => Sleeping.set(b, false));

      const measure = () => {
        W = canvas.clientWidth;
        H = canvas.clientHeight;
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        S = Math.min(W / WORLD_W, H / WORLD_H);
        OX = (W - WORLD_W * S) / 2;
        OY = (H - WORLD_H * S) / 2;
        // 官方 Mouse 坐标换算钩子：position = absolute × scale + offset → 世界坐标
        if (mc && mc.mouse) {
          mc.mouse.scale = { x: 1 / S, y: 1 / S };
          mc.mouse.offset = { x: -OX / S, y: -OY / S };
        }
      };
      const toWorld = (p) => ({ x: (p.x - OX) / S, y: (p.y - OY) / S });

      /* ---------- 官方 8 组约束设施（参数与 examples/constraints.js 一致） ---------- */
      // ① 刚性全局约束：五边形，锚点钉在头顶（stiffness 默认 1）
      const addStiffGlobal = () => {
        const body = Bodies.polygon(150, 200, 5, 30);
        const c = Constraint.create({ pointA: { x: 150, y: 100 }, bodyB: body, pointB: { x: -10, y: -10 } });
        return [body, c];
      };
      // ② 软性全局约束：三角形，弹性绳索
      const addSoftGlobal = () => {
        const body = Bodies.polygon(280, 100, 3, 30);
        const c = Constraint.create({ pointA: { x: 280, y: 120 }, bodyB: body, pointB: { x: -10, y: -7 }, stiffness: 0.001 });
        return [body, c];
      };
      // ③ 阻尼软性全局约束：方形，软绳 + 阻尼
      const addDampedSoftGlobal = () => {
        const body = Bodies.polygon(400, 100, 4, 30);
        const c = Constraint.create({ pointA: { x: 400, y: 120 }, bodyB: body, pointB: { x: -10, y: -10 }, stiffness: 0.001, damping: 0.05 });
        return [body, c];
      };
      // ④ 转动约束：销钉转板（length 0 → 绕钉自由旋转）+ 自由小球
      const addRevolute = () => {
        const body = Bodies.rectangle(600, 200, 200, 20);
        const ball = Bodies.circle(550, 150, 20);
        const c = Constraint.create({ pointA: { x: 600, y: 200 }, bodyB: body, length: 0 });
        return [body, ball, c];
      };
      // ⑤ 转动多体约束：板与球相互约束（同组 -1 互不碰撞）
      const addRevoluteMulti = () => {
        const body = Bodies.rectangle(500, 400, 100, 20, { collisionFilter: { group: -1 } });
        const ball = Bodies.circle(600, 400, 20, { collisionFilter: { group: -1 } });
        const c = Constraint.create({ bodyA: body, bodyB: ball });
        return [body, ball, c];
      };
      // ⑥ 刚性多体约束：六边形 ↔ 1 边形（刚性杆）
      const addStiffMulti = () => {
        const a = Bodies.polygon(100, 400, 6, 20);
        const b = Bodies.polygon(200, 400, 1, 50);
        const c = Constraint.create({ bodyA: a, pointA: { x: -10, y: -10 }, bodyB: b, pointB: { x: -10, y: -10 } });
        return [a, b, c];
      };
      // ⑦ 软性多体约束：方形 ↔ 三角形（软绳）
      const addSoftMulti = () => {
        const a = Bodies.polygon(300, 400, 4, 20);
        const b = Bodies.polygon(400, 400, 3, 30);
        const c = Constraint.create({ bodyA: a, pointA: { x: -10, y: -10 }, bodyB: b, pointB: { x: -10, y: -7 }, stiffness: 0.001 });
        return [a, b, c];
      };
      // ⑧ 阻尼软性多体约束：六边形 ↔ 七边形（软绳 + 阻尼）
      const addDampedSoftMulti = () => {
        const a = Bodies.polygon(500, 400, 6, 30);
        const b = Bodies.polygon(600, 400, 7, 60);
        const c = Constraint.create({ bodyA: a, pointA: { x: -10, y: -10 }, bodyB: b, pointB: { x: -10, y: -10 }, stiffness: 0.001, damping: 0.1 });
        return [a, b, c];
      };

      /* ---------- 组装（官方 walls + 8 组设施 + 鼠标约束） ---------- */
      const build = () => {
        Composite.clear(engine.world, false);
        const walls = [
          Bodies.rectangle(400, 0, 800, 50, { isStatic: true }),
          Bodies.rectangle(400, 600, 800, 50, { isStatic: true }),
          Bodies.rectangle(800, 300, 50, 600, { isStatic: true }),
          Bodies.rectangle(0, 300, 50, 600, { isStatic: true })
        ];
        Composite.add(engine.world, [].concat(
          addStiffGlobal(), addSoftGlobal(), addDampedSoftGlobal(),
          addRevolute(), addRevoluteMulti(),
          addStiffMulti(), addSoftMulti(), addDampedSoftMulti(),
          walls, [mc]
        ));
        bodies = Composite.allBodies(engine.world).filter((b) => !b.isStatic);
      };

      /* ---------- 鼠标：官方 angularStiffness:0（拖拽可旋转）+ 约束不可见 ---------- */
      const mouse = Mouse.create(canvas);
      mc = MouseConstraint.create(engine, {
        mouse,
        constraint: { angularStiffness: 0, render: { visible: false } }
      });
      Events.on(mc, 'startdrag', () => wakeAll()); // 拖拽唤醒全场（约束链不会因睡眠断裂）

      /* ---------- 触屏：Matter.Mouse 不含触摸，命中即接管（仅平移） ---------- */
      let touchDrag = null;
      const relPos = (t) => {
        const r = canvas.getBoundingClientRect();
        return { x: t.clientX - r.left, y: t.clientY - r.top };
      };
      canvas.addEventListener('touchstart', (e) => {
        const hit = Query.point(bodies, toWorld(relPos(e.touches[0])))[0];
        if (!hit) return;
        e.preventDefault();
        Sleeping.set(hit, false);
        touchDrag = hit;
      }, { passive: false });
      canvas.addEventListener('touchmove', (e) => {
        if (!touchDrag) return;
        e.preventDefault();
        const p = toWorld(relPos(e.touches[0]));
        Body.setVelocity(touchDrag, { x: 0, y: 0 });
        Body.setPosition(touchDrag, p);
      }, { passive: false });
      const endTouch = () => { touchDrag = null; };
      canvas.addEventListener('touchend', endTouch);
      canvas.addEventListener('touchcancel', endTouch);

      /* ---------- 渲染：复刻官方 Render（约束 / 色板填充 / 角度指示 / 睡眠半透明） ---------- */
      const drawConstraints = () => {
        ctx.lineCap = 'round';
        for (const c of Composite.allConstraints(engine.world)) {
          if (!c.render.visible || !c.pointA || !c.pointB) continue;
          const a = c.bodyA ? { x: c.bodyA.position.x + c.pointA.x, y: c.bodyA.position.y + c.pointA.y } : c.pointA;
          const b = c.bodyB ? { x: c.bodyB.position.x + c.pointB.x, y: c.bodyB.position.y + c.pointB.y } : c.pointB;
          ctx.strokeStyle = C.wire;          // 官方默认白线（暗底）→ 亮底用墨灰
          ctx.lineWidth = c.render.lineWidth || 2;
          if (c.render.type === 'pin') {     // 官方 pin：仅在 pointA 画 3px 圆
            ctx.beginPath();
            ctx.arc(a.x, a.y, 3, 0, Math.PI * 2);
            ctx.closePath();
            ctx.stroke();
            continue;
          }
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
          if (c.render.anchors) {            // 官方 anchors：两端 3px 实心圆
            ctx.fillStyle = C.wire;
            ctx.beginPath();
            ctx.arc(a.x, a.y, 3, 0, Math.PI * 2);
            ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
            ctx.closePath();
            ctx.fill();
          }
        }
      };

      const traceBody = (b) => {
        const v = b.vertices;
        ctx.beginPath();
        ctx.moveTo(v[0].x, v[0].y);
        for (let i = 1; i < v.length; i++) ctx.lineTo(v[i].x, v[i].y);
        ctx.closePath();
      };

      const drawBodySolid = (b) => {
        ctx.globalAlpha = b.isSleeping ? 0.5 : 1; // 官方 showSleeping：睡眠体半透明
        traceBody(b);
        ctx.fillStyle = fillOf(b);
        ctx.strokeStyle = strokeOf(b);
        ctx.lineWidth = b.isStatic ? 1 : 0;      // 官方：动态体不描边，静态体 1px 描边
        ctx.fill();
        if (b.isStatic) ctx.stroke();
        ctx.globalAlpha = 1;
      };

      const drawBodyWire = (b) => {
        traceBody(b);
        ctx.strokeStyle = C.ink;                 // 官方线框模式：#ccc → 亮底用墨色
        ctx.lineWidth = 1;
        ctx.stroke();
      };

      const drawAngleIndicators = () => {
        // 官方 bodyAxes：从质心到 v0 与末顶点的中点；线框 indianred/1px，实体白色 overlay/2px
        ctx.strokeStyle = C.accent;
        ctx.globalAlpha = wireframe ? 0.9 : 0.45;
        ctx.lineWidth = wireframe ? 1 : 2;
        ctx.beginPath();
        for (const b of bodies) {
          const v = b.vertices;
          ctx.moveTo(b.position.x, b.position.y);
          ctx.lineTo((v[0].x + v[v.length - 1].x) / 2, (v[0].y + v[v.length - 1].y) / 2);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      };

      const draw = () => {
        ctx.setTransform(dpr * S, 0, 0, dpr * S, dpr * OX, dpr * OY);
        ctx.clearRect(0, 0, WORLD_W, WORLD_H);
        drawConstraints();
        if (wireframe) for (const b of bodies) drawBodyWire(b);
        else for (const b of bodies) drawBodySolid(b);
        drawAngleIndicators();
      };

      /* ---------- 渲染循环：离屏/后台零计算（无休眠，进视野始终有生命） ---------- */
      let running = false, inView = false, rafId = 0;
      const loop = () => {
        if (!running) return;
        Engine.update(engine, 1000 / 60);
        draw();
        rafId = requestAnimationFrame(loop);
      };
      const setRunning = (on) => {
        const want = on && inView && !document.hidden;
        if (want === running) return;
        running = want;
        if (running) rafId = requestAnimationFrame(loop);
        else cancelAnimationFrame(rafId);
      };
      // 开场一击：每次滚进视野都唤醒场景（官方 Runner 常驻运行的同观感）
      const kick = () => {
        const b = bodies;
        if (b.length < 13) return;
        Body.setVelocity(b[0], { x: 7, y: -3 });     // ① 刚性五边形荡起
        Body.setVelocity(b[4], { x: -5, y: 2 });     // ④ 转板上的球撞向转板
        Body.setAngularVelocity(b[3], 0.09);         //    转板获得角速度
        Body.setVelocity(b[12], { x: 4, y: -4 });    // ⑧ 阻尼软绳七边形抛起
      };
      new IntersectionObserver((en) => {
        inView = en[0].isIntersecting;
        if (inView) kick();
        setRunning(true);
      }, { rootMargin: '120px' }).observe(canvas);
      document.addEventListener('visibilitychange', () => setRunning(true));

      /* ---------- HUD 控制 ---------- */
      const gravityBtn = document.getElementById('playGravity');
      if (gravityBtn) {
        gravityBtn.addEventListener('click', () => {
          engine.gravity.y *= -1;
          gravityBtn.textContent = engine.gravity.y > 0 ? '重力[↓]' : '重力[↑]';
          wakeAll();
        });
      }
      const styleBtn = document.getElementById('playStyle');
      if (styleBtn) {
        styleBtn.addEventListener('click', () => {
          wireframe = !wireframe;
          styleBtn.textContent = wireframe ? '样式[彩]' : '样式[线]';
          draw();
        });
      }
      const addBtn = document.getElementById('playAdd');
      if (addBtn) {
        addBtn.addEventListener('click', () => {
          for (let i = 0; i < 2; i++) {
            const sides = 1 + Math.floor(Math.random() * 7);      // 1~7 边形（1 边形即圆球）
            const radius = 14 + Math.random() * 44;
            const b = Bodies.polygon(
              40 + Math.random() * (WORLD_W - 80), -50 - Math.random() * 60, sides, radius,
              { restitution: 0.4, friction: 0.1 }
            );
            Body.setAngle(b, Math.random() * Math.PI);
            Composite.add(engine.world, b);
            bodies.push(b);
          }
          draw();
        });
      }
      const resetBtn = document.getElementById('playReset');
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          if (canvas.animate) {
            canvas.animate([{ opacity: 1 }, { opacity: .25 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' });
          }
          if (engine.gravity.y < 0) {
            engine.gravity.y = 1;
            gravityBtn && (gravityBtn.textContent = '重力[↓]');
          }
          build();
          draw();
        });
      }

      /* ---------- 主题联动 / resize（官方演示不随 resize 重建，等比缩放自适应） ---------- */
      document.addEventListener('f8k-theme', () => {
        readColors();
        draw();
      });
      let rsz;
      window.addEventListener('resize', () => {
        clearTimeout(rsz);
        rsz = setTimeout(() => { measure(); draw(); }, 200);
      });

      measure();
      build();
      draw();
      window.__f8kPlay = {
        bodies: () => bodies.length,
        gravity: () => engine.gravity.y,
        constraints: () => Composite.allConstraints(engine.world).length,
        wireframe: () => wireframe,
        scale: () => S
      }; // 调试验证标记
    } catch (e) {
      canvas.style.display = 'none';
    }
  }
})();
