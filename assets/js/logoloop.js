/* =========================================================
   F8K® — 技术栈滚动带（React Bits <LogoLoop /> 原生 JS 移植，MIT）
   原作：React Bits LogoLoop（JavaScript + CSS variant）
   本文件：无 JSX / 无 React 依赖，直接在 DOM 上复刻同一套行为：
     速度（speed，px/s）、方向（left/right/up/down）、hover 阻尼（hoverSpeed），
     边缘淡出（fade + fadeColor）、logo 缩放（scaleHover）、自适应复制份数（ResizeObserver）、
     无缝环形（translate3d 取模）、后台/离屏暂停、prefers-reduced-motion 静态降级。
   ========================================================= */
(() => {
  'use strict';

  const CONFIG = { SMOOTH_TAU: 0.25, MIN_COPIES: 2, COPY_HEADROOM: 2, FRAME_CAP: 33 };

  const toNum = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
  const attr = (el, k) => el.getAttribute('data-' + k);

  document.querySelectorAll('[data-logoloop]').forEach((wrap) => {
    const track = wrap.querySelector('.logoloop__track');
    const list = wrap.querySelector('.logoloop__list');
    if (!track || !list) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ---------- 配置读取（未给默认值与 React 组件一致） ---------- */
    const direction = attr(wrap, 'direction') || 'left';
    const isVertical = direction === 'up' || direction === 'down';
    const speed = toNum(attr(wrap, 'speed'), 120);
    const gap = toNum(attr(wrap, 'gap'), 32);
    const logoHeight = toNum(attr(wrap, 'logo-height'), 28);
    const hoverSpeedRaw = attr(wrap, 'hover-speed');
    const hoverSpeed = hoverSpeedRaw == null || hoverSpeedRaw === '' ? undefined : toNum(hoverSpeedRaw, 0);
    const pauseOnHover = attr(wrap, 'pause-on-hover');
    const fade = attr(wrap, 'fade') === 'true';
    const fadeColor = attr(wrap, 'fade-color');
    const scaleHover = attr(wrap, 'scale-hover') === 'true';

    /* hover 目标速度：hoverSpeed > 停不下来语义；pauseOnHover 显式覆盖；都未给默认 0（悬停暂停） */
    let effectiveHoverSpeed;
    if (hoverSpeed !== undefined) effectiveHoverSpeed = hoverSpeed;
    else if (pauseOnHover === 'true') effectiveHoverSpeed = 0;
    else if (pauseOnHover === 'false') effectiveHoverSpeed = undefined;
    else effectiveHoverSpeed = 0;

    /* 目标速度：方向 × 符号（React 组件同款公式） */
    const magnitude = Math.abs(speed);
    let dirMult;
    if (isVertical) dirMult = direction === 'up' ? 1 : -1;
    else dirMult = direction === 'left' ? 1 : -1;
    const targetVelocity = magnitude * dirMult * (speed < 0 ? -1 : 1);

    /* ---------- 注入 CSS 变量与语义类 ---------- */
    wrap.style.setProperty('--logoloop-gap', gap + 'px');
    wrap.style.setProperty('--logoloop-logoHeight', logoHeight + 'px');
    if (fadeColor) wrap.style.setProperty('--logoloop-fadeColor', fadeColor);
    wrap.classList.add(isVertical ? 'logoloop--vertical' : 'logoloop--horizontal');
    if (fade) wrap.classList.add('logoloop--fade');
    if (scaleHover) wrap.classList.add('logoloop--scale-hover');

    /* ---------- 复制份数：按视口宽度/高度自适应，预留 2 套余量保证无缝 ---------- */
    let copyCount = CONFIG.MIN_COPIES;
    let seqWidth = 0, seqHeight = 0;
    let copies = [];

    const buildCopies = () => {
      copies.forEach((c) => { if (c !== list) c.remove(); }); // 清掉旧克隆，保留首个原列表
      copies = [list];
      for (let i = 1; i < copyCount; i++) {
        const clone = list.cloneNode(true);
        clone.setAttribute('role', 'list');
        clone.setAttribute('aria-hidden', 'true');
        clone.removeAttribute('id');
        track.appendChild(clone);
        copies.push(clone);
      }
    };

    const measure = () => {
      const containerWidth = wrap.clientWidth || 0;
      const w = list.offsetWidth || list.getBoundingClientRect().width || 0;
      const h = list.offsetHeight || list.getBoundingClientRect().height || 0;
      if (isVertical) {
        const parentH = wrap.parentElement ? wrap.parentElement.clientHeight : 0;
        if (wrap.parentElement && parentH > 0) {
          const targetH = Math.ceil(parentH);
          if (wrap.style.height !== targetH + 'px') wrap.style.height = targetH + 'px';
        }
        if (h > 0) {
          seqHeight = Math.ceil(h);
          const viewport = wrap.clientHeight || parentH || h;
          copyCount = Math.max(CONFIG.MIN_COPIES, Math.ceil(viewport / seqHeight) + CONFIG.COPY_HEADROOM);
        }
      } else if (w > 0) {
        seqWidth = Math.ceil(w);
        copyCount = Math.max(CONFIG.MIN_COPIES, Math.ceil(containerWidth / seqWidth) + CONFIG.COPY_HEADROOM);
      }
      buildCopies();
    };

    const resize = () => { measure(); };
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => { requestAnimationFrame(resize); });
      ro.observe(wrap);
      ro.observe(list);
    } else {
      let rsz;
      window.addEventListener('resize', () => { clearTimeout(rsz); rsz = setTimeout(resize, 150); });
    }

    /* 图片加载后重测（本组件用文本徽标，img 加载不影响，但保持一致口径） */
    let imgRemaining = 0;
    const onOneImg = () => { imgRemaining -= 1; if (imgRemaining <= 0) resize(); };
    list.querySelectorAll('img').forEach((img) => {
      imgRemaining += 1;
      const h = () => onOneImg();
      if (img.complete) onOneImg();
      else { img.addEventListener('load', h, { once: true }); img.addEventListener('error', h, { once: true }); }
    });

    /* ---------- 动画循环：速度阻尼（同 React 的 SMOOTH_TAU 指数缓动）+ 取模无缝 ---------- */
    let rafId = 0, lastTs = null, offset = 0, velocity = 0, isHovered = false, running = false, inView = true;

    const seqSize = () => (isVertical ? seqHeight : seqWidth);

    const applyTransform = () => {
      const s = seqSize();
      if (s <= 0) return;
      offset = ((offset % s) + s) % s;
      track.style.transform = isVertical
        ? `translate3d(0, ${-offset}px, 0)`
        : `translate3d(${-offset}px, 0, 0)`;
    };

    const tick = (now) => {
      if (!running) return;
      if (lastTs === null) lastTs = now;
      const dt = Math.max(0, now - lastTs) / 1000;
      lastTs = now;

      const target = isHovered && effectiveHoverSpeed !== undefined ? effectiveHoverSpeed : targetVelocity;
      const ease = 1 - Math.exp(-dt / CONFIG.SMOOTH_TAU);
      velocity += (target - velocity) * ease;

      const s = seqSize();
      if (s > 0) {
        offset += velocity * dt;
        applyTransform();
      }
      rafId = requestAnimationFrame(tick);
    };

    const setRunning = (on) => {
      const want = on && inView && !document.hidden && !reduced;
      if (want === running) return;
      running = want;
      if (running) rafId = requestAnimationFrame(tick);
      else if (rafId) cancelAnimationFrame(rafId);
      lastTs = null;
    };

    const onEnter = () => { if (effectiveHoverSpeed !== undefined) isHovered = true; };
    const onLeave = () => { isHovered = false; };

    track.addEventListener('mouseenter', onEnter);
    track.addEventListener('mouseleave', onLeave);
    document.addEventListener('visibilitychange', () => setRunning(true));

    if ('IntersectionObserver' in window) {
      new IntersectionObserver((en) => { inView = en[0].isIntersecting; setRunning(true); }, { rootMargin: '60px' }).observe(wrap);
    }

    // 初始化：先测量、铺克隆，再（非减少动效时）开跑
    measure();
    applyTransform();
    if (reduced) {
      // 减少动效：保持静态，只见一整套内容
    } else {
      setRunning(true);
    }
  });

  // 主题切换：淡出边缘色若依赖 CSS 变量会自动跟随；无额外动作
})();
