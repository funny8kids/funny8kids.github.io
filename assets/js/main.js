/* =========================================================
   F8K® Portfolio — 核心脚本（主题 / 路由 / 预加载 / 滚动动效 / 光标）
   重资源模块见 hero3d.js 与 playground.js（监听 f8k-idle 事件自启动）
   任何致命故障都会走 recover() 解锁页面，绝不卡死在预加载屏
   ========================================================= */
(() => {
  'use strict';

  const doc = document.documentElement;
  const $ = (s) => document.querySelector(s);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const preloader = $('#preloader');
  const hasGsap = typeof window.gsap !== 'undefined';
  const hasST = typeof window.ScrollTrigger !== 'undefined';

  /* ---------- 错误边界：解锁页面（幂等） ---------- */
  let recovered = false;
  const recover = () => {
    if (recovered) return;
    recovered = true;
    if (preloader) preloader.remove();
    const slat = document.querySelector('.preloader-slat');
    if (slat) slat.remove();
    doc.classList.remove('loading');
  };
  window.addEventListener('error', recover);
  window.addEventListener('unhandledrejection', recover);
  // 看门狗：无论如何，7 秒后不允许还停在预加载屏
  setTimeout(() => { if (doc.classList.contains('loading')) recover(); }, 7000);

  /* ---------- 时钟（上海时间，1s 对齐分钟边界） ---------- */
  const clock = $('#clock');
  const tickClock = () => {
    if (!clock) return;
    clock.textContent = new Date().toLocaleTimeString('zh-CN', {
      hour12: false,
      timeZone: 'Asia/Shanghai'
    }).slice(0, 5);
  };
  tickClock();
  setInterval(tickClock, 1000);

  /* ---------- 页脚年份 ---------- */
  const yearEl = $('#year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* ---------- 移动端菜单（含 Esc 关闭与焦点管理） ---------- */
  const burger = $('#burger');
  const menu = $('#menu');
  const closeMenu = () => {
    if (!menu || !menu.classList.contains('is-open')) return;
    menu.classList.remove('is-open');
    menu.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('menu-open');
    if (burger) {
      burger.classList.remove('is-open');
      burger.setAttribute('aria-expanded', 'false');
      burger.focus({ preventScroll: true });
    }
  };
  if (burger && menu) {
    burger.addEventListener('click', () => {
      const open = menu.classList.toggle('is-open');
      menu.setAttribute('aria-hidden', String(!open));
      document.body.classList.toggle('menu-open', open);
      burger.classList.toggle('is-open', open);
      burger.setAttribute('aria-expanded', String(open));
      if (open) {
        const first = menu.querySelector('.menu__link');
        if (first) first.focus({ preventScroll: true });
      }
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
  }

  /* ---------- 主题（THEME[A/D]；用户切换走 View Transition 整页交叉淡化） ---------- */
  const themeBtn = $('#themeToggle');
  const applyTheme = (t, animate) => {
    const flip = () => {
      doc.dataset.theme = t;
      const label = themeBtn && themeBtn.querySelector('i');
      if (label) label.textContent = t === 'dark' ? '[D]' : '[A]';
      if (themeBtn) themeBtn.setAttribute('aria-pressed', t === 'dark' ? 'true' : 'false');
      try { localStorage.setItem('f8k-theme:v2', t); } catch (e) { /* 隐私模式下忽略 */ }
      document.dispatchEvent(new CustomEvent('f8k-theme'));
    };
    // haoqi 式全局交叉淡化：整页截图过渡；期间 html.is-vt 压掉 CSS 过渡避免双重动画
    if (animate && document.startViewTransition && !reduced) {
      doc.classList.add('is-vt');
      try {
        document.startViewTransition(flip).finished.finally(() => doc.classList.remove('is-vt'));
      } catch (e) {
        doc.classList.remove('is-vt');
        flip();
      }
    } else flip();
  };
  if (themeBtn) {
    applyTheme(doc.dataset.theme || 'light', false);
    themeBtn.addEventListener('click', () => {
      applyTheme(doc.dataset.theme === 'dark' ? 'light' : 'dark', true);
    });
  }

  /* ---------- 声音开关（SOUND[|/»]）：WebAudio 合成微音效，无音频文件，默认关 ---------- */
  const initSound = () => {
    const btn = document.getElementById('soundToggle');
    if (!btn) return;
    let ctx = null, master = null, enabled = false;
    try { enabled = localStorage.getItem('f8k-sound') === 'on'; } catch (e) { /* 隐私模式 */ }
    const label = btn.querySelector('i');
    const render = () => {
      if (label) label.textContent = enabled ? '[»]' : '[|]';
      btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    };
    render();
    const ensure = () => {
      if (ctx) return true;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = .06; // 很轻的仪表滴答声，不做环境音
      master.connect(ctx.destination);
      return true;
    };
    const blip = (freq, dur, type) => {
      if (!enabled || !ensure()) return;
      if (ctx.state === 'suspended') ctx.resume();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(1, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + dur);
      o.connect(g).connect(master);
      o.start();
      o.stop(ctx.currentTime + dur);
    };
    let lastTick = 0;
    document.addEventListener('mouseover', (e) => {
      if (!e.target.closest('a, button, [data-hover]')) return;
      const now = performance.now();
      if (now - lastTick < 70) return; // 滑过列表时不连成一串
      lastTick = now;
      blip(1180, .05, 'sine');
    }, { passive: true });
    document.addEventListener('pointerdown', () => blip(340, .09, 'triangle'), { passive: true });
    btn.addEventListener('click', () => {
      enabled = !enabled;
      try { localStorage.setItem('f8k-sound', enabled ? 'on' : 'off'); } catch (e) { /* 隐私模式 */ }
      render();
      if (enabled) blip(620, .12, 'triangle'); // 开启确认音
    });
  };
  initSound();

  /* ---------- ■■■■■■ 受保护项目行：口令解锁（haoqi 打码块彩蛋；口令 2026） ---------- */
  const initLock = () => {
    const row = document.querySelector('.more-list a.is-locked');
    if (!row) return;
    row.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation(); // 不交给锚点路由
      const pass = window.prompt('PASSCODE — 输入口令解锁该项目');
      if (pass === '2026') {
        row.classList.remove('is-locked');
        row.removeAttribute('data-cursor-label');
        row.setAttribute('aria-label', '已解锁项目');
        row.querySelector('.more-list__name').textContent = 'SECRET LAB — 秘密项目';
        row.querySelector('.more-list__meta').textContent = '已解锁 · 2026';
      } else if (pass !== null) {
        row.classList.remove('is-wrong');
        void row.offsetWidth; // 重启抖动
        row.classList.add('is-wrong');
      }
    });
  };
  initLock();

  /* ---------- 一言 hitokoto：页脚每日一句（按天缓存，失败回退静态句） ---------- */
  const initHitokoto = () => {
    const el = document.getElementById('hitokoto');
    if (!el) return;
    const KEY = 'f8k-hito:v1';
    const today = new Date().toISOString().slice(0, 10);
    const fallback = '「把想法做成会呼吸的界面。」 —— 本站';
    const render = (text) => { el.textContent = text; };
    let cache = null;
    try { cache = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { /* 隐私模式 */ }
    if (cache && cache.d === today && cache.t) { render(cache.t); return; }
    const boot = () => {
      fetch('https://v1.hitokoto.cn/?c=d&c=i&c=k&max_length=30')
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('http ' + r.status))))
        .then((d) => {
          if (!d || !d.hitokoto) throw new Error('empty');
          const text = '「' + d.hitokoto + '」' + (d.from ? ' —— ' + d.from : '');
          render(text);
          try { localStorage.setItem(KEY, JSON.stringify({ d: today, t: text })); } catch (e) { /* 隐私模式 */ }
        })
        .catch(() => render(fallback));
    };
    if ('requestIdleCallback' in window) requestIdleCallback(boot, { timeout: 3500 });
    else setTimeout(boot, 1800);
  };
  initHitokoto();

  /* ---------- 访客地理（ipwho.is）：右下 HUD 显示城市；坐标留给未来的天气接入 ---------- */
  const initVisitorGeo = () => {
    const el = document.getElementById('visitorCity');
    if (!el) return;
    const KEY = 'f8k-geo:v1';
    const apply = (city) => { el.textContent = city ? ' · ' + city : ''; };
    let cache = null;
    try { cache = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) { /* 隐私模式 */ }
    if (cache && cache.city) { apply(cache.city); return; }
    const boot = () => {
      fetch('https://ipwho.is/')
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('http ' + r.status))))
        .then((d) => {
          if (!d || d.success === false || !d.city) return apply('');
          apply(d.city);
          try {
            sessionStorage.setItem(KEY, JSON.stringify({ city: d.city }));
            localStorage.setItem('f8k-geo:coords', JSON.stringify({
              lat: d.latitude, lon: d.longitude, t: Date.now()
            }));
          } catch (e) { /* 隐私模式 */ }
        })
        .catch(() => apply(''));
    };
    if ('requestIdleCallback' in window) requestIdleCallback(boot, { timeout: 3500 });
    else setTimeout(boot, 1800);
  };
  initVisitorGeo();

  /* ---------- 光标坐标读数（常驻右下系统 HUD）---------- */
  const xy = $('#xyReadout');
  if (xy) {
    let xTick = false, lx = 0, ly = 0;
    const paintXY = () => {
      xTick = false;
      xy.textContent = 'X ' + String(lx).padStart(4, '0') + ' · Y ' + String(ly).padStart(4, '0');
    };
    window.addEventListener('mousemove', (e) => {
      lx = e.clientX; ly = e.clientY;
      if (!xTick) { xTick = true; requestAnimationFrame(paintXY); } // 每帧最多写一次，降文本重排
    }, { passive: true });
  }

  /* ---------- 锚点路由：hash 可分享、后退可用、死链不跳顶 ---------- */
  let lenis = null;
  const scrollToTarget = (target, immediate) => {
    if (lenis && !immediate) lenis.scrollTo(target, { duration: 1.2 });
    else if (lenis && immediate) lenis.scrollTo(target, { immediate: true });
    else target.scrollIntoView({ behavior: immediate || reduced ? 'auto' : 'smooth', block: 'start' });
  };
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    e.preventDefault(); // "#" 占位死链：不跳顶、不污染 URL
    const hash = a.getAttribute('href') || '#';
    if (hash.length < 2) return;
    const target = document.querySelector(hash);
    if (!target) return;
    closeMenu();
    scrollToTarget(target);
    // 到达反馈：目标章节顶部柔光脉冲一次（可重触发）
    if (target.classList.contains('section') || target.classList.contains('footer')) {
      target.classList.remove('is-flash');
      void target.offsetWidth; // 强制回流以重启动画
      target.classList.add('is-flash');
      target.addEventListener('animationend', () => target.classList.remove('is-flash'), { once: true });
    }
    try { history.pushState(null, '', hash); } catch (err) { /* file:// 下忽略 */ }
  });
  window.addEventListener('popstate', () => {
    const h = location.hash;
    if (h.length > 1) {
      const t = document.querySelector(h);
      if (t) scrollToTarget(t);
    } else if (lenis) lenis.scrollTo(0, { duration: 1 });
    else window.scrollTo({ top: 0 });
  });
  const gotoInitialHash = (immediate) => {
    const h = location.hash;
    if (h.length > 1) {
      const t = document.querySelector(h);
      if (t) scrollToTarget(t, immediate);
    }
  };

  /* ---------- 项目横滑叠放卡组（学习 pxpush.com，修正其跟手延迟） ----------
     拖拽期间 1:1 跟指针（不加任何插值层），惯性只出现在松手之后；
     触屏走 CSS 原生滚动 + 吸附，见 style.css 的 coarse 指针分支 */
  const initDeck = () => {
    const deck = document.getElementById('deck');
    const strip = document.getElementById('deckStrip');
    const idxEl = document.getElementById('deckIdx');
    if (!deck || !strip) return;

    let x = 0, minX = 0, dragging = false, moved = false;
    let lastX = 0, velocity = 0, rafId = 0, target = 0, suppressClick = false;

    const clampX = (v) => Math.min(0, Math.max(minX, v));
    let cardMids = []; // 每张卡在 strip 内的中心偏移（缓存，避免拖拽时逐帧读布局）
    const measure = () => {
      minX = Math.min(0, deck.clientWidth - strip.scrollWidth - 24);
      cardMids = Array.from(strip.children).map((c) => c.offsetLeft + c.offsetWidth / 2);
    };
    const apply = () => {
      strip.style.transform = 'translate3d(' + Math.round(x) + 'px,0,0)';
      if (!idxEl || !cardMids.length) return;
      // 视口中点相对 strip 的坐标 = deck 半宽 - x（getBoundingClientRect 换成缓存数学，零布局读）
      const mid = deck.clientWidth / 2 - x;
      let active = 0, best = Infinity;
      for (let i = 0; i < cardMids.length; i++) {
        const d = Math.abs(cardMids[i] - mid);
        if (d < best) { best = d; active = i; }
      }
      idxEl.textContent = String(active + 1).padStart(2, '0') + ' / ' + String(cardMids.length).padStart(2, '0');
    };
    const glide = () => {
      rafId = 0;
      if (dragging) return;
      x += (target - x) * 0.16;
      if (Math.abs(target - x) < 0.5) { x = target; apply(); return; }
      apply();
      rafId = requestAnimationFrame(glide);
    };

    // 拖拽与点击的判定：位移超过 6px 才算拖拽，否则放行点击
    deck.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      dragging = false; moved = false;
      lastX = e.clientX; velocity = 0;
      cancelAnimationFrame(rafId); rafId = 0;
      const onMove = (ev) => {
        const dx = ev.clientX - lastX;
        if (!moved && Math.abs(ev.clientX - startX) < 6) return;
        moved = true;
        if (!dragging) { dragging = true; deck.setPointerCapture(e.pointerId); }
        lastX = ev.clientX;
        velocity = velocity * 0.75 - dx * 0.25; // 松手惯性用
        x = clampX(x + dx);                     // 1:1 跟手，无插值
        apply();
      };
      const startX = e.clientX;
      const onUp = () => {
        deck.removeEventListener('pointermove', onMove);
        deck.removeEventListener('pointerup', onUp);
        deck.removeEventListener('pointercancel', onUp);
        if (dragging) {
          suppressClick = true;
          target = clampX(x + velocity * 14); // 松手后的惯性尾巴
          if (!rafId) rafId = requestAnimationFrame(glide);
        }
      };
      deck.addEventListener('pointermove', onMove);
      deck.addEventListener('pointerup', onUp);
      deck.addEventListener('pointercancel', onUp);
    });
    deck.addEventListener('click', (e) => {
      if (suppressClick) {
        e.preventDefault();
        e.stopPropagation();
        suppressClick = false;
      }
    }, true);

    let dRsz;
    window.addEventListener('resize', () => {
      clearTimeout(dRsz);
      dRsz = setTimeout(() => { measure(); x = clampX(x); apply(); }, 200);
    });
    window.addEventListener('load', () => { measure(); apply(); });
    measure();
    apply();
  };
  initDeck();

  /* ---------- 点击迸发（React Bits "Click Spark" 的品牌化实现：斜线粒子） ---------- */
  const initSpark = () => {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    document.addEventListener('pointerdown', (e) => {
      const n = 6;
      for (let i = 0; i < n; i++) {
        const s = document.createElement('span');
        s.className = 'spark';
        const ang = (Math.PI * 2 * i) / n + Math.random() * 0.6;
        const dist = 16 + Math.random() * 14;
        s.style.left = e.clientX + 'px';
        s.style.top = e.clientY + 'px';
        s.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
        s.style.setProperty('--dy', Math.sin(ang) * dist + 'px');
        s.style.setProperty('--r', (ang * 180 / Math.PI + 90) + 'deg');
        document.body.appendChild(s);
        s.addEventListener('animationend', () => s.remove(), { once: true });
      }
    }, { passive: true });
  };
  initSpark();

  /* ---------- 词组轮换（React Bits "Word Rotate"） ---------- */
  const initRotate = () => {
    const el = document.getElementById('heroRotate');
    if (!el) return;
    const words = ['创意编码', '交互动效', '性能工程', 'WEBGL'];
    let i = 0;
    setInterval(() => {
      el.classList.add('is-out');
      setTimeout(() => {
        i = (i + 1) % words.length;
        el.textContent = words[i];
        el.classList.remove('is-out');
        el.classList.add('is-pre');
        void el.offsetHeight; // 强制回流，让预备位生效后再滑入
        el.classList.remove('is-pre');
      }, 500);
    }, 2400);
  };
  initRotate();

  /* ---------- 解码文字（React Bits "Scramble/Decode Text"）：章节英文小标 ---------- */
  const initScramble = () => {
    const CHARS = '!<>-_/[]{}=+*^?#';
    const targets = document.querySelectorAll('.sec-head__labels span');
    if (!('IntersectionObserver' in window)) return;
    const decode = (el) => {
      const final = el.dataset.text || (el.dataset.text = el.textContent);
      if (/[\u4e00-\u9fff]/.test(final)) return; // 仅英文标签
      const start = performance.now();
      const dur = 900;
      const step = (now) => {
        const p = Math.min(1, (now - start) / dur);
        const solved = Math.floor(p * final.length);
        let out = final.slice(0, solved);
        for (let i = solved; i < final.length; i++) {
          out += final[i] === ' ' ? ' ' : CHARS[Math.floor(Math.random() * CHARS.length)];
        }
        el.textContent = out;
        if (p < 1) requestAnimationFrame(step);
        else el.textContent = final;
      };
      requestAnimationFrame(step);
    };
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          io.unobserve(en.target);
          decode(en.target);
        }
      });
    }, { threshold: 0.6 });
    targets.forEach((t) => io.observe(t));
  };
  initScramble();

  /* ---------- 聚光卡（React Bits "Spotlight Card"）：鼠标跟随高光 ---------- */
  const initSpotlight = () => {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    document.querySelectorAll('.service').forEach((card) => {
      let r = null, tick = false, cx = 0, cy = 0;
      const paint = () => {
        tick = false;
        card.style.setProperty('--mx', cx + 'px');
        card.style.setProperty('--my', cy + 'px');
      };
      card.addEventListener('mouseenter', () => { r = card.getBoundingClientRect(); });
      card.addEventListener('mousemove', (e) => {
        if (!r) r = card.getBoundingClientRect();
        cx = (e.clientX - r.left); cy = (e.clientY - r.top);
        if (!tick) { tick = true; requestAnimationFrame(paint); } // 每帧至多写一次，降渐变重绘
      }, { passive: true });
    });
  };
  initSpotlight();

  /* ---------- 像素尾巴（React Bits "Pixel Trail"）：物理台上鼠标划过留下彩色像素 ---------- */
  const initPixelTrail = () => {
    const stage = document.querySelector('.play-stage');
    if (!stage) return;
    const readTrailColors = () => {
      const s = getComputedStyle(document.documentElement);
      return ['--accent', '--accent-mint', '--accent-sun']
        .map((v) => s.getPropertyValue(v).trim())
        .filter(Boolean);
    };
    let colors = readTrailColors();
    document.addEventListener('f8k-theme', () => { colors = readTrailColors(); });
    let count = 0;
    stage.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || count > 60) return;
      count++;
      const r = stage.getBoundingClientRect();
      const s = document.createElement('span');
      s.className = 'pixel';
      s.style.left = (e.clientX - r.left) + 'px';
      s.style.top = (e.clientY - r.top) + 'px';
      s.style.setProperty('--px', (Math.random() * 16 - 8) + 'px');
      s.style.setProperty('--py', (Math.random() * 16 - 8) + 'px');
      s.style.background = colors[Math.floor(Math.random() * colors.length)] || 'var(--accent)';
      stage.appendChild(s);
      s.addEventListener('animationend', () => { s.remove(); count--; }, { once: true });
    }, { passive: true });
  };
  initPixelTrail();

  /* ---------- Lottie 页脚 F8K 动态徽标（text-to-lottie 资产；data.js 以兼容 file:// 双击打开） ---------- */
  const initLottie = () => {
    const el = document.getElementById('footerMark');
    if (!el || reduced) return;
    const loadScript = (src) => new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
    const boot = () => {
      loadScript('assets/vendor/lottie_light.min.js')
        .then(() => loadScript('assets/lottie/logo-dark.data.js'))
        .then(() => {
          if (!window.lottie || !window.__f8kLottie) return el.remove();
          const anim = window.lottie.loadAnimation({
            container: el, renderer: 'svg', loop: true, autoplay: true,
            animationData: window.__f8kLottie
          });
          new IntersectionObserver((en) => {
            if (en[0].isIntersecting) anim.play();
            else anim.pause();
          }).observe(el);
        })
        .catch(() => { el.remove(); });
    };
    if ('requestIdleCallback' in window) requestIdleCallback(boot, { timeout: 4000 });
    else setTimeout(boot, 1500);
  };
  initLottie();

  /* ---------- 空闲信号：重资源模块（3D / 物理）各自监听 ---------- */
  const whenIdle = (fn) =>
    'requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 2500 }) : setTimeout(fn, 1200);
  whenIdle(() => document.dispatchEvent(new CustomEvent('f8k-idle')));

  /* ---------- 降级：无 GSAP / 无 ScrollTrigger / 减少动效 ---------- */
  if (reduced || !hasGsap || !hasST) {
    recover();
    const cursor = $('.cursor');
    if (cursor) cursor.remove();
    gotoInitialHash(true);
    return;
  }

  /* ---------- GSAP 流程（整体包错误边界） ---------- */
  try {
    gsap.registerPlugin(ScrollTrigger);
    ScrollTrigger.config({ ignoreMobileResize: true });
    // 授予描画线动画态（无 JS / 减少动效时线条保持完整呈现）
    doc.classList.add('has-anim');

    /* Lenis 平滑滚动 */
    if (window.Lenis) {
      lenis = new window.Lenis({ duration: 0.75, smoothWheel: true });
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add((t) => lenis.raf(t * 1000));
      gsap.ticker.lagSmoothing(0);
    }

    /* ---------- 预加载：真实进度 + 双层幕布 + 首屏重叠交接 ---------- */
    const countEl = $('#preloaderCount');
    const barEl = $('.preloader__bar');
    const slatEl = $('.preloader-slat');
    const counter = { v: 0 };
    let pageReady = document.readyState === 'complete';
    if (!pageReady) window.addEventListener('load', () => { pageReady = true; }, { once: true });
    setTimeout(() => { pageReady = true; }, 3500); // 网络再慢也不无限等
    if (preloader) {
      preloader.addEventListener('click', () => { pageReady = true; }, { once: true });
      document.addEventListener('keydown', () => { pageReady = true; }, { once: true });
    }

    gsap.set('.hero__title .line > span, .footer__title .line > span', { yPercent: 115 });
    gsap.set('[data-hero-fade]', { y: 26, autoAlpha: 0 });

    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const tween = (target, vars) => new Promise((r) => gsap.to(target, { ...vars, onComplete: r }));

    (async () => {
      // 计数走到 90 后等真实就绪（或超时/跳过），再收尾到 100
      const updateHud = () => {
        if (countEl) countEl.textContent = String(Math.round(counter.v)).padStart(3, '0');
        if (barEl) barEl.style.transform = 'scaleX(' + (counter.v / 100) + ')';
      };
      await tween(counter, { v: 90, duration: 1.1, ease: 'power2.inOut', onUpdate: updateHud });
      for (let i = 0; i < 30 && !pageReady; i++) await wait(120);
      await tween(counter, { v: 100, duration: .3, ease: 'power2.out', onUpdate: updateHud });
      // 双层幕布：主底上滑 → 克莱因蓝薄板延迟跟随；
      // 首屏大字在幕布过半时提前入场（重叠约 0.35s），交接不再是干等
      const tl = gsap.timeline({
        onComplete: () => { recover(); gotoInitialHash(true); }
      });
      tl.to('.preloader__brand', { y: -26, autoAlpha: 0, duration: .4, ease: 'power2.in' }, 0)
        .to(countEl, {
          y: -26, autoAlpha: 0, scale: .92, filter: 'blur(8px)',
          transformOrigin: '100% 100%', duration: .45, ease: 'power2.in'
        }, 0)
        .to(barEl, { autoAlpha: 0, duration: .3 }, 0)
        .to(preloader, { yPercent: -100, duration: .85, ease: 'power4.inOut' }, .15)
        .to(slatEl, { yPercent: -100, duration: .85, ease: 'power4.inOut' }, .26)
        .add(() => { doc.classList.remove('loading'); }, .95) // 幕布基本过半即解锁滚动
        .fromTo('.hero__title .line > span',
          { yPercent: 115 },
          { yPercent: 0, duration: 1.1, ease: 'power4.out', stagger: .1 }, .68)
        .to('[data-hero-fade]', { y: 0, autoAlpha: 1, duration: .9, stagger: .1 }, .82);
    })();

    /* ---------- 入场编排：一章一性格（data-reveal 变体系统） ----------
       裸 data-reveal 保持默认上浮；带值的元素按章节性格入场。
       全部只用 transform / opacity / clip-path，与全站性能纪律一致 */
    const REVEALS = {
      // 默认：上浮淡入
      up: (el) => gsap.from(el, {
        y: 34, autoAlpha: 0, duration: 1, ease: 'power3.out',
        delay: parseFloat(el.dataset.delay || 0),
        scrollTrigger: { trigger: el, start: 'top 88%' }
      }),
      // 侧向滑入（data-side 控制方向；技能三列左右交替）
      side: (el) => gsap.from(el, {
        x: (el.dataset.side === 'right' ? 56 : -56), autoAlpha: 0,
        duration: 1.05, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 86%' }
      }),
      // 中心向外擦除展开（实验室舞台）
      iris: (el) => gsap.fromTo(el,
        { clipPath: 'inset(42% 42% 42% 42%)', autoAlpha: 0 },
        {
          clipPath: 'inset(0% 0% 0% 0%)', autoAlpha: 1, duration: 1.25, ease: 'power4.out',
          scrollTrigger: { trigger: el, start: 'top 82%' }
        }),
      // 缩放浮现（物理舞台）
      zoom: (el) => gsap.from(el, {
        scale: .955, autoAlpha: 0, duration: 1.1, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 85%' }
      }),
      // 子项依次上浮（服务卡 / 更多项目列表）
      stagger: (el) => gsap.from(el.children, {
        y: 30, autoAlpha: 0, duration: .95, ease: 'power3.out', stagger: .09,
        scrollTrigger: { trigger: el, start: 'top 85%' }
      }),
      // 子项依次上擦除（关于段数据卡）
      'stagger-clip': (el) => gsap.from(el.children, {
        clipPath: 'inset(0 0 100% 0)', y: 18, autoAlpha: 0,
        duration: 1, ease: 'power4.out', stagger: .1,
        scrollTrigger: { trigger: el, start: 'top 85%' }
      }),
      // 子项带微旋转错峰落位（评价三卡）
      'stagger-rot': (el) => gsap.from(el.children, {
        y: 44, rotation: -2.2, autoAlpha: 0, duration: 1.05, ease: 'power3.out', stagger: .1,
        scrollTrigger: { trigger: el, start: 'top 85%' }
      }),
      // 扇形入场：横滑卡组从右侧带交替微旋错峰落位（clearProps 让 CSS hover 重新接管）
      fan: (el) => gsap.from(el.querySelectorAll('.deck-card'), {
        x: 130, rotation: (i) => (i % 2 ? 1.6 : -1.6), autoAlpha: 0,
        duration: .95, ease: 'power3.out', stagger: .09,
        clearProps: 'transform,opacity,visibility',
        scrollTrigger: { trigger: el, start: 'top 85%' }
      }),
      // 经历行：整行上浮 + 时间列左入、内容列右入
      exp: (el) => {
        const st = { trigger: el, start: 'top 84%' };
        gsap.from(el.children, { y: 26, autoAlpha: 0, duration: .9, ease: 'power3.out', stagger: .1, scrollTrigger: st });
        gsap.from(el.querySelectorAll('.exp-row__time'), { x: -26, autoAlpha: 0, duration: .9, ease: 'power3.out', stagger: .1, scrollTrigger: st });
        gsap.from(el.querySelectorAll('.exp-row__main'), { x: 26, autoAlpha: 0, duration: .9, ease: 'power3.out', stagger: .1, scrollTrigger: st });
      }
    };
    gsap.utils.toArray('[data-reveal]').forEach((el) => {
      const fn = REVEALS[el.dataset.reveal || 'up'] || REVEALS.up;
      try { fn(el); } catch (e) { /* 单个元素失败不拖垮整章 */ }
    });

    /* ---------- 描画线：进入视口时按父级分组 stagger 展开（scaleX 由 CSS 过渡承担） ---------- */
    const lineGroups = new Map();
    gsap.utils.toArray('[data-line]').forEach((el) => {
      const key = el.parentElement;
      if (!lineGroups.has(key)) lineGroups.set(key, []);
      lineGroups.get(key).push(el);
    });
    lineGroups.forEach((els) => {
      ScrollTrigger.create({
        trigger: els[0], start: 'top 92%', once: true,
        onEnter: () => els.forEach((el, i) => {
          el.style.transitionDelay = (i * 0.08) + 's';
          el.classList.add('is-in');
          el.addEventListener('transitionend', () => { el.style.transitionDelay = ''; }, { once: true });
        })
      });
    });

    /* ---------- 关于段落：逐字点亮（中文按字、英文按词） ---------- */
    document.querySelectorAll('[data-split]').forEach((p) => {
      const frag = document.createDocumentFragment();
      const splitNode = (node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          node.textContent.split(/(\s+)/).forEach((tok) => {
            if (!tok) return;
            if (/^\s+$/.test(tok)) {
              frag.appendChild(document.createTextNode(' '));
              return;
            }
            if (/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(tok)) {
              Array.from(tok).forEach((ch) => {
                const s = document.createElement('span');
                s.className = 'word';
                s.textContent = ch;
                frag.appendChild(s);
              });
            } else {
              const s = document.createElement('span');
              s.className = 'word';
              s.textContent = tok;
              frag.appendChild(s);
            }
          });
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          Array.from(node.childNodes).forEach(splitNode);
        }
      };
      Array.from(p.childNodes).forEach(splitNode);
      p.innerHTML = '';
      p.appendChild(frag);
      gsap.fromTo(p.querySelectorAll('.word'), { opacity: .14 }, {
        opacity: 1,
        ease: 'none',
        stagger: .03,
        scrollTrigger: { trigger: p, start: 'top 82%', end: 'top 28%', scrub: true }
      });
    });

    /* ---------- 作品卡组视差已由横滑叠放（initDeck）取代 ---------- */

    /* ---------- 章节大数字视差 ---------- */
    gsap.utils.toArray('.sec-head__num').forEach((el) => {
      gsap.from(el, {
        y: 50,
        ease: 'none',
        scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom center', scrub: true }
      });
    });

    /* ---------- 章节标题逐字清晰浮现（React Bits "Blur Text"） ---------- */
    document.querySelectorAll('.sec-head__labels h2').forEach((el) => {
      const chars = Array.from(el.textContent);
      el.innerHTML = '';
      chars.forEach((ch) => {
        const s = document.createElement('span');
        s.className = 'blur-char';
        s.textContent = ch;
        el.appendChild(s);
      });
      gsap.fromTo(el.querySelectorAll('.blur-char'),
        { filter: 'blur(12px)', opacity: 0, y: 14 },
        { filter: 'blur(0px)', opacity: 1, y: 0, duration: .85, ease: 'power3.out', stagger: .05,
          scrollTrigger: { trigger: el, start: 'top 90%' } });
    });

    /* ---------- 数字滚动（React Bits "Count Up"，保留前导零与后缀） ---------- */
    document.querySelectorAll('.stat strong').forEach((el) => {
      const raw = el.textContent.trim();
      const digits = raw.replace(/\D/g, '');
      const num = parseInt(digits, 10);
      if (!digits || !num) return; // 「∞」保持原样
      const suffix = raw.slice(digits.length);
      const pad = digits.length;
      const o = { v: 0 };
      gsap.to(o, {
        v: num,
        duration: 1.8,
        ease: 'power2.out',
        scrollTrigger: { trigger: el, start: 'top 90%' },
        onUpdate: () => { el.textContent = String(Math.round(o.v)).padStart(pad, '0') + suffix; }
      });
    });

    /* ---------- 滚动体感中枢：全局速度采样 + 每帧衰减（跑马灯/章节歪斜/光晕摆动共用） ---------- */
    let scrollVel = 0;
    ScrollTrigger.create({ onUpdate: (self) => { scrollVel = self.getVelocity(); } });

    /* ---------- 跑马灯：速度驱动 + 桌面 pin 驻留（首屏与关于之间的翻章停顿） ----------
       has-anim 已停用 CSS 无限动画；空闲慢漂 72px/s，滚动按速度加速/反向，
       位移按单套内容宽度取模循环（负向同样无缝） */
    const marquee = document.querySelector('.marquee');
    const track = document.querySelector('.marquee__track');
    let mqSkew = null, mqOffset = 0, setW = 1;
    if (marquee && track && track.children[0]) {
      const measure = () => { setW = Math.max(1, track.children[0].offsetWidth); };
      measure();
      let mqRsz;
      window.addEventListener('resize', () => {
        clearTimeout(mqRsz);
        mqRsz = setTimeout(measure, 200);
      });
      mqSkew = gsap.quickTo(marquee, 'skewX', { duration: .5, ease: 'power3' });
      // 桌面：跑马灯带在视口上部驻留一段滚动，期间速度直接转化为文字流速
      if (typeof gsap.matchMedia === 'function') {
        gsap.matchMedia().add('(min-width: 901px)', () => {
          const st = ScrollTrigger.create({
            trigger: marquee, start: 'top 14%', end: '+=42%',
            pin: true, anticipatePin: 1, refreshPriority: -1
          });
          return () => st.kill();
        });
      }
    }

    /* ---------- 章节 velocity 歪斜：滚动越快整章微倾（液体感，仅精确指针设备） ---------- */
    const sectionSkews = finePointer
      ? gsap.utils.toArray('.section').map((el) => gsap.quickTo(el, 'skewY', { duration: .65, ease: 'power3' }))
      : [];

    /* ---------- 光晕横向摆动 + 纵向正弦漂移：滚动全程背景都在流动 ---------- */
    const auraWrap = document.querySelector('.scene-aura');
    const auraX = auraWrap ? gsap.quickTo(auraWrap, 'x', { duration: .8, ease: 'power2.out' }) : null;
    if (auraWrap) {
      const auraY = gsap.quickTo(auraWrap, 'y', { duration: 1, ease: 'power2.out' });
      ScrollTrigger.create({
        start: 0, end: 'max',
        onUpdate: (self) => auraY(Math.sin(self.progress * Math.PI * 6) * 84)
      });
    }

    let velLast = gsap.ticker.time;
    gsap.ticker.add(() => {
      const dt = Math.min(0.05, gsap.ticker.time - velLast);
      velLast = gsap.ticker.time;
      const v = gsap.utils.clamp(-2400, 2400, scrollVel);
      if (track) {
        mqOffset += (72 + v * 0.85) * dt;
        const x = ((mqOffset % setW) + setW) % setW; // 负向位移同样落在 [0, setW)
        track.style.transform = 'translate3d(' + (-x) + 'px,0,0)';
        if (mqSkew) mqSkew(gsap.utils.clamp(-8, 8, v / 260));
      }
      const skewTarget = gsap.utils.clamp(-2.2, 2.2, v / 1100);
      sectionSkews.forEach((q) => q(skewTarget));
      if (auraX) auraX(gsap.utils.clamp(-46, 46, v / 60));
      scrollVel *= 0.9; // 无滚动时缓慢回正
    });

    /* ---------- Hero 退场：滚出首屏时内容上浮淡出，把画面交给跑马灯与下一章 ---------- */
    gsap.to('.hero__inner', {
      yPercent: -16, autoAlpha: 0, ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom 42%', scrub: true }
    });
    gsap.to('.hero__foot', {
      autoAlpha: 0, ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: '28% top', scrub: true }
    });
    // 大字缩放下沉 + 3D 画布反向漂移：退场有纵深，不再是平面滑走
    gsap.to('.hero__title', {
      scale: .92, ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom 30%', scrub: true }
    });
    gsap.to('.hero-canvas', {
      y: '+=96', ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true }
    });

    /* ---------- 作品卡封面视差：图片在卡框内随滚动上下漂移 ---------- */
    gsap.utils.toArray('.deck-card__media img').forEach((img) => {
      gsap.fromTo(img, { yPercent: -6 }, {
        yPercent: 6, ease: 'none',
        scrollTrigger: { trigger: img.closest('.deck-card'), start: 'top bottom', end: 'bottom top', scrub: true }
      });
    });

    /* ---------- 光晕场景：随章节流转（haoqi.design 持久背景场景的轻量适配） ----------
       章节进入 65% 视线时切换一次光晕布局（transform/opacity 过渡 1.3s），
       离散场景切换即可获得"背景活着"的感受，无需全页 WebGL */
    const auraEls = gsap.utils.toArray('.aura');
    if (auraEls.length) {
      const setScene = (scene) => scene.forEach((cfg, i) => {
        if (!auraEls[i]) return;
        gsap.to(auraEls[i], {
          x: cfg[0], y: cfg[1], scale: cfg[2], opacity: cfg[3],
          duration: 1.3, ease: 'power2.inOut', overwrite: 'auto'
        });
      });
      const AURA_SCENES = [
        ['#services', [['-4vw', '-3vh', 1.05, .95], ['3vw', '-6vh', .95, .8], ['-6vw', '10vh', .9, .6]]],
        ['#skills',   [['8vw', '-2vh', 1.0, .7], ['-10vw', '4vh', 1.15, .95], ['10vw', '12vh', .9, .55]]],
        ['#work',     [['-8vw', '6vh', 1.1, .9], ['6vw', '-4vh', 1.0, .75], ['8vw', '14vh', .95, .7]]],
        ['#exp',      [['10vw', '0vh', .95, .6], ['-6vw', '8vh', 1.0, .6], ['-12vw', '-4vh', 1.2, .95]]],
        ['#voices',   [['-10vw', '4vh', .95, .55], ['10vw', '6vh', .9, .5], ['-2vw', '-2vh', 1.25, .95]]],
        ['#lab',      [['2vw', '-6vh', 1.3, .95], ['-12vw', '10vh', .95, .55], ['12vw', '10vh', .9, .5]]],
        ['#play',     [['0vw', '6vh', 1.0, .3], ['0vw', '6vh', .9, .25], ['0vw', '4vh', 1.0, .2]]]
      ];
      AURA_SCENES.forEach(([sel, scene]) => {
        const trig = document.querySelector(sel);
        if (!trig) return;
        ScrollTrigger.create({
          trigger: trig, start: 'top 65%', end: 'bottom 65%',
          onEnter: () => setScene(scene),
          onEnterBack: () => setScene(scene)
        });
      });
    }

    /* ---------- 页脚大字 ---------- */
    gsap.fromTo('.footer__title .line > span', { yPercent: 115 }, {
      yPercent: 0,
      duration: 1,
      ease: 'power4.out',
      stagger: .08,
      scrollTrigger: { trigger: '.footer', start: 'top 72%' }
    });

    /* ---------- 页脚大字随光标起伏（React Bits "Text Pressure"，字符中心缓存避免布局抖动） ---------- */
    const initTextPressure = () => {
      if (!finePointer) return;
      const title = document.getElementById('footerTitle');
      if (!title) return;
      const split = (node) => {
        Array.from(node.childNodes).forEach((child) => {
          if (child.nodeType === Node.TEXT_NODE) {
            const frag = document.createDocumentFragment();
            Array.from(child.textContent).forEach((ch) => {
              const s = document.createElement('span');
              s.className = 'tp-char';
              s.textContent = ch === ' ' ? '\u00A0' : ch;
              frag.appendChild(s);
            });
            node.replaceChild(frag, child);
          } else if (child.nodeType === Node.ELEMENT_NODE && !child.querySelector('.tp-char')) {
            split(child);
          }
        });
      };
      title.querySelectorAll('.line > span').forEach(split);
      const chars = title.querySelectorAll('.tp-char');
      // 每字符 4 组 quickTo：微放大 + 向外推 + 倾斜 + 上浮（推开量 > 放大量，字符永不叠压）
      const quick = Array.from(chars).map((c) => ({
        s: gsap.quickTo(c, 'scale', { duration: .3, ease: 'power3' }),
        x: gsap.quickTo(c, 'x', { duration: .3, ease: 'power3' }),
        r: gsap.quickTo(c, 'rotation', { duration: .3, ease: 'power3' }),
        y: gsap.quickTo(c, 'y', { duration: .3, ease: 'power3' })
      }));
      let centers = [], on = false, mTick = false, mx = 0, my = 0;
      const cache = () => {
        centers = Array.from(chars).map((c) => {
          const r = c.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        });
      };
      const applyPressure = () => {
        mTick = false;
        for (let i = 0; i < centers.length; i++) {
          const d = Math.hypot(mx - centers[i].x, my - centers[i].y);
          const f = Math.max(0, 1 - d / 240);
          const dir = mx > centers[i].x ? 1 : -1;
          quick[i].s(1 + f * 0.05);
          quick[i].x(dir * f * 9);
          quick[i].r(dir * f * 9);
          quick[i].y(-f * 7);
        }
      };
      title.addEventListener('mouseenter', () => { on = true; cache(); });
      title.addEventListener('mousemove', (e) => {
        if (!on) return;
        mx = e.clientX; my = e.clientY;
        if (!mTick) { mTick = true; requestAnimationFrame(applyPressure); } // 每帧最多算一次全字符
      }, { passive: true });
      title.addEventListener('mouseleave', () => {
        on = false;
        quick.forEach((q) => { q.s(1); q.x(0); q.r(0); q.y(0); });
      });
      window.addEventListener('resize', () => { if (on) cache(); });
    };
    initTextPressure();

    /* ---------- 液态玻璃 HELLO（Apple liquid glass：3D 倾斜 + 悬浮 + 跟随高光） ---------- */
    const initGlassHello = () => {
      const wrap = document.getElementById('glassHello');
      const panel = wrap && wrap.querySelector('.glass-hello__panel');
      if (!wrap || !panel || reduced || !finePointer) return;
      const rx = gsap.quickTo(panel, 'rotationX', { duration: .6, ease: 'power3.out' });
      const ry = gsap.quickTo(panel, 'rotationY', { duration: .6, ease: 'power3.out' });
      let pr = null, gTick = false;
      const cachePr = () => { pr = panel.getBoundingClientRect(); };
      cachePr();
      window.addEventListener('resize', cachePr);
      window.addEventListener('scroll', () => { pr = null; }, { passive: true }); // 滚动后懒更新
      window.addEventListener('mousemove', (e) => {
        ry((e.clientX / window.innerWidth - 0.5) * 14);
        rx(-(e.clientY / window.innerHeight - 0.5) * 10);
        if (!pr) cachePr();
        const gx = (((e.clientX - pr.left) / pr.width) * 100).toFixed(1) + '%';
        const gy = (((e.clientY - pr.top) / pr.height) * 100).toFixed(1) + '%';
        if (!gTick) {
          gTick = true;
          requestAnimationFrame(() => {
            gTick = false;
            panel.style.setProperty('--gx', gx);
            panel.style.setProperty('--gy', gy);
          });
        }
      }, { passive: true });
      gsap.to(panel, { y: -9, duration: 2.6, ease: 'sine.inOut', yoyo: true, repeat: -1 });
    };
    initGlassHello();

    /* ---------- 懒加载模块改变布局后刷新 ScrollTrigger 测量 ---------- */
    document.addEventListener('f8k-layout', () => { if (hasST) ScrollTrigger.refresh(); });

    /* ---------- 自定义光标（has-cursor 由 JS 授予，无 JS 时系统光标可用） ---------- */
    if (finePointer) {
      const cursor = $('.cursor');
      const dot = cursor && cursor.querySelector('.cursor__dot');
      const ring = cursor && cursor.querySelector('.cursor__ring');
      if (cursor && dot && ring) {
        doc.classList.add('has-cursor');
        const dx = gsap.quickTo(dot, 'x', { duration: .12, ease: 'power2.out' });
        const dy = gsap.quickTo(dot, 'y', { duration: .12, ease: 'power2.out' });
        const rx = gsap.quickTo(ring, 'x', { duration: .38, ease: 'power2.out' });
        const ry = gsap.quickTo(ring, 'y', { duration: .38, ease: 'power2.out' });
        window.addEventListener('mousemove', (e) => {
          dx(e.clientX); dy(e.clientY); rx(e.clientX); ry(e.clientY);
          cursor.classList.add('is-on');
        }, { passive: true });
        document.addEventListener('mouseleave', () => cursor.classList.remove('is-on'));
        document.addEventListener('mouseover', (e) => {
          const labelEl = e.target.closest('[data-cursor-label]');
          const hoverEl = e.target.closest('a, button, [data-hover]');
          const label = ring.querySelector('.cursor__label');
          if (labelEl && label) label.textContent = labelEl.dataset.cursorLabel;
          cursor.classList.toggle('is-label', !!labelEl);
          cursor.classList.toggle('is-hover', !!hoverEl);
        });
      }
    } else {
      const cursor = $('.cursor');
      if (cursor) cursor.remove();
    }

    /* ---------- 磁性按钮 ---------- */
    if (finePointer) {
      document.querySelectorAll('[data-magnetic]').forEach((el) => {
        const xTo = gsap.quickTo(el, 'x', { duration: .4, ease: 'power3.out' });
        const yTo = gsap.quickTo(el, 'y', { duration: .4, ease: 'power3.out' });
        el.addEventListener('mousemove', (e) => {
          const r = el.getBoundingClientRect();
          xTo((e.clientX - r.left - r.width / 2) * .35);
          yTo((e.clientY - r.top - r.height / 2) * .35);
        });
        el.addEventListener('mouseleave', () => {
          gsap.to(el, { x: 0, y: 0, duration: .7, ease: 'elastic.out(1, .35)' });
        });
      });
    }

    /* ---------- 作品卡 / 评价卡 hover 立体倾斜（React Bits "Tilted Card" 轻量版） ---------- */
    if (finePointer) {
      document.querySelectorAll('.deck-card__media, .quote').forEach((el) => {
        const rx = gsap.quickTo(el, 'rotationX', { duration: .4, ease: 'power3.out' });
        const ry = gsap.quickTo(el, 'rotationY', { duration: .4, ease: 'power3.out' });
        el.addEventListener('mousemove', (e) => {
          if (e.buttons) return; // 拖拽卡组时不动
          const r = el.getBoundingClientRect();
          const px = (e.clientX - r.left) / r.width - 0.5;
          const py = (e.clientY - r.top) / r.height - 0.5;
          ry(px * 10);
          rx(-py * 10);
        }, { passive: true });
        el.addEventListener('mouseleave', () => { rx(0); ry(0); });
      });
    }

    /* ---------- 滚动 HUD：顶部进度线 + 滚动百分比 + 章节读数（haoqi 式翻页仪表） ---------- */
    const progressEl = document.querySelector('.scroll-progress');
    const pctEl = document.getElementById('scrollPct');
    if (progressEl) {
      ScrollTrigger.create({
        start: 0, end: 'max',
        onUpdate: (self) => {
          progressEl.style.transform = 'scaleX(' + self.progress + ')';
          if (pctEl) pctEl.textContent = 'SCROLL ' + String(Math.round(self.progress * 100)).padStart(2, '0') + '%';
        }
      });
    }
    const hudNum = document.getElementById('chapterNum');
    const hudName = document.getElementById('chapterName');
    if (hudNum && hudName) {
      let hudCur = -2;
      const setChapter = (i, num, name) => {
        if (i === hudCur) return;
        hudCur = i;
        hudNum.textContent = num;
        hudName.textContent = name;
        gsap.fromTo([hudNum, hudName],
          { y: 8, autoAlpha: 0 },
          { y: 0, autoAlpha: 1, duration: .45, ease: 'power3.out', stagger: .04, overwrite: true });
      };
      const CHAPTERS = [
        ['#about', '01', '关于'], ['#services', '02', '服务'], ['#skills', '03', '技能'],
        ['#work', '04', '作品'], ['#exp', '05', '经历'], ['#voices', '06', '评价'],
        ['#lab', '07', '实验室'], ['#play', '08', '彩蛋'], ['#contact', '09', '联系']
      ];
      CHAPTERS.forEach(([sel, num, name], i) => {
        const trig = document.querySelector(sel);
        if (!trig) return;
        ScrollTrigger.create({
          trigger: trig, start: 'top 60%',
          // 末章（页脚）end 钉到滚动尽头：pin 占位会使其 bottom 计算偏短，滚到底会失活
          end: i === CHAPTERS.length - 1 ? 'max' : 'bottom 60%',
          onToggle: (self) => { if (self.isActive) setChapter(i, num, name); }
        });
      });
      ScrollTrigger.create({
        trigger: '.hero', start: 'top top', end: 'bottom 60%',
        onToggle: (self) => { if (self.isActive) setChapter(-1, '00', 'HELLO'); }
      });
      // 滚入深色页脚时 HUD 反白
      const footer = document.querySelector('.footer');
      if (footer) ScrollTrigger.create({
        trigger: footer, start: 'top 70%',
        onToggle: (self) => doc.classList.toggle('at-footer', self.isActive)
      });
    }

    /* ---------- Scrollspy：导航墨线滑移到当前章节 ---------- */
    const spyLinks = Array.from(document.querySelectorAll('.header__nav a[href^="#"]'));
    const ink = document.querySelector('.nav-ink');
    if (spyLinks.length && ink) {
      gsap.set(ink, { scaleX: 0 });
      const xTo = gsap.quickTo(ink, 'x', { duration: .45, ease: 'power3.out' });
      const setActive = (link) => {
        spyLinks.forEach((l) => l.classList.toggle('is-active', l === link));
        if (!link) { ink.classList.remove('is-on'); return; }
        const r = link.getBoundingClientRect();
        const nav = ink.parentElement.getBoundingClientRect();
        xTo(r.left - nav.left);
        gsap.to(ink, { scaleX: r.width / 100, duration: .45, ease: 'power3.out' });
        ink.classList.add('is-on');
      };
      spyLinks.forEach((link) => {
        const target = document.querySelector(link.getAttribute('href'));
        if (!target) return;
        ScrollTrigger.create({
          trigger: target, start: 'top 55%',
          end: link.getAttribute('href') === '#contact' ? 'max' : 'bottom 55%',
          onToggle: (self) => { if (self.isActive) setActive(link); }
        });
      });
      // 首屏区间不点亮任何项，墨线淡出
      ScrollTrigger.create({
        trigger: '.hero', start: 'top top', end: 'bottom 55%',
        onToggle: (self) => { if (self.isActive) setActive(null); }
      });
    }

    /* ---------- Header 滚动态 ---------- */
    const header = $('.header');
    const onScroll = () => {
      if (header) header.classList.toggle('is-scrolled', window.scrollY > 40);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    /* ---------- 布局变化后刷新测量 ---------- */
    window.addEventListener('load', () => ScrollTrigger.refresh());
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => ScrollTrigger.refresh());
    }
  } catch (err) {
    console.warn('[F8K] 动画初始化失败，已降级为静态版本：', err);
    recover();
    doc.classList.remove('has-cursor');
    const cursor = $('.cursor');
    if (cursor) cursor.remove();
  }
})();
