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
  // 刷新时浏览器会恢复曾经的滚动位置，把页面顶到中间、跳过 hello 首屏。
  // 这里关掉滚动恢复：过渡页放完必须停在 hello 主页；除非 URL 自带 #锚点
  // （那是有意深链，仍按锚点跳转到对应章节）。
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
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

  /* ---------- 声音开关（SOUND[|/»]）：WebAudio 合成微音效，无音频文件，默认开 ---------- */
  const initSound = () => {
    const btn = document.getElementById('soundToggle');
    if (!btn) return;
    let ctx = null, master = null, enabled = true; // 默认打开：首次访问未存值即启用
    try {
      const s = localStorage.getItem('f8k-sound');
      enabled = s === null ? true : s === 'on';
    } catch (e) { /* 隐私模式 */ }
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
      const pass = window.prompt(typeof window.F8K_T === 'function' ? F8K_T('lock.prompt') : 'PASSCODE — enter passcode to unlock this project');
      if (pass === '2026') {
        row.classList.remove('is-locked');
        row.removeAttribute('data-cursor-label');
        row.removeAttribute('data-i18n-cursor');
        const tk = (k) => (typeof window.F8K_T === 'function' ? F8K_T(k) : k);
        row.setAttribute('aria-label', tk('lock.unlockedAria'));
        row.querySelector('.more-list__name').textContent = tk('lock.unlockedName');
        row.querySelector('.more-list__meta').textContent = tk('lock.unlockedMeta');
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

  /* ---------- 一言 hitokoto：页脚每日一句（按天缓存；英文默认展示静态句，中文才请求接口） ---------- */
  const initHitokoto = () => {
    const el = document.getElementById('hitokoto');
    if (!el) return;
    const KEY = 'f8k-hito:v1';
    const today = new Date().toISOString().slice(0, 10);
    const localQuote = () => (typeof window.F8K_T === 'function' ? F8K_T('footer.quote') : '「把想法做成会呼吸的界面。」 —— 本站');
    const render = (text) => { el.textContent = text; };
    let cache = null;
    try { cache = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { /* 隐私模式 */ }
    // 非中文界面：不请求中文一言接口，直接展示静态句（i18n 随语言更新）
    if (window.F8K_LANG !== 'zh') { render(localQuote()); return; }
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
        .catch(() => render(localQuote()));
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

  /* ---------- 作品横滑长卷（Awwwards 式 sticky 横向滚动） ----------
     桌面：滚动驱动 —— 进入 #work 后舞台吸顶，滚动进度映射为卡组的横向位移；
     触屏：CSS 原生横滑 + 吸附（见 style.css coarse 分支）。 */
  const initDeck = () => {
    const deck = document.getElementById('deck');
    const strip = document.getElementById('deckStrip');
    const idxEl = document.getElementById('deckIdx');
    if (!deck || !strip) return null;

    const st = { deck, strip, idxEl, x: 0, minX: 0, cardMids: [] };
    const clampX = (v) => Math.min(0, Math.max(st.minX, v));
    const measure = () => {
      st.minX = Math.min(0, deck.clientWidth - strip.scrollWidth - 24);
      st.cardMids = Array.from(strip.children).map((c) => c.offsetLeft + c.offsetWidth / 2);
    };
    const apply = () => {
      strip.style.transform = 'translate3d(' + Math.round(st.x) + 'px,0,0)';
      if (!idxEl || !st.cardMids.length) return;
      // 视口中点相对 strip 的坐标 = deck 半宽 - x（getBoundingClientRect 换成缓存数学，零布局读）
      const mid = deck.clientWidth / 2 - st.x;
      let active = 0, best = Infinity;
      for (let i = 0; i < st.cardMids.length; i++) {
        const d = Math.abs(st.cardMids[i] - mid);
        if (d < best) { best = d; active = i; }
      }
      idxEl.textContent = String(active + 1).padStart(2, '0') + ' / ' + String(st.cardMids.length).padStart(2, '0');
    };
    st.measure = measure;
    st.apply = apply;

    let dRsz;
    window.addEventListener('resize', () => {
      clearTimeout(dRsz);
      dRsz = setTimeout(() => { measure(); st.x = clampX(st.x); apply(); }, 200);
    });
    window.addEventListener('load', () => { measure(); apply(); });
    measure();
    apply();
    return st;
  };
  const deckState = initDeck();

  /* 桌面 sticky 横向长卷：ScrollTrigger scrub（须在 registerPlugin 之后调用） */
  const initDeckScroll = (st) => {
    if (!st || typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;
    gsap.matchMedia().add('(hover: hover) and (pointer: fine)', () => {
      const hscroll = st.deck.closest('.hscroll');
      if (!hscroll) return;
      const setHeight = () => {
        st.measure();
        hscroll.style.height = (window.innerHeight + Math.abs(st.minX) + 160) + 'px';
        ScrollTrigger.refresh(); // 高度变化后重算 start/end，保证 scrub 与 sticky 行程一致
      };
      setHeight();
      let hRsz = null;
      const onResize = () => {
        clearTimeout(hRsz);
        hRsz = setTimeout(setHeight, 200);
      };
      window.addEventListener('resize', onResize);
      const trig = ScrollTrigger.create({
        trigger: hscroll,
        start: 'top top',
        end: 'bottom bottom',
        scrub: 1,
        invalidateOnRefresh: true,
        onUpdate: (self) => { st.x = self.progress * st.minX; st.apply(); }
      });
      return () => {
        trig.kill();
        window.removeEventListener('resize', onResize);
        clearTimeout(hRsz);
        hscroll.style.height = '';
      };
    });
  };

  /* ---------- 火漆封缄：盖章 → 花瓣信风 + 棱镜闪亮 + 微音效（紫罗兰手札签名彩蛋） ---------- */
  const initSeal = () => {
    const seal = document.getElementById('seal');
    if (!seal) return;
    let busy = false;
    seal.addEventListener('click', () => {
      if (busy) return;
      busy = true;
      seal.classList.remove('is-stamping');
      void seal.offsetWidth; // 强制回流以重启动画
      seal.classList.add('is-stamping');
      if (window.__f8kSound) window.__f8kSound(210, .22, 'triangle');
      if (window.F8K_PETALS && window.F8K_PETALS.gust) window.F8K_PETALS.gust();
      if (window.F8K_PRISM && window.F8K_PRISM.boost) window.F8K_PRISM.boost();
      setTimeout(() => { seal.classList.remove('is-stamping'); busy = false; }, 750);
    });
  };
  initSeal();

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
    document.querySelectorAll('.service, .stack__item').forEach((card) => {
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

    /* 作品横向长卷：滚动驱动（依赖已注册的 ScrollTrigger） */
    initDeckScroll(deckState);

    /* Lenis 平滑滚动 */
    if (window.Lenis) {
      lenis = new window.Lenis({ duration: 0.75, smoothWheel: true });
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add((t) => lenis.raf(t * 1000));
      gsap.ticker.lagSmoothing(0);
    }

    /* ---------- 预加载：莫比乌斯环 + 3D 轨道画布 ----------
       单侧曲面、一个边界 —— 数学里最优雅的"悖论之美"；
       克莱因蓝轨道与玻璃同相机透视（前后遮挡），彗星开普勒式绕过扭结并照亮玻璃；
       配合下方欧拉恒等式，构成"数学美感"的收束意象。
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

      const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#6b56d3';
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
      /* ---------- 背景尘埃三层景深（远/中在玻璃之下，近层小星火在玻璃之上） ----------
         远层大而淡（出 blur 通道后自带失焦感），近层小且亮；
         远/中层的粒子各有点亮阈值 litAt —— 加载进度跨过阈值即被"点亮"，参与充能叙事。 */
      const DUST_LAYER = [
        { n: 16, r: [18, 32], a: [0.04, 0.09], par: 0.35 },
        { n: 16, r: [9, 15],  a: [0.08, 0.16], par: 0.75 },
        { n: 14, r: [3, 6],   a: [0.16, 0.30], par: 1.30 }
      ];
      let dust = [];
      function seedDust() {
        dust = [];
        DUST_LAYER.forEach((L, layer) => {
          for (let i = 0; i < L.n; i++) {
            const isGlyph = layer < 2 && i % 3 === 0;
            dust.push({
              layer,
              x: Math.random(), y: Math.random(),                   // 相对坐标 0..1
              r: L.r[0] + Math.random() * (L.r[1] - L.r[0]),        // 像素尺寸(字形/点)
              vx: (Math.random() - 0.5) * 0.00003 * (1 + layer * 0.5),
              vy: -(0.00003 + Math.random() * 0.00007) / (1 + layer * 0.3), // 缓慢上浮
              ph: Math.random() * Math.PI * 2,                      // 闪烁相位
              par: L.par * (0.75 + Math.random() * 0.5),            // 鼠标视差系数(层内再散开)
              litAt: layer < 2 ? 0.30 + Math.random() * 0.62 : Infinity, // 点亮阈值
              glyph: isGlyph ? GLYPHS[(Math.random() * GLYPHS.length) | 0] : null,
              emerald: Math.random() < 0.6
            });
          }
        });
      }
      seedDust();
      let pulseStart = -1;  // 点亮脉冲起始时间(未有则 -1)

      /* ---------- 轨道（环）模型：与莫比乌斯同相机旋转/投影 → 透视一体，不再"两张皮" ----------
         模型空间椭圆（带倾角），前后半按视空间 z 分绘：后半画进玻璃之下、前半画在玻璃之上；
         彗星角速度随距离 r 变化（开普勒式：靠近扭结处加速掠过）。
         预采 240 点，每帧只做旋转/投影，无额外开销。 */
      const ORBIT = { a: 1.80, b: 0.92, incl: 0.30 };
      const ORB_STEPS = 240;
      const orbModel = [];
      for (let i = 0; i < ORB_STEPS; i++) {
        const ph = (i / ORB_STEPS) * Math.PI * 2;
        orbModel.push({
          x: ORBIT.a * Math.cos(ph),
          y: ORBIT.b * Math.sin(ph) * Math.cos(ORBIT.incl),
          z: ORBIT.b * Math.sin(ph) * Math.sin(ORBIT.incl)
        });
      }
      let orbAngle = -Math.PI / 2; // 彗星从"顶端"出发
      let lastT = 0;

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

        /* —— 彗星推进：开普勒式角速度（越靠近中心扭结扫得越快）—— */
        const prog = Math.max(0, Math.min(1, preloaderProgress));
        const orbR = (ph) => Math.hypot(ORBIT.a * Math.cos(ph), ORBIT.b * Math.sin(ph));
        const dt = Math.min(Math.max(now - lastT || 16, 2), 40);
        lastT = now;
        const kp = Math.min(Math.max(1.06 / Math.max(orbR(orbAngle), 0.3), 0.72), 2.1);
        orbAngle += ((Math.PI * 2) / 13000) * kp * kp * dt;
        if (orbAngle >= Math.PI * 2) orbAngle -= Math.PI * 2;

        // 彗星模型点 → 视图/屏幕（供光照融合与分前后）
        const cometV = rotPt({
          x: ORBIT.a * Math.cos(orbAngle),
          y: ORBIT.b * Math.sin(orbAngle) * Math.cos(ORBIT.incl),
          z: ORBIT.b * Math.sin(orbAngle) * Math.sin(ORBIT.incl)
        });
        const comet = proj(cometV);
        const cometNear = cometV.z > 0;
        const cometGlowR = scale * 0.58;

        /* —— 轨道分段（按视空间 z 分前后；远段画进玻璃之下、近段画在玻璃之上）—— */
        const segs = [];
        let cur = null;
        for (let i = 0; i <= ORB_STEPS; i++) {
          const m = orbModel[i % ORB_STEPS];
          const v = rotPt(m);
          const p = proj(v);
          const near = v.z > 0;
          if (!cur || cur.near !== near) {
            if (cur) segs.push(cur);
            cur = { near, pts: [p] };
          } else cur.pts.push(p);
        }
        if (cur) segs.push(cur);

        // 充能弧：彗星身后 prog·2π 的已点亮段（与彗星同速推进，落到"无限趋近"的隐喻上）
        const nCh = Math.max(2, Math.round(ORB_STEPS * (prog + 0.001)));
        const chargedSegs = [];
        let curC = null;
        for (let k = 0; k <= nCh; k++) {
          const ph = orbAngle - (k / nCh) * prog * Math.PI * 2; // 由彗星角回扫
          const v = rotPt({
            x: ORBIT.a * Math.cos(ph),
            y: ORBIT.b * Math.sin(ph) * Math.cos(ORBIT.incl),
            z: ORBIT.b * Math.sin(ph) * Math.sin(ORBIT.incl)
          });
          const p = proj(v);
          const near = v.z > 0;
          if (!curC || curC.near !== near) {
            if (curC) chargedSegs.push(curC);
            curC = { near, pts: [p] };
          } else curC.pts.push(p);
        }
        if (curC) chargedSegs.push(curC);

        const strokeSegs = (g, list, near) => {
          for (const sg of list) {
            if (sg.near !== near || sg.pts.length < 2) continue;
            g.beginPath();
            g.moveTo(sg.pts[0].x, sg.pts[0].y);
            for (let i = 1; i < sg.pts.length; i++) g.lineTo(sg.pts[i].x, sg.pts[i].y);
            g.stroke();
          }
        };

        /* ---------- 尘埃层绘制（可指定画布：远/中层进 off 被玻璃覆盖，近层叠在玻璃上） ---------- */
        const drawDustLayer = (layer, g, t) => {
          for (const d of dust) {
            if (d.layer !== layer) continue;
            d.x += d.vx * 60;
            d.y += d.vy * 60;
            if (d.y < -0.06) { d.y = 1.06; d.x = Math.random(); }
            if (d.x < -0.05) d.x = 1.05; else if (d.x > 1.05) d.x = -0.05;
            const px = d.x * w + mcx * d.par * (10 + d.r * 0.9);
            const py = d.y * h + mcy * d.par * (10 + d.r * 0.9);
            const tw = 0.5 + 0.5 * Math.sin(t * 0.0009 + d.ph);
            let alpha = DUST_LAYER[d.layer].a[0] + tw * (DUST_LAYER[d.layer].a[1] - DUST_LAYER[d.layer].a[0]);
            // 加载进度点亮：跨过阈值的粒子渐亮并落一道柔光
            if (d.litAt < prog) {
              const k = Math.min(1, (prog - d.litAt) / 0.12);
              alpha += k * 0.16;
              if (k > 0.02) {
                const gri = Math.max(5, d.r * 0.8);
                const grd = g.createRadialGradient(px, py, 0, px, py, gri);
                grd.addColorStop(0, d.emerald ? 'rgba(233,150,178,' + (k * 0.18).toFixed(3) + ')' : 'rgba(157,140,255,' + (k * 0.16).toFixed(3) + ')');
                grd.addColorStop(1, 'rgba(255,255,255,0)');
                g.fillStyle = grd;
                g.beginPath(); g.arc(px, py, gri, 0, Math.PI * 2); g.fill();
              }
            }
            if (d.glyph) {
              g.font = Math.round(d.r) + 'px Georgia, "Times New Roman", serif';
              g.fillStyle = d.emerald ? 'rgba(181,101,127,' + alpha.toFixed(3) + ')' : rgba(alpha * 0.85);
              g.textAlign = 'center'; g.textBaseline = 'middle';
              g.fillText(d.glyph, px, py);
            } else {
              g.fillStyle = d.emerald
                ? 'rgba(181,101,127,' + alpha.toFixed(3) + ')'
                : (layer === 2 ? 'rgba(157,140,255,' + alpha.toFixed(3) + ')' : 'rgba(107,86,211,' + (alpha * 0.85).toFixed(3) + ')');
              g.beginPath(); g.arc(px, py, d.r * 0.14, 0, Math.PI * 2); g.fill();
            }
          }
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
          let alpha = CL(0.84 + f * 0.08 + spec1 * 0.05, 0.68, 0.96); // 薄透玻璃，留一点光透过

          /* —— 彗星与玻璃的光照融合：近侧掠过扫亮玻璃表面，远侧隔玻璃透出光晕 —— */
          const fcx = (a2.x + b2.x + c2.x + d2.x) / 4;
          const fcy = (a2.y + b2.y + c2.y + d2.y) / 4;
          const ddx = fcx - comet.x, ddy = fcy - comet.y;
          const dwq = (ddx * ddx + ddy * ddy) / (2 * cometGlowR * cometGlowR);
          if (dwq < 6) {
            const wq = Math.exp(-dwq);
            if (cometNear) {
              const kq = wq * 0.42; // 表面被光扫亮
              r += (255 - r) * kq; g += (255 - g) * kq; b += (255 - b) * kq;
              alpha = Math.min(alpha + wq * 0.05, 0.97);
            } else {
              const kq = wq * 0.55; // 隔玻璃透光：更穿透
              r += (232 - r) * kq; g += (255 - g) * kq; b += (248 - b) * kq;
            }
          }

          faces.push({
            a2, b2, c2, d2,
            r: Math.round(r), g: Math.round(g), b: Math.round(b), alpha, z
          });
        }
        faces.sort((p, q2) => p.z - q2.z); // 远(z 小)先画 → 近(z 大)后画

        /* —— off 合成：远/中尘埃 → 后半轨道 → 玻璃带面（玻璃压住轨道，遮挡关系真实）—— */
        octx.clearRect(0, 0, w, h);
        drawDustLayer(0, octx, now);
        drawDustLayer(1, octx, now);
        ctx.save();
        ctx.strokeStyle = rgba(0.09);
        ctx.lineWidth = Math.max(1, scale * 0.011);
        strokeSegs(octx, segs, false);
        ctx.restore();
        if (prog > 0.001) {
          ctx.save();
          ctx.strokeStyle = rgba(0.30);
          ctx.lineWidth = Math.max(1.1, scale * 0.014);
          ctx.shadowColor = rgba(0.6);
          ctx.shadowBlur = 7;
          strokeSegs(octx, chargedSegs, false);
          ctx.restore();
        }
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
        // Bloom：整体加一层屏混大模糊，玻璃获得能量光晕（"液体感"的最后一层）
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.08;
        ctx.filter = 'blur(8px)';
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

        /* —— 前半轨道 + 充能弧：画在玻璃之上（近段从带面扫过，光晕随之融合）—— */
        ctx.save();
        ctx.strokeStyle = rgba(0.20);
        ctx.lineWidth = Math.max(1.1, scale * 0.012);
        strokeSegs(ctx, segs, true);
        ctx.restore();
        if (prog > 0.001) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = rgba(0.34);
          ctx.lineWidth = Math.max(2.4, scale * 0.03);
          ctx.shadowColor = rgba(0.9);
          ctx.shadowBlur = 18;
          strokeSegs(ctx, chargedSegs, true);
          ctx.restore();
          ctx.save();
          ctx.strokeStyle = rgba(0.72);
          ctx.lineWidth = Math.max(1.2, scale * 0.014);
          ctx.shadowColor = rgba(1);
          ctx.shadowBlur = 10;
          strokeSegs(ctx, chargedSegs, true);
          ctx.restore();
        }

        /* —— 彗星：近侧亮核 + 光晕；远侧隔玻璃的透光柔晕 —— */
        const cr = Math.max(3, scale * 0.035);
        ctx.save();
        const halo = ctx.createRadialGradient(comet.x, comet.y, 0, comet.x, comet.y, cr * 5);
        if (cometNear) {
          halo.addColorStop(0, 'rgba(255,255,255,0.9)');
          halo.addColorStop(0.25, 'rgba(190,205,255,0.5)');
          halo.addColorStop(1, 'rgba(190,205,255,0)');
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = halo;
          ctx.beginPath(); ctx.arc(comet.x, comet.y, cr * 5, 0, Math.PI * 2); ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = 'rgba(255,255,255,1)';
          ctx.beginPath(); ctx.arc(comet.x, comet.y, cr * 0.55, 0, Math.PI * 2); ctx.fill();
        } else {
          halo.addColorStop(0, 'rgba(190,220,255,0.40)');
          halo.addColorStop(1, 'rgba(190,220,255,0)');
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = halo;
          ctx.beginPath(); ctx.arc(comet.x, comet.y, cr * 4, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();

        // 近层星火：叠在玻璃前面的小光点（与鼠标视差交错，最后一层"生气"）
        drawDustLayer(2, ctx, now);

        // —— 点亮脉冲：进度到位瞬间，环后爆发一圈扩张光环，点燃进入的一刻 ——
        if (prog >= 0.999) {
          if (pulseStart < 0) pulseStart = now;
          const pt = (now - pulseStart) / 900; // 0..1 / 900ms
          if (pt < 1) {
            const ease = 1 - Math.pow(1 - pt, 3);
            const prad = scale * 1.9 * (0.4 + ease * 1.15);
            const pAlpha = (1 - pt) * 0.5;
            ctx.strokeStyle = 'rgba(255,255,255,' + pAlpha.toFixed(3) + ')';
            ctx.lineWidth = Math.max(2, scale * 0.05 * (1 - pt * 0.6));
            ctx.beginPath();
            ctx.ellipse(cx, cy, prad, prad * 0.52, 0, 0, Math.PI * 2);
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
    /* ---------- 预加载 3D：Three.js 玻璃透射实体（WebGL 升维版） ----------
       与下方 2D 版本同一套莫比乌斯参数化与椭圆轨道；
       MeshPhysicalMaterial transmission=1 + ior + attenuation → 真折射/吸收玻璃；
       轨道环是连续 Torus（深度缓冲天然遮挡，不再有"半圈消失"的断裂感）；
       彗星玻璃珠带动光源扫亮玻璃，进度 100% 撞击中心触发水波纹涟漪；
       任何失败（无 WebGL / 上下文异常）返回 null，回落 2D 渲染器。 */
    const startMathPreloader3D = (canvas) => {
      const T = window.THREE;
      if (!T || !canvas) return null;
      let renderer = null, envRT = null;
      try {
        renderer = new T.WebGLRenderer({
          canvas, alpha: true, antialias: true, powerPreference: 'high-performance'
        });
        if (!renderer.getContext()) throw new Error('no-webgl');

        const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
        let w = 0, h = 0;
        const camera = new T.PerspectiveCamera(42, 1, 0.1, 60);
        camera.position.set(0, 0.16, 4.35);
        const resize = () => {
          w = canvas.clientWidth || window.innerWidth;
          h = canvas.clientHeight || window.innerHeight;
          renderer.setPixelRatio(dpr);
          renderer.setSize(w, h, false);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
        };
        resize();
        window.addEventListener('resize', resize);

        renderer.outputColorSpace = T.SRGBColorSpace;
        renderer.toneMapping = T.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.12;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = T.PCFSoftShadowMap;

        const scene = new T.Scene();
        const rig = new T.Group();
        scene.add(rig);

        /* ---------- 影棚环境：渐变穹顶 + HDR 柔光箱 → PMREM（玻璃接住长条高光） ---------- */
        const envScene = new T.Scene();
        const envBg = new T.Mesh(
          new T.SphereGeometry(12, 24, 16),
          new T.ShaderMaterial({
            side: T.BackSide,
            vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
            fragmentShader: 'varying vec3 vP; void main(){ float t = clamp(vP.y/12.0, -1.0, 1.0); vec3 top = vec3(1.0,1.0,0.99), mid = vec3(0.88,0.92,0.90), bot = vec3(0.58,0.69,0.65); vec3 c = t>0.0 ? mix(mid,top,pow(t,0.75)) : mix(mid,bot,pow(-t,0.8)); gl_FragColor = vec4(c,1.0); }'
          })
        );
        envScene.add(envBg);
        const stripMat = new T.MeshBasicMaterial();
        stripMat.color.setRGB(6, 6, 6); // HDR 白：PMREM 后玻璃反射出"柔光箱长条高光"
        const mkStrip = (px, py, pz, sx, sy) => {
          const m = new T.Mesh(new T.PlaneGeometry(sx, sy), stripMat);
          m.position.set(px, py, pz);
          m.lookAt(0, 0, 0);
          envScene.add(m);
        };
        mkStrip(-3.6, 3.4, -2.4, 2.6, 1.3);   // 上左主柔光箱
        mkStrip(4.0, 2.4, -1.6, 1.9, 0.9);    // 右上辅助箱
        mkStrip(0.4, -2.6, 4.6, 3.4, 1.5);    // 底部反光箱（让玻璃底缘亮起来）
        const pmrem = new T.PMREMGenerator(renderer);
        envRT = pmrem.fromScene(envScene, 0.05);
        scene.environment = envRT.texture;
        pmrem.dispose();

        /* ---------- 灯光：半球 + 主光（真实软阴影）+ 边缘光 ---------- */
        scene.add(new T.HemisphereLight(0xffffff, 0xd8d0e2, 0.5));
        const key = new T.DirectionalLight(0xffffff, 2.4);
        key.position.set(2.4, 3.4, 3.8);
        key.castShadow = true;
        key.shadow.mapSize.set(1024, 1024);
        key.shadow.camera.left = -2.8; key.shadow.camera.right = 2.8;
        key.shadow.camera.top = 2.4; key.shadow.camera.bottom = -2.4;
        key.shadow.camera.near = 1; key.shadow.camera.far = 12;
        key.shadow.bias = -0.0004;
        scene.add(key);
        const rim = new T.DirectionalLight(0xeae3ff, 0.9);
        rim.position.set(-3.0, -1.0, 2.2);
        scene.add(rim);

        /* ---------- 莫比乌斯玻璃带（同一参数化；闭合接缝按 Möbius 翻转缝合） ---------- */
        const MU = 200, MV = 30, MA = 1.10, MB = 0.50, MHALF = 0.30, MTH = 0.16;
        const P3 = (t, s) => {
          const cxr = MA * Math.sin(t);
          const cyr = MB * Math.sin(2 * t);
          const tx = MA * Math.cos(t), ty = 2 * MB * Math.cos(2 * t);
          const tl = Math.hypot(tx, ty) || 1;
          const Txn = tx / tl, Tyn = ty / tl;
          const nx = -Tyn, ny = Txn;
          const th = t / 2;
          const Wx = nx * Math.sin(th), Wy = ny * Math.sin(th), Wz = Math.cos(th);
          let u3x = Tyn * Wz, u3y = -Txn * Wz, u3z = Txn * Wy - Tyn * Wx;
          const u3l = Math.hypot(u3x, u3y, u3z) || 1;
          u3x /= u3l; u3y /= u3l; u3z /= u3l;
          const ow = MHALF * Math.cos(s), ot = MTH * Math.sin(s);
          return [cxr + Wx * ow + u3x * ot, cyr + Wy * ow + u3y * ot, Wz * ow + u3z * ot];
        };
        const posArr = new Float32Array(MU * MV * 3);
        const norArr = new Float32Array(MU * MV * 3);
        const ds = (Math.PI * 2) / MV, dt2 = 0.0025, tmp = [0, 0, 0];
        for (let i = 0; i < MU; i++) {
          const t = (i / MU) * Math.PI * 2;
          for (let j = 0; j < MV; j++) {
            const s = (j / MV) * Math.PI * 2;
            const k = (i * MV + j) * 3;
            const p = P3(t, s);
            posArr[k] = p[0]; posArr[k + 1] = p[1]; posArr[k + 2] = p[2];
            // 数值偏导求平滑法线：∂t（沿带）× ∂s（绕截面）
            const t1 = P3(t - dt2, s), t2r = P3(t + dt2, s);
            const s1 = P3(t, s - ds), s2r = P3(t, s + ds);
            const ax = t2r[0] - t1[0], ay = t2r[1] - t1[1], az = t2r[2] - t1[2];
            const bx = s2r[0] - s1[0], by = s2r[1] - s1[1], bz = s2r[2] - s1[2];
            const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
            const nl = Math.hypot(nx, ny, nz) || 1;
            norArr[k] = nx / nl; norArr[k + 1] = ny / nl; norArr[k + 2] = nz / nl;
          }
        }
        const bandGeo = new T.BufferGeometry();
        bandGeo.setAttribute('position', new T.BufferAttribute(posArr, 3));
        bandGeo.setAttribute('normal', new T.BufferAttribute(norArr, 3));
        const bandIdx = new Uint16Array(MU * MV * 6);
        const half = MV / 2;
        let bi = 0;
        for (let i = 0; i < MU; i++) {
          const i2 = (i + 1) % MU;
          const jShift = i2 === 0 ? half : 0; // 闭合缝：Möbius 截面翻半圈缝合
          for (let j = 0; j < MV; j++) {
            const a = i * MV + j;
            const b = i2 * MV + ((j + jShift) % MV);
            const c = i2 * MV + ((j + 1 + jShift) % MV);
            const d = i * MV + ((j + 1) % MV);
            bandIdx[bi++] = a; bandIdx[bi++] = b; bandIdx[bi++] = d;
            bandIdx[bi++] = b; bandIdx[bi++] = c; bandIdx[bi++] = d;
          }
        }
        bandGeo.setIndex(new T.BufferAttribute(bandIdx, 1));
        const glassMat = new T.MeshPhysicalMaterial({
          color: 0x6b56d3,
          metalness: 0,
          roughness: 0.08,
          transmission: 1,
          thickness: 0.6,
          ior: 1.5,
          attenuationColor: 0x3a2f8f,
          attenuationDistance: 0.85,
          clearcoat: 1,
          clearcoatRoughness: 0.06,
          envMapIntensity: 1.25,
          specularIntensity: 0.8,
          iridescence: 0.16,
          iridescenceIOR: 1.35,
          side: T.DoubleSide
        });
        const band = new T.Mesh(bandGeo, glassMat);
        band.castShadow = true;
        rig.add(band);

        /* ---------- 轨道：连续 Torus（真几何体 + 深度缓冲），亮芯 + 柔晕双层 ---------- */
        const ORB = { ax: 1.78, by: 0.92, incl: 0.30 };
        const orbitTilt = new T.Group();
        orbitTilt.rotation.x = ORB.incl;
        rig.add(orbitTilt);
        const orbitSquash = new T.Group();
        orbitSquash.scale.y = ORB.by / ORB.ax;
        orbitTilt.add(orbitSquash);
        const ringCore = new T.Mesh(
          new T.TorusGeometry(ORB.ax, 0.014, 10, 240),
          new T.MeshBasicMaterial({ color: 0x5a44d6, transparent: true, opacity: 1, toneMapped: false, depthWrite: false })
        );
        const ringHalo = new T.Mesh(
          new T.TorusGeometry(ORB.ax, 0.045, 8, 200),
          new T.MeshBasicMaterial({ color: 0x9d8cff, transparent: true, opacity: 0.1, toneMapped: false, blending: T.AdditiveBlending, depthWrite: false })
        );
        orbitSquash.add(ringCore);
        orbitSquash.add(ringHalo);

        // 充能弧（彗星身后随进度生长的段；几何随角度每帧重建，旧几何即时释放）
        const chargeMat = new T.MeshBasicMaterial({ color: 0xb9a8ff, transparent: true, opacity: 0.95, toneMapped: false, depthWrite: false });
        const chargeHaloMat = new T.MeshBasicMaterial({ color: 0x9d8cff, transparent: true, opacity: 0.35, toneMapped: false, blending: T.AdditiveBlending, depthWrite: false });
        const chargeMesh = new T.Mesh(undefined, chargeMat);
        const chargeHalo = new T.Mesh(undefined, chargeHaloMat);
        orbitSquash.add(chargeHalo);
        orbitSquash.add(chargeMesh);
        let chargeGeo = null;
        const buildCharge = (arc, headAng) => {
          const segs = Math.max(8, Math.round(240 * Math.min(arc + 0.05, 1)));
          if (chargeGeo) chargeGeo.dispose();
          chargeGeo = new T.TorusGeometry(ORB.ax, 0.014, 10, segs, arc * Math.PI * 2);
          chargeMesh.geometry = chargeGeo;
          chargeHalo.geometry = chargeGeo;
          chargeMesh.rotation.z = headAng - arc * Math.PI * 2;
          chargeHalo.rotation.z = chargeMesh.rotation.z;
        };

        /* ---------- 彗星：玻璃小珠 + 添加剂光晕 + 点光源（扫亮玻璃） ---------- */
        const cometRig = new T.Group();
        cometRig.rotation.x = ORB.incl;
        rig.add(cometRig);
        const comet = new T.Mesh(
          new T.SphereGeometry(0.075, 24, 18),
          new T.MeshPhysicalMaterial({
            color: 0xc9b8ff,
            metalness: 0,
            roughness: 0.05,
            transmission: 1,
            thickness: 0.25,
            ior: 1.5,
            attenuationColor: 0x9d8cff,
            attenuationDistance: 0.55,
            envMapIntensity: 1.4,
            specularIntensity: 1,
            clearcoat: 1,
            clearcoatRoughness: 0.03,
            side: T.DoubleSide
          })
        );
        cometRig.add(comet);
        const glowTex = (() => {
          const cv = document.createElement('canvas');
          cv.width = cv.height = 64;
          const g = cv.getContext('2d');
          const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
          gr.addColorStop(0, 'rgba(255,255,255,1)');
          gr.addColorStop(0.3, 'rgba(201,184,255,0.55)');
          gr.addColorStop(1, 'rgba(201,184,255,0)');
          g.fillStyle = gr;
          g.fillRect(0, 0, 64, 64);
          const tex = new T.CanvasTexture(cv);
          tex.needsUpdate = true;
          return tex;
        })();
        const glowSprite = new T.Sprite(new T.SpriteMaterial({
          map: glowTex, color: 0xcab8ff, transparent: true, opacity: 0.6,
          blending: T.AdditiveBlending, depthWrite: false
        }));
        glowSprite.scale.set(0.38, 0.38, 1);
        comet.add(glowSprite);
        const cometLight = new T.PointLight(0xc9b4ff, 14, 5, 2);
        comet.add(cometLight);

        let orbAngle = -Math.PI / 2;
        let lastT = 0;

        /* ---------- 粒子：WebGL Points（两层，淡蓝紫统一色调，前后景深由 rig 视差展开） ---------- */
        const PALETTE = [
          [0.66, 0.72, 1.00],  // 淡蓝
          [0.78, 0.72, 1.00],  // 淡紫
          [0.93, 0.95, 1.00]   // 近白
        ];
        const pointVerts = `
          attribute float aSize; attribute vec3 aColor; attribute float aAlpha;
          varying vec3 vC; varying float vA; uniform float uPr;
          void main(){
            vC = aColor; vA = aAlpha;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = aSize * uPr * (240.0 / -mv.z);
            gl_Position = projectionMatrix * mv;
          }`;
        const pointFrag = `
          varying vec3 vC; varying float vA;
          void main(){
            vec2 d = gl_PointCoord - 0.5;
            float r2 = dot(d, d);
            float m = smoothstep(0.25, 0.03, r2);
            float c = smoothstep(0.02, 0.0, r2) * 1.3;
            if (m < 0.01) discard;
            gl_FragColor = vec4(vC * (0.6 + c), vA * m);
          }`;
        const mkPoints = (n, zMin, zMax, sMin, sMax) => {
          const p = new Float32Array(n * 3);
          const sz = new Float32Array(n);
          const col = new Float32Array(n * 3);
          const al = new Float32Array(n);
          const meta = [];
          for (let i = 0; i < n; i++) {
            p[i * 3] = (Math.random() - 0.5) * 5.4;
            p[i * 3 + 1] = (Math.random() - 0.5) * 3.4;
            p[i * 3 + 2] = zMin + Math.random() * (zMax - zMin);
            sz[i] = sMin + Math.random() * (sMax - sMin);
            const c = PALETTE[(Math.random() * PALETTE.length) | 0];
            col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
            meta.push({
              vx: (Math.random() - 0.5) * 0.0006,
              vy: -(0.0003 + Math.random() * 0.0007),
              ph: Math.random() * Math.PI * 2,
              ab: 0.5 + Math.random() * 0.4,
              litAt: 0.3 + Math.random() * 0.65,
              alpha: 0
            });
          }
          const g = new T.BufferGeometry();
          g.setAttribute('position', new T.BufferAttribute(p, 3));
          g.setAttribute('aSize', new T.BufferAttribute(sz, 1));
          g.setAttribute('aColor', new T.BufferAttribute(col, 3));
          g.setAttribute('aAlpha', new T.BufferAttribute(al, 1));
          const mat = new T.ShaderMaterial({
            vertexShader: pointVerts,
            fragmentShader: pointFrag,
            uniforms: { uPr: { value: dpr } },
            transparent: true, depthWrite: false, depthTest: true
          });
          const mesh = new T.Points(g, mat);
          rig.add(mesh);
          return { mesh, meta, al, n };
        };
        const farPts = mkPoints(46, -1.3, -0.35, 0.03, 0.08);
        const nearPts = mkPoints(38, -0.15, 0.9, 0.02, 0.055);

        /* ---------- 地面：真实 PCF 软阴影（ShadowMaterial）+ 极淡翡翠反光 ---------- */
        const ground = new T.Mesh(
          new T.PlaneGeometry(10, 10),
          new T.ShadowMaterial({ opacity: 0.12 })
        );
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.98;
        ground.receiveShadow = true;
        scene.add(ground);
        const bounce = new T.Mesh(
          new T.PlaneGeometry(6.5, 3),
          new T.MeshBasicMaterial({ color: 0x6b56d3, transparent: true, opacity: 0.05, blending: T.AdditiveBlending, depthWrite: false })
        );
        bounce.rotation.x = -Math.PI / 2;
        bounce.position.set(0, -0.975, 0);
        scene.add(bounce);

        /* ---------- 100% 撞击涟漪（三层扩散环 + 灯光尖峰；置于玻璃前方避免穿模） ---------- */
        const rippleMat = () => new T.MeshBasicMaterial({ color: 0xb9a8ff, transparent: true, opacity: 0, toneMapped: false, depthWrite: false, side: T.DoubleSide });
        const ripples = [];
        for (let i = 0; i < 3; i++) {
          const rm = new T.Mesh(new T.RingGeometry(0.94, 1.0, 96), rippleMat());
          rm.visible = false;
          rm.position.z = 0.42;
          rig.add(rm);
          ripples.push({ mesh: rm, start: -1 });
        }
        let burstAt = -1;

        /* ---------- 交互：鼠标视差（阻尼）+ 怠速摆动 ---------- */
        let mtx = 0, mty = 0, mx = 0, my = 0;
        const onMove = (e) => {
          mtx = (e.clientX / (window.innerWidth || 1) - 0.5) * 2;
          mty = (e.clientY / (window.innerHeight || 1) - 0.5) * 2;
        };
        window.addEventListener('pointermove', onMove);
        const fit = Math.min(1, (w / h) / 1.35); // 竖屏：整体取景收缩，不裁切轨道
        rig.scale.setScalar(fit);

        /* ---------- 主循环 ---------- */
        let raf = 0;
        const tick = (now) => {
          raf = requestAnimationFrame(tick);
          const dt = Math.min(Math.max(now - lastT || 16, 2), 40);
          lastT = now;

          mx += (mtx - mx) * 0.05;
          my += (mty - my) * 0.05;

          // 彗星推进：开普勒式（靠近扭结加速）
          const rNow = Math.hypot(ORB.ax * Math.cos(orbAngle), ORB.by * Math.sin(orbAngle));
          const kp = Math.min(Math.max(1.06 / Math.max(rNow, 0.3), 0.72), 2.1);
          orbAngle += ((Math.PI * 2) / 13000) * kp * kp * dt;
          if (orbAngle >= Math.PI * 2) orbAngle -= Math.PI * 2;
          // 阻尼跟随：彗星额外朝鼠标方向轻漂（上限 0.16，回弹柔和）
          const cxd = ORB.ax * Math.cos(orbAngle) + mx * 0.10;
          const cyd = ORB.by * Math.sin(orbAngle) + my * 0.10;
          comet.position.set(cxd, cyd, 0);

          const prog = Math.max(0, Math.min(1, preloaderProgress));
          buildCharge(prog, orbAngle);

          // 粒子：闪烁 + 加载进度点亮（位置缓慢漂移，越界回卷）
          const dtf = dt / 16.67;
          const updPts = (P2, tw) => {
            const attr = P2.mesh.geometry.attributes.position;
            for (let i = 0; i < P2.n; i++) {
              const d = P2.meta[i];
              attr.array[i * 3] += d.vx * dtf;
              attr.array[i * 3 + 1] += d.vy * dtf;
              if (attr.array[i * 3 + 1] < -1.8) attr.array[i * 3 + 1] = 1.8;
              if (attr.array[i * 3] < -2.9) attr.array[i * 3] = 2.9;
              else if (attr.array[i * 3] > 2.9) attr.array[i * 3] = -2.9;
              const twk = 0.55 + 0.45 * Math.sin(tw * 0.0011 + d.ph);
              let a = d.ab * twk;
              if (prog > d.litAt) a += 0.5 * Math.min(1, (prog - d.litAt) / 0.12);
              P2.al[i] = Math.min(a, 1);
            }
            attr.needsUpdate = true;
            P2.mesh.geometry.attributes.aAlpha.needsUpdate = true;
          };
          updPts(farPts, now);
          updPts(nearPts, now);

          // rig 姿态：鼠标视差 + 怠速
          rig.rotation.y = mx * 0.30 + Math.sin(now * 0.00042) * 0.10;
          rig.rotation.x = 0.30 + my * 0.14 + Math.sin(now * 0.0006) * 0.03;
          rig.rotation.z = Math.sin(now * 0.00031) * 0.05;
          rig.position.y = Math.sin(now * 0.0011) * 0.05;

          // 彗星光随位置起伏；100% 时撞击：涟漪扩散 + 灯光尖峰
          cometLight.intensity = 14 + Math.sin(now * 0.003) * 2;
          if (prog >= 0.999 && burstAt < 0) {
            burstAt = now;
            ripples[0].start = now;
            ripples[1].start = now + 170;
            ripples[2].start = now + 340;
          }
          if (burstAt > 0) {
            for (const rp of ripples) {
              const t0 = rp.start;
              if (t0 < 0) continue;
              const pt = (now - t0) / 950;
              if (pt >= 0 && pt < 1) {
                const e = 1 - Math.pow(1 - pt, 3);
                rp.mesh.visible = true;
                rp.mesh.scale.setScalar(0.22 + e * 4.0);
                rp.mesh.material.opacity = (1 - pt) * 0.75;
              } else if (pt >= 1) rp.mesh.visible = false;
            }
            const bd = (now - burstAt) / 900;
            if (bd < 1) {
              key.intensity = 2.4 + Math.sin(bd * Math.PI) * 1.4;
              cometLight.intensity += (1 - bd) * 22;
            } else key.intensity = 2.4;
          }

          renderer.render(scene, camera);
        };
        raf = requestAnimationFrame(tick);
        window.__f8kPreload3d = true; // 3D 预加载渲染器已接管（调试验证标记）

        return () => {
          cancelAnimationFrame(raf);
          window.removeEventListener('resize', resize);
          window.removeEventListener('pointermove', onMove);
          scene.traverse((o) => {
            if (o.geometry) o.geometry.dispose();
            if (o.material) {
              if (o.material.map) o.material.map.dispose();
              o.material.dispose();
            }
          });
          envRT.dispose();
          renderer.dispose();
        };
      } catch (e) {
        // WebGL 不可用/异常：清理已创建资源后回落 2D 渲染器
        try {
          if (envRT) envRT.dispose();
          if (renderer) renderer.dispose();
        } catch (_) { /* ignore */ }
        return null;
      }
    };
    /* 优先 WebGL 玻璃渲染；任何失败回落 2D（错误边界 recover() 保底不卡屏）。
       three.min.js 已在页面头常驻加载——标记为已就绪，hero/lab 懒加载直接复用。 */
    window.__f8kThree = window.__f8kThree || Promise.resolve();
    stopPreloaderAnim = (startMathPreloader3D(mathCanvas) || startMathPreloader(mathCanvas));

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

    gsap.set('.footer__title .line > span', { yPercent: 115 });
    gsap.set('[data-hero-fade]', { y: 26, autoAlpha: 0 });

    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const tween = (target, vars) => new Promise((r) => gsap.to(target, { ...vars, onComplete: r }));

    (async () => {
      // 计数走到 90 后等真实就绪（或超时/跳过），再收尾到 100
      let formulaShown = false;
      const pctEl = document.getElementById('preloaderPct');
      const updateHud = () => {
        if (barEl) barEl.style.transform = 'scaleX(' + (counter.v / 100) + ')';
        if (pctEl) pctEl.textContent = String(Math.round(counter.v)).padStart(2, '0');
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
        onComplete: () => {
          recover();
          gotoInitialHash(true);
          // 无 #锚点：交回 hello 首屏（已禁滚动恢复，此处兜底回顶，避免任何残留偏移）
          if (!location.hash || location.hash.length <= 1) {
            if (lenis) lenis.scrollTo(0, { immediate: true });
            else window.scrollTo({ top: 0 });
          }
        }
      });
      tl.to('.preloader__brand', { y: -26, autoAlpha: 0, duration: .4, ease: 'power2.in' }, 0)
        .to('.preloader__pct', { y: -26, autoAlpha: 0, duration: .4, ease: 'power2.in' }, 0)
        .to(formulaEl, { y: -22, autoAlpha: 0, duration: .4, ease: 'power2.in' }, 0)
        .to(barEl, { autoAlpha: 0, duration: .3 }, 0)
        .to(preloader, { yPercent: -100, duration: .85, ease: 'power4.inOut' }, .15)
        .to(slatEl, { yPercent: -100, duration: .85, ease: 'power4.inOut' }, .26)
        .add(() => { doc.classList.remove('loading'); }, .95) // 幕布基本过半即解锁滚动
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

    /* ---------- 关于段落：逐字点亮（中文按字、英文按词；f8k-lang 时重建） ---------- */
    let wordSplitTweens = [];
    const initWordSplit = () => {
      wordSplitTweens.forEach((tw) => { if (tw) { if (tw.scrollTrigger) tw.scrollTrigger.kill(); tw.kill(); } });
      wordSplitTweens = [];
      document.querySelectorAll('[data-split]').forEach((p) => {
        if (p.dataset.i18n && window.F8K_T) p.textContent = F8K_T(p.dataset.i18n);
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
        // 逐词揭示：透明度 + 微上浮 + 模糊三重（Bombon 式，scrub 随滚动推进）
        const tw = gsap.fromTo(p.querySelectorAll('.word'),
          { opacity: .12, y: '.28em', filter: 'blur(4px)' },
          {
            opacity: 1, y: 0, filter: 'blur(0px)',
            ease: 'none',
            stagger: .03,
            scrollTrigger: { trigger: p, start: 'top 82%', end: 'top 30%', scrub: true }
          });
        wordSplitTweens.push(tw);
      });
    };
    initWordSplit();

    /* ---------- 作品卡组视差已由横滑叠放（initDeck）取代 ---------- */

    /* ---------- 章节大数字视差 ---------- */
    gsap.utils.toArray('.sec-head__num').forEach((el) => {
      gsap.from(el, {
        y: 50,
        ease: 'none',
        scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom center', scrub: true }
      });
    });

    /* ---------- 章节标题逐字清晰浮现（React Bits "Blur Text"；f8k-lang 时重建） ---------- */
    let blurTitleTweens = [];
    const initBlurTitles = () => {
      blurTitleTweens.forEach((tw) => { if (tw) { if (tw.scrollTrigger) tw.scrollTrigger.kill(); tw.kill(); } });
      blurTitleTweens = [];
      document.querySelectorAll('.sec-head__labels h2').forEach((el) => {
        if (el.dataset.i18n && window.F8K_T) el.textContent = F8K_T(el.dataset.i18n);
        const chars = Array.from(el.textContent);
        el.innerHTML = '';
        chars.forEach((ch) => {
          const s = document.createElement('span');
          s.className = 'blur-char';
          s.textContent = ch;
          el.appendChild(s);
        });
        const tw = gsap.fromTo(el.querySelectorAll('.blur-char'),
          { filter: 'blur(12px)', opacity: 0, y: 14 },
          { filter: 'blur(0px)', opacity: 1, y: 0, duration: .85, ease: 'power3.out', stagger: .05,
            scrollTrigger: { trigger: el, start: 'top 90%' } });
        blurTitleTweens.push(tw);
      });
    };
    initBlurTitles();

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

    /* ---------- 跑马灯（GSAP 官网式）：速度驱动 + 桌面 pin 驻留（首屏与关于之间的翻章停顿） ----------
       has-anim 已停用 CSS 无限动画；空闲慢漂 72px/s，滚动按速度加速/反向，
       data-direction="right" 反向流动；位移按单套内容宽度取模循环（负向同样无缝） */
    const mqState = Array.from(document.querySelectorAll('.marquee')).map((el) => {
      const track = el.querySelector('.marquee__track');
      if (!track || !track.children[0]) return null;
      return {
        marquee: el,
        track,
        offset: 0,
        setW: 1,
        dir: el.dataset.direction === 'right' ? -1 : 1,
        skew: gsap.quickTo(el, 'skewX', { duration: .5, ease: 'power3' })
      };
    }).filter(Boolean);
    const mqMeasure = () => mqState.forEach((s) => { s.setW = Math.max(1, s.track.children[0].offsetWidth); });
    mqMeasure();
    let mqRsz;
    window.addEventListener('resize', () => {
      clearTimeout(mqRsz);
      mqRsz = setTimeout(mqMeasure, 200);
    });
    // 桌面：首段跑马灯在视口上部驻留一段滚动，期间速度直接转化为文字流速
    if (mqState.length && typeof gsap.matchMedia === 'function') {
      gsap.matchMedia().add('(min-width: 901px)', () => {
        const st = ScrollTrigger.create({
          trigger: mqState[0].marquee, start: 'top 14%', end: '+=42%',
          pin: true, anticipatePin: 1, refreshPriority: -1
        });
        return () => st.kill();
      });
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
      if (mqState.length) {
        mqState.forEach((s) => {
          s.offset += (72 + v * 0.85) * s.dir * dt;
          const x = ((s.offset % s.setW) + s.setW) % s.setW; // 负向位移同样落在 [0, setW)
          s.track.style.transform = 'translate3d(' + (-x) + 'px,0,0)';
          s.skew(gsap.utils.clamp(-8, 8, v / 260) * s.dir);
        });
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
      const nameOf = (key) => (key === 'HELLO' ? 'HELLO' : (typeof window.F8K_T === 'function' ? F8K_T(key) : key));
      const setChapter = (i, num, key) => {
        if (i === hudCur) return;
        hudCur = i;
        hudNum.textContent = num;
        hudName.textContent = nameOf(key);
        gsap.fromTo([hudNum, hudName],
          { y: 8, autoAlpha: 0 },
          { y: 0, autoAlpha: 1, duration: .45, ease: 'power3.out', stagger: .04, overwrite: true });
      };
      const CHAPTERS = [
        ['#about', '01', 'sec.about'], ['#services', '02', 'sec.services'], ['#skills', '03', 'sec.skills'],
        ['#work', '04', 'sec.work'], ['#exp', '05', 'sec.exp'], ['#voices', '06', 'sec.voices'],
        ['#lab', '07', 'sec.lab'], ['#play', '08', 'sec.play'], ['#stack', '09', 'sec.stack'],
        ['#contact', '10', 'sec.contact']
      ];
      CHAPTERS.forEach(([sel, num, key], i) => {
        const trig = document.querySelector(sel);
        if (!trig) return;
        ScrollTrigger.create({
          trigger: trig, start: 'top 60%',
          // 末章（页脚）end 钉到滚动尽头：pin 占位会使其 bottom 计算偏短，滚到底会失活
          end: i === CHAPTERS.length - 1 ? 'max' : 'bottom 60%',
          onToggle: (self) => { if (self.isActive) setChapter(i, num, key); }
        });
      });
      ScrollTrigger.create({
        trigger: '.hero', start: 'top top', end: 'bottom 60%',
        onToggle: (self) => { if (self.isActive) setChapter(-1, '00', 'HELLO'); }
      });
      // 语言切换：仅刷新当前章节读数，不重放动画
      document.addEventListener('f8k-lang', () => {
        if (hudCur === -1) { hudName.textContent = 'HELLO'; return; }
        const entry = CHAPTERS[hudCur];
        if (entry) hudName.textContent = nameOf(entry[2]);
      });
      // 滚入深色页脚时 HUD 反白
      const footer = document.querySelector('.footer');
      if (footer) ScrollTrigger.create({
        trigger: footer, start: 'top 70%',
        onToggle: (self) => doc.classList.toggle('at-footer', self.isActive)
      });
    }

    /* ---------- Scrollspy：导航药丸填色标记当前章节 ---------- */
    const spyLinks = Array.from(document.querySelectorAll('.header__nav a[href^="#"]'));
    if (spyLinks.length) {
      const setActive = (link) => {
        spyLinks.forEach((l) => l.classList.toggle('is-active', l === link));
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
      // 首屏区间不点亮任何项，药丸全部回底色
      ScrollTrigger.create({
        trigger: '.hero', start: 'top top', end: 'bottom 55%',
        onToggle: (self) => { if (self.isActive) setActive(null); }
      });
    }

    /* ---------- 药丸导航 hover（Port: React Bits PillNav）：底部圆扩 + 双层标签上滑 ---------- */
    const initPillNav = () => {
      if (typeof gsap === 'undefined') return;
      const links = Array.from(document.querySelectorAll('.header__nav a[href^="#"]'));
      if (!links.length) return;
      const ease = 'power3.out';
      const items = [];
      // 注入 pill 内部结构：<a> → 圆 + 双层标签
      links.forEach((link) => {
        const label = link.textContent.trim();
        link.innerHTML = '';
        const circle = document.createElement('span');
        circle.className = 'hover-circle';
        circle.setAttribute('aria-hidden', 'true');
        link.appendChild(circle);
        const stack = document.createElement('span');
        stack.className = 'label-stack';
        const base = document.createElement('span');
        base.className = 'pill-label';
        base.textContent = label;
        const hover = document.createElement('span');
        hover.className = 'pill-label-hover';
        hover.setAttribute('aria-hidden', 'true');
        hover.textContent = label;
        stack.appendChild(base);
        stack.appendChild(hover);
        link.appendChild(stack);
        items.push({ link, circle, base, hover, tl: null, tween: null });
      });
      // 依实时几何布置圆：圆通过药丸上下两角，origin 在圆心下端
      const layout = () => {
        items.forEach((it) => {
          const rect = it.link.getBoundingClientRect();
          const w = rect.width, h = rect.height;
          if (!w || !h) return;
          const R = (w * w / 4 + h * h) / (2 * h);
          const D = Math.ceil(2 * R) + 2;
          const delta = Math.ceil(R - Math.sqrt(Math.max(0, R * R - w * w / 4))) + 1;
          const originY = D - delta;
          it.circle.style.width = D + 'px';
          it.circle.style.height = D + 'px';
          it.circle.style.bottom = -delta + 'px';
          gsap.set(it.circle, { xPercent: -50, scale: 0, transformOrigin: '50% ' + originY + 'px' });
          gsap.set(it.base, { y: 0 });
          gsap.set(it.hover, { y: Math.ceil(h * 3), opacity: 0 });
          if (it.tl) it.tl.kill();
          const tl = gsap.timeline({ paused: true });
          tl.to(it.circle, { scale: 1.2, xPercent: -50, duration: 2, ease, overwrite: 'auto' }, 0);
          tl.to(it.base, { y: -(h + 8), duration: 2, ease, overwrite: 'auto' }, 0);
          tl.to(it.hover, { y: 0, opacity: 1, duration: 2, ease, overwrite: 'auto' }, 0);
          it.tl = tl;
          it.h = h;
        });
      };
      layout();
      let rT;
      window.addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(layout, 200); });
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout).catch(() => {});
      // 进 / 出：暂停时间线按 tweenTo 定向补间（连续滚动时快速终止）
      items.forEach((it) => {
        it.link.addEventListener('mouseenter', () => {
          if (!it.tl) return;
          if (it.tween) it.tween.kill();
          it.tween = it.tl.tweenTo(it.tl.duration(), { duration: .3, ease, overwrite: 'auto' });
        });
        it.link.addEventListener('mouseleave', () => {
          if (!it.tl) return;
          if (it.tween) it.tween.kill();
          it.tween = it.tl.tweenTo(0, { duration: .2, ease, overwrite: 'auto' });
        });
      });
    };
    initPillNav();

    /* ---------- Header 滚动态 ---------- */
    const header = $('.header');
    const onScroll = () => {
      if (header) header.classList.toggle('is-scrolled', window.scrollY > 40);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    /* ---------- 语言切换：重建逐字揭示 / 章节标题 / 页脚一言 / 跑马灯宽度 ---------- */
    document.addEventListener('f8k-lang', () => {
      if (typeof window.F8K_T !== 'function') return;
      initWordSplit();
      initBlurTitles();
      initHitokoto();
      if (typeof mqMeasure === 'function') mqMeasure();
    });

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
