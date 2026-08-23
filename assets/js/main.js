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
  let stopPreloaderAnim = () => {}; // 数学画布动画的清理钩子（下方赋值）
  let preloaderProgress = 0;        // 预加载真实进度(0..1)，供画布充能特效读取
  const recover = () => {
    if (recovered) return;
    recovered = true;
    stopPreloaderAnim(); // 页面解锁即停掉逐帧动画，避免无谓功耗
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
      if (window.__f8kSound) window.__f8kSound(560, .14, 'sine');
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
    // 暴露给其它模块（彩蛋/主题/关卡）使用：blip 内部已用 enabled 门控
    window.__f8kSound = blip;
    let lastTick = 0;
    document.addEventListener('mouseover', (e) => {
      if (!e.target.closest('a, button, [data-hover]')) return;
      const now = performance.now();
      if (now - lastTick < 70) return; // 滑过列表时不连成一串
      lastTick = now;
      blip(1180, .05, 'sine');
    }, { passive: true });
    document.addEventListener('pointerdown', () => blip(340, .09, 'triangle'), { passive: true });
    // 分区进入：轻微的低音 accent（进入视口顶部时触发一次，被 enabled 门控，避免连串）
    let lastSec = 0;
    if (!reduced && 'IntersectionObserver' in window) {
      const secObs = new IntersectionObserver((ents) => {
        const now = performance.now();
        for (const en of ents) {
          if (!en.isIntersecting) continue;
          if (now - lastSec < 400) break; // 快速滚过多区时只响一声
          lastSec = now;
          blip(196, .1, 'sine');
          break;
        }
      }, { threshold: .18 });
      document.querySelectorAll('.section, .footer').forEach((s) => secObs.observe(s));
    }
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
        if (window.__f8kSound) window.__f8kSound(660, .16, 'triangle');
        document.dispatchEvent(new CustomEvent('f8k-unlock'));
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

    /* ---------- 预加载：莫比乌斯环画布（透视线框 + 深度光影） ----------
       单侧曲面、一个边界 —— 数学里最优雅的"悖论之美"。
       配合下方欧拉恒等式，构成"数学美感"的收束意象；只画干净的线框，无叠加爆白。 */
    const mathCanvas = $('#preloaderCanvas');
    const startMathPreloader = (canvas) => {
      if (!canvas) return () => {};
      const ctx = canvas.getContext('2d');
      if (!ctx) return () => {};
      let w = 0, h = 0, dpr = 1;
      let off = document.createElement('canvas'), octx = null, offW = 0, offH = 0;

      const resize = () => {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        w = canvas.clientWidth || window.innerWidth;
        h = canvas.clientHeight || window.innerHeight;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        offW = canvas.width;
        offH = canvas.height;
        off.width = offW;
        off.height = offH;
        octx = off.getContext('2d');
        octx.setTransform(dpr, 0, 0, dpr, 0, 0);
        // 注意：不要在 resize 里调用 seedDust —— resize 在 dust 声明前就会执行(init)，会触发暂时性死区
      };
      resize();
      window.addEventListener('resize', resize);

      const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#2c43f5';
      const rgba = (a) => {
        if (accent[0] !== '#') return accent;
        return `rgba(${parseInt(accent.slice(1, 3), 16)},${parseInt(accent.slice(3, 5), 16)},${parseInt(accent.slice(5, 7), 16)},${a})`;
      };

      /* ---------- 加载动态特效状态：鼠标视差 + 环境尘埃 + 充能环 + 点亮脉冲 ---------- */
      let mcx = 0, mcy = 0, mtx = 0, mty = 0;  // 鼠标（目标/平滑）
      const onMove = (e) => {
        mtx = (e.clientX / (window.innerWidth || 1) - 0.5) * 2;
        mty = (e.clientY / (window.innerHeight || 1) - 0.5) * 2;
      };
      window.addEventListener('pointermove', onMove);

      const GLYPHS = ['π', '∞', 'Σ', '∫', 'φ', '∇', 'λ', 'θ'];
      let dust = [];
      function seedDust() {
        const n = 30;
        dust = [];
        for (let i = 0; i < n; i++) {
          const isGlyph = i % 3 === 0;
          dust.push({
            x: Math.random(), y: Math.random(),            // 相对坐标 0..1
            r: 8 + Math.random() * 24,                     // 像素尺寸(字形/点)
            vx: (Math.random() - 0.5) * 0.00003,           // 水平漂移
            vy: -(0.00004 + Math.random() * 0.00008),      // 缓慢上浮
            ph: Math.random() * Math.PI * 2,               // 闪烁相位
            glyph: isGlyph ? GLYPHS[(Math.random() * GLYPHS.length) | 0] : null,
            emerald: Math.random() < 0.6
          });
        }
      }
      seedDust();
      let pulseStart = -1;  // 点亮脉冲起始时间(未有则 -1)

      /* ---------- 莫比乌斯环（青绿玻璃 · ∞ 实体厚带 · 椭圆截面扫掠 · 深度排序 + 菲涅尔 + 双高光） ----------
         参数化：t 沿 ∞（figure-8）中心线走一周 [0,2π]，s 绕椭圆截面一周（闭合成封闭实体）。
         宽度方向 W 带半扭转(θ=t/2) → 绕一圈 180°，构成 Möbius 的翻转；
         截面为椭圆：长轴沿 W(带宽)、短轴沿厚度方向 U3=T×W，扫出圆润有体积的厚玻璃带。 */
      const U = 180, V = 34;                 // 沿 ∞ / 绕截面一周的采样
      const A = 1.10, B = 0.50;              // ∞ 半宽 / 半高（更宽更扁）
      const HALF = 0.30, TH = 0.16;          // 半带宽(截面长轴) / 半厚(截面短轴)
      const verts = [];
      for (let i = 0; i <= U; i++) {
        const t = (i / U) * Math.PI * 2;
        const cxr = A * Math.sin(t);
        const cyr = B * Math.sin(2 * t);
        // 切线 T（未归一）
        const tx = A * Math.cos(t), ty = 2 * B * Math.cos(2 * t);
        const tl = Math.hypot(tx, ty) || 1;
        const Txn = tx / tl, Tyn = ty / tl;
        // 面内法线(⊥T)
        const nx = -Tyn, ny = Txn;
        // 宽度方向 W（带半扭转，绕一圈翻转 180°）
        const th = t / 2;
        const Wx = nx * Math.sin(th), Wy = ny * Math.sin(th), Wz = Math.cos(th);
        // 厚度方向 U3 = T × W（两正交单位向量叉积，仍近单位）
        let u3x = Tyn * Wz, u3y = -Txn * Wz, u3z = Txn * Wy - Tyn * Wx;
        const u3l = Math.hypot(u3x, u3y, u3z) || 1;
        u3x /= u3l; u3y /= u3l; u3z /= u3l;
        const row = [];
        for (let j = 0; j < V; j++) {
          const s = (j / V) * Math.PI * 2;
          const ow = HALF * Math.cos(s);
          const ot = TH * Math.sin(s);
          row.push({
            x: cxr + Wx * ow + u3x * ot,
            y: cyr + Wy * ow + u3y * ot,
            z: Wz * ow + u3z * ot
          });
        }
        verts.push(row);
      }
      // 预构建 quad（局部坐标 + 局部法线；截面闭合：j 环绕成封闭实体）每帧只做旋转/投影/反射
      const quads = [];
      for (let i = 0; i < U; i++) {
        for (let j = 0; j < V; j++) {
          const jn = (j + 1) % V;
          const a = verts[i][j], b = verts[i + 1][j], d = verts[i][jn];
          const e1x = b.x - a.x, e1y = b.y - a.y, e1z = b.z - a.z;
          const e2x = d.x - a.x, e2y = d.y - a.y, e2z = d.z - a.z;
          let nxq = e1y * e2z - e1z * e2y;
          let nyq = e1z * e2x - e1x * e2z;
          let nzq = e1x * e2y - e1y * e2x;
          const nl = Math.hypot(nxq, nyq, nzq) || 1;
          quads.push({ i, j, nx: nxq / nl, ny: nyq / nl, nz: nzq / nl });
        }
      }

      /* 玻璃材质常量：tint 为通透翡翠绿基色，env 暗/亮两档（影棚），L1 主光高光 / L2 侧向宽光泽 */
      const tintR = 30, tintG = 160, tintB = 132;   // 翡翠玻璃（亮且饱和，接近参考的通透绿）
      const envDR = 22, envDG = 120, envDB = 104;   // 反射暗部(深绿)
      const envLR = 248, envLG = 254, envLB = 251;  // 反射亮部(近白)
      const norm3 = (x, y, z) => {
        const l = Math.hypot(x, y, z) || 1;
        return [x / l, y / l, z / l];
      };
      const L1 = norm3(0.34, 0.46, 0.82);           // 上前方主光 → 圆管上表面接住宽高光
      const L2 = norm3(-0.62, -0.40, 0.62);         // 侧向宽光泽
      const LER = (c1, c2, t) => c1 + (c2 - c1) * t;
      const CL = (v, a, b) => v < a ? a : (v > b ? b : v);

      const TILT = 0.30; // 绕 X 轴后仰角：压小俯角让 ∞ 卧得更平（更扁平）
      const draw = (now) => {
        ctx.clearRect(0, 0, w, h);
        const cx = w / 2, baseCy = h / 2;
        const bob = Math.sin(now * 0.0013) * Math.min(w, h) * 0.012; // 浮沉
        const cy = baseCy + bob;
        const scale = Math.min(w, h) * 0.17;   // 整体缩至原一半（比例不变）
        const dist = 4.0;
        // 鼠标平滑视差：拖动时环朝光标方向轻旋
        mcx += (mtx - mcx) * 0.07;
        mcy += (mty - mcy) * 0.07;
        const a = Math.sin(now * 0.00045) * 0.30 + mcx * 0.24; // 基础轻摆(±17°) + 鼠标偏航
        const cosA = Math.cos(a), sinA = Math.sin(a);
        const pitch = TILT + mcy * 0.12;                       // 俯仰随鼠标微调
        const cosT = Math.cos(pitch), sinT = Math.sin(pitch);

        // 影棚背景：顶部提亮、底部略压暗偏青，让玻璃有对比
        const bgG = ctx.createLinearGradient(0, 0, 0, h);
        bgG.addColorStop(0, 'rgba(255,255,255,0.28)');
        bgG.addColorStop(0.55, 'rgba(255,255,255,0.02)');
        bgG.addColorStop(1, 'rgba(150,175,165,0.14)');
        ctx.fillStyle = bgG;
        ctx.fillRect(0, 0, w, h);

        const rotPt = (p) => {
          const y1 = p.y * cosT - p.z * sinT;
          const z1 = p.y * sinT + p.z * cosT;
          return { x: p.x * cosA + z1 * sinA, y: y1, z: -p.x * sinA + z1 * cosA };
        };
        const proj = (v) => {
          const s = dist / (dist - v.z); // z 越大越近（近大远小）
          return { x: cx + v.x * scale * s, y: cy - v.y * scale * s, z: v.z };
        };

        // 地面：柔影 + 青光（浮得越高影越小越淡）
        const ground = baseCy + scale * 1.18;
        const sway = bob / (Math.min(w, h) * 0.012); // -1..1
        const shadowR = scale * (1.55 - 0.22 * sway);
        ctx.save();
        ctx.translate(cx, ground);
        ctx.scale(1, 0.22);
        const sh = ctx.createRadialGradient(0, 0, 0, 0, 0, shadowR);
        sh.addColorStop(0, 'rgba(40,90,80,0.30)');
        sh.addColorStop(0.6, 'rgba(40,90,80,0.10)');
        sh.addColorStop(1, 'rgba(40,90,80,0)');
        ctx.fillStyle = sh;
        ctx.fillRect(-shadowR, -shadowR, shadowR * 2, shadowR * 2);
        ctx.restore();
        const glowR = scale * 1.5;
        const fg = ctx.createRadialGradient(cx, ground, 0, cx, ground, glowR);
        fg.addColorStop(0, 'rgba(40,200,165,0.28)');
        fg.addColorStop(1, 'rgba(40,200,165,0)');
        ctx.fillStyle = fg;
        ctx.fillRect(cx - glowR, ground - glowR, glowR * 2, glowR * 2);

        // 投影全部网格顶点（保留视空间 z 用于深度排序；截面闭合 j<V）
        const P = [];
        for (let i = 0; i <= U; i++) {
          const row = [];
          for (let j = 0; j < V; j++) row.push(proj(rotPt(verts[i][j])));
          P.push(row);
        }

        // 逐面（远→近）：玻璃反射模型
        const faces = [];
        for (const q of quads) {
          const jn = (q.j + 1) % V;
          const a2 = P[q.i][q.j], b2 = P[q.i + 1][q.j], c2 = P[q.i + 1][jn], d2 = P[q.i][jn];
          const z = (a2.z + b2.z + c2.z + d2.z) / 4;
          const n1z = q.ny * sinT + q.nz * cosT;
          const n1y = q.ny * cosT - q.nz * sinT;
          let nx = q.nx * cosA + n1z * sinA;
          let nz = -q.nx * sinA + n1z * cosA;
          let ny = n1y;

          const nza = Math.abs(nz);
          const f = (1 - nza) * (1 - nza);                 // 菲涅尔：边缘反射更强
          // 影棚垂直渐变反射：朝上/朝相机的面被照亮，朝下的面没入阴影 → 光滑的明暗过渡
          const e = CL(0.42 + 0.58 * (0.42 * ny - 0.10 * nz), 0, 1);
          const envR = LER(envDR, envLR, e);
          const envG = LER(envDG, envLG, e);
          const envB = LER(envDB, envLB, e);

          const s1 = Math.max(0, nx * L1[0] + ny * L1[1] + nz * L1[2]);
          const spec1 = Math.pow(s1, 18);               // 加宽的高光带（圆管上表面接住整条亮反光）
          const s2 = Math.abs(nx * L2[0] + ny * L2[1] + nz * L2[2]);
          const spec2 = Math.pow(s2, 8) * 0.35;         // 宽幅光泽

          const refl = CL(0.10 + f * 0.64 + spec1 * 0.60, 0, 1);
          const rt = refl * 0.85;                       // 高反射占比：让玻璃的明亮反射顶起
          let r = LER(tintR, envR, rt);
          let g = LER(tintG, envG, rt);
          let b = LER(tintB, envB, rt);
          const glint = CL(spec1 * 1.4 + spec2 * 0.35, 0, 1); // 白色高光拉丝（更亮的玻璃反光）
          r += (255 - r) * glint;
          g += (255 - g) * glint;
          b += (255 - b) * glint;
          const alpha = CL(0.84 + f * 0.08 + spec1 * 0.05, 0.68, 0.96); // 薄透玻璃，留一点光透过

          faces.push({
            a2, b2, c2, d2,
            r: Math.round(r), g: Math.round(g), b: Math.round(b), alpha, z
          });
        }
        faces.sort((p, q2) => p.z - q2.z); // 远(z 小)先画 → 近(z 大)后画
        octx.clearRect(0, 0, w, h);
        for (const f of faces) {
          octx.fillStyle = `rgba(${f.r},${f.g},${f.b},${f.alpha.toFixed(3)})`;
          octx.beginPath();
          octx.moveTo(f.a2.x, f.a2.y);
          octx.lineTo(f.b2.x, f.b2.y);
          octx.lineTo(f.c2.x, f.c2.y);
          octx.lineTo(f.d2.x, f.d2.y);
          octx.closePath();
          octx.fill();
        }

        // 带面轻微模糊后贴回主画布：熔掉分面过渡，玻璃显得光洁顺滑
        ctx.save();
        ctx.filter = 'blur(1.6px)';
        ctx.drawImage(off, 0, 0, offW, offH, 0, 0, w, h);
        ctx.restore();

        // 游走高光（沿带面环绕）—— 点睛
        const qi = Math.floor((now * 0.012) % U);
        const q = P[qi][0];
        const gr = Math.max(6, scale * 0.085);
        const glow = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, gr);
        glow.addColorStop(0, 'rgba(255,255,255,0.55)');
        glow.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(q.x, q.y, gr, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(1, scale * 0.018), 0, Math.PI * 2); ctx.fill();

        // —— 环境尘埃：缓慢上浮、闪烁的几何字形 / 微光点（低透明度，增加纵深与生气）——
        const minWH = Math.min(w, h);
        for (const d of dust) {
          d.x += d.vx * 60 + mcx * 0.00002;
          d.y += d.vy * 60;
          if (d.y < -0.06) { d.y = 1.06; d.x = Math.random(); }
          if (d.x < -0.06) d.x = 1.06; else if (d.x > 1.06) d.x = -0.06;
          const px = d.x * w + mcx * d.r * 0.6;
          const py = d.y * h + mcy * d.r * 0.6;
          const tw = 0.5 + 0.5 * Math.sin(now * 0.0009 + d.ph);
          const alpha = 0.06 + tw * 0.17;
          if (d.glyph) {
            ctx.font = Math.round(d.r) + 'px Georgia, "Times New Roman", serif';
            ctx.fillStyle = d.emerald ? 'rgba(40,170,145,' + alpha.toFixed(3) + ')' : rgba(alpha * 0.8);
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(d.glyph, px, py);
          } else {
            ctx.fillStyle = d.emerald ? 'rgba(60,200,170,' + alpha.toFixed(3) + ')' : 'rgba(255,255,255,' + (alpha * 0.7).toFixed(3) + ')';
            ctx.beginPath(); ctx.arc(px, py, d.r * 0.14, 0, Math.PI * 2); ctx.fill();
          }
        }

        // —— 充能环：环绕 ∞ 的椭圆能量弧，随真实加载进度点亮（品牌克莱因蓝 + 领头光点）——
        const prog = Math.max(0, Math.min(1, preloaderProgress));
        const ringR = scale * 1.62, ringRy = scale * 0.94;
        ctx.save();
        ctx.strokeStyle = rgba(0.10);
        ctx.lineWidth = Math.max(1.2, scale * 0.014);
        ctx.beginPath();
        ctx.ellipse(cx, cy, ringR, ringRy, 0, 0, Math.PI * 2);
        ctx.stroke();
        if (prog > 0.001) {
          const startA = -Math.PI / 2;
          const endA = startA + prog * Math.PI * 2;
          ctx.strokeStyle = rgba(0.42 + 0.35 * prog);
          ctx.lineWidth = Math.max(1.2, scale * 0.02);
          ctx.shadowColor = rgba(0.9);
          ctx.shadowBlur = 16;
          ctx.beginPath();
          ctx.ellipse(cx, cy, ringR, ringRy, 0, startA, endA);
          ctx.stroke();
          ctx.shadowBlur = 0;
          const tx2 = cx + Math.cos(endA) * ringR;
          const ty2 = cy + Math.sin(endA) * ringRy;
          const tipR = Math.max(3, scale * 0.045);
          const tip = ctx.createRadialGradient(tx2, ty2, 0, tx2, ty2, tipR);
          tip.addColorStop(0, 'rgba(150,172,255,0.95)');
          tip.addColorStop(1, 'rgba(150,172,255,0)');
          ctx.fillStyle = tip;
          ctx.beginPath(); ctx.arc(tx2, ty2, tipR, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();

        // —— 点亮脉冲：进度到位瞬间，环后爆发一圈扩张光环，点燃进入的一刻 ——
        if (prog >= 0.999) {
          if (pulseStart < 0) pulseStart = now;
          const pt = (now - pulseStart) / 900; // 0..1 / 900ms
          if (pt < 1) {
            const ease = 1 - Math.pow(1 - pt, 3);
            const prad = ringR * (0.4 + ease * 1.15);
            const pAlpha = (1 - pt) * 0.5;
            ctx.strokeStyle = 'rgba(255,255,255,' + pAlpha.toFixed(3) + ')';
            ctx.lineWidth = Math.max(2, scale * 0.05 * (1 - pt * 0.6));
            ctx.beginPath();
            ctx.ellipse(cx, cy, prad, prad * (ringRy / ringR), 0, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      };

      let raf = 0;
      const loop = (now) => { draw(now); raf = requestAnimationFrame(loop); };
      raf = requestAnimationFrame(loop);

      return () => {
        cancelAnimationFrame(raf);
        window.removeEventListener('resize', resize);
        window.removeEventListener('pointermove', onMove);
      };
    };
    stopPreloaderAnim = startMathPreloader(mathCanvas);

    /* ---------- 预加载：真实进度 + 双层幕布 + 首屏重叠交接 ---------- */
    const formulaEl = $('#preloaderFormula');
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
      let formulaShown = false;
      const updateHud = () => {
        if (barEl) barEl.style.transform = 'scaleX(' + (counter.v / 100) + ')';
        preloaderProgress = counter.v / 100; // 供画布充能环读取
        // 进度过半，数学公式淡入 —— 与画布并作"美在至简"的收束点
        if (!formulaShown && counter.v >= 42 && formulaEl) {
          gsap.to(formulaEl, { autoAlpha: 1, duration: .7, ease: 'power2.out' });
          formulaShown = true;
        }
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
        .to(formulaEl, { y: -22, autoAlpha: 0, duration: .4, ease: 'power2.in' }, 0)
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
