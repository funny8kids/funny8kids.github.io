/* =========================================================
   F8K® — 3D 全息个人名片（React Bits <ProfileCard /> 原生 JS 移植，MIT）
   原作：React Bits ProfileCard（JavaScript + CSS variant）
   本文件：无 JSX / 无 React 依赖，在 DOM 上复刻同一套行为：
     光标跟随的 3D 倾斜（指数缓动 + 初始入场动画）、入场/离场的 active 状态、
     背后径向辉光、触屏点击申请 deviceorientation 授权（仅 HTTPS 且 data-mobile-tilt="true"）。
   内容（姓名 / 头衔 / 邮箱 / 头图）直接写在 index.html 静态标记里；
   联系按钮为 mailto 链接，无需 JS 回调。
   ========================================================= */
(() => {
  'use strict';

  const CONFIG = {
    INITIAL_DURATION: 1200,
    INITIAL_X_OFFSET: 70,
    INITIAL_Y_OFFSET: 60,
    DEVICE_BETA_OFFSET: 20,
    ENTER_TRANSITION_MS: 180
  };

  const clamp = (v, min = 0, max = 100) => Math.min(Math.max(v, min), max);
  const round = (v, precision = 3) => parseFloat(v.toFixed(precision));
  const adjust = (v, fMin, fMax, tMin, tMax) => round(tMin + ((tMax - tMin) * (v - fMin)) / (fMax - fMin));
  const attr = (el, k) => el.getAttribute('data-' + k);
  const toNum = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };

  document.querySelectorAll('[data-profilecard]').forEach((wrap) => {
    const shell = wrap.querySelector('.pc-card-shell');
    const card = wrap.querySelector('.pc-card');
    if (!shell || !card) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const enableTilt = attr(wrap, 'tilt') !== 'false';
    const enableMobileTilt = attr(wrap, 'mobile-tilt') === 'true';
    const mobileTiltSensitivity = toNum(attr(wrap, 'mobile-sensitivity'), 5);

    /* 减少动效 / 显式关闭：卡片保持静态（CSS :hover 辉光仍在） */
    if (!enableTilt || reduced) return;

    const getOffsets = (evt, el) => {
      const rect = el.getBoundingClientRect();
      return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
    };

    /* ---------- 倾斜引擎（与 React 版同参数的指数缓动） ---------- */
    let rafId = null;
    let running = false;
    let lastTs = 0;

    let currentX = 0;
    let currentY = 0;
    let targetX = 0;
    let targetY = 0;

    const DEFAULT_TAU = 0.14;
    const INITIAL_TAU = 0.6;
    let initialUntil = 0;

    const setVarsFromXY = (x, y) => {
      if (!shell || !wrap) return;

      const width = shell.clientWidth || 1;
      const height = shell.clientHeight || 1;

      const percentX = clamp((100 / width) * x);
      const percentY = clamp((100 / height) * y);

      const centerX = percentX - 50;
      const centerY = percentY - 50;

      const properties = {
        '--pointer-x': `${percentX}%`,
        '--pointer-y': `${percentY}%`,
        '--background-x': `${adjust(percentX, 0, 100, 35, 65)}%`,
        '--background-y': `${adjust(percentY, 0, 100, 35, 65)}%`,
        '--pointer-from-center': `${clamp(Math.hypot(percentY - 50, percentX - 50) / 50, 0, 1)}`,
        '--pointer-from-top': `${percentY / 100}`,
        '--pointer-from-left': `${percentX / 100}`,
        '--rotate-x': `${round(-(centerX / 5))}deg`,
        '--rotate-y': `${round(centerY / 4)}deg`
      };

      for (const [k, v] of Object.entries(properties)) wrap.style.setProperty(k, v);
    };

    const step = (ts) => {
      if (!running) return;
      if (lastTs === 0) lastTs = ts;
      const dt = (ts - lastTs) / 1000;
      lastTs = ts;

      const tau = ts < initialUntil ? INITIAL_TAU : DEFAULT_TAU;
      const k = 1 - Math.exp(-dt / tau);

      currentX += (targetX - currentX) * k;
      currentY += (targetY - currentY) * k;

      setVarsFromXY(currentX, currentY);

      const stillFar = Math.abs(targetX - currentX) > 0.05 || Math.abs(targetY - currentY) > 0.05;

      if (stillFar || document.hasFocus()) {
        rafId = requestAnimationFrame(step);
      } else {
        running = false;
        lastTs = 0;
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
      }
    };

    const start = () => {
      if (running) return;
      running = true;
      lastTs = 0;
      rafId = requestAnimationFrame(step);
    };

    const tiltEngine = {
      setImmediate(x, y) {
        currentX = x;
        currentY = y;
        setVarsFromXY(currentX, currentY);
      },
      setTarget(x, y) {
        targetX = x;
        targetY = y;
        start();
      },
      toCenter() {
        this.setTarget(shell.clientWidth / 2, shell.clientHeight / 2);
      },
      beginInitial(durationMs) {
        initialUntil = performance.now() + durationMs;
        start();
      },
      getCurrent() {
        return { x: currentX, y: currentY, tx: targetX, ty: targetY };
      },
      cancel() {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null;
        running = false;
        lastTs = 0;
      }
    };

    /* ---------- 事件（与 React 版一致：enter 加 active + entering，leave 回中再摘 active） ---------- */
    let enterTimerRef = null;
    let leaveRafRef = null;

    const handlePointerMove = (event) => {
      const { x, y } = getOffsets(event, shell);
      tiltEngine.setTarget(x, y);
    };

    const handlePointerEnter = (event) => {
      shell.classList.add('active');
      shell.classList.add('entering');
      if (enterTimerRef) window.clearTimeout(enterTimerRef);
      enterTimerRef = window.setTimeout(() => {
        shell.classList.remove('entering');
      }, CONFIG.ENTER_TRANSITION_MS);

      const { x, y } = getOffsets(event, shell);
      tiltEngine.setTarget(x, y);
    };

    const handlePointerLeave = () => {
      tiltEngine.toCenter();

      const checkSettle = () => {
        const { x, y, tx, ty } = tiltEngine.getCurrent();
        const settled = Math.hypot(tx - x, ty - y) < 0.6;
        if (settled) {
          shell.classList.remove('active');
          leaveRafRef = null;
        } else {
          leaveRafRef = requestAnimationFrame(checkSettle);
        }
      };
      if (leaveRafRef) cancelAnimationFrame(leaveRafRef);
      leaveRafRef = requestAnimationFrame(checkSettle);
    };

    const handleDeviceOrientation = (event) => {
      const { beta, gamma } = event;
      if (beta == null || gamma == null) return;

      const centerX = shell.clientWidth / 2;
      const centerY = shell.clientHeight / 2;
      const x = clamp(centerX + gamma * mobileTiltSensitivity, 0, shell.clientWidth);
      const y = clamp(
        centerY + (beta - CONFIG.DEVICE_BETA_OFFSET) * mobileTiltSensitivity,
        0,
        shell.clientHeight
      );

      tiltEngine.setTarget(x, y);
    };

    const handleClick = () => {
      if (!enableMobileTilt || location.protocol !== 'https:') return;
      const anyMotion = window.DeviceMotionEvent;
      if (anyMotion && typeof anyMotion.requestPermission === 'function') {
        anyMotion
          .requestPermission()
          .then((state) => {
            if (state === 'granted') {
              window.addEventListener('deviceorientation', handleDeviceOrientation);
            }
          })
          .catch(console.error);
      } else {
        window.addEventListener('deviceorientation', handleDeviceOrientation);
      }
    };

    shell.addEventListener('pointerenter', handlePointerEnter);
    shell.addEventListener('pointermove', handlePointerMove);
    shell.addEventListener('pointerleave', handlePointerLeave);
    shell.addEventListener('click', handleClick);

    /* 初始入场：右上角落位 → 回中，模拟 React 版的挂载动画 */
    const initialX = (shell.clientWidth || 0) - CONFIG.INITIAL_X_OFFSET;
    const initialY = CONFIG.INITIAL_Y_OFFSET;
    tiltEngine.setImmediate(initialX, initialY);
    tiltEngine.toCenter();
    tiltEngine.beginInitial(CONFIG.INITIAL_DURATION);
  });
})();
