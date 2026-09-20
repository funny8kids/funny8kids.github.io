/* LUMEN VIOLA — orchestrator */
(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const root = document.documentElement;
  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger;
  const Lenis = window.Lenis;

  if (reduceMotion) root.classList.add('no-motion');
  if (gsap && ScrollTrigger) gsap.registerPlugin(ScrollTrigger);

  /* ================= i18n ================= */
  const dict = {
    zh: {
      nav_garden: '花园',
      nav_physics: '物理园',
      nav_bloom: '盛开',
      nav_notes: '手记',
      nav_visit: '来访',
      nav_cta: '进入',
      hero_eyebrow: '一座会呼吸的生物荧光温室',
      hero_welcome: 'Enter the',
      hero_lead: '深夜玻璃温室。滚动是行走，光标是萤火，花瓣服从风与重力。<br>这里没有按钮堆砌——只有会呼吸的光。',
      hero_cta1: '走进温室',
      hero_cta2: '触碰风场',
      hero_scroll: 'Scroll to walk through',
      mq_night: '夜间温室',
      mq_touch: '风 · 花 · 物理',
      garden_title: '温室初见',
      garden_kicker: '光线的三条法则',
      g1_t: '柔光',
      g1_p: '晨雾与暮色之间的那一抹紫。光线不刺眼，却足以照亮每一页笔记。',
      g2_t: '风场',
      g2_p: '光标不是装饰，是风。靠近时花瓣退让，静止时它们回到呼吸的轨道。',
      g3_t: '手记',
      g3_p: '灵感不必宏大。一句观察、一次调试、一场雨后的散步，都可以成为笔记。',
      physics_title: '物理花园',
      physics_lead: '巨型标题是坚硬的地面。花瓣服从重力——拖拽、抛掷、滚动施力。这是温室里唯一允许失控的地方。',
      physics_hint: '拖拽 · 滚动 · 点击',
      nav_gallery: '陈列廊',
      nav_works: '项目',
      works_title: '花园作品',
      w1_t: 'VioletNotes · 紫罗兰笔记',
      w1_p: '一座随身的手记温室。灵感像花瓣随手种下，回顾时按季节盛开——速记、标签、跨端同步，深色虹彩主题。',
      w2_t: '温室物理 · Physics Playground',
      w2_p: '把 matter-js 的约束演示种进花园：刚与软的锚、销钉与绳链，巨型标题成为坚硬的地面。拖拽即对话。',
      w3_t: '萤火实验室 · Lumen Lab',
      w3_p: 'WebGL 花瓣场与交互动效的试验田：光标是风，点击是冲击波，每一帧都在呼吸。所有签名动效由此诞生。',
      w_link: '了解此项目 ↗',
      interlude_t: 'Grown in the dark',
      interlude_sub: '黑暗，是这座温室最深的底色',
      exp_l1: '在最安静的时刻',
      exp_l2: '轻轻盛开',
      exp_p: 'LUMEN VIOLA 不追逐喧闹。它邀请你放慢一拍——看清虹彩、物理与留白如何共同完成一场小型演出。',
      stat1: 'FPS 丝滑滚动',
      stat2: '中 / 英 双语',
      stat3: '可被记住的瞬间',
      notes_title: '园中手记',
      notes_quote: '把界面做成一座会呼吸的温室：<br>留白是空地，动效是微风，物理是真实的重量。',
      notes_quote_by: '— LUMEN VIOLA · 设计备忘',
      n1_t: '一束冷色信号',
      n1_p: '全站几乎单色紫。唯一的青只出现在光标与 HUD——破局点克制到一次就够。',
      n2_t: '有目的的动效',
      n2_p: '每一次出现都回答一个问题：用户该看向哪里？少了干扰，多了叙事。',
      n3_t: '一个签名时刻',
      n3_p: '整页只留一处「失控」——物理花园。花瓣砸在标题上，比任何形容词都诚实。',
      visit_title: '欢迎来访',
      visit_lead: '温室永远半掩着门。若你想聊聊设计、代码，或只是分享一句园中所见——',
      visit_top: '回到入口',
      footer_tag: '以生物荧光紫罗兰之光打造',
    },
    en: {
      nav_garden: 'Garden',
      nav_physics: 'Physics',
      nav_bloom: 'Bloom',
      nav_notes: 'Notes',
      nav_visit: 'Visit',
      nav_cta: 'Enter',
      hero_eyebrow: 'A living bioluminescent greenhouse',
      hero_welcome: 'Enter the',
      hero_lead: 'A glass house at night. Scroll is a walk. Your cursor is a firefly.<br>Petals obey wind and gravity — nothing else competes.',
      hero_cta1: 'Enter the house',
      hero_cta2: 'Touch the wind',
      hero_scroll: 'Scroll to walk through',
      mq_night: 'Night Greenhouse',
      mq_touch: 'Wind · Petals · Physics',
      garden_title: 'First light',
      garden_kicker: 'Three laws of light',
      g1_t: 'Soft light',
      g1_p: 'That violet between dawn mist and dusk. Never harsh — just enough to illuminate every note.',
      g2_t: 'Wind field',
      g2_p: 'The cursor is not decoration; it is wind. Petals yield when you approach, then resume their breath.',
      g3_t: 'Field notes',
      g3_p: 'Inspiration need not be grand. An observation, a debug session, a walk after rain — all can become notes.',
      physics_title: 'Physics garden',
      physics_lead: 'Giant type is solid ground. Petals obey gravity — drag, throw, scroll. The only place allowed to lose control.',
      physics_hint: 'DRAG · SCROLL · CLICK',
      nav_gallery: 'Gallery',
      nav_works: 'Works',
      works_title: 'Selected works',
      w1_t: 'VioletNotes',
      w1_p: 'A pocket greenhouse for notes. Ideas are planted like petals and bloom by season — quick capture, tags, cross-device sync, iridescent dark theme.',
      w2_t: 'Physics Playground',
      w2_p: 'matter-js constraints replanted in a garden: rigid and soft anchors, pins and chains, giant type as solid ground. Dragging is dialogue.',
      w3_t: 'Lumen Lab',
      w3_p: 'A testbed for WebGL petal fields and interaction motion: cursor as wind, click as shockwave. Every signature effect was born here.',
      w_link: 'Explore ↗',
      interlude_t: 'Grown in the dark',
      interlude_sub: 'Darkness is the deepest ground colour of this greenhouse',
      exp_l1: 'In the quietest hour',
      exp_l2: 'it blooms',
      exp_p: 'LUMEN VIOLA never chases noise. It invites you to slow one beat — and watch iridescence, physics and whitespace perform.',
      stat1: 'FPS smooth scroll',
      stat2: 'ZH / EN bilingual',
      stat3: 'Moments worth remembering',
      notes_title: 'Field notes',
      notes_quote: 'Make the interface a breathing greenhouse:<br>whitespace is open ground, motion is breeze, physics is real weight.',
      notes_quote_by: '— LUMEN VIOLA · design memo',
      n1_t: 'One cold signal',
      n1_p: 'Almost monochrome violet. The only cyan lives on the cursor and HUD — a break held to a single register.',
      n2_t: 'Purposeful motion',
      n2_p: 'Every entrance answers one question: where should you look? Less noise, more narrative.',
      n3_t: 'One signature moment',
      n3_p: 'Keep a single place that loses control — the physics garden. Petals hitting type is more honest than adjectives.',
      visit_title: 'Visit the greenhouse',
      visit_lead: 'The door stays half-open. To talk design, code, or share something you noticed —',
      visit_top: 'Back to entrance',
      footer_tag: 'Crafted with bioluminescent violet light',
    },
  };

  let lang = 'zh';
  try { lang = localStorage.getItem('vn-lang') || 'zh'; } catch (_) {}

  function applyLang(next, animate) {
    lang = next;
    try { localStorage.setItem('vn-lang', lang); } catch (_) {}
    root.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.querySelectorAll('[data-lang-label]').forEach((el) => {
      el.classList.toggle('is-on', el.getAttribute('data-lang-label') === lang);
    });
    const pack = dict[lang];
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (!pack[key]) return;
      if (animate && gsap && !reduceMotion) {
        gsap.to(el, {
          opacity: 0,
          y: 8,
          duration: 0.18,
          ease: 'power2.in',
          onComplete() {
            el.innerHTML = pack[key];
            if (el.hasAttribute('data-split')) { el.removeAttribute('data-split-done'); splitElement(el); }
            gsap.to(el, { opacity: 1, y: 0, duration: 0.32, ease: 'power2.out' });
          },
        });
      } else {
        el.innerHTML = pack[key];
        if (el.hasAttribute('data-split')) { el.removeAttribute('data-split-done'); splitElement(el); }
      }
    });
  }

  const langBtn = document.getElementById('langToggle');
  if (langBtn) {
    langBtn.addEventListener('click', () => applyLang(lang === 'zh' ? 'en' : 'zh', true));
  }
  applyLang(lang, false);

  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* ================= orbs ================= */
  function spawnOrbs() {
    const host = document.getElementById('orbs');
    if (!host || reduceMotion) return;
    const colors = [
      'rgba(139,92,246,0.42)',
      'rgba(232,121,249,0.28)',
      'rgba(196,181,253,0.35)',
      'rgba(109,40,217,0.38)',
      'rgba(103,232,249,0.12)',
    ];
    for (let i = 0; i < 7; i++) {
      const o = document.createElement('i');
      o.className = 'orb';
      const size = 130 + Math.random() * 280;
      o.style.width = size + 'px';
      o.style.height = size + 'px';
      o.style.left = Math.random() * 100 + '%';
      o.style.top = Math.random() * 100 + '%';
      o.style.background = colors[i % colors.length];
      o.style.animationDuration = 14 + Math.random() * 12 + 's';
      o.style.animationDelay = -Math.random() * 10 + 's';
      o.style.opacity = String(0.3 + Math.random() * 0.4);
      host.appendChild(o);
    }
  }
  spawnOrbs();

  /* ================= cursor ================= */
  const cursor = document.getElementById('cursor');
  if (cursor && finePointer && !reduceMotion) {
    const dot = cursor.querySelector('.cursor__dot');
    const ring = cursor.querySelector('.cursor__ring');
    const label = cursor.querySelector('.cursor__label');
    let mx = window.innerWidth / 2;
    let my = window.innerHeight / 2;
    let rx = mx;
    let ry = my;

    let cursorRaf = false;
    window.addEventListener('pointermove', (e) => {
      mx = e.clientX;
      my = e.clientY;
      if (dot) dot.style.transform = `translate(${mx}px, ${my}px)`;
      if (!cursorRaf) { cursorRaf = true; requestAnimationFrame(loopCursor); }
    }, { passive: true });

    function loopCursor() {
      rx += (mx - rx) * 0.16;
      ry += (my - ry) * 0.16;
      if (ring) ring.style.transform = `translate(${rx}px, ${ry}px)`;
      if (Math.abs(mx - rx) > 0.05 || Math.abs(my - ry) > 0.05) {
        requestAnimationFrame(loopCursor);
      } else {
        cursorRaf = false;
        if (ring) ring.style.transform = `translate(${mx}px, ${my}px)`;
      }
    }

    document.querySelectorAll('a, button, [data-cursor]').forEach((el) => {
      el.addEventListener('mouseenter', () => {
        cursor.classList.add('is-hover');
        if (label) label.textContent = el.getAttribute('data-cursor') || '';
      });
      el.addEventListener('mouseleave', () => {
        cursor.classList.remove('is-hover');
        if (label) label.textContent = '';
      });
    });
    window.addEventListener('pointerdown', () => cursor.classList.add('is-down'));
    window.addEventListener('pointerup', () => cursor.classList.remove('is-down'));
  }

  /* ================= magnetic ================= */
  if (finePointer && !reduceMotion && gsap) {
    document.querySelectorAll('[data-magnetic]').forEach((el) => {
      const strength = 28;
      el.addEventListener('mousemove', (e) => {
        const r = el.getBoundingClientRect();
        const x = e.clientX - r.left - r.width / 2;
        const y = e.clientY - r.top - r.height / 2;
        gsap.to(el, { x: x / strength, y: y / strength, duration: 0.4, ease: 'power3.out' });
      });
      el.addEventListener('mouseleave', () => {
        gsap.to(el, { x: 0, y: 0, duration: 0.7, ease: 'elastic.out(1, 0.4)' });
      });
    });
  }

  /* ================= split text ================= */
  function splitElement(el) {
    if (!el || el.dataset.splitDone) return [];
    const text = el.textContent;
    el.dataset.splitDone = '1';
    el.setAttribute('aria-label', text);
    const frag = document.createDocumentFragment();
    const words = text.split(/(\s+)/);
    const chars = [];
    words.forEach((word) => {
      if (/^\s+$/.test(word)) {
        frag.appendChild(document.createTextNode(word));
        return;
      }
      const w = document.createElement('span');
      w.className = 'word';
      w.setAttribute('aria-hidden', 'true');
      for (const ch of word) {
        const c = document.createElement('span');
        c.className = 'char';
        c.textContent = ch;
        w.appendChild(c);
        chars.push(c);
      }
      frag.appendChild(w);
    });
    el.textContent = '';
    el.appendChild(frag);
    return chars;
  }

  function splitAll() {
    const map = new Map();
    document.querySelectorAll('[data-split]').forEach((el) => {
      map.set(el, splitElement(el));
    });
    return map;
  }

  /* ================= loader ================= */
  const loader = document.getElementById('loader');
  const loaderBar = document.getElementById('loaderBar');
  const loaderNum = document.getElementById('loaderNum');

  function setLoader(p) {
    const v = Math.max(0, Math.min(100, Math.round(p)));
    if (loaderBar) loaderBar.style.width = v + '%';
    if (loaderNum) loaderNum.textContent = String(v).padStart(2, '0');
  }

  function runLoader(done) {
    if (reduceMotion || !gsap) {
      setLoader(100);
      root.classList.remove('is-loading');
      root.classList.add('is-ready');
      if (loader) loader.style.display = 'none';
      done();
      return;
    }
    const state = { p: 0 };
    gsap.to(state, {
      p: 100,
      duration: 1.7,
      ease: 'power2.inOut',
      onUpdate() { setLoader(state.p); },
      onComplete() {
        const tl = gsap.timeline({
          onComplete() {
            root.classList.remove('is-loading');
            root.classList.add('is-ready');
            if (loader) loader.style.display = 'none';
            done();
          },
        });
        tl.to('.loader__inner', { y: -36, opacity: 0, duration: 0.4, ease: 'power3.in' })
          .to('.loader__curtain', { scaleY: 1, duration: 0.65, ease: 'power4.inOut' }, '-=0.12')
          .to('.loader', { yPercent: -100, duration: 0.85, ease: 'power4.inOut' }, '+=0.04');
      },
    });
  }

  /* ================= lenis + scrolltrigger ================= */
  let lenis = null;

  function initScroll() {
    if (reduceMotion) return;
    if (Lenis) {
      lenis = new Lenis({
        duration: 1.15,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
      });
      if (gsap && ScrollTrigger) {
        lenis.on('scroll', ScrollTrigger.update);
        gsap.ticker.add((time) => {
          lenis.raf(time * 1000);
        });
        gsap.ticker.lagSmoothing(0);
      } else {
        function raf(time) {
          lenis.raf(time);
          requestAnimationFrame(raf);
        }
        requestAnimationFrame(raf);
      }
    }

    document.querySelectorAll('a[href^="#"]').forEach((a) => {
      a.addEventListener('click', (e) => {
        const id = a.getAttribute('href');
        if (!id || id === '#') return;
        const target = document.querySelector(id);
        if (!target) return;
        e.preventDefault();
        if (lenis) lenis.scrollTo(target, { offset: -12 });
        else target.scrollIntoView({ behavior: 'smooth' });
      });
    });
  }

  /* ================= progress + chapter ================= */
  const progressBar = document.getElementById('progressBar');
  const chapterN = document.getElementById('chapterN');
  const chapterT = document.getElementById('chapterT');
  const header = document.getElementById('header');
  const chapters = Array.from(document.querySelectorAll('[data-chapter]'));

  function onScrollProgress() {
    const doc = document.documentElement;
    const max = doc.scrollHeight - window.innerHeight;
    const p = max > 0 ? window.scrollY / max : 0;
    if (progressBar) progressBar.style.width = (p * 100).toFixed(2) + '%';
    if (window.__vnPetal && typeof window.__vnPetal.setScroll === 'function') {
      window.__vnPetal.setScroll(Math.min(1, p * 2.2));
    }
    if (header) header.classList.toggle('is-solid', window.scrollY > 40);

    // active chapter
    let active = chapters[0];
    const y = window.scrollY + window.innerHeight * 0.35;
    chapters.forEach((sec) => {
      if (sec.offsetTop <= y) active = sec;
    });
    if (active && chapterN && chapterT) {
      chapterN.textContent = active.getAttribute('data-chapter') || '01';
      chapterT.textContent = active.getAttribute('data-chapter-name') || '';
    }
  }
  window.addEventListener('scroll', onScrollProgress, { passive: true });

  /* ================= reveals ================= */
  function initReveals() {
    if (reduceMotion) {
      document.querySelectorAll('.reveal-item, .reveal-img').forEach((el) => el.classList.add('is-in'));
      return;
    }
    if (gsap && ScrollTrigger) {
      gsap.utils.toArray('.reveal-item, .reveal-img').forEach((el) => {
        gsap.fromTo(
          el,
          { opacity: 0, y: 32 },
          {
            opacity: 1,
            y: 0,
            duration: 0.9,
            ease: 'power3.out',
            scrollTrigger: { trigger: el, start: 'top 88%' },
            onStart() { el.classList.add('is-in'); },
          }
        );
      });
      const interImg = document.querySelector('.interlude__img');
      if (interImg) {
        gsap.fromTo(interImg, { yPercent: -7 }, {
          yPercent: 7,
          ease: 'none',
          scrollTrigger: { trigger: '.interlude', start: 'top bottom', end: 'bottom top', scrub: true },
        });
      }
      // section titles
      gsap.utils.toArray('.section__cn').forEach((el) => {
        let chars = splitElement(el);
        if (!chars.length) chars = Array.from(el.querySelectorAll('.char'));
        if (!chars.length) return;
        gsap.from(chars, {
          yPercent: 110,
          opacity: 0,
          duration: 0.7,
          ease: 'power3.out',
          stagger: 0.03,
          scrollTrigger: { trigger: el, start: 'top 85%' },
        });
      });
    } else {
      document.querySelectorAll('.reveal-item, .reveal-img').forEach((el) => el.classList.add('is-in'));
    }
  }

  /* ================= hero intro ================= */
  function heroIntro(charMap) {
    if (reduceMotion || !gsap) {
      window.dispatchEvent(new Event('vn:ready'));
      return;
    }
    const heroChars = [];
    document.querySelectorAll('.hero [data-split]').forEach((el) => {
      const chars = charMap.get(el) || splitElement(el);
      heroChars.push(...chars);
    });
    const tl = gsap.timeline({
      defaults: { ease: 'power3.out' },
      onComplete() { window.dispatchEvent(new Event('vn:ready')); },
    });
    tl.from('.hero__eyebrow .char', { y: 24, opacity: 0, duration: 0.7, stagger: 0.015 }, 0)
      .from('.hero__line .char', { y: 40, opacity: 0, duration: 0.8, stagger: 0.02 }, 0.1)
      .from('.hero__word .char', { y: 80, opacity: 0, duration: 0.95, stagger: 0.04 }, 0.18)
      .from('.hero__garden .char', { y: 60, opacity: 0, duration: 0.9, stagger: 0.03 }, 0.32)
      .from('.hero__lead', { y: 20, opacity: 0, duration: 0.7 }, 0.55)
      .from('.hero__actions .btn', { y: 18, opacity: 0, duration: 0.6, stagger: 0.08 }, 0.65)
      .from('.hero__meta', { opacity: 0, duration: 0.6 }, 0.85)
      .from('.hero__line, .hero__word, .hero__garden', { clipPath: 'inset(0 0 105% 0)', duration: 1, ease: 'power4.inOut', stagger: 0.12 }, 0.05)
      .fromTo('.hero__ghost', { opacity: 0, x: -80 }, { opacity: 1, x: 0, duration: 2.4, ease: 'power2.out' }, 0.6);
    gsap.to('.hero__ghost', {
      x: 140,
      ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 0.6 },
    });
  }

  /* ================= boot ================= */
  const charMap = splitAll();
  initScroll();
  runLoader(() => {
    heroIntro(charMap);
    initReveals();
    onScrollProgress();
  });
})();
