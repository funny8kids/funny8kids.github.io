/* LUMEN VIOLA — 物理花园 §04 · v95 完全复刻
   直接采用官方 Matter 管线：Engine.create() → Runner.run → Render.create/Render.run
   （自绘 canvas 渲染全部废弃，视觉 = 官方 Render：bodyColorPalette、约束线、锚点圆、
     showAngleIndicator、showSleeping、showCollisions、wireframes 均为官方实现）。
   场景 = brm.io/matter-js/demo/#constraints 官方 example 逐参数一致：
     ① stiff global anchor  ② soft global anchor  ③ damped soft anchor
     ④ revolute single      ⑤ revolute multi      ⑥ stiff multi
     ⑦ soft multi           ⑧ damped soft multi   + 四面静态墙（800×600 世界）
     Render{width:800,height:600,showAngleIndicator:true}
     background #14151f · wireframeBackground #0b0812（官方默认）
     MouseConstraint{angularStiffness:0, 拖拽约束不可见} · render.mouse 官方映射
     Render.lookAt({0,0,800,600}) 官方信箱适配（内部同步 Mouse.setScale/setOffset）
   官方工具条：Play/Pause(Runner.enabled) · Restart · Wireframes · Show Sleeping · Show Collisions
   站点层（叠加不动官方渲染）：花瓣精灵 overlay、滚动风、点空生成、重力翻转、紫罗兰配色、
     滚轮缩放开关（默认关防劫持滚动；开启即官方 mousewheel 行为）、扰动、官方源码面板。
   性能：Runner/Render 离屏+后台暂停；reduced-motion 单帧 Render.world。 */
(function () {
  'use strict';
  const M = window.Matter;
  const stage = document.getElementById('physicsStage');
  if (!M || !stage) return;

  const { Engine, Render, Runner, Bodies, Body, Composite, Constraint,
    Mouse, MouseConstraint, Events, Common } = M;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const hudBodies = document.getElementById('physBodies');
  const hudLinks = document.getElementById('physCons');
  const hudFps = document.getElementById('physFps');
  const labelEl = document.getElementById('physLabel');
  const chipsEl = document.getElementById('physScenes');
  const toolsEl = document.getElementById('physTools');

  /* ---------- 官方默认色板 ---------- */
  const PALETTE = ['#f19648', '#f5d259', '#f55a3c', '#063e7b', '#ececd1'];
  const VIOLET = ['#8b5cf6', '#c084fc', '#e879f9', '#6d28d9', '#c4b5fd'];
  let paletteMode = 'official'; // official | violet
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  const isLight = () => document.documentElement.getAttribute('data-theme') === 'light';

  /* ---------- 官方管线 ---------- */
  const engine = Engine.create();
  engine.gravity.y = 1;
  const world = engine.world;

  const render = Render.create({
    element: stage,
    engine: engine,
    options: {
      width: 800, height: 600,
      showAngleIndicator: true,
      background: '#14151f',
      wireframeBackground: '#0b0812',
      wireframes: false,
      pixelRatio: DPR,
    },
  });
  render.canvas.classList.add('phys__canvas');
  const canvas = render.canvas;

  // 花瓣精灵 overlay：与官方画布同尺寸同 bounds 变换
  const overlay = document.createElement('canvas');
  overlay.id = 'petalOverlay';
  overlay.setAttribute('aria-hidden', 'true');
  stage.insertBefore(overlay, canvas.nextSibling);
  const octx = overlay.getContext('2d');

  const runner = Runner.create();

  const mouse = Mouse.create(canvas);
  const mc = MouseConstraint.create(engine, {
    mouse,
    constraint: { angularStiffness: 0, render: { visible: false } }, // 官方同款
  });
  Composite.add(world, mc);
  render.mouse = mouse;

  // Mouse.create 已按官方绑定滚轮监听 → 初始手动摘除（防劫持页面滚动）；工具可显式开启
  let wheelOn = true;
  const setWheel = (on) => {
    if (on === wheelOn) return on;
    wheelOn = on;
    const fn = mouse.mousewheel;
    if (on) {
      canvas.addEventListener('mousewheel', fn);
      canvas.addEventListener('DOMMouseScroll', fn);
    } else {
      canvas.removeEventListener('mousewheel', fn);
      canvas.removeEventListener('DOMMouseScroll', fn);
    }
    return on;
  };
  setWheel(false);

  /* =========================================================
     官方 8 组约束设施 —— 与 matter-js demo example.constraints 逐参数一致
     ========================================================= */
  const RIGS = [
    { name: 'STIFF GLOBAL ANCHOR', zh: '刚·全局锚', build() {
        const body = Bodies.polygon(150, 200, 5, 30);
        const c = Constraint.create({ pointA: { x: 150, y: 100 }, bodyB: body, pointB: { x: -10, y: -10 } });
        return [body, c];
      }, kick: (b) => Body.setVelocity(b[0], { x: 7, y: -3 }) },
    { name: 'SOFT GLOBAL ANCHOR', zh: '软·全局锚', build() {
        const body = Bodies.polygon(280, 100, 3, 30);
        const c = Constraint.create({ pointA: { x: 280, y: 120 }, bodyB: body, pointB: { x: -10, y: -7 }, stiffness: 0.001 });
        return [body, c];
      }, kick: (b) => Body.setVelocity(b[0], { x: 4, y: -6 }) },
    { name: 'DAMPED SOFT ANCHOR', zh: '阻尼软绳', build() {
        const body = Bodies.polygon(400, 100, 4, 30);
        const c = Constraint.create({ pointA: { x: 400, y: 120 }, bodyB: body, pointB: { x: -10, y: -10 }, stiffness: 0.001, damping: 0.05 });
        return [body, c];
      }, kick: (b) => Body.setVelocity(b[0], { x: -5, y: -4 }) },
    { name: 'REVOLUTE SINGLE', zh: '转动销钉', build() {
        const body = Bodies.rectangle(600, 200, 200, 20);
        const ball = Bodies.circle(550, 150, 20);
        const c = Constraint.create({ pointA: { x: 600, y: 200 }, bodyB: body, length: 0 });
        return [body, ball, c];
      }, kick: (b) => { Body.setVelocity(b[1], { x: -5, y: 2 }); Body.setAngularVelocity(b[0], 0.09); } },
    { name: 'REVOLUTE MULTI', zh: '转动多体', build() {
        const body = Bodies.rectangle(500, 400, 100, 20, { collisionFilter: { group: -1 } });
        const ball = Bodies.circle(600, 400, 20, { collisionFilter: { group: -1 } });
        const c = Constraint.create({ bodyA: body, bodyB: ball });
        return [body, ball, c];
      }, kick: (b) => Body.setAngularVelocity(b[0], 0.12) },
    { name: 'STIFF MULTI', zh: '刚·多体杆', build() {
        const a = Bodies.polygon(100, 400, 6, 20);
        const b = Bodies.polygon(200, 400, 1, 50);
        const c = Constraint.create({ bodyA: a, pointA: { x: -10, y: -10 }, bodyB: b, pointB: { x: -10, y: -10 } });
        return [a, b, c];
      }, kick: (b) => Body.setVelocity(b[1], { x: 3, y: -7 }) },
    { name: 'SOFT MULTI', zh: '软·多体绳', build() {
        const a = Bodies.polygon(300, 400, 4, 20);
        const b = Bodies.polygon(400, 400, 3, 30);
        const c = Constraint.create({ bodyA: a, pointA: { x: -10, y: -10 }, bodyB: b, pointB: { x: -10, y: -7 }, stiffness: 0.001 });
        return [a, b, c];
      }, kick: (b) => Body.setVelocity(b[0], { x: 5, y: -5 }) },
    { name: 'DAMPED SOFT MULTI', zh: '阻尼·多体', build() {
        const a = Bodies.polygon(500, 400, 6, 30);
        const b = Bodies.polygon(600, 400, 7, 60);
        const c = Constraint.create({ bodyA: a, pointA: { x: -10, y: -10 }, bodyB: b, pointB: { x: -10, y: -10 }, stiffness: 0.001, damping: 0.1 });
        return [a, b, c];
      }, kick: (b) => Body.setVelocity(b[1], { x: 4, y: -4 }) },
  ];

  const walls = () => [
    Bodies.rectangle(400, 0, 800, 50, { isStatic: true, label: 'wall' }),
    Bodies.rectangle(400, 600, 800, 50, { isStatic: true, label: 'wall' }),
    Bodies.rectangle(800, 300, 50, 600, { isStatic: true, label: 'wall' }),
    Bodies.rectangle(0, 300, 50, 600, { isStatic: true, label: 'wall' }),
  ];

  // 官方 harness 取色：每个动态刚体随机 palette 上色（fillStyle=strokeStyle）
  function colorBody(b) {
    if (b.isStatic) return;
    const c = Common.choose(paletteMode === 'official' ? PALETTE : VIOLET);
    b.render.fillStyle = c;
    b.render.strokeStyle = c;
    b.render.lineWidth = 1;
  }

  let rigBodies = [];
  let scene = 0; // 0=全部, 1..8=官方单组
  let petals = [];
  let petalsOn = !reducedMotion;

  function buildScene(withPetals) {
    Composite.clear(world, false, true);
    rigBodies = [];
    const add = (parts) => {
      parts.forEach((p) => { if (p.mass > 0) colorBody(p); });
      Composite.add(world, parts);
      return parts.filter((p) => p.mass > 0);
    };
    if (scene === 0) {
      RIGS.forEach((rig, i) => {
        const dyn = add(rig.build());
        dyn.forEach((b) => { b.__rig = i; rigBodies.push(b); });
      });
    } else {
      rigBodies = add(RIGS[scene - 1].build());
    }
    Composite.add(world, walls());
    petals = [];
    if (gameOn) { shots = []; gDrag = null; }
    if (withPetals && petalsOn) seedPetals();
    Composite.add(world, mc);
    if (labelEl) labelEl.textContent = scene === 0 ? 'ALL SCENES · 全部约束' : RIGS[scene - 1].name + ' · ' + RIGS[scene - 1].zh;
    if (reducedMotion) Render.world(render);
  }

  /* ---------- 花瓣（站点 overlay 精灵） ---------- */
  function makePetalSprite(hue) {
    const s = 64, c = document.createElement('canvas');
    c.width = s; c.height = s;
    const g = c.getContext('2d');
    g.translate(s / 2, s / 2 + 3);
    g.rotate(-0.18);
    const grad = g.createRadialGradient(0, -6, 2, 0, 4, 26);
    grad.addColorStop(0, 'hsla(' + (hue + 22) + ',90%,80%,.95)');
    grad.addColorStop(.5, 'hsla(' + hue + ',80%,62%,.9)');
    grad.addColorStop(1, 'hsla(' + (hue - 18) + ',70%,40%,.12)');
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(0, 0, 14, 22, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,.25)';
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, -17); g.lineTo(0, 15); g.stroke();
    return c;
  }
  const petalImgs = [makePetalSprite(262), makePetalSprite(288), makePetalSprite(300), makePetalSprite(190)];

  function spawnPetal(x, y) {
    if (petals.length > 30) Composite.remove(world, petals.shift());
    const r = 8 + Math.random() * 9;
    const b = Bodies.circle(x != null ? x : 60 + Math.random() * 680, y != null ? y : -30 - Math.random() * 120, r, {
      restitution: 0.55, friction: 0.06, frictionAir: 0.02, density: 0.0008,
      label: 'petal', render: { visible: false },
    });
    b.__img = petalImgs[(Math.random() * petalImgs.length) | 0];
    b.__r = r;
    Body.setAngularVelocity(b, (Math.random() - 0.5) * 0.18);
    petals.push(b);
    Composite.add(world, b);
  }
  function seedPetals() {
    const n = reducedMotion ? 6 : 16;
    for (let i = 0; i < n; i++) spawnPetal(undefined, Math.random() * 240);
  }

  /* ---------- 尺寸：官方 setPixelRatio + lookAt 信箱适配 ---------- */
  function fit() {
    const w = stage.clientWidth || 640;
    const h = stage.clientHeight || 480;
    render.options.width = w;
    render.options.height = h;
    Render.setPixelRatio(render, DPR);
    Render.lookAt(render, { min: { x: 0, y: 0 }, max: { x: 800, y: 600 } }); // 官方内部同步 mouse scale/offset
    overlay.width = Math.round(w * DPR);
    overlay.height = Math.round(h * DPR);
    overlay.style.width = w + 'px';
    overlay.style.height = h + 'px';
    if (reducedMotion) Render.world(render);
  }
  const screenToWorld = (p) => {
    const bw = render.bounds.max.x - render.bounds.min.x;
    const bh = render.bounds.max.y - render.bounds.min.y;
    const r = canvas.getBoundingClientRect();
    return {
      x: p.x / r.width * bw + render.bounds.min.x,
      y: p.y / r.height * bh + render.bounds.min.y,
    };
  };

  /* ---------- overlay 花瓣绘制：跟随官方渲染节奏 ---------- */
  Events.on(render, 'beforeRender', function () {
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.clearRect(0, 0, overlay.width, overlay.height);
  });
  Events.on(render, 'afterRender', function (ev) {
    if (petalsOn && petals.length) {
      const bw = render.bounds.max.x - render.bounds.min.x;
      const s = render.options.width / bw;
      octx.setTransform(DPR * s, 0, 0, DPR * s, -render.bounds.min.x * s * DPR, -render.bounds.min.y * s * DPR);
      for (const p of petals) {
        octx.save();
        octx.translate(p.position.x, p.position.y);
        octx.rotate(p.angle);
        const k = p.__r * 2.7;
        octx.drawImage(p.__img, -k / 2, -k / 2, k, k);
        octx.restore();
      }
    }
    if (gameOn) drawGame(performance.now());
    // HUD（帧率以真实时钟计）
    const now = performance.now();
    frames++;
    if (now - fpsLast > 500) {
      if (hudFps) hudFps.textContent = Math.round((frames * 1000) / (now - fpsLast)) + ' FPS';
      frames = 0; fpsLast = now;
    }
    if (now - hudT > 350) {
      hudT = now;
      if (hudBodies) hudBodies.textContent = 'BODIES ' + String(Composite.allBodies(world).length - 4 - petals.length - shots.length).padStart(2, '0') + (petals.length ? '+' + petals.length : '');
      if (hudLinks) hudLinks.textContent = 'LINKS ' + String(Composite.allConstraints(world).length - 1).padStart(2, '0');
    }
  });
  let frames = 0, fpsLast = performance.now(), hudT = 0;

  /* ---------- 点空生成（站点交互） ---------- */
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') return;
    const r = canvas.getBoundingClientRect();
    const p = screenToWorld({ x: e.clientX - r.left, y: e.clientY - r.top });
    if (p.x < 0 || p.x > 800 || p.y < 0 || p.y > 600) return;
    if (gameOn) {
      if (fired < MAX_SHOTS && Math.hypot(p.x - PAD.x, p.y - PAD.y) < 85) {
        gDrag = { x: p.x, y: p.y };
        if (canvas.setPointerCapture) { try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* noop */ } }
      }
      return; // 游戏中禁用随机生成，保持规则纯粹
    }
    const hit = Composite.allBodies(world).some((b) => !b.isStatic && b.label !== 'petal' && M.Query.point([b], p).length);
    if (hit) return;
    if (petalsOn && Math.random() < 0.72) spawnPetal(p.x, p.y - 40);
    else {
      const sides = 1 + ((Math.random() * 6) | 0);
      const b2 = Bodies.polygon(p.x, p.y - 60, sides, 14 + Math.random() * 22, { restitution: 0.35, friction: 0.08 });
      colorBody(b2);
      Composite.add(world, b2);
    }
  }, { passive: true });

  /* =========================================================
     投掷得分 · 弹弓小游戏（jiejoe 式互动玩法，复用官方世界）
     左下弹弓向后拉 → 松手把花瓣弹体射向右上目标环。
     内圈 +3（花心）、外圈 +1；10 发弹药，成绩进 HUD。
     ========================================================= */
  const hudGame = document.getElementById('physGame');
  const PAD = { x: 110, y: 505 };
  const TARGET = { x: 665, y: 250, r: 55, rBull: 24 };
  const MAX_SHOTS = 10;
  let gameOn = false, shots = [], score = 0, fired = 0, gDrag = null, flashT = -1e9;

  function gameMsg(m) {
    if (hudGame) hudGame.textContent = 'SCORE ' + score + ' · 弹药 ' + Math.max(0, MAX_SHOTS - fired) + (m ? ' · ' + m : '');
  }
  function setGame(on) {
    gameOn = on;
    const btn = toolsEl && toolsEl.querySelector('[data-tool="game"]');
    if (btn) btn.textContent = on ? '游戏[ON]' : '游戏[OFF]';
    if (hudGame) hudGame.hidden = !on;
    shots.forEach((s) => Composite.remove(world, s.b));
    shots = []; gDrag = null;
    if (on) { score = 0; fired = 0; gameMsg('拖住左下弹弓，向后拉，松手'); }
  }
  function launch(to) {
    let dx = PAD.x - to.x, dy = PAD.y - to.y;
    const len = Math.hypot(dx, dy);
    if (len < 22 || fired >= MAX_SHOTS) return;
    const power = Math.min(len, 210) / 210 * 24;
    const b = Bodies.circle(PAD.x, PAD.y, 11, {
      restitution: 0.35, friction: 0.05, frictionAir: 0.006, density: 0.0024,
      label: 'shot', render: { visible: false },
    });
    b.__img = petalImgs[1]; b.__r = 11;
    Body.setVelocity(b, { x: (dx / len) * power, y: (dy / len) * power });
    Body.setAngularVelocity(b, (Math.random() - 0.5) * 0.2);
    Composite.add(world, b);
    shots.push({ b, scored: 0, born: performance.now(), deadAt: 0 });
    fired++;
    gameMsg(fired >= MAX_SHOTS ? '最后一发 — 目标 +3' : '');
  }
  window.addEventListener('pointermove', (e) => {
    if (!gDrag) return;
    const r = canvas.getBoundingClientRect();
    gDrag = screenToWorld({ x: e.clientX - r.left, y: e.clientY - r.top });
  }, { passive: true });
  window.addEventListener('pointerup', () => {
    if (!gDrag) return;
    launch(gDrag);
    gDrag = null;
  }, { passive: true });

  Events.on(engine, 'afterUpdate', () => {
    if (!gameOn || !shots.length) return;
    const now = performance.now();
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i];
      if (!s.scored) {
        const d = Math.hypot(s.b.position.x - TARGET.x, s.b.position.y - TARGET.y);
        if (d < TARGET.rBull) { s.scored = 3; score += 3; flashT = now; s.deadAt = now + 380; gameMsg('正中花心 +3 ✦'); }
        else if (d < TARGET.r) { s.scored = 1; score += 1; flashT = now; s.deadAt = now + 380; gameMsg('命中 +1'); }
      }
      if (!s.deadAt && now - s.born > 9000) s.deadAt = now;
      if (s.deadAt && now >= s.deadAt) {
        Composite.remove(world, s.b);
        shots.splice(i, 1);
        if (fired >= MAX_SHOTS && !shots.length) gameMsg('回合结束 · 得分 ' + score + '/' + MAX_SHOTS * 3 + '，点[游戏]重开');
      }
    }
  });

  function drawGame(now) {
    const bw = render.bounds.max.x - render.bounds.min.x;
    const s = render.options.width / bw;
    octx.setTransform(DPR * s, 0, 0, DPR * s, -render.bounds.min.x * s * DPR, -render.bounds.min.y * s * DPR);
    // 目标环
    const pulse = 1 + Math.sin(now * 0.003) * 0.05;
    const flashAge = (now - flashT) / 420;
    octx.save();
    octx.translate(TARGET.x, TARGET.y);
    octx.scale(pulse, pulse);
    octx.lineWidth = flashAge < 1 ? 4 + 6 * (1 - flashAge) : 3.5;
    octx.strokeStyle = flashAge < 1 ? 'rgba(232,121,249,' + (0.55 + 0.45 * (1 - flashAge)) + ')' : 'rgba(232,121,249,.5)';
    octx.beginPath(); octx.arc(0, 0, TARGET.r, 0, Math.PI * 2); octx.stroke();
    octx.lineWidth = 2.5; octx.strokeStyle = 'rgba(103,232,249,.75)';
    octx.beginPath(); octx.arc(0, 0, TARGET.rBull, 0, Math.PI * 2); octx.stroke();
    octx.fillStyle = 'rgba(196,181,253,.14)';
    octx.beginPath(); octx.arc(0, 0, TARGET.rBull, 0, Math.PI * 2); octx.fill();
    octx.restore();
    // 弹体
    for (const st of shots) {
      octx.save();
      octx.translate(st.b.position.x, st.b.position.y);
      octx.rotate(st.b.angle);
      if (st.scored) octx.globalAlpha = Math.max(0, 1 - (now - (st.deadAt - 380)) / 380);
      const k = st.b.__r * 2.8;
      octx.drawImage(st.b.__img, -k / 2, -k / 2, k, k);
      octx.restore();
    }
    // 弹弓座
    octx.lineWidth = 2;
    octx.strokeStyle = 'rgba(196,181,253,.45)';
    octx.beginPath(); octx.arc(PAD.x, PAD.y, 26, 0, Math.PI * 2); octx.stroke();
    if (fired < MAX_SHOTS && !gDrag) {
      const bob = 1 + Math.sin(now * 0.004) * 0.12;
      octx.save(); octx.translate(PAD.x, PAD.y); octx.scale(bob, bob);
      octx.drawImage(petalImgs[1], -15, -15, 30, 30);
      octx.restore();
    }
    // 皮筋 + 待发射花瓣
    if (gDrag) {
      let dx = gDrag.x - PAD.x, dy = gDrag.y - PAD.y;
      const len = Math.hypot(dx, dy);
      const cl = Math.min(len, 210);
      if (len > 0.001) { dx = PAD.x + dx / len * cl; dy = PAD.y + dy / len * cl; }
      octx.strokeStyle = 'rgba(103,232,249,.8)';
      octx.lineWidth = 3;
      octx.beginPath(); octx.moveTo(PAD.x - 18, PAD.y); octx.lineTo(dx, dy); octx.moveTo(PAD.x + 18, PAD.y); octx.lineTo(dx, dy); octx.stroke();
      octx.save(); octx.translate(dx, dy);
      octx.drawImage(petalImgs[1], -15, -15, 30, 30);
      octx.restore();
      // 预判弹道（虚线方向指示）
      octx.strokeStyle = 'rgba(232,121,249,.5)';
      octx.setLineDash([4, 8]);
      octx.beginPath(); octx.moveTo(PAD.x, PAD.y); octx.lineTo(PAD.x + (PAD.x - dx) * 0.6, PAD.y + (PAD.y - dy) * 0.6); octx.stroke();
      octx.setLineDash([]);
    }
  }

  /* ---------- 官方工具条 + 站点工具 ---------- */
  let paused = false;
  const setPlayLabel = (on) => {
    const b = toolsEl && toolsEl.querySelector('[data-tool="play"]');
    if (b) b.textContent = on ? '暂停[‖]' : '播放[▶]';
  };
  const kickAll = () => {
    if (scene === 0) {
      for (let i = 0; i < RIGS.length; i++) {
        const subset = rigBodies.filter((b) => b.__rig === i);
        if (subset.length) RIGS[i].kick(subset);
      }
    } else if (rigBodies.length) RIGS[scene - 1].kick(rigBodies);
    petals.forEach((p, i) => { if (i % 3 === 0) Body.setVelocity(p, { x: (Math.random() - 0.5) * 6, y: -4 - Math.random() * 3 }); });
  };
  let kickTimer = 0;
  const kickSoon = () => {
    if (reducedMotion) return;
    clearTimeout(kickTimer);
    kickTimer = setTimeout(kickAll, 350);
  };
  const setPalette = (mode) => {
    paletteMode = mode;
    Composite.allBodies(world).forEach(colorBody);
    const b = toolsEl && toolsEl.querySelector('[data-tool="palette"]');
    if (b) b.textContent = mode === 'official' ? '配色[官方]' : '配色[紫]';
  };
  const applyTheme = () => {
    render.options.background = isLight() ? '#f6f6f6' : '#14151f';
    render.options.wireframeBackground = isLight() ? '#eceaf4' : '#0b0812';
    if (reducedMotion) Render.world(render);
  };

  if (toolsEl) toolsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.chip[data-tool]');
    if (!btn) return;
    const t = btn.dataset.tool;
    if (t === 'play') { paused = !paused; runner.enabled = !paused; setPlayLabel(!paused); }
    else if (t === 'restart') { buildScene(true); kickSoon(); }
    else if (t === 'wire') {
      render.options.wireframes = !render.options.wireframes;
      btn.textContent = render.options.wireframes ? '样式[线]' : '样式[彩]';
    }
    else if (t === 'sleeping') {
      render.options.showSleeping = !render.options.showSleeping;
      btn.textContent = render.options.showSleeping ? '睡眠[ON]' : '睡眠[OFF]';
    }
    else if (t === 'collisions') {
      render.options.showCollisions = !render.options.showCollisions;
      btn.textContent = render.options.showCollisions ? '碰撞[ON]' : '碰撞[OFF]';
    }
    else if (t === 'angle') {
      render.options.showAngleIndicator = !render.options.showAngleIndicator;
      btn.textContent = render.options.showAngleIndicator ? '角度[ON]' : '角度[OFF]';
    }
    else if (t === 'wheel') btn.textContent = setWheel(!wheelOn) ? '缩放[ON]' : '缩放[OFF]';
    else if (t === 'palette') setPalette(paletteMode === 'official' ? 'violet' : 'official');
    else if (t === 'gravity') {
      engine.gravity.y *= -1;
      btn.textContent = engine.gravity.y > 0 ? '重力[↓]' : '重力[↑]';
    }
    else if (t === 'petals') {
      petalsOn = !petalsOn;
      btn.textContent = petalsOn ? '花瓣[ON]' : '花瓣[OFF]';
      if (petalsOn && !petals.length) seedPetals();
      if (!petalsOn) { petals.forEach((p) => Composite.remove(world, p)); petals = []; }
    }
    else if (t === 'game') setGame(!gameOn);
    else if (t === 'kick') kickAll();
    else if (t === 'reset') {
      if (engine.gravity.y < 0) { engine.gravity.y = 1; const g = toolsEl.querySelector('[data-tool="gravity"]'); if (g) g.textContent = '重力[↓]'; }
      buildScene(true);
    }
  });

  if (chipsEl) chipsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.chip');
    if (!btn) return;
    chipsEl.querySelectorAll('.chip').forEach((c) => c.classList.remove('is-on'));
    btn.classList.add('is-on');
    scene = Number(btn.dataset.scene) || 0;
    buildScene(true);
  });

  /* ---------- 滚动风：只作用于花瓣（叙事联动） ---------- */
  let sy = window.scrollY;
  window.addEventListener('scroll', () => {
    if (!pipelineOn || paused || document.hidden) return;
    const dy = window.scrollY - sy;
    sy = window.scrollY;
    if (Math.abs(dy) < 5) return;
    petals.forEach((p) => {
      if (p.speed < 1) Body.applyForce(p, p.position, { x: (Math.random() - 0.5) * 0.001, y: (dy > 0 ? -1 : 1) * 0.0016 * (0.5 + Math.random()) });
    });
  }, { passive: true });

  /* ---------- 生命周期：官方管线 + 离屏/后台节能 ---------- */
  let pipelineOn = false, inView = false;
  const setPipeline = () => {
    const want = inView && !document.hidden;
    if (want === pipelineOn) return;
    if (want) {
      Runner.run(runner, engine);
      Render.run(render);
      runner.enabled = !paused;
      pipelineOn = true;
    } else {
      Render.stop(render);
      runner.enabled = false;
      pipelineOn = false;
    }
  };

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((en) => {
      inView = en[0].isIntersecting;
      if (inView) kickSoon();
      setPipeline();
    }, { rootMargin: '140px' }).observe(stage);
  } else { inView = true; }
  document.addEventListener('visibilitychange', setPipeline);
  window.addEventListener('resize', fit, { passive: true });
  if (window.ResizeObserver) new ResizeObserver(fit).observe(stage);
  new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  fit();
  applyTheme();
  buildScene(true);
  setPlayLabel(true);
  if (!reducedMotion) setPipeline();

  window.__vnPhysics = {
    render: () => render, engine: () => engine, scene: () => scene,
    bodies: () => Composite.allBodies(world).length, officialPipeline: true,
    game: () => ({ on: gameOn, score, fired, live: shots.length, b0: shots[0] && shots[0].b }),
  };
})();
