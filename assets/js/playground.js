/* =========================================================
   F8K® — 彩蛋物理标本柜 v4 · Matter.js 精选演示
   六个来自 brm.io/matter-js/demo/ 的经典场景，逐项同参移植，
   以「紫罗兰花园」的标本柜美学重新演绎：
     01 牛顿摆  Newtons Cradle     惯性∞ · 弹性1 · 无摩擦 · 永动
     02 双摆    Double Pendulum    低重力 chaos · 速度着色尾迹
     03 织物    Cloth              240 粒珠 + 丝网网格 · 可撕扯
     04 弹弓    Slingshot          弹性系绳 · 金字塔 · 自动补弹
     05 软体    Soft Body          粒子网格软体 · 可捏
     06 雪崩    Avalanche          斜面地形 · 颗粒回流（免插件 wrap）

   渲染：统一「标本柜」语言 —— 结构墨色、丝线约束、珠体/刚体
   紫罗兰-金-玫瑰色板，球体径向渐变高光，双摆尾迹速度→色温。
   每个场景参数与官方 examples/*.js 一致（坐标按 800×600 世界
   等比缩放居中），仅渲染层换用品牌色板。
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

  /* ---------- 场景元数据（EN/ZH 内联，随 f8k-lang 重渲染） ---------- */
  const SCENE_DEFS = [
    { key: 'cradle',    index: '01', en: { name: "Newton's Cradle",  chip: 'Cradle',    hint: 'drag a sphere & release' },     zh: { name: '牛顿摆', chip: '牛顿摆', hint: '拽起一颗球再松手' } },
    { key: 'pendulum',  index: '02', en: { name: 'Double Pendulum',  chip: 'Pendulum',  hint: 'spin it — watch the trail' },     zh: { name: '双摆',   chip: '双摆',   hint: '拨动它 · 看彩色尾迹' } },
    { key: 'cloth',     index: '03', en: { name: 'Cloth',            chip: 'Cloth',     hint: 'grab the silk & rip it' },        zh: { name: '织物',   chip: '织物',   hint: '抓住丝网撕开它' } },
    { key: 'sling',     index: '04', en: { name: 'Slingshot',        chip: 'Slingshot', hint: 'pull the rock & launch' },        zh: { name: '弹弓',   chip: '弹弓',   hint: '拉开石块弹射' } },
    { key: 'soft',      index: '05', en: { name: 'Soft Body',        chip: 'Soft Body', hint: 'squeeze the jelly' },             zh: { name: '软体',   chip: '软体',   hint: '捏捏果冻' } },
    { key: 'avalanche', index: '06', en: { name: 'Avalanche',        chip: 'Avalanche', hint: 'shake the slopes' },              zh: { name: '雪崩',   chip: '雪崩',   hint: '摇晃山坡' } }
  ];

  function init() {
    if (!window.Matter) return;
    const M = window.Matter;
    const { Engine, Bodies, Body, Composite, Composites, Constraint, Mouse, MouseConstraint, Query, Common } = M;

    try {
      const ctx = canvas.getContext('2d');
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const WORLD_W = 800, WORLD_H = 600;
      const TWO_PI = Math.PI * 2;
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
        C.rose = v('--accent-mint', '#b5657f');
        C.cream = v('--paper', '#f4eedf');
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
      const shade = (c, amt) => (amt >= 0 ? mix(c, '#ffffff', amt) : mix(c, '#000000', -amt));
      readColors();

      /* ---------- 引擎 / 世界 ---------- */
      let engine = Engine.create({ enableSleeping: false });
      engine.gravity.y = 1;
      let mc = null;
      let sceneKey = 'cradle';
      let scene = null; // 当前场景（含 paint / drawBack / drawExtra / onTick）

      const mouse = Mouse.create(canvas);
      mouse.pixelRatio = dpr; // 与 canvas 后备缓冲 dpr 放大保持一致（HiDPI 命中校正）

      const measure = () => {
        W = canvas.clientWidth;
        H = canvas.clientHeight;
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        S = Math.min(W / WORLD_W, H / WORLD_H);
        OX = (W - WORLD_W * S) / 2;
        OY = (H - WORLD_H * S) / 2;
        if (mc && mc.mouse) {
          mc.mouse.scale = { x: 1 / S, y: 1 / S };
          mc.mouse.offset = { x: -OX / S, y: -OY / S };
        }
      };
      const toWorld = (p) => ({ x: (p.x - OX) / S, y: (p.y - OY) / S });

      const clearWorld = () => {
        Composite.clear(engine.world, false);
        engine.gravity.scale = 0.001;
        engine.gravity.y = 1;
      };
      const makeMouse = (stiffness) => {
        mc = MouseConstraint.create(engine, {
          mouse,
          constraint: { stiffness, angularStiffness: 0, render: { visible: false } }
        });
        Composite.add(engine.world, mc);
      };

      /* ---------- 渲染：统一标本柜语言 ---------- */
      const trace = (b) => {
        const v = b.vertices;
        ctx.beginPath();
        ctx.moveTo(v[0].x, v[0].y);
        for (let i = 1; i < v.length; i++) ctx.lineTo(v[i].x, v[i].y);
        ctx.closePath();
      };
      const drawSphere = (x, y, r, color, shiny) => {
        const g = ctx.createRadialGradient(x - r * 0.36, y - r * 0.42, r * 0.06, x, y, r * 1.02);
        g.addColorStop(0, shade(color, shiny ? 0.66 : 0.42));
        g.addColorStop(0.52, color);
        g.addColorStop(1, shade(color, -0.3));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TWO_PI);
        ctx.fill();
      };
      const drawPoly = (b, color) => {
        trace(b);
        ctx.fillStyle = color;
        ctx.strokeStyle = shade(color, -0.22);
        ctx.lineWidth = 1;
        ctx.lineJoin = 'round';
        ctx.fill();
        ctx.stroke();
      };
      const paintStatic = (b) => {
        if (b.render && b.render.f8k === 'frame') {
          trace(b);
          ctx.strokeStyle = C.muted;
          ctx.lineWidth = 1;
          ctx.stroke();
          return;
        }
        trace(b);
        ctx.fillStyle = C.ink;
        ctx.fill();
      };
      const paintDefault = (b) => {
        const col = scene.palette[b.id % scene.palette.length];
        if (b.circleRadius) drawSphere(b.position.x, b.position.y, b.circleRadius, col, false);
        else drawPoly(b, col);
      };
      const drawConstraints = () => {
        ctx.lineCap = 'round';
        ctx.strokeStyle = C.muted;
        ctx.lineWidth = 1;
        for (const c of Composite.allConstraints(engine.world)) {
          if (!c.render.visible || !c.pointA || !c.pointB) continue;
          const a = c.bodyA ? { x: c.bodyA.position.x + c.pointA.x, y: c.bodyA.position.y + c.pointA.y } : c.pointA;
          const b = c.bodyB ? { x: c.bodyB.position.x + c.pointB.x, y: c.bodyB.position.y + c.pointB.y } : c.pointB;
          if (c.render.type === 'pin') {
            ctx.beginPath(); ctx.arc(a.x, a.y, 2, 0, TWO_PI); ctx.stroke();
            continue;
          }
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          if (c.render.anchors) {
            ctx.fillStyle = C.muted;
            ctx.beginPath();
            ctx.arc(a.x, a.y, 2.5, 0, TWO_PI);
            ctx.arc(b.x, b.y, 2.5, 0, TWO_PI);
            ctx.closePath();
            ctx.fill();
          }
        }
      };

      /* ---------- 场景构建（参数与官方 examples/*.js 一致） ---------- */
      const BUILD = {};

      BUILD.cradle = () => {
        clearWorld();
        const n = 5, size = 26, length = 200, sep = size * 1.9;
        const yy = 120, xx = 400 - (n - 1) * sep / 2;
        const balls = [];
        for (let i = 0; i < n; i++) {
          const cx = xx + i * sep;
          const ball = Bodies.circle(cx, yy + length, size, {
            inertia: Infinity, restitution: 1, friction: 0, frictionAir: 0, slop: size * 0.02
          });
          const c = Constraint.create({ pointA: { x: cx, y: yy }, bodyB: ball });
          Composite.add(engine.world, [ball, c]);
          balls.push(ball);
        }
        Body.translate(balls[0], { x: -160, y: -95 }); // 官方式开场：抬起首球荡起
        makeMouse(0.2);
        scene = {
          palette: [C.accent, C.sun],
          rodY: yy, rodX1: xx - 40, rodX2: xx + (n - 1) * sep + 40,
          paint: (b) => drawSphere(b.position.x, b.position.y, b.circleRadius,
            balls.indexOf(b) % 2 ? C.sun : C.accent, true),
          drawBack: () => {
            ctx.strokeStyle = C.ink;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(scene.rodX1, scene.rodY);
            ctx.lineTo(scene.rodX2, scene.rodY);
            ctx.stroke();
          }
        };
      };

      BUILD.pendulum = () => {
        clearWorld();
        engine.gravity.scale = 0.002;
        const group = Body.nextGroup(true);
        const length = 200, width = 25;
        const pendulum = Composites.stack(350, 160, 2, 1, -20, 0, (x, y) =>
          Bodies.rectangle(x, y, length, width, { collisionFilter: { group }, frictionAir: 0, chamfer: 5 }));
        Composites.chain(pendulum, 0.45, 0, -0.45, 0, { stiffness: 0.9, length: 0, angularStiffness: 0.7 });
        Composite.add(pendulum, Constraint.create({
          bodyB: pendulum.bodies[0],
          pointB: { x: -length * 0.42, y: 0 },
          pointA: { x: pendulum.bodies[0].position.x - length * 0.42, y: pendulum.bodies[0].position.y },
          stiffness: 0.9, length: 0
        }));
        const lowerArm = pendulum.bodies[1];
        Body.rotate(lowerArm, -Math.PI * 0.3, { x: lowerArm.position.x - 100, y: lowerArm.position.y });
        Composite.add(engine.world, pendulum);
        makeMouse(0.2);
        const trail = [];
        scene = {
          palette: [C.accent],
          pivot: { x: 350 - length * 0.42, y: 160 },
          paint: (b) => {
            trace(b);
            ctx.strokeStyle = C.accent;
            ctx.lineWidth = 2;
            ctx.stroke();
          },
          drawBack: () => {
            ctx.fillStyle = C.ink;
            ctx.beginPath(); ctx.arc(scene.pivot.x, scene.pivot.y, 4, 0, TWO_PI); ctx.fill();
          },
          onTick: () => {
            trail.unshift({ x: lowerArm.position.x, y: lowerArm.position.y, speed: lowerArm.speed });
            if (trail.length > 1400) trail.pop();
          },
          drawExtra: () => {
            const n = trail.length;
            for (let i = 0; i < n; i += 2) {
              const p = trail[i];
              const t = Math.min(1, p.speed / 12);
              ctx.globalAlpha = Math.max(0, 1 - i / n) * 0.85;
              ctx.fillStyle = mix(C.accent, C.sun, t);
              ctx.fillRect(p.x, p.y, 2, 2);
            }
            ctx.globalAlpha = 1;
          }
        };
      };

      BUILD.cloth = () => {
        clearWorld();
        const group = Body.nextGroup(true);
        const cols = 24, rows = 14, gap = 14, pr = 6;
        const cloth = Composites.stack(210, 80, cols, rows, gap, gap, (x, y) =>
          Bodies.circle(x, y, pr, { inertia: Infinity, friction: 0.00001, collisionFilter: { group } }));
        Composites.mesh(cloth, cols, rows, false, { stiffness: 0.06, render: { type: 'line', anchors: false } });
        for (let i = 0; i < cols; i++) cloth.bodies[i].isStatic = true; // 顶行钉住
        Composite.add(engine.world, [
          cloth,
          Bodies.circle(580, 470, 70, { isStatic: true }),
          Bodies.rectangle(210, 505, 96, 96, { isStatic: true }),
          Bodies.rectangle(400, 609, 800, 50, { isStatic: true })
        ]);
        makeMouse(0.98); // 官方同参：高刚度抓住丝网撕扯
        scene = {
          palette: [C.accent, C.rose],
          paint: (b) => {
            if (b.circleRadius) {
              const col = b.id % 2 ? C.rose : C.accent;
              ctx.fillStyle = col;
              ctx.beginPath(); ctx.arc(b.position.x, b.position.y, pr * 0.85, 0, TWO_PI); ctx.fill();
            } else drawPoly(b, scene.palette[b.id % 2]);
          }
        };
      };

      BUILD.sling = () => {
        clearWorld();
        const rockOptions = { density: 0.004 };
        const anchor = { x: 170, y: 450 };
        const state = { rock: Bodies.polygon(170, 450, 8, 20, rockOptions), anchor };
        const elastic = Constraint.create({
          pointA: anchor, bodyB: state.rock, length: 0.01, damping: 0.01, stiffness: 0.05,
          render: { visible: false }
        });
        const pyramid = Composites.pyramid(500, 300, 9, 10, 0, 0, (x, y) => Bodies.rectangle(x, y, 25, 40));
        const pyramid2 = Composites.pyramid(550, 0, 5, 10, 0, 0, (x, y) => Bodies.rectangle(x, y, 25, 40));
        Composite.add(engine.world, [
          Bodies.rectangle(395, 600, 815, 50, { isStatic: true }),
          pyramid, pyramid2,
          Bodies.rectangle(610, 250, 200, 20, { isStatic: true }),
          state.rock, elastic
        ]);
        makeMouse(0.2);
        scene = {
          palette: [C.accent, C.cream, C.sun, C.rose],
          paint: (b) => {
            if (b === state.rock) { drawPoly(b, C.sun); return; }
            paintDefault(b);
          },
          drawExtra: () => {
            const r = state.rock;
            const dist = Math.hypot(r.position.x - anchor.x, r.position.y - anchor.y);
            ctx.strokeStyle = C.sun;
            ctx.lineWidth = 1 + Math.min(6, dist / 60);
            ctx.beginPath();
            ctx.moveTo(anchor.x, anchor.y);
            ctx.lineTo(r.position.x, r.position.y);
            ctx.stroke();
            ctx.fillStyle = C.ink;
            ctx.beginPath(); ctx.arc(anchor.x, anchor.y, 3.5, 0, TWO_PI); ctx.fill();
          },
          onTick: () => {
            if (mc && mc.mouse.button === -1 &&
                (state.rock.position.x > 190 || state.rock.position.y < 430)) {
              if (Body.getSpeed(state.rock) > 45) Body.setSpeed(state.rock, 45);
              state.rock = Bodies.polygon(170, 450, 7, 20, rockOptions);
              Composite.add(engine.world, state.rock);
              elastic.bodyB = state.rock;
            }
          }
        };
      };

      BUILD.soft = () => {
        clearWorld();
        const pOpts = { inertia: Infinity, friction: 0.05, frictionStatic: 0.1 };
        const soft = (xx, yy, c, r, pr) => {
          const stack = Composites.stack(xx, yy, c, r, 0, 0, (x, y) => Bodies.circle(x, y, pr, pOpts));
          Composites.mesh(stack, c, r, true, { stiffness: 0.2, render: { type: 'line', anchors: false } });
          return stack;
        };
        Composite.add(engine.world, [
          soft(250, 110, 5, 5, 18),
          soft(400, 330, 8, 3, 15),
          soft(250, 440, 4, 4, 15),
          Bodies.rectangle(400, -25, 800, 50, { isStatic: true, render: { f8k: 'frame' } }),
          Bodies.rectangle(400, 625, 800, 50, { isStatic: true, render: { f8k: 'frame' } }),
          Bodies.rectangle(-25, 300, 50, 600, { isStatic: true, render: { f8k: 'frame' } }),
          Bodies.rectangle(825, 300, 50, 600, { isStatic: true, render: { f8k: 'frame' } })
        ]);
        makeMouse(0.9);
        scene = { palette: [C.rose, C.sun, C.accent] };
      };

      BUILD.avalanche = () => {
        clearWorld();
        const stack = Composites.stack(20, 20, 20, 5, 0, 0, (x, y) =>
          Bodies.circle(x, y, Common.random(10, 20), { friction: 0.00001, restitution: 0.5, density: 0.001 }));
        Composite.add(engine.world, [
          stack,
          Bodies.rectangle(200, 150, 700, 20, { isStatic: true, angle: Math.PI * 0.06 }),
          Bodies.rectangle(500, 350, 700, 20, { isStatic: true, angle: -Math.PI * 0.06 }),
          Bodies.rectangle(340, 580, 700, 20, { isStatic: true, angle: Math.PI * 0.04 })
        ]);
        makeMouse(0.2);
        scene = {
          palette: [C.accent, C.cream, C.sun, C.rose],
          onTick: () => { // 免 matter-wrap 插件：颗粒回流
            for (const b of Composite.allBodies(engine.world)) {
              if (b.isStatic) continue;
              const p = b.position;
              if (p.x < -40) Body.setPosition(b, { x: 840, y: p.y });
              else if (p.x > 840) Body.setPosition(b, { x: -40, y: p.y });
              else if (p.y > 640) Body.setPosition(b, { x: p.x, y: -20 });
            }
          }
        };
      };

      /* ---------- 切换 / 描述 / 轨道 ---------- */
      const lang = () => (window.F8K_LANG === 'zh' ? 'zh' : 'en');
      const indexEl = document.getElementById('playIndex');
      const nameEl = document.getElementById('playName');
      const hintEl = document.getElementById('playHint');
      const railEl = document.getElementById('playRail');
      const paintMeta = () => {
        const sd = SCENE_DEFS.find((s) => s.key === sceneKey) || SCENE_DEFS[0];
        if (indexEl) indexEl.textContent = sd.index;
        if (nameEl) nameEl.textContent = sd[lang()].name;
        if (hintEl) hintEl.textContent = sd[lang()].hint;
        if (railEl) railEl.querySelectorAll('.play-chip').forEach((c) => {
          const on = c.dataset.scene === sceneKey;
          c.classList.toggle('is-active', on);
          c.setAttribute('aria-selected', on ? 'true' : 'false');
          const span = c.querySelector('span');
          const csd = SCENE_DEFS.find((s) => s.key === c.dataset.scene);
          if (span && csd) span.textContent = csd[lang()].chip;
        });
      };
      const buildRail = () => {
        if (!railEl) return;
        railEl.innerHTML = '';
        SCENE_DEFS.forEach((sd) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'play-chip' + (sd.key === sceneKey ? ' is-active' : '');
          b.setAttribute('role', 'tab');
          b.setAttribute('aria-selected', sd.key === sceneKey ? 'true' : 'false');
          b.dataset.scene = sd.key;
          const i = document.createElement('i');
          i.textContent = sd.index;
          const sp = document.createElement('span');
          sp.textContent = sd[lang()].chip;
          b.appendChild(i);
          b.appendChild(sp);
          b.addEventListener('click', () => { if (sd.key !== sceneKey) switchTo(sd.key); });
          railEl.appendChild(b);
        });
      };
      const switchTo = (key) => {
        sceneKey = key;
        BUILD[key]();
        measure();
        paintMeta();
        draw();
      };

      /* ---------- 触屏：Matter.Mouse 不含触摸，命中即接管（平移） ---------- */
      let touchDrag = null;
      const relPos = (t) => {
        const r = canvas.getBoundingClientRect();
        return { x: t.clientX - r.left, y: t.clientY - r.top };
      };
      canvas.addEventListener('touchstart', (e) => {
        const hit = Query.point(Composite.allBodies(engine.world).filter((b) => !b.isStatic), toWorld(relPos(e.touches[0])))[0];
        if (!hit) return;
        e.preventDefault();
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

      /* ---------- 渲染循环：真实时间步长 + 离屏/后台零计算 ---------- */
      const draw = () => {
        ctx.setTransform(dpr * S, 0, 0, dpr * S, dpr * OX, dpr * OY);
        ctx.clearRect(0, 0, WORLD_W, WORLD_H);
        if (scene.drawBack) scene.drawBack();
        drawConstraints();
        for (const b of Composite.allBodies(engine.world)) {
          if (b.isStatic) paintStatic(b);
          else if (scene.paint) scene.paint(b);
          else paintDefault(b);
        }
        if (scene.drawExtra) scene.drawExtra();
      };

      let running = false, inView = false, rafId = 0, last = 0;
      const loop = (ts) => {
        if (!running) return;
        if (last === 0) last = ts;
        const delta = Math.min(ts - last, 33.3);
        last = ts;
        Engine.update(engine, delta);
        if (scene.onTick) scene.onTick();
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

      /* ---------- 动作按钮 ---------- */
      const addBtn = document.getElementById('playAdd');
      if (addBtn) addBtn.addEventListener('click', () => {
        for (let i = 0; i < 2; i++) {
          const sides = 1 + Math.floor(Math.random() * 7);
          const radius = 14 + Math.random() * 44;
          const b = Bodies.polygon(
            40 + Math.random() * (WORLD_W - 80), -50 - Math.random() * 80, sides, radius,
            { restitution: 0.4, friction: 0.1 }
          );
          Body.setAngle(b, Math.random() * Math.PI);
          Composite.add(engine.world, b);
        }
        draw();
      });
      const resetBtn = document.getElementById('playReset');
      if (resetBtn) resetBtn.addEventListener('click', () => {
        if (canvas.animate) {
          canvas.animate([{ opacity: 1 }, { opacity: .25 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' });
        }
        switchTo(sceneKey);
        draw();
      });

      /* ---------- 语言 / 主题 / resize ---------- */
      document.addEventListener('f8k-lang', () => { paintMeta(); });
      document.addEventListener('f8k-theme', () => { readColors(); draw(); });
      let rsz;
      window.addEventListener('resize', () => {
        clearTimeout(rsz);
        rsz = setTimeout(() => { measure(); draw(); }, 200);
      });

      /* ---------- 首场景启动 ---------- */
      buildRail();
      switchTo('cradle');

      window.__f8kPlay = {
        scenes: () => SCENE_DEFS.map((s) => s.key),
        scene: () => sceneKey,
        bodies: () => Composite.allBodies(engine.world).filter((b) => !b.isStatic).length,
        constraints: () => Composite.allConstraints(engine.world).length,
        gravity: () => engine.gravity.y,
        scale: () => S
      }; // 调试验证标记
    } catch (e) {
      canvas.style.display = 'none';
    }
  }
})();
