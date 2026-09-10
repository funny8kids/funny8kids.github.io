/* =========================================================
   F8K® — EchoText 原生移植（React Bits <EchoText />，MIT）
   纯静态站无 React：data-* 驱动，入场景 + 指针拖尾回声 + 模糊/淡出。
   根元素含 .echo-text__kw：正面彩虹“会呼吸”渐变，回声层保留 tint 混色
   （渐变只作用在 crisp 前层，避免彩色渗进拖尾）。
   语言切换（f8k-lang）：按 data-i18n-html 重取当前语言标记并整体重建，
   拖尾回声状态不残留，入场/指针交互即时复位。
   ========================================================= */
(() => {
  'use strict';

  const clamp = (v, min, max) => Math.min(Math.max(Number(v) || 0, min), max);
  const directionVectors = {
    right: { x: 1, y: 0 },
    left: { x: -1, y: 0 },
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    diagonal: { x: 0.72, y: 0.72 }
  };
  const easing = {
    linear: (t) => t,
    'ease-out': (t) => 1 - Math.pow(1 - t, 3),
    'ease-in-out': (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    snappy: (t) => 1 - Math.pow(1 - t, 5)
  };

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  const roots = [];
  const cleanups = new Map();

  const build = (root) => {
    // 拆除上一次实例（动画帧 + 指针监听），避免语言切换后叠加
    const prev = cleanups.get(root);
    if (prev) { prev(); cleanups.delete(root); }
    root.textContent = '';

    // 同步当前语言标记（默认英文；i18n.js 跳过 .echo-text，由本模块自取）
    if (root.dataset.i18nHtml && window.F8K_T) root.innerHTML = F8K_T(root.dataset.i18nHtml);

    const markup = root.innerHTML.trim(); // 保留含 .echo-text__kw 的标记，前层与回声层共用
    if (!markup) return;

    const echoCount = reduceMotion ? 0 : clamp(Math.round(Number(root.dataset.echoes) || 0), 0, 24);
    const offset = clamp(Number(root.dataset.offset) || 0, 0, 120);
    const vector = directionVectors[root.dataset.direction] || directionVectors.right;
    const fade = clamp(Number(root.dataset.fade) || 0.64, 0.1, 0.95);
    const blur = clamp(Number(root.dataset.blur) || 0, 0, 16);
    const tint = root.dataset.tint || '#b3a1f2';
    const mode = root.dataset.mode || 'both';
    const cursorRadius = clamp(Number(root.dataset.cursorRadius) || 320, 40, 1200);
    const duration = Math.max(0, Number(root.dataset.duration) || 0);
    const easeFn = easing[root.dataset.ease] || easing['ease-out'];
    const lag = clamp(Number(root.dataset.lag) || 0.16, 0.02, 0.5);
    const entranceEnabled = mode === 'entrance' || mode === 'both';
    const pointerEnabled = mode === 'pointer' || mode === 'both';
    const color = getComputedStyle(root).color || '#241b2f';

    const positions = Array.from({ length: echoCount + 1 }, (_, index) => {
      const entranceAmount = entranceEnabled ? offset * (index + 0.35) : 0;
      return { x: vector.x * entranceAmount, y: vector.y * entranceAmount };
    });
    const state = {
      targetX: 0,
      targetY: 0,
      lastTargetX: 0,
      lastTargetY: 0,
      activity: entranceEnabled ? 1 : 0,
      positions,
      startTime: performance.now()
    };
    const copyRefs = [];

    root.textContent = '';

    // 回声层：index 从高到低铺开（前层最后、z 最高）
    for (let i = echoCount; i >= 1; i--) {
      const echo = document.createElement('span');
      echo.className = 'echo-text__echo';
      echo.setAttribute('data-echo-index', String(i));
      echo.setAttribute('aria-hidden', 'true');
      echo.style.color = `color-mix(in srgb, ${tint} ${Math.min(72, 18 + i * 5)}%, ${color})`;
      echo.style.opacity = '0';
      echo.innerHTML = markup;
      root.appendChild(echo);
      copyRefs[i] = echo;
    }

    const front = document.createElement('span');
    front.className = 'echo-text__echo echo-text__echo--front';
    front.setAttribute('data-echo-index', '0');
    front.innerHTML = markup;
    root.appendChild(front);
    copyRefs[0] = front;

    if (reduceMotion) { cleanups.set(root, () => {}); return; } // CSS 媒体查询已隐藏回声层，仅展示 crisp 前层

    let cleanupPointer = () => {};
    if (pointerEnabled && finePointer) {
      const handlePointerMove = (e) => {
        const rect = root.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = e.clientX - cx;
        const dy = e.clientY - cy;
        const dist = Math.hypot(dx, dy);
        const reach = dist > 0 ? clamp(dist / cursorRadius, 0, 1) : 0;
        const dirX = dist > 0 ? dx / dist : 0;
        const dirY = dist > 0 ? dy / dist : 0;
        state.targetX = dirX * reach * offset;
        state.targetY = dirY * reach * offset * 0.72;
      };
      const handlePointerLeave = () => {
        state.targetX = 0;
        state.targetY = 0;
      };
      window.addEventListener('pointermove', handlePointerMove, { passive: true });
      document.addEventListener('pointerleave', handlePointerLeave);
      cleanupPointer = () => {
        window.removeEventListener('pointermove', handlePointerMove);
        document.removeEventListener('pointerleave', handlePointerLeave);
      };
    }

    let frameId = 0;
    const renderFrame = (now) => {
      frameId = requestAnimationFrame(renderFrame);
      if (document.hidden) return;

      const elapsed = now - state.startTime;
      const entranceProgress = entranceEnabled && duration > 0 ? clamp(elapsed / duration, 0, 1) : 1;
      const easedEntrance = easeFn(entranceProgress);
      const entranceRest = entranceEnabled ? 1 - easedEntrance : 0;
      const targetVelocity = Math.hypot(state.targetX - state.lastTargetX, state.targetY - state.lastTargetY);
      state.lastTargetX = state.targetX;
      state.lastTargetY = state.targetY;

      let maxSeparation = 0;

      for (let index = 0; index <= echoCount; index++) {
        const copy = copyRefs[index];
        const current = state.positions[index];
        if (!copy || !current) continue;

        const entranceAmount = entranceRest * offset * (index + 0.35);
        const desiredX = state.targetX + vector.x * entranceAmount;
        const desiredY = state.targetY + vector.y * entranceAmount;
        const lerp = clamp(0.34 / (1 + index * lag * 4.2), 0.018, 0.36);

        current.x += (desiredX - current.x) * lerp;
        current.y += (desiredY - current.y) * lerp;
        copy.style.transform = `translate3d(${current.x.toFixed(3)}px, ${current.y.toFixed(3)}px, 0)`;

        if (index > 0) {
          const frontPos = state.positions[0];
          const sep = frontPos ? Math.hypot(current.x - frontPos.x, current.y - frontPos.y) : 0;
          maxSeparation = Math.max(maxSeparation, sep);
          const depth = echoCount ? index / echoCount : 0;
          copy.style.filter = blur > 0 ? `blur(${(blur * depth).toFixed(2)}px)` : 'none';
        }
      }

      const separationActivity = offset > 0 ? clamp(maxSeparation / (offset * 2.25), 0, 1) : 0;
      const targetActivity = offset > 0 ? clamp(targetVelocity / (offset * 0.35), 0, 1) : 0;
      const nextActivity = Math.max(entranceRest, separationActivity, targetActivity);
      state.activity += (nextActivity - state.activity) * 0.18;

      for (let index = 1; index <= echoCount; index++) {
        const copy = copyRefs[index];
        if (!copy) continue;
        copy.style.opacity = String(Math.pow(fade, index) * state.activity);
      }
    };
    frameId = requestAnimationFrame(renderFrame);

    cleanups.set(root, () => {
      cancelAnimationFrame(frameId);
      cleanupPointer();
    });
  };

  document.querySelectorAll('.echo-text').forEach((root) => {
    roots.push(root);
    build(root);
  });

  document.addEventListener('f8k-lang', () => roots.forEach(build));
})();
