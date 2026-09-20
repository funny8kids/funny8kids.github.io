/* LUMEN VIOLA — React Bits <animations> 原生移植陈列
   学习自 reactbits.dev/animations(MIT),按本站紫色叙事重新配色:
     · <ClickSpark />        全站点击八角星芒        #sparkCanvas
     · <GlareHover />        [data-glare] 高光扫卡    [data-tilt] 3D 倾随指针
     · <Spotlight />         [data-spotlight] 指针聚光径向光
     · <TrueFocus />         [data-truefocus] 逐词对焦模糊(景深感)
     · <Stagger />           [data-stagger] 子项错拍入场,可回放
     · <PixelTransition />   <img data-pixel> 像素溶解显影
     · <AnimatedCounter />   [data-countup] 入视口数字滚动
     · bloom 诗句            [data-bloom-line] 逐行点亮
   全部遵守 prefers-reduced-motion 降级;离屏零 rAF。 */
(function () {
  'use strict';
  /* 兜底:部分 GL 实现(SwiftShader/旧驱动)在 getProgramInfoLog/getShaderInfoLog
     返回 null,three 老版对其 .trim() 会抛 TypeError。与上游 three 的 `?? ''` 修复等价。 */
  (function guardInfoLog() {
    ['WebGL2RenderingContext', 'WebGLRenderingContext'].forEach(function (name) {
      const proto = window[name] && window[name].prototype;
      if (!proto) return;
      ['getProgramInfoLog', 'getShaderInfoLog'].forEach(function (fn) {
        const orig = proto[fn];
        if (typeof orig !== 'function' || orig.__vnNullGuard) return;
        const guarded = function (obj) { return orig.call(this, obj) || ''; };
        guarded.__vnNullGuard = true;
        proto[fn] = guarded;
      });
    });
  })();

  /* ============ v112 · WebGL 上下文预算管理器 ============
     全站 48 个 WebGL 画布,超出 Chromium 每页 ~16 上下文上限后浏览器会强制丢弃
     "最旧"上下文 —— 最先死的就是首屏花瓣与 §06 标本(白幕根因)。策略:
       1) 拦截 getContext 注册全部 GL 上下文,活跃数超过 LIMIT 时立刻对"距视口最远的
          离屏上下文"主动 loseContext();刚注册的画布永不成为当次牺牲者;
       2) IntersectionObserver 跟踪在视,回视时 restoreContext();
       3) three.js 上下文原生支持 lost/restored 自动重建;
       4) 裸 GL 上下文(属性带 __vnRawGL)经代理录制首帧 draw 前的全部初始化命令,
          恢复后按序重放并把旧 GL 对象句柄重映射为新对象,组件 rAF 循环继续绘制。
     容量核算:petalWebGL+bloom3d 常驻 2 + LIMIT 12 = 14 < 16,留 2 个余量。 */
  (function ctxBudget() {
    const LIMIT = 12;
    const entries = [];
    let liveCount = 0;
    const nowMs = () => performance.now();

    function isGLName(n) { return n === 'webgl' || n === 'experimental-webgl' || n === 'webgl2'; }
    function unwrap(reg, a) {
      if (a && typeof a === 'object' && a.__vnHandle) {
        return reg.cur.has(a.__vnReal) ? reg.cur.get(a.__vnReal) : a.__vnReal;
      }
      return a;
    }

    function makeWrapper(canvas, gl) {
      const reg = { real: gl, cur: new Map() };
      const rec = { on: true, calls: [] };
      function wrapsOut(key) { return key.indexOf('create') === 0 || key === 'getUniformLocation'; }
      return new Proxy(gl, {
        get(_t, key) {
          if (key === '__vnReg') return reg;
          if (key === '__vnRec') return rec;
          const real = reg.real;
          let v;
          try { v = real[key]; } catch (e) { return undefined; }
          if (typeof v !== 'function') return key === 'canvas' ? canvas : v;
          if (key === 'getExtension') return v.bind(real);
          if (key === 'drawArrays' || key === 'drawElements') {
            return function () {
              if (rec.on) { rec.on = false; rec.calls.push([key, [].slice.call(arguments), null]); }
              try { return v.apply(real, arguments); } catch (e) { return undefined; }
            };
          }
          return function () {
            const args = [].slice.call(arguments);
            let out;
            try { out = v.apply(real, args.map((a) => unwrap(reg, a))); } catch (e) { out = undefined; }
            if (rec.on) {
              const outReal = out && typeof out === 'object' ? out : null;
              rec.calls.push([key, args, outReal]);
              if (wrapsOut(key)) return { __vnHandle: true, __vnReg: reg, __vnReal: outReal };
            }
            return out;
          };
        },
        set(_t, k, val) { try { reg.real[k] = val; } catch (e) { void e; } return true; },
      });
    }

    function replay(entry) {
      const reg = entry.reg;
      reg.cur.clear();
      for (let i = 0; i < entry.rec.calls.length; i++) {
        const name = entry.rec.calls[i][0];
        const oldOut = entry.rec.calls[i][2];
        const args = entry.rec.calls[i][1].map((a) => unwrap(reg, a));
        let out;
        try { out = reg.real[name].apply(reg.real, args); } catch (e) { continue; }
        if (oldOut) reg.cur.set(oldOut, out);
      }
    }

    function inView(el) {
      const r = el.getBoundingClientRect();
      return r.bottom > -600 && r.top < innerHeight + 600;
    }
    function vd(e) {
      const r = e.canvas.getBoundingClientRect();
      if (r.bottom < 0) return -r.bottom;
      if (r.top > innerHeight) return r.top - innerHeight;
      return 0;
    }
    function evict(victim, protect) {
      if (victim.lost || victim.pinned || !victim.ext || victim === protect) return;
      victim.lost = true; liveCount--;
      try { victim.ext.loseContext(); } catch (err) { void err; }
    }
    function enforce(protect) {
      if (liveCount <= LIMIT) return;
      const off = entries.filter(function (e) { return !e.lost && !e.pinned && !inView(e.canvas); });
      off.sort(function (a, b) { return vd(b) - vd(a) || a.seen - b.seen; });
      for (let i = 0; i < off.length && liveCount > LIMIT; i++) evict(off[i], protect);
    }
    function revive(e) {
      e.seen = nowMs();
      if (e.lost && e.ext) { try { e.ext.restoreContext(); } catch (err) { void err; } }
    }

    const io = new IntersectionObserver(function (list) {
      for (const en of list) {
        const e = en.target.__vnGl;
        if (!e) continue;
        if (en.isIntersecting) revive(e);
        else { e.seen = nowMs(); enforce(null); }
      }
    }, { rootMargin: '300px 0px' });

    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (name, attrs) {
      if (!isGLName(name)) return orig.call(this, name, attrs);
      const gl = orig.call(this, name, attrs);
      if (!gl) return gl;
      if (this.__vnGl) {
        const e = this.__vnGl;
        revive(e);
        return e.raw ? e.wrapper : gl;
      }
      const raw = !!(attrs && attrs.__vnRawGL);
      let ext = null;
      try { ext = gl.getExtension('WEBGL_lose_context'); } catch (e) { void e; }
      const entry = {
        canvas: this, raw, ext, lost: false,
        pinned: this.id === 'petalWebGL' || this.id === 'bloom3d',
        seen: nowMs(),
      };
      if (raw) {
        const w = makeWrapper(this, gl);
        entry.wrapper = w; entry.reg = w.__vnReg; entry.rec = w.__vnRec;
      }
      this.__vnGl = entry;
      entries.push(entry);
      liveCount++;
      this.addEventListener('webglcontextlost', function (ev) {
        ev.preventDefault();
        if (!entry.lost) { entry.lost = true; liveCount--; }
      }, false);
      this.addEventListener('webglcontextrestored', function () {
        if (entry.lost) { entry.lost = false; liveCount++; }
        if (entry.raw) { try { replay(entry); } catch (err) { void err; } }
        enforce(entry);
      }, false);
      io.observe(this);
      enforce(entry);
      return raw ? entry.wrapper : gl;
    };

    window.__vnGlStats = function () {
      return {
        total: entries.length, live: liveCount,
        lost: entries.filter(function (e) { return e.lost; }).length,
      };
    };
  })();

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const css = (n, f) => (getComputedStyle(document.documentElement).getPropertyValue(n).trim() || f);

  /* ============ ClickSpark:全屏 canvas 星芒 ============ */
  (function spark() {
    if (reduced) return;
    const cv = document.getElementById('sparkCanvas');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const fit = () => {
      cv.width = innerWidth * dpr;
      cv.height = innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();
    addEventListener('resize', fit, { passive: true });
    const bursts = [];
    addEventListener('pointerdown', (e) => {
      const rays = 8;
      const colors = [css('--orchid', '#e879f9'), css('--lilac', '#c4b5fd'), css('--signal', '#67e8f9')];
      for (let i = 0; i < rays; i++) {
        const a = (i / rays) * Math.PI * 2 + Math.random() * 0.3;
        bursts.push({
          x: e.clientX, y: e.clientY, a,
          len: 10 + Math.random() * 8,
          dist: 14 + Math.random() * 10,
          life: 1,
          color: colors[i % colors.length],
        });
      }
      bursts.push({ ring: true, x: e.clientX, y: e.clientY, r: 4, life: 1, color: css('--violet', '#8b5cf6') });
      start();
    }, { passive: true });
    let raf = 0;
    function frame() {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (let i = bursts.length - 1; i >= 0; i--) {
        const b = bursts[i];
        b.life -= b.ring ? 0.055 : 0.05;
        if (b.life <= 0) { bursts.splice(i, 1); continue; }
        ctx.globalAlpha = Math.max(0, b.life);
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        const t = 1 - b.life;
        if (b.ring) {
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r + t * 26, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          const d0 = b.dist * t + 4;
          ctx.beginPath();
          ctx.moveTo(b.x + Math.cos(b.a) * d0, b.y + Math.sin(b.a) * d0);
          ctx.lineTo(b.x + Math.cos(b.a) * (d0 + b.len * (1 - t * 0.5)), b.y + Math.sin(b.a) * (d0 + b.len * (1 - t * 0.5)));
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      raf = bursts.length ? requestAnimationFrame(frame) : 0;
    }
    function start() { if (!raf) raf = requestAnimationFrame(frame); }
  })();

  /* ============ GlareHover + tilt ============ */
  if (fine) {
    document.querySelectorAll('[data-glare],[data-tilt]').forEach((el) => {
      el.classList.add('rb-glare');
      let rect = null;
      const move = (e) => {
        if (!rect) rect = el.getBoundingClientRect();
        const x = e.clientX - rect.left, y = e.clientY - rect.top;
        el.style.setProperty('--gx', (x / rect.width * 100).toFixed(1) + '%');
        el.style.setProperty('--gy', (y / rect.height * 100).toFixed(1) + '%');
        if (el.hasAttribute('data-tilt') && !reduced) {
          const rx = (y / rect.height - 0.5) * -7;
          const ry = (x / rect.width - 0.5) * 9;
          el.style.transform = 'perspective(900px) rotateX(' + rx.toFixed(2) + 'deg) rotateY(' + ry.toFixed(2) + 'deg) translateZ(0)';
        }
      };
      el.addEventListener('pointermove', move, { passive: true });
      el.addEventListener('pointerenter', () => { rect = el.getBoundingClientRect(); el.classList.add('is-glare-in'); }, { passive: true });
      el.addEventListener('pointerleave', () => {
        rect = null;
        el.classList.remove('is-glare-in');
        if (el.hasAttribute('data-tilt')) el.style.transform = '';
      }, { passive: true });
    });
  }

  /* ============ Spotlight ============ */
  if (fine) {
    document.querySelectorAll('[data-spotlight]').forEach((el) => {
      el.classList.add('rb-spot');
      let rect = null;
      el.addEventListener('pointermove', (e) => {
        if (!rect) rect = el.getBoundingClientRect();
        el.style.setProperty('--sx', (e.clientX - rect.left).toFixed(0) + 'px');
        el.style.setProperty('--sy', (e.clientY - rect.top).toFixed(0) + 'px');
      }, { passive: true });
      el.addEventListener('pointerenter', () => { rect = el.getBoundingClientRect(); el.classList.add('is-spot'); }, { passive: true });
      el.addEventListener('pointerleave', () => { rect = null; el.classList.remove('is-spot'); }, { passive: true });
    });
  }

  /* ============ TrueFocus:逐词对焦 ============ */
  document.querySelectorAll('[data-truefocus]').forEach((el) => {
    const words = el.textContent.trim().split(/\s+/);
    el.setAttribute('aria-label', el.textContent);
    el.textContent = '';
    const spans = words.map((w) => {
      const s = document.createElement('span');
      s.className = 'tf-word';
      s.textContent = w;
      el.appendChild(s);
      return s;
    });
    if (reduced) return;
    const speed = Number(el.dataset.speed) || 1.8;
    let raf = 0, t0 = 0, inView = false;
    function frame(ts) {
      if (!inView) { raf = 0; return; }
      if (!t0) t0 = ts;
      const p = ((ts - t0) / 1000) * speed * 0.35;
      const focus = (Math.sin(p) * 0.5 + 0.5) * (spans.length - 1);
      spans.forEach((s, i) => {
        const d = Math.abs(i - focus);
        const blur = Math.min(9, d * 3.2);
        s.style.filter = 'blur(' + blur.toFixed(2) + 'px)';
        s.style.opacity = String(Math.max(0.16, 1 - d * 0.34));
        s.style.transform = 'scale(' + (1 - Math.min(0.12, d * 0.05)).toFixed(3) + ')';
      });
      raf = requestAnimationFrame(frame);
    }
    new IntersectionObserver((en) => {
      inView = en[0].isIntersecting;
      if (inView && !raf) { t0 = 0; raf = requestAnimationFrame(frame); }
    }, { threshold: 0.2 }).observe(el);
  });

  /* ============ Stagger 列表 ============ */
  document.querySelectorAll('[data-stagger]').forEach((list) => {
    const kids = Array.from(list.children);
    kids.forEach((k, i) => { k.style.transitionDelay = (i * 90) + 'ms'; });
    if (reduced) { kids.forEach((k) => k.classList.add('is-st-in')); return; }
    new IntersectionObserver((en) => {
      if (en[0].isIntersecting) kids.forEach((k) => k.classList.add('is-st-in'));
      else kids.forEach((k) => k.classList.remove('is-st-in')); // 离场复位可回放
    }, { threshold: 0.25 }).observe(list);
  });

  /* ============ PixelTransition:像素溶解显影 ============ */
  document.querySelectorAll('img[data-pixel]').forEach((img) => {
    const host = img.parentElement;
    if (!host) return;
    getComputedStyle(host).position === 'static' && (host.style.position = 'relative');
    const cv = document.createElement('canvas');
    cv.className = 'px-cover';
    cv.setAttribute('aria-hidden', 'true');
    host.appendChild(cv);
    const c2 = cv.getContext('2d');
    let done = false;
    function paint(cells) {
      const w = img.clientWidth, h = img.clientHeight;
      if (!w || !h) return;
      cv.width = w; cv.height = h;
      cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
      img.style.visibility = 'hidden';
      if (cells <= 1) { img.style.visibility = ''; return; }
      const sw = Math.max(1, Math.round(w / cells)), sh = Math.max(1, Math.round(h / cells));
      const tmp = document.createElement('canvas');
      tmp.width = sw; tmp.height = sh;
      const t2 = tmp.getContext('2d');
      t2.drawImage(img, 0, 0, sw, sh);
      c2.imageSmoothingEnabled = false;
      c2.clearRect(0, 0, w, h);
      c2.drawImage(tmp, 0, 0, sw, sh, 0, 0, w, h);
    }
    function run() {
      if (done || reduced || !img.naturalWidth) { paint(1); return; }
      done = true;
      const dur = 1500, start = performance.now();
      (function step(ts) {
        const t = Math.min(1, (ts - start) / dur);
        const e = 1 - Math.pow(1 - t, 3);
        const cells = Math.max(1, Math.round(64 * (1 - e)) + 1);
        if (cells > 1) { paint(cells); img.style.visibility = 'hidden'; }
        else { img.style.visibility = ''; c2.clearRect(0, 0, cv.width, cv.height); }
        if (t < 1) requestAnimationFrame(step);
      })(start);
    }
    const boot = () => {
      if (!('IntersectionObserver' in window)) { run(); return; }
      let played = false;
      new IntersectionObserver((en) => {
        if (en[0].isIntersecting && !played) { played = true; run(); }
      }, { threshold: 0.3 }).observe(img);
    };
    if (img.complete) boot();
    else img.addEventListener('load', boot, { once: true });
    img.addEventListener('error', () => cv.remove(), { once: true });
  });

  /* ============ AnimatedCounter ============ */
  document.querySelectorAll('[data-countup]').forEach((el) => {
    const to = Number(el.dataset.countup) || 0;
    const suffix = el.dataset.suffix || '';
    const dec = (String(to).split('.')[1] || '').length;
    const paint = (v) => { el.textContent = v.toFixed(dec) + suffix; };
    if (reduced) { paint(to); return; }
    let played = false;
    new IntersectionObserver((en) => {
      if (!en[0].isIntersecting || played) return;
      played = true;
      const dur = 1600, t0 = performance.now();
      (function step(ts) {
        const t = Math.min(1, (ts - t0) / dur);
        paint(to * (1 - Math.pow(1 - t, 4)));
        if (t < 1) requestAnimationFrame(step);
      })(t0);
    }, { threshold: 0.5 }).observe(el);
  });

  /* ============ Bloom 诗句逐行点亮 ============ */
  (function bloom() {
    const lines = Array.from(document.querySelectorAll('[data-bloom-line]'));
    if (!lines.length) return;
    if (reduced) { lines.forEach((l) => l.classList.add('is-on')); return; }
    const sec = lines[0].closest('.bloom') || document.body;
    function onScroll() {
      const r = sec.getBoundingClientRect();
      const total = r.height - innerHeight;
      const p = total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : (r.top < innerHeight * 0.6 ? 1 : 0);
      lines.forEach((l, i) => {
        l.classList.toggle('is-on', p > (i + 0.35) / (lines.length + 0.4));
      });
    }
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll, { passive: true });
    onScroll();
  })();

  /* ============ v95 移植 · <AnimatedContent /> ============
     官方同款：gsap + ScrollTrigger once，distance/direction/reverse/scale/threshold 参数一致，
     通过 [data-animated] 声明。 */
  (function animatedContent() {
    const G = window.gsap, ST = window.ScrollTrigger;
    if (!G || !ST) return;
    G.registerPlugin(ST);
    document.querySelectorAll('[data-animated]').forEach((el) => {
      if (reduced) { return; }
      const d = el.dataset;
      const distance = Number(d.distance || 100);
      const axis = d.direction === 'horizontal' ? 'x' : 'y';
      const offset = d.reverse === 'true' ? -distance : distance;
      const scale = Number(d.scale || 1);
      const threshold = Number(d.threshold || 0.1);
      G.set(el, { [axis]: offset, scale: scale, opacity: Number(d.opacity || 0), visibility: 'visible' });
      G.to(el, {
        [axis]: 0, scale: 1, opacity: 1,
        duration: Number(d.duration || 0.8), ease: d.ease || 'power3.out', delay: Number(d.delay || 0),
        scrollTrigger: { trigger: el, start: 'top ' + ((1 - threshold) * 100) + '%', once: true },
      });
    });
  })();

  /* ============ v95 移植 · <MagnetLines /> ============
     官方同款角度公式 atan2→acos 版；优化：rect 缓存、rAF 节流、离屏暂停（官方为逐帧全量 getBoundingClientRect）。 */
  (function magnetLines() {
    document.querySelectorAll('[data-magnetlines]').forEach((box) => {
      const rc = (box.dataset.magnetlines || '5,9').split(',').map(Number);
      const rows = rc[0], cols = rc[1] || rc[0];
      box.style.setProperty('--rows', rows);
      box.style.setProperty('--cols', cols);
      const spans = [];
      for (let i = 0; i < rows * cols; i++) {
        const s = document.createElement('span');
        s.style.setProperty('--rotate', '-10deg');
        box.appendChild(s);
        spans.push(s);
      }
      if (reduced || !fine) return;
      let rects = null, visible = false, raf = 0;
      const pointer = { x: innerWidth / 2, y: innerHeight / 2 };
      const measure = () => { rects = spans.map((s) => s.getBoundingClientRect()); };
      const render = () => {
        raf = 0;
        if (!rects) measure();
        for (let i = 0; i < spans.length; i++) {
          const r = rects[i];
          const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
          const b = pointer.x - cx, a = pointer.y - cy;
          const c = Math.sqrt(a * a + b * b) || 1;
          const deg = (Math.acos(b / c) * 180) / Math.PI * (pointer.y > cy ? 1 : -1);
          spans[i].style.setProperty('--rotate', deg + 'deg');
        }
      };
      addEventListener('pointermove', (e) => {
        pointer.x = e.clientX; pointer.y = e.clientY;
        if (visible && !raf) raf = requestAnimationFrame(render);
      }, { passive: true });
      new IntersectionObserver((en) => {
        visible = en[0].isIntersecting;
        if (visible) { measure(); render(); } else { rects = null; }
      }, { rootMargin: '120px' }).observe(box);
      addEventListener('resize', () => { rects = null; if (visible && !raf) raf = requestAnimationFrame(render); }, { passive: true });
    });
  })();

  /* ============ v95 移植 · <Crosshair /> ============
     官方同款：lerp(0.15) 平滑跟随的水平/垂直参考线，移动出现、静止淡出；仅桌面指针。 */
  (function crosshair() {
    if (reduced || !fine) return;
    const wrap = document.createElement('div');
    wrap.className = 'crosshair';
    wrap.setAttribute('aria-hidden', 'true');
    wrap.innerHTML = '<i class="crosshair__h"></i><i class="crosshair__v"></i>';
    document.body.appendChild(wrap);
    const h = wrap.children[0], v = wrap.children[1];
    let mx = -200, my = -200, px = -200, py = -200, raf = 0, idleUntil = 0, shown = false;
    const render = () => {
      px += (mx - px) * 0.15;
      py += (my - py) * 0.15;
      h.style.transform = 'translate3d(0,' + py.toFixed(1) + 'px,0)';
      v.style.transform = 'translate3d(' + px.toFixed(1) + 'px,0,0)';
      if (performance.now() < idleUntil || Math.abs(mx - px) > 0.4 || Math.abs(my - py) > 0.4) {
        raf = requestAnimationFrame(render);
      } else {
        raf = 0; shown = false;
        h.style.opacity = '0'; v.style.opacity = '0';
      }
    };
    addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      mx = e.clientX; my = e.clientY; idleUntil = performance.now() + 1300;
      if (!shown) {
        shown = true;
        h.style.opacity = ''; v.style.opacity = '';
        if (!raf) raf = requestAnimationFrame(render);
      }
    }, { passive: true });
  })();

  /* ---------- v95 第四批 · TextAnimations：DecryptedText ---------- */
  (function decryptedText() {
    const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()_+';
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.querySelectorAll('[data-decrypt]').forEach((el) => {
      const text = el.textContent;
      if (reduced) return;
      const speed = Number(el.dataset.speed) || 50;
      const maxIter = Number(el.dataset.maxIterations) || 10;
      const sequential = el.dataset.sequential === 'true';
      const dir = el.dataset.revealDirection || 'start';
      const trigger = el.dataset.decrypt || 'view';
      let timer = 0, iter = 0, revealed = new Set();
      el.setAttribute('aria-label', text);
      const shuffle = () => text.split('').map((c, i) =>
        (c === ' ' || revealed.has(i)) ? c : CHARS[(Math.random() * CHARS.length) | 0]).join('');
      const stop = (final) => { clearInterval(timer); timer = 0; el.textContent = final; };
      const nextIndex = () => {
        const len = text.length, size = revealed.size;
        if (dir === 'end') return len - 1 - size;
        if (dir === 'center') {
          const mid = Math.floor(len / 2), off = Math.floor(size / 2);
          const idx = size % 2 === 0 ? mid + off : mid - off - 1;
          if (idx >= 0 && idx < len && !revealed.has(idx)) return idx;
          for (let i = 0; i < len; i++) if (!revealed.has(i)) return i;
        }
        return size;
      };
      const start = () => {
        if (timer) return;
        revealed = new Set(); iter = 0;
        timer = setInterval(() => {
          if (sequential) {
            if (revealed.size >= text.length) return stop(text);
            revealed.add(nextIndex());
            el.textContent = shuffle();
          } else {
            el.textContent = shuffle();
            if (++iter >= maxIter) stop(text);
          }
        }, speed);
      };
      if (trigger === 'view' && 'IntersectionObserver' in window) {
        const io = new IntersectionObserver((en) => {
          if (en[0].isIntersecting) { io.disconnect(); start(); }
        }, { threshold: 0.1 });
        io.observe(el);
      } else if (trigger === 'hover') {
        el.addEventListener('mouseenter', start);
        el.addEventListener('mouseleave', () => stop(text));
      } else if (trigger === 'click') {
        el.addEventListener('click', start);
      }
    });
  })();

  /* ---------- v95 第四批 · BlurText（逐词 blur→clear 两段关键帧） ---------- */
  (function blurText() {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.querySelectorAll('[data-blurtext]').forEach((el) => {
      const text = el.textContent.trim();
      const byChars = el.dataset.animateBy === 'characters';
      const dirY = el.dataset.direction === 'bottom' ? 1 : -1;
      const delay = (Number(el.dataset.delay) || 200) / 1000;
      const segs = byChars ? Array.from(text) : text.split(' ');
      el.textContent = '';
      el.classList.add('bt-line');
      const spans = segs.map((s, i) => {
        const sp = document.createElement('span');
        sp.className = 'bt-w';
        sp.textContent = s === ' ' ? '\u00A0' : s;
        if (!byChars && i < segs.length - 1) sp.textContent += '\u00A0';
        el.appendChild(sp);
        return sp;
      });
      if (reduced || !window.gsap) return;
      gsap.set(spans, { filter: 'blur(10px)', opacity: 0, y: 50 * dirY });
      const io = new IntersectionObserver((en) => {
        if (!en[0].isIntersecting) return;
        io.disconnect();
        spans.forEach((sp, i) => {
          gsap.to(sp, { filter: 'blur(5px)', opacity: 0.5, y: -5 * dirY, duration: 0.35, delay: i * delay, ease: 'none' });
          gsap.to(sp, { filter: 'blur(0px)', opacity: 1, y: 0, duration: 0.35, delay: i * delay + 0.35, ease: 'power2.out' });
        });
      }, { threshold: 0.1 });
      io.observe(el);
    });
  })();

  /* ---------- v95 第四批 · RotatingText（字符级轮播，离屏/后台暂停） ---------- */
  (function rotatingText() {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.querySelectorAll('[data-rotate]').forEach((el) => {
      const words = (el.dataset.rotate || el.textContent).split('|');
      const interval = Number(el.dataset.rotateInterval) || 2200;
      let idx = 0, inView = false;
      el.textContent = '';
      el.classList.add('rot-wrap');
      const inner = document.createElement('span');
      inner.className = 'rot-inner';
      el.appendChild(inner);
      const show = (word, animate) => {
        inner.textContent = '';
        const spans = Array.from(word).map((c) => {
          const s = document.createElement('span');
          s.className = 'rot-ch';
          s.textContent = c;
          inner.appendChild(s);
          return s;
        });
        el.setAttribute('aria-label', word);
        if (!reduced && animate && window.gsap) {
          gsap.fromTo(spans, { y: '100%', opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: 'power3.out', stagger: 0.03 });
        }
      };
      show(words[0], false);
      if (reduced || words.length < 2) return;
      if ('IntersectionObserver' in window) {
        new IntersectionObserver((en) => { inView = en[0].isIntersecting; }, { rootMargin: '100px' }).observe(el);
      } else inView = true;
      setInterval(() => {
        if (!inView || document.hidden) return;
        const spans = Array.from(inner.children);
        const next = () => { idx = (idx + 1) % words.length; show(words[idx], true); };
        if (!window.gsap) return next();
        const tl = gsap.timeline();
        tl.to(spans, { y: '-120%', opacity: 0, duration: 0.3, ease: 'power2.in', stagger: 0.02 });
        tl.call(next);
      }, interval);
    });
  })();

  /* ---------- v96 第五批 · TextType（打字机，入视口启动，后台跳帧） ---------- */
  (function textType() {
    document.querySelectorAll('[data-typewriter]').forEach((el) => {
      const words = (el.dataset.typewriter || '').split('|').filter(Boolean);
      if (!words.length) return;
      const typingSpeed = Number(el.dataset.typingSpeed) || 50;
      const deletingSpeed = Number(el.dataset.deletingSpeed) || 30;
      const pauseDuration = Number(el.dataset.pauseDuration) || 2000;
      const content = document.createElement('span');
      content.className = 'tt-content';
      const cursor = document.createElement('span');
      cursor.className = 'tt-cursor';
      cursor.setAttribute('aria-hidden', 'true');
      cursor.textContent = '|';
      el.textContent = '';
      el.classList.add('text-type');
      el.appendChild(content);
      el.appendChild(cursor);
      if (reduced) { content.textContent = words[0]; cursor.style.display = 'none'; return; }
      let wi = 0, ci = 0, deleting = false, started = false;
      const tick = () => {
        if (document.hidden) { setTimeout(tick, 500); return; }
        const w = words[wi];
        if (!deleting) {
          if (ci < w.length) {
            ci++;
            content.textContent = w.slice(0, ci);
            setTimeout(tick, typingSpeed);
          } else {
            deleting = true;
            setTimeout(tick, pauseDuration);
          }
        } else if (ci > 0) {
          ci--;
          content.textContent = w.slice(0, ci);
          setTimeout(tick, deletingSpeed);
        } else {
          deleting = false;
          wi = (wi + 1) % words.length;
          setTimeout(tick, 300);
        }
      };
      new IntersectionObserver((en) => {
        if (en[0].isIntersecting && !started) { started = true; tick(); }
      }, { threshold: 0.1 }).observe(el);
    });
  })();

  /* ---------- v96 第五批 · CircularText（环形旋转字，离屏暂停，悬停加速） ---------- */
  (function circularText() {
    document.querySelectorAll('[data-circular]').forEach((el) => {
      const text = el.dataset.circular || '';
      const letters = Array.from(text);
      const spin = Number(el.dataset.spin) || 20;
      el.setAttribute('aria-label', text);
      letters.forEach((ch, i) => {
        const s = document.createElement('span');
        const rot = (360 / letters.length) * i;
        const factor = Math.PI / letters.length;
        s.style.transform = 'rotateZ(' + rot + 'deg) translate3d(' + (factor * i) + 'px,' + (factor * i) + 'px,0)';
        s.textContent = ch === ' ' ? '\u00A0' : ch;
        el.appendChild(s);
      });
      if (reduced || !window.gsap) return;
      const tw = gsap.to(el, { rotation: 360, duration: spin, ease: 'none', repeat: -1 });
      let inView = false;
      const sync = () => { (inView && !document.hidden) ? tw.play() : tw.pause(); };
      new IntersectionObserver((en) => { inView = en[0].isIntersecting; sync(); }, { rootMargin: '80px' }).observe(el);
      document.addEventListener('visibilitychange', sync);
      el.addEventListener('pointerenter', () => tw.timeScale(4));
      el.addEventListener('pointerleave', () => tw.timeScale(1));
    });
  })();

  /* ---------- v96 第五批 · DotGrid（官方几何/近距混色/冲击波；InertiaPlugin 为付费插件，
       推动段用 power2.out + elastic.out(1,0.75) 回弹等价替代） ---------- */
  (function dotGrid() {
    document.querySelectorAll('[data-dotgrid]').forEach((wrap) => {
      const cv = wrap.querySelector('canvas');
      if (!cv || !window.Path2D) return;
      const num = (k, d) => Number(wrap.dataset[k]) || d;
      const cfg = {
        dotSize: num('dotSize', 16), gap: num('gap', 32), proximity: num('proximity', 150),
        speedTrigger: num('speedTrigger', 100), shockRadius: num('shockRadius', 250),
        shockStrength: num('shockStrength', 5), maxSpeed: 5000, returnDuration: 1.5
      };
      const hexRgb = (hex) => {
        const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
        return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 0, 0];
      };
      const baseRgb = hexRgb(wrap.dataset.baseColor || '#3B2A63');
      const activeRgb = hexRgb(wrap.dataset.activeColor || '#C4B5FD');
      const baseStr = 'rgb(' + baseRgb.join(',') + ')';
      const ctx = cv.getContext('2d');
      const path = new Path2D();
      path.arc(0, 0, cfg.dotSize / 2, 0, Math.PI * 2);
      let dots = [], W = 0, H = 0, raf = 0, inView = false;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const build = () => {
        const r = wrap.getBoundingClientRect();
        W = r.width; H = r.height;
        cv.width = W * dpr; cv.height = H * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const cell = cfg.dotSize + cfg.gap;
        const cols = Math.floor((W + cfg.gap) / cell);
        const rows = Math.floor((H + cfg.gap) / cell);
        const startX = (W - (cell * cols - cfg.gap)) / 2 + cfg.dotSize / 2;
        const startY = (H - (cell * rows - cfg.gap)) / 2 + cfg.dotSize / 2;
        const next = [];
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            next.push({ cx: startX + x * cell, cy: startY + y * cell, xOffset: 0, yOffset: 0, busy: false });
          }
        }
        dots = next;
      };
      const ptr = { x: -9999, y: -9999, vx: 0, vy: 0, t: 0, lx: 0, ly: 0 };
      const proxSq = cfg.proximity * cfg.proximity;
      const render = () => {
        ctx.clearRect(0, 0, W, H);
        for (const d of dots) {
          let style = baseStr;
          const dx = d.cx - ptr.x, dy = d.cy - ptr.y;
          const dsq = dx * dx + dy * dy;
          if (dsq <= proxSq) {
            const t = 1 - Math.sqrt(dsq) / cfg.proximity;
            style = 'rgb(' + Math.round(baseRgb[0] + (activeRgb[0] - baseRgb[0]) * t) + ',' +
              Math.round(baseRgb[1] + (activeRgb[1] - baseRgb[1]) * t) + ',' +
              Math.round(baseRgb[2] + (activeRgb[2] - baseRgb[2]) * t) + ')';
          }
          ctx.save();
          ctx.translate(d.cx + d.xOffset, d.cy + d.yOffset);
          ctx.fillStyle = style;
          ctx.fill(path);
          ctx.restore();
        }
      };
      const loop = () => { render(); raf = requestAnimationFrame(loop); };
      const sync = () => {
        const want = inView && !document.hidden;
        if (want && !raf) raf = requestAnimationFrame(loop);
        else if (!want && raf) { cancelAnimationFrame(raf); raf = 0; }
      };
      const push = (d, px, py) => {
        if (!window.gsap) return;
        d.busy = true;
        gsap.killTweensOf(d);
        gsap.to(d, {
          xOffset: px, yOffset: py, duration: 0.22, ease: 'power2.out',
          onComplete: () => gsap.to(d, {
            xOffset: 0, yOffset: 0, duration: cfg.returnDuration, ease: 'elastic.out(1,0.75)',
            onComplete: () => { d.busy = false; }
          })
        });
      };
      build();
      if (reduced) { render(); wrap.__dotgrid = () => ({ dots: dots.length, raf: 0 }); return; }
      let lastMove = 0;
      wrap.addEventListener('pointermove', (e) => {
        const now = performance.now();
        if (now - lastMove < 50) return;
        lastMove = now;
        const r = cv.getBoundingClientRect();
        const dt = ptr.t ? now - ptr.t : 16;
        ptr.t = now;
        let vx = ((e.clientX - ptr.lx) / dt) * 1000;
        let vy = ((e.clientY - ptr.ly) / dt) * 1000;
        ptr.lx = e.clientX; ptr.ly = e.clientY;
        let speed = Math.hypot(vx, vy);
        if (speed > cfg.maxSpeed) { const s = cfg.maxSpeed / speed; vx *= s; vy *= s; speed = cfg.maxSpeed; }
        ptr.vx = vx; ptr.vy = vy;
        ptr.x = e.clientX - r.left; ptr.y = e.clientY - r.top;
        for (const d of dots) {
          const dist = Math.hypot(d.cx - ptr.x, d.cy - ptr.y);
          if (speed > cfg.speedTrigger && dist < cfg.proximity && !d.busy) {
            push(d, (d.cx - ptr.x) * 0.55 + vx * 0.012, (d.cy - ptr.y) * 0.55 + vy * 0.012);
          }
        }
      }, { passive: true });
      wrap.addEventListener('pointerleave', () => { ptr.x = -9999; ptr.y = -9999; });
      wrap.addEventListener('click', (e) => {
        const r = cv.getBoundingClientRect();
        const cx = e.clientX - r.left, cy = e.clientY - r.top;
        for (const d of dots) {
          const dist = Math.hypot(d.cx - cx, d.cy - cy);
          if (dist < cfg.shockRadius && !d.busy) {
            const f = Math.max(0, 1 - dist / cfg.shockRadius);
            push(d, (d.cx - cx) * cfg.shockStrength * f, (d.cy - cy) * cfg.shockStrength * f);
          }
        }
      });
      new IntersectionObserver((en) => { inView = en[0].isIntersecting; sync(); }, { rootMargin: '120px' }).observe(wrap);
      document.addEventListener('visibilitychange', sync);
      if ('ResizeObserver' in window) new ResizeObserver(build).observe(wrap);
      else addEventListener('resize', build, { passive: true });
      wrap.__dotgrid = () => ({ dots: dots.length, raf: !!raf });
    });
  })();

  /* ---------- v96 第五批 · Silk（官方 GLSL 原样，three.js 正交平面移植；离屏/后台停 rAF） ---------- */
  (function silk() {
    if (!window.THREE) return;
    const VERT = [
      'varying vec2 vUv;',
      'varying vec3 vPosition;',
      'void main() {',
      '  vPosition = position;',
      '  vUv = uv;',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '}'
    ].join('\n');
    const FRAG = [
      'varying vec2 vUv;',
      'varying vec3 vPosition;',
      'uniform float uTime;',
      'uniform vec3  uColor;',
      'uniform float uSpeed;',
      'uniform float uScale;',
      'uniform float uRotation;',
      'uniform float uNoiseIntensity;',
      'uniform float uLightMode;',
      'const float e = 2.71828182845904523536;',
      'float noise(vec2 texCoord) {',
      '  float G = e;',
      '  vec2  r = (G * sin(G * texCoord));',
      '  return fract(r.x * r.y * (1.0 + texCoord.x));',
      '}',
      'vec2 rotateUvs(vec2 uv, float angle) {',
      '  float c = cos(angle);',
      '  float s = sin(angle);',
      '  mat2  rot = mat2(c, -s, s, c);',
      '  return rot * uv;',
      '}',
      'void main() {',
      '  float rnd        = noise(gl_FragCoord.xy);',
      '  vec2  uv         = rotateUvs(vUv * uScale, uRotation);',
      '  vec2  tex        = uv * uScale;',
      '  float tOffset    = uSpeed * uTime;',
      '  tex.y += 0.03 * sin(8.0 * tex.x - tOffset);',
      '  float pattern = 0.6 +',
      '                  0.4 * sin(5.0 * (tex.x + tex.y +',
      '                                   cos(3.0 * tex.x + 5.0 * tex.y) +',
      '                                   0.02 * tOffset) +',
      '                           sin(20.0 * (tex.x + tex.y - 0.1 * tOffset)));',
      '  float grain = rnd / 15.0 * uNoiseIntensity;',
      '  vec3 result = uColor * pattern - vec3(grain);',
      '  if (uLightMode > 0.5) {',
      '    float fold = smoothstep(0.28, 0.9, pattern);',
      '    float specular = smoothstep(0.72, 0.98, pattern);',
      '    vec3 shadowColor = uColor * 0.72;',
      '    vec3 bodyColor = min(uColor * 1.18, vec3(1.0));',
      '    vec3 lightBase = mix(shadowColor, bodyColor, fold);',
      '    lightBase = mix(lightBase, vec3(1.0), specular * 0.92);',
      '    float fineNoise = noise(gl_FragCoord.xy * 0.63 + vec2(17.0, 41.0));',
      '    float grainSignal = (rnd + fineNoise - 1.0);',
      '    float grainStrength = clamp(uNoiseIntensity * 0.038, 0.0, 0.16);',
      '    result = lightBase + grainSignal * grainStrength;',
      '  }',
      '  gl_FragColor = vec4(clamp(result, 0.0, 1.0), 1.0);',
      '}'
    ].join('\n');
    document.querySelectorAll('[data-silk]').forEach((box) => {
      const cv = box.querySelector('canvas');
      if (!cv) return;
      const T = window.THREE;
      let renderer;
      try {
        renderer = new T.WebGLRenderer({ canvas: cv, antialias: false });
      } catch (err) { return; }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      const scene = new T.Scene();
      const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const hex = (box.dataset.color || '#A78BFA').replace('#', '');
      const uniforms = {
        uSpeed: { value: Number(box.dataset.speed) || 5 },
        uScale: { value: Number(box.dataset.scale) || 1 },
        uNoiseIntensity: { value: Number(box.dataset.noise) || 1.5 },
        uColor: {
          value: new T.Color(
            parseInt(hex.slice(0, 2), 16) / 255,
            parseInt(hex.slice(2, 4), 16) / 255,
            parseInt(hex.slice(4, 6), 16) / 255
          )
        },
        uRotation: { value: Number(box.dataset.rotation) || 0 },
        uLightMode: { value: document.documentElement.getAttribute('data-theme') === 'light' ? 1 : 0 },
        uTime: { value: 0 }
      };
      const mat = new T.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG });
      scene.add(new T.Mesh(new T.PlaneGeometry(2, 2), mat));
      const resize = () => {
        const r = box.getBoundingClientRect();
        renderer.setSize(r.width, r.height, false);
      };
      resize();
      let raf = 0, inView = false, last = 0;
      const loop = (now) => {
        const dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016;
        last = now;
        uniforms.uTime.value += 0.1 * dt;
        renderer.render(scene, camera);
        raf = requestAnimationFrame(loop);
      };
      const sync = () => {
        const want = inView && !document.hidden;
        if (want && !raf) { last = 0; raf = requestAnimationFrame(loop); }
        else if (!want && raf) { cancelAnimationFrame(raf); raf = 0; }
      };
      if ('ResizeObserver' in window) new ResizeObserver(resize).observe(box);
      else addEventListener('resize', resize, { passive: true });
      if (reduced) {
        uniforms.uTime.value = 6;
        renderer.render(scene, camera);
        box.__silk = () => ({ running: false, t: uniforms.uTime.value });
        return;
      }
      new IntersectionObserver((en) => { inView = en[0].isIntersecting; sync(); }, { rootMargin: '120px' }).observe(box);
      document.addEventListener('visibilitychange', sync);
      box.__silk = () => ({ running: !!raf, t: uniforms.uTime.value });
    });
  })();

  /* ── v98 · 第六批 ── */

  /* ScrambledText — 官方 SplitText + ScrambleTextPlugin（3.15 起免费）逐字移植 */
  (() => {
    const els = document.querySelectorAll('[data-scrambled]');
    if (!els.length || !window.gsap || !window.SplitText || !window.ScrambleTextPlugin) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;
    gsap.registerPlugin(window.SplitText, window.ScrambleTextPlugin);
    els.forEach((root) => {
      const p = root.querySelector('p');
      if (!p) return;
      const split = window.SplitText.create(p, { type: 'chars', charsClass: 'char' });
      const chars = split.chars;
      chars.forEach((c) => gsap.set(c, { display: 'inline-block', attr: { 'data-content': c.innerHTML } }));
      const radius = Number(root.dataset.radius) || 100;
      const duration = Number(root.dataset.duration) || 1.2;
      const speed = Number(root.dataset.speed) || 0.5;
      const scrambleChars = root.dataset.chars || '.:';
      let inView = false;
      let rects = [];
      const measure = () => {
        rects = chars.map((c) => {
          const r = c.getBoundingClientRect();
          return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
        });
      };
      measure();
      addEventListener('resize', measure, { passive: true });
      addEventListener('scroll', measure, { passive: true });
      let busy = false;
      root.addEventListener('pointermove', (e) => {
        if (!inView || busy) return;
        busy = true;
        setTimeout(() => { busy = false; }, 30);
        chars.forEach((c, i) => {
          const d = rects[i];
          if (!d) return;
          const dist = Math.hypot(e.clientX - d.cx, e.clientY - d.cy);
          if (dist < radius) {
            gsap.to(c, {
              overwrite: true,
              duration: duration * (1 - dist / radius),
              scrambleText: { text: c.dataset.content || '', chars: scrambleChars, speed },
              ease: 'none'
            });
          }
        });
      }, { passive: true });
      new IntersectionObserver((en) => { inView = en[0].isIntersecting; }, { rootMargin: '120px' }).observe(root);
      root.__scrambled = () => ({ chars: chars.length });
    });
  })();

  /* SplitFlapText — 官方翻牌状态机逐行移植（纯 DOM） */
  (() => {
    const roots = document.querySelectorAll('[data-splitflap]');
    if (!roots.length) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const CHARSETS = {
      alpha: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      alphanumeric: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
      numeric: '0123456789'
    };
    const sampleChar = (cs) => cs.charAt(Math.floor(Math.random() * cs.length)) || ' ';
    roots.forEach((root) => {
      const phrases = (root.dataset.splitflap || '').split('|').map((s) => s.trim()).filter(Boolean);
      if (!phrases.length) return;
      const width = Math.max(10, ...phrases.map((s) => s.length));
      const norm = (ph) => (ph + ' '.repeat(width)).slice(0, width);
      const list = phrases.map(norm);
      const flipMs = Math.max(40, (Number(root.dataset.flipDuration) || 0.12) * 1000);
      const staggerMs = Math.max(0, Number(root.dataset.stagger ?? 0.06) * 1000);
      const cycleMs = Math.max(400, Number(root.dataset.cycleDelay) || 2400);
      const flips = Math.max(0, Number(root.dataset.flipsPerChar ?? 8));
      const charset = CHARSETS[root.dataset.charset] || (root.dataset.charset || CHARSETS.alphanumeric);
      const wrap = document.createElement('div');
      wrap.className = 'split-flap-text';
      wrap.style.setProperty('--split-flap-tile-color', root.dataset.tileColor || '#1B1430');
      wrap.style.setProperty('--split-flap-text-color', root.dataset.textColor || '#F4EFFF');
      wrap.style.setProperty('--split-flap-radius', (root.dataset.tileRadius || 6) + 'px');
      wrap.style.setProperty('--split-flap-font-size', (root.dataset.fontSize || 20) + 'px');
      wrap.style.setProperty('--split-flap-flip-duration', flipMs / 1000 + 's');
      const tiles = [];
      const buildTile = () => {
        const t = document.createElement('span');
        t.className = 'split-flap-text__tile';
        const top = document.createElement('span');
        top.className = 'split-flap-text__half split-flap-text__half--top';
        const bot = document.createElement('span');
        bot.className = 'split-flap-text__half split-flap-text__half--bottom';
        const tc = document.createElement('span'); tc.className = 'split-flap-text__char';
        const bc = document.createElement('span'); bc.className = 'split-flap-text__char';
        top.appendChild(tc); bot.appendChild(bc);
        t.appendChild(top); t.appendChild(bot);
        wrap.appendChild(t);
        return { el: t, tc, bc };
      };
      for (let i = 0; i < width; i += 1) tiles.push(buildTile());
      root.appendChild(wrap);
      let current = list[0];
      const paint = (phrase, flippingIdx) => {
        for (let i = 0; i < width; i += 1) {
          const ch = phrase[i] === ' ' ? ' ' : phrase[i];
          tiles[i].tc.textContent = ch;
          tiles[i].bc.textContent = ch;
          const flap = tiles[i].el.querySelector('.split-flap-text__flap--front');
          if (flap) { flap.remove(); tiles[i].el.querySelector('.split-flap-text__flap--back')?.remove(); }
          if (flippingIdx && flippingIdx.has(i)) {
            const f = document.createElement('span');
            f.className = 'split-flap-text__flap split-flap-text__flap--front';
            const fc = document.createElement('span'); fc.className = 'split-flap-text__char'; fc.textContent = ch;
            f.appendChild(fc);
            const b = document.createElement('span');
            b.className = 'split-flap-text__flap split-flap-text__flap--back';
            const bch = tiles[i].next || ch;
            const bc2 = document.createElement('span'); bc2.className = 'split-flap-text__char'; bc2.textContent = bch;
            b.appendChild(bc2);
            tiles[i].el.appendChild(f); tiles[i].el.appendChild(b);
          }
        }
      };
      paint(current);
      if (reduced || list.length < 2) { root.__splitflap = () => ({ text: current.trimEnd() }); return; }
      let idx = 0, timer = 0, raf = 0, inView = false;
      const animateTo = (target, done) => {
        const from = current;
        const plans = [];
        for (let i = 0; i < width; i += 1) {
          if (from[i] === target[i]) continue;
          const seq = [];
          for (let k = 0; k < flips; k += 1) seq.push(sampleChar(charset));
          seq.push(target[i]);
          plans.push({ i, from: from[i], target: target[i], seq, start: i * staggerMs, step: -1, done: false });
        }
        if (!plans.length) { current = target; paint(target); done && done(); return; }
        const startedAt = performance.now();
        const tick = (now) => {
          const elapsed = now - startedAt;
          const flipping = new Set();
          let more = false;
          plans.forEach((pl) => {
            const local = elapsed - pl.start;
            if (local < 0) { more = true; return; }
            const step = Math.floor(local / flipMs);
            if (step < pl.seq.length) {
              more = true;
              if (step !== pl.step) {
                pl.step = step;
                pl.cur = step === 0 ? pl.from : pl.seq[step - 1];
                pl.nxt = pl.seq[step];
                tiles[pl.i].tc.textContent = pl.cur === ' ' ? ' ' : pl.cur;
                tiles[pl.i].bc.textContent = pl.nxt;
                tiles[pl.i].next = pl.nxt;
                flipping.add(pl.i);
              } else if (pl.cur !== undefined) flipping.add(pl.i);
            } else if (!pl.done) {
              pl.done = true;
              tiles[pl.i].tc.textContent = pl.target;
              tiles[pl.i].bc.textContent = pl.target;
            }
          });
          if (flipping.size) {
            tiles.forEach((t, i) => {
              const oldF = t.el.querySelector('.split-flap-text__flap--front');
              if (oldF) oldF.remove();
              const oldB = t.el.querySelector('.split-flap-text__flap--back');
              if (oldB) oldB.remove();
              if (!flipping.has(i)) return;
              const f = document.createElement('span');
              f.className = 'split-flap-text__flap split-flap-text__flap--front';
              const fc = document.createElement('span'); fc.className = 'split-flap-text__char';
              fc.textContent = t.tc.textContent;
              f.appendChild(fc);
              const b = document.createElement('span');
              b.className = 'split-flap-text__flap split-flap-text__flap--back';
              const bc = document.createElement('span'); bc.className = 'split-flap-text__char';
              bc.textContent = t.next || t.bc.textContent;
              b.appendChild(bc);
              t.el.appendChild(f); t.el.appendChild(b);
            });
          }
          if (more) raf = requestAnimationFrame(tick);
          else {
            raf = 0;
            tiles.forEach((t) => { const x = t.el.querySelector('.split-flap-text__flap--front'); if (x) x.remove(); const y = t.el.querySelector('.split-flap-text__flap--back'); if (y) y.remove(); });
            current = target;
            done && done();
          }
        };
        raf = requestAnimationFrame(tick);
      };
      const schedule = () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          if (!inView || document.hidden) { schedule(); return; }
          idx = (idx + 1) % list.length;
          animateTo(list[idx], schedule);
        }, cycleMs);
      };
      new IntersectionObserver((en) => {
        inView = en[0].isIntersecting;
        if (inView && !timer && !raf) schedule();
      }, { rootMargin: '120px' }).observe(root);
      root.__splitflap = () => ({ text: current.trimEnd(), phrases: list.length });
    });
  })();

  /* FloatingLines — 官方 GLSL 原样，three.js 正交平面（Silk 同款配方） */
  (() => {
    const boxes = document.querySelectorAll('[data-floatinglines]');
    if (!boxes.length || typeof window.THREE === 'undefined') return;
    const T = window.THREE;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const VERT = 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }';
    const FRAG = [
      'precision highp float;',
      'uniform float iTime;',
      'uniform vec3  iResolution;',
      'uniform float animationSpeed;',
      'uniform bool enableTop;',
      'uniform bool enableMiddle;',
      'uniform bool enableBottom;',
      'uniform int topLineCount;',
      'uniform int middleLineCount;',
      'uniform int bottomLineCount;',
      'uniform float topLineDistance;',
      'uniform float middleLineDistance;',
      'uniform float bottomLineDistance;',
      'uniform vec3 topWavePosition;',
      'uniform vec3 middleWavePosition;',
      'uniform vec3 bottomWavePosition;',
      'uniform vec2 iMouse;',
      'uniform bool interactive;',
      'uniform float bendRadius;',
      'uniform float bendStrength;',
      'uniform float bendInfluence;',
      'uniform bool parallax;',
      'uniform float parallaxStrength;',
      'uniform vec2 parallaxOffset;',
      'uniform vec3 lineGradient[8];',
      'uniform int lineGradientCount;',
      'uniform vec3 backgroundColor;',
      'uniform bool lightMode;',
      'const vec3 BLACK = vec3(0.0);',
      'const vec3 PINK  = vec3(233.0, 71.0, 245.0) / 255.0;',
      'const vec3 BLUE  = vec3(47.0,  75.0, 162.0) / 255.0;',
      'mat2 rotate(float r) { return mat2(cos(r), sin(r), -sin(r), cos(r)); }',
      'vec3 background_color(vec2 uv) {',
      '  vec3 col = vec3(0.0);',
      '  float y = sin(uv.x - 0.2) * 0.3 - 0.1;',
      '  float m = uv.y - y;',
      '  col += mix(BLUE, BLACK, smoothstep(0.0, 1.0, abs(m)));',
      '  col += mix(PINK, BLACK, smoothstep(0.0, 1.0, abs(m - 0.8)));',
      '  return col * 0.5;',
      '}',
      'vec3 getLineColor(float t, vec3 baseColor) {',
      '  if (lineGradientCount <= 0) { return baseColor; }',
      '  vec3 gradientColor;',
      '  if (lineGradientCount == 1) { gradientColor = lineGradient[0]; }',
      '  else {',
      '    float clampedT = clamp(t, 0.0, 0.9999);',
      '    float scaled = clampedT * float(lineGradientCount - 1);',
      '    int idx = int(floor(scaled));',
      '    float f = fract(scaled);',
      '    int idx2 = min(idx + 1, lineGradientCount - 1);',
      '    vec3 c1 = lineGradient[idx];',
      '    vec3 c2 = lineGradient[idx2];',
      '    gradientColor = mix(c1, c2, f);',
      '  }',
      '  return gradientColor * 0.5;',
      '}',
      'float wave(vec2 uv, float offset, vec2 screenUv, vec2 mouseUv, bool shouldBend) {',
      '  float time = iTime * animationSpeed;',
      '  float x_offset   = offset;',
      '  float x_movement = time * 0.1;',
      '  float amp        = sin(offset + time * 0.2) * 0.3;',
      '  float y          = sin(uv.x + x_offset + x_movement) * amp;',
      '  if (shouldBend) {',
      '    vec2 d = screenUv - mouseUv;',
      '    float influence = exp(-dot(d, d) * bendRadius);',
      '    float bendOffset = (mouseUv.y - screenUv.y) * influence * bendStrength * bendInfluence;',
      '    y += bendOffset;',
      '  }',
      '  float m = uv.y - y;',
      '  return 0.0175 / max(abs(m) + 0.01, 1e-3) + 0.01;',
      '}',
      'void mainImage(out vec4 fragColor, in vec2 fragCoord) {',
      '  vec2 baseUv = (2.0 * fragCoord - iResolution.xy) / iResolution.y;',
      '  baseUv.y *= -1.0;',
      '  if (parallax) { baseUv += parallaxOffset; }',
      '  vec3 col = vec3(0.0);',
      '  vec3 b = lineGradientCount > 0 ? vec3(0.0) : background_color(baseUv);',
      '  vec2 mouseUv = vec2(0.0);',
      '  if (interactive) { mouseUv = (2.0 * iMouse - iResolution.xy) / iResolution.y; mouseUv.y *= -1.0; }',
      '  if (enableBottom) {',
      '    for (int i = 0; i < bottomLineCount; ++i) {',
      '      float fi = float(i);',
      '      float t = fi / max(float(bottomLineCount - 1), 1.0);',
      '      vec3 lineCol = getLineColor(t, b);',
      '      float angle = bottomWavePosition.z * log(length(baseUv) + 1.0);',
      '      vec2 ruv = baseUv * rotate(angle);',
      '      col += lineCol * wave(ruv + vec2(bottomLineDistance * fi + bottomWavePosition.x, bottomWavePosition.y), 1.5 + 0.2 * fi, baseUv, mouseUv, interactive) * 0.2;',
      '    }',
      '  }',
      '  if (enableMiddle) {',
      '    for (int i = 0; i < middleLineCount; ++i) {',
      '      float fi = float(i);',
      '      float t = fi / max(float(middleLineCount - 1), 1.0);',
      '      vec3 lineCol = getLineColor(t, b);',
      '      float angle = middleWavePosition.z * log(length(baseUv) + 1.0);',
      '      vec2 ruv = baseUv * rotate(angle);',
      '      col += lineCol * wave(ruv + vec2(middleLineDistance * fi + middleWavePosition.x, middleWavePosition.y), 2.0 + 0.15 * fi, baseUv, mouseUv, interactive);',
      '    }',
      '  }',
      '  if (enableTop) {',
      '    for (int i = 0; i < topLineCount; ++i) {',
      '      float fi = float(i);',
      '      float t = fi / max(float(topLineCount - 1), 1.0);',
      '      vec3 lineCol = getLineColor(t, b);',
      '      float angle = topWavePosition.z * log(length(baseUv) + 1.0);',
      '      vec2 ruv = baseUv * rotate(angle);',
      '      ruv.x *= -1.0;',
      '      col += lineCol * wave(ruv + vec2(topLineDistance * fi + topWavePosition.x, topWavePosition.y), 1.0 + 0.2 * fi, baseUv, mouseUv, interactive) * 0.1;',
      '    }',
      '  }',
      '  if (lightMode) {',
      '    vec3 energy = max(col, vec3(0.0));',
      '    float peak = max(energy.r, max(energy.g, energy.b));',
      '    float coverage = smoothstep(0.018, 0.5, peak);',
      '    vec3 chroma = clamp(energy / max(peak, 0.0001), 0.0, 1.0);',
      '    chroma = pow(chroma, vec3(1.35));',
      '    float chromaPeak = max(chroma.r, max(chroma.g, chroma.b));',
      '    chroma /= max(chromaPeak, 0.0001);',
      '    vec3 ink = mix(chroma, clamp(chroma * 0.82, 0.0, 1.0), smoothstep(0.5, 1.0, coverage));',
      '    fragColor = vec4(mix(vec3(1.0), ink, coverage * 0.94), 1.0);',
      '  } else {',
      '    fragColor = vec4(col, 1.0);',
      '  }',
      '}',
      'void main() { vec4 color = vec4(0.0); mainImage(color, gl_FragCoord.xy); gl_FragColor = color; }'
    ].join('\n');
    const hexV3 = (hex) => new T.Vector3(
      parseInt(hex.slice(1, 3), 16) / 255,
      parseInt(hex.slice(3, 5), 16) / 255,
      parseInt(hex.slice(5, 7), 16) / 255
    );
    boxes.forEach((box) => {
      const canvas = box.querySelector('canvas');
      const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false });
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
      const scene = new T.Scene();
      const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      camera.position.z = 1;
      const stops = (box.dataset.gradient || '#8B5CF6,#E879F9,#C4B5FD').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 8);
      const uniforms = {
        iTime: { value: 0 },
        iResolution: { value: new T.Vector3(1, 1, 1) },
        animationSpeed: { value: Number(box.dataset.speed) || 1 },
        enableTop: { value: true }, enableMiddle: { value: true }, enableBottom: { value: true },
        topLineCount: { value: 6 }, middleLineCount: { value: 6 }, bottomLineCount: { value: 6 },
        topLineDistance: { value: 0.06 }, middleLineDistance: { value: 0.05 }, bottomLineDistance: { value: 0.05 },
        topWavePosition: { value: new T.Vector3(10.0, 0.5, -0.4) },
        middleWavePosition: { value: new T.Vector3(5.0, 0.0, 0.2) },
        bottomWavePosition: { value: new T.Vector3(2.0, -0.7, 0.4) },
        iMouse: { value: new T.Vector2(-1000, -1000) },
        interactive: { value: true },
        bendRadius: { value: 5.0 }, bendStrength: { value: -0.5 }, bendInfluence: { value: 0 },
        parallax: { value: true }, parallaxStrength: { value: 0.2 },
        parallaxOffset: { value: new T.Vector2(0, 0) },
        lineGradient: { value: Array.from({ length: 8 }, (_, i) => hexV3(stops[i % stops.length] || '#ffffff')) },
        lineGradientCount: { value: stops.length },
        backgroundColor: { value: new T.Vector3(0, 0, 0) },
        lightMode: { value: document.documentElement.getAttribute('data-theme') === 'light' }
      };
      const mat = new T.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG });
      scene.add(new T.Mesh(new T.PlaneGeometry(2, 2), mat));
      const setSize = () => {
        const r = box.getBoundingClientRect();
        renderer.setSize(r.width, r.height, false);
        uniforms.iResolution.value.set(renderer.domElement.width, renderer.domElement.height, 1);
      };
      setSize();
      const tm = new T.Vector2(-1000, -1000), cm = new T.Vector2(-1000, -1000);
      const tp = new T.Vector2(), cp = new T.Vector2();
      let tInf = 0, cInf = 0;
      canvas.addEventListener('pointermove', (e) => {
        const r = canvas.getBoundingClientRect();
        const x = e.clientX - r.left, y = e.clientY - r.top;
        const dpr = renderer.getPixelRatio();
        tm.set(x * dpr, (r.height - y) * dpr);
        tInf = 1;
        tp.set(((x - r.width / 2) / r.width) * 0.2, (-(y - r.height / 2) / r.height) * 0.2);
      }, { passive: true });
      canvas.addEventListener('pointerleave', () => { tInf = 0; }, { passive: true });
      const clock = new T.Clock();
      let raf = 0, inView = false;
      const loop = () => {
        uniforms.iTime.value = clock.getElapsedTime();
        cm.lerp(tm, 0.05); uniforms.iMouse.value.copy(cm);
        cInf += (tInf - cInf) * 0.05; uniforms.bendInfluence.value = cInf;
        cp.lerp(tp, 0.05); uniforms.parallaxOffset.value.copy(cp);
        renderer.render(scene, camera);
        raf = requestAnimationFrame(loop);
      };
      const sync = () => {
        const want = inView && !document.hidden;
        if (want && !raf) raf = requestAnimationFrame(loop);
        else if (!want && raf) { cancelAnimationFrame(raf); raf = 0; }
      };
      if ('ResizeObserver' in window) new ResizeObserver(setSize).observe(box);
      else addEventListener('resize', setSize, { passive: true });
      document.addEventListener('visibilitychange', () => { uniforms.lightMode.value = document.documentElement.getAttribute('data-theme') === 'light'; sync(); });
      if (reduced) {
        uniforms.iTime.value = 6;
        renderer.render(scene, camera);
        box.__floatinglines = () => ({ running: false });
        return;
      }
      new IntersectionObserver((en) => { inView = en[0].isIntersecting; sync(); }, { rootMargin: '120px' }).observe(box);
      box.__floatinglines = () => ({ running: !!raf, t: uniforms.iTime.value });
    });
  })();

  /* SoftAurora — 官方 ogl 版以 three.js 等价移植，GLSL 原样 */
  (() => {
    const boxes = document.querySelectorAll('[data-softaurora]');
    if (!boxes.length || typeof window.THREE === 'undefined') return;
    const T = window.THREE;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const VERT = 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }';
    const FRAG = [
      'precision highp float;',
      'uniform float uTime;',
      'uniform vec3 uResolution;',
      'uniform float uSpeed;',
      'uniform float uScale;',
      'uniform float uBrightness;',
      'uniform vec3 uColor1;',
      'uniform vec3 uColor2;',
      'uniform float uNoiseFreq;',
      'uniform float uNoiseAmp;',
      'uniform float uBandHeight;',
      'uniform float uBandSpread;',
      'uniform float uOctaveDecay;',
      'uniform float uLayerOffset;',
      'uniform float uColorSpeed;',
      'uniform vec2 uMouse;',
      'uniform float uMouseInfluence;',
      'uniform bool uEnableMouse;',
      'uniform float uLightMode;',
      '#define TAU 6.28318',
      'vec3 gradientHash(vec3 p) {',
      '  p = vec3(',
      '    dot(p, vec3(127.1, 311.7, 234.6)),',
      '    dot(p, vec3(269.5, 183.3, 198.3)),',
      '    dot(p, vec3(169.5, 283.3, 156.9))',
      '  );',
      '  vec3 h = fract(sin(p) * 43758.5453123);',
      '  float phi = acos(2.0 * h.x - 1.0);',
      '  float theta = TAU * h.y;',
      '  return vec3(cos(theta) * sin(phi), sin(theta) * cos(phi), cos(phi));',
      '}',
      'float quinticSmooth(float t) {',
      '  float t2 = t * t;',
      '  float t3 = t * t2;',
      '  return 6.0 * t3 * t2 - 15.0 * t2 * t2 + 10.0 * t3;',
      '}',
      'vec3 cosineGradient(float t, vec3 a, vec3 b, vec3 c, vec3 d) {',
      '  return a + b * cos(TAU * (c * t + d));',
      '}',
      'float perlin3D(float amplitude, float frequency, float px, float py, float pz) {',
      '  float x = px * frequency;',
      '  float y = py * frequency;',
      '  float fx = floor(x); float fy = floor(y); float fz = floor(pz);',
      '  float cx = ceil(x);  float cy = ceil(y);  float cz = ceil(pz);',
      '  vec3 g000 = gradientHash(vec3(fx, fy, fz));',
      '  vec3 g100 = gradientHash(vec3(cx, fy, fz));',
      '  vec3 g010 = gradientHash(vec3(fx, cy, fz));',
      '  vec3 g110 = gradientHash(vec3(cx, cy, fz));',
      '  vec3 g001 = gradientHash(vec3(fx, fy, cz));',
      '  vec3 g101 = gradientHash(vec3(cx, fy, cz));',
      '  vec3 g011 = gradientHash(vec3(fx, cy, cz));',
      '  vec3 g111 = gradientHash(vec3(cx, cy, cz));',
      '  float d000 = dot(g000, vec3(x - fx, y - fy, pz - fz));',
      '  float d100 = dot(g100, vec3(x - cx, y - fy, pz - fz));',
      '  float d010 = dot(g010, vec3(x - fx, y - cy, pz - fz));',
      '  float d110 = dot(g110, vec3(x - cx, y - cy, pz - fz));',
      '  float d001 = dot(g001, vec3(x - fx, y - fy, pz - cz));',
      '  float d101 = dot(g101, vec3(x - cx, y - fy, pz - cz));',
      '  float d011 = dot(g011, vec3(x - fx, y - cy, pz - cz));',
      '  float d111 = dot(g111, vec3(x - cx, y - cy, pz - cz));',
      '  float sx = quinticSmooth(x - fx);',
      '  float sy = quinticSmooth(y - fy);',
      '  float sz = quinticSmooth(pz - fz);',
      '  float lx00 = mix(d000, d100, sx);',
      '  float lx10 = mix(d010, d110, sx);',
      '  float lx01 = mix(d001, d101, sx);',
      '  float lx11 = mix(d011, d111, sx);',
      '  float ly0 = mix(lx00, lx10, sy);',
      '  float ly1 = mix(lx01, lx11, sy);',
      '  return amplitude * mix(ly0, ly1, sz);',
      '}',
      'float auroraGlow(float t, vec2 shift) {',
      '  vec2 uv = gl_FragCoord.xy / uResolution.y;',
      '  uv += shift;',
      '  float noiseVal = 0.0;',
      '  float freq = uNoiseFreq;',
      '  float amp = uNoiseAmp;',
      '  vec2 samplePos = uv * uScale;',
      '  for (float i = 0.0; i < 3.0; i += 1.0) {',
      '    noiseVal += perlin3D(amp, freq, samplePos.x, samplePos.y, t);',
      '    amp *= uOctaveDecay;',
      '    freq *= 2.0;',
      '  }',
      '  float yBand = uv.y * 10.0 - uBandHeight * 10.0;',
      '  return 0.3 * max(exp(uBandSpread * (1.0 - 1.1 * abs(noiseVal + yBand))), 0.0);',
      '}',
      'void main() {',
      '  vec2 uv = gl_FragCoord.xy / uResolution.xy;',
      '  float t = uSpeed * 0.4 * uTime;',
      '  vec2 shift = vec2(0.0);',
      '  if (uEnableMouse) { shift = (uMouse - 0.5) * uMouseInfluence; }',
      '  float glow1 = auroraGlow(t, shift);',
      '  float glow2 = auroraGlow(t + uLayerOffset, shift);',
      '  vec3 gradient1 = cosineGradient(uv.x + uTime * uSpeed * 0.2 * uColorSpeed, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.3, 0.20, 0.20));',
      '  vec3 gradient2 = cosineGradient(uv.x + uTime * uSpeed * 0.1 * uColorSpeed, vec3(0.5), vec3(0.5), vec3(2.0, 1.0, 0.0), vec3(0.5, 0.20, 0.25));',
      '  vec3 col = 0.99 * glow1 * gradient1 * uColor1;',
      '  col += 0.99 * glow2 * gradient2 * uColor2;',
      '  col *= uBrightness;',
      '  float alpha = clamp(length(col), 0.0, 1.0);',
      '  if (uLightMode > 0.5) {',
      '    float phase1 = dot(gradient1, vec3(0.299, 0.587, 0.114));',
      '    float phase2 = dot(gradient2, vec3(0.299, 0.587, 0.114));',
      '    float weight1 = pow(max(glow1 * (0.62 + 0.38 * phase1), 0.0), 1.35);',
      '    float weight2 = pow(max(glow2 * (0.62 + 0.38 * phase2), 0.0), 1.35);',
      '    float weightSum = max(weight1 + weight2, 0.0001);',
      '    vec3 chroma = (weight1 * uColor1 + weight2 * uColor2) / weightSum;',
      '    float neutral = min(chroma.r, min(chroma.g, chroma.b));',
      '    chroma = max(chroma - vec3(neutral * 0.78), vec3(0.0));',
      '    float peak = max(chroma.r, max(chroma.g, chroma.b));',
      '    chroma = pow(clamp(chroma / max(peak, 0.0001), 0.0, 1.0), vec3(1.08));',
      '    float ink = clamp((weight1 + weight2) * uBrightness * 1.55, 0.0, 0.82);',
      '    gl_FragColor = vec4(mix(vec3(1.0), chroma, ink), 1.0);',
      '  } else {',
      '    gl_FragColor = vec4(col, alpha);',
      '  }',
      '}'
    ].join('\n');
    const hexV3 = (hex) => new T.Vector3(
      parseInt(hex.slice(1, 3), 16) / 255,
      parseInt(hex.slice(3, 5), 16) / 255,
      parseInt(hex.slice(5, 7), 16) / 255
    );
    boxes.forEach((box) => {
      const canvas = box.querySelector('canvas');
      const renderer = new T.WebGLRenderer({ canvas, alpha: true, premultipliedAlpha: false });
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
      renderer.setClearColor(0x000000, 0);
      const scene = new T.Scene();
      const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const uniforms = {
        uTime: { value: 0 },
        uResolution: { value: new T.Vector3(1, 1, 1) },
        uSpeed: { value: Number(box.dataset.speed) || 0.6 },
        uScale: { value: Number(box.dataset.scale) || 1.5 },
        uBrightness: { value: box.dataset.brightness != null ? Number(box.dataset.brightness) : 1.0 },
        uColor1: { value: hexV3(box.dataset.color1 || '#f7f7f7') },
        uColor2: { value: hexV3(box.dataset.color2 || '#e100ff') },
        uNoiseFreq: { value: Number(box.dataset.noiseFreq) || 2.5 },
        uNoiseAmp: { value: Number(box.dataset.noiseAmp) || 1.0 },
        uBandHeight: { value: Number(box.dataset.bandHeight) || 0.5 },
        uBandSpread: { value: Number(box.dataset.bandSpread) || 1.0 },
        uOctaveDecay: { value: Number(box.dataset.octaveDecay) || 0.1 },
        uLayerOffset: { value: Number(box.dataset.layerOffset) || 0 },
        uColorSpeed: { value: Number(box.dataset.colorSpeed) || 1.0 },
        uMouse: { value: new T.Vector2(0.5, 0.5) },
        uMouseInfluence: { value: Number(box.dataset.mouseInfluence) || 0.25 },
        uEnableMouse: { value: true },
        uLightMode: { value: document.documentElement.getAttribute('data-theme') === 'light' ? 1 : 0 }
      };
      const mat = new T.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true });
      scene.add(new T.Mesh(new T.PlaneGeometry(2, 2), mat));
      const setSize = () => {
        const r = box.getBoundingClientRect();
        renderer.setSize(r.width, r.height, false);
        uniforms.uResolution.value.set(renderer.domElement.width, renderer.domElement.height, renderer.domElement.width / renderer.domElement.height);
      };
      setSize();
      const tm = new T.Vector2(0.5, 0.5), cm = new T.Vector2(0.5, 0.5);
      canvas.addEventListener('pointermove', (e) => {
        const r = canvas.getBoundingClientRect();
        tm.set((e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height);
      }, { passive: true });
      canvas.addEventListener('pointerleave', () => { tm.set(0.5, 0.5); }, { passive: true });
      let raf = 0, inView = false;
      const loop = (now) => {
        uniforms.uTime.value = now * 0.001;
        cm.x += 0.05 * (tm.x - cm.x);
        cm.y += 0.05 * (tm.y - cm.y);
        uniforms.uMouse.value.copy(cm);
        renderer.render(scene, camera);
        raf = requestAnimationFrame(loop);
      };
      const sync = () => {
        const want = inView && !document.hidden;
        if (want && !raf) raf = requestAnimationFrame(loop);
        else if (!want && raf) { cancelAnimationFrame(raf); raf = 0; }
      };
      if ('ResizeObserver' in window) new ResizeObserver(setSize).observe(box);
      else addEventListener('resize', setSize, { passive: true });
      document.addEventListener('visibilitychange', () => { uniforms.uLightMode.value = document.documentElement.getAttribute('data-theme') === 'light' ? 1 : 0; sync(); });
      if (reduced) {
        uniforms.uTime.value = 4;
        renderer.render(scene, camera);
        box.__softaurora = () => ({ running: false });
        return;
      }
      new IntersectionObserver((en) => { inView = en[0].isIntersecting; sync(); }, { rootMargin: '120px' }).observe(box);
      box.__softaurora = () => ({ running: !!raf, t: uniforms.uTime.value });
    });
  })();

  /* ── Lottie Violet Bloom — text-to-lottie 技能产出，官方 Skottie 验证过的 90 帧无缝循环 ── */
  (() => {
    const boxes = document.querySelectorAll('[data-lottie]');
    if (!boxes.length || typeof window.lottie === 'undefined') return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    boxes.forEach((box) => {
      fetch(box.dataset.lottie)
        .then((r) => {
          if (!r.ok) throw new Error('lottie ' + r.status);
          return r.json();
        })
        .then((data) => {
          const anim = window.lottie.loadAnimation({
            container: box,
            renderer: 'svg',
            loop: true,
            autoplay: false,
            animationData: data
          });
          box.__lottie = (() => {
            let playing = false;
            if (reduced) {
              anim.goToAndStop(45, true);
              return () => ({ frame: anim.currentFrame, playing: false });
            }
            let inView = false;
            const sync = () => {
              const want = inView && !document.hidden;
              if (want && !playing) { playing = true; anim.play(); }
              else if (!want && playing) { playing = false; anim.pause(); }
            };
            new IntersectionObserver((en) => { inView = en[0].isIntersecting; sync(); }, { rootMargin: '120px' }).observe(box);
            document.addEventListener('visibilitychange', sync);
            return () => ({ frame: anim.currentFrame, playing });
          })();
        })
        .catch(() => {});
    });
  })();

  /* CountUp — 官方 motion useSpring 等价移植（damping/stiffness 公式原样，半隐式欧拉积分） */
  (() => {
    const els = document.querySelectorAll('[data-rb-countup]');
    if (!els.length) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    els.forEach((el) => {
      const to = Number(el.dataset.rbCountup);
      const from = el.dataset.from != null ? Number(el.dataset.from) : 0;
      const duration = Number(el.dataset.duration) || 2;
      const separator = el.dataset.separator || '';
      const down = el.dataset.direction === 'down';
      const decimals = (n) => {
        const s = String(n);
        if (s.includes('.')) {
          const d = s.split('.')[1];
          if (parseInt(d, 10) !== 0) return d.length;
        }
        return 0;
      };
      const maxDecimals = Math.max(decimals(from), decimals(to));
      const format = (latest) => {
        const options = {
          useGrouping: !!separator,
          minimumFractionDigits: maxDecimals > 0 ? maxDecimals : 0,
          maximumFractionDigits: maxDecimals > 0 ? maxDecimals : 0
        };
        const s = Intl.NumberFormat('en-US', options).format(latest);
        return separator ? s.replace(/,/g, separator) : s;
      };
      const initial = down ? to : from;
      el.textContent = format(initial);
      if (reduced) { el.__countup = () => ({ value: to }); return; }
      const damping = 20 + 40 * (1 / duration);
      const stiffness = 100 * (1 / duration);
      let started = false;
      const run = () => {
        const target = down ? from : to;
        let x = initial, v = 0, prev = performance.now(), acc = 0;
        const h = 1 / 120;
        const step = (now) => {
          let dt = (now - prev) / 1000;
          prev = now;
          if (dt > 0.1) dt = 0.1;
          acc += dt;
          while (acc >= h) {
            const a = -stiffness * (x - target) - damping * v;
            v += a * h;
            x += v * h;
            acc -= h;
          }
          el.textContent = format(x);
          if (Math.abs(x - target) < 0.005 && Math.abs(v) < 0.005) {
            el.textContent = format(target);
            return;
          }
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      };
      new IntersectionObserver((en) => {
        if (en[0].isIntersecting && !started) { started = true; run(); }
      }, { rootMargin: '0px' }).observe(el);
      el.__countup = () => ({ text: el.textContent });
    });
  })();

  /* TextLoop — 官方 SVG textPath 双头环绕状态机逐行移植（wave/circle/infinity/arch/line） */
  (() => {
    const els = document.querySelectorAll('[data-textloop]');
    if (!els.length || typeof window.gsap === 'undefined') return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const NS = 'http://www.w3.org/2000/svg';
    const VIEW_W = 1200, VIEW_H = 520, CX = VIEW_W / 2, CY = VIEW_H / 2, EDGE_PAD = 6;
    const buildPath = (shape, curviness, ribbonWidth) => {
      const c = Math.max(0, curviness);
      const room = Math.max(20, CY - Math.max(0, ribbonWidth) / 2 - EDGE_PAD);
      switch (shape) {
        case 'circle': {
          const r = Math.min(90 + c * 0.95, room);
          return `M ${CX - r} ${CY} A ${r} ${r} 0 1 1 ${CX + r} ${CY} A ${r} ${r} 0 1 1 ${CX - r} ${CY} Z`;
        }
        case 'infinity': {
          const r = 150 + c * 1.4;
          const h = Math.min(60 + c * 0.95, room);
          return [
            `M ${CX} ${CY}`,
            `C ${CX + r * 0.55} ${CY - h} ${CX + r} ${CY - h} ${CX + r} ${CY}`,
            `C ${CX + r} ${CY + h} ${CX + r * 0.55} ${CY + h} ${CX} ${CY}`,
            `C ${CX - r * 0.55} ${CY - h} ${CX - r} ${CY - h} ${CX - r} ${CY}`,
            `C ${CX - r} ${CY + h} ${CX - r * 0.55} ${CY + h} ${CX} ${CY}`,
            'Z'
          ].join(' ');
        }
        case 'arch': {
          const rise = Math.min(120 + c * 1.1, room * 2);
          return `M 120 ${CY + rise / 2} Q ${CX} ${CY - rise * 1.5} ${VIEW_W - 120} ${CY + rise / 2}`;
        }
        case 'line':
          return `M -320 ${CY} L ${VIEW_W + 320} ${CY}`;
        case 'wave':
        default: {
          const a = Math.min(c * 2.2, room * 2);
          return `M -320 ${CY} Q -160 ${CY - a} 0 ${CY} T 320 ${CY} T 640 ${CY} T 960 ${CY} T 1280 ${CY} T ${VIEW_W + 320} ${CY}`;
        }
      }
    };
    let uid = 0;
    els.forEach((root) => {
      const text = root.dataset.textloop || 'LUMEN VIOLA';
      const shape = root.dataset.shape || 'wave';
      const speed = Number(root.dataset.speed) || 90;
      const direction = root.dataset.direction || 'forward';
      const separator = root.dataset.separator != null ? root.dataset.separator : '✦';
      const curviness = Number(root.dataset.curviness) || 90;
      const fontSize = Number(root.dataset.fontSize) || 46;
      const fontWeight = Number(root.dataset.fontWeight) || 800;
      const letterSpacing = Number(root.dataset.letterSpacing) || 2;
      const ribbon = root.dataset.ribbon !== 'false';
      const ribbonWidth = Number(root.dataset.ribbonWidth) || 86;
      const d = root.dataset.path || buildPath(shape, curviness, ribbonWidth);
      const base = (root.dataset.lowercase == null) ? text.toUpperCase() : text;
      const gap = separator ? `\u00A0${separator}\u00A0` : '\u00A0\u00A0\u00A0';
      const unit = `${base}${gap}`;
      const pathId = `text-loop-vn-${++uid}`;

      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('class', 'text-loop-svg');
      svg.setAttribute('viewBox', `0 0 ${VIEW_W} ${VIEW_H}`);
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', text);
      const mk = (tag, attrs) => {
        const n = document.createElementNS(NS, tag);
        Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
        return n;
      };
      const path = mk('path', { id: pathId, d, fill: 'none', class: 'text-loop-path', 'stroke-width': ribbon ? ribbonWidth : 0, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      if (!ribbon) path.setAttribute('stroke', 'none');
      svg.appendChild(path);
      const style = `font-size:${fontSize}px;font-weight:${fontWeight};letter-spacing:${letterSpacing}px`;
      const measure = mk('text', { class: 'text-loop-measure', style });
      measure.textContent = unit;
      svg.appendChild(measure);
      const mkLoop = () => {
        const t = mk('text', { class: 'text-loop-text', style, 'dominant-baseline': 'central', 'aria-hidden': 'true' });
        const tp = mk('textPath', { href: `#${pathId}`, startOffset: '0' });
        t.appendChild(tp);
        svg.appendChild(t);
        return tp;
      };
      const head = mkLoop();
      const tail = mkLoop();
      root.appendChild(svg);

      const measureAll = () => {
        let length = 0, unitWidth = 0;
        try {
          length = path.getTotalLength();
          unitWidth = measure.getComputedTextLength();
        } catch (e) { return null; }
        if (!length) return null;
        const reps = unitWidth > 0 ? Math.max(1, Math.round(length / unitWidth)) : 1;
        return { length, reps };
      };
      const apply = (offset, length) => {
        const partner = offset >= 0 ? offset - length : offset + length;
        head.setAttribute('startOffset', String(offset));
        tail.setAttribute('startOffset', String(partner));
      };
      let tween = null;
      const boot = () => {
        const m = measureAll();
        if (!m) return;
        head.textContent = unit.repeat(m.reps);
        tail.textContent = unit.repeat(m.reps);
        head.setAttribute('textLength', m.length);
        head.setAttribute('lengthAdjust', 'spacing');
        tail.setAttribute('textLength', m.length);
        tail.setAttribute('lengthAdjust', 'spacing');
        apply(0, m.length);
        if (reduced || speed <= 0 || tween) return;
        const state = { offset: 0 };
        tween = window.gsap.to(state, {
          offset: direction === 'reverse' ? -m.length : m.length,
          duration: m.length / speed,
          ease: 'none',
          repeat: -1,
          onUpdate: () => apply(state.offset, m.length)
        });
        let inView = false;
        const sync = () => {
          const want = inView && !document.hidden;
          if (want && tween.paused()) tween.resume();
          else if (!want && !tween.paused()) tween.pause();
        };
        new IntersectionObserver((en) => { inView = en[0].isIntersecting; sync(); }, { rootMargin: '120px' }).observe(root);
        document.addEventListener('visibilitychange', sync);
        if (root.dataset.pauseOnHover !== 'false') {
          root.addEventListener('pointerenter', () => tween.pause());
          root.addEventListener('pointerleave', sync);
        }
        root.__textloop = () => ({ offset: Number(state.offset.toFixed(1)), paused: tween.paused() });
      };
      boot();
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(boot).catch(() => {});
    });
  })();

  /* TextPressure — 官方 Roboto Flex 可变字体压力字重移植（rect 缓存 + 静止自停，遵循 gsap-performance） */
  (() => {
    const boxes = document.querySelectorAll('[data-textpressure]');
    if (!boxes.length) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    boxes.forEach((container) => {
      const text = container.dataset.textpressure || 'VIOLA';
      const minFontSize = Number(container.dataset.minFont) || 24;
      const title = document.createElement('h1');
      title.className = 'text-pressure-title';
      title.setAttribute('aria-label', text);
      const spans = [];
      text.split('').forEach((ch) => {
        const s = document.createElement('span');
        s.textContent = ch;
        s.setAttribute('data-char', ch);
        title.appendChild(s);
        spans.push(s);
      });
      container.appendChild(title);
      const setSize = () => {
        const w = container.clientWidth;
        const fs = Math.max(w / (spans.length / 2), minFontSize);
        title.style.fontSize = fs + 'px';
        centers = null;
      };
      let centers = null;
      const measureCenters = () => {
        centers = spans.map((s) => {
          const r = s.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        });
        titleW2 = title.getBoundingClientRect().width / 2;
      };
      let titleW2 = 1;
      const cursor = { x: 0, y: 0 };
      const mouse = { x: 0, y: 0 };
      let raf = 0, inView = false, dirty = 0;
      const getAttr = (distance, maxDist, minVal, maxVal) => {
        const val = maxVal - Math.abs((maxVal * distance) / maxDist);
        return Math.max(minVal, val + minVal);
      };
      const applyVars = () => {
        if (!centers) measureCenters();
        spans.forEach((span, i) => {
          const dx = mouse.x - centers[i].x, dy = mouse.y - centers[i].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          const wdth = Math.floor(getAttr(d, titleW2, 5, 200));
          const wght = Math.floor(getAttr(d, titleW2, 100, 900));
          const ital = getAttr(d, titleW2, 0, 1).toFixed(2);
          const fvs = `'wght' ${wght}, 'wdth' ${wdth}, 'ital' ${ital}`;
          if (span.style.fontVariationSettings !== fvs) span.style.fontVariationSettings = fvs;
        });
      };
      const step = () => {
        mouse.x += (cursor.x - mouse.x) / 15;
        mouse.y += (cursor.y - mouse.y) / 15;
        applyVars();
        const moving = Math.abs(cursor.x - mouse.x) > 0.3 || Math.abs(cursor.y - mouse.y) > 0.3;
        if (moving || --dirty > 0) raf = requestAnimationFrame(step);
        else raf = 0;
      };
      const wake = () => {
        dirty = 30;
        if (inView && !document.hidden && !raf && !reduced) raf = requestAnimationFrame(step);
      };
      addEventListener('pointermove', (e) => { cursor.x = e.clientX; cursor.y = e.clientY; wake(); }, { passive: true });
      addEventListener('touchmove', (e) => {
        const t = e.touches[0];
        cursor.x = t.clientX; cursor.y = t.clientY; wake();
      }, { passive: true });
      const reset = () => {
        const r = container.getBoundingClientRect();
        if (!raf) { mouse.x = cursor.x = r.left + r.width / 2; mouse.y = cursor.y = r.top + r.height / 2; }
        centers = null;
        wake();
      };
      addEventListener('resize', reset, { passive: true });
      addEventListener('scroll', () => { centers = null; wake(); }, { passive: true });
      setSize();
      const home = () => {
        const r = container.getBoundingClientRect();
        mouse.x = cursor.x = r.left + r.width / 2;
        mouse.y = cursor.y = r.top + r.height / 2;
        applyVars();
      };
      let initialized = false;
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { centers = null; if (initialized) applyVars(); }).catch(() => {});
      if ('ResizeObserver' in window) new ResizeObserver(setSize).observe(container);
      new IntersectionObserver((en) => {
        inView = en[0].isIntersecting;
        if (inView && !initialized) { initialized = true; home(); }
        if (inView) wake();
      }, { rootMargin: '120px' }).observe(container);
      document.addEventListener('visibilitychange', () => { if (document.hidden && raf) { cancelAnimationFrame(raf); raf = 0; } else wake(); });
      container.__textpressure = () => ({ sample: spans[0] && spans[0].style.fontVariationSettings, mouse: { x: Math.round(mouse.x), y: Math.round(mouse.y) }, cursor: { x: Math.round(cursor.x), y: Math.round(cursor.y) }, inView, raf: !!raf, maxDist: Math.round(titleW2), c0: centers && centers[0] && { x: Math.round(centers[0].x), y: Math.round(centers[0].y) } });
    });
  })();

  /* Shuffle — 官方字符条带洗牌移植（SplitText；水平 right/left + evenodd/random + 循环 + 悬停重触发） */
  (() => {
    const els = document.querySelectorAll('[data-shuffle]');
    if (!els.length || !window.gsap || !window.SplitText || !window.ScrollTrigger) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { els.forEach((el) => el.classList.add('is-ready')); return; }
    gsap.registerPlugin(SplitText, ScrollTrigger);
    els.forEach((el) => {
      const ds = el.dataset;
      const duration = Number(ds.duration) || 0.35;
      const ease = ds.ease || 'power3.out';
      const stagger = Number(ds.stagger) || 0.03;
      const rolls = Math.max(1, Math.floor(Number(ds.times) || 1));
      const mode = ds.mode || 'evenodd';
      const loop = ds.loop === 'true';
      const loopDelay = Number(ds.loopDelay) || 0;
      const maxDelay = Number(ds.maxDelay) || 0;
      const dir = ds.shuffleDirection === 'left' ? 'left' : 'right';
      const charset = ds.scramble || '';
      const colorFrom = ds.colorFrom || null;
      const colorTo = ds.colorTo || null;
      let split = null, wrappers = [], tl = null, playing = false, hoverFn = null;

      const teardown = () => {
        if (tl) { tl.kill(); tl = null; }
        wrappers.forEach((wrap) => {
          const inner = wrap.firstElementChild;
          const orig = inner && inner.querySelector('[data-orig="1"]');
          if (orig && wrap.parentNode) wrap.parentNode.replaceChild(orig, wrap);
        });
        wrappers = [];
        try { if (split) split.revert(); } catch (e) { /* noop */ }
        split = null;
        playing = false;
      };
      const build = () => {
        teardown();
        split = SplitText.create(el, { type: 'chars', charsClass: 'shuffle-char', smartWrap: true, reduceWhiteSpace: false });
        const rand = (set) => set.charAt(Math.floor(Math.random() * set.length)) || '';
        split.chars.forEach((ch) => {
          const parent = ch.parentElement;
          if (!parent) return;
          const w = ch.getBoundingClientRect().width;
          if (!w) return;
          const wrap = document.createElement('span');
          Object.assign(wrap.style, { display: 'inline-block', overflow: 'hidden', width: w + 'px', verticalAlign: 'bottom' });
          const inner = document.createElement('span');
          Object.assign(inner.style, { display: 'inline-block', whiteSpace: 'nowrap', willChange: 'transform' });
          parent.insertBefore(wrap, ch);
          wrap.appendChild(inner);
          const cell = { display: 'inline-block', width: w + 'px', textAlign: 'center' };
          Object.assign(ch.style, cell);
          ch.setAttribute('data-orig', '1');
          const firstOrig = ch.cloneNode(true);
          Object.assign(firstOrig.style, cell);
          inner.appendChild(firstOrig);
          for (let k = 0; k < rolls; k++) {
            const c = ch.cloneNode(true);
            if (charset) c.textContent = rand(charset);
            Object.assign(c.style, cell);
            inner.appendChild(c);
          }
          inner.appendChild(ch);
          const steps = rolls + 1;
          if (dir === 'right') {
            const firstCopy = inner.firstElementChild;
            const real = inner.lastElementChild;
            if (real) inner.insertBefore(real, inner.firstChild);
            if (firstCopy) inner.appendChild(firstCopy);
          }
          const startX = dir === 'right' ? -steps * w : 0;
          const finalX = dir === 'right' ? 0 : -steps * w;
          gsap.set(inner, { x: startX, force3D: true });
          inner.setAttribute('data-start-x', String(startX));
          inner.setAttribute('data-final-x', String(finalX));
          if (colorFrom) inner.style.color = colorFrom;
          wrappers.push(wrap);
        });
      };
      const inners = () => wrappers.map((w) => w.firstElementChild);
      const randomize = () => {
        if (!charset) return;
        wrappers.forEach((w) => {
          const strip = w.firstElementChild;
          if (!strip) return;
          const kids = Array.from(strip.children);
          for (let i = 1; i < kids.length - 1; i++) kids[i].textContent = charset.charAt(Math.floor(Math.random() * charset.length));
        });
      };
      const cleanupToStill = () => {
        wrappers.forEach((w) => {
          const strip = w.firstElementChild;
          if (!strip) return;
          const real = strip.querySelector('[data-orig="1"]');
          if (!real) return;
          strip.replaceChildren(real);
          strip.style.transform = 'none';
          strip.style.willChange = 'auto';
        });
      };
      const armHover = () => {
        if (ds.triggerOnHover === 'false') return;
        const handler = () => {
          if (playing) return;
          build();
          randomize();
          play();
        };
        hoverFn = handler;
        el.addEventListener('mouseenter', handler);
      };
      const play = () => {
        const strips = inners();
        if (!strips.length) return;
        playing = true;
        tl = gsap.timeline({
          smoothChildTiming: true,
          repeat: loop ? -1 : 0,
          repeatDelay: loop ? loopDelay : 0,
          onRepeat: () => {
            if (charset) randomize();
            gsap.set(strips, { x: (i, t) => parseFloat(t.getAttribute('data-start-x') || '0') });
          },
          onComplete: () => {
            playing = false;
            if (!loop) {
              cleanupToStill();
              if (colorTo) gsap.set(strips, { color: colorTo });
              armHover();
            }
          }
        });
        const vars = {
          duration,
          ease,
          force3D: true,
          x: (i, t) => parseFloat(t.getAttribute('data-final-x') || '0')
        };
        if (mode === 'evenodd') {
          vars.stagger = stagger;
          const odd = strips.filter((_, i) => i % 2 === 1);
          const even = strips.filter((_, i) => i % 2 === 0);
          const oddTotal = duration + Math.max(0, odd.length - 1) * stagger;
          if (odd.length) tl.to(odd, vars, 0);
          if (even.length) tl.to(even, vars, odd.length ? oddTotal * 0.7 : 0);
        } else {
          strips.forEach((strip) => tl.to(strip, vars, Math.random() * maxDelay));
        }
        if (colorFrom && colorTo) tl.to(strips, { color: colorTo, duration, ease }, 0);
      };
      const create = () => {
        build();
        randomize();
        play();
        el.classList.add('is-ready');
      };
      ScrollTrigger.create({ trigger: el, start: 'top 90%-=100px', once: true, onEnter: create });
    });
  })();

  /* Beams — 官方 r3f 版以 vanilla three.js 等价移植：physical ShaderLib 注入 + 合并光束平面，GLSL 原样 */
  (() => {
    const boxes = document.querySelectorAll('[data-beams]');
    if (!boxes.length || typeof window.THREE === 'undefined') return;
    const T = window.THREE;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isLight = () => document.documentElement.getAttribute('data-theme') === 'light';
    const NOISE_GLSL = [
      'float random (in vec2 st) {',
      '    return fract(sin(dot(st.xy, vec2(12.9898,78.233)))* 43758.5453123);',
      '}',
      'float noise (in vec2 st) {',
      '    vec2 i = floor(st);',
      '    vec2 f = fract(st);',
      '    float a = random(i);',
      '    float b = random(i + vec2(1.0, 0.0));',
      '    float c = random(i + vec2(0.0, 1.0));',
      '    float d = random(i + vec2(1.0, 1.0));',
      '    vec2 u = f * f * (3.0 - 2.0 * f);',
      '    return mix(a, b, u.x) + (c - a)* u.y * (1.0 - u.x) + (d - b) * u.x * u.y;',
      '}',
      'vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}',
      'vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}',
      'vec3 fade(vec3 t) {return t*t*t*(t*(t*6.0-15.0)+10.0);}',
      'float cnoise(vec3 P){',
      '  vec3 Pi0 = floor(P);',
      '  vec3 Pi1 = Pi0 + vec3(1.0);',
      '  Pi0 = mod(Pi0, 289.0);',
      '  Pi1 = mod(Pi1, 289.0);',
      '  vec3 Pf0 = fract(P);',
      '  vec3 Pf1 = Pf0 - vec3(1.0);',
      '  vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);',
      '  vec4 iy = vec4(Pi0.yy, Pi1.yy);',
      '  vec4 iz0 = Pi0.zzzz;',
      '  vec4 iz1 = Pi1.zzzz;',
      '  vec4 ixy = permute(permute(ix) + iy);',
      '  vec4 ixy0 = permute(ixy + iz0);',
      '  vec4 ixy1 = permute(ixy + iz1);',
      '  vec4 gx0 = ixy0 / 7.0;',
      '  vec4 gy0 = fract(floor(gx0) / 7.0) - 0.5;',
      '  gx0 = fract(gx0);',
      '  vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0);',
      '  vec4 sz0 = step(gz0, vec4(0.0));',
      '  gx0 -= sz0 * (step(0.0, gx0) - 0.5);',
      '  gy0 -= sz0 * (step(0.0, gy0) - 0.5);',
      '  vec4 gx1 = ixy1 / 7.0;',
      '  vec4 gy1 = fract(floor(gx1) / 7.0) - 0.5;',
      '  gx1 = fract(gx1);',
      '  vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1);',
      '  vec4 sz1 = step(gz1, vec4(0.0));',
      '  gx1 -= sz1 * (step(0.0, gx1) - 0.5);',
      '  gy1 -= sz1 * (step(0.0, gy1) - 0.5);',
      '  vec3 g000 = vec3(gx0.x,gy0.x,gz0.x);',
      '  vec3 g100 = vec3(gx0.y,gy0.y,gz0.y);',
      '  vec3 g010 = vec3(gx0.z,gy0.z,gz0.z);',
      '  vec3 g110 = vec3(gx0.w,gy0.w,gz0.w);',
      '  vec3 g001 = vec3(gx1.x,gy1.x,gz1.x);',
      '  vec3 g101 = vec3(gx1.y,gy1.y,gz1.y);',
      '  vec3 g011 = vec3(gx1.z,gy1.z,gz1.z);',
      '  vec3 g111 = vec3(gx1.w,gy1.w,gz1.w);',
      '  vec4 norm0 = taylorInvSqrt(vec4(dot(g000,g000),dot(g010,g010),dot(g100,g100),dot(g110,g110)));',
      '  g000 *= norm0.x; g010 *= norm0.y; g100 *= norm0.z; g110 *= norm0.w;',
      '  vec4 norm1 = taylorInvSqrt(vec4(dot(g001,g001),dot(g011,g011),dot(g101,g101),dot(g111,g111)));',
      '  g001 *= norm1.x; g011 *= norm1.y; g101 *= norm1.z; g111 *= norm1.w;',
      '  float n000 = dot(g000, Pf0);',
      '  float n100 = dot(g100, vec3(Pf1.x,Pf0.yz));',
      '  float n010 = dot(g010, vec3(Pf0.x,Pf1.y,Pf0.z));',
      '  float n110 = dot(g110, vec3(Pf1.xy,Pf0.z));',
      '  float n001 = dot(g001, vec3(Pf0.xy,Pf1.z));',
      '  float n101 = dot(g101, vec3(Pf1.x,Pf0.y,Pf1.z));',
      '  float n011 = dot(g011, vec3(Pf0.x,Pf1.yz));',
      '  float n111 = dot(g111, Pf1);',
      '  vec3 fade_xyz = fade(Pf0);',
      '  vec4 n_z = mix(vec4(n000,n100,n010,n110),vec4(n001,n101,n011,n111),fade_xyz.z);',
      '  vec2 n_yz = mix(n_z.xy,n_z.zw,fade_xyz.y);',
      '  float n_xyz = mix(n_yz.x,n_yz.y,fade_xyz.x);',
      '  return 2.2 * n_xyz;',
      '}'
    ].join('\n');
    const hexN = (hex) => [
      parseInt(hex.slice(1, 3), 16) / 255,
      parseInt(hex.slice(3, 5), 16) / 255,
      parseInt(hex.slice(5, 7), 16) / 255
    ];
    const createStackedPlanesBufferGeometry = (n, width, height, spacing, heightSegments) => {
      const geometry = new T.BufferGeometry();
      const numVertices = n * (heightSegments + 1) * 2;
      const numFaces = n * heightSegments * 2;
      const positions = new Float32Array(numVertices * 3);
      const indices = new Uint32Array(numFaces * 3);
      const uvs = new Float32Array(numVertices * 2);
      let vertexOffset = 0;
      let indexOffset = 0;
      let uvOffset = 0;
      const totalWidth = n * width + (n - 1) * spacing;
      const xOffsetBase = -totalWidth / 2;
      for (let i = 0; i < n; i++) {
        const xOffset = xOffsetBase + i * (width + spacing);
        const uvXOffset = Math.random() * 300;
        const uvYOffset = Math.random() * 300;
        for (let j = 0; j <= heightSegments; j++) {
          const y = height * (j / heightSegments - 0.5);
          const v0 = [xOffset, y, 0];
          const v1 = [xOffset + width, y, 0];
          positions.set([...v0, ...v1], vertexOffset * 3);
          const uvY = j / heightSegments;
          uvs.set([uvXOffset, uvY + uvYOffset, uvXOffset + 1, uvY + uvYOffset], uvOffset);
          if (j < heightSegments) {
            const a = vertexOffset, b = vertexOffset + 1, c = vertexOffset + 2, d = vertexOffset + 3;
            indices.set([a, b, c, c, b, d], indexOffset);
            indexOffset += 6;
          }
          vertexOffset += 2;
          uvOffset += 4;
        }
      }
      geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
      geometry.setAttribute('uv', new T.BufferAttribute(uvs, 2));
      geometry.setIndex(new T.BufferAttribute(indices, 1));
      geometry.computeVertexNormals();
      return geometry;
    };
    boxes.forEach((box) => {
      const canvas = box.querySelector('canvas');
      const beamWidth = Number(box.dataset.beamWidth) || 2;
      const beamHeight = Number(box.dataset.beamHeight) || 15;
      const beamNumber = Number(box.dataset.beamNumber) || 12;
      const speed = Number(box.dataset.speed) || 2;
      const noiseIntensity = box.dataset.noiseIntensity != null ? Number(box.dataset.noiseIntensity) : 1.75;
      const scale = box.dataset.scale != null ? Number(box.dataset.scale) : 0.2;
      const rotation = Number(box.dataset.rotation) || 0;
      const lightColor = box.dataset.lightColor || '#ffffff';
      const beamColor = box.dataset.beamColor || '#000000';
      const bgDark = box.dataset.bg || '#000000';
      const bgLight = box.dataset.bgLight || '#ffffff';

      const physical = T.ShaderLib.physical;
      const uniforms = T.UniformsUtils.clone(physical.uniforms);
      const diffuse = new T.Color(...hexN(beamColor));
      uniforms.diffuse.value = diffuse;
      uniforms.roughness.value = 0.3;
      uniforms.metalness.value = 0.3;
      uniforms.envMapIntensity.value = 10;
      uniforms.time = { value: 0 };
      uniforms.uSpeed = { value: speed };
      uniforms.uNoiseIntensity = { value: noiseIntensity };
      uniforms.uScale = { value: scale };
      uniforms.uLightMode = { value: isLight() ? 1 : 0 };
      const header = [
        'uniform float time;',
        'uniform float uSpeed;',
        'uniform float uNoiseIntensity;',
        'uniform float uScale;',
        NOISE_GLSL
      ].join('\n');
      const vertexHeader = [
        'float getPos(vec3 pos) {',
        '  vec3 noisePos = vec3(pos.x * 0., pos.y - uv.y, pos.z + time * uSpeed * 3.) * uScale;',
        '  return cnoise(noisePos);',
        '}',
        'vec3 getCurrentPos(vec3 pos) {',
        '  vec3 newpos = pos;',
        '  newpos.z += getPos(pos);',
        '  return newpos;',
        '}',
        'vec3 getNormal(vec3 pos) {',
        '  vec3 curpos = getCurrentPos(pos);',
        '  vec3 nextposX = getCurrentPos(pos + vec3(0.01, 0.0, 0.0));',
        '  vec3 nextposZ = getCurrentPos(pos + vec3(0.0, -0.01, 0.0));',
        '  vec3 tangentX = normalize(nextposX - curpos);',
        '  vec3 tangentZ = normalize(nextposZ - curpos);',
        '  return normalize(cross(tangentZ, tangentX));',
        '}'
      ].join('\n');
      let vert = `${header}\n${vertexHeader}\n${physical.vertexShader}`;
      let frag = `${header}\nuniform float uLightMode;\n${physical.fragmentShader}`;
      vert = vert.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.z += getPos(transformed.xyz);');
      vert = vert.replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = getNormal(position.xyz);');
      frag = frag.replace('#include <dithering_fragment>', [
        '#include <dithering_fragment>',
        'float randomNoise = noise(gl_FragCoord.xy);',
        'gl_FragColor.rgb -= randomNoise / 15. * uNoiseIntensity;',
        'if (uLightMode > 0.5) {',
        '  float energy = max(max(gl_FragColor.r, gl_FragColor.g), gl_FragColor.b);',
        '  vec3 chroma = clamp(gl_FragColor.rgb / max(energy, 0.0001), 0.0, 1.0);',
        '  chroma = pow(chroma, vec3(1.2));',
        '  gl_FragColor.rgb = mix(vec3(1.0), chroma, clamp(energy * 0.98, 0.0, 0.94));',
        '}'
      ].join('\n'));
      const material = new T.ShaderMaterial({
        defines: physical.defines || {},
        uniforms,
        vertexShader: vert,
        fragmentShader: frag,
        lights: true
      });

      const renderer = new T.WebGLRenderer({ canvas, antialias: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
      const scene = new T.Scene();
      const camera = new T.PerspectiveCamera(30, 1, 0.1, 1000);
      camera.position.set(0, 0, 20);
      const group = new T.Group();
      group.rotation.z = (rotation * Math.PI) / 180;
      const mesh = new T.Mesh(createStackedPlanesBufferGeometry(beamNumber, beamWidth, beamHeight, 0, 100), material);
      group.add(mesh);
      const dir = new T.DirectionalLight(new T.Color(lightColor), 1);
      dir.position.set(0, 3, 10);
      group.add(dir);
      scene.add(group);
      scene.add(new T.AmbientLight(0xffffff, 1));
      const applyBg = () => { scene.background = new T.Color(isLight() ? bgLight : bgDark); };
      applyBg();
      const setSize = () => {
        const r = box.getBoundingClientRect();
        renderer.setSize(r.width, r.height, false);
        camera.aspect = r.width / r.height;
        camera.updateProjectionMatrix();
      };
      setSize();
      if ('ResizeObserver' in window) new ResizeObserver(setSize).observe(box);
      const clock = new T.Clock();
      let raf = 0, inView = false;
      const loop = () => {
        uniforms.time.value += 0.1 * clock.getDelta();
        renderer.render(scene, camera);
        raf = requestAnimationFrame(loop);
      };
      const sync = () => {
        const want = inView && !document.hidden;
        if (want && !raf) { clock.getDelta(); raf = requestAnimationFrame(loop); }
        else if (!want && raf) { cancelAnimationFrame(raf); raf = 0; }
      };
      document.addEventListener('visibilitychange', () => { uniforms.uLightMode.value = isLight() ? 1 : 0; applyBg(); sync(); });
      if (reduced) {
        uniforms.time.value = 2;
        renderer.render(scene, camera);
        box.__beams = () => ({ running: false });
        return;
      }
      new IntersectionObserver((en) => { inView = en[0].isIntersecting; sync(); }, { rootMargin: '120px' }).observe(box);
      box.__beams = () => ({ running: !!raf, t: uniforms.time.value });
    });
  })();

  /* RippleGrid — 官方 ogl 版以 three.js 等价移植，GLSL 原样（涟漪网格 + 鼠标影响） */
  (() => {
    const boxes = document.querySelectorAll('[data-ripplegrid]');
    if (!boxes.length || typeof window.THREE === 'undefined') return;
    const T = window.THREE;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isLight = () => document.documentElement.getAttribute('data-theme') === 'light';
    const VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
    const FRAG = [
      'precision highp float;',
      'uniform float iTime;',
      'uniform vec2 iResolution;',
      'uniform bool enableRainbow;',
      'uniform vec3 gridColor;',
      'uniform float rippleIntensity;',
      'uniform float gridSize;',
      'uniform float gridThickness;',
      'uniform float fadeDistance;',
      'uniform float vignetteStrength;',
      'uniform float glowIntensity;',
      'uniform float opacity;',
      'uniform float gridRotation;',
      'uniform bool mouseInteraction;',
      'uniform vec2 mousePosition;',
      'uniform float mouseInfluence;',
      'uniform float mouseInteractionRadius;',
      'uniform bool lightMode;',
      'varying vec2 vUv;',
      'float pi = 3.141592;',
      'mat2 rotate(float angle) {',
      '    float s = sin(angle);',
      '    float c = cos(angle);',
      '    return mat2(c, -s, s, c);',
      '}',
      'void main() {',
      '    vec2 uv = vUv * 2.0 - 1.0;',
      '    uv.x *= iResolution.x / iResolution.y;',
      '    if (gridRotation != 0.0) {',
      '        uv = rotate(gridRotation * pi / 180.0) * uv;',
      '    }',
      '    float dist = length(uv);',
      '    float func = sin(pi * (iTime - dist));',
      '    vec2 rippleUv = uv + uv * func * rippleIntensity;',
      '    if (mouseInteraction && mouseInfluence > 0.0) {',
      '        vec2 mouseUv = (mousePosition * 2.0 - 1.0);',
      '        mouseUv.x *= iResolution.x / iResolution.y;',
      '        float mouseDist = length(uv - mouseUv);',
      '        float influence = mouseInfluence * exp(-mouseDist * mouseDist / (mouseInteractionRadius * mouseInteractionRadius));',
      '        float mouseWave = sin(pi * (iTime * 2.0 - mouseDist * 3.0)) * influence;',
      '        rippleUv += normalize(uv - mouseUv) * mouseWave * rippleIntensity * 0.3;',
      '    }',
      '    vec2 a = sin(gridSize * 0.5 * pi * rippleUv - pi / 2.0);',
      '    vec2 b = abs(a);',
      '    float aaWidth = 0.5;',
      '    vec2 smoothB = vec2(',
      '        smoothstep(0.0, aaWidth, b.x),',
      '        smoothstep(0.0, aaWidth, b.y)',
      '    );',
      '    vec3 color = vec3(0.0);',
      '    color += exp(-gridThickness * smoothB.x * (0.8 + 0.5 * sin(pi * iTime)));',
      '    color += exp(-gridThickness * smoothB.y);',
      '    color += 0.5 * exp(-(gridThickness / 4.0) * sin(smoothB.x));',
      '    color += 0.5 * exp(-(gridThickness / 3.0) * smoothB.y);',
      '    if (glowIntensity > 0.0) {',
      '        color += glowIntensity * exp(-gridThickness * 0.5 * smoothB.x);',
      '        color += glowIntensity * exp(-gridThickness * 0.5 * smoothB.y);',
      '    }',
      '    float ddd = exp(-2.0 * clamp(pow(dist, fadeDistance), 0.0, 1.0));',
      '    vec2 vignetteCoords = vUv - 0.5;',
      '    float vignetteDistance = length(vignetteCoords);',
      '    float vignette = 1.0 - pow(vignetteDistance * 2.0, vignetteStrength);',
      '    vignette = clamp(vignette, 0.0, 1.0);',
      '    vec3 t;',
      '    if (enableRainbow) {',
      '        t = vec3(',
      '            uv.x * 0.5 + 0.5 * sin(iTime),',
      '            uv.y * 0.5 + 0.5 * cos(iTime),',
      '            pow(cos(iTime), 4.0)',
      '        ) + 0.5;',
      '    } else {',
      '        t = gridColor;',
      '    }',
      '    float finalFade = ddd * vignette;',
      '    float alpha = length(color) * finalFade * opacity;',
      '    vec3 effect = color * t * finalFade * opacity;',
      '    if (lightMode) {',
      '        float peak = max(effect.r, max(effect.g, effect.b));',
      '        vec3 chroma = pow(clamp(effect / max(peak, 0.0001), 0.0, 1.0), vec3(1.2));',
      '        gl_FragColor = vec4(mix(vec3(1.0), chroma, clamp(alpha * 0.94, 0.0, 0.94)), 1.0);',
      '    } else {',
      '        gl_FragColor = vec4(effect, alpha);',
      '    }',
      '}'
    ].join('\n');
    const hexV3 = (hex) => new T.Vector3(
      parseInt(hex.slice(1, 3), 16) / 255,
      parseInt(hex.slice(3, 5), 16) / 255,
      parseInt(hex.slice(5, 7), 16) / 255
    );
    boxes.forEach((box) => {
      const canvas = box.querySelector('canvas');
      const renderer = new T.WebGLRenderer({ canvas, alpha: true, premultipliedAlpha: false });
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
      renderer.setClearColor(0x000000, 0);
      const scene = new T.Scene();
      const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const uniforms = {
        iTime: { value: 0 },
        iResolution: { value: new T.Vector2(1, 1) },
        enableRainbow: { value: box.dataset.rainbow === 'true' },
        gridColor: { value: hexV3(box.dataset.gridColor || '#ffffff') },
        rippleIntensity: { value: Number(box.dataset.rippleIntensity) || 0.05 },
        gridSize: { value: Number(box.dataset.gridSize) || 10.0 },
        gridThickness: { value: box.dataset.gridThickness != null ? Number(box.dataset.gridThickness) : 15.0 },
        fadeDistance: { value: box.dataset.fadeDistance != null ? Number(box.dataset.fadeDistance) : 1.5 },
        vignetteStrength: { value: box.dataset.vignetteStrength != null ? Number(box.dataset.vignetteStrength) : 2.0 },
        glowIntensity: { value: box.dataset.glowIntensity != null ? Number(box.dataset.glowIntensity) : 0.1 },
        opacity: { value: box.dataset.opacity != null ? Number(box.dataset.opacity) : 1.0 },
        gridRotation: { value: Number(box.dataset.gridRotation) || 0 },
        mouseInteraction: { value: true },
        mousePosition: { value: new T.Vector2(0.5, 0.5) },
        mouseInfluence: { value: 0 },
        mouseInteractionRadius: { value: box.dataset.mouseRadius != null ? Number(box.dataset.mouseRadius) : 1 },
        lightMode: { value: isLight() }
      };
      const mat = new T.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true });
      scene.add(new T.Mesh(new T.PlaneGeometry(2, 2), mat));
      const setSize = () => {
        const r = box.getBoundingClientRect();
        renderer.setSize(r.width, r.height, false);
        uniforms.iResolution.value.set(renderer.domElement.width, renderer.domElement.height);
      };
      setSize();
      const cur = { x: 0.5, y: 0.5 }, tgt = { x: 0.5, y: 0.5 };
      let influenceTarget = 0;
      canvas.addEventListener('pointermove', (e) => {
        const rect = canvas.getBoundingClientRect();
        tgt.x = (e.clientX - rect.left) / rect.width;
        tgt.y = 1 - (e.clientY - rect.top) / rect.height;
      }, { passive: true });
      canvas.addEventListener('pointerenter', () => { influenceTarget = 1; });
      canvas.addEventListener('pointerleave', () => { influenceTarget = 0; }, { passive: true });
      let raf = 0, inView = false;
      const loop = (t) => {
        uniforms.iTime.value = t * 0.001;
        cur.x += (tgt.x - cur.x) * 0.1;
        cur.y += (tgt.y - cur.y) * 0.1;
        uniforms.mouseInfluence.value += (influenceTarget - uniforms.mouseInfluence.value) * 0.05;
        uniforms.mousePosition.value.set(cur.x, cur.y);
        renderer.render(scene, camera);
        raf = requestAnimationFrame(loop);
      };
      const sync = () => {
        const want = inView && !document.hidden;
        if (want && !raf) raf = requestAnimationFrame(loop);
        else if (!want && raf) { cancelAnimationFrame(raf); raf = 0; }
      };
      if ('ResizeObserver' in window) new ResizeObserver(setSize).observe(box);
      document.addEventListener('visibilitychange', () => { uniforms.lightMode.value = isLight(); sync(); });
      if (reduced) {
        uniforms.iTime.value = 3;
        renderer.render(scene, camera);
        box.__ripplegrid = () => ({ running: false });
        return;
      }
      new IntersectionObserver((en) => { inView = en[0].isIntersecting; sync(); }, { rootMargin: '120px' }).observe(box);
      box.__ripplegrid = () => ({ running: !!raf, t: uniforms.iTime.value });
    });
  })();

  /* ── v100 · React Bits 第八批:Aurora / Plasma / ScrollVelocity / FuzzyText / TextCursor / VariableProximity ── */

  /* Aurora — 官方 ogl GLSL3 着色器经 three.js GLSL3 ShaderMaterial 原样移植(struct 数组动态索引需 ESSL3) */
  (() => {
    const boxes = document.querySelectorAll('[data-aurora]');
    if (!boxes.length || typeof window.THREE === 'undefined') return;
    const T = window.THREE;
    const VERT = 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }';
    const FRAG = [
      'precision highp float;',
      'uniform float uTime;',
      'uniform float uAmplitude;',
      'uniform vec3 uColorStops[3];',
      'uniform vec2 uResolution;',
      'uniform float uBlend;',
      'uniform float uLightMode;',
      'out vec4 fragColor;',
      'vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }',
      'float snoise(vec2 v){',
      '  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);',
      '  vec2 i  = floor(v + dot(v, C.yy));',
      '  vec2 x0 = v - i + dot(i, C.xx);',
      '  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);',
      '  vec4 x12 = x0.xyxy + C.xxzz;',
      '  x12.xy -= i1;',
      '  i = mod(i, 289.0);',
      '  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));',
      '  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);',
      '  m = m * m; m = m * m;',
      '  vec3 x = 2.0 * fract(p * C.www) - 1.0;',
      '  vec3 h = abs(x) - 0.5;',
      '  vec3 ox = floor(x + 0.5);',
      '  vec3 a0 = x - ox;',
      '  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);',
      '  vec3 g;',
      '  g.x  = a0.x  * x0.x  + h.x  * x0.y;',
      '  g.yz = a0.yz * x12.xz + h.yz * x12.yw;',
      '  return 130.0 * dot(m, g);',
      '}',
      'struct ColorStop { vec3 color; float position; };',
      '#define COLOR_RAMP(colors, factor, finalColor) { int index = 0; for (int i = 0; i < 2; i++) { ColorStop currentColor = colors[i]; bool isInBetween = currentColor.position <= factor; index = int(mix(float(index), float(i), float(isInBetween))); } ColorStop currentColor = colors[index]; ColorStop nextColor = colors[index + 1]; float range = nextColor.position - currentColor.position; float lerpFactor = (factor - currentColor.position) / range; finalColor = mix(currentColor.color, nextColor.color, lerpFactor); }',
      'void main() {',
      '  vec2 uv = gl_FragCoord.xy / uResolution;',
      '  ColorStop colors[3];',
      '  colors[0] = ColorStop(uColorStops[0], 0.0);',
      '  colors[1] = ColorStop(uColorStops[1], 0.5);',
      '  colors[2] = ColorStop(uColorStops[2], 1.0);',
      '  vec3 rampColor;',
      '  COLOR_RAMP(colors, uv.x, rampColor);',
      '  float height = snoise(vec2(uv.x * 2.0 + uTime * 0.1, uTime * 0.25)) * 0.5 * uAmplitude;',
      '  height = exp(height);',
      '  height = (uv.y * 2.0 - height + 0.2);',
      '  float intensity = 0.6 * height;',
      '  float midPoint = 0.20;',
      '  float auroraAlpha = smoothstep(midPoint - uBlend * 0.5, midPoint + uBlend * 0.5, intensity);',
      '  vec3 auroraColor = intensity * rampColor;',
      '  if (uLightMode > 0.5) {',
      '    float energy = clamp(max(intensity, 0.0), 0.0, 1.0);',
      '    float coverage = clamp(auroraAlpha * (0.55 + 0.45 * energy), 0.0, 0.86);',
      '    vec3 chroma = pow(clamp(rampColor, 0.0, 1.0), vec3(1.2));',
      '    float chromaPeak = max(chroma.r, max(chroma.g, chroma.b));',
      '    chroma /= max(chromaPeak, 0.0001);',
      '    fragColor = vec4(mix(vec3(1.0), chroma, min(coverage * 1.08, 0.94)), 1.0);',
      '  } else {',
      '    fragColor = vec4(auroraColor * auroraAlpha, auroraAlpha);',
      '  }',
      '}'
    ].join('\n');
    const hexV3 = (hex) => new T.Vector3(
      parseInt(hex.slice(1, 3), 16) / 255,
      parseInt(hex.slice(3, 5), 16) / 255,
      parseInt(hex.slice(5, 7), 16) / 255
    );
    boxes.forEach((box) => {
      const canvas = box.querySelector('canvas');
      const stops = (box.dataset.colorStops || '#8B5CF6,#E879F9,#C4B5FD').split(',');
      const speed = Number(box.dataset.speed) || 1.0;
      const renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
      renderer.setClearColor(0x000000, 0);
      const scene = new T.Scene();
      const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const uniforms = {
        uTime: { value: 0 },
        uAmplitude: { value: Number(box.dataset.amplitude) || 1.0 },
        uColorStops: { value: stops.slice(0, 3).map(hexV3) },
        uResolution: { value: new T.Vector2(1, 1) },
        uBlend: { value: box.dataset.blend != null ? Number(box.dataset.blend) : 0.5 },
        uLightMode: { value: document.documentElement.getAttribute('data-theme') === 'light' ? 1 : 0 }
      };
      const mat = new T.ShaderMaterial({
        uniforms, vertexShader: VERT, fragmentShader: FRAG,
        transparent: true, premultipliedAlpha: true, glslVersion: T.GLSL3
      });
      scene.add(new T.Mesh(new T.PlaneGeometry(2, 2), mat));
      const setSize = () => {
        const r = box.getBoundingClientRect();
        renderer.setSize(r.width, r.height, false);
        uniforms.uResolution.value.set(r.width, r.height);
      };
      setSize();
      let raf = 0, inView = false;
      const loop = (now) => {
        uniforms.uTime.value = now * 0.001 * speed;
        renderer.render(scene, camera);
        raf = requestAnimationFrame(loop);
      };
      const sync = () => {
        const want = inView && !document.hidden;
        if (want && !raf) raf = requestAnimationFrame(loop);
        else if (!want && raf) { cancelAnimationFrame(raf); raf = 0; }
      };
      if ('ResizeObserver' in window) new ResizeObserver(setSize).observe(box);
      else addEventListener('resize', setSize, { passive: true });
      document.addEventListener('visibilitychange', () => { uniforms.uLightMode.value = document.documentElement.getAttribute('data-theme') === 'light' ? 1 : 0; sync(); });
      if (reduced) {
        uniforms.uTime.value = 6;
        renderer.render(scene, camera);
        box.__aurora = () => ({ running: false });
        return;
      }
      new IntersectionObserver((en) => { inView = en[0].isIntersecting; sync(); }, { rootMargin: '120px' }).observe(box);
      box.__aurora = () => ({ running: !!raf, t: uniforms.uTime.value });
    });
  })();

  /* Plasma — 官方 Shadertoy 风格 GLSL3 逐步原样(renderScale 降采样渲染 + CSS 拉伸) */
  (() => {
    const boxes = document.querySelectorAll('[data-plasma]');
    if (!boxes.length || typeof window.THREE === 'undefined') return;
    const T = window.THREE;
    const VERT = 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }';
    const FRAG = [
      'precision highp float;',
      'uniform vec2 iResolution;',
      'uniform float iTime;',
      'uniform vec3 uCustomColor;',
      'uniform float uUseCustomColor;',
      'uniform float uSpeed;',
      'uniform float uDirection;',
      'uniform float uScale;',
      'uniform float uOpacity;',
      'uniform vec2 uMouse;',
      'uniform float uMouseInteractive;',
      'uniform float uQuality;',
      'uniform float uStepScale;',
      'uniform float uLightMode;',
      'out vec4 fragColor;',
      'void mainImage(out vec4 o, vec2 C) {',
      '  vec2 center = iResolution.xy * 0.5;',
      '  C = (C - center) / uScale + center;',
      '  vec2 mouseOffset = (uMouse - center) * 0.0002;',
      '  C += mouseOffset * length(C - center) * step(0.5, uMouseInteractive);',
      '  float i, d, z, T = iTime * uSpeed * uDirection;',
      '  vec3 O, p, S;',
      '  for (vec2 r = iResolution.xy, Q; ++i < 60.0; O += o.w/d*o.xyz) {',
      '    p = z*normalize(vec3(C-.5*r,r.y));',
      '    p.z -= 4.;',
      '    S = p;',
      '    d = p.y-T;',
      '    p.x += .4*(1.+p.y)*sin(d + p.x*0.1)*cos(.34*d + p.x*0.05);',
      '    Q = p.xz *= mat2(cos(p.y+vec4(0,11,33,0)-T));',
      '    z += d = (abs(sqrt(length(Q*Q)) - .25*(5.+S.y))/3.+8e-4) * uStepScale;',
      '    o = 1.+sin(S.y+p.z*.5+S.z-length(S-p)+vec4(2,1,0,8));',
      '    if (i >= uQuality) break;',
      '  }',
      '  o.xyz = tanh(O/1e4);',
      '}',
      'bool finite1(float x){ return !(isnan(x) || isinf(x)); }',
      'vec3 sanitize(vec3 c){ return vec3(finite1(c.r) ? c.r : 0.0, finite1(c.g) ? c.g : 0.0, finite1(c.b) ? c.b : 0.0); }',
      'void main() {',
      '  vec4 o = vec4(0.0);',
      '  mainImage(o, gl_FragCoord.xy);',
      '  vec3 rgb = sanitize(o.rgb);',
      '  float intensity = (rgb.r + rgb.g + rgb.b) / 3.0;',
      '  vec3 customColor = intensity * uCustomColor;',
      '  vec3 finalColor = mix(rgb, customColor, step(0.5, uUseCustomColor));',
      '  float alpha = length(rgb) * uOpacity;',
      '  if (uLightMode > 0.5) {',
      '    vec3 source = clamp(finalColor, 0.0, 1.0);',
      '    float peak = max(source.r, max(source.g, source.b));',
      '    float floorColor = min(source.r, min(source.g, source.b));',
      '    vec3 chroma = (source - vec3(floorColor)) / max(peak - floorColor, 0.0001);',
      '    vec3 pigment = mix(source / max(peak, 0.0001), chroma, 0.68) * 0.72;',
      '    float energy = clamp(length(rgb) / 1.7320508, 0.0, 1.0);',
      '    float coverage = pow(smoothstep(0.035, 0.72, energy), 0.76) * min(uOpacity, 1.0) * 0.9;',
      '    fragColor = vec4(mix(vec3(1.0), pigment, coverage), 1.0);',
      '  } else {',
      '    fragColor = vec4(finalColor, alpha);',
      '  }',
      '}'
    ].join('\n');
    const hexRgb = (hex) => new T.Vector3(
      parseInt(hex.slice(1, 3), 16) / 255,
      parseInt(hex.slice(3, 5), 16) / 255,
      parseInt(hex.slice(5, 7), 16) / 255
    );
    boxes.forEach((box) => {
      const canvas = box.querySelector('canvas');
      const color = box.dataset.color || '#E879F9';
      const speed = Number(box.dataset.speed) || 1;
      const direction = box.dataset.direction || 'forward';
      const renderScale = Number(box.dataset.renderScale) || 0.55;
      const targetFps = Number(box.dataset.targetFps) || 60;
      const iterations = Number(box.dataset.iterations) || 60;
      const mouseInteractive = box.dataset.mouseInteractive !== 'false';
      const renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: false });
      renderer.setPixelRatio(1);
      renderer.setClearColor(0x000000, 0);
      const scene = new T.Scene();
      const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const uniforms = {
        iTime: { value: 0 },
        iResolution: { value: new T.Vector2(1, 1) },
        uCustomColor: { value: hexRgb(color) },
        uUseCustomColor: { value: 1.0 },
        uSpeed: { value: speed * 0.4 },
        uDirection: { value: direction === 'reverse' ? -1.0 : 1.0 },
        uScale: { value: Number(box.dataset.scale) || 1 },
        uOpacity: { value: box.dataset.opacity != null ? Number(box.dataset.opacity) : 1 },
        uMouse: { value: new T.Vector2(0, 0) },
        uMouseInteractive: { value: mouseInteractive ? 1.0 : 0.0 },
        uQuality: { value: iterations },
        uStepScale: { value: 60 / iterations },
        uLightMode: { value: document.documentElement.getAttribute('data-theme') === 'light' ? 1 : 0 }
      };
      const mat = new T.ShaderMaterial({
        uniforms, vertexShader: VERT, fragmentShader: FRAG,
        transparent: true, glslVersion: T.GLSL3
      });
      scene.add(new T.Mesh(new T.PlaneGeometry(2, 2), mat));
      let resizePending = false;
      const setSize = () => {
        const r = box.getBoundingClientRect();
        const w = Math.max(1, Math.floor(r.width * renderScale));
        const h = Math.max(1, Math.floor(r.height * renderScale));
        renderer.setSize(w, h, false);
        uniforms.iResolution.value.set(renderer.domElement.width, renderer.domElement.height);
      };
      const scheduleResize = () => {
        if (resizePending) return;
        resizePending = true;
        requestAnimationFrame(() => { resizePending = false; setSize(); });
      };
      if ('ResizeObserver' in window) new ResizeObserver(scheduleResize).observe(box);
      else addEventListener('resize', scheduleResize, { passive: true });
      setSize();
      let pendingMouse = null;
      if (mouseInteractive) {
        box.addEventListener('mousemove', (e) => {
          const r = box.getBoundingClientRect();
          pendingMouse = { x: e.clientX - r.left, y: e.clientY - r.top };
        }, { passive: true });
      }
      let raf = 0, inView = false, contextLost = false;
      const t0 = performance.now();
      const frameInterval = 1000 / targetFps;
      let lastFrameTime = 0;
      const loop = (t) => {
        raf = requestAnimationFrame(loop);
        if (t - lastFrameTime < frameInterval) return;
        lastFrameTime = t;
        if (pendingMouse) {
          uniforms.uMouse.value.set(pendingMouse.x, pendingMouse.y);
          pendingMouse = null;
        }
        let timeValue = (t - t0) * 0.001;
        if (direction === 'pingpong') {
          const pd = 10;
          const segmentTime = timeValue % pd;
          const isForward = Math.floor(timeValue / pd) % 2 === 0;
          const u = segmentTime / pd;
          const smooth = u * u * (3 - 2 * u);
          uniforms.uDirection.value = 1.0;
          uniforms.iTime.value = isForward ? smooth * pd : (1 - smooth) * pd;
        } else {
          uniforms.iTime.value = timeValue;
        }
        renderer.render(scene, camera);
      };
      const sync = () => {
        const want = inView && !document.hidden && !contextLost;
        if (want && !raf) { lastFrameTime = 0; raf = requestAnimationFrame(loop); }
        else if (!want && raf) { cancelAnimationFrame(raf); raf = 0; }
      };
      canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); contextLost = true; sync(); });
      canvas.addEventListener('webglcontextrestored', () => { contextLost = false; sync(); });
      document.addEventListener('visibilitychange', () => { uniforms.uLightMode.value = document.documentElement.getAttribute('data-theme') === 'light' ? 1 : 0; sync(); });
      if (reduced) {
        uniforms.iTime.value = 0;
        renderer.render(scene, camera);
        box.__plasma = () => ({ running: false });
        return;
      }
      new IntersectionObserver((en) => { inView = en[0].isIntersecting; sync(); }, { threshold: 0 }).observe(box);
      box.__plasma = () => ({ running: !!raf, t: uniforms.iTime.value });
    });
  })();

  /* ScrollVelocity — 官方 motion 弹簧滚动加速跑马灯,gsap + ScrollTrigger.getVelocity 等价移植 */
  (() => {
    const roots = document.querySelectorAll('[data-scrollvelocity]');
    if (!roots.length || typeof window.gsap === 'undefined') return;
    roots.forEach((root) => {
      const texts = (root.dataset.scrollvelocity || '').split('||').filter(Boolean);
      const velocity = Number(root.dataset.velocity) || 100;
      const numCopies = Number(root.dataset.copies) || 6;
      if (!texts.length) return;
      const rows = texts.map((text, idx) => {
        const row = document.createElement('div');
        row.className = 'sv-parallax';
        const scroller = document.createElement('div');
        scroller.className = 'sv-scroller' + (idx % 2 ? ' sv-scroller--alt' : '');
        for (let i = 0; i < numCopies; i++) {
          const span = document.createElement('span');
          span.textContent = text + '\u00a0';
          scroller.appendChild(span);
        }
        row.appendChild(scroller);
        root.appendChild(row);
        return { scroller, first: scroller.firstElementChild, base: idx % 2 !== 0 ? -velocity : velocity };
      });
      let baseX = rows.map(() => 0);
      let dirFactor = rows.map(() => 1);
      let smoothVel = 0;
      let raf = 0, inView = false, prev = 0, lastY = 0;
      const wrap = (min, max, v) => { const range = max - min; return (((v - min) % range) + range) % range + min; };
      const loop = (now) => {
        raf = requestAnimationFrame(loop);
        let dt = now - prev; prev = now;
        if (dt > 100) dt = 100;
        const y = window.scrollY;
        const raw = dt ? ((y - lastY) / dt) * 1000 : 0;
        lastY = y;
        smoothVel += (raw - smoothVel) * Math.min(1, dt * 0.012);
        const velocityFactor = smoothVel * (5 / 1000);
        rows.forEach((row, i) => {
          const copyW = row.first.offsetWidth;
          if (!copyW) return;
          let moveBy = dirFactor[i] * row.base * (dt / 1000);
          if (velocityFactor < 0) dirFactor[i] = -1;
          else if (velocityFactor > 0) dirFactor[i] = 1;
          moveBy += dirFactor[i] * moveBy * velocityFactor;
          baseX[i] += moveBy;
          row.scroller.style.transform = 'translateX(' + wrap(-copyW, 0, baseX[i]) + 'px)';
        });
      };
      const sync = () => {
        const want = inView && !document.hidden && !reduced;
        if (want && !raf) { prev = performance.now(); raf = requestAnimationFrame(loop); }
        else if (!want && raf) { cancelAnimationFrame(raf); raf = 0; }
      };
      if (reduced) { root.classList.add('sv-static'); }
      new IntersectionObserver((en) => { inView = en[0].isIntersecting; sync(); }, { rootMargin: '120px' }).observe(root);
      document.addEventListener('visibilitychange', sync);
      root.__scrollvelocity = () => ({ running: !!raf, x: baseX.map(v => Math.round(v)) });
    });
  })();

  /* FuzzyText — 官方 canvas 逐行随机位移移植(离屏字模 + 行切片抖动) */
  (() => {
    const canvases = document.querySelectorAll('[data-fuzzy]');
    if (!canvases.length) return;
    canvases.forEach((canvas) => {
      const text = canvas.dataset.fuzzy || canvas.textContent || 'FUZZY';
      const baseIntensity = canvas.dataset.baseIntensity != null ? Number(canvas.dataset.baseIntensity) : 0.18;
      const hoverIntensity = canvas.dataset.hoverIntensity != null ? Number(canvas.dataset.hoverIntensity) : 0.5;
      const fuzzRange = Number(canvas.dataset.fuzzRange) || 30;
      const fps = Number(canvas.dataset.fps) || 60;
      const enableHover = canvas.dataset.enableHover !== 'false';
      const color = canvas.dataset.color || '#F4EFFF';
      const gradient = canvas.dataset.gradient ? canvas.dataset.gradient.split(',') : null;
      const frameDuration = 1000 / fps;
      let currentIntensity = baseIntensity;
      let isHovering = false;
      let raf = 0, inView = false, ready = false;
      let run = null;

      const init = async () => {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const cs = getComputedStyle(canvas);
        const fontWeight = cs.fontWeight || '900';
        const fontSizeStr = cs.fontSize;
        const fontFamily = cs.fontFamily;
        try { await document.fonts.load(`${fontWeight} ${fontSizeStr} ${fontFamily}`); } catch (e) { await document.fonts.ready; }

        const offscreen = document.createElement('canvas');
        const offCtx = offscreen.getContext('2d');
        offCtx.font = `${fontWeight} ${fontSizeStr} ${fontFamily}`;
        offCtx.textBaseline = 'alphabetic';
        const totalWidth = offCtx.measureText(text).width;
        const metrics = offCtx.measureText(text);
        const actualLeft = metrics.actualBoundingBoxLeft ?? 0;
        const actualRight = metrics.actualBoundingBoxRight ?? metrics.width;
        const actualAscent = metrics.actualBoundingBoxAscent ?? parseFloat(fontSizeStr);
        const actualDescent = metrics.actualBoundingBoxDescent ?? parseFloat(fontSizeStr) * 0.2;
        const textBoundingWidth = Math.ceil(actualLeft + actualRight);
        const tightHeight = Math.ceil(actualAscent + actualDescent);
        const extraWidthBuffer = 10;
        const offscreenWidth = textBoundingWidth + extraWidthBuffer;
        offscreen.width = offscreenWidth;
        offscreen.height = tightHeight;
        const xOffset = extraWidthBuffer / 2;
        offCtx.font = `${fontWeight} ${fontSizeStr} ${fontFamily}`;
        offCtx.textBaseline = 'alphabetic';
        if (gradient && gradient.length >= 2) {
          const grad = offCtx.createLinearGradient(0, 0, offscreenWidth, 0);
          gradient.forEach((c, i) => grad.addColorStop(i / (gradient.length - 1), c.trim()));
          offCtx.fillStyle = grad;
        } else {
          offCtx.fillStyle = color;
        }
        offCtx.fillText(text, xOffset - actualLeft, actualAscent);
        canvas.__fuzzyOff = { c: offscreen, w: offscreenWidth, h: tightHeight };

        const horizontalMargin = fuzzRange + 20;
        canvas.width = offscreenWidth + horizontalMargin * 2;
        canvas.height = tightHeight;
        canvas.style.width = canvas.width + 'px';
        canvas.style.height = canvas.height + 'px';
        ctx.translate(horizontalMargin, 0);
        const interactiveLeft = horizontalMargin + xOffset;
        const interactiveRight = interactiveLeft + textBoundingWidth;

        run = (timestamp) => {
          raf = requestAnimationFrame(run);
          if (timestamp - lastFrame < frameDuration) return;
          lastFrame = timestamp;
          ctx.clearRect(-fuzzRange - 20, -fuzzRange - 10, offscreenWidth + 2 * (fuzzRange + 20), tightHeight + 2 * (fuzzRange + 10));
          const target = isHovering ? hoverIntensity : baseIntensity;
          currentIntensity = target;
          for (let j = 0; j < tightHeight; j++) {
            const dx = Math.floor(currentIntensity * (Math.random() - 0.5) * fuzzRange);
            ctx.drawImage(offscreen, 0, j, offscreenWidth, 1, dx, j, offscreenWidth, 1);
          }
        };
        let lastFrame = 0;
        if (enableHover) {
          canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left, y = e.clientY - rect.top;
            isHovering = x >= interactiveLeft && x <= interactiveRight && y >= 0 && y <= tightHeight;
          }, { passive: true });
          canvas.addEventListener('mouseleave', () => { isHovering = false; }, { passive: true });
        }
        ready = true;
        sync();
      };

      const sync = () => {
        const want = inView && !document.hidden && ready;
        if (want && !raf) raf = requestAnimationFrame(run);
        else if (!want && raf) { cancelAnimationFrame(raf); raf = 0; }
      };
      if (reduced) {
        canvas.__fuzzy = () => ({ running: false });
        init().then(() => {
          if (raf) { cancelAnimationFrame(raf); raf = 0; }
          const off = canvas.__fuzzyOff;
          if (off) {
            const ctx = canvas.getContext('2d');
            for (let j = 0; j < off.h; j++) ctx.drawImage(off.c, 0, j, off.w, 1, 0, j, off.w, 1);
          }
        });
        return;
      }
      init();
      new IntersectionObserver((en) => { inView = en[0].isIntersecting; sync(); }, { rootMargin: '120px' }).observe(canvas);
      document.addEventListener('visibilitychange', sync);
      canvas.__fuzzy = () => ({ running: !!raf, intensity: currentIntensity });
    });
  })();

  /* TextCursor — 官方指针轨迹字符尾迹移植(spacing 采样 + 停留后逐个消隐) */
  (() => {
    const boxes = document.querySelectorAll('[data-textcursor]');
    if (!boxes.length || typeof window.gsap === 'undefined') return;
    boxes.forEach((box) => {
      const glyph = box.dataset.textcursor || '\u2726';
      const spacing = Number(box.dataset.spacing) || 100;
      const maxPoints = Number(box.dataset.maxPoints) || 5;
      const removalInterval = Number(box.dataset.removalInterval) || 30;
      const exitDuration = Number(box.dataset.exitDuration) || 0.5;
      const inner = document.createElement('div');
      inner.className = 'tc-inner';
      box.appendChild(inner);
      const trail = [];
      let lastMoveTime = 0;
      let removalTimer = 0;
      const spawn = (x, y, angle) => {
        const item = document.createElement('span');
        item.className = 'tc-item';
        item.textContent = glyph;
        item.style.left = x + 'px';
        item.style.top = y + 'px';
        inner.appendChild(item);
        const rx = Math.random() * 10 - 5, ry = Math.random() * 10 - 5, rr = Math.random() * 10 - 5;
        gsap.set(item, { xPercent: -50, yPercent: -50 });
        gsap.fromTo(item, { opacity: 0, scale: 1, rotate: angle }, { opacity: 1, duration: exitDuration, ease: 'power2.out' });
        gsap.to(item, { x: [0, rx, 0], y: [0, ry, 0], rotate: [angle, angle + rr, angle], duration: 2, ease: 'sine.inOut', repeat: -1 });
        trail.push(item);
        if (trail.length > maxPoints) kill(trail.shift(), true);
        if (!removalTimer) removalTimer = setInterval(prune, removalInterval);
      };
      const kill = (item, immediate) => {
        if (!item) return;
        gsap.killTweensOf(item);
        if (immediate) { item.remove(); return; }
        gsap.to(item, {
          opacity: 0, scale: 0, duration: exitDuration, ease: 'power2.in',
          onComplete: () => item.remove()
        });
      };
      const prune = () => {
        if (Date.now() - lastMoveTime > 100 && trail.length) {
          kill(trail.shift(), false);
          if (!trail.length && removalTimer) { clearInterval(removalTimer); removalTimer = 0; }
        }
      };
      if (!reduced) {
        box.addEventListener('pointermove', (e) => {
          const rect = box.getBoundingClientRect();
          const mx = e.clientX - rect.left, my = e.clientY - rect.top;
          lastMoveTime = Date.now();
          if (!trail.length) { spawn(mx, my, 0); return; }
          const last = trail[trail.length - 1];
          const lx = parseFloat(last.style.left), ly = parseFloat(last.style.top);
          const dx = mx - lx, dy = my - ly;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist >= spacing) {
            const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
            const steps = Math.floor(dist / spacing);
            for (let i = 1; i <= steps; i++) {
              const t = (spacing * i) / dist;
              spawn(lx + dx * t, ly + dy * t, angle);
            }
          }
        }, { passive: true });
        box.addEventListener('pointerleave', () => { lastMoveTime = Date.now(); }, { passive: true });
      }
      box.__textcursor = () => ({ count: trail.length });
    });
  })();

  /* VariableProximity — 官方可变字体近距插值移植(Roboto Flex 已本地化;静止自停 rAF) */
  (() => {
    const roots = document.querySelectorAll('[data-varprox]');
    if (!roots.length) return;
    roots.forEach((root) => {
      const label = root.dataset.varprox || 'Lumen Viola';
      const fromStr = root.dataset.from || "'wght' 300, 'opsz' 9";
      const toStr = root.dataset.to || "'wght' 900, 'opsz' 40";
      const radius = Number(root.dataset.radius) || 150;
      const falloff = root.dataset.falloff || 'exponential';
      const parse = (s) => new Map(s.split(',').map(t => {
        const p = t.trim().split(' ');
        return [p[0].replace(/['"]/g, ''), parseFloat(p[1])];
      }));
      const from = parse(fromStr), to = parse(toStr);
      const axes = Array.from(from.entries()).map(([axis, fromValue]) => ({ axis, fromValue, toValue: to.has(axis) ? to.get(axis) : fromValue }));
      const words = label.split(' ');
      const letters = [];
      let letterIndex = 0;
      words.forEach((word, wi) => {
        const w = document.createElement('span');
        w.className = 'vp-word';
        for (const ch of word) {
          const s = document.createElement('span');
          s.className = 'vp-letter';
          s.setAttribute('aria-hidden', 'true');
          s.textContent = ch;
          s.dataset.i = letterIndex++;
          w.appendChild(s);
          letters.push(s);
        }
        root.appendChild(w);
        if (wi < words.length - 1) {
          const nbsp = document.createElement('span');
          nbsp.className = 'vp-word';
          nbsp.textContent = '\u00a0';
          root.appendChild(nbsp);
        }
      });
      const sr = document.createElement('span');
      sr.className = 'vp-sr';
      sr.textContent = label;
      root.appendChild(sr);
      letters.forEach(s => { s.style.fontVariationSettings = fromStr; });

      const mouse = { x: -1e4, y: -1e4 };
      let last = { x: null, y: null };
      let centers = null, dirty = true, raf = 0, idle = 0, inView = false;
      const measure = () => {
        const rect = root.getBoundingClientRect();
        centers = letters.map((s) => {
          const r = s.getBoundingClientRect();
          return { x: r.left + r.width / 2 - rect.left, y: r.top + r.height / 2 - rect.top };
        });
        dirty = false;
      };
      const calcFalloff = (distance) => {
        const norm = Math.min(Math.max(1 - distance / radius, 0), 1);
        if (falloff === 'exponential') return norm ** 2;
        if (falloff === 'gaussian') return Math.exp(-((distance / (radius / 2)) ** 2) / 2);
        return norm;
      };
      const loop = () => {
        raf = requestAnimationFrame(loop);
        if (last.x === mouse.x && last.y === mouse.y) {
          if (++idle > 2) { cancelAnimationFrame(raf); raf = 0; }
          return;
        }
        idle = 0;
        last = { x: mouse.x, y: mouse.y };
        if (dirty || !centers) measure();
        letters.forEach((s, i) => {
          const c = centers[i];
          const d = Math.sqrt((mouse.x - c.x) ** 2 + (mouse.y - c.y) ** 2);
          if (d >= radius) { s.style.fontVariationSettings = fromStr; return; }
          const f = calcFalloff(d);
          s.style.fontVariationSettings = axes.map(({ axis, fromValue, toValue }) =>
            `'${axis}' ${fromValue + (toValue - fromValue) * f}`).join(', ');
        });
      };
      const wake = () => { if (!raf && inView && !document.hidden && !reduced) { idle = 0; raf = requestAnimationFrame(loop); } };
      addEventListener('pointermove', (e) => {
        const rect = root.getBoundingClientRect();
        mouse.x = e.clientX - rect.left;
        mouse.y = e.clientY - rect.top;
        wake();
      }, { passive: true });
      addEventListener('scroll', () => { dirty = true; }, { passive: true });
      addEventListener('resize', () => { dirty = true; }, { passive: true });
      new IntersectionObserver((en) => { inView = en[0].isIntersecting; if (!inView && raf) { cancelAnimationFrame(raf); raf = 0; } }, { rootMargin: '120px' }).observe(root);
      root.__varprox = () => ({ running: !!raf, letters: letters.length });
    });
  })();

  /* ============ v101 · React Bits 第九批 ============
     FallingText / EchoText / FoldText / ScrollFloat / Galaxy / PixelBlast */

  /* ---- FallingText [data-falling] — matter-js 词粒物理(官方算法逐参数移植) ---- */
  (function fallingText() {
    const M = window.Matter;
    if (!M) return;
    document.querySelectorAll('[data-falling]').forEach((box) => {
      const text = box.getAttribute('data-falling') || '';
      if (!text) return;
      const hl = (box.getAttribute('data-highlight') || '').split(',').filter(Boolean);
      const gravity = parseFloat(box.getAttribute('data-gravity') || '1');
      const stiffness = parseFloat(box.getAttribute('data-stiffness') || '0.2');
      const inner = document.createElement('div');
      inner.className = 'ft-target';
      inner.innerHTML = text.split(' ').map((w) => {
        const hot = hl.some((h) => w.startsWith(h));
        return `<span class="ft-word${hot ? ' ft-hl' : ''}">${w}</span>`;
      }).join(' ');
      box.appendChild(inner);
      if (reduced) { box.__falling = () => ({ physics: false }); return; }
      const { Engine, World, Bodies, Runner, Mouse, MouseConstraint } = M;
      let started = false, engine = null, runner = null, raf = 0, inView = false;
      let pairs = [];
      const start = () => {
        if (started) return;
        started = true;
        const rect = box.getBoundingClientRect();
        const width = rect.width, height = rect.height;
        if (width <= 0 || height <= 0) { started = false; return; }
        engine = Engine.create();
        engine.world.gravity.y = gravity;
        const bOpt = { isStatic: true, render: { fillStyle: 'transparent' } };
        const floor = Bodies.rectangle(width / 2, height + 25, width, 50, bOpt);
        const leftWall = Bodies.rectangle(-25, height / 2, 50, height, bOpt);
        const rightWall = Bodies.rectangle(width + 25, height / 2, 50, height, bOpt);
        const ceiling = Bodies.rectangle(width / 2, -25, width, 50, bOpt);
        pairs = Array.from(inner.querySelectorAll('.ft-word')).map((elem) => {
          const r = elem.getBoundingClientRect();
          const body = Bodies.rectangle(r.left - rect.left + r.width / 2, r.top - rect.top + r.height / 2, r.width, r.height, {
            render: { fillStyle: 'transparent' }, restitution: 0.8, frictionAir: 0.01, friction: 0.2
          });
          M.Body.setVelocity(body, { x: (Math.random() - 0.5) * 5, y: 0 });
          M.Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.05);
          return { elem, body };
        });
        pairs.forEach(({ elem, body }) => {
          elem.style.position = 'absolute';
          elem.style.left = `${body.position.x}px`;
          elem.style.top = `${body.position.y}px`;
        });
        const mouse = Mouse.create(box);
        const mc = MouseConstraint.create(engine, {
          mouse, constraint: { stiffness, render: { visible: false } }
        });
        World.add(engine.world, [floor, leftWall, rightWall, ceiling, mc, ...pairs.map((p) => p.body)]);
        runner = Runner.create();
        Runner.run(runner, engine);
        raf = requestAnimationFrame(loop);
      };
      const loop = () => {
        if (document.hidden || !inView || !pairs.length || !engine) { raf = 0; return; }
        raf = requestAnimationFrame(loop);
        pairs.forEach(({ body, elem }) => {
          elem.style.left = `${body.position.x}px`;
          elem.style.top = `${body.position.y}px`;
          elem.style.transform = `translate(-50%, -50%) rotate(${body.angle}rad)`;
        });
        Engine.update(engine);
      };
      new IntersectionObserver((en) => {
        inView = en[0].isIntersecting;
        if (inView) {
          start();
          if (runner && engine) Runner.run(runner, engine);
          if (!raf && started) raf = requestAnimationFrame(loop);
        } else if (runner && engine) Runner.stop(runner);
      }, { threshold: 0.1 }).observe(box);
      box.__falling = () => ({ started, bodies: pairs.length });
    });
  })();

  /* ---- EchoText [data-echo] — 逐层插值残影回声 ---- */
  (function echoText() {
    const clampE = (v, a, b) => Math.min(b, Math.max(a, v));
    const dirVec = {
      right: { x: 1, y: 0 }, left: { x: -1, y: 0 }, up: { x: 0, y: -1 },
      down: { x: 0, y: 1 }, diagonal: { x: 0.72, y: 0.72 }
    };
    const easings = {
      linear: (t) => t,
      'ease-out': (t) => 1 - Math.pow(1 - t, 3),
      'ease-in-out': (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
      snappy: (t) => 1 - Math.pow(1 - t, 5)
    };
    document.querySelectorAll('[data-echo]').forEach((root) => {
      const text = root.getAttribute('data-echo') || '';
      if (!text) return;
      root.classList.add('ec-text');
      root.textContent = '';
      const echoCount = reduced ? 0 : clampE(Math.round(parseFloat(root.getAttribute('data-echoes') || '12')), 0, 24);
      const lag = clampE(parseFloat(root.getAttribute('data-lag') || '0.24'), 0.02, 0.5);
      const offset = clampE(parseFloat(root.getAttribute('data-offset') || '36'), 0, 120);
      const vector = dirVec[root.getAttribute('data-direction') || 'right'] || dirVec.right;
      const fade = clampE(parseFloat(root.getAttribute('data-fade') || '0.72'), 0.1, 0.95);
      const blur = clampE(parseFloat(root.getAttribute('data-blur') || '3'), 0, 16);
      const tint = root.getAttribute('data-tint') || '';
      const duration = Math.max(0, parseFloat(root.getAttribute('data-duration') || '900'));
      const easeFn = easings[root.getAttribute('data-ease') || 'ease-out'] || easings['ease-out'];
      const baseColor = getComputedStyle(root).color;
      const copies = [];
      for (let i = echoCount; i >= 1; i--) {
        const s = document.createElement('span');
        s.className = 'ec-copy';
        s.setAttribute('aria-hidden', 'true');
        s.textContent = text;
        if (tint) s.style.color = `color-mix(in srgb, ${tint} ${Math.min(72, 18 + i * 5)}%, ${baseColor})`;
        s.style.opacity = '0';
        root.appendChild(s);
        copies[i] = s;
      }
      const front = document.createElement('span');
      front.className = 'ec-copy ec-front';
      front.textContent = text;
      root.appendChild(front);
      copies[0] = front;
      if (reduced || !echoCount) { root.__echo = () => ({ running: false, copies: 0 }); return; }

      let state = null, raf = 0, inView = false, started = false;
      const init = () => {
        state = {
          targetX: 0, targetY: 0, lastTargetX: 0, lastTargetY: 0,
          activity: 1,
          positions: Array.from({ length: echoCount + 1 }, (_, index) => ({
            x: vector.x * offset * (index + 0.35), y: vector.y * offset * (index + 0.35)
          })),
          startTime: performance.now()
        };
      };
      const onMove = (e) => {
        if (!state) return;
        const rect = root.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const dx = e.clientX - (rect.left + rect.width / 2);
        const dy = e.clientY - (rect.top + rect.height / 2);
        const dist = Math.hypot(dx, dy);
        const reach = dist > 0 ? clampE(dist / 320, 0, 1) : 0;
        state.targetX = (dist > 0 ? dx / dist : 0) * reach * offset;
        state.targetY = (dist > 0 ? dy / dist : 0) * reach * offset * 0.72;
        wake();
      };
      const onLeave = () => { if (state) { state.targetX = 0; state.targetY = 0; } };
      const loop = (now) => {
        raf = 0;
        if (!state || document.hidden || !inView) return;
        const elapsed = now - state.startTime;
        const entranceProgress = duration > 0 ? clampE(elapsed / duration, 0, 1) : 1;
        const easedEntrance = easeFn(entranceProgress);
        const entranceRest = 1 - easedEntrance;
        const targetVelocity = Math.hypot(state.targetX - state.lastTargetX, state.targetY - state.lastTargetY);
        state.lastTargetX = state.targetX;
        state.lastTargetY = state.targetY;
        let maxSep = 0;
        for (let i = 0; i <= echoCount; i++) {
          const copy = copies[i];
          const cur = state.positions[i];
          if (!copy || !cur) continue;
          const entranceAmount = entranceRest * offset * (i + 0.35);
          const desiredX = state.targetX + vector.x * entranceAmount;
          const desiredY = state.targetY + vector.y * entranceAmount;
          const lerp = clampE(0.34 / (1 + i * lag * 4.2), 0.018, 0.36);
          cur.x += (desiredX - cur.x) * lerp;
          cur.y += (desiredY - cur.y) * lerp;
          copy.style.transform = `translate3d(${cur.x.toFixed(3)}px, ${cur.y.toFixed(3)}px, 0)`;
          if (i > 0) {
            const f = state.positions[0];
            maxSep = Math.max(maxSep, f ? Math.hypot(cur.x - f.x, cur.y - f.y) : 0);
            const depth = i / echoCount;
            copy.style.filter = blur > 0 ? `blur(${(blur * depth).toFixed(2)}px)` : 'none';
          }
        }
        const sepAct = offset > 0 ? clampE(maxSep / (offset * 2.25), 0, 1) : 0;
        const velAct = offset > 0 ? clampE(targetVelocity / (offset * 0.35), 0, 1) : 0;
        state.activity += (Math.max(entranceRest, sepAct, velAct) - state.activity) * 0.18;
        for (let i = 1; i <= echoCount; i++) {
          if (copies[i]) copies[i].style.opacity = String(Math.pow(fade, i) * state.activity);
        }
        const stillMoving = state.activity > 0.002 ||
          Math.abs(state.targetX) > 0.01 || Math.abs(state.targetY) > 0.01 || entranceProgress < 1;
        if (stillMoving) wake(true);
      };
      const wake = (immediate) => {
        if (!raf && inView && !document.hidden && state) {
          raf = requestAnimationFrame(loop);
        }
        void immediate;
      };
      if (fine) {
        addEventListener('pointermove', onMove, { passive: true });
        document.addEventListener('pointerleave', onLeave);
      }
      new IntersectionObserver((en) => {
        inView = en[0].isIntersecting;
        if (inView && !started) { started = true; init(); }
        wake();
      }, { rootMargin: '120px' }).observe(root);
      root.__echo = () => ({ running: !!raf, copies: echoCount, started });
    });
  })();

  /* ---- FoldText [data-fold] — 3D 铰链折字入场 ---- */
  (function foldText() {
    const HINGE = {
      top: { origin: '50% 0%', rotateX: -92, rotateY: 0 },
      bottom: { origin: '50% 100%', rotateX: 92, rotateY: 0 },
      left: { origin: '0% 50%', rotateX: 0, rotateY: 92 },
      right: { origin: '100% 50%', rotateX: 0, rotateY: -92 }
    };
    const clampF = (v, a, b) => Math.min(b, Math.max(a, v));
    document.querySelectorAll('[data-fold]').forEach((root) => {
      const text = root.getAttribute('data-fold') || '';
      if (!text) return;
      const splitBy = root.getAttribute('data-fold-split') || 'char';
      const hinge = root.getAttribute('data-hinge') || 'top';
      const hingeCfg = HINGE[hinge] || HINGE.top;
      const duration = parseFloat(root.getAttribute('data-duration') || '0.65');
      const stagger = parseFloat(root.getAttribute('data-stagger') || '0.045');
      const ease = root.getAttribute('data-ease') || 'power3.out';
      const perspective = Math.max(120, parseFloat(root.getAttribute('data-perspective') || '700'));
      const crease = clampF(parseFloat(root.getAttribute('data-crease') || '0.55'), 0, 1);
      const trigger = root.getAttribute('data-trigger') || 'scroll';
      root.classList.add('fl-text');
      const size = root.getAttribute('data-size');
      if (size) root.style.setProperty('--fold-text-font-size', `${size}px`);
      const sr = document.createElement('span');
      sr.className = 'fl-sr';
      sr.textContent = text;
      root.appendChild(sr);
      const visual = document.createElement('span');
      visual.className = 'fl-visual';
      visual.setAttribute('aria-hidden', 'true');
      const segment = (content) => {
        const seg = document.createElement('span');
        seg.className = 'fl-seg';
        seg.style.setProperty('--fold-perspective', `${perspective}px`);
        const piece = document.createElement('span');
        piece.className = 'fl-piece';
        piece.dataset.foldHinge = hinge;
        piece.style.transformOrigin = hingeCfg.origin;
        piece.style.setProperty('--fold-crease', 0);
        piece.textContent = content || '\u00A0';
        seg.appendChild(piece);
        return seg;
      };
      if (splitBy === 'line') {
        text.split('\n').forEach((line) => {
          const l = document.createElement('span');
          l.className = 'fl-line';
          l.appendChild(segment(line || '\u00A0'));
          visual.appendChild(l);
        });
      } else if (splitBy === 'word') {
        text.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) {
            const ws = document.createElement('span');
            ws.className = 'fl-ws';
            ws.textContent = part.replace(/ /g, '\u00A0');
            visual.appendChild(ws);
          } else visual.appendChild(segment(part));
        });
      } else {
        Array.from(text).forEach((ch) => {
          if (ch === '\n') { visual.appendChild(document.createElement('br')); return; }
          visual.appendChild(segment(ch === ' ' ? '\u00A0' : ch));
        });
      }
      root.appendChild(visual);
      const pieces = Array.from(root.querySelectorAll('.fl-piece'));
      if (!pieces.length) return;
      const reduce = reduced;
      const fromVars = {
        opacity: 0,
        rotateX: reduce ? 0 : hingeCfg.rotateX,
        rotateY: reduce ? 0 : hingeCfg.rotateY,
        '--fold-crease': reduce ? 0 : crease,
        transformOrigin: hingeCfg.origin,
        force3D: true
      };
      const toVars = {
        opacity: 1, rotateX: 0, rotateY: 0, '--fold-crease': 0,
        duration: reduce ? Math.min(duration, 0.22) : duration,
        ease: reduce ? 'power1.out' : ease,
        stagger: reduce ? Math.min(stagger, 0.02) : stagger,
        clearProps: 'willChange'
      };
      let tl = null;
      const play = (repeat) => {
        if (tl) tl.kill();
        gsap.killTweensOf(pieces);
        tl = gsap.timeline({ repeat: repeat ? -1 : 0, repeatDelay: repeat ? 0.75 : 0 });
        tl.fromTo(pieces, fromVars, toVars);
      };
      if (trigger === 'hover') {
        gsap.set(pieces, { opacity: 1, rotateX: 0, rotateY: 0, '--fold-crease': 0, transformOrigin: hingeCfg.origin });
        root.addEventListener('mouseenter', () => play(false));
      } else if (trigger === 'scroll') {
        gsap.set(pieces, fromVars);
        ScrollTrigger.create({ trigger: root, start: 'top 82%', once: true, onEnter: () => play(false) });
      } else if (trigger === 'loop') {
        play(true);
      } else {
        play(false);
      }
      root.__fold = () => ({ pieces: pieces.length, trigger });
    });
  })();

  /* ---- ScrollFloat [data-scrollfloat] — scrub 逐字上浮 ---- */
  (function scrollFloat() {
    document.querySelectorAll('[data-scrollfloat]').forEach((el) => {
      const text = el.getAttribute('data-scrollfloat') || '';
      if (!text) return;
      const span = document.createElement('span');
      span.className = 'sf-text';
      Array.from(text).forEach((ch) => {
        const c = document.createElement('span');
        c.className = 'sf-char';
        c.textContent = ch === ' ' ? '\u00A0' : ch;
        span.appendChild(c);
      });
      el.appendChild(span);
      if (reduced) return;
      const chars = span.querySelectorAll('.sf-char');
      gsap.fromTo(chars,
        { willChange: 'opacity, transform', opacity: 0, yPercent: 120, scaleY: 2.3, scaleX: 0.7, transformOrigin: '50% 0%' },
        {
          duration: parseFloat(el.getAttribute('data-duration') || '1'),
          ease: el.getAttribute('data-ease') || 'back.inOut(2)',
          opacity: 1, yPercent: 0, scaleY: 1, scaleX: 1,
          stagger: parseFloat(el.getAttribute('data-stagger') || '0.03'),
          scrollTrigger: {
            trigger: el,
            start: el.getAttribute('data-start') || 'center bottom+=50%',
            end: el.getAttribute('data-end') || 'bottom bottom-=40%',
            scrub: true
          }
        });
      el.__scrollfloat = () => ({ chars: chars.length });
    });
  })();

  /* ---- Galaxy [data-galaxy] — 官方 ogl 星野着色器 three.js 等价移植 ---- */
  (function galaxy() {
    const T = window.THREE;
    if (!T) return;
    const VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;
    // 官方片元着色器逐行移植;仅将 bool uniform 改为 float 比较以兼容 three 的 uniform 通道
    const FRAG = `
precision highp float;

uniform float uTime;
uniform vec3 uResolution;
uniform vec2 uFocal;
uniform vec2 uRotation;
uniform float uStarSpeed;
uniform float uDensity;
uniform float uHueShift;
uniform float uSpeed;
uniform vec2 uMouse;
uniform float uGlowIntensity;
uniform float uSaturation;
uniform float uMouseRepulsion;
uniform float uTwinkleIntensity;
uniform float uRotationSpeed;
uniform float uRepulsionStrength;
uniform float uMouseActiveFactor;
uniform float uAutoCenterRepulsion;
uniform float uTransparent;
uniform float uLightMode;

varying vec2 vUv;

#define NUM_LAYER 4.0
#define STAR_COLOR_CUTOFF 0.2
#define MAT45 mat2(0.7071, -0.7071, 0.7071, 0.7071)
#define PERIOD 3.0

float Hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float tri(float x) {
  return abs(fract(x) * 2.0 - 1.0);
}

float tris(float x) {
  float t = fract(x);
  return 1.0 - smoothstep(0.0, 1.0, abs(2.0 * t - 1.0));
}

float trisn(float x) {
  float t = fract(x);
  return 2.0 * (1.0 - smoothstep(0.0, 1.0, abs(2.0 * t - 1.0))) - 1.0;
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

float Star(vec2 uv, float flare) {
  float d = length(uv);
  float m = (0.05 * uGlowIntensity) / d;
  float rays = smoothstep(0.0, 1.0, 1.0 - abs(uv.x * uv.y * 1000.0));
  m += rays * flare * uGlowIntensity;
  uv *= MAT45;
  rays = smoothstep(0.0, 1.0, 1.0 - abs(uv.x * uv.y * 1000.0));
  m += rays * 0.3 * flare * uGlowIntensity;
  m *= smoothstep(1.0, 0.2, d);
  return m;
}

vec3 StarLayer(vec2 uv) {
  vec3 col = vec3(0.0);

  vec2 gv = fract(uv) - 0.5;
  vec2 id = floor(uv);

  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 offset = vec2(float(x), float(y));
      vec2 si = id + vec2(float(x), float(y));
      float seed = Hash21(si);
      float size = fract(seed * 345.32);
      float glossLocal = tri(uStarSpeed / (PERIOD * seed + 1.0));
      float flareSize = smoothstep(0.9, 1.0, size) * glossLocal;

      float red = smoothstep(STAR_COLOR_CUTOFF, 1.0, Hash21(si + 1.0)) + STAR_COLOR_CUTOFF;
      float blu = smoothstep(STAR_COLOR_CUTOFF, 1.0, Hash21(si + 3.0)) + STAR_COLOR_CUTOFF;
      float grn = min(red, blu) * seed;
      vec3 base = vec3(red, grn, blu);

      float hue = atan(base.g - base.r, base.b - base.r) / (2.0 * 3.14159) + 0.5;
      hue = fract(hue + uHueShift / 360.0);
      float sat = length(base - vec3(dot(base, vec3(0.299, 0.587, 0.114)))) * uSaturation;
      float val = max(max(base.r, base.g), base.b);
      base = hsv2rgb(vec3(hue, sat, val));

      vec2 pad = vec2(tris(seed * 34.0 + uTime * uSpeed / 10.0), tris(seed * 38.0 + uTime * uSpeed / 30.0)) - 0.5;

      float star = Star(gv - offset - pad, flareSize);
      vec3 color = base;

      float twinkle = trisn(uTime * uSpeed + seed * 6.2831) * 0.5 + 1.0;
      twinkle = mix(1.0, twinkle, uTwinkleIntensity);
      star *= twinkle;

      col += star * size * color;
    }
  }

  return col;
}

void main() {
  vec2 focalPx = uFocal * uResolution.xy;
  vec2 uv = (vUv * uResolution.xy - focalPx) / uResolution.y;

  vec2 mouseNorm = uMouse - vec2(0.5);

  if (uAutoCenterRepulsion > 0.5) {
    vec2 centerUV = vec2(0.0, 0.0);
    float centerDist = length(uv - centerUV);
    vec2 repulsion = normalize(uv - centerUV) * (uAutoCenterRepulsion / (centerDist + 0.1));
    uv += repulsion * 0.05;
  } else if (uMouseRepulsion > 0.5) {
    vec2 mousePosUV = (uMouse * uResolution.xy - focalPx) / uResolution.y;
    float mouseDist = length(uv - mousePosUV);
    vec2 repulsion = normalize(uv - mousePosUV) * (uRepulsionStrength / (mouseDist + 0.1));
    uv += repulsion * 0.05 * uMouseActiveFactor;
  } else {
    vec2 mouseOffset = mouseNorm * 0.1 * uMouseActiveFactor;
    uv += mouseOffset;
  }

  float autoRotAngle = uTime * uRotationSpeed;
  mat2 autoRot = mat2(cos(autoRotAngle), -sin(autoRotAngle), sin(autoRotAngle), cos(autoRotAngle));
  uv = autoRot * uv;

  uv = mat2(uRotation.x, -uRotation.y, uRotation.y, uRotation.x) * uv;

  vec3 col = vec3(0.0);

  for (float i = 0.0; i < 1.0; i += 1.0 / NUM_LAYER) {
    float depth = fract(i + uStarSpeed * uSpeed);
    float scale = mix(20.0 * uDensity, 0.5 * uDensity, depth);
    float fade = depth * smoothstep(1.0, 0.9, depth);
    col += StarLayer(uv * scale + i * 453.32) * fade;
  }

  if (uLightMode > 0.5) {
    float energy = max(max(col.r, col.g), col.b);
    float coverage = clamp(smoothstep(0.0, 0.42, energy) * 0.92, 0.0, 0.92);
    vec3 ink = clamp(col * 0.48, 0.0, 0.82);
    gl_FragColor = vec4(mix(vec3(1.0), ink, coverage), 1.0);
  } else if (uTransparent > 0.5) {
    float alpha = length(col);
    alpha = smoothstep(0.0, 0.3, alpha);
    alpha = min(alpha, 1.0);
    gl_FragColor = vec4(col, alpha);
  } else {
    gl_FragColor = vec4(col, 1.0);
  }
}
`;
    document.querySelectorAll('[data-galaxy]').forEach((box) => {
      const canvas = box.querySelector('canvas');
      if (!canvas) return;
      const num = (n, d) => {
        const v = parseFloat(box.getAttribute(n));
        return Number.isFinite(v) ? v : d;
      };
      const starSpeed = num('data-star-speed', 0.5);
      const speed = num('data-speed', 1);
      const renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'high-performance' });
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      const uniforms = {
        uTime: { value: 0 },
        uResolution: { value: new T.Vector3(1, 1, 1) },
        uFocal: { value: new T.Vector2(0.5, 0.5) },
        uRotation: { value: new T.Vector2(1, 0) },
        uStarSpeed: { value: 0 },
        uDensity: { value: num('data-density', 1) },
        uHueShift: { value: num('data-hue-shift', 140) },
        uSpeed: { value: speed },
        uMouse: { value: new T.Vector2(0.5, 0.5) },
        uGlowIntensity: { value: num('data-glow', 0.3) },
        uSaturation: { value: num('data-saturation', 0) },
        uMouseRepulsion: { value: box.getAttribute('data-repulsion') === 'false' ? 0 : 1 },
        uTwinkleIntensity: { value: num('data-twinkle', 0.3) },
        uRotationSpeed: { value: num('data-rotation-speed', 0.1) },
        uRepulsionStrength: { value: num('data-repulsion-strength', 2) },
        uMouseActiveFactor: { value: 0 },
        uAutoCenterRepulsion: { value: num('data-auto-center-repulsion', 0) },
        uTransparent: { value: 1 },
        uLightMode: { value: 0 }
      };
      const material = new T.ShaderMaterial({
        vertexShader: VERT, fragmentShader: FRAG, uniforms,
        transparent: true, depthTest: false, depthWrite: false
      });
      const scene = new T.Scene();
      const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const quad = new T.Mesh(new T.PlaneGeometry(2, 2), material);
      quad.frustumCulled = false;
      scene.add(quad);
      const resize = () => {
        const r = box.getBoundingClientRect();
        const w = Math.max(1, r.width), h = Math.max(1, r.height);
        renderer.setSize(w, h, false);
        uniforms.uResolution.value.set(canvas.width, canvas.height, canvas.width / canvas.height);
      };
      resize();
      new ResizeObserver(resize).observe(box);
      const target = { x: 0.5, y: 0.5, active: 0 };
      const smooth = { x: 0.5, y: 0.5, active: 0 };
      box.addEventListener('mousemove', (e) => {
        const r = box.getBoundingClientRect();
        target.x = (e.clientX - r.left) / r.width;
        target.y = 1.0 - (e.clientY - r.top) / r.height;
        target.active = 1.0;
      }, { passive: true });
      box.addEventListener('mouseleave', () => { target.active = 0.0; });
      let raf = 0, inView = false;
      const update = (t) => {
        if (document.hidden || !inView) { raf = 0; return; }
        raf = requestAnimationFrame(update);
        uniforms.uTime.value = t * 0.001;
        uniforms.uStarSpeed.value = (t * 0.001 * starSpeed) / 10.0;
        smooth.x += (target.x - smooth.x) * 0.05;
        smooth.y += (target.y - smooth.y) * 0.05;
        smooth.active += (target.active - smooth.active) * 0.05;
        uniforms.uMouse.value.set(smooth.x, smooth.y);
        uniforms.uMouseActiveFactor.value = smooth.active;
        uniforms.uLightMode.value = document.documentElement.dataset.theme === 'light' ? 1 : 0;
        renderer.render(scene, camera);
      };
      if (reduced) {
        uniforms.uTime.value = 6;
        uniforms.uStarSpeed.value = 0.3;
        uniforms.uLightMode.value = document.documentElement.dataset.theme === 'light' ? 1 : 0;
        renderer.render(scene, camera);
        box.__galaxy = () => ({ running: false });
        return;
      }
      new IntersectionObserver((en) => {
        inView = en[0].isIntersecting;
        if (inView && !raf) raf = requestAnimationFrame(update);
      }, { rootMargin: '120px' }).observe(box);
      box.__galaxy = () => ({ running: !!raf, t: uniforms.uTime.value });
    });
  })();

  /* ---- PixelBlast [data-pixelblast] — FBM+Bayer 像素场,点击涟漪(官方核心移植;liquid/noise 后处理需 postprocessing 库,未随附) ---- */
  (function pixelBlast() {
    const T = window.THREE;
    if (!T) return;
    const SHAPE_MAP = { square: 0, circle: 1, triangle: 2, diamond: 3 };
    const VERT = `
void main() {
  gl_Position = vec4(position, 1.0);
}`;
    const FRAG = `
precision highp float;

uniform vec3  uColor;
uniform vec2  uResolution;
uniform float uTime;
uniform float uPixelSize;
uniform float uScale;
uniform float uDensity;
uniform float uPixelJitter;
uniform int   uEnableRipples;
uniform float uRippleSpeed;
uniform float uRippleThickness;
uniform float uRippleIntensity;
uniform float uEdgeFade;

uniform int   uShapeType;
const int SHAPE_SQUARE   = 0;
const int SHAPE_CIRCLE   = 1;
const int SHAPE_TRIANGLE = 2;
const int SHAPE_DIAMOND  = 3;

const int   MAX_CLICKS = 10;

uniform vec2  uClickPos  [MAX_CLICKS];
uniform float uClickTimes[MAX_CLICKS];

out vec4 fragColor;

float Bayer2(vec2 a) {
  a = floor(a);
  return fract(a.x / 2. + a.y * a.y * .75);
}
#define Bayer4(a) (Bayer2(.5*(a))*0.25 + Bayer2(a))
#define Bayer8(a) (Bayer4(.5*(a))*0.25 + Bayer2(a))

#define FBM_OCTAVES     5
#define FBM_LACUNARITY  1.25
#define FBM_GAIN        1.0

float hash11(float n){ return fract(sin(n)*43758.5453); }

float vnoise(vec3 p){
  vec3 ip = floor(p);
  vec3 fp = fract(p);
  float n000 = hash11(dot(ip + vec3(0.0,0.0,0.0), vec3(1.0,57.0,113.0)));
  float n100 = hash11(dot(ip + vec3(1.0,0.0,0.0), vec3(1.0,57.0,113.0)));
  float n010 = hash11(dot(ip + vec3(0.0,1.0,0.0), vec3(1.0,57.0,113.0)));
  float n110 = hash11(dot(ip + vec3(1.0,1.0,0.0), vec3(1.0,57.0,113.0)));
  float n001 = hash11(dot(ip + vec3(0.0,0.0,1.0), vec3(1.0,57.0,113.0)));
  float n101 = hash11(dot(ip + vec3(1.0,0.0,1.0), vec3(1.0,57.0,113.0)));
  float n011 = hash11(dot(ip + vec3(0.0,1.0,1.0), vec3(1.0,57.0,113.0)));
  float n111 = hash11(dot(ip + vec3(1.0,1.0,1.0), vec3(1.0,57.0,113.0)));
  vec3 w = fp*fp*fp*(fp*(fp*6.0-15.0)+10.0);
  float x00 = mix(n000, n100, w.x);
  float x10 = mix(n010, n110, w.x);
  float x01 = mix(n001, n101, w.x);
  float x11 = mix(n011, n111, w.x);
  float y0  = mix(x00, x10, w.y);
  float y1  = mix(x01, x11, w.y);
  return mix(y0, y1, w.z) * 2.0 - 1.0;
}

float fbm2(vec2 uv, float t){
  vec3 p = vec3(uv * uScale, t);
  float amp = 1.0;
  float freq = 1.0;
  float sum = 1.0;
  for (int i = 0; i < FBM_OCTAVES; ++i){
    sum  += amp * vnoise(p * freq);
    freq *= FBM_LACUNARITY;
    amp  *= FBM_GAIN;
  }
  return sum * 0.5 + 0.5;
}

float maskCircle(vec2 p, float cov){
  float r = sqrt(cov) * .25;
  float d = length(p - 0.5) - r;
  float aa = 0.5 * fwidth(d);
  return cov * (1.0 - smoothstep(-aa, aa, d * 2.0));
}

float maskTriangle(vec2 p, vec2 id, float cov){
  bool flip = mod(id.x + id.y, 2.0) > 0.5;
  if (flip) p.x = 1.0 - p.x;
  float r = sqrt(cov);
  float d  = p.y - r*(1.0 - p.x);
  float aa = fwidth(d);
  return cov * clamp(0.5 - d/aa, 0.0, 1.0);
}

float maskDiamond(vec2 p, float cov){
  float r = sqrt(cov) * 0.564;
  return step(abs(p.x - 0.49) + abs(p.y - 0.49), r);
}

void main(){
  float pixelSize = uPixelSize;
  vec2 fragCoord = gl_FragCoord.xy - uResolution * .5;
  float aspectRatio = uResolution.x / uResolution.y;

  vec2 pixelId = floor(fragCoord / pixelSize);
  vec2 pixelUV = fract(fragCoord / pixelSize);

  float cellPixelSize = 8.0 * pixelSize;
  vec2 cellId = floor(fragCoord / cellPixelSize);
  vec2 cellCoord = cellId * cellPixelSize;
  vec2 uv = cellCoord / uResolution * vec2(aspectRatio, 1.0);

  float base = fbm2(uv, uTime * 0.05);
  base = base * 0.5 - 0.65;

  float feed = base + (uDensity - 0.5) * 0.3;

  float speed     = uRippleSpeed;
  float thickness = uRippleThickness;
  const float dampT     = 1.0;
  const float dampR     = 10.0;

  if (uEnableRipples == 1) {
    for (int i = 0; i < MAX_CLICKS; ++i){
      vec2 pos = uClickPos[i];
      if (pos.x < 0.0) continue;
      float cpsz = 8.0 * pixelSize;
      vec2 cuv = (((pos - uResolution * .5 - cpsz * .5) / (uResolution))) * vec2(aspectRatio, 1.0);
      float t = max(uTime - uClickTimes[i], 0.0);
      float r = distance(uv, cuv);
      float waveR = speed * t;
      float ring  = exp(-pow((r - waveR) / thickness, 2.0));
      float atten = exp(-dampT * t) * exp(-dampR * r);
      feed = max(feed, ring * atten * uRippleIntensity);
    }
  }

  float bayer = Bayer8(fragCoord / uPixelSize) - 0.5;
  float bw = step(0.5, feed + bayer);

  float h = fract(sin(dot(floor(fragCoord / uPixelSize), vec2(127.1, 311.7))) * 43758.5453);
  float jitterScale = 1.0 + (h - 0.5) * uPixelJitter;
  float coverage = bw * jitterScale;
  float M;
  if      (uShapeType == SHAPE_CIRCLE)   M = maskCircle (pixelUV, coverage);
  else if (uShapeType == SHAPE_TRIANGLE) M = maskTriangle(pixelUV, pixelId, coverage);
  else if (uShapeType == SHAPE_DIAMOND)  M = maskDiamond(pixelUV, coverage);
  else                                   M = coverage;

  if (uEdgeFade > 0.0) {
    vec2 norm = gl_FragCoord.xy / uResolution;
    float edge = min(min(norm.x, norm.y), min(1.0 - norm.x, 1.0 - norm.y));
    float fade = smoothstep(0.0, uEdgeFade, edge);
    M *= fade;
  }

  vec3 color = uColor;

  vec3 srgbColor = mix(
    color * 12.92,
    1.055 * pow(color, vec3(1.0 / 2.4)) - 0.055,
    step(0.0031308, color)
  );

  fragColor = vec4(srgbColor, M);
}`;
    const MAX_CLICKS = 10;
    document.querySelectorAll('[data-pixelblast]').forEach((box) => {
      const canvas = box.querySelector('canvas');
      if (!canvas) return;
      const num = (n, d) => {
        const v = parseFloat(box.getAttribute(n));
        return Number.isFinite(v) ? v : d;
      };
      const speed = num('data-speed', 0.5);
      const pixelSize = num('data-pixel-size', 3);
      const renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
      renderer.setClearAlpha(0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      const uniforms = {
        uResolution: { value: new T.Vector2(0, 0) },
        uTime: { value: 0 },
        uColor: { value: new T.Color(box.getAttribute('data-color') || '#C4B5FD') },
        uClickPos: { value: Array.from({ length: MAX_CLICKS }, () => new T.Vector2(-1, -1)) },
        uClickTimes: { value: new Float32Array(MAX_CLICKS) },
        uShapeType: { value: SHAPE_MAP[box.getAttribute('data-variant') || 'square'] ?? 0 },
        uPixelSize: { value: pixelSize * renderer.getPixelRatio() },
        uScale: { value: num('data-pattern-scale', 2) },
        uDensity: { value: num('data-pattern-density', 1) },
        uPixelJitter: { value: num('data-jitter', 0) },
        uEnableRipples: { value: box.getAttribute('data-ripples') === 'false' ? 0 : 1 },
        uRippleSpeed: { value: num('data-ripple-speed', 0.3) },
        uRippleThickness: { value: num('data-ripple-thickness', 0.1) },
        uRippleIntensity: { value: num('data-ripple-intensity', 1.2) },
        uEdgeFade: { value: num('data-edge-fade', 0.5) }
      };
      const material = new T.ShaderMaterial({
        vertexShader: VERT, fragmentShader: FRAG, uniforms,
        transparent: true, depthTest: false, depthWrite: false,
        glslVersion: T.GLSL3
      });
      const scene = new T.Scene();
      const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const quad = new T.Mesh(new T.PlaneGeometry(2, 2), material);
      quad.frustumCulled = false;
      scene.add(quad);
      const clock = new T.Clock();
      const randF = () => {
        if (window.crypto && window.crypto.getRandomValues) {
          const u32 = new Uint32Array(1);
          window.crypto.getRandomValues(u32);
          return u32[0] / 0xffffffff;
        }
        return Math.random();
      };
      const timeOffset = randF() * 1000;
      const setSize = () => {
        const r = box.getBoundingClientRect();
        renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
        uniforms.uResolution.value.set(canvas.width, canvas.height);
        uniforms.uPixelSize.value = pixelSize * renderer.getPixelRatio();
      };
      setSize();
      new ResizeObserver(setSize).observe(box);
      const mapToPixels = (e) => {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
          fx: (e.clientX - rect.left) * scaleX,
          fy: (rect.height - (e.clientY - rect.top)) * scaleY
        };
      };
      let clickIx = 0;
      canvas.addEventListener('pointerdown', (e) => {
        const { fx, fy } = mapToPixels(e);
        uniforms.uClickPos.value[clickIx].set(fx, fy);
        uniforms.uClickTimes.value[clickIx] = uniforms.uTime.value;
        clickIx = (clickIx + 1) % MAX_CLICKS;
      }, { passive: true });
      let raf = 0, inView = false;
      const animate = () => {
        if (document.hidden || !inView) { raf = 0; return; }
        raf = requestAnimationFrame(animate);
        uniforms.uTime.value = timeOffset + clock.getElapsedTime() * speed;
        renderer.render(scene, camera);
      };
      if (reduced) {
        uniforms.uTime.value = timeOffset;
        renderer.render(scene, camera);
        box.__pixelblast = () => ({ running: false });
        return;
      }
      new IntersectionObserver((en) => {
        inView = en[0].isIntersecting;
        if (inView && !raf) raf = requestAnimationFrame(animate);
      }, { rootMargin: '120px' }).observe(box);
      box.__pixelblast = () => ({
        running: !!raf, t: uniforms.uTime.value, shape: uniforms.uShapeType.value,
        ripples: uniforms.uClickPos.value.filter((v) => v.x >= 0).length
      });
    });
  })();

  /* ============ v102 · React Bits 第十批 ============ */

  /* ---- CurvedLoop 曲线循环字带 · [data-curvedloop="TEXT"] ---- */
  (function () {
    const NS = 'http://www.w3.org/2000/svg';
    let uid = 0;
    document.querySelectorAll('[data-curvedloop]').forEach(function (jacket) {
      const raw = jacket.getAttribute('data-curvedloop') || '';
      const hasTrailing = /\s|\u00A0$/.test(raw);
      const text = (hasTrailing ? raw.replace(/\s+$/, '') : raw) + '\u00A0';
      const speed = parseFloat(jacket.getAttribute('data-speed')) || 2;
      const curve = parseFloat(jacket.getAttribute('data-curve')) || 400;
      const dir = { v: jacket.getAttribute('data-direction') === 'right' ? 'right' : 'left' };
      const pathId = 'cl-' + ++uid;

      jacket.style.visibility = 'hidden';
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('class', 'cl-svg');
      svg.setAttribute('viewBox', '0 0 1440 120');
      const measure = document.createElementNS(NS, 'text');
      measure.setAttribute('xml:space', 'preserve');
      measure.setAttribute('style', 'visibility:hidden;opacity:0;pointer-events:none');
      measure.textContent = text;
      svg.appendChild(measure);
      const defs = document.createElementNS(NS, 'defs');
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('id', pathId);
      path.setAttribute('d', 'M-100,40 Q500,' + (40 + curve) + ' 1540,40');
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'transparent');
      defs.appendChild(path);
      svg.appendChild(defs);
      const textEl = document.createElementNS(NS, 'text');
      textEl.setAttribute('font-weight', 'bold');
      textEl.setAttribute('xml:space', 'preserve');
      const textPath = document.createElementNS(NS, 'textPath');
      textPath.setAttribute('href', '#' + pathId);
      textPath.setAttribute('startOffset', '0px');
      textPath.setAttribute('xml:space', 'preserve');
      textEl.appendChild(textPath);
      svg.appendChild(textEl);
      jacket.appendChild(svg);

      let spacing = 0;
      let ready = false;
      let raf = 0;
      let inView = false;
      const drag = { on: false, x: 0, vel: 0 };

      function build() {
        const len = measure.getComputedTextLength();
        if (!len) return;
        spacing = len;
        const count = Math.ceil(1800 / spacing) + 2;
        let total = '';
        for (let i = 0; i < count; i += 1) total += text;
        textPath.textContent = total;
        textPath.setAttribute('startOffset', -spacing + 'px');
        ready = true;
        jacket.style.visibility = 'visible';
        start();
      }

      function step() {
        if (document.hidden || !inView || !ready) { raf = 0; return; }
        raf = requestAnimationFrame(step);
        if (drag.on) return;
        const delta = dir.v === 'right' ? speed : -speed;
        let off = parseFloat(textPath.getAttribute('startOffset') || '0') + delta;
        if (off <= -spacing) off += spacing;
        if (off > 0) off -= spacing;
        textPath.setAttribute('startOffset', off + 'px');
      }
      function start() { if (!raf && !document.hidden && inView && ready) raf = requestAnimationFrame(step); }

      jacket.addEventListener('pointerdown', function (e) {
        drag.on = true; drag.x = e.clientX; drag.vel = 0;
        if (e.target.setPointerCapture) { try { e.target.setPointerCapture(e.pointerId); } catch (err) { void err; } }
        jacket.style.cursor = 'grabbing';
      });
      jacket.addEventListener('pointermove', function (e) {
        if (!drag.on || !ready) return;
        const dx = e.clientX - drag.x; drag.x = e.clientX; drag.vel = dx;
        let off = parseFloat(textPath.getAttribute('startOffset') || '0') + dx;
        if (off <= -spacing) off += spacing;
        if (off > 0) off -= spacing;
        textPath.setAttribute('startOffset', off + 'px');
      });
      const endDrag = function () {
        if (!drag.on) return;
        drag.on = false;
        dir.v = drag.vel > 0 ? 'right' : 'left';
        jacket.style.cursor = 'grab';
      };
      jacket.addEventListener('pointerup', endDrag);
      jacket.addEventListener('pointerleave', endDrag);

      const io = new IntersectionObserver(function (es) {
        es.forEach(function (en) {
          inView = en.isIntersecting;
          if (inView) start();
          else if (raf) { cancelAnimationFrame(raf); raf = 0; }
        });
      }, { rootMargin: '120px' });
      io.observe(jacket);
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) { if (raf) { cancelAnimationFrame(raf); raf = 0; } } else start();
      });

      build();
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(build).catch(function () { void 0; });
      jacket.__curvedloop = function () { return { ready, spacing, dir: dir.v, running: !!raf }; };
    });
  })();

  /* ---- DepthText 纵深挤出字 · [data-depth="TEXT"] ---- */
  (function () {
    const MAX_LAYERS = 64;
    const clamp = function (v, a, b) { return Math.min(Math.max(v, a), b); };
    const getLayerColor = function (faceColor, depthColor, index, total) {
      const progress = total <= 1 ? 1 : index / total;
      const eased = progress * progress;
      const faceMix = Math.round((1 - eased) * 72 + 4);
      return 'color-mix(in srgb, ' + faceColor + ' ' + faceMix + '%, ' + depthColor + ')';
    };
    const getTransform = function (x, y) { return 'rotateX(' + x.toFixed(3) + 'deg) rotateY(' + y.toFixed(3) + 'deg)'; };

    document.querySelectorAll('[data-depth]').forEach(function (root) {
      const text = root.getAttribute('data-depth') || 'Elevate';
      const safeLayers = clamp(Math.round(parseFloat(root.getAttribute('data-layers')) || 34), 2, MAX_LAYERS);
      const safeDepth = clamp(parseFloat(root.getAttribute('data-dist')) || 2.4, 0, 12);
      const safeTilt = clamp(parseFloat(root.getAttribute('data-tilt')) || 7.5, 0, 12);
      const safeSmoothing = clamp(parseFloat(root.getAttribute('data-smooth')) || 0.14, 0.02, 0.35);
      const safePerspective = clamp(parseFloat(root.getAttribute('data-persp')) || 900, 300, 2000);
      const safeOrbitSpeed = clamp(parseFloat(root.getAttribute('data-orbit')) || 0.35, 0, 2);
      const faceColor = root.getAttribute('data-face') || '#f8fafc';
      const depthColor = root.getAttribute('data-tint') || '#7c3aed';

      root.classList.add('dt-text');
      root.style.setProperty('--depth-text-perspective', safePerspective + 'px');
      root.style.setProperty('--depth-text-font-size', root.getAttribute('data-size') || 'clamp(3rem, 12vw, 7rem)');
      root.style.setProperty('--depth-text-font-weight', root.getAttribute('data-weight') || '900');
      root.style.setProperty('--depth-text-face-color', faceColor);
      root.style.setProperty('--depth-text-depth-color', depthColor);
      root.style.setProperty('--depth-text-shadow',
        '0 22px 34px color-mix(in srgb, ' + depthColor + ' 36%, transparent), 0 4px 8px rgba(0, 0, 0, 0.28)');

      const stage = document.createElement('span');
      stage.className = 'dt-stage';
      for (let layerIndex = 0; layerIndex < safeLayers; layerIndex += 1) {
        const index = safeLayers - layerIndex;
        const el = document.createElement('span');
        el.setAttribute('aria-hidden', 'true');
        el.className = 'dt-layer';
        el.style.color = getLayerColor(faceColor, depthColor, index, safeLayers);
        el.style.transform = 'translateZ(' + -index * safeDepth + 'px)';
        el.textContent = text;
        stage.appendChild(el);
      }
      const face = document.createElement('span');
      face.className = 'dt-face';
      face.textContent = text;
      stage.appendChild(face);
      root.appendChild(stage);

      const base = { x: -safeTilt * 0.32, y: safeTilt * 0.42 };
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce) { stage.style.transform = getTransform(base.x, base.y); root.__depth = function () { return { reduced: true }; }; return; }

      const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
      const current = { x: base.x, y: base.y };
      const target = { x: base.x, y: base.y };
      let raf = 0;
      let inView = false;
      let activePointer = false;
      let startTime = performance.now();

      const onMove = function (event) {
        if (!finePointer) return;
        const rect = root.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        activePointer = true;
        const nx = clamp((event.clientX - (rect.left + rect.width / 2)) / (rect.width * 0.8), -1, 1);
        const ny = clamp((event.clientY - (rect.top + rect.height / 2)) / (rect.height * 0.8), -1, 1);
        target.x = base.x - ny * safeTilt;
        target.y = base.y + nx * safeTilt;
      };
      const onLeave = function () {
        activePointer = false;
        target.x = base.x;
        target.y = base.y;
      };
      if (finePointer) {
        window.addEventListener('pointermove', onMove);
        window.addEventListener('blur', onLeave);
      }

      const tick = function (now) {
        if (document.hidden || !inView) { raf = 0; return; }
        raf = requestAnimationFrame(tick);
        if (!activePointer) {
          const elapsed = (now - startTime) / 1000;
          const orbit = elapsed * safeOrbitSpeed * Math.PI * 2;
          const fallbackAmount = finePointer ? 0.18 : 0.55;
          target.x = base.x + Math.sin(orbit) * safeTilt * fallbackAmount;
          target.y = base.y + Math.cos(orbit * 0.85) * safeTilt * fallbackAmount;
        }
        current.x += (target.x - current.x) * safeSmoothing;
        current.y += (target.y - current.y) * safeSmoothing;
        stage.style.transform = getTransform(current.x, current.y);
      };
      const io = new IntersectionObserver(function (es) {
        es.forEach(function (en) {
          inView = en.isIntersecting;
          if (inView && !raf && !document.hidden) { startTime = performance.now() - 4000; raf = requestAnimationFrame(tick); }
          else if (!inView && raf) { cancelAnimationFrame(raf); raf = 0; }
        });
      }, { rootMargin: '120px' });
      io.observe(root);
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden && inView && !raf) raf = requestAnimationFrame(tick);
      });
      root.__depth = function () { return { layers: safeLayers, running: !!raf, x: current.x, y: current.y }; };
    });
  })();

  /* ---- ScrollReveal 滚动词显 · [data-sreveal="TEXT"] ---- */
  (function () {
    if (!window.gsap || !window.ScrollTrigger) return;
    document.querySelectorAll('[data-sreveal]').forEach(function (root) {
      const text = root.getAttribute('data-sreveal') || '';
      const baseOpacity = parseFloat(root.getAttribute('data-base-opacity'));
      const op = Number.isFinite(baseOpacity) ? baseOpacity : 0.1;
      const baseRotation = parseFloat(root.getAttribute('data-rotation')) || 3;
      const blurStrength = parseFloat(root.getAttribute('data-blur')) || 4;
      const enableBlur = root.getAttribute('data-blur') !== 'off';

      root.classList.add('srev-head');
      const p = document.createElement('p');
      p.className = 'srev-text';
      text.split(/(\s+)/).forEach(function (chunk) {
        if (/^\s+$/.test(chunk)) { p.appendChild(document.createTextNode(chunk)); return; }
        const w = document.createElement('span');
        w.className = 'srev-word';
        w.textContent = chunk;
        p.appendChild(w);
      });
      root.appendChild(p);

      gsap.fromTo(root,
        { transformOrigin: '0% 50%', rotate: baseRotation },
        { ease: 'none', rotate: 0, scrollTrigger: { trigger: root, start: 'top bottom', end: 'bottom bottom', scrub: true } });
      const words = root.querySelectorAll('.srev-word');
      gsap.fromTo(words,
        { opacity: op, willChange: 'opacity' },
        { ease: 'none', opacity: 1, stagger: 0.05, scrollTrigger: { trigger: root, start: 'top bottom-=20%', end: 'bottom bottom', scrub: true } });
      if (enableBlur) {
        gsap.fromTo(words,
          { filter: 'blur(' + blurStrength + 'px)' },
          { ease: 'none', filter: 'blur(0px)', stagger: 0.05, scrollTrigger: { trigger: root, start: 'top bottom-=20%', end: 'bottom bottom', scrub: true } });
      }
      root.__sreveal = function () { return { words: words.length }; };
    });
  })();

  /* ---- StrokeText 描边书写字 · [data-stroketext="TEXT"] ---- */
  (function () {
    if (!window.gsap || !window.ScrollTrigger) return;
    const NS = 'http://www.w3.org/2000/svg';
    let uid = 0;
    document.querySelectorAll('[data-stroketext]').forEach(function (root) {
      const text = String(root.getAttribute('data-stroketext') || 'Draw Attention');
      const characters = Array.from(text);
      const fontSize = parseFloat(root.getAttribute('data-fsize')) || 128;
      const fontWeight = parseInt(root.getAttribute('data-weight'), 10) || 800;
      const letterSpacing = parseFloat(root.getAttribute('data-tracking')) || -4;
      const strokeWidth = parseFloat(root.getAttribute('data-sw')) || 1.4;
      const drawDuration = parseFloat(root.getAttribute('data-draw')) || 1.6;
      const fillDelay = parseFloat(root.getAttribute('data-fill-delay'));
      const fillDelayV = Number.isFinite(fillDelay) ? fillDelay : 0.2;
      const stagger = parseFloat(root.getAttribute('data-stagger')) || 0.05;
      const ease = root.getAttribute('data-ease') || 'power2.out';
      const trigger = root.getAttribute('data-trigger') || 'mount';
      const fillMode = root.getAttribute('data-fill-mode') || 'wipe';
      const reverse = root.getAttribute('data-reverse') === 'true';
      const dash = Math.max(fontSize * 7, 200);
      const wipeId = 'stw-' + ++uid;

      root.classList.add('st-text');
      root.setAttribute('role', 'img');
      root.setAttribute('aria-label', text);
      root.style.setProperty('--stroke-text-height', Math.round(fontSize * 1.3) + 'px');

      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('class', 'st-svg');
      svg.setAttribute('viewBox', '0 ' + -fontSize + ' 600 ' + fontSize * 1.3);
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      svg.setAttribute('aria-hidden', 'true');
      const fontStyle = { fontSize: fontSize + 'px', fontWeight: fontWeight, letterSpacing: letterSpacing + 'px' };
      const applyFont = function (el) {
        el.setAttribute('font-size', fontStyle.fontSize);
        el.setAttribute('font-weight', String(fontStyle.fontWeight));
        el.setAttribute('letter-spacing', fontStyle.letterSpacing);
      };

      const strokeText = document.createElementNS(NS, 'text');
      strokeText.setAttribute('class', 'st-stroke');
      strokeText.setAttribute('x', '0');
      strokeText.setAttribute('y', '0');
      strokeText.setAttribute('fill', 'none');
      strokeText.setAttribute('stroke-width', strokeWidth);
      strokeText.setAttribute('stroke-linejoin', 'round');
      strokeText.setAttribute('stroke-linecap', 'round');
      applyFont(strokeText);
      characters.forEach(function (ch) {
        const ts = document.createElementNS(NS, 'tspan');
        ts.setAttribute('data-stroke-char', '');
        ts.textContent = ch;
        strokeText.appendChild(ts);
      });
      svg.appendChild(strokeText);

      const fillText = document.createElementNS(NS, 'text');
      fillText.setAttribute('class', 'st-fill');
      fillText.setAttribute('x', '0');
      fillText.setAttribute('y', '0');
      applyFont(fillText);
      characters.forEach(function (ch) {
        const ts = document.createElementNS(NS, 'tspan');
        ts.setAttribute('data-fill-char', '');
        ts.textContent = ch;
        fillText.appendChild(ts);
      });
      svg.appendChild(fillText);

      let wipeRect = null;
      if (fillMode === 'wipe') {
        const defs = document.createElementNS(NS, 'defs');
        const clip = document.createElementNS(NS, 'clipPath');
        clip.setAttribute('id', wipeId);
        clip.setAttribute('clipPathUnits', 'userSpaceOnUse');
        wipeRect = document.createElementNS(NS, 'rect');
        wipeRect.setAttribute('x', '-300');
        wipeRect.setAttribute('y', -fontSize);
        wipeRect.setAttribute('width', '0');
        wipeRect.setAttribute('height', fontSize * 1.3);
        clip.appendChild(wipeRect);
        defs.appendChild(clip);
        svg.appendChild(defs);
        fillText.setAttribute('clip-path', 'url(#' + wipeId + ')');
      }
      root.appendChild(svg);

      const measure = function () {
        let bbox;
        try { bbox = strokeText.getBBox(); } catch (err) { return null; void err; }
        if (!bbox || !bbox.width) return null;
        const pad = Math.max(strokeWidth || 1, fontSize * 0.1);
        return { x: bbox.x - pad, y: bbox.y - pad, width: bbox.width + pad * 2, height: bbox.height + pad * 2 };
      };

      const run = function () {
        const box = measure();
        if (!box) return;
        svg.setAttribute('viewBox', box.x + ' ' + box.y + ' ' + box.width + ' ' + box.height);
        if (wipeRect) {
          wipeRect.setAttribute('x', box.x);
          wipeRect.setAttribute('y', box.y);
          wipeRect.setAttribute('height', box.height);
        }
        const strokes = root.querySelectorAll('[data-stroke-char]');
        const fills = root.querySelectorAll('[data-fill-char]');
        const fillEnabled = fillMode !== 'none';
        const useWipe = fillEnabled && fillMode === 'wipe';
        const fillDuration = Math.max(0.4, drawDuration * 0.5);
        const staggerConfig = reverse ? { each: stagger, from: 'end' } : stagger;
        const targets = [].slice.call(strokes).concat([].slice.call(fills), wipeRect ? [wipeRect] : []);

        const setStart = function () {
          gsap.killTweensOf(targets);
          gsap.set(strokes, { strokeDasharray: dash, strokeDashoffset: dash });
          gsap.set(fills, { opacity: useWipe ? 1 : 0 });
          if (wipeRect) gsap.set(wipeRect, { attr: { width: 0 } });
        };
        const setEnd = function () {
          gsap.killTweensOf(targets);
          gsap.set(strokes, { strokeDasharray: dash, strokeDashoffset: 0 });
          gsap.set(fills, { opacity: fillEnabled ? 1 : 0 });
          if (wipeRect) gsap.set(wipeRect, { attr: { width: fillEnabled ? box.width : 0 } });
        };

        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setEnd(); return; }

        const build = function () {
          setStart();
          const tl = gsap.timeline({
            paused: true,
            repeat: trigger === 'loop' ? -1 : 0,
            repeatDelay: trigger === 'loop' ? 0.9 : 0,
            defaults: { overwrite: 'auto' }
          });
          tl.to(strokes, { strokeDashoffset: 0, duration: drawDuration, ease, stagger: staggerConfig }, 0);
          if (useWipe && wipeRect) {
            tl.to(wipeRect, { attr: { width: box.width }, duration: fillDuration, ease: 'power2.inOut' }, drawDuration + fillDelayV);
          } else if (fillEnabled) {
            tl.to(fills, { opacity: 1, duration: fillDuration, ease: 'power2.out', stagger: staggerConfig }, drawDuration + fillDelayV);
          }
          return tl;
        };

        let timeline = null;
        if (trigger === 'hover') {
          setEnd();
          root.addEventListener('pointerenter', function () {
            if (timeline) timeline.kill();
            timeline = build();
            timeline.play(0);
          });
        } else {
          timeline = build();
          if (trigger === 'scroll') {
            ScrollTrigger.create({ trigger: root, start: 'top 82%', once: true, onEnter: function () { if (timeline) timeline.play(0); } });
          } else {
            timeline.play(0);
          }
        }
        root.__stroketext = function () { return { chars: characters.length, box: box.width > 0 }; };
      };

      run();
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(run).catch(function () { void 0; });
    });
  })();

  /* ---- MaskedHeading 图像蒙版标题 · [data-maskhead="TEXT"] ---- */
  (function () {
    if (!window.gsap) return;
    const NS = 'http://www.w3.org/2000/svg';
    const clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
    let uid = 0;

    document.querySelectorAll('[data-maskhead]').forEach(function (root) {
      const words = String(root.getAttribute('data-maskhead') || '').split(/\s+/).filter(Boolean);
      const num = function (name, def) {
        const v = parseFloat(root.getAttribute(name));
        return Number.isFinite(v) ? v : def;
      };
      const fillScale = num('data-fill', 1.25);
      const parallax = num('data-parallax', 26);
      const drift = num('data-drift', 18);
      const brightness = num('data-bright', 1);
      const saturation = num('data-sat', 1);
      const grayscale = root.getAttribute('data-gray') === 'true';
      const reveal = root.getAttribute('data-reveal') || 'rise';
      const duration = num('data-duration', 1.1);
      const staggerV = num('data-stagger', 0.09);
      const trigger = root.getAttribute('data-trigger') || 'view';
      const textScale = num('data-scale', 0.115);

      if (!words.length) return;
      root.classList.add('mh-head');
      root.style.fontWeight = '700';
      root.style.letterSpacing = '-0.03em';
      root.style.lineHeight = '1.06';
      root.style.textAlign = root.getAttribute('data-align') || 'center';
      const clipId = 'mh-' + ++uid;

      const measure = document.createElement('span');
      measure.className = 'mh-measure';
      const wordEls = [];
      const baseEls = [];
      words.forEach(function (word) {
        const box = document.createElement('span');
        box.className = 'mh-word';
        box.textContent = word;
        const base = document.createElement('i');
        base.className = 'mh-base';
        box.appendChild(base);
        measure.appendChild(box);
        wordEls.push(box);
        baseEls.push(base);
      });
      root.appendChild(measure);

      const defsSvg = document.createElementNS(NS, 'svg');
      defsSvg.setAttribute('class', 'mh-defs');
      defsSvg.setAttribute('aria-hidden', 'true');
      const defs = document.createElementNS(NS, 'defs');
      const clip = document.createElementNS(NS, 'clipPath');
      clip.setAttribute('id', clipId);
      clip.setAttribute('clipPathUnits', 'userSpaceOnUse');
      const glyphEls = [];
      words.forEach(function (word) {
        const glyph = document.createElementNS(NS, 'text');
        glyph.textContent = word;
        clip.appendChild(glyph);
        glyphEls.push(glyph);
      });
      defs.appendChild(clip);
      defsSvg.appendChild(defs);
      root.appendChild(defsSvg);

      const revealEl = document.createElement('span');
      revealEl.className = 'mh-reveal';
      const clipEl = document.createElement('span');
      clipEl.className = 'mh-clip';
      clipEl.style.clipPath = 'url(#' + clipId + ')';
      const mediaEl = document.createElement('span');
      mediaEl.className = 'mh-media';
      const img = document.createElement('img');
      img.className = 'mh-source';
      img.alt = '';
      img.draggable = false;
      img.src = root.getAttribute('data-src') || '';
      mediaEl.appendChild(img);
      clipEl.appendChild(mediaEl);
      revealEl.appendChild(clipEl);
      root.appendChild(revealEl);

      const place = function () {
        const W = root.clientWidth;
        const H = root.clientHeight;
        const maxX = Math.max(0, ((fillScale - 1) / 2) * W);
        const maxY = Math.max(0, ((fillScale - 1) / 2) * H);
        mediaEl.style.transform = 'translate3d(' + clamp(off.x, -maxX, maxX).toFixed(2) + 'px, ' +
          clamp(off.y, -maxY, maxY).toFixed(2) + 'px, 0) scale(' + fillScale + ')';
        mediaEl.style.filter = 'brightness(' + brightness + ') saturate(' + saturation + ')' + (grayscale ? ' grayscale(1)' : '');
      };
      const offsetRef = { x: 0, y: 0, tx: 0, ty: 0 };
      const off = offsetRef;

      const sync = function () {
        root.style.fontSize = clamp(root.clientWidth * textScale, 20, 200).toFixed(1) + 'px';
        const cs = window.getComputedStyle(measure);
        for (let i = 0; i < words.length; i += 1) {
          const box = wordEls[i];
          const base = baseEls[i];
          const glyph = glyphEls[i];
          glyph.setAttribute('x', box.offsetLeft + '');
          glyph.setAttribute('y', base.offsetTop + '');
          glyph.style.fontFamily = cs.fontFamily;
          glyph.style.fontSize = cs.fontSize;
          glyph.style.fontWeight = cs.fontWeight;
          glyph.style.fontStyle = cs.fontStyle;
          glyph.style.letterSpacing = cs.letterSpacing;
        }
        place();
      };

      sync();
      const ro = new ResizeObserver(sync);
      ro.observe(root);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(sync).catch(function () { void 0; });

      let raf = 0;
      let inView = false;
      let last = performance.now();
      let clock = 0;
      const frame = function (now) {
        if (document.hidden || !inView) { raf = 0; return; }
        raf = requestAnimationFrame(frame);
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        clock += dt;
        const dx = Math.sin(clock * 0.21) * drift;
        const dy = Math.cos(clock * 0.17) * drift * 0.6;
        const ease = 1 - Math.exp(-dt / 0.18);
        off.x += (off.tx + dx - off.x) * ease;
        off.y += (off.ty + dy - off.y) * ease;
        place();
      };
      const start = function () {
        if (!raf && !document.hidden && inView) { last = performance.now(); raf = requestAnimationFrame(frame); }
      };
      const io = new IntersectionObserver(function (es) {
        es.forEach(function (en) {
          inView = en.isIntersecting;
          if (inView) start();
          else if (raf) { cancelAnimationFrame(raf); raf = 0; }
        });
      }, { rootMargin: '120px' });
      io.observe(root);
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) { if (raf) { cancelAnimationFrame(raf); raf = 0; } } else start();
      });

      const onMove = function (e) {
        if (parallax <= 0) return;
        const r = root.getBoundingClientRect();
        const nx = ((e.clientX - r.left) / (r.width || 1)) * 2 - 1;
        const ny = ((e.clientY - r.top) / (r.height || 1)) * 2 - 1;
        off.tx = clamp(nx, -1, 1) * -parallax;
        off.ty = clamp(ny, -1, 1) * -parallax;
      };
      const onLeave = function () { off.tx = 0; off.ty = 0; };
      root.addEventListener('pointermove', onMove);
      root.addEventListener('pointerleave', onLeave);

      if (window.ScrollTrigger) ScrollTrigger.addEventListener && ScrollTrigger.addEventListener('refresh', sync);

      const riseDistance = function () { return (parseFloat(window.getComputedStyle(root).fontSize) || 48) * 1.15; };
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const settle = function () {
        gsap.set(glyphEls, { y: 0 });
        gsap.set(revealEl, { opacity: 1, scale: 1, clipPath: 'inset(0% 0% 0% 0%)' });
      };
      const play = function () {
        if (reveal === 'rise') {
          gsap.set(revealEl, { opacity: 1, scale: 1, clipPath: 'inset(0% 0% 0% 0%)' });
          gsap.fromTo(glyphEls, { y: riseDistance() }, { y: 0, duration, stagger: staggerV, ease: 'power4.out', overwrite: 'auto' });
        } else if (reveal === 'wipe') {
          gsap.set(glyphEls, { y: 0 });
          const state = { p: 100 };
          gsap.to(state, {
            p: 0, duration, ease: 'power3.inOut', overwrite: 'auto',
            onUpdate: function () { revealEl.style.clipPath = 'inset(0% ' + state.p + '% 0% 0%)'; }
          });
        } else {
          gsap.set(glyphEls, { y: 0 });
          gsap.fromTo(revealEl, { opacity: 0, scale: 1.08 }, { opacity: 1, scale: 1, duration, ease: 'power3.out', overwrite: 'auto' });
        }
      };
      if (reveal === 'none' || reduce) {
        settle();
      } else if (trigger === 'hover') {
        settle();
        root.addEventListener('pointerenter', play);
      } else if (trigger === 'mount') {
        play();
      } else {
        settle();
        if (reveal === 'rise') gsap.set(glyphEls, { y: riseDistance() });
        else if (reveal === 'wipe') gsap.set(revealEl, { clipPath: 'inset(0% 100% 0% 0%)' });
        else gsap.set(revealEl, { opacity: 0, scale: 1.08 });
        const io2 = new IntersectionObserver(function (es) {
          if (es.some(function (e) { return e.isIntersecting; })) { play(); io2.disconnect(); }
        }, { threshold: 0.25 });
        io2.observe(root);
      }
      root.__maskhead = function () { return { words: words.length, fontSize: root.style.fontSize, glyphX: glyphEls[0].getAttribute('x') }; };
    });
  })();

  /* ---- ParticleText 粒子聚字 · [data-particle="TEXT"] ---- */
  (function () {
    const hexToRgb = function (hex) {
      const clean = String(hex).replace('#', '').trim();
      if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
      return { r: parseInt(clean.slice(0, 2), 16), g: parseInt(clean.slice(2, 4), 16), b: parseInt(clean.slice(4, 6), 16) };
    };
    const mixRgb = function (from, to, amount) {
      return {
        r: Math.round(from.r + (to.r - from.r) * amount),
        g: Math.round(from.g + (to.g - from.g) * amount),
        b: Math.round(from.b + (to.b - from.b) * amount)
      };
    };
    const rgbToCss = function (rgb) { return 'rgb(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ')'; };
    const clamp = function (v, a, b) { return Math.min(Math.max(v, a), b); };
    const easeOutCubic = function (t) { return 1 - Math.pow(1 - t, 3); };

    document.querySelectorAll('[data-particle]').forEach(function (container) {
      const num = function (name, def) {
        const v = parseFloat(container.getAttribute(name));
        return Number.isFinite(v) ? v : def;
      };
      const text = container.getAttribute('data-particle') || 'React Bits';
      const particleSize = num('data-psize', 2);
      const density = num('data-density', 4);
      const scatter = num('data-scatter', 180);
      const gatherDuration = num('data-gather', 1600);
      const staggerMs = num('data-stagger', 420);
      const pointerRepel = num('data-repel', 40);
      const repelRadius = num('data-repel-radius', 120);
      const idleDrift = num('data-idle', 0.7);
      const trigger = container.getAttribute('data-trigger') || 'mount';
      const fontSizeCss = container.getAttribute('data-size') || 'clamp(3rem, 12vw, 8rem)';
      const fontWeight = container.getAttribute('data-weight') || '800';
      const glow = container.getAttribute('data-glow') !== 'false';

      container.classList.add('pt-text');
      const canvas = document.createElement('canvas');
      canvas.className = 'pt-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      container.appendChild(canvas);
      const sr = document.createElement('span');
      sr.className = 'pt-sr';
      sr.textContent = text;
      container.appendChild(sr);

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      let particles = [];
      let animationFrame = null;
      let resizeFrame = null;
      let buildId = 0;
      let gathering = false;
      let gatherStart = 0;
      let reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      let width = 0;
      let height = 0;
      let dpr = 1;
      let inView = false;
      let seen = false;

      const pointer = { active: false, x: 0, y: 0, smoothX: 0, smoothY: 0 };

      const themeColors = function () {
        const light = document.documentElement.getAttribute('data-theme') === 'light';
        const color = container.getAttribute(light ? 'data-color-light' : 'data-color') ||
          container.getAttribute('data-color') || '#ffffff';
        const highlight = container.getAttribute(light ? 'data-highlight-light' : 'data-highlight') ||
          container.getAttribute('data-highlight') || '#8b5cf6';
        return { color, highlight };
      };

      const startGather = function (fromScatter) {
        if (!particles.length) return;
        const now = performance.now();
        const spread = reducedMotion ? 0 : scatter;
        particles.forEach(function (p) {
          if (fromScatter) {
            const angle = p.seed * Math.PI * 2;
            const distance = spread * (0.35 + p.depth * 0.75);
            p.x = p.targetX + Math.cos(angle) * distance + (p.depth - 0.5) * spread * 0.55;
            p.y = p.targetY + Math.sin(angle) * distance + (p.seed - 0.5) * spread * 0.55;
          }
          p.startX = p.x;
          p.startY = p.y;
          p.delay = reducedMotion ? 0 : p.seed * staggerMs;
        });
        gatherStart = now;
        gathering = true;
      };

      const drawParticle = function (p) {
        const size = p.size;
        ctx.fillStyle = p.color;
        if (size <= 2.1) {
          ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
          return;
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, size / 2, 0, Math.PI * 2);
        ctx.fill();
      };

      const render = function (now) {
        ctx.clearRect(0, 0, width, height);
        const tc = themeColors();
        if (glow && !reducedMotion) {
          ctx.shadowBlur = particleSize * 3;
          ctx.shadowColor = tc.highlight;
        } else {
          ctx.shadowBlur = 0;
        }
        pointer.smoothX += (pointer.x - pointer.smoothX) * 0.18;
        pointer.smoothY += (pointer.y - pointer.smoothY) * 0.18;
        let complete = true;
        particles.forEach(function (p) {
          let baseX = p.targetX;
          let baseY = p.targetY;
          let progress = 1;
          if (gathering) {
            const local = (now - gatherStart - p.delay) / Math.max(1, reducedMotion ? 1 : gatherDuration);
            progress = clamp(local, 0, 1);
            const eased = easeOutCubic(progress);
            baseX = p.startX + (p.targetX - p.startX) * eased;
            baseY = p.startY + (p.targetY - p.startY) * eased;
            if (progress < 1) complete = false;
          } else if (!reducedMotion && idleDrift > 0) {
            const driftTime = now * 0.001;
            baseX += Math.sin(driftTime * 0.9 + p.seed * 10) * idleDrift * p.depth;
            baseY += Math.cos(driftTime * 0.75 + p.depth * 10) * idleDrift * p.depth;
          }
          if (pointer.active && !reducedMotion && pointerRepel > 0 && repelRadius > 0) {
            const dx = baseX - pointer.smoothX;
            const dy = baseY - pointer.smoothY;
            const distance = Math.hypot(dx, dy);
            if (distance > 0 && distance < repelRadius) {
              const force = Math.pow(1 - distance / repelRadius, 2) * pointerRepel;
              baseX += (dx / distance) * force;
              baseY += (dy / distance) * force;
            }
          }
          const follow = reducedMotion ? 1 : 0.22;
          p.x += (baseX - p.x) * follow;
          p.y += (baseY - p.y) * follow;
          ctx.globalAlpha = clamp(0.35 + progress * 0.65, 0, 1);
          drawParticle(p);
        });
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
        if (gathering && complete) gathering = false;
        if (document.hidden || !inView) { animationFrame = null; return; }
        animationFrame = window.requestAnimationFrame(render);
      };

      const ensureRenderLoop = function () {
        if (animationFrame === null && !document.hidden && inView) {
          animationFrame = window.requestAnimationFrame(render);
        }
      };

      const resolveFontSize = function (value) {
        if (typeof value === 'number') return value;
        const probe = document.createElement('span');
        probe.textContent = 'M';
        probe.style.position = 'absolute';
        probe.style.visibility = 'hidden';
        probe.style.pointerEvents = 'none';
        probe.style.fontSize = value;
        probe.style.fontWeight = String(fontWeight);
        container.appendChild(probe);
        const size = parseFloat(window.getComputedStyle(probe).fontSize) || 96;
        probe.remove();
        return size;
      };

      const sampleText = async function () {
        const currentBuild = ++buildId;
        const rect = container.getBoundingClientRect();
        width = Math.floor(rect.width);
        height = Math.floor(rect.height);
        if (width <= 0 || height <= 0) return;
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.max(1, Math.floor(width * dpr));
        canvas.height = Math.max(1, Math.floor(height * dpr));
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const computed = window.getComputedStyle(container);
        const resolvedFamily = computed.fontFamily || 'sans-serif';
        const tc = themeColors();
        let resolvedSize = resolveFontSize(fontSizeCss);
        let font = fontWeight + ' ' + resolvedSize + 'px ' + resolvedFamily;
        if (document.fonts) {
          try { await document.fonts.load(font); } catch (err) { void err; }
          try { await document.fonts.ready; } catch (err) { void err; }
        }
        if (currentBuild !== buildId) return;

        const offscreen = document.createElement('canvas');
        const offCtx = offscreen.getContext('2d', { willReadFrequently: true });
        if (!offCtx) return;
        const content = String(text || ' ');
        const maxTextWidth = width * 0.92;
        offCtx.font = font;
        let metrics = offCtx.measureText(content);
        const measuredWidth = Math.max(1, metrics.width);
        if (measuredWidth > maxTextWidth) {
          resolvedSize = Math.max(18, resolvedSize * (maxTextWidth / measuredWidth));
          font = fontWeight + ' ' + resolvedSize + 'px ' + resolvedFamily;
          offCtx.font = font;
          metrics = offCtx.measureText(content);
        }
        const left = Math.ceil(metrics.actualBoundingBoxLeft || 0);
        const right = Math.ceil(metrics.actualBoundingBoxRight || metrics.width);
        const ascent = Math.ceil(metrics.actualBoundingBoxAscent || resolvedSize * 0.78);
        const descent = Math.ceil(metrics.actualBoundingBoxDescent || resolvedSize * 0.22);
        const padding = Math.max(12, Math.ceil(resolvedSize * 0.08));
        const textWidth = Math.max(1, left + right);
        const textHeight = Math.max(1, ascent + descent);
        offscreen.width = textWidth + padding * 2;
        offscreen.height = textHeight + padding * 2;
        offCtx.clearRect(0, 0, offscreen.width, offscreen.height);
        offCtx.font = font;
        offCtx.textAlign = 'left';
        offCtx.textBaseline = 'alphabetic';
        offCtx.fillStyle = '#ffffff';
        offCtx.fillText(content, padding - left, padding + ascent);

        const imageData = offCtx.getImageData(0, 0, offscreen.width, offscreen.height);
        const targets = [];
        const step = Math.max(2, Math.floor(density));
        for (let y = 0; y < offscreen.height; y += step) {
          for (let x = 0; x < offscreen.width; x += step) {
            const alpha = imageData.data[(y * offscreen.width + x) * 4 + 3];
            if (alpha > 40) {
              targets.push({
                x: width / 2 - offscreen.width / 2 + x,
                y: height / 2 - offscreen.height / 2 + y,
                alpha: alpha / 255
              });
            }
          }
        }
        const maxParticles = Math.max(900, Math.min(5200, Math.floor((width * height) / 90)));
        const stride = Math.max(1, Math.ceil(targets.length / maxParticles));
        const baseRgb = hexToRgb(tc.color);
        const highlightRgb = hexToRgb(tc.highlight);
        const selected = targets.filter(function (_, index) { return index % stride === 0; });
        particles = selected.map(function (target, index) {
          const seed = ((index * 9301 + 49297) % 233280) / 233280;
          const depth = 0.45 + (((index * 233 + 97) % 1000) / 1000) * 0.9;
          const blend = baseRgb && highlightRgb ? clamp(target.x / Math.max(1, width) + (seed - 0.5) * 0.35, 0, 1) : 0;
          const particleColor = baseRgb && highlightRgb ? rgbToCss(mixRgb(baseRgb, highlightRgb, blend)) : tc.color;
          const angle = seed * Math.PI * 2;
          const distance = (reducedMotion ? 0 : scatter) * (0.35 + depth * 0.75);
          const startX = target.x + Math.cos(angle) * distance + (seed - 0.5) * scatter * 0.45;
          const startY = target.y + Math.sin(angle) * distance + (depth - 0.9) * scatter * 0.45;
          return {
            x: reducedMotion ? target.x : startX,
            y: reducedMotion ? target.y : startY,
            startX, startY,
            targetX: target.x,
            targetY: target.y,
            size: Math.max(0.6, particleSize * (0.75 + target.alpha * 0.45)),
            color: particleColor,
            seed, depth,
            delay: seed * staggerMs
          };
        });
        pointer.x = width / 2;
        pointer.y = height / 2;
        pointer.smoothX = pointer.x;
        pointer.smoothY = pointer.y;
        if (reducedMotion) {
          particles.forEach(function (p) {
            p.x = p.targetX; p.y = p.targetY;
            p.startX = p.targetX; p.startY = p.targetY;
            p.delay = 0;
          });
          gathering = false;
        } else {
          startGather(false);
        }
        ensureRenderLoop();
      };

      const queueSample = function () {
        if (!seen) return;
        if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
        resizeFrame = window.requestAnimationFrame(sampleText);
      };

      const onPointerMove = function (event) {
        const r = canvas.getBoundingClientRect();
        pointer.x = event.clientX - r.left;
        pointer.y = event.clientY - r.top;
        pointer.active = true;
      };
      canvas.addEventListener('pointerenter', function (e) {
        onPointerMove(e);
        if (trigger === 'hover') startGather(true);
      });
      canvas.addEventListener('pointermove', onPointerMove);
      canvas.addEventListener('pointerleave', function () { pointer.active = false; });
      canvas.addEventListener('click', function () { if (trigger === 'click') startGather(true); });

      const resizeObserver = new ResizeObserver(queueSample);
      resizeObserver.observe(container);

      const io = new IntersectionObserver(function (es) {
        es.forEach(function (en) {
          inView = en.isIntersecting;
          if (inView && !seen) { seen = true; sampleText(); }
          ensureRenderLoop();
        });
      }, { rootMargin: '160px' });
      io.observe(container);
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) {
          if (animationFrame !== null) { window.cancelAnimationFrame(animationFrame); animationFrame = null; }
        } else ensureRenderLoop();
      });
      if (window.MutationObserver) {
        new MutationObserver(function () { if (seen) queueSample(); })
          .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      }
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      if (mq.addEventListener) mq.addEventListener('change', function (e) { reducedMotion = e.matches; sampleText(); });
      container.__particletext = function () { return { particles: particles.length, gathering, seen }; };
    });
  })();

  /* ---- WarpText 折射扭曲字 · [data-warptext="TEXT"] — ogl→three 等价移植 ---- */
  (function () {
    const T = window.THREE;
    if (!T) return;

    const VERT = 'out vec2 vUv;\nvoid main() {\n  vUv = uv;\n  gl_Position = vec4(position.xy, 0.0, 1.0);\n}\n';
    const FRAG = `precision highp float;

uniform sampler2D uTextTexture;
uniform vec2 uResolution;
uniform vec2 uPointer;
uniform float uPointerActive;
uniform float uTime;
uniform float uWarpStrength;
uniform float uWarpScale;
uniform float uSpeed;
uniform float uPointerInfluence;
uniform float uPointerStrength;
uniform float uRefraction;
uniform float uRipple;
uniform float uMotion;

in vec2 vUv;
out vec4 fragColor;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    value += amplitude * noise(p);
    p *= 2.02;
    amplitude *= 0.5;
  }
  return value;
}

vec4 sampleText(vec2 uv) {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    return vec4(0.0);
  }
  return texture(uTextTexture, uv);
}

void main() {
  vec2 uv = vUv;
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  float time = uTime * uSpeed;
  float scale = max(uWarpScale, 0.001);

  vec2 drift = vec2(time * 0.055, -time * 0.045);
  float n1 = fbm(uv * scale * 3.1 + drift);
  float n2 = fbm((uv + 19.17) * scale * 3.4 - drift.yx);
  vec2 ambient = (vec2(n1, n2) - 0.5) * uWarpStrength * 0.045 * uMotion;

  vec2 pointerDelta = uv - uPointer;
  vec2 aspectDelta = vec2(pointerDelta.x * aspect, pointerDelta.y);
  float dist = length(aspectDelta);
  float radius = max(uPointerInfluence, 0.001);
  float t = clamp(dist / radius, 0.0, 1.0);
  float lens = smoothstep(radius, 0.0, dist) * uPointerActive;
  float bulge = t * (1.0 - t) * (1.0 - t) * 6.75 * uPointerActive;
  vec2 dir = dist > 0.0001 ? vec2(aspectDelta.x / aspect, aspectDelta.y) / dist : vec2(0.0);

  float rippleWave = sin(dist * 28.0 - time * 4.2) * 0.5 + 0.5;
  float rippleRing = (rippleWave - 0.5) * uRipple;
  vec2 pointerWarp = -dir * bulge * uPointerStrength * 0.045;
  pointerWarp += dir * rippleRing * bulge * uPointerStrength * 0.016;

  vec2 displaced = uv + ambient + pointerWarp;
  vec2 splitDir = ambient + pointerWarp;
  float splitLen = length(splitDir);
  splitDir = splitLen > 0.00001 ? splitDir / splitLen : vec2(0.7071, 0.7071);
  vec2 split = splitDir * uRefraction * 0.16 * (0.35 + lens * 1.65);

  vec4 base = sampleText(displaced);
  float r = sampleText(displaced + split).r;
  float g = base.g;
  float b = sampleText(displaced - split).b;
  float a = max(max(sampleText(displaced + split).a, base.a), sampleText(displaced - split).a);

  vec3 color = vec3(r, g, b) + lens * base.a * 0.055;
  fragColor = vec4(color, a);
}
`;
    const getFontValue = function (value) { return typeof value === 'number' ? value + 'px' : value; };
    const measureLine = function (ctx, line, letterSpacing) {
      const chars = Array.from(line);
      const textWidth = chars.reduce(function (w, ch) { return w + ctx.measureText(ch).width; }, 0);
      return textWidth + Math.max(0, chars.length - 1) * letterSpacing;
    };
    const drawLine = function (ctx, line, x, y, letterSpacing) {
      const chars = Array.from(line);
      let cursor = x - measureLine(ctx, line, letterSpacing) / 2;
      chars.forEach(function (ch, index) {
        ctx.fillText(ch, cursor, y);
        cursor += ctx.measureText(ch).width + (index === chars.length - 1 ? 0 : letterSpacing);
      });
    };

    document.querySelectorAll('[data-warptext]').forEach(function (container) {
      const num = function (name, def) {
        const v = parseFloat(container.getAttribute(name));
        return Number.isFinite(v) ? v : def;
      };
      const propsRef = {
        text: container.getAttribute('data-warptext') || 'Bend the moment',
        fontSize: container.getAttribute('data-size') || 'clamp(3rem, 10vw, 9rem)',
        fontWeight: container.getAttribute('data-weight') || '800',
        letterSpacing: container.getAttribute('data-tracking') || '-0.06em',
        lineHeight: num('data-lh', 0.9),
        warpStrength: num('data-warp', 0.08),
        warpScale: num('data-wscale', 1.7),
        speed: num('data-speed', 0.55),
        pointerInfluence: num('data-influence', 0.42),
        pointerStrength: num('data-pstrength', 0.38),
        refraction: num('data-refraction', 0.018),
        ripple: container.getAttribute('data-ripple') === 'false' ? 0 : 1
      };

      container.classList.add('wt-text');
      container.setAttribute('role', 'img');
      container.setAttribute('aria-label', propsRef.text);

      const canvas = document.createElement('canvas');
      canvas.style.position = 'absolute';
      canvas.style.inset = '0';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      canvas.setAttribute('aria-hidden', 'true');
      container.appendChild(canvas);

      let renderer;
      try {
        renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: false });
      } catch (err) { void err; return; }
      renderer.setClearColor(0x000000, 0);

      const scene = new T.Scene();
      const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const texture = new T.Texture();
      texture.generateMipmaps = false;
      texture.minFilter = T.LinearFilter;
      texture.magFilter = T.LinearFilter;
      texture.wrapS = T.ClampToEdgeWrapping;
      texture.wrapT = T.ClampToEdgeWrapping;

      const uniforms = {
        uTextTexture: { value: texture },
        uResolution: { value: new T.Vector2(1, 1) },
        uPointer: { value: new T.Vector2(0.5, 0.5) },
        uPointerActive: { value: 0 },
        uTime: { value: 0 },
        uWarpStrength: { value: propsRef.warpStrength },
        uWarpScale: { value: propsRef.warpScale },
        uSpeed: { value: propsRef.speed },
        uPointerInfluence: { value: propsRef.pointerInfluence },
        uPointerStrength: { value: propsRef.pointerStrength },
        uRefraction: { value: propsRef.refraction },
        uRipple: { value: propsRef.ripple },
        uMotion: { value: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1 }
      };
      const material = new T.ShaderMaterial({
        glslVersion: T.GLSL3,
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms,
        transparent: true,
        depthTest: false,
        depthWrite: false
      });
      const mesh = new T.Mesh(new T.PlaneGeometry(2, 2), material);
      mesh.frustumCulled = false;
      scene.add(mesh);

      let disposed = false;
      let contextLost = false;
      let visible = false;
      let pageVisible = !document.hidden;
      let reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      let rasterVersion = 0;
      let raf = 0;
      const pointer = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, active: 0, activeTarget: 0 };
      const startTime = performance.now();

      const buildTextCanvas = function (w, h, dp) {
        const tc = document.createElement('canvas');
        tc.width = Math.max(1, Math.floor(w * dp));
        tc.height = Math.max(1, Math.floor(h * dp));
        const ctx = tc.getContext('2d');
        if (!ctx) return tc;
        const light = document.documentElement.getAttribute('data-theme') === 'light';
        const color = container.getAttribute(light ? 'data-color-light' : 'data-color') ||
          container.getAttribute('data-color') || '#f8f5ff';

        const probe = document.createElement('span');
        probe.textContent = propsRef.text;
        Object.assign(probe.style, {
          position: 'absolute',
          visibility: 'hidden',
          pointerEvents: 'none',
          whiteSpace: 'pre',
          inset: '0 auto auto 0',
          fontFamily: 'inherit',
          fontSize: getFontValue(propsRef.fontSize),
          fontWeight: String(propsRef.fontWeight),
          letterSpacing: getFontValue(propsRef.letterSpacing),
          lineHeight: String(propsRef.lineHeight)
        });
        container.appendChild(probe);
        const computed = window.getComputedStyle(probe);
        let fontSizePx = parseFloat(computed.fontSize) || 96;
        const fontFamily = computed.fontFamily || 'sans-serif';
        const fontWeightV = computed.fontWeight || String(propsRef.fontWeight);
        let letterSpacing = computed.letterSpacing === 'normal' ? 0 : parseFloat(computed.letterSpacing) || 0;
        let lineHeight = parseFloat(computed.lineHeight);
        if (!Number.isFinite(lineHeight)) lineHeight = fontSizePx * propsRef.lineHeight;
        probe.remove();

        ctx.setTransform(dp, 0, 0, dp, 0, 0);
        ctx.clearRect(0, 0, w, h);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = color;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        const lines = String(propsRef.text || '').split('\n');
        const applyFont = function () { ctx.font = fontWeightV + ' ' + fontSizePx + 'px ' + fontFamily; };
        applyFont();
        const maxWidth = w * 0.86;
        const maxHeight = h * 0.78;
        const widest = Math.max.apply(null, lines.map(function (ln) { return measureLine(ctx, ln, letterSpacing); }).concat([1]));
        const blockHeight = Math.max(lineHeight * lines.length, 1);
        const fit = Math.min(1, maxWidth / widest, maxHeight / blockHeight);
        if (fit < 1) {
          fontSizePx *= fit;
          letterSpacing *= fit;
          lineHeight *= fit;
          applyFont();
        }
        const startY = h / 2 - (lineHeight * (lines.length - 1)) / 2;
        lines.forEach(function (ln, index) { drawLine(ctx, ln, w / 2, startY + index * lineHeight, letterSpacing); });
        return tc;
      };

      const renderOnce = function () {
        if (disposed || contextLost) return;
        renderer.render(scene, camera);
      };

      const rasterize = async function () {
        const version = ++rasterVersion;
        if (document.fonts && document.fonts.ready) {
          try { await document.fonts.ready; } catch (err) { void err; }
        }
        if (disposed || contextLost || version !== rasterVersion) return;
        const rect = container.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        const dp = Math.min(window.devicePixelRatio || 1, 2);
        texture.image = buildTextCanvas(rect.width, rect.height, dp);
        texture.needsUpdate = true;
        renderOnce();
      };

      const resize = function () {
        if (disposed || contextLost) return;
        const rect = container.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(rect.width, rect.height, false);
        uniforms.uResolution.value.set(canvas.width, canvas.height);
        rasterize();
      };

      const onPointerMove = function (event) {
        if (event.pointerType === 'touch') return;
        const rect = canvas.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        pointer.tx = (event.clientX - rect.left) / rect.width;
        pointer.ty = 1 - (event.clientY - rect.top) / rect.height;
        pointer.activeTarget = 1;
      };
      canvas.addEventListener('pointermove', onPointerMove);
      canvas.addEventListener('pointerleave', function () { pointer.activeTarget = 0; });
      canvas.addEventListener('webglcontextlost', function (event) {
        event.preventDefault();
        contextLost = true;
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
      }, false);

      const loop = function (now) {
        if (disposed || contextLost || document.hidden || !visible) { raf = 0; return; }
        raf = requestAnimationFrame(loop);
        const elapsed = (now - startTime) * 0.001;
        const idleX = 0.5 + Math.sin(elapsed * 0.33) * 0.12;
        const idleY = 0.5 + Math.cos(elapsed * 0.27) * 0.1;
        const targetX = pointer.activeTarget > 0 ? pointer.tx : idleX;
        const targetY = pointer.activeTarget > 0 ? pointer.ty : idleY;
        const damping = pointer.activeTarget > 0 ? 0.12 : 0.035;
        pointer.x += (targetX - pointer.x) * damping;
        pointer.y += (targetY - pointer.y) * damping;
        pointer.active += ((pointer.activeTarget > 0 ? 1 : 0.18) - pointer.active) * 0.06;
        uniforms.uPointer.value.set(pointer.x, pointer.y);
        uniforms.uPointerActive.value = reduceMotion ? pointer.active * 0.35 : pointer.active;
        uniforms.uTime.value = reduceMotion ? 0 : elapsed;
        renderOnce();
      };

      const resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(container);
      const io = new IntersectionObserver(function (es) {
        es.forEach(function (en) {
          visible = en.isIntersecting;
          if (visible && pageVisible && !raf && !contextLost) raf = requestAnimationFrame(loop);
          if (!visible && raf) { cancelAnimationFrame(raf); raf = 0; }
        });
      }, { threshold: 0 });
      io.observe(container);
      document.addEventListener('visibilitychange', function () {
        pageVisible = !document.hidden;
        if (pageVisible && visible && !raf && !contextLost) raf = requestAnimationFrame(loop);
        if (!pageVisible && raf) { cancelAnimationFrame(raf); raf = 0; }
      });
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      if (mq.addEventListener) {
        mq.addEventListener('change', function (e) {
          reduceMotion = e.matches;
          uniforms.uMotion.value = reduceMotion ? 0 : 1;
          renderOnce();
        });
      }
      if (window.MutationObserver) {
        new MutationObserver(function () { rasterize(); })
          .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      }
      resize();
      container.__warptext = function () { return { running: !!raf, t: uniforms.uTime.value }; };
    });
  })();

  /* ============ v103 · React Bits 第十一批 (Backgrounds) ============ */

  /* ---- CRTWarp CRT 等离子屏 · [data-crtwarp] — three GLSL1 全屏平面 ---- */
  (function () {
    const T = window.THREE;
    if (!T) return;

    const VERT = 'varying vec2 vUv;\nvoid main() {\n  vUv = uv;\n  gl_Position = vec4(position, 1.0);\n}\n';
    const FRAG = `precision highp float;

varying vec2 vUv;
uniform vec2 uResolution;
uniform float uTime;
uniform vec3 uColor;
uniform vec3 uBackgroundColor;
uniform float uCurvature;
uniform float uScanlineStrength;
uniform float uScanlineFrequency;
uniform float uWaveAmplitude;
uniform float uWaveFrequency;
uniform float uBloom;
uniform float uBloomRadius;
uniform float uNoise;
uniform float uVignette;
uniform float uBrightness;
uniform float uPixelation;
uniform float uRgbShift;
uniform vec2 uPointer;
uniform float uMouseStrength;
uniform float uMouseReact;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec2 crtCurve(vec2 uv, float radius) {
  vec2 p = (uv - 0.5) * 2.0;
  float safeRadius = max(radius, 1.415);
  float cornerScale = safeRadius / sqrt(max(safeRadius * safeRadius - 2.0, 0.001));
  p = safeRadius * p / sqrt(max(safeRadius * safeRadius - dot(p, p), 0.001));
  p /= cornerScale;
  return p * 0.5 + 0.5;
}

float referencePlasma(vec2 uv, float t) {
  float frequencyScale = max(uWaveFrequency / 2.2, 0.001);
  uv = (uv - 0.5) * frequencyScale + 0.5;

  float scanline = 0.5 - 0.5 * cos(uv.y * 3.14159265 * uScanlineFrequency);
  scanline = mix(1.0, scanline, uScanlineStrength);

  uv *= vec2(80.0, 24.0);
  uv = ceil(uv);
  uv /= vec2(80.0, 24.0);

  float amplitude = uWaveAmplitude / 0.28;
  float field = 0.0;
  field += 0.7 * sin(0.5 * uv.x + t / 5.0);
  field += 3.0 * sin(1.6 * uv.y + t / 5.0);
  field += sin(10.0 * (uv.y * sin(t / 2.0) + uv.x * cos(t / 5.0)) + t / 2.0);

  float cx = uv.x + 0.5 * sin(t / 2.0);
  float cy = uv.y + 0.5 * cos(t / 4.0);
  field += 0.4 * sin(sqrt(100.0 * cx * cx + 100.0 * cy * cy + 1.0) + t);
  field += 0.9 * sin(sqrt(75.0 * cx * cx + 25.0 * cy * cy + 1.0) + t);
  field -= 1.4 * sin(sqrt(256.0 * cx * cx + 25.0 * cy * cy + 1.0) + t);
  field += 0.3 * sin(0.5 * uv.y + uv.x + sin(t));

  return scanline * floor(3.0 * (0.5 + 0.499 * sin(field * amplitude))) / 3.0;
}

void main() {
  vec2 uv = vUv;
  if (uPixelation > 1.001) {
    vec2 cells = max(uResolution / uPixelation, vec2(1.0));
    uv = (floor(uv * cells) + 0.5) / cells;
  }

  float curveRadius = 1.1 + 0.42 / max(uCurvature, 0.001);
  if (uMouseReact > 0.5) {
    curveRadius *= exp(-uPointer.y * uMouseStrength * 0.4);
  }
  vec2 curvedUv = crtCurve(uv, curveRadius);
  if (uMouseReact > 0.5) {
    curvedUv.x -= uPointer.x * uMouseStrength * 0.035;
  }

  float signal = referencePlasma(curvedUv, uTime);
  float radius = 0.01 * uBloomRadius;
  float glow = signal * 0.2;
  glow += referencePlasma(curvedUv + vec2(radius, 0.0), uTime) * 0.12;
  glow += referencePlasma(curvedUv - vec2(radius, 0.0), uTime) * 0.12;
  glow += referencePlasma(curvedUv + vec2(0.0, radius), uTime) * 0.12;
  glow += referencePlasma(curvedUv - vec2(0.0, radius), uTime) * 0.12;
  glow += referencePlasma(curvedUv + vec2(radius), uTime) * 0.08;
  glow += referencePlasma(curvedUv - vec2(radius), uTime) * 0.08;
  glow += referencePlasma(curvedUv + vec2(radius, -radius), uTime) * 0.08;
  glow += referencePlasma(curvedUv + vec2(-radius, radius), uTime) * 0.08;

  float redSignal = referencePlasma(curvedUv + vec2(uRgbShift, 0.0), uTime);
  float blueSignal = referencePlasma(curvedUv - vec2(uRgbShift, 0.0), uTime);
  vec3 channelSignal = vec3(redSignal, signal, blueSignal);
  vec3 waveColor = uColor * (0.3 + signal * 0.7 + glow * uBloom * 0.65);
  waveColor += (channelSignal - signal) * 0.42;

  float edge = clamp(1.0 - dot(vUv - 0.5, vUv - 0.5) * 2.0, 0.0, 1.0);
  float edgeFade = mix(1.0, smoothstep(0.0, 1.0, edge), uVignette);
  float waveMask = clamp(signal * 0.82 + glow * 0.52, 0.0, 1.0) * edgeFade;

  float grain = hash21(gl_FragCoord.xy + vec2(fract(uTime) * 173.0));
  waveColor = max(waveColor * uBrightness, vec3(0.0));
  vec3 color = mix(uBackgroundColor, waveColor, waveMask);
  color += (grain - 0.5) * uNoise;
  gl_FragColor = vec4(max(color, vec3(0.0)), 1.0);
}
`;

    document.querySelectorAll('[data-crtwarp]').forEach(function (container) {
      const num = function (name, def) {
        const v = parseFloat(container.getAttribute(name));
        return Number.isFinite(v) ? v : def;
      };
      const scene = new T.Scene();
      const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const geometry = new T.PlaneGeometry(2, 2);
      const material = new T.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: {
          uResolution: { value: new T.Vector2(1, 1) },
          uTime: { value: 0 },
          uSpeed: { value: num('data-speed', 0.5) },
          uColor: { value: new T.Color(container.getAttribute('data-color') || '#c755f7') },
          uBackgroundColor: { value: new T.Color(container.getAttribute('data-bg') || '#05010a') },
          uCurvature: { value: num('data-curvature', 0.25) },
          uScanlineStrength: { value: num('data-scan', 0.25) },
          uScanlineFrequency: { value: num('data-scanfreq', 200) },
          uWaveAmplitude: { value: num('data-wamp', 0.3) },
          uWaveFrequency: { value: num('data-wfreq', 2.5) },
          uBloom: { value: num('data-bloom', 1.5) },
          uBloomRadius: { value: num('data-bloomr', 1) },
          uNoise: { value: num('data-noise', 0.1) },
          uVignette: { value: num('data-vignette', 0) },
          uBrightness: { value: num('data-bright', 1.25) },
          uPixelation: { value: num('data-pixel', 1) },
          uRgbShift: { value: num('data-rgbshift', 0.015) },
          uPointer: { value: new T.Vector2(0, 0) },
          uMouseStrength: { value: num('data-mouse-str', 0.5) },
          uMouseReact: { value: container.getAttribute('data-mouse-react') === 'false' ? 0 : 1 }
        }
      });
      const mesh = new T.Mesh(geometry, material);
      mesh.frustumCulled = false;
      scene.add(mesh);

      const canvas = document.createElement('canvas');
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      container.appendChild(canvas);
      let renderer;
      try {
        renderer = new T.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'low-power' });
      } catch (err) { void err; canvas.remove(); return; }
      if (T.SRGBColorSpace) renderer.outputColorSpace = T.SRGBColorSpace;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, num('data-dpr', 1)));

      const resize = function () {
        const width = Math.max(container.clientWidth, 1);
        const height = Math.max(container.clientHeight, 1);
        renderer.setSize(width, height, false);
        material.uniforms.uResolution.value.set(canvas.width, canvas.height);
      };
      const resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(container);
      resize();

      const clock = new T.Clock();
      const pointerTarget = new T.Vector2(0, 0);
      const pointerCurrent = new T.Vector2(0, 0);
      const fps = Math.max(1, num('data-fps', 30));
      let lastFrame = 0;
      let raf = 0;
      let inView = false;
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      const render = function (now) {
        if (document.hidden || !inView) { raf = 0; return; }
        raf = requestAnimationFrame(render);
        const interval = 1000 / fps;
        if (now - lastFrame < interval) return;
        lastFrame = now - ((now - lastFrame) % interval);
        const delta = Math.min(clock.getDelta(), 0.1);
        if (!reduced) material.uniforms.uTime.value += delta * material.uniforms.uSpeed.value;
        pointerCurrent.lerp(pointerTarget, 0.08);
        material.uniforms.uPointer.value.copy(pointerCurrent);
        renderer.render(scene, camera);
      };
      const start = function () {
        if (!raf && !document.hidden && inView) { clock.getDelta(); raf = requestAnimationFrame(render); }
      };
      const io = new IntersectionObserver(function (es) {
        es.forEach(function (en) {
          inView = en.isIntersecting;
          if (inView) start();
          else if (raf) { cancelAnimationFrame(raf); raf = 0; }
        });
      }, { rootMargin: '120px' });
      io.observe(container);
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) { if (raf) { cancelAnimationFrame(raf); raf = 0; } } else start();
      });
      container.addEventListener('pointermove', function (event) {
        const rect = container.getBoundingClientRect();
        pointerTarget.set(
          ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1,
          -(((event.clientY - rect.top) / Math.max(rect.height, 1)) * 2 - 1)
        );
      }, { passive: true });
      container.addEventListener('pointerleave', function () { pointerTarget.set(0, 0); });
      renderer.render(scene, camera);
      container.__crtwarp = function () { return { running: !!raf, t: material.uniforms.uTime.value }; };
    });
  })();

  window.__vnRB = true;

  /* ---- Grainient 颗粒渐变场 · [data-grainient] — ogl GLSL3 → three 原样 ---- */
  (function () {
    const T = window.THREE;
    if (!T) return;

    const VERT = 'void main() {\n  gl_Position = vec4(position.xy, 0.0, 1.0);\n}\n';
    const FRAG = `uniform vec2 iResolution;
uniform float iTime;
uniform float uTimeSpeed;
uniform float uColorBalance;
uniform float uWarpStrength;
uniform float uWarpFrequency;
uniform float uWarpSpeed;
uniform float uWarpAmplitude;
uniform float uBlendAngle;
uniform float uBlendSoftness;
uniform float uRotationAmount;
uniform float uNoiseScale;
uniform float uGrainAmount;
uniform float uGrainScale;
uniform float uGrainAnimated;
uniform float uContrast;
uniform float uGamma;
uniform float uSaturation;
uniform vec2 uCenterOffset;
uniform float uZoom;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform float uLightMode;
out vec4 fragColor;
#define S(a,b,t) smoothstep(a,b,t)
mat2 Rot(float a){float s=sin(a),c=cos(a);return mat2(c,-s,s,c);} 
vec2 hash(vec2 p){p=vec2(dot(p,vec2(2127.1,81.17)),dot(p,vec2(1269.5,283.37)));return fract(sin(p)*43758.5453);} 
float noise(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.0-2.0*f);float n=mix(mix(dot(-1.0+2.0*hash(i+vec2(0.0,0.0)),f-vec2(0.0,0.0)),dot(-1.0+2.0*hash(i+vec2(1.0,0.0)),f-vec2(1.0,0.0)),u.x),mix(dot(-1.0+2.0*hash(i+vec2(0.0,1.0)),f-vec2(0.0,1.0)),dot(-1.0+2.0*hash(i+vec2(1.0,1.0)),f-vec2(1.0,1.0)),u.x),u.y);return 0.5+0.5*n;}
void mainImage(out vec4 o, vec2 C){
  float t=iTime*uTimeSpeed;
  vec2 uv=C/iResolution.xy;
  float ratio=iResolution.x/iResolution.y;
  vec2 tuv=uv-0.5+uCenterOffset;
  tuv/=max(uZoom,0.001);

  float degree=noise(vec2(t*0.1,tuv.x*tuv.y)*uNoiseScale);
  tuv.y*=1.0/ratio;
  tuv*=Rot(radians((degree-0.5)*uRotationAmount+180.0));
  tuv.y*=ratio;

  float frequency=uWarpFrequency;
  float ws=max(uWarpStrength,0.001);
  float amplitude=uWarpAmplitude/ws;
  float warpTime=t*uWarpSpeed;
  tuv.x+=sin(tuv.y*frequency+warpTime)/amplitude;
  tuv.y+=sin(tuv.x*(frequency*1.5)+warpTime)/(amplitude*0.5);

  vec3 colLav=uColor1;
  vec3 colOrg=uColor2;
  vec3 colDark=uColor3;
  float b=uColorBalance;
  float s=max(uBlendSoftness,0.0);
  mat2 blendRot=Rot(radians(uBlendAngle));
  float blendX=(tuv*blendRot).x;
  float edge0=-0.3-b-s;
  float edge1=0.2-b+s;
  float v0=0.5-b+s;
  float v1=-0.3-b-s;
  vec3 layer1=mix(colDark,colOrg,S(edge0,edge1,blendX));
  vec3 layer2=mix(colOrg,colLav,S(edge0,edge1,blendX));
  vec3 col=mix(layer1,layer2,S(v0,v1,tuv.y));

  vec2 grainUv=uv*max(uGrainScale,0.001);
  if(uGrainAnimated>0.5){grainUv+=vec2(iTime*0.05);} 
  float grain=fract(sin(dot(grainUv,vec2(12.9898,78.233)))*43758.5453);
  col+=(grain-0.5)*uGrainAmount;

  col=(col-0.5)*uContrast+0.5;
  float luma=dot(col,vec3(0.2126,0.7152,0.0722));
  col=mix(vec3(luma),col,uSaturation);
  col=pow(max(col,0.0),vec3(1.0/max(uGamma,0.001)));
  col=clamp(col,0.0,1.0);
  if(uLightMode>0.5){
    float energy=max(max(col.r,col.g),col.b);
    vec3 hue=col/max(energy,0.001);
    float chroma=length(col-vec3(dot(col,vec3(0.333333))));
    float coverage=clamp(0.12+chroma*1.15+energy*0.18,0.0,0.88);
    col=mix(vec3(1.0),clamp(hue*0.58+col*0.18,0.0,1.0),coverage);
  }

  o=vec4(col,1.0);
}
void main(){
  vec4 o=vec4(0.0);
  mainImage(o,gl_FragCoord.xy);
  fragColor=o;
}
`;

    const hexToRgb = function (hex) {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      if (!result) return [1, 1, 1];
      return [parseInt(result[1], 16) / 255, parseInt(result[2], 16) / 255, parseInt(result[3], 16) / 255];
    };
    const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');

    document.querySelectorAll('[data-grainient]').forEach(function (container) {
      const num = function (name, def) {
        const v = parseFloat(container.getAttribute(name));
        return Number.isFinite(v) ? v : def;
      };
      const scene = new T.Scene();
      const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const geometry = new T.PlaneGeometry(2, 2);
      const material = new T.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        glslVersion: T.GLSL3,
        uniforms: {
          iTime: { value: 0 },
          iResolution: { value: new T.Vector2(1, 1) },
          uTimeSpeed: { value: num('data-timespeed', 0.25) },
          uColorBalance: { value: num('data-cbalance', 0) },
          uWarpStrength: { value: num('data-warpstrength', 1) },
          uWarpFrequency: { value: num('data-warpfreq', 5) },
          uWarpSpeed: { value: num('data-warpspeed', 2) },
          uWarpAmplitude: { value: num('data-warpamp', 50) },
          uBlendAngle: { value: num('data-blendangle', 0) },
          uBlendSoftness: { value: num('data-blendsoft', 0.05) },
          uRotationAmount: { value: num('data-rotamount', 500) },
          uNoiseScale: { value: num('data-noisescale', 2) },
          uGrainAmount: { value: num('data-grain', 0.1) },
          uGrainScale: { value: num('data-grainscale', 2) },
          uGrainAnimated: { value: container.getAttribute('data-grainanim') === 'true' ? 1 : 0 },
          uContrast: { value: num('data-contrast', 1.5) },
          uGamma: { value: num('data-gamma', 1) },
          uSaturation: { value: num('data-sat', 1) },
          uCenterOffset: { value: new T.Vector2(num('data-cx', 0), num('data-cy', 0)) },
          uZoom: { value: num('data-zoom', 0.9) },
          uColor1: { value: new T.Vector3().fromArray(hexToRgb(container.getAttribute('data-color1') || '#FF9FFC')) },
          uColor2: { value: new T.Vector3().fromArray(hexToRgb(container.getAttribute('data-color2') || '#5227FF')) },
          uColor3: { value: new T.Vector3().fromArray(hexToRgb(container.getAttribute('data-color3') || '#B497CF')) },
          uLightMode: { value: document.documentElement.getAttribute('data-theme') === 'light' ? 1 : 0 }
        }
      });
      const mesh = new T.Mesh(geometry, material);
      mesh.frustumCulled = false;
      scene.add(mesh);

      const canvas = document.createElement('canvas');
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      container.appendChild(canvas);
      let renderer;
      try {
        renderer = new T.WebGLRenderer({ canvas, antialias: false, alpha: true });
      } catch (err) { void err; canvas.remove(); return; }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, num('data-dpr', 2)));
      renderer.setClearColor(0x000000, 0);

      const resize = function () {
        const width = Math.max(container.clientWidth, 1);
        const height = Math.max(container.clientHeight, 1);
        renderer.setSize(width, height, false);
        material.uniforms.iResolution.value.set(canvas.width, canvas.height);
        renderer.render(scene, camera);
      };
      const ro = new ResizeObserver(resize);
      ro.observe(container);
      resize();

      let raf = 0;
      let inView = false;
      let t0 = 0;
      const loop = function (t) {
        if (document.hidden || !inView) { raf = 0; return; }
        raf = requestAnimationFrame(loop);
        if (!t0) t0 = t;
        material.uniforms.iTime.value = (t - t0) * 0.001;
        renderer.render(scene, camera);
      };
      const wake = function () { if (!raf && !reduceMQ.matches) { t0 = 0; raf = requestAnimationFrame(loop); } };
      const sleep = function () { if (raf) { cancelAnimationFrame(raf); raf = 0; } };
      const io = new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        if (inView) wake(); else sleep();
      }, { rootMargin: '120px' });
      io.observe(container);
      document.addEventListener('visibilitychange', function () { if (document.hidden) sleep(); else if (inView) wake(); });
      const mo = new MutationObserver(function () {
        material.uniforms.uLightMode.value = document.documentElement.getAttribute('data-theme') === 'light' ? 1 : 0;
        renderer.render(scene, camera);
      });
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      container.__grainient = function () { return { running: !!raf, t: material.uniforms.iTime.value }; };
    });
  })();

  /* ---- Iridescence 虹彩干涉 · [data-iridescence] — ogl GLSL1 → three 原样 ---- */
  (function () {
    const T = window.THREE;
    if (!T) return;

    const VERT = 'varying vec2 vUv;\nvoid main() {\n  vUv = uv;\n  gl_Position = vec4(position.xy, 0.0, 1.0);\n}\n';
    const FRAG = `precision highp float;

uniform float uTime;
uniform vec3 uColor;
uniform vec3 uResolution;
uniform vec2 uMouse;
uniform float uAmplitude;
uniform float uSpeed;

varying vec2 vUv;

void main() {
  float mr = min(uResolution.x, uResolution.y);
  vec2 uv = (vUv.xy * 2.0 - 1.0) * uResolution.xy / mr;

  uv += (uMouse - vec2(0.5)) * uAmplitude;

  float d = -uTime * 0.5 * uSpeed;
  float a = 0.0;
  for (float i = 0.0; i < 8.0; ++i) {
    a += cos(i - d - a * uv.x);
    d += sin(uv.y * i + a);
  }
  d += uTime * 0.5 * uSpeed;
  vec3 col = vec3(cos(uv * vec2(d, a)) * 0.6 + 0.4, cos(a + d) * 0.5 + 0.5);
  col = cos(col * cos(vec3(d, a, 2.5)) * 0.5 + 0.5) * uColor;
  gl_FragColor = vec4(col, 1.0);
}
`;
    const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');

    document.querySelectorAll('[data-iridescence]').forEach(function (container) {
      const num = function (name, def) {
        const v = parseFloat(container.getAttribute(name));
        return Number.isFinite(v) ? v : def;
      };
      const colHex = container.getAttribute('data-color') || '#ffffff';
      const colHexLight = container.getAttribute('data-color-light') || colHex;
      const scene = new T.Scene();
      const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const geometry = new T.PlaneGeometry(2, 2);
      const material = new T.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: {
          uTime: { value: 0 },
          uColor: { value: new T.Color(colHex) },
          uResolution: { value: new T.Vector3(1, 1, 1) },
          uMouse: { value: new T.Vector2(0.5, 0.5) },
          uAmplitude: { value: num('data-amplitude', 0.1) },
          uSpeed: { value: num('data-speed', 1) }
        }
      });
      const mesh = new T.Mesh(geometry, material);
      mesh.frustumCulled = false;
      scene.add(mesh);

      const canvas = document.createElement('canvas');
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      container.appendChild(canvas);
      let renderer;
      try {
        renderer = new T.WebGLRenderer({ canvas, antialias: false, alpha: false });
      } catch (err) { void err; canvas.remove(); return; }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

      const resize = function () {
        const width = Math.max(container.clientWidth, 1);
        const height = Math.max(container.clientHeight, 1);
        renderer.setSize(width, height, false);
        material.uniforms.uResolution.value.set(canvas.width, canvas.height, canvas.width / canvas.height);
        renderer.render(scene, camera);
      };
      const ro = new ResizeObserver(resize);
      ro.observe(container);
      resize();

      let raf = 0;
      let inView = false;
      const loop = function (t) {
        if (document.hidden || !inView) { raf = 0; return; }
        raf = requestAnimationFrame(loop);
        material.uniforms.uTime.value = t * 0.001;
        renderer.render(scene, camera);
      };
      const wake = function () { if (!raf && !reduceMQ.matches) raf = requestAnimationFrame(loop); };
      const sleep = function () { if (raf) { cancelAnimationFrame(raf); raf = 0; } };
      const io = new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        if (inView) wake(); else sleep();
      }, { rootMargin: '120px' });
      io.observe(container);
      document.addEventListener('visibilitychange', function () { if (document.hidden) sleep(); else if (inView) wake(); });
      if (container.getAttribute('data-mouse-react') !== 'false') {
        container.addEventListener('mousemove', function (e) {
          const rect = container.getBoundingClientRect();
          material.uniforms.uMouse.value.set(
            (e.clientX - rect.left) / rect.width,
            1 - (e.clientY - rect.top) / rect.height
          );
        }, { passive: true });
      }
      const mo = new MutationObserver(function () {
        const light = document.documentElement.getAttribute('data-theme') === 'light';
        material.uniforms.uColor.value.set(light ? colHexLight : colHex);
        renderer.render(scene, camera);
      });
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      container.__iridescence = function () { return { running: !!raf, t: material.uniforms.uTime.value }; };
    });
  })();

  /* ---- Lightning 闪电裂界 · [data-lightning] — 官方 raw WebGL 逐行原样 ---- */
  (function () {
    const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');

    document.querySelectorAll('[data-lightning]').forEach(function (canvas) {
      const num = function (name, def) {
        const v = parseFloat(canvas.getAttribute(name));
        return Number.isFinite(v) ? v : def;
      };
      const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, __vnRawGL: true });
      if (!gl) return;

      const vertexShaderSource = 'attribute vec2 aPosition;\nvoid main() {\n  gl_Position = vec4(aPosition, 0.0, 1.0);\n}\n';
      const fragmentShaderSource = `precision mediump float;
uniform vec2 iResolution;
uniform float iTime;
uniform float uHue;
uniform float uXOffset;
uniform float uSpeed;
uniform float uIntensity;
uniform float uSize;

#define OCTAVE_COUNT 10

vec3 hsv2rgb(vec3 c) {
    vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0,4.0,2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    return c.z * mix(vec3(1.0), rgb, c.y);
}

float hash11(float p) {
    p = fract(p * .1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
}

float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * .1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

mat2 rotate2d(float theta) {
    float c = cos(theta);
    float s = sin(theta);
    return mat2(c, -s, s, c);
}

float noise(vec2 p) {
    vec2 ip = floor(p);
    vec2 fp = fract(p);
    float a = hash12(ip);
    float b = hash12(ip + vec2(1.0, 0.0));
    float c = hash12(ip + vec2(0.0, 1.0));
    float d = hash12(ip + vec2(1.0, 1.0));

    vec2 t = smoothstep(0.0, 1.0, fp);
    return mix(mix(a, b, t.x), mix(c, d, t.x), t.y);
}

float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < OCTAVE_COUNT; ++i) {
        value += amplitude * noise(p);
        p *= rotate2d(0.45);
        p *= 2.0;
        amplitude *= 0.5;
    }
    return value;
}

void mainImage( out vec4 fragColor, in vec2 fragCoord ) {
    vec2 uv = fragCoord / iResolution.xy;
    uv = 2.0 * uv - 1.0;
    uv.x *= iResolution.x / iResolution.y;
    uv.x += uXOffset;

    uv += 2.0 * fbm(uv * uSize + 0.8 * iTime * uSpeed) - 1.0;

    float dist = abs(uv.x);
    vec3 baseColor = hsv2rgb(vec3(uHue / 360.0, 0.7, 0.8));
    vec3 col = baseColor * pow(mix(0.0, 0.07, hash11(iTime * uSpeed)) / dist, 1.0) * uIntensity;
    col = pow(col, vec3(1.0));
    float a = clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0);
    fragColor = vec4(col, a);
}

void main() {
    mainImage(gl_FragColor, gl_FragCoord.xy);
}
`;

      const compileShader = function (source, type) {
        const shader = gl.createShader(type);
        if (!shader) return null;
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          gl.deleteShader(shader);
          return null;
        }
        return shader;
      };
      const vs = compileShader(vertexShaderSource, gl.VERTEX_SHADER);
      const fs = compileShader(fragmentShaderSource, gl.FRAGMENT_SHADER);
      if (!vs || !fs) return;
      const program = gl.createProgram();
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
      gl.useProgram(program);

      const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
      const vertexBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
      const aPosition = gl.getAttribLocation(program, 'aPosition');
      gl.enableVertexAttribArray(aPosition);
      gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

      const loc = {
        iResolution: gl.getUniformLocation(program, 'iResolution'),
        iTime: gl.getUniformLocation(program, 'iTime'),
        uHue: gl.getUniformLocation(program, 'uHue'),
        uXOffset: gl.getUniformLocation(program, 'uXOffset'),
        uSpeed: gl.getUniformLocation(program, 'uSpeed'),
        uIntensity: gl.getUniformLocation(program, 'uIntensity'),
        uSize: gl.getUniformLocation(program, 'uSize')
      };
      const hue = num('data-hue', 268);
      const xOffset = num('data-xoffset', 0);
      const speed = num('data-speed', 0.6);
      const intensity = num('data-intensity', 1);
      const size = num('data-size', 1);

      const resizeCanvas = function () {
        const width = Math.max(canvas.clientWidth, 1);
        const height = Math.max(canvas.clientHeight, 1);
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
      };

      const startTime = performance.now();
      const drawFrame = function () {
        resizeCanvas();
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.uniform2f(loc.iResolution, canvas.width, canvas.height);
        gl.uniform1f(loc.iTime, (performance.now() - startTime) / 1000.0);
        gl.uniform1f(loc.uHue, hue);
        gl.uniform1f(loc.uXOffset, xOffset);
        gl.uniform1f(loc.uSpeed, speed);
        gl.uniform1f(loc.uIntensity, intensity);
        gl.uniform1f(loc.uSize, size);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      };

      let raf = 0;
      let inView = false;
      const loop = function () {
        if (document.hidden || !inView) { raf = 0; return; }
        raf = requestAnimationFrame(loop);
        drawFrame();
      };
      const wake = function () { if (!raf && !reduceMQ.matches) raf = requestAnimationFrame(loop); };
      const sleep = function () { if (raf) { cancelAnimationFrame(raf); raf = 0; } };
      const io = new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        if (inView) wake(); else sleep();
      }, { rootMargin: '120px' });
      io.observe(canvas);
      document.addEventListener('visibilitychange', function () { if (document.hidden) sleep(); else if (inView) wake(); });
      const ro = new ResizeObserver(function () { drawFrame(); });
      ro.observe(canvas);
      drawFrame();
      canvas.__lightning = function () { return { running: !!raf }; };
    });
  })();

  /* ---- LiquidChrome 液态铬面 · [data-liquidchrome] — ogl GLSL1 → three 原样 ---- */
  (function () {
    const T = window.THREE;
    if (!T) return;

    const VERT = 'varying vec2 vUv;\nvoid main() {\n  vUv = uv;\n  gl_Position = vec4(position.xy, 0.0, 1.0);\n}\n';
    const FRAG = `precision highp float;
uniform float uTime;
uniform vec3 uResolution;
uniform vec3 uBaseColor;
uniform float uAmplitude;
uniform float uFrequencyX;
uniform float uFrequencyY;
uniform vec2 uMouse;
varying vec2 vUv;

vec4 renderImage(vec2 uvCoord) {
    vec2 fragCoord = uvCoord * uResolution.xy;
    vec2 uv = (2.0 * fragCoord - uResolution.xy) / min(uResolution.x, uResolution.y);

    for (float i = 1.0; i < 10.0; i++){
        uv.x += uAmplitude / i * cos(i * uFrequencyX * uv.y + uTime + uMouse.x * 3.14159);
        uv.y += uAmplitude / i * cos(i * uFrequencyY * uv.x + uTime + uMouse.y * 3.14159);
    }

    vec2 diff = (uvCoord - uMouse);
    float dist = length(diff);
    float falloff = exp(-dist * 20.0);
    float ripple = sin(10.0 * dist - uTime * 2.0) * 0.03;
    uv += (diff / (dist + 0.0001)) * ripple * falloff;

    vec3 color = uBaseColor / abs(sin(uTime - uv.y - uv.x));
    return vec4(color, 1.0);
}

void main() {
    vec4 col = vec4(0.0);
    int samples = 0;
    for (int i = -1; i <= 1; i++){
        for (int j = -1; j <= 1; j++){
            vec2 offset = vec2(float(i), float(j)) * (1.0 / min(uResolution.x, uResolution.y));
            col += renderImage(vUv + offset);
            samples++;
        }
    }
    gl_FragColor = col / float(samples);
}
`;
    const hexToRgb = function (hex) {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      if (!result) return [0.1, 0.1, 0.1];
      return [parseInt(result[1], 16) / 255, parseInt(result[2], 16) / 255, parseInt(result[3], 16) / 255];
    };
    const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');

    document.querySelectorAll('[data-liquidchrome]').forEach(function (container) {
      const num = function (name, def) {
        const v = parseFloat(container.getAttribute(name));
        return Number.isFinite(v) ? v : def;
      };
      const speed = num('data-speed', 0.2);
      const scene = new T.Scene();
      const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const geometry = new T.PlaneGeometry(2, 2);
      const material = new T.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: {
          uTime: { value: 0 },
          uResolution: { value: new Float32Array([1, 1, 1]) },
          uBaseColor: { value: new Float32Array(hexToRgb(container.getAttribute('data-base') || '#1a1a1a')) },
          uAmplitude: { value: num('data-amplitude', 0.3) },
          uFrequencyX: { value: num('data-freqx', 3) },
          uFrequencyY: { value: num('data-freqy', 3) },
          uMouse: { value: new Float32Array([0, 0]) }
        }
      });
      const mesh = new T.Mesh(geometry, material);
      mesh.frustumCulled = false;
      scene.add(mesh);

      const canvas = document.createElement('canvas');
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      container.appendChild(canvas);
      let renderer;
      try {
        renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false });
      } catch (err) { void err; canvas.remove(); return; }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

      const resize = function () {
        const width = Math.max(container.clientWidth, 1);
        const height = Math.max(container.clientHeight, 1);
        renderer.setSize(width, height, false);
        const res = material.uniforms.uResolution.value;
        res[0] = canvas.width;
        res[1] = canvas.height;
        res[2] = canvas.width / canvas.height;
        renderer.render(scene, camera);
      };
      const ro = new ResizeObserver(resize);
      ro.observe(container);
      resize();

      let raf = 0;
      let inView = false;
      const loop = function (t) {
        if (document.hidden || !inView) { raf = 0; return; }
        raf = requestAnimationFrame(loop);
        material.uniforms.uTime.value = t * 0.001 * speed;
        renderer.render(scene, camera);
      };
      const wake = function () { if (!raf && !reduceMQ.matches) raf = requestAnimationFrame(loop); };
      const sleep = function () { if (raf) { cancelAnimationFrame(raf); raf = 0; } };
      const io = new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        if (inView) wake(); else sleep();
      }, { rootMargin: '120px' });
      io.observe(container);
      document.addEventListener('visibilitychange', function () { if (document.hidden) sleep(); else if (inView) wake(); });
      if (container.getAttribute('data-interactive') !== 'false') {
        const setMouse = function (clientX, clientY) {
          const rect = container.getBoundingClientRect();
          const m = material.uniforms.uMouse.value;
          m[0] = (clientX - rect.left) / rect.width;
          m[1] = 1 - (clientY - rect.top) / rect.height;
        };
        container.addEventListener('mousemove', function (e) { setMouse(e.clientX, e.clientY); }, { passive: true });
        container.addEventListener('touchmove', function (e) {
          if (e.touches.length > 0) setMouse(e.touches[0].clientX, e.touches[0].clientY);
        }, { passive: true });
      }
      container.__liquidchrome = function () { return { running: !!raf, t: material.uniforms.uTime.value }; };
    });
  })();

  /* ---- Particles 星尘粒子球 · [data-particles3d] — ogl → three Points 原样 ---- */
  (function () {
    const T = window.THREE;
    if (!T) return;

    const hexToRgb = function (hex) {
      hex = hex.replace(/^#/, '');
      if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
      const int = parseInt(hex.slice(0, 6), 16);
      return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255];
    };

    const vertex = `attribute vec4 aRandom;
attribute vec3 aPColor;

uniform float uTime;
uniform float uSpread;
uniform float uBaseSize;
uniform float uSizeRandomness;

varying vec4 vRandom;
varying vec3 vColor;

void main() {
  vRandom = aRandom;
  vColor = aPColor;

  vec3 pos = position * uSpread;
  pos.z *= 10.0;

  vec4 mPos = modelMatrix * vec4(pos, 1.0);
  float t = uTime;
  mPos.x += sin(t * aRandom.z + 6.28 * aRandom.w) * mix(0.1, 1.5, aRandom.x);
  mPos.y += sin(t * aRandom.y + 6.28 * aRandom.x) * mix(0.1, 1.5, aRandom.w);
  mPos.z += sin(t * aRandom.w + 6.28 * aRandom.y) * mix(0.1, 1.5, aRandom.z);

  vec4 mvPos = viewMatrix * mPos;

  if (uSizeRandomness == 0.0) {
    gl_PointSize = uBaseSize;
  } else {
    gl_PointSize = (uBaseSize * (1.0 + uSizeRandomness * (aRandom.x - 0.5))) / length(mvPos.xyz);
  }

  gl_Position = projectionMatrix * mvPos;
}
`;

    const fragment = `precision highp float;

uniform float uTime;
uniform float uAlphaParticles;
varying vec4 vRandom;
varying vec3 vColor;

void main() {
  vec2 uv = gl_PointCoord.xy;
  float d = length(uv - vec2(0.5));

  if(uAlphaParticles < 0.5) {
    if(d > 0.5) {
      discard;
    }
    gl_FragColor = vec4(vColor + 0.2 * sin(uv.yxx + uTime + vRandom.y * 6.28), 1.0);
  } else {
    float circle = smoothstep(0.5, 0.4, d) * 0.8;
    gl_FragColor = vec4(vColor + 0.2 * sin(uv.yxx + uTime + vRandom.y * 6.28), circle);
  }
}
`;
    const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');

    document.querySelectorAll('[data-particles3d]').forEach(function (container) {
      const num = function (name, def) {
        const v = parseFloat(container.getAttribute(name));
        return Number.isFinite(v) ? v : def;
      };
      const pixelRatio = num('data-pixel-ratio', 1);
      const cameraDistance = num('data-cam-dist', 20);
      const speed = num('data-speed', 0.1);
      const hover = container.getAttribute('data-hover') === 'true';
      const hoverFactor = num('data-hover-factor', 1);
      const noRotate = container.getAttribute('data-no-rotate') === 'true';

      const scene = new T.Scene();
      const camera = new T.PerspectiveCamera(15, 1, 0.1, 200);
      camera.position.set(0, 0, cameraDistance);

      const canvas = document.createElement('canvas');
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      container.appendChild(canvas);
      let renderer;
      try {
        renderer = new T.WebGLRenderer({ canvas, alpha: true, depth: false, antialias: false });
      } catch (err) { void err; canvas.remove(); return; }
      renderer.setPixelRatio(pixelRatio);
      renderer.setClearColor(0x000000, 0);

      const count = Math.max(1, Math.floor(num('data-count', 200)));
      const positions = new Float32Array(count * 3);
      const randoms = new Float32Array(count * 4);
      const colors = new Float32Array(count * 3);
      const paletteAttr = (container.getAttribute('data-colors') || '#ffffff|#ffffff|#ffffff').split('|');
      for (let i = 0; i < count; i++) {
        let x, y, z, len;
        do {
          x = Math.random() * 2 - 1;
          y = Math.random() * 2 - 1;
          z = Math.random() * 2 - 1;
          len = x * x + y * y + z * z;
        } while (len > 1 || len === 0);
        const r = Math.cbrt(Math.random());
        positions.set([x * r, y * r, z * r], i * 3);
        randoms.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
        colors.set(hexToRgb(paletteAttr[Math.floor(Math.random() * paletteAttr.length)] || '#ffffff'), i * 3);
      }
      const geometry = new T.BufferGeometry();
      geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
      geometry.setAttribute('aRandom', new T.BufferAttribute(randoms, 4));
      geometry.setAttribute('aPColor', new T.BufferAttribute(colors, 3));

      const material = new T.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        uniforms: {
          uTime: { value: 0 },
          uSpread: { value: num('data-spread', 10) },
          uBaseSize: { value: num('data-base-size', 100) * pixelRatio },
          uSizeRandomness: { value: num('data-size-rand', 1) },
          uAlphaParticles: { value: container.getAttribute('data-alpha') === 'true' ? 1 : 0 }
        },
        transparent: true,
        depthTest: false,
        depthWrite: false
      });
      const particles = new T.Points(geometry, material);
      particles.frustumCulled = false;
      scene.add(particles);

      const resize = function () {
        const width = Math.max(container.clientWidth, 1);
        const height = Math.max(container.clientHeight, 1);
        renderer.setSize(width, height, false);
        camera.aspect = canvas.width / canvas.height;
        camera.updateProjectionMatrix();
      };
      const ro = new ResizeObserver(resize);
      ro.observe(container);
      resize();

      const mouse = { x: 0, y: 0 };
      if (hover) {
        container.addEventListener('mousemove', function (e) {
          const rect = container.getBoundingClientRect();
          mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          mouse.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
        }, { passive: true });
      }

      let raf = 0;
      let inView = false;
      let lastTime = performance.now();
      let elapsed = 0;
      const loop = function (t) {
        if (document.hidden || !inView) { raf = 0; return; }
        raf = requestAnimationFrame(loop);
        const delta = t - lastTime;
        lastTime = t;
        elapsed += delta * speed;
        material.uniforms.uTime.value = elapsed * 0.001;
        if (hover) {
          particles.position.x = -mouse.x * hoverFactor;
          particles.position.y = -mouse.y * hoverFactor;
        }
        if (!noRotate) {
          particles.rotation.x = Math.sin(elapsed * 0.0002) * 0.1;
          particles.rotation.y = Math.cos(elapsed * 0.0005) * 0.15;
          particles.rotation.z += 0.01 * speed;
        }
        renderer.render(scene, camera);
      };
      const wake = function () { if (!raf && !reduceMQ.matches) { lastTime = performance.now(); raf = requestAnimationFrame(loop); } };
      const sleep = function () { if (raf) { cancelAnimationFrame(raf); raf = 0; } };
      const io = new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        if (inView) wake(); else sleep();
      }, { rootMargin: '120px' });
      io.observe(container);
      document.addEventListener('visibilitychange', function () { if (document.hidden) sleep(); else if (inView) wake(); });
      renderer.render(scene, camera);
      container.__particles3d = function () { return { running: !!raf, count: count }; };
    });
  })();

  /* ---- GridMotion 鼠标视差瓷砖网格 · [data-gridmotion] — 官方 DOM+gsap.ticker 原样 ---- */
  (function () {
    const G = window.gsap;
    const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');

    document.querySelectorAll('[data-gridmotion]').forEach(function (container) {
      const items = (container.getAttribute('data-items') || '').split('|').filter(Boolean);
      const grid = document.createElement('div');
      grid.className = 'gm-grid';
      const rows = [];
      for (let r = 0; r < 4; r++) {
        const row = document.createElement('div');
        row.className = 'gm-row';
        for (let c = 0; c < 7; c++) {
          const content = items.length ? items[(r * 7 + c) % items.length] : 'Item ' + (r * 7 + c + 1);
          const item = document.createElement('div');
          item.className = 'gm-item';
          const inner = document.createElement('div');
          inner.className = 'gm-item-inner';
          if (/^https?:|\.webp|\.png|\.jpe?g|\.avif/i.test(content)) {
            const img = document.createElement('div');
            img.className = 'gm-item-img';
            img.style.backgroundImage = 'url(' + content + ')';
            inner.appendChild(img);
          } else {
            const txt = document.createElement('div');
            txt.className = 'gm-item-content';
            txt.textContent = content;
            inner.appendChild(txt);
          }
          item.appendChild(inner);
          row.appendChild(item);
        }
        grid.appendChild(row);
        rows.push(row);
      }
      container.appendChild(grid);

      if (!G || reduceMQ.matches || !window.matchMedia('(pointer: fine)').matches) {
        container.__gridmotion = function () { return { running: false, rows: rows.length }; };
        return;
      }

      let mouseX = window.innerWidth / 2;
      const onMove = function (e) { mouseX = e.clientX; };
      const updateMotion = function () {
        const maxMoveAmount = 300;
        const baseDuration = 0.8;
        const inertiaFactors = [0.6, 0.4, 0.3, 0.2];
        rows.forEach(function (row, index) {
          const direction = index % 2 === 0 ? 1 : -1;
          const moveAmount = ((mouseX / window.innerWidth) * maxMoveAmount - maxMoveAmount / 2) * direction;
          G.to(row, {
            x: moveAmount,
            duration: baseDuration + inertiaFactors[index % inertiaFactors.length],
            ease: 'power3.out',
            overwrite: 'auto'
          });
        });
      };

      let running = false;
      let inView = false;
      const start = function () { if (!running) { running = true; G.ticker.add(updateMotion); window.addEventListener('mousemove', onMove); } };
      const stop = function () { if (running) { running = false; G.ticker.remove(updateMotion); window.removeEventListener('mousemove', onMove); } };
      const io = new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        if (inView && !document.hidden) start(); else stop();
      }, { rootMargin: '120px' });
      io.observe(container);
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) stop(); else if (inView) start();
      });
      container.__gridmotion = function () { return { running: running, rows: rows.length }; };
    });
  })();

  /* ---- Waves 游动波纹线阵 · [data-waves] — 官方 Perlin+canvas 2D 逐行原样 ---- */
  (function () {
    class Grad {
      constructor(x, y, z) { this.x = x; this.y = y; this.z = z; }
      dot2(x, y) { return this.x * x + this.y * y; }
    }
    class Noise {
      constructor(seed = 0) {
        this.grad3 = [
          new Grad(1, 1, 0), new Grad(-1, 1, 0), new Grad(1, -1, 0), new Grad(-1, -1, 0),
          new Grad(1, 0, 1), new Grad(-1, 0, 1), new Grad(1, 0, -1), new Grad(-1, 0, -1),
          new Grad(0, 1, 1), new Grad(0, -1, 1), new Grad(0, 1, -1), new Grad(0, -1, -1)
        ];
        this.p = [
          151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225, 140, 36, 103, 30, 69, 142, 8, 99, 37, 240,
          21, 10, 23, 190, 6, 148, 247, 120, 234, 75, 0, 26, 197, 62, 94, 252, 219, 203, 117, 35, 11, 32, 57, 177, 33, 88,
          237, 149, 56, 87, 174, 20, 125, 136, 171, 168, 68, 175, 74, 165, 71, 134, 139, 48, 27, 166, 77, 146, 158, 231, 83,
          111, 229, 122, 60, 211, 133, 230, 220, 105, 92, 41, 55, 46, 245, 40, 244, 102, 143, 54, 65, 25, 63, 161, 1, 216,
          80, 73, 209, 76, 132, 187, 208, 89, 18, 169, 200, 196, 135, 130, 116, 188, 159, 86, 164, 100, 109, 198, 173, 186,
          3, 64, 52, 217, 226, 250, 124, 123, 5, 202, 38, 147, 118, 126, 255, 82, 85, 212, 207, 206, 59, 227, 47, 16, 58,
          17, 182, 189, 28, 42, 223, 183, 170, 213, 119, 248, 152, 2, 44, 154, 163, 70, 221, 153, 101, 155, 167, 43, 172, 9,
          129, 22, 39, 253, 19, 98, 108, 110, 79, 113, 224, 232, 178, 185, 112, 104, 218, 246, 97, 228, 251, 34, 242, 193,
          238, 210, 144, 12, 191, 179, 162, 241, 81, 51, 145, 235, 249, 14, 239, 107, 49, 192, 214, 31, 181, 199, 106, 157,
          184, 84, 204, 176, 115, 121, 50, 45, 127, 4, 150, 254, 138, 236, 205, 93, 222, 114, 67, 29, 24, 72, 243, 141, 128,
          195, 78, 66, 215, 61, 156, 180
        ];
        this.perm = new Array(512);
        this.gradP = new Array(512);
        this.seed(seed);
      }
      seed(seed) {
        if (seed > 0 && seed < 1) seed *= 65536;
        seed = Math.floor(seed);
        if (seed < 256) seed |= seed << 8;
        for (let i = 0; i < 256; i++) {
          let v = i & 1 ? this.p[i] ^ (seed & 255) : this.p[i] ^ ((seed >> 8) & 255);
          this.perm[i] = this.perm[i + 256] = v;
          this.gradP[i] = this.gradP[i + 256] = this.grad3[v % 12];
        }
      }
      fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
      lerp(a, b, t) { return (1 - t) * a + t * b; }
      perlin2(x, y) {
        let X = Math.floor(x), Y = Math.floor(y);
        x -= X; y -= Y;
        X &= 255; Y &= 255;
        const n00 = this.gradP[X + this.perm[Y]].dot2(x, y);
        const n01 = this.gradP[X + this.perm[Y + 1]].dot2(x, y - 1);
        const n10 = this.gradP[X + 1 + this.perm[Y]].dot2(x - 1, y);
        const n11 = this.gradP[X + 1 + this.perm[Y + 1]].dot2(x - 1, y - 1);
        const u = this.fade(x);
        return this.lerp(this.lerp(n00, n10, u), this.lerp(n01, n11, u), this.fade(y));
      }
    }
    const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');

    document.querySelectorAll('[data-waves]').forEach(function (container) {
      const num = function (name, def) {
        const v = parseFloat(container.getAttribute(name));
        return Number.isFinite(v) ? v : def;
      };
      const lineHexDark = container.getAttribute('data-line') || 'rgba(196,181,253,0.55)';
      const lineHexLight = container.getAttribute('data-line-light') || lineHexDark;
      const config = {
        lineColor: document.documentElement.getAttribute('data-theme') === 'light' ? lineHexLight : lineHexDark,
        waveSpeedX: num('data-speedx', 0.0125),
        waveSpeedY: num('data-speedy', 0.005),
        waveAmpX: num('data-ampx', 32),
        waveAmpY: num('data-ampy', 16),
        friction: num('data-friction', 0.925),
        tension: num('data-tension', 0.005),
        maxCursorMove: num('data-maxmove', 100),
        xGap: num('data-xgap', 10),
        yGap: num('data-ygap', 32)
      };

      const canvas = document.createElement('canvas');
      canvas.className = 'wv-canvas';
      container.appendChild(canvas);
      const ctx = canvas.getContext('2d');
      const bounding = { width: 0, height: 0, left: 0, top: 0 };
      const noise = new Noise(Math.random());
      let lines = [];
      const mouse = { x: -10, y: 0, lx: 0, ly: 0, sx: 0, sy: 0, v: 0, vs: 0, a: 0, set: false };

      function setSize() {
        const rect = container.getBoundingClientRect();
        bounding.width = rect.width; bounding.height = rect.height;
        bounding.left = rect.left; bounding.top = rect.top;
        canvas.width = Math.max(rect.width, 1);
        canvas.height = Math.max(rect.height, 1);
      }

      function setLines() {
        const width = bounding.width, height = bounding.height;
        lines = [];
        const oWidth = width + 200, oHeight = height + 30;
        const totalLines = Math.ceil(oWidth / config.xGap);
        const totalPoints = Math.ceil(oHeight / config.yGap);
        const xStart = (width - config.xGap * totalLines) / 2;
        const yStart = (height - config.yGap * totalPoints) / 2;
        for (let i = 0; i <= totalLines; i++) {
          const pts = [];
          for (let j = 0; j <= totalPoints; j++) {
            pts.push({
              x: xStart + config.xGap * i,
              y: yStart + config.yGap * j,
              wave: { x: 0, y: 0 },
              cursor: { x: 0, y: 0, vx: 0, vy: 0 }
            });
          }
          lines.push(pts);
        }
      }

      function movePoints(time) {
        lines.forEach(function (pts) {
          pts.forEach(function (p) {
            const move = noise.perlin2((p.x + time * config.waveSpeedX) * 0.002, (p.y + time * config.waveSpeedY) * 0.0015) * 12;
            p.wave.x = Math.cos(move) * config.waveAmpX;
            p.wave.y = Math.sin(move) * config.waveAmpY;

            const dx = p.x - mouse.sx, dy = p.y - mouse.sy;
            const dist = Math.hypot(dx, dy), l = Math.max(175, mouse.vs);
            if (dist < l) {
              const s = 1 - dist / l;
              const f = Math.cos(dist * 0.001) * s;
              p.cursor.vx += Math.cos(mouse.a) * f * l * mouse.vs * 0.00065;
              p.cursor.vy += Math.sin(mouse.a) * f * l * mouse.vs * 0.00065;
            }

            p.cursor.vx += (0 - p.cursor.x) * config.tension;
            p.cursor.vy += (0 - p.cursor.y) * config.tension;
            p.cursor.vx *= config.friction;
            p.cursor.vy *= config.friction;
            p.cursor.x += p.cursor.vx * 2;
            p.cursor.y += p.cursor.vy * 2;
            p.cursor.x = Math.min(config.maxCursorMove, Math.max(-config.maxCursorMove, p.cursor.x));
            p.cursor.y = Math.min(config.maxCursorMove, Math.max(-config.maxCursorMove, p.cursor.y));
          });
        });
      }

      function moved(point, withCursor) {
        const x = point.x + point.wave.x + (withCursor ? point.cursor.x : 0);
        const y = point.y + point.wave.y + (withCursor ? point.cursor.y : 0);
        return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
      }

      function drawLines() {
        ctx.clearRect(0, 0, bounding.width, bounding.height);
        ctx.beginPath();
        ctx.strokeStyle = config.lineColor;
        lines.forEach(function (points) {
          let p1 = moved(points[0], false);
          ctx.moveTo(p1.x, p1.y);
          points.forEach(function (p, idx) {
            const isLast = idx === points.length - 1;
            p1 = moved(p, !isLast);
            const p2 = moved(points[idx + 1] || points[points.length - 1], !isLast);
            ctx.lineTo(p1.x, p1.y);
            if (isLast) ctx.moveTo(p2.x, p2.y);
          });
        });
        ctx.stroke();
      }

      let raf = 0;
      let inView = false;
      function tick(t) {
        if (document.hidden || !inView) { raf = 0; return; }
        raf = requestAnimationFrame(tick);
        mouse.sx += (mouse.x - mouse.sx) * 0.1;
        mouse.sy += (mouse.y - mouse.sy) * 0.1;
        const dx = mouse.x - mouse.lx, dy = mouse.y - mouse.ly;
        const d = Math.hypot(dx, dy);
        mouse.v = d;
        mouse.vs += (d - mouse.vs) * 0.1;
        mouse.vs = Math.min(100, mouse.vs);
        mouse.lx = mouse.x;
        mouse.ly = mouse.y;
        mouse.a = Math.atan2(dy, dx);
        movePoints(t);
        drawLines();
      }

      function updateMouse(x, y) {
        mouse.x = x - bounding.left;
        mouse.y = y - bounding.top;
        if (!mouse.set) {
          mouse.sx = mouse.x; mouse.sy = mouse.y;
          mouse.lx = mouse.x; mouse.ly = mouse.y;
          mouse.set = true;
        }
      }
      const onMove = function (e) { updateMouse(e.clientX, e.clientY); };
      const onTouch = function (e) {
        const touch = e.touches[0];
        if (touch) updateMouse(touch.clientX, touch.clientY);
      };
      const onResize = function () { setSize(); setLines(); drawStatic(); };
      const drawStatic = function () { movePoints(0); drawLines(); };

      setSize();
      setLines();
      window.addEventListener('resize', onResize);
      const wake = function () { if (!raf && !reduceMQ.matches) raf = requestAnimationFrame(tick); };
      const sleep = function () { if (raf) { cancelAnimationFrame(raf); raf = 0; } };
      const io = new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        if (inView) {
          window.addEventListener('mousemove', onMove);
          window.addEventListener('touchmove', onTouch, { passive: true });
          wake();
        } else {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('touchmove', onTouch);
          sleep();
        }
      }, { rootMargin: '120px' });
      io.observe(container);
      document.addEventListener('visibilitychange', function () { if (document.hidden) sleep(); else if (inView) wake(); });
      const mo = new MutationObserver(function () {
        config.lineColor = document.documentElement.getAttribute('data-theme') === 'light' ? lineHexLight : lineHexDark;
        drawStatic();
      });
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      if (reduceMQ.matches) drawStatic();
      container.__waves = function () { return { running: !!raf, lines: lines.length }; };
    });
  })();
  /* ============ v104 · React Bits 第十二批 (Backgrounds) ============
     Orb / LightPillar / Scanner / GhostFibers / Balatro / Topography / DotField
     ShapeWaves 未移植: 官方依赖 vgpu(WebGPU) 库, 与站内 three/raw-WebGL 体系不兼容(记录于注释, 同 Hyperspeed postprocessing 先例) */

  /* ---- 共享: 全屏三角 WebGL2 + GLSL300es 原样编译 ---- */
  const __fsGL2 = function (canvas, vsSrc, fsSrc, opts) {
    let gl;
    try {
      gl = canvas.getContext('webgl2', {
        alpha: !!opts.alpha,
        premultipliedAlpha: !!opts.premul,
        antialias: false,
        __vnRawGL: true /* 裸 GL:上下文被浏览器回收时需按录制命令重放(见文件头 __vnCtxBudget) */
      });
    } catch (err) { void err; return null; }
    if (!gl) return null;
    const mk = function (type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.warn('[rb-gl2]', gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    };
    const vs = mk(gl.VERTEX_SHADER, vsSrc);
    const fs = mk(gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return null;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn('[rb-gl2]', gl.getProgramInfoLog(prog));
      return null;
    }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'position');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const u = {};
    const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(prog, i);
      u[info.name] = gl.getUniformLocation(prog, info.name);
    }
    if (opts.clear) gl.clearColor(opts.clear[0], opts.clear[1], opts.clear[2], opts.clear[3]);
    return {
      gl: gl,
      u: u,
      resize: function (cssW, cssH, dpr) {
        const w = Math.max(1, Math.floor(cssW * dpr));
        const h = Math.max(1, Math.floor(cssH * dpr));
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.display = 'block';
        gl.viewport(0, 0, w, h);
        return [w, h];
      },
      render: function () {
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
    };
  };

  const __hex3 = function (hex) {
    const value = (hex || '').trim().replace(/^#/, '');
    const normalized = value.length === 3 ? value.replace(/./g, function (c) { return c + c; }) : value;
    const m = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(normalized);
    if (!m) return [1, 1, 1];
    return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
  };

  /* ---- Orb 光球 · [data-orb] — ogl GLSL1 → three 原样 ---- */
  (function () {
    const T = window.THREE;
    if (!T) return;

    const VERT = 'varying vec2 vUv;\nvoid main() {\n  vUv = uv;\n  gl_Position = vec4(position.xy, 0.0, 1.0);\n}\n';
    const FRAG = `precision highp float;
uniform float iTime;
uniform vec3 iResolution;
uniform float hue;
uniform float hover;
uniform float rot;
uniform float hoverIntensity;
uniform vec3 backgroundColor;
varying vec2 vUv;
vec3 rgb2yiq(vec3 c) {
  float y = dot(c, vec3(0.299, 0.587, 0.114));
  float i = dot(c, vec3(0.596, -0.274, -0.322));
  float q = dot(c, vec3(0.211, -0.523, 0.312));
  return vec3(y, i, q);
}
vec3 yiq2rgb(vec3 c) {
  float r = c.x + 0.956 * c.y + 0.621 * c.z;
  float g = c.x - 0.272 * c.y - 0.647 * c.z;
  float b = c.x - 1.106 * c.y + 1.703 * c.z;
  return vec3(r, g, b);
}
vec3 adjustHue(vec3 color, float hueDeg) {
  float hueRad = hueDeg * 3.14159265 / 180.0;
  vec3 yiq = rgb2yiq(color);
  float cosA = cos(hueRad);
  float sinA = sin(hueRad);
  float i = yiq.y * cosA - yiq.z * sinA;
  float q = yiq.y * sinA + yiq.z * cosA;
  yiq.y = i;
  yiq.z = q;
  return yiq2rgb(yiq);
}
vec3 hash33(vec3 p3) {
  p3 = fract(p3 * vec3(0.1031, 0.11369, 0.13787));
  p3 += dot(p3, p3.yxz + 19.19);
  return -1.0 + 2.0 * fract(vec3(
    p3.x + p3.y,
    p3.x + p3.z,
    p3.y + p3.z
  ) * p3.zyx);
}
float snoise3(vec3 p) {
  const float K1 = 0.333333333;
  const float K2 = 0.166666667;
  vec3 i = floor(p + (p.x + p.y + p.z) * K1);
  vec3 d0 = p - (i - (i.x + i.y + i.z) * K2);
  vec3 e = step(vec3(0.0), d0 - d0.yzx);
  vec3 i1 = e * (1.0 - e.zxy);
  vec3 i2 = 1.0 - e.zxy * (1.0 - e);
  vec3 d1 = d0 - (i1 - K2);
  vec3 d2 = d0 - (i2 - K1);
  vec3 d3 = d0 - 0.5;
  vec4 h = max(0.6 - vec4(
    dot(d0, d0),
    dot(d1, d1),
    dot(d2, d2),
    dot(d3, d3)
  ), 0.0);
  vec4 n = h * h * h * h * vec4(
    dot(d0, hash33(i)),
    dot(d1, hash33(i + i1)),
    dot(d2, hash33(i + i2)),
    dot(d3, hash33(i + 1.0))
  );
  return dot(vec4(31.316), n);
}
vec4 extractAlpha(vec3 colorIn) {
  float a = max(max(colorIn.r, colorIn.g), colorIn.b);
  return vec4(colorIn.rgb / (a + 1e-5), a);
}
const vec3 baseColor1 = vec3(0.611765, 0.262745, 0.996078);
const vec3 baseColor2 = vec3(0.298039, 0.760784, 0.913725);
const vec3 baseColor3 = vec3(0.062745, 0.078431, 0.600000);
const float innerRadius = 0.6;
const float noiseScale = 0.65;
float light1(float intensity, float attenuation, float dist) {
  return intensity / (1.0 + dist * attenuation);
}
float light2(float intensity, float attenuation, float dist) {
  return intensity / (1.0 + dist * dist * attenuation);
}
vec4 draw(vec2 uv) {
  vec3 color1 = adjustHue(baseColor1, hue);
  vec3 color2 = adjustHue(baseColor2, hue);
  vec3 color3 = adjustHue(baseColor3, hue);
  float ang = atan(uv.y, uv.x);
  float len = length(uv);
  float invLen = len > 0.0 ? 1.0 / len : 0.0;
  float bgLuminance = dot(backgroundColor, vec3(0.299, 0.587, 0.114));
  float n0 = snoise3(vec3(uv * noiseScale, iTime * 0.5)) * 0.5 + 0.5;
  float r0 = mix(mix(innerRadius, 1.0, 0.4), mix(innerRadius, 1.0, 0.6), n0);
  float d0 = distance(uv, (r0 * invLen) * uv);
  float v0 = light1(1.0, 10.0, d0);
  v0 *= smoothstep(r0 * 1.05, r0, len);
  float innerFade = smoothstep(r0 * 0.8, r0 * 0.95, len);
  v0 *= mix(innerFade, 1.0, bgLuminance * 0.7);
  float cl = cos(ang + iTime * 2.0) * 0.5 + 0.5;
  float a = iTime * -1.0;
  vec2 pos = vec2(cos(a), sin(a)) * r0;
  float d = distance(uv, pos);
  float v1 = light2(1.5, 5.0, d);
  v1 *= light1(1.0, 50.0, d0);
  float v2 = smoothstep(1.0, mix(innerRadius, 1.0, n0 * 0.5), len);
  float v3 = smoothstep(innerRadius, mix(innerRadius, 1.0, 0.5), len);
  vec3 colBase = mix(color1, color2, cl);
  float fadeAmount = mix(1.0, 0.1, bgLuminance);
  vec3 darkCol = mix(color3, colBase, v0);
  darkCol = (darkCol + v1) * v2 * v3;
  darkCol = clamp(darkCol, 0.0, 1.0);
  vec3 lightCol = (colBase + v1) * mix(1.0, v2 * v3, fadeAmount);
  lightCol = mix(backgroundColor, lightCol, v0);
  lightCol = clamp(lightCol, 0.0, 1.0);
  vec3 finalCol = mix(darkCol, lightCol, bgLuminance);
  return extractAlpha(finalCol);
}
vec4 mainImage(vec2 fragCoord) {
  vec2 center = iResolution.xy * 0.5;
  float size = min(iResolution.x, iResolution.y);
  vec2 uv = (fragCoord - center) / size * 2.0;
  float angle = rot;
  float s = sin(angle);
  float c = cos(angle);
  uv = vec2(c * uv.x - s * uv.y, s * uv.x + c * uv.y);
  uv.x += hover * hoverIntensity * 0.1 * sin(uv.y * 10.0 + iTime);
  uv.y += hover * hoverIntensity * 0.1 * sin(uv.x * 10.0 + iTime);
  return draw(uv);
}
void main() {
  vec2 fragCoord = vUv * iResolution.xy;
  vec4 col = mainImage(fragCoord);
  gl_FragColor = vec4(col.rgb * col.a, col.a);
}
`;

    const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');

    document.querySelectorAll('[data-orb]').forEach(function (container) {
      const num = function (name, def) {
        const v = parseFloat(container.getAttribute(name));
        return Number.isFinite(v) ? v : def;
      };
      const rotateOnHover = container.getAttribute('data-no-rotate') !== 'true';
      const hexToVec3 = function (color) {
        return new T.Vector3().fromArray(__hex3(color));
      };
      const bgDark = container.getAttribute('data-bg') || '#000000';
      const bgLight = container.getAttribute('data-bg-light') || bgDark;
      const bgColor = function () {
        return document.documentElement.getAttribute('data-theme') === 'light' ? bgLight : bgDark;
      };

      const scene = new T.Scene();
      const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const geometry = new T.PlaneGeometry(2, 2);
      const material = new T.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        uniforms: {
          iTime: { value: 0 },
          iResolution: { value: new T.Vector3(1, 1, 1) },
          hue: { value: num('data-hue', 0) },
          hover: { value: 0 },
          rot: { value: 0 },
          hoverIntensity: { value: num('data-hover-intensity', 0.2) },
          backgroundColor: { value: hexToVec3(bgColor()) }
        }
      });
      const mesh = new T.Mesh(geometry, material);
      mesh.frustumCulled = false;
      scene.add(mesh);

      const canvas = document.createElement('canvas');
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      container.appendChild(canvas);
      let renderer;
      try {
        renderer = new T.WebGLRenderer({ canvas, antialias: false, alpha: true, premultipliedAlpha: false });
      } catch (err) { void err; canvas.remove(); return; }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x000000, 0);

      const resize = function () {
        const w = Math.max(container.clientWidth, 1);
        const h = Math.max(container.clientHeight, 1);
        renderer.setSize(w, h, false);
        material.uniforms.iResolution.value.set(canvas.width, canvas.height, canvas.width / canvas.height);
        renderer.render(scene, camera);
      };
      const ro = new ResizeObserver(resize);
      ro.observe(container);
      resize();

      let targetHover = 0;
      let lastTime = 0;
      let currentRot = 0;
      const rotationSpeed = 0.3;
      const onMove = function (e) {
        const rect = container.getBoundingClientRect();
        const size = Math.min(rect.width, rect.height);
        const uvX = ((e.clientX - rect.left - rect.width / 2) / size) * 2.0;
        const uvY = ((e.clientY - rect.top - rect.height / 2) / size) * 2.0;
        targetHover = Math.sqrt(uvX * uvX + uvY * uvY) < 0.8 ? 1 : 0;
      };
      const onLeave = function () { targetHover = 0; };

      let raf = 0;
      let inView = false;
      const loop = function (t) {
        if (document.hidden || !inView) { raf = 0; return; }
        raf = requestAnimationFrame(loop);
        const dt = (t - lastTime) * 0.001;
        lastTime = t;
        material.uniforms.iTime.value = t * 0.001;
        const uv = material.uniforms;
        uv.hover.value += (targetHover - uv.hover.value) * 0.1;
        if (rotateOnHover && targetHover > 0.5) currentRot += dt * rotationSpeed;
        uv.rot.value = currentRot;
        renderer.render(scene, camera);
      };
      const wake = function () {
        if (!raf && !reduceMQ.matches) {
          container.addEventListener('mousemove', onMove);
          container.addEventListener('mouseleave', onLeave);
          lastTime = performance.now();
          raf = requestAnimationFrame(loop);
        }
      };
      const sleep = function () {
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        container.removeEventListener('mousemove', onMove);
        container.removeEventListener('mouseleave', onLeave);
      };
      const io = new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        if (inView) wake(); else sleep();
      }, { rootMargin: '120px' });
      io.observe(container);
      document.addEventListener('visibilitychange', function () { if (document.hidden) sleep(); else if (inView) wake(); });
      const mo = new MutationObserver(function () {
        material.uniforms.backgroundColor.value = hexToVec3(bgColor());
        renderer.render(scene, camera);
      });
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      container.__orb = function () { return { running: !!raf, t: material.uniforms.iTime.value }; };
    });
  })();

  /* ---- LightPillar 光柱体积光 · [data-lightpillar] — three 官方同款 (含 quality/FPS cap) ---- */
  (function () {
    const T = window.THREE;
    if (!T) return;
    const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');

    document.querySelectorAll('[data-lightpillar]').forEach(function (container) {
      const num = function (name, def) {
        const v = parseFloat(container.getAttribute(name));
        return Number.isFinite(v) ? v : def;
      };
      const topColor = container.getAttribute('data-top') || '#5227FF';
      const bottomColor = container.getAttribute('data-bottom') || '#FF9FFC';
      const intensity = num('data-intensity', 1.0);
      const rotationSpeed = num('data-rotspeed', 0.3);
      const interactive = container.getAttribute('data-interactive') === 'true';
      const glowAmount = num('data-glow', 0.005);
      const pillarWidth = num('data-width', 3.0);
      const pillarHeight = num('data-height', 0.4);
      const noiseIntensity = num('data-noise', 0.5);
      const pillarRotation = num('data-rot', 0);

      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const isLowEndDevice = isMobile || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
      let effectiveQuality = container.getAttribute('data-quality') || 'high';
      if (isLowEndDevice && effectiveQuality === 'high') effectiveQuality = 'medium';
      if (isMobile && effectiveQuality !== 'low') effectiveQuality = 'low';
      const qualitySettings = {
        low: { iterations: 24, waveIterations: 1, pixelRatio: 0.5, precision: 'mediump', stepMultiplier: 1.5 },
        medium: { iterations: 40, waveIterations: 2, pixelRatio: 0.65, precision: 'mediump', stepMultiplier: 1.2 },
        high: { iterations: 80, waveIterations: 4, pixelRatio: Math.min(window.devicePixelRatio, 2), precision: 'highp', stepMultiplier: 1.0 }
      };
      const settings = qualitySettings[effectiveQuality] || qualitySettings.medium;

      const width = Math.max(container.clientWidth, 1);
      const height = Math.max(container.clientHeight, 1);
      const scene = new T.Scene();
      const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);

      const canvas = document.createElement('canvas');
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      container.appendChild(canvas);
      let renderer;
      try {
        renderer = new T.WebGLRenderer({
          canvas: canvas,
          antialias: false,
          alpha: true,
          powerPreference: effectiveQuality === 'high' ? 'high-performance' : 'low-power',
          precision: settings.precision,
          stencil: false,
          depth: false
        });
      } catch (err) { void err; canvas.remove(); return; }
      renderer.setSize(width, height, false);
      renderer.setPixelRatio(settings.pixelRatio);
      renderer.setClearColor(0x000000, 0);

      const parseColor = function (hex) {
        const color = new T.Color(hex);
        return new T.Vector3(color.r, color.g, color.b);
      };

      const vertexShader = 'varying vec2 vUv;\nvoid main() {\n  vUv = uv;\n  gl_Position = vec4(position, 1.0);\n}\n';
      const fragmentShader = `
precision ${settings.precision} float;
uniform float uTime;
uniform vec2 uResolution;
uniform vec2 uMouse;
uniform vec3 uTopColor;
uniform vec3 uBottomColor;
uniform float uIntensity;
uniform bool uInteractive;
uniform float uGlowAmount;
uniform float uPillarWidth;
uniform float uPillarHeight;
uniform float uNoiseIntensity;
uniform float uLightMode;
uniform float uRotCos;
uniform float uRotSin;
uniform float uPillarRotCos;
uniform float uPillarRotSin;
uniform float uWaveSin;
uniform float uWaveCos;
varying vec2 vUv;
const float STEP_MULT = ${settings.stepMultiplier.toFixed(1)};
const int MAX_ITER = ${settings.iterations};
const int WAVE_ITER = ${settings.waveIterations};
void main() {
  vec2 uv = (vUv * 2.0 - 1.0) * vec2(uResolution.x / uResolution.y, 1.0);
  uv = vec2(uPillarRotCos * uv.x - uPillarRotSin * uv.y, uPillarRotSin * uv.x + uPillarRotCos * uv.y);
  vec3 ro = vec3(0.0, 0.0, -10.0);
  vec3 rd = normalize(vec3(uv, 1.0));
  float rotC = uRotCos;
  float rotS = uRotSin;
  if(uInteractive && (uMouse.x != 0.0 || uMouse.y != 0.0)) {
    float a = uMouse.x * 6.283185;
    rotC = cos(a);
    rotS = sin(a);
  }
  vec3 col = vec3(0.0);
  float t = 0.1;
  for(int i = 0; i < MAX_ITER; i++) {
    vec3 p = ro + rd * t;
    p.xz = vec2(rotC * p.x - rotS * p.z, rotS * p.x + rotC * p.z);
    vec3 q = p;
    q.y = p.y * uPillarHeight + uTime;
    float freq = 1.0;
    float amp = 1.0;
    for(int j = 0; j < WAVE_ITER; j++) {
      q.xz = vec2(uWaveCos * q.x - uWaveSin * q.z, uWaveSin * q.x + uWaveCos * q.z);
      q += cos(q.zxy * freq - uTime * float(j) * 2.0) * amp;
      freq *= 2.0;
      amp *= 0.5;
    }
    float d = length(cos(q.xz)) - 0.2;
    float bound = length(p.xz) - uPillarWidth;
    float k = 4.0;
    float h = max(k - abs(d - bound), 0.0);
    d = max(d, bound) + h * h * 0.0625 / k;
    d = abs(d) * 0.15 + 0.01;
    float grad = clamp((15.0 - p.y) / 30.0, 0.0, 1.0);
    col += mix(uBottomColor, uTopColor, grad) / d;
    t += d * STEP_MULT;
    if(t > 50.0) break;
  }
  float widthNorm = uPillarWidth / 3.0;
  col = tanh(col * uGlowAmount / widthNorm);
  col -= fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) / 15.0 * uNoiseIntensity;
  vec3 result = clamp(col * uIntensity, 0.0, 1.0);
  if (uLightMode > 0.5) {
    float energy = max(result.r, max(result.g, result.b));
    vec3 hue = result / max(energy, 0.001);
    float coverage = smoothstep(0.025, 0.95, energy);
    hue = pow(clamp(hue, 0.0, 1.0), vec3(1.25));
    result = mix(vec3(1.0), hue, coverage * 0.94);
  }
  gl_FragColor = vec4(result, 1.0);
}
`;

      const pillarRotRad = (pillarRotation * Math.PI) / 180;
      const material = new T.ShaderMaterial({
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
        uniforms: {
          uTime: { value: 0 },
          uResolution: { value: new T.Vector2(width, height) },
          uMouse: { value: new T.Vector2(0, 0) },
          uTopColor: { value: parseColor(topColor) },
          uBottomColor: { value: parseColor(bottomColor) },
          uIntensity: { value: intensity },
          uInteractive: { value: interactive },
          uGlowAmount: { value: glowAmount },
          uPillarWidth: { value: pillarWidth },
          uPillarHeight: { value: pillarHeight },
          uNoiseIntensity: { value: noiseIntensity },
          uLightMode: { value: 0 },
          uRotCos: { value: 1.0 },
          uRotSin: { value: 0.0 },
          uPillarRotCos: { value: Math.cos(pillarRotRad) },
          uPillarRotSin: { value: Math.sin(pillarRotRad) },
          uWaveSin: { value: Math.sin(0.4) },
          uWaveCos: { value: Math.cos(0.4) }
        },
        transparent: true,
        depthWrite: false,
        depthTest: false
      });
      const geometry = new T.PlaneGeometry(2, 2);
      const mesh = new T.Mesh(geometry, material);
      mesh.frustumCulled = false;
      scene.add(mesh);

      let mouseMoveTimeout = null;
      const handleMouseMove = function (event) {
        if (mouseMoveTimeout) return;
        mouseMoveTimeout = window.setTimeout(function () { mouseMoveTimeout = null; }, 16);
        const rect = container.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        material.uniforms.uMouse.value.set(x, y);
      };

      let time = 0;
      let lastTime = performance.now();
      let raf = 0;
      let inView = false;
      const targetFPS = effectiveQuality === 'low' ? 30 : 60;
      const frameTime = 1000 / targetFPS;
      const animate = function (currentTime) {
        if (document.hidden || !inView) { raf = 0; return; }
        raf = requestAnimationFrame(animate);
        const deltaTime = currentTime - lastTime;
        if (deltaTime >= frameTime) {
          time += 0.016 * rotationSpeed;
          material.uniforms.uTime.value = time;
          material.uniforms.uRotCos.value = Math.cos(time * 0.3);
          material.uniforms.uRotSin.value = Math.sin(time * 0.3);
          renderer.render(scene, camera);
          lastTime = currentTime - (deltaTime % frameTime);
        }
      };
      const wake = function () {
        if (!raf && !reduceMQ.matches) {
          if (interactive) container.addEventListener('mousemove', handleMouseMove, { passive: true });
          lastTime = performance.now();
          raf = requestAnimationFrame(animate);
        }
      };
      const sleep = function () {
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        if (interactive) container.removeEventListener('mousemove', handleMouseMove);
      };
      const io = new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        if (inView) wake(); else sleep();
      }, { rootMargin: '120px' });
      io.observe(container);
      document.addEventListener('visibilitychange', function () { if (document.hidden) sleep(); else if (inView) wake(); });
      const onResize = function () {
        const w = Math.max(container.clientWidth, 1);
        const h = Math.max(container.clientHeight, 1);
        renderer.setSize(w, h, false);
        material.uniforms.uResolution.value.set(w, h);
      };
      const ro = new ResizeObserver(onResize);
      ro.observe(container);
      renderer.render(scene, camera);
      container.__lightpillar = function () { return { running: !!raf, t: time }; };
    });
  })();

  /* ---- Scanner 扫描波纹 · [data-scanner] — ogl webgl2 GLSL300 原样 → raw WebGL2 ---- */
  (function () {
    const VERT = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;
    const FRAG = `#version 300 es
precision highp float;
uniform vec2 iResolution;
uniform float iTime;
uniform float uSpeed;
uniform float uSweepSpeed;
uniform float uSweepWidth;
uniform float uSweepFalloff;
uniform float uScale;
uniform float uFrequency;
uniform float uRipple;
uniform float uBandDensity;
uniform float uLineSharpness;
uniform float uGlow;
uniform float uColorSpread;
uniform float uBrightness;
uniform float uContrast;
uniform float uSoftness;
uniform float uVignette;
uniform float uOpacity;
uniform float uScanline;
uniform float uGrain;
uniform float uGrainIntensity;
uniform float uDirection;
uniform vec2 uMouse;
uniform float uMouseEnabled;
uniform float uMouseRadius;
uniform float uMouseStrength;
uniform float uMouseActive;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
out vec4 fragColor;
const float TAU = 6.2831853;
float signalField(vec2 p, float t) {
  float w = sin(p.x * 1.3 + t * 0.7);
  w += sin(p.y * 1.7 - t * 0.52) * 0.8;
  w += sin((p.x + p.y) * 0.9 + t * 0.91) * 0.6;
  w += sin((p.x - p.y) * 1.53 - t * 0.63) * 0.42;
  return w * 0.35;
}
vec3 palette(float f) {
  f = clamp(f, 0.0, 1.0);
  f = pow(f, uContrast);
  vec3 c = mix(uColor1, uColor2, smoothstep(0.08, 0.6, f));
  return mix(c, uColor3, smoothstep(0.68, 1.0, f));
}
float scanBand(float x, float aa, float sharp) {
  float v = mix(0.5, 0.5 + 0.5 * cos(x * TAU), aa);
  return pow(v, sharp);
}
void main() {
  float aspect = iResolution.x / iResolution.y;
  vec2 uv0 = (gl_FragCoord.xy * 2.0 - iResolution.xy) / iResolution.y;
  vec2 p = uv0 / max(uScale, 0.001);
  float t = iTime * uSpeed;
  float mouseBoost = 0.0;
  if (uMouseEnabled > 0.5) {
    vec2 mUv = vec2((uMouse.x * 2.0 - 1.0) * aspect, uMouse.y * 2.0 - 1.0);
    vec2 md = uv0 - mUv;
    float r = max(uMouseRadius, 0.001);
    mouseBoost = exp(-dot(md, md) / (r * r)) * uMouseStrength * uMouseActive;
  }
  float axis;
  if (uDirection < 0.5) axis = p.y;
  else if (uDirection < 1.5) axis = p.x;
  else axis = (p.x + p.y) * 0.70710678;
  float sig = signalField(p * uFrequency, t);
  float coord = axis + sig * uRipple;
  float phase = coord / max(uSweepWidth, 0.05) - t * uSweepSpeed;
  float sweep = pow(0.5 + 0.5 * cos(phase * TAU), max(uSweepFalloff, 0.1));
  float lc = coord * uBandDensity;
  float aa = 1.0 / (1.0 + uSoftness * fwidth(lc) * 3.0);
  aa = clamp(aa * (1.0 + mouseBoost * 0.6), 0.0, 1.0);
  float bodyBase = clamp(0.5 + 0.5 * sig, 0.0, 1.0);
  float body = bodyBase * bodyBase * uGlow * sweep;
  float sharp = max(uLineSharpness, 0.1);
  float split = uColorSpread * 0.16;
  float fr = clamp(scanBand(lc + split, aa, sharp) * sweep + body, 0.0, 1.0);
  float fg = clamp(scanBand(lc, aa, sharp) * sweep + body, 0.0, 1.0);
  float fb = clamp(scanBand(lc - split, aa, sharp) * sweep + body, 0.0, 1.0);
  vec3 col = vec3(palette(fr).r, palette(fg).g, palette(fb).b);
  float inten = (fr + fg + fb) * 0.3333333 * uBrightness;
  inten *= 1.0 + mouseBoost * 0.9;
  if (uScanline > 0.5) {
    inten *= 1.0 - 0.18 * (0.5 + 0.5 * cos(gl_FragCoord.y * 1.7));
  }
  if (uGrain > 0.5) {
    float g = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)) + iTime) * 43758.5453);
    inten += (g - 0.5) * uGrainIntensity;
  }
  inten *= clamp(1.0 - uVignette * smoothstep(0.55, 1.65, length(uv0)), 0.0, 1.0);
  inten = clamp(inten, 0.0, 1.0);
  float a = clamp(inten * uOpacity, 0.0, 1.0);
  fragColor = vec4(clamp(col, 0.0, 1.0) * a, a);
}
`;
    const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
    const dirVal = function (dir) { return dir === 'horizontal' ? 1.0 : dir === 'diagonal' ? 2.0 : 0.0; };

    document.querySelectorAll('[data-scanner]').forEach(function (container) {
      const num = function (name, def) {
        const v = parseFloat(container.getAttribute(name));
        return Number.isFinite(v) ? v : def;
      };
      const canvas = document.createElement('canvas');
      canvas.setAttribute('aria-hidden', 'true');
      container.appendChild(canvas);
      const ctx = __fsGL2(canvas, VERT, FRAG, { alpha: true, premul: true, clear: [0, 0, 0, 0] });
      if (!ctx) { canvas.remove(); return; }
      const gl = ctx.gl;
      const u = ctx.u;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      let tNow = 0;

      gl.uniform2f(u.iResolution, 1, 1);
      gl.uniform1f(u.iTime, 0);
      gl.uniform1f(u.uSpeed, num('data-speed', 0.5));
      gl.uniform1f(u.uSweepSpeed, num('data-sweep-speed', 0.25));
      gl.uniform1f(u.uSweepWidth, num('data-sweep-width', 1.6));
      gl.uniform1f(u.uSweepFalloff, num('data-sweep-falloff', 6));
      gl.uniform1f(u.uScale, num('data-scale', 1.5));
      gl.uniform1f(u.uFrequency, num('data-frequency', 2));
      gl.uniform1f(u.uRipple, num('data-ripple', 0.22));
      gl.uniform1f(u.uBandDensity, num('data-band-density', 11));
      gl.uniform1f(u.uLineSharpness, num('data-line-sharpness', 5.5));
      gl.uniform1f(u.uGlow, num('data-glow', 0.22));
      gl.uniform1f(u.uColorSpread, num('data-color-spread', 0.7));
      gl.uniform1f(u.uBrightness, num('data-brightness', 1.0));
      gl.uniform1f(u.uContrast, num('data-contrast', 1.15));
      gl.uniform1f(u.uSoftness, num('data-softness', 1.4));
      gl.uniform1f(u.uVignette, num('data-vignette', 0.45));
      gl.uniform1f(u.uOpacity, num('data-opacity', 1.0));
      gl.uniform1f(u.uScanline, container.getAttribute('data-scanline') === 'false' ? 0 : 1);
      gl.uniform1f(u.uGrain, container.getAttribute('data-grain') === 'false' ? 0 : 1);
      gl.uniform1f(u.uGrainIntensity, num('data-grain-intensity', 0.05));
      gl.uniform1f(u.uDirection, dirVal(container.getAttribute('data-direction') || 'vertical'));
      gl.uniform2f(u.uMouse, 0.5, 0.5);
      gl.uniform1f(u.uMouseEnabled, container.getAttribute('data-no-mouse') === 'true' ? 0 : 1);
      gl.uniform1f(u.uMouseRadius, num('data-mouse-radius', 0.5));
      gl.uniform1f(u.uMouseStrength, num('data-mouse-strength', 0.5));
      gl.uniform1f(u.uMouseActive, 0);
      gl.uniform3fv(u.uColor1, __hex3(container.getAttribute('data-color1') || '#5227FF'));
      gl.uniform3fv(u.uColor2, __hex3(container.getAttribute('data-color2') || '#FF9FFC'));
      gl.uniform3fv(u.uColor3, __hex3(container.getAttribute('data-color3') || '#FFFFFF'));

      const setSize = function () {
        ctx.resize(container.clientWidth, container.clientHeight, dpr);
        gl.uniform2f(u.iResolution, canvas.width, canvas.height);
        ctx.render();
      };
      const ro = new ResizeObserver(setSize);
      ro.observe(container);
      setSize();

      const currentMouse = [0.5, 0.5];
      const targetMouse = [0.5, 0.5];
      let mouseActive = 0;
      let targetMouseActive = 0;
      const onMouseMove = function (e) {
        const rect = canvas.getBoundingClientRect();
        targetMouse[0] = (e.clientX - rect.left) / rect.width;
        targetMouse[1] = 1.0 - (e.clientY - rect.top) / rect.height;
        targetMouseActive = 1;
      };
      const onMouseLeave = function () { targetMouseActive = 0; };

      let raf = 0;
      let inView = false;
      let t0 = 0;
      const loop = function (t) {
        if (document.hidden || !inView) { raf = 0; return; }
        raf = requestAnimationFrame(loop);
        if (!t0) t0 = t;
        tNow = (t - t0) * 0.001;
        gl.uniform1f(u.iTime, tNow);
        currentMouse[0] += 0.05 * (targetMouse[0] - currentMouse[0]);
        currentMouse[1] += 0.05 * (targetMouse[1] - currentMouse[1]);
        gl.uniform2f(u.uMouse, currentMouse[0], currentMouse[1]);
        mouseActive += 0.05 * (targetMouseActive - mouseActive);
        gl.uniform1f(u.uMouseActive, mouseActive);
        ctx.render();
      };
      const wake = function () {
        if (!raf && !reduceMQ.matches) {
          t0 = 0;
          canvas.addEventListener('mousemove', onMouseMove);
          canvas.addEventListener('mouseleave', onMouseLeave);
          raf = requestAnimationFrame(loop);
        }
      };
      const sleep = function () {
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        canvas.removeEventListener('mousemove', onMouseMove);
        canvas.removeEventListener('mouseleave', onMouseLeave);
      };
      const io = new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        if (inView) wake(); else sleep();
      }, { rootMargin: '120px' });
      io.observe(container);
      document.addEventListener('visibilitychange', function () { if (document.hidden) sleep(); else if (inView) wake(); });
      container.__scanner = function () { return { running: !!raf, t: tNow }; };
    });
  })();

  /* ---- GhostFibers 幽灵纤维 · [data-ghostfibers] — ogl webgl2 GLSL300 原样 → raw WebGL2 (含官方 lightMode 墨色转换) ---- */
  (function () {
    const VERT = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;
    const FRAG = `#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform float uSpeed;
uniform float uScale;
uniform float uRotation;
uniform float uLayers;
uniform float uWaveAmplitude;
uniform float uWaveFrequency;
uniform float uWaveSpeed;
uniform float uLayerSpeed;
uniform float uTwist;
uniform float uTwistFrequency;
uniform float uTwistSpeed;
uniform float uLineFrequency;
uniform float uLineSpacing;
uniform float uLineSharpness;
uniform float uGlowFalloff;
uniform float uGlowIntensity;
uniform float uBrightness;
uniform float uBlueBoost;
uniform float uVignette;
uniform float uGrain;
uniform float uRotationSpeed;
uniform float uLightMode;
uniform vec3 uLineColor;
uniform vec3 uGlowColor;
out vec4 fragColor;
#define MAX_LAYERS 10
mat2 rotate2d(float angle) {
  float sine = sin(angle);
  float cosine = cos(angle);
  return mat2(cosine, -sine, sine, cosine);
}
float grainHash(vec2 point) {
  point = floor(point);
  float hash = 52.9829189 * fract(dot(point, vec2(0.065, 0.005)));
  return fract(hash);
}
float layeredGrain(vec2 fragmentPixel) {
  vec2 point = mod(fragmentPixel + vec2(uTime * 30.0, -uTime * 21.0), 1024.0);
  vec2 rotated = mat2(0.8, -0.5, 0.5, 0.8) * point;
  float grain = 0.0;
  grain += 0.40 * grainHash(rotated);
  grain += 0.25 * grainHash(rotated * 2.0 + 17.0);
  grain += 0.20 * grainHash(rotated * 4.0 + 47.0);
  grain += 0.10 * grainHash(rotated * 8.0 + 113.0);
  grain += 0.05 * grainHash(rotated * 16.0 + 191.0);
  return grain;
}
void main() {
  vec2 resolution = max(uResolution, vec2(1.0));
  vec2 uv = (2.0 * gl_FragCoord.xy - resolution) / resolution.y;
  float time = uTime * uSpeed;
  vec3 backdrop = mix(vec3(0.070588, 0.058824, 0.090196), vec3(1.0), step(0.5, uLightMode));
  vec3 centerTone = max(uLineColor * 0.85567 - uGlowColor * 0.06186, vec3(0.0));
  vec3 cloudTone = uLineColor * 0.19588 + uGlowColor * 0.2268;
  vec2 p = uv;
  p /= max(uScale, 0.05);
  p = rotate2d(radians(uRotation) + time * uRotationSpeed) * p;
  vec3 color = vec3(0.0);
  float fiberField = 0.0;
  for (int index = 0; index < MAX_LAYERS; index++) {
    float fi = float(index) + 1.0;
    if (fi > uLayers) break;
    p += uWaveAmplitude * sin(p.yx * fi * uWaveFrequency + time * (uWaveSpeed + fi * uLayerSpeed));
    float radius = length(p);
    float polarAngle = atan(p.y, p.x);
    polarAngle += sin(radius * uTwistFrequency - time * uTwistSpeed + fi) * uTwist;
    p = vec2(cos(polarAngle), sin(polarAngle)) * radius;
    float lines = abs(sin(p.x * (uLineFrequency + fi * uLineSpacing) + sin(p.y * 3.0 + time)));
    lines = pow(max(0.0, 1.0 - lines), uLineSharpness);
    fiberField += lines / fi;
    color += uLineColor * lines / fi;
    float glow = exp(-uGlowFalloff * abs(sin(p.x * 3.0 + time + fi)));
    color += uGlowColor * glow * uGlowIntensity / (fi * 2.0);
  }
  float center = exp(-2.2 * dot(uv, uv));
  color += centerTone * center;
  float cloud = exp(-1.5 * length(uv + vec2(sin(time * 0.3) * 0.25, cos(time * 0.25) * 0.18)));
  color += cloudTone * cloud;
  float vignette = 1.0 - smoothstep(0.35, 1.45, length(uv));
  color *= mix(1.0 - uVignette, 1.0, vignette);
  color = 1.0 - exp(-color * uBrightness);
  color.b *= uBlueBoost;
  vec3 outputColor;
  if (uLightMode > 0.5) {
    float edgeFade = mix(1.0 - uVignette, 1.0, vignette);
    float fibers = pow(smoothstep(0.12, 1.05, fiberField) * edgeFade, 1.5);
    float atmosphere = (center * 0.025 + cloud * 0.015) * edgeFade;
    vec3 fiberInk = mix(backdrop, uLineColor, 0.52);
    vec3 airColor = mix(backdrop, uGlowColor, 0.16);
    outputColor = mix(backdrop, airColor, atmosphere);
    outputColor = mix(outputColor, fiberInk, fibers * 0.3);
  } else {
    outputColor = backdrop + color;
  }
  float noise = (layeredGrain(gl_FragCoord.xy) - 0.5) * uGrain;
  outputColor = clamp(outputColor + noise, 0.0, 1.0);
  fragColor = vec4(outputColor, 1.0);
}
`;

    document.querySelectorAll('[data-ghostfibers]').forEach(function (container) {
      const num = function (name, def) {
        const v = parseFloat(container.getAttribute(name));
        return Number.isFinite(v) ? v : def;
      };
      const canvas = document.createElement('canvas');
      canvas.setAttribute('aria-hidden', 'true');
      container.appendChild(canvas);
      const ctx = __fsGL2(canvas, VERT, FRAG, { alpha: false, clear: [0, 0, 0, 1] });
      if (!ctx) { canvas.remove(); return; }
      const gl = ctx.gl;
      const u = ctx.u;
      const dpr = Math.min(Math.max(num('data-dpr', 1), 0.5), 2);

      gl.uniform2f(u.uResolution, 1, 1);
      gl.uniform1f(u.uTime, 0);
      gl.uniform1f(u.uSpeed, num('data-speed', 0.2));
      gl.uniform1f(u.uScale, num('data-scale', 2));
      gl.uniform1f(u.uRotation, num('data-rotation', 0));
      gl.uniform1f(u.uRotationSpeed, num('data-rotation-speed', 0.25));
      gl.uniform1f(u.uLayers, Math.min(Math.max(Math.round(num('data-layers', 4)), 1), 10));
      gl.uniform1f(u.uWaveAmplitude, num('data-wave-amplitude', 0.015));
      gl.uniform1f(u.uWaveFrequency, num('data-wave-frequency', 3));
      gl.uniform1f(u.uWaveSpeed, num('data-wave-speed', 0.15));
      gl.uniform1f(u.uLayerSpeed, num('data-layer-speed', 0.08));
      gl.uniform1f(u.uTwist, num('data-twist', 0.1));
      gl.uniform1f(u.uTwistFrequency, num('data-twist-frequency', 5));
      gl.uniform1f(u.uTwistSpeed, num('data-twist-speed', 1.2));
      gl.uniform1f(u.uLineFrequency, num('data-line-frequency', 5));
      gl.uniform1f(u.uLineSpacing, num('data-line-spacing', 2));
      gl.uniform1f(u.uLineSharpness, num('data-line-sharpness', 16));
      gl.uniform1f(u.uGlowFalloff, num('data-glow-falloff', 10));
      gl.uniform1f(u.uGlowIntensity, num('data-glow-intensity', 1.6));
      gl.uniform1f(u.uBrightness, num('data-brightness', 2));
      gl.uniform1f(u.uBlueBoost, num('data-blue-boost', 1.25));
      gl.uniform1f(u.uVignette, num('data-vignette', 0.8));
      gl.uniform1f(u.uGrain, num('data-grain', 0.05));
      /* 官方 lightMode 墨色在白底上过淡近乎不可见, 该组件按 screen 系先例双主题保持暗色 */
      gl.uniform1f(u.uLightMode, 0);
      gl.uniform3fv(u.uLineColor, __hex3(container.getAttribute('data-line-color') || '#140E35'));
      gl.uniform3fv(u.uGlowColor, __hex3(container.getAttribute('data-glow-color') || '#3437A0'));

      let frameId = 0;
      let elapsed = 0;
      let previousTime = performance.now();
      let lastRenderTime = 0;
      const frameRate = Math.min(Math.max(num('data-fps', 60), 1), 120);
      let inView = false;
      const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
      const render = ctx.render;
      const loop = function (now) {
        frameId = 0;
        if (document.hidden || !inView || reduceMQ.matches) return;
        const delta = Math.min((now - previousTime) / 1000, 0.1);
        previousTime = now;
        elapsed += delta;
        if (now - lastRenderTime >= 1000 / frameRate - 0.5) {
          gl.uniform1f(u.uTime, elapsed);
          render();
          lastRenderTime = now;
        }
        frameId = requestAnimationFrame(loop);
      };
      const start = function () {
        if (document.hidden || !inView || reduceMQ.matches || frameId !== 0) return;
        previousTime = performance.now();
        frameId = requestAnimationFrame(loop);
      };
      const stop = function () {
        if (frameId !== 0) cancelAnimationFrame(frameId);
        frameId = 0;
      };
      const setSize = function () {
        ctx.resize(container.clientWidth, container.clientHeight, dpr);
        gl.uniform2f(u.uResolution, canvas.width, canvas.height);
        render();
      };
      const ro = new ResizeObserver(setSize);
      ro.observe(container);
      const io = new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        if (inView) start(); else stop();
      }, { rootMargin: '120px' });
      io.observe(container);
      document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else start(); });
      setSize();
      start();
      container.__ghostfibers = function () { return { running: !!frameId, t: elapsed }; };
    });
  })();

  /* ---- Balatro 卡牌漩涡 · [data-balatro] — ogl GLSL1 → three 原样 ---- */
  (function () {
    const T = window.THREE;
    if (!T) return;
    const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');

    const VERT = 'varying vec2 vUv;\nvoid main() {\n  vUv = uv;\n  gl_Position = vec4(position.xy, 0.0, 1.0);\n}\n';
    const FRAG = `precision highp float;
#define PI 3.14159265359
uniform float iTime;
uniform vec3 iResolution;
uniform float uSpinRotation;
uniform float uSpinSpeed;
uniform vec2 uOffset;
uniform vec4 uColor1;
uniform vec4 uColor2;
uniform vec4 uColor3;
uniform float uContrast;
uniform float uLighting;
uniform float uSpinAmount;
uniform float uPixelFilter;
uniform float uSpinEase;
uniform bool uIsRotate;
uniform vec2 uMouse;
varying vec2 vUv;
vec4 effect(vec2 screenSize, vec2 screen_coords) {
    float pixel_size = length(screenSize.xy) / uPixelFilter;
    vec2 uv = (floor(screen_coords.xy * (1.0 / pixel_size)) * pixel_size - 0.5 * screenSize.xy) / length(screenSize.xy) - uOffset;
    float uv_len = length(uv);
    float speed = (uSpinRotation * uSpinEase * 0.2);
    if(uIsRotate){
       speed = iTime * speed;
    }
    speed += 302.2;
    float mouseInfluence = (uMouse.x * 2.0 - 1.0);
    speed += mouseInfluence * 0.1;
    float new_pixel_angle = atan(uv.y, uv.x) + speed - uSpinEase * 20.0 * (uSpinAmount * uv_len + (1.0 - uSpinAmount));
    vec2 mid = (screenSize.xy / length(screenSize.xy)) / 2.0;
    uv = (vec2(uv_len * cos(new_pixel_angle) + mid.x, uv_len * sin(new_pixel_angle) + mid.y) - mid);
    uv *= 30.0;
    float baseSpeed = iTime * uSpinSpeed;
    speed = baseSpeed + mouseInfluence * 2.0;
    vec2 uv2 = vec2(uv.x + uv.y);
    for(int i = 0; i < 5; i++) {
        uv2 += sin(max(uv.x, uv.y)) + uv;
        uv += 0.5 * vec2(
            cos(5.1123314 + 0.353 * uv2.y + speed * 0.131121),
            sin(uv2.x - 0.113 * speed)
        );
        uv -= cos(uv.x + uv.y) - sin(uv.x * 0.711 - uv.y);
    }
    float contrast_mod = (0.25 * uContrast + 0.5 * uSpinAmount + 1.2);
    float paint_res = min(2.0, max(0.0, length(uv) * 0.035 * contrast_mod));
    float c1p = max(0.0, 1.0 - contrast_mod * abs(1.0 - paint_res));
    float c2p = max(0.0, 1.0 - contrast_mod * abs(paint_res));
    float c3p = 1.0 - min(1.0, c1p + c2p);
    float light = (uLighting - 0.2) * max(c1p * 5.0 - 4.0, 0.0) + uLighting * max(c2p * 5.0 - 4.0, 0.0);
    return (0.3 / uContrast) * uColor1 + (1.0 - 0.3 / uContrast) * (uColor1 * c1p + uColor2 * c2p + vec4(c3p * uColor3.rgb, c3p * uColor1.a)) + light;
}
void main() {
    vec2 uv = vUv * iResolution.xy;
    gl_FragColor = effect(iResolution.xy, uv);
}
`;

    const hexToVec4 = function (hex) {
      let s = (hex || '').replace('#', '');
      let r = 0, g = 0, b = 0, a = 1;
      if (s.length === 6) {
        r = parseInt(s.slice(0, 2), 16) / 255;
        g = parseInt(s.slice(2, 4), 16) / 255;
        b = parseInt(s.slice(4, 6), 16) / 255;
      } else if (s.length === 8) {
        r = parseInt(s.slice(0, 2), 16) / 255;
        g = parseInt(s.slice(2, 4), 16) / 255;
        b = parseInt(s.slice(4, 6), 16) / 255;
        a = parseInt(s.slice(6, 8), 16) / 255;
      }
      return new T.Vector4(r, g, b, a);
    };

    document.querySelectorAll('[data-balatro]').forEach(function (container) {
      const num = function (name, def) {
        const v = parseFloat(container.getAttribute(name));
        return Number.isFinite(v) ? v : def;
      };
      const mouseInteraction = container.getAttribute('data-no-mouse') !== 'true';
      const scene = new T.Scene();
      const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const geometry = new T.PlaneGeometry(2, 2);
      const material = new T.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: {
          iTime: { value: 0 },
          iResolution: { value: new T.Vector3(1, 1, 1) },
          uSpinRotation: { value: num('data-spin-rotation', -2.0) },
          uSpinSpeed: { value: num('data-spin-speed', 7.0) },
          uOffset: { value: new T.Vector2(num('data-offset-x', 0), num('data-offset-y', 0)) },
          uColor1: { value: hexToVec4(container.getAttribute('data-color1') || '#DE443B') },
          uColor2: { value: hexToVec4(container.getAttribute('data-color2') || '#006BB4') },
          uColor3: { value: hexToVec4(container.getAttribute('data-color3') || '#162325') },
          uContrast: { value: num('data-contrast', 3.5) },
          uLighting: { value: num('data-lighting', 0.4) },
          uSpinAmount: { value: num('data-spin-amount', 0.25) },
          uPixelFilter: { value: num('data-pixel-filter', 745.0) },
          uSpinEase: { value: num('data-spin-ease', 1.0) },
          uIsRotate: { value: container.getAttribute('data-rotate') === 'true' },
          uMouse: { value: new T.Vector2(0.5, 0.5) }
        }
      });
      const mesh = new T.Mesh(geometry, material);
      mesh.frustumCulled = false;
      scene.add(mesh);

      const canvas = document.createElement('canvas');
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      container.appendChild(canvas);
      let renderer;
      try {
        renderer = new T.WebGLRenderer({ canvas: canvas, antialias: false, alpha: false });
      } catch (err) { void err; canvas.remove(); return; }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x000000, 1);

      const resize = function () {
        const w = Math.max(container.clientWidth, 1);
        const h = Math.max(container.clientHeight, 1);
        renderer.setSize(w, h, false);
        material.uniforms.iResolution.value.set(canvas.width, canvas.height, canvas.width / canvas.height);
        renderer.render(scene, camera);
      };
      const ro = new ResizeObserver(resize);
      ro.observe(container);
      resize();

      const onMove = function (e) {
        if (!mouseInteraction) return;
        const rect = container.getBoundingClientRect();
        material.uniforms.uMouse.value.set(
          (e.clientX - rect.left) / rect.width,
          1.0 - (e.clientY - rect.top) / rect.height
        );
      };

      let raf = 0;
      let inView = false;
      let t0 = 0;
      const loop = function (t) {
        if (document.hidden || !inView) { raf = 0; return; }
        raf = requestAnimationFrame(loop);
        if (!t0) t0 = t;
        material.uniforms.iTime.value = (t - t0) * 0.001;
        renderer.render(scene, camera);
      };
      const wake = function () {
        if (!raf && !reduceMQ.matches) {
          t0 = 0;
          container.addEventListener('mousemove', onMove, { passive: true });
          raf = requestAnimationFrame(loop);
        }
      };
      const sleep = function () {
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        container.removeEventListener('mousemove', onMove);
      };
      const io = new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        if (inView) wake(); else sleep();
      }, { rootMargin: '120px' });
      io.observe(container);
      document.addEventListener('visibilitychange', function () { if (document.hidden) sleep(); else if (inView) wake(); });
      container.__balatro = function () { return { running: !!raf, t: material.uniforms.iTime.value }; };
    });
  })();

  /* ---- Topography 等高线地形 · [data-topography] — ogl webgl2 GLSL300 原样 → raw WebGL2 ---- */
  (function () {
    const VERT = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;
    const FRAG = `#version 300 es
precision highp float;
uniform vec2 iResolution;
uniform float iTime;
uniform float uMorphAmount;
uniform float uBands;
uniform float uThickness;
uniform float uScale;
uniform float uPixelSize;
uniform float uGlow;
uniform float uColorMode;
uniform float uContrast;
uniform float uBrightness;
uniform float uFillBands;
uniform float uOpacity;
uniform float uLightMode;
uniform vec3 uLow;
uniform vec3 uMid;
uniform vec3 uHigh;
uniform vec2 uMouse;
uniform float uMouseEnabled;
uniform float uMouseRadius;
uniform float uMouseStrength;
uniform float uMouseActive;
uniform float uGrain;
uniform float uGrainIntensity;
uniform vec4 uCtrlA;
uniform vec4 uCtrlB;
uniform vec4 uCtrlC;
uniform vec4 uCtrlD;
out vec4 fragColor;
float bez(float t, vec4 c) {
  float w = 6.2831853 * t;
  return 0.5 * (c.x * sin(w) + c.y * cos(w) + c.z * sin(2.0 * w) + c.w * cos(2.0 * w));
}
float field(vec2 uv) {
  vec2 a = vec2(bez(uv.x, uCtrlA), bez(uv.x, uCtrlB));
  vec2 b = vec2(bez(uv.y, uCtrlC), bez(uv.y, uCtrlD));
  return distance(a, b);
}
vec3 elevationColor(float e) {
  vec3 c = mix(uLow, uMid, smoothstep(0.0, 0.5, e));
  c = mix(c, uHigh, smoothstep(0.5, 1.0, e));
  return c;
}
void main() {
  vec2 res = iResolution.xy;
  vec2 uv = gl_FragCoord.xy / res;
  vec2 suv = (uv - 0.5) / max(uScale, 0.001) + 0.5;
  vec2 sampleUv = suv;
  if (uPixelSize > 1.0) {
    vec2 px = res / uPixelSize;
    sampleUv = (floor(suv * px) + 0.5) / px;
  }
  float fv = field(sampleUv);
  if (uMouseEnabled > 0.5) {
    vec2 d = uv - uMouse;
    d.x *= res.x / max(res.y, 1.0);
    float r = max(uMouseRadius, 0.001);
    float bump = exp(-dot(d, d) / (r * r)) * uMouseStrength * uMouseActive;
    fv += bump;
  }
  float f = fv * uBands;
  float frac = fract(f);
  float lineDist = min(frac, 1.0 - frac);
  float aa = fwidth(f) + 0.0001;
  float mask = 1.0 - smoothstep(uThickness - aa, uThickness + aa, lineDist);
  float glowR = uThickness + uGlow * 0.5 + aa;
  float glow = (1.0 - smoothstep(uThickness, glowR, lineDist)) * step(0.0001, uGlow);
  float elev = clamp(fv / (uMorphAmount * 2.5 + 0.001), 0.0, 1.0);
  vec3 lineCol;
  if (uColorMode < 0.5) {
    lineCol = elevationColor(elev);
  } else if (uColorMode < 1.5) {
    lineCol = uMid;
  } else {
    float parity = mod(floor(f), 2.0);
    lineCol = mix(uMid, uHigh, parity);
  }
  float coverage = clamp(mask + glow * 0.55, 0.0, 1.0);
  coverage = pow(coverage, max(uContrast, 0.001));
  vec3 outColor = lineCol;
  float outAlpha = coverage;
  if (uFillBands > 0.5) {
    vec3 fillCol = elevationColor(elev);
    float fillA = 0.1 * elev;
    outColor = mix(fillCol, lineCol, coverage);
    outAlpha = clamp(coverage + fillA, 0.0, 1.0);
  }
  if (uGrain > 0.5) {
    float g = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)) + iTime) * 43758.5453);
    outAlpha += (g - 0.5) * uGrainIntensity;
  }
  outColor *= uBrightness;
  outColor = clamp(outColor, 0.0, 1.0);
  float a = clamp(outAlpha, 0.0, 1.0) * uOpacity;
  if (uLightMode > 0.5) {
    float peak = max(outColor.r, max(outColor.g, outColor.b));
    vec3 chroma = pow(clamp(outColor / max(peak, 0.0001), 0.0, 1.0), vec3(1.18));
    fragColor = vec4(mix(vec3(1.0), chroma, a * 0.94), 1.0);
  } else {
    fragColor = vec4(outColor * a, a);
  }
}
`;
    const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
    const CTRL_INDICES = [
      [1, -2, 3, -4],
      [9, -8, 7, -6],
      [5, 2, 5, -5],
      [-1, -3, 8, 9]
    ];

    document.querySelectorAll('[data-topography]').forEach(function (container) {
      const num = function (name, def) {
        const v = parseFloat(container.getAttribute(name));
        return Number.isFinite(v) ? v : def;
      };
      const canvas = document.createElement('canvas');
      canvas.setAttribute('aria-hidden', 'true');
      container.appendChild(canvas);
      const ctx = __fsGL2(canvas, VERT, FRAG, { alpha: true, premul: true, clear: [0, 0, 0, 0] });
      if (!ctx) { canvas.remove(); return; }
      const gl = ctx.gl;
      const u = ctx.u;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const speed = num('data-speed', 0.35);
      const morphAmount = num('data-morph-amount', 3.0);
      const morphSpeed = num('data-morph-speed', 0.05);
      const mode = container.getAttribute('data-color-mode');
      const ctrl = [new Float32Array(4), new Float32Array(4), new Float32Array(4), new Float32Array(4)];

      gl.uniform2f(u.iResolution, 1, 1);
      gl.uniform1f(u.iTime, 0);
      gl.uniform1f(u.uMorphAmount, morphAmount);
      gl.uniform1f(u.uBands, num('data-bands', 2.0));
      gl.uniform1f(u.uThickness, num('data-thickness', 0.01));
      gl.uniform1f(u.uScale, num('data-scale', 1.0));
      gl.uniform1f(u.uPixelSize, num('data-pixel-size', 1.0));
      gl.uniform1f(u.uGlow, num('data-glow', 0.5));
      gl.uniform1f(u.uColorMode, mode === 'uniform' ? 1.0 : mode === 'alternating' ? 2.0 : 0.0);
      gl.uniform1f(u.uContrast, num('data-contrast', 3.0));
      gl.uniform1f(u.uBrightness, num('data-brightness', 1.0));
      gl.uniform1f(u.uFillBands, container.getAttribute('data-fill-bands') === 'true' ? 1.0 : 0.0);
      gl.uniform1f(u.uOpacity, num('data-opacity', 1.0));
      gl.uniform1f(u.uLightMode, document.documentElement.getAttribute('data-theme') === 'light' ? 1.0 : 0.0);
      gl.uniform1f(u.uGrain, container.getAttribute('data-grain') === 'false' ? 0.0 : 1.0);
      gl.uniform1f(u.uGrainIntensity, num('data-grain-intensity', 0.05));
      gl.uniform3fv(u.uLow, __hex3(container.getAttribute('data-low') || '#5227FF'));
      gl.uniform3fv(u.uMid, __hex3(container.getAttribute('data-mid') || '#FF9FFC'));
      gl.uniform3fv(u.uHigh, __hex3(container.getAttribute('data-high') || '#FFFFFF'));
      gl.uniform2f(u.uMouse, 0.5, 0.5);
      gl.uniform1f(u.uMouseEnabled, container.getAttribute('data-no-mouse') === 'true' ? 0.0 : 1.0);
      gl.uniform1f(u.uMouseRadius, num('data-mouse-radius', 0.3));
      gl.uniform1f(u.uMouseStrength, num('data-mouse-strength', 0.4));
      gl.uniform1f(u.uMouseActive, 0.0);

      const setSize = function () {
        ctx.resize(container.clientWidth, container.clientHeight, dpr);
        gl.uniform2f(u.iResolution, canvas.width, canvas.height);
        ctx.render();
      };
      const ro = new ResizeObserver(setSize);
      ro.observe(container);
      setSize();

      const currentMouse = [0.5, 0.5];
      const targetMouse = [0.5, 0.5];
      let mouseActive = 0;
      let mouseActiveTarget = 0;
      const onMouseMove = function (e) {
        const rect = canvas.getBoundingClientRect();
        targetMouse[0] = (e.clientX - rect.left) / rect.width;
        targetMouse[1] = 1.0 - (e.clientY - rect.top) / rect.height;
        mouseActiveTarget = 1;
      };
      const onMouseLeave = function () { mouseActiveTarget = 0; };

      let raf = 0;
      let inView = false;
      let t0 = 0;
      let tNow = 0;
      const ctrlU = [u.uCtrlA, u.uCtrlB, u.uCtrlC, u.uCtrlD];
      const loop = function (t) {
        if (document.hidden || !inView) { raf = 0; return; }
        raf = requestAnimationFrame(loop);
        if (!t0) t0 = t;
        const time = (t - t0) * 0.001;
        tNow = time;
        gl.uniform1f(u.iTime, time);
        for (let g = 0; g < 4; g++) {
          const arr = ctrl[g];
          const idx = CTRL_INDICES[g];
          for (let j = 0; j < 4; j++) {
            const i = idx[j];
            arr[j] = morphAmount * Math.sin(time * speed * Math.sin(i * morphSpeed) + i);
          }
          gl.uniform4fv(ctrlU[g], arr);
        }
        currentMouse[0] += 0.05 * (targetMouse[0] - currentMouse[0]);
        currentMouse[1] += 0.05 * (targetMouse[1] - currentMouse[1]);
        gl.uniform2f(u.uMouse, currentMouse[0], currentMouse[1]);
        mouseActive += 0.05 * (mouseActiveTarget - mouseActive);
        gl.uniform1f(u.uMouseActive, mouseActive);
        ctx.render();
      };
      const wake = function () {
        if (!raf && !reduceMQ.matches) {
          t0 = 0;
          canvas.addEventListener('mousemove', onMouseMove);
          canvas.addEventListener('mouseleave', onMouseLeave);
          raf = requestAnimationFrame(loop);
        }
      };
      const sleep = function () {
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        canvas.removeEventListener('mousemove', onMouseMove);
        canvas.removeEventListener('mouseleave', onMouseLeave);
      };
      const io = new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        if (inView) wake(); else sleep();
      }, { rootMargin: '120px' });
      io.observe(container);
      document.addEventListener('visibilitychange', function () { if (document.hidden) sleep(); else if (inView) wake(); });
      const mo = new MutationObserver(function () {
        gl.uniform1f(u.uLightMode, document.documentElement.getAttribute('data-theme') === 'light' ? 1.0 : 0.0);
        ctx.render();
      });
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      container.__topography = function () { return { running: !!raf, t: tNow }; };
    });
  })();

  /* ---- DotField 点阵隆起 · [data-dotfield] — canvas2D+SVG 官方同款 ---- */
  (function () {
    const TWO_PI = Math.PI * 2;
    const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');

    document.querySelectorAll('[data-dotfield]').forEach(function (container) {
      const num = function (name, def) {
        const v = parseFloat(container.getAttribute(name));
        return Number.isFinite(v) ? v : def;
      };
      const cfg = {
        dotRadius: num('data-dot-radius', 1.5),
        dotSpacing: num('data-dot-spacing', 14),
        cursorRadius: num('data-cursor-radius', 500),
        bulgeStrength: num('data-bulge-strength', 67),
        glowRadius: num('data-glow-radius', 160),
        sparkle: container.getAttribute('data-sparkle') === 'true',
        waveAmplitude: num('data-wave', 0),
        gradientFrom: container.getAttribute('data-from') || 'rgba(168, 85, 247, 0.35)',
        gradientTo: container.getAttribute('data-to') || 'rgba(180, 151, 207, 0.25)',
        glowColor: container.getAttribute('data-glow-color') || '#120F17'
      };

      const canvas = document.createElement('canvas');
      canvas.style.position = 'absolute';
      canvas.style.inset = '0';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      container.appendChild(canvas);
      const glowId = 'dfg-' + Math.random().toString(36).slice(2, 9);
      const svgNS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(svgNS, 'svg');
      svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
      svg.innerHTML = '<defs><radialGradient id="' + glowId + '">' +
        '<stop offset="0%" stop-color="' + cfg.glowColor + '"/>' +
        '<stop offset="100%" stop-color="transparent"/></radialGradient></defs>';
      const glowEl = document.createElementNS(svgNS, 'circle');
      glowEl.setAttribute('cx', '-9999');
      glowEl.setAttribute('cy', '-9999');
      glowEl.setAttribute('r', cfg.glowRadius);
      glowEl.setAttribute('fill', 'url(#' + glowId + ')');
      glowEl.style.opacity = '0';
      glowEl.style.willChange = 'opacity';
      svg.appendChild(glowEl);
      container.appendChild(svg);

      const ctx2d = canvas.getContext('2d', { alpha: true });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      let w = 0, h = 0;
      let dots = [];

      function buildDots() {
        const step = cfg.dotRadius + cfg.dotSpacing;
        const cols = Math.floor(w / step);
        const rows = Math.floor(h / step);
        const padX = (w % step) / 2;
        const padY = (h % step) / 2;
        dots = new Array(rows * cols);
        let idx = 0;
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const ax = padX + col * step + step / 2;
            const ay = padY + row * step + step / 2;
            dots[idx++] = { ax: ax, ay: ay, sx: ax, sy: ay, vx: 0, vy: 0, x: ax, y: ay };
          }
        }
      }

      function doResize() {
        const rect = container.getBoundingClientRect();
        w = rect.width;
        h = rect.height;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
        buildDots();
      }

      const mouse = { x: -9999, y: -9999, prevX: -9999, prevY: -9999, speed: 0 };
      let glowOpacity = 0;
      let engagement = 0;
      let frameCount = 0;
      let speedTimer = 0;

      function onMouseMove(e) {
        const rect = container.getBoundingClientRect();
        mouse.x = e.clientX - rect.left;
        mouse.y = e.clientY - rect.top;
      }

      function updateMouseSpeed() {
        const dx = mouse.prevX - mouse.x;
        const dy = mouse.prevY - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        mouse.speed += (dist - mouse.speed) * 0.5;
        if (mouse.speed < 0.001) mouse.speed = 0;
        mouse.prevX = mouse.x;
        mouse.prevY = mouse.y;
      }

      function tick() {
        if (document.hidden || !inView) { raf = 0; return; }
        raf = requestAnimationFrame(tick);
        frameCount++;
        const t = frameCount * 0.02;
        const targetEngagement = Math.min(mouse.speed / 5, 1);
        engagement += (targetEngagement - engagement) * 0.06;
        if (engagement < 0.001) engagement = 0;
        const eng = engagement;
        glowOpacity += (eng - glowOpacity) * 0.08;
        glowEl.setAttribute('cx', mouse.x);
        glowEl.setAttribute('cy', mouse.y);
        glowEl.style.opacity = glowOpacity;

        ctx2d.clearRect(0, 0, w, h);
        const grad = ctx2d.createLinearGradient(0, 0, w, h);
        grad.addColorStop(0, cfg.gradientFrom);
        grad.addColorStop(1, cfg.gradientTo);
        ctx2d.fillStyle = grad;
        const cr = cfg.cursorRadius;
        const crSq = cr * cr;
        const rad = cfg.dotRadius / 2;
        ctx2d.beginPath();
        for (let i = 0; i < dots.length; i++) {
          const d = dots[i];
          const dx = mouse.x - d.ax;
          const dy = mouse.y - d.ay;
          const distSq = dx * dx + dy * dy;
          if (distSq < crSq && eng > 0.01) {
            const dist = Math.sqrt(distSq);
            const tt = 1 - dist / cr;
            const push = tt * tt * cfg.bulgeStrength * eng;
            const angle = Math.atan2(dy, dx);
            d.sx += (d.ax - Math.cos(angle) * push - d.sx) * 0.15;
            d.sy += (d.ay - Math.sin(angle) * push - d.sy) * 0.15;
          } else {
            d.sx += (d.ax - d.sx) * 0.1;
            d.sy += (d.ay - d.sy) * 0.1;
          }
          let drawX = d.sx;
          let drawY = d.sy;
          if (cfg.waveAmplitude > 0) {
            drawY += Math.sin(d.ax * 0.03 + t) * cfg.waveAmplitude;
            drawX += Math.cos(d.ay * 0.03 + t * 0.7) * cfg.waveAmplitude * 0.5;
          }
          if (cfg.sparkle) {
            const hash = ((i * 2654435761) ^ (frameCount >> 3)) >>> 0;
            if ((hash % 100) < 3) {
              ctx2d.moveTo(drawX + rad * 1.8, drawY);
              ctx2d.arc(drawX, drawY, rad * 1.8, 0, TWO_PI);
            } else {
              ctx2d.moveTo(drawX + rad, drawY);
              ctx2d.arc(drawX, drawY, rad, 0, TWO_PI);
            }
          } else {
            ctx2d.moveTo(drawX + rad, drawY);
            ctx2d.arc(drawX, drawY, rad, 0, TWO_PI);
          }
        }
        ctx2d.fill();
      }

      let raf = 0;
      let inView = false;
      const wake = function () {
        if (!raf && !reduceMQ.matches) {
          container.addEventListener('mousemove', onMouseMove, { passive: true });
          speedTimer = setInterval(updateMouseSpeed, 20);
          raf = requestAnimationFrame(tick);
        }
      };
      const sleep = function () {
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        clearInterval(speedTimer);
        container.removeEventListener('mousemove', onMouseMove);
      };
      const io = new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        if (inView) wake(); else sleep();
      }, { rootMargin: '120px' });
      io.observe(container);
      document.addEventListener('visibilitychange', function () { if (document.hidden) sleep(); else if (inView) wake(); });
      let resizeTimer;
      window.addEventListener('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(doResize, 100);
      });
      doResize();
      container.__dotfield = function () { return { running: !!raf, t: frameCount }; };
    });
  })();

  /* ============ v105 · React Bits 第十三批 (Backgrounds) ============
     LightRays / PlasmaWave / GradientBlinds / DarkVeil / EvilEye / LineWaves / PixelSnow / SideRays
     官方均为 ogl 全屏三角 GLSL1 (PixelSnow 本就是 three), 移植为 three PlaneGeometry(2,2)+Ortho 原样;
     统一接入 IntersectionObserver + document.hidden 唤醒/休眠门控 (官方 PlasmaWave/EvilEye/LineWaves 无门控, 此处补齐) */

  /* ---- LightRays 神圣光束 · [data-lightrays] ---- */
  (function () {
    const T = window.THREE;
    if (!T) return;
    const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');

    const VERT = 'varying vec2 vUv;\nvoid main() {\n  vUv = position.xy * 0.5 + 0.5;\n  gl_Position = vec4(position.xy, 0.0, 1.0);\n}\n';
    const FRAG = `precision highp float;

uniform float iTime;
uniform vec2  iResolution;

uniform vec2  rayPos;
uniform vec2  rayDir;
uniform vec3  raysColor;
uniform float raysSpeed;
uniform float lightSpread;
uniform float rayLength;
uniform float pulsating;
uniform float fadeDistance;
uniform float saturation;
uniform vec2  mousePos;
uniform float mouseInfluence;
uniform float noiseAmount;
uniform float distortion;
uniform float lightMode;

varying vec2 vUv;

float noise(vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
}

float rayStrength(vec2 raySource, vec2 rayRefDirection, vec2 coord,
                  float seedA, float seedB, float speed) {
  vec2 sourceToCoord = coord - raySource;
  vec2 dirNorm = normalize(sourceToCoord);
  float cosAngle = dot(dirNorm, rayRefDirection);

  float distortedAngle = cosAngle + distortion * sin(iTime * 2.0 + length(sourceToCoord) * 0.01) * 0.2;

  float spreadFactor = pow(max(distortedAngle, 0.0), 1.0 / max(lightSpread, 0.001));

  float distance = length(sourceToCoord);
  float maxDistance = iResolution.x * rayLength;
  float lengthFalloff = clamp((maxDistance - distance) / maxDistance, 0.0, 1.0);

  float fadeFalloff = clamp((iResolution.x * fadeDistance - distance) / (iResolution.x * fadeDistance), 0.5, 1.0);
  float pulse = pulsating > 0.5 ? (0.8 + 0.2 * sin(iTime * speed * 3.0)) : 1.0;

  float baseStrength = clamp(
    (0.45 + 0.15 * sin(distortedAngle * seedA + iTime * speed)) +
    (0.3 + 0.2 * cos(-distortedAngle * seedB + iTime * speed)),
    0.0, 1.0
  );

  return baseStrength * lengthFalloff * fadeFalloff * spreadFactor * pulse;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 coord = vec2(fragCoord.x, iResolution.y - fragCoord.y);

  vec2 finalRayDir = rayDir;
  if (mouseInfluence > 0.0) {
    vec2 mouseScreenPos = mousePos * iResolution.xy;
    vec2 mouseDirection = normalize(mouseScreenPos - rayPos);
    finalRayDir = normalize(mix(rayDir, mouseDirection, mouseInfluence));
  }

  vec4 rays1 = vec4(1.0) *
               rayStrength(rayPos, finalRayDir, coord, 36.2214, 21.11349,
                           1.5 * raysSpeed);
  vec4 rays2 = vec4(1.0) *
               rayStrength(rayPos, finalRayDir, coord, 22.3991, 18.0234,
                           1.1 * raysSpeed);

  fragColor = rays1 * 0.5 + rays2 * 0.4;

  if (noiseAmount > 0.0) {
    float n = noise(coord * 0.01 + iTime * 0.1);
    fragColor.rgb *= (1.0 - noiseAmount + noiseAmount * n);
  }

  float brightness = 1.0 - (coord.y / iResolution.y);
  fragColor.x *= 0.1 + brightness * 0.8;
  fragColor.y *= 0.3 + brightness * 0.6;
  fragColor.z *= 0.5 + brightness * 0.5;

  if (saturation != 1.0) {
    float gray = dot(fragColor.rgb, vec3(0.299, 0.587, 0.114));
    fragColor.rgb = mix(vec3(gray), fragColor.rgb, saturation);
  }

  fragColor.rgb *= raysColor;

  if (lightMode > 0.5) {
    vec3 mapped = vec3(1.0) - exp(-max(fragColor.rgb, vec3(0.0)) * 1.35);
    float energy = clamp(max(mapped.r, max(mapped.g, mapped.b)), 0.0, 1.0);
    vec3 hue = mapped / max(energy, 0.0001);
    vec3 ink = mix(hue * 0.25, hue * 0.72, energy);
    fragColor = vec4(mix(vec3(1.0), ink, energy), 1.0);
  }
}

void main() {
  vec4 color;
  mainImage(color, gl_FragCoord.xy);
  gl_FragColor  = color;
}`;

    const getAnchorAndDir = function (origin, w, h) {
      const outside = 0.2;
      switch (origin) {
        case 'top-left': return { anchor: [0, -outside * h], dir: [0, 1] };
        case 'top-right': return { anchor: [w, -outside * h], dir: [0, 1] };
        case 'left': return { anchor: [-outside * w, 0.5 * h], dir: [1, 0] };
        case 'right': return { anchor: [(1 + outside) * w, 0.5 * h], dir: [-1, 0] };
        case 'bottom-left': return { anchor: [0, (1 + outside) * h], dir: [0, -1] };
        case 'bottom-center': return { anchor: [0.5 * w, (1 + outside) * h], dir: [0, -1] };
        case 'bottom-right': return { anchor: [w, (1 + outside) * h], dir: [0, -1] };
        default: return { anchor: [0.5 * w, -outside * h], dir: [0, 1] };
      }
    };

    document.querySelectorAll('[data-lightrays]').forEach(function (container) {
      const num = function (name, def) {
        const v = parseFloat(container.getAttribute(name));
        return Number.isFinite(v) ? v : def;
      };
      const origin = container.getAttribute('data-origin') || 'top-center';
      const followMouse = container.getAttribute('data-no-mouse') !== 'true';
      const mouseInfluence = num('data-influence', 0.1);

      const scene = new T.Scene();
      const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const geometry = new T.PlaneGeometry(2, 2);
      const material = new T.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depth: false,
        uniforms: {
          iTime: { value: 0 },
          iResolution: { value: [1, 1] },
          rayPos: { value: [0, 0] },
          rayDir: { value: [0, 1] },
          raysColor: { value: __hex3(container.getAttribute('data-ray-color') || '#ffffff') },
          raysSpeed: { value: num('data-ray-speed', 1) },
          lightSpread: { value: num('data-spread', 1) },
          rayLength: { value: num('data-ray-length', 2) },
          pulsating: { value: container.getAttribute('data-pulsating') === 'true' ? 1 : 0 },
          fadeDistance: { value: num('data-fade-distance', 1.0) },
          saturation: { value: num('data-saturation', 1.0) },
          mousePos: { value: [0.5, 0.5] },
          mouseInfluence: { value: followMouse ? mouseInfluence : 0 },
          noiseAmount: { value: num('data-noise', 0) },
          distortion: { value: num('data-distortion', 0) },
          lightMode: { value: 0 }
        }
      });
      const mesh = new T.Mesh(geometry, material);
      mesh.frustumCulled = false;
      scene.add(mesh);

      const canvas = document.createElement('canvas');
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      container.appendChild(canvas);
      let renderer;
      try {
        renderer = new T.WebGLRenderer({ canvas, antialias: false, alpha: true });
      } catch (err) { void err; canvas.remove(); return; }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x000000, 0);
      const u = material.uniforms;

      const updatePlacement = function () {
        const w = Math.max(container.clientWidth, 1);
        const h = Math.max(container.clientHeight, 1);
        renderer.setSize(w, h, false);
        const dpr = renderer.getPixelRatio();
        const bw = w * dpr;
        const bh = h * dpr;
        u.iResolution.value[0] = bw;
        u.iResolution.value[1] = bh;
        const ad = getAnchorAndDir(origin, bw, bh);
        u.rayPos.value[0] = ad.anchor[0];
        u.rayPos.value[1] = ad.anchor[1];
        u.rayDir.value[0] = ad.dir[0];
        u.rayDir.value[1] = ad.dir[1];
      };

      const ro = new ResizeObserver(function () { updatePlacement(); renderer.render(scene, camera); });
      ro.observe(container);
      updatePlacement();

      const mouse = { x: 0.5, y: 0.5 };
      const smooth = { x: 0.5, y: 0.5 };
      const onMove = function (e) {
        const rect = container.getBoundingClientRect();
        mouse.x = (e.clientX - rect.left) / rect.width;
        mouse.y = (e.clientY - rect.top) / rect.height;
      };

      const isLight = function () { return document.documentElement.getAttribute('data-theme') === 'light'; };
      u.lightMode.value = isLight() ? 1 : 0;

      let raf = 0;
      let inView = false;
      const loop = function (t) {
        if (document.hidden || !inView) { raf = 0; return; }
        raf = requestAnimationFrame(loop);
        u.iTime.value = t * 0.001;
        if (followMouse && mouseInfluence > 0) {
          const s = 0.92;
          smooth.x = smooth.x * s + mouse.x * (1 - s);
          smooth.y = smooth.y * s + mouse.y * (1 - s);
          u.mousePos.value[0] = smooth.x;
          u.mousePos.value[1] = smooth.y;
        }
        renderer.render(scene, camera);
      };
      const wake = function () {
        if (!raf && !reduceMQ.matches) {
          if (followMouse) window.addEventListener('mousemove', onMove);
          raf = requestAnimationFrame(loop);
        }
      };
      const sleep = function () {
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        if (followMouse) window.removeEventListener('mousemove', onMove);
      };
      const io = new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        if (inView) wake(); else sleep();
      }, { rootMargin: '120px' });
      io.observe(container);
      document.addEventListener('visibilitychange', function () { if (document.hidden) sleep(); else if (inView) wake(); });
      const mo = new MutationObserver(function () {
        u.lightMode.value = isLight() ? 1 : 0;
        renderer.render(scene, camera);
      });
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      container.__lightrays = function () { return { running: !!raf, t: u.iTime.value }; };
    });
  })();

  /* ---- PlasmaWave 等离子波 · [data-plasmawave] — 光线行 march 双管等离子 ---- */
  (function () {
    const T = window.THREE;
    if (!T) return;
    const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');

    const VERT = 'void main() {\n  gl_Position = vec4(position.xy, 0.0, 1.0);\n}\n';
    const FRAG = `precision highp float;
uniform float iTime;
uniform vec2  iResolution;
uniform vec2  uOffset;
uniform float uRotation;
uniform float uFocalLength;
uniform float uSpeed1;
uniform float uSpeed2;
uniform float uDir2;
uniform float uBend1;
uniform float uBend2;
uniform vec3  uColor1;
uniform vec3  uColor2;
uniform float uLightMode;

const float lt   = 0.3;
const float pi   = 3.14159;
const float pi2  = 6.28318;
const float pi_2 = 1.5708;
#define MAX_STEPS 14

void mainImage(out vec4 C, in vec2 U) {
  float t = iTime * pi;
  float s = 1.0;
  float d = 0.0;
  vec2  R = iResolution;

  vec3 o = vec3(0.0, 0.0, -7.0);
  vec3 u = normalize(vec3((U - 0.5 * R) / R.y, uFocalLength));
  vec2 k = vec2(0.0);
  vec3 p;

  float t1 = t * 0.7;
  float t2 = t * 0.9;
  float tSpeed1 = t * uSpeed1;
  float tSpeed2 = t * uSpeed2 * uDir2;

  for (int i = 0; i < MAX_STEPS; ++i) {
    p = o + u * d;
    p.x -= 15.0;

    float px = p.x;
    float wob1 = uBend1 + sin(t1 + px * 0.8) * 0.1;
    float wob2 = uBend2 + cos(t2 + px * 1.1) * 0.1;

    float px2 = px + pi_2;
    vec2 sinOffset = sin(vec2(px, px2) + tSpeed1) * wob1;
    vec2 cosOffset = cos(vec2(px, px2) + tSpeed2) * wob2;

    vec2 yz = p.yz;
    float pxLt = px + lt;
    k.x = max(pxLt, length(yz - sinOffset) - lt);
    k.y = max(pxLt, length(yz - cosOffset) - lt);

    float current = min(k.x, k.y);
    s = min(s, current);
    if (s < 0.001 || d > 300.0) break;
    d += s * 0.7;
  }

  float sqrtD = sqrt(d);
  vec3 raw = max(cos(d * pi2) - s * sqrtD - vec3(k, 0.0), 0.0);
  float field = max(raw.r, max(raw.g, raw.b));
  float outerMask = smoothstep(0.0, 0.055, field);
  float glowMask = smoothstep(0.012, 0.13, field);
  float coreMask = smoothstep(0.075, 0.27, field);
  if (uLightMode < 0.5 && field < 0.15) discard;
  raw.gb += uLightMode > 0.5 ? 0.1 * glowMask : 0.1;
  raw = raw * 0.4 + raw.brg * 0.6 + raw * raw;
  float lum = dot(raw, vec3(0.299, 0.587, 0.114));
  float w1 = max(0.0, 1.0 - k.x * 2.0);
  float w2 = max(0.0, 1.0 - k.y * 2.0);
  float wt = w1 + w2 + 0.001;
  vec3 baseColor = (uColor1 * w1 + uColor2 * w2) / wt;
  vec3 c = baseColor * lum * 3.5;
  if (uLightMode > 0.5) {
    float lightW1 = exp(-max(k.x, 0.0) * 4.0);
    float lightW2 = exp(-max(k.y, 0.0) * 4.0);
    vec3 lightBase = (uColor1 * lightW1 + uColor2 * lightW2) / (lightW1 + lightW2 + 0.001);
    float lightLuma = dot(lightBase, vec3(0.299, 0.587, 0.114));
    vec3 vividColor = clamp(pow(max(mix(vec3(lightLuma), lightBase, 1.35), 0.0), vec3(0.64)) * 1.14, 0.0, 1.0);
    float colorPresence = clamp(outerMask * 0.34 + glowMask * 1.08 + coreMask * 0.22, 0.0, 1.0);
    vec3 lightColor = mix(vec3(1.0), vividColor, colorPresence);
    lightColor = mix(lightColor, vec3(1.0), coreMask * smoothstep(0.16, 0.95, lum) * 0.1);
    C = vec4(lightColor, 1.0);
  } else {
    C = vec4(c, 1.0);
  }
}

void main() {
  vec2 coord = gl_FragCoord.xy + uOffset;
  coord -= 0.5 * iResolution;
  float c = cos(uRotation), s = sin(uRotation);
  coord = mat2(c, -s, s, c) * coord;
  coord += 0.5 * iResolution;

  vec4 color;
  mainImage(color, coord);
  gl_FragColor = color;
}`;

    document.querySelectorAll('[data-plasmawave]').forEach(function (container) {
      const num = function (name, def) {
        const v = parseFloat(container.getAttribute(name));
        return Number.isFinite(v) ? v : def;
      };
      const scene = new T.Scene();
      const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const geometry = new T.PlaneGeometry(2, 2);
      const material = new T.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depth: false,
        uniforms: {
          iTime: { value: 0 },
          iResolution: { value: [1, 1] },
          uOffset: { value: [num('data-x-offset', 0), num('data-y-offset', 0)] },
          uRotation: { value: (num('data-rotation', 0) * Math.PI) / 180 },
          uFocalLength: { value: num('data-focal', 0.8) },
          uSpeed1: { value: num('data-speed1', 0.05) },
          uSpeed2: { value: num('data-speed2', 0.05) },
          uDir2: { value: num('data-dir2', 1.0) },
          uBend1: { value: num('data-bend1', 1) },
          uBend2: { value: num('data-bend2', 0.5) },
          uColor1: { value: __hex3(container.getAttribute('data-color1') || '#A855F7') },
          uColor2: { value: __hex3(container.getAttribute('data-color2') || '#06B6D4') },
          uLightMode: { value: 0 }
        }
      });
      const mesh = new T.Mesh(geometry, material);
      mesh.frustumCulled = false;
      scene.add(mesh);

      const canvas = document.createElement('canvas');
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      container.appendChild(canvas);
      let renderer;
      try {
        renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, premultipliedAlpha: false, powerPreference: 'high-performance' });
      } catch (err) { void err; canvas.remove(); return; }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setClearColor(0x000000, 0);
      const u = material.uniforms;

      const resize = function () {
        const w = Math.max(container.clientWidth, 1);
        const h = Math.max(container.clientHeight, 1);
        renderer.setSize(w, h, false);
        u.iResolution.value[0] = canvas.width;
        u.iResolution.value[1] = canvas.height;
      };
      const ro = new ResizeObserver(function () { resize(); renderer.render(scene, camera); });
      ro.observe(container);
      resize();

      const isLight = function () { return document.documentElement.getAttribute('data-theme') === 'light'; };
      u.uLightMode.value = isLight() ? 1 : 0;

      let raf = 0;
      let inView = false;
      const loop = function (t) {
        if (document.hidden || !inView) { raf = 0; return; }
        raf = requestAnimationFrame(loop);
        u.iTime.value = t * 0.001;
        renderer.render(scene, camera);
      };
      const wake = function () { if (!raf && !reduceMQ.matches) raf = requestAnimationFrame(loop); };
      const sleep = function () { if (raf) { cancelAnimationFrame(raf); raf = 0; } };
      const io = new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        if (inView) wake(); else sleep();
      }, { rootMargin: '120px' });
      io.observe(container);
      document.addEventListener('visibilitychange', function () { if (document.hidden) sleep(); else if (inView) wake(); });
      const mo = new MutationObserver(function () {
        u.uLightMode.value = isLight() ? 1 : 0;
        renderer.render(scene, camera);
      });
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      container.__plasmawave = function () { return { running: !!raf, t: u.iTime.value }; };
    });
  })();

  /* ---- GradientBlinds 百叶渐变 · [data-blinds] — 8 色带百叶窗 + 聚光揭示 ---- */
  (function () {
    const T = window.THREE;
    if (!T) return;
    const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');

    const VERT = 'varying vec2 vUv;\nvoid main() {\n  vUv = uv;\n  gl_Position = vec4(position.xy, 0.0, 1.0);\n}\n';
    const FRAG = `
#ifdef GL_ES
precision mediump float;
#endif

uniform vec3  iResolution;
uniform vec2  iMouse;
uniform float iTime;

uniform float uAngle;
uniform float uNoise;
uniform float uBlindCount;
uniform float uSpotlightRadius;
uniform float uSpotlightSoftness;
uniform float uSpotlightOpacity;
uniform float uMirror;
uniform float uDistort;
uniform float uShineFlip;
uniform vec3  uColor0;
uniform vec3  uColor1;
uniform vec3  uColor2;
uniform vec3  uColor3;
uniform vec3  uColor4;
uniform vec3  uColor5;
uniform vec3  uColor6;
uniform vec3  uColor7;
uniform int   uColorCount;
uniform float uLightMode;

varying vec2 vUv;

float rand(vec2 co){
  return fract(sin(dot(co, vec2(12.9898,78.233))) * 43758.5453);
}

vec2 rotate2D(vec2 p, float a){
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c) * p;
}

vec3 getGradientColor(float t){
  float tt = clamp(t, 0.0, 1.0);
  int count = uColorCount;
  if (count < 2) count = 2;
  float scaled = tt * float(count - 1);
  float seg = floor(scaled);
  float f = fract(scaled);

  if (seg < 1.0) return mix(uColor0, uColor1, f);
  if (seg < 2.0 && count > 2) return mix(uColor1, uColor2, f);
  if (seg < 3.0 && count > 3) return mix(uColor2, uColor3, f);
  if (seg < 4.0 && count > 4) return mix(uColor3, uColor4, f);
  if (seg < 5.0 && count > 5) return mix(uColor4, uColor5, f);
  if (seg < 6.0 && count > 6) return mix(uColor5, uColor6, f);
  if (seg < 7.0 && count > 7) return mix(uColor6, uColor7, f);
  if (count > 7) return uColor7;
  if (count > 6) return uColor6;
  if (count > 5) return uColor5;
  if (count > 4) return uColor4;
  if (count > 3) return uColor3;
  if (count > 2) return uColor2;
  return uColor1;
}

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    vec2 uv0 = fragCoord.xy / iResolution.xy;

    float aspect = iResolution.x / iResolution.y;
    vec2 p = uv0 * 2.0 - 1.0;
    p.x *= aspect;
    vec2 pr = rotate2D(p, uAngle);
    pr.x /= aspect;
    vec2 uv = pr * 0.5 + 0.5;

    vec2 uvMod = uv;
    if (uDistort > 0.0) {
      float a = uvMod.y * 6.0;
      float b = uvMod.x * 6.0;
      float w = 0.01 * uDistort;
      uvMod.x += sin(a) * w;
      uvMod.y += cos(b) * w;
    }
    float t = uvMod.x;
    if (uMirror > 0.5) {
      t = 1.0 - abs(1.0 - 2.0 * fract(t));
    }
    vec3 base = getGradientColor(t);

    vec2 offset = vec2(iMouse.x/iResolution.x, iMouse.y/iResolution.y);
  float d = length(uv0 - offset);
  float r = max(uSpotlightRadius, 1e-4);
  float dn = d / r;
  float spot = (1.0 - 2.0 * pow(dn, uSpotlightSoftness)) * uSpotlightOpacity;
  vec3 cir = vec3(spot);
  float blindCount = max(uBlindCount, 1.0);
  float stripePhase = uvMod.x * blindCount;
  float stripe = fract(stripePhase);
  float stripeAA = clamp(blindCount * 1.25 / min(iResolution.x, iResolution.y), 0.001, 0.12);
  float edgeDistance = min(stripe, 1.0 - stripe);
  float edgeBlend = 1.0 - smoothstep(0.0, stripeAA, edgeDistance);
  stripe = mix(stripe, 0.5, edgeBlend);
  if (uShineFlip > 0.5) stripe = 1.0 - stripe;
    vec3 ran = vec3(stripe);
    vec3 revealSignal = cir + base - ran;

    vec3 col;
    if (uLightMode > 0.5) {
        float peak = max(base.r, max(base.g, base.b));
        vec3 pigment = base / max(peak, 0.0001);
        float neutral = min(pigment.r, min(pigment.g, pigment.b));
        pigment = max(pigment - vec3(neutral * 0.72), vec3(0.0));
        pigment /= max(max(pigment.r, max(pigment.g, pigment.b)), 0.0001);
        pigment = mix(pigment, pigment * pigment, 0.12) * 0.72;
        vec3 revealed = clamp(revealSignal, 0.0, 1.0);
        float coverage = max(revealed.r, max(revealed.g, revealed.b));
        col = mix(vec3(1.0), pigment, coverage);
        float grain = max(rand(gl_FragCoord.xy + iTime) - 0.5, 0.0);
        float grainAmount = grain * uNoise * mix(0.12, 0.18, coverage);
        col = clamp(col - vec3(grainAmount), 0.0, 1.0);
    } else {
        col = revealSignal;
        col += (rand(gl_FragCoord.xy + iTime) - 0.5) * uNoise;
    }

    fragColor = vec4(col, 1.0);
}

void main() {
    vec4 color;
    mainImage(color, vUv * iResolution.xy);
    gl_FragColor = color;
}
`;

    const MAX_COLORS = 8;
    const prepStops = function (list) {
      const base = list.slice(0, MAX_COLORS);
      if (base.length === 1) base.push(base[0]);
      while (base.length < MAX_COLORS) base.push(base[base.length - 1]);
      const arr = [];
      for (let i = 0; i < MAX_COLORS; i++) arr.push(__hex3(base[i]));
      const count = Math.max(2, Math.min(MAX_COLORS, list.length));
      return { arr: arr, count: count };
    };

    document.querySelectorAll('[data-blinds]').forEach(function (container) {
      const num = function (name, def) {
        const v = parseFloat(container.getAttribute(name));
        return Number.isFinite(v) ? v : def;
      };
      const blindCount = Math.max(1, num('data-blind-count', 16));
      const blindMinWidth = num('data-blind-min-width', 60);
      const mouseDampening = num('data-dampening', 0.15);
      const noBlend = container.getAttribute('data-no-blend') === 'true';
      const rawColors = (container.getAttribute('data-colors') || '#FF9FFC,#5227FF')
        .split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      const stops = prepStops(rawColors);

      const scene = new T.Scene();
      const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const geometry = new T.PlaneGeometry(2, 2);
      const uniforms = {
        iResolution: { value: [1, 1, 1] },
        iMouse: { value: [0, 0] },
        iTime: { value: 0 },
        uAngle: { value: (num('data-angle', 0) * Math.PI) / 180 },
        uNoise: { value: num('data-noise', 0.3) },
        uBlindCount: { value: blindCount },
        uSpotlightRadius: { value: num('data-spot-radius', 0.5) },
        uSpotlightSoftness: { value: num('data-spot-softness', 1) },
        uSpotlightOpacity: { value: num('data-spot-opacity', 1) },
        uMirror: { value: container.getAttribute('data-mirror') === 'true' ? 1 : 0 },
        uDistort: { value: num('data-distort', 0) },
        uShineFlip: { value: container.getAttribute('data-shine') === 'right' ? 1 : 0 },
        uColorCount: { value: stops.count },
        uLightMode: { value: 0 }
      };
      for (let i = 0; i < MAX_COLORS; i++) uniforms['uColor' + i] = { value: stops.arr[i] };
      const material = new T.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depth: false,
        uniforms: uniforms
      });
      const mesh = new T.Mesh(geometry, material);
      mesh.frustumCulled = false;
      scene.add(mesh);

      const canvas = document.createElement('canvas');
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      container.appendChild(canvas);
      let renderer;
      try {
        renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
      } catch (err) { void err; canvas.remove(); return; }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x000000, 0);

      const isLight = function () { return document.documentElement.getAttribute('data-theme') === 'light'; };
      const applyBlend = function () {
        const light = isLight();
        uniforms.uLightMode.value = light ? 1 : 0;
        container.style.mixBlendMode = !light && !noBlend ? 'lighten' : '';
      };
      applyBlend();

      let firstResize = true;
      const target = [0, 0];
      const resize = function () {
        const rect = container.getBoundingClientRect();
        renderer.setSize(Math.max(rect.width, 1), Math.max(rect.height, 1), false);
        uniforms.iResolution.value[0] = canvas.width;
        uniforms.iResolution.value[1] = canvas.height;
        if (blindMinWidth > 0) {
          const maxByMinWidth = Math.max(1, Math.floor(rect.width / blindMinWidth));
          uniforms.uBlindCount.value = Math.max(1, blindCount ? Math.min(blindCount, maxByMinWidth) : maxByMinWidth);
        } else {
          uniforms.uBlindCount.value = Math.max(1, blindCount);
        }
        if (firstResize) {
          firstResize = false;
          target[0] = canvas.width / 2;
          target[1] = canvas.height / 2;
          uniforms.iMouse.value[0] = canvas.width / 2;
          uniforms.iMouse.value[1] = canvas.height / 2;
        }
      };
      const ro = new ResizeObserver(function () { resize(); renderer.render(scene, camera); });
      ro.observe(container);
      resize();

      const onPointerMove = function (e) {
        const rect = canvas.getBoundingClientRect();
        const scale = renderer.getPixelRatio() || 1;
        const x = (e.clientX - rect.left) * scale;
        const y = (rect.height - (e.clientY - rect.top)) * scale;
        target[0] = x;
        target[1] = y;
        if (mouseDampening <= 0) {
          uniforms.iMouse.value[0] = x;
          uniforms.iMouse.value[1] = y;
        }
      };

      let lastTime = 0;
      let raf = 0;
      let inView = false;
      const loop = function (t) {
        if (document.hidden || !inView) { raf = 0; return; }
        raf = requestAnimationFrame(loop);
        uniforms.iTime.value = t * 0.001;
        if (mouseDampening > 0) {
          if (!lastTime) lastTime = t;
          const dt = (t - lastTime) / 1000;
          lastTime = t;
          const tau = Math.max(1e-4, mouseDampening);
          let factor = 1 - Math.exp(-dt / tau);
          if (factor > 1) factor = 1;
          const cur = uniforms.iMouse.value;
          cur[0] += (target[0] - cur[0]) * factor;
          cur[1] += (target[1] - cur[1]) * factor;
        } else {
          lastTime = t;
        }
        renderer.render(scene, camera);
      };
      const wake = function () {
        if (!raf && !reduceMQ.matches) {
          canvas.addEventListener('pointermove', onPointerMove);
          raf = requestAnimationFrame(loop);
        }
      };
      const sleep = function () {
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        canvas.removeEventListener('pointermove', onPointerMove);
      };
      const io = new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        if (inView) wake(); else sleep();
      }, { rootMargin: '120px' });
      io.observe(container);
      document.addEventListener('visibilitychange', function () { if (document.hidden) sleep(); else if (inView) wake(); });
      const mo = new MutationObserver(function () { applyBlend(); renderer.render(scene, camera); });
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      container.__blinds = function () { return { running: !!raf, t: uniforms.iTime.value }; };
    });
  })();

  /* ---- DarkVeil 暗幕神经场 · [data-darkveil] — 官方 CPPN 神经网络场原样 ---- */
  (function () {
    const T = window.THREE;
    if (!T) return;
    const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');

    const VERT = 'void main() {\n  gl_Position = vec4(position.xy, 0.0, 1.0);\n}\n';
    const FRAG = `
#ifdef GL_ES
precision lowp float;
#endif
uniform vec2 uResolution;
uniform float uTime;
uniform float uHueShift;
uniform float uNoise;
uniform float uScan;
uniform float uScanFreq;
uniform float uWarp;
uniform float uLightMode;
#define iTime uTime
#define iResolution uResolution

vec4 buf[8];
float rand(vec2 c){return fract(sin(dot(c,vec2(12.9898,78.233)))*43758.5453);}

mat3 rgb2yiq=mat3(0.299,0.587,0.114,0.596,-0.274,-0.322,0.211,-0.523,0.312);
mat3 yiq2rgb=mat3(1.0,0.956,0.621,1.0,-0.272,-0.647,1.0,-1.106,1.703);

vec3 hueShiftRGB(vec3 col,float deg){
    vec3 yiq=rgb2yiq*col;
    float rad=radians(deg);
    float cosh=cos(rad),sinh=sin(rad);
    vec3 yiqShift=vec3(yiq.x,yiq.y*cosh-yiq.z*sinh,yiq.y*sinh+yiq.z*cosh);
    return clamp(yiq2rgb*yiqShift,0.0,1.0);
}

vec4 sigmoid(vec4 x){return 1./(1.+exp(-x));}

vec4 cppn_fn(vec2 coordinate,float in0,float in1,float in2){
    buf[6]=vec4(coordinate.x,coordinate.y,0.3948333106474662+in0,0.36+in1);
    buf[7]=vec4(0.14+in2,sqrt(coordinate.x*coordinate.x+coordinate.y*coordinate.y),0.,0.);
    buf[0]=mat4(vec4(6.5404263,-3.6126034,0.7590882,-1.13613),vec4(2.4582713,3.1660357,1.2219609,0.06276096),vec4(-5.478085,-6.159632,1.8701609,-4.7742867),vec4(6.039214,-5.542865,-0.90925294,3.251348))*buf[6]+mat4(vec4(0.8473259,-5.722911,3.975766,1.6522468),vec4(-0.24321538,0.5839259,-1.7661959,-5.350116),vec4(0.,0.,0.,0.),vec4(0.,0.,0.,0.))*buf[7]+vec4(0.21808943,1.1243913,-1.7969975,5.0294676);
    buf[1]=mat4(vec4(-3.3522482,-6.0612736,0.55641043,-4.4719114),vec4(0.8631464,1.7432913,5.643898,1.6106541),vec4(2.4941394,-3.5012043,1.7184316,6.357333),vec4(3.310376,8.209261,1.1355612,-1.165539))*buf[6]+mat4(vec4(5.24046,-13.034365,0.009859298,15.870829),vec4(2.987511,3.129433,-0.89023495,-1.6822904),vec4(0.,0.,0.,0.),vec4(0.,0.,0.,0.))*buf[7]+vec4(-5.9457836,-6.573602,-0.8812491,1.5436668);
    buf[0]=sigmoid(buf[0]);buf[1]=sigmoid(buf[1]);
    buf[2]=mat4(vec4(-15.219568,8.095543,-2.429353,-1.9381982),vec4(-5.951362,4.3115187,2.6393783,1.274315),vec4(-7.3145227,6.7297835,5.2473326,5.9411426),vec4(5.0796127,8.979051,-1.7278991,-1.158976))*buf[6]+mat4(vec4(-11.967154,-11.608155,6.1486754,11.237008),vec4(2.124141,-6.263192,-1.7050359,-0.7021966),vec4(0.,0.,0.,0.),vec4(0.,0.,0.,0.))*buf[7]+vec4(-4.17164,-3.2281182,-4.576417,-3.6401186);
    buf[3]=mat4(vec4(3.1832156,-13.738922,1.879223,3.233465),vec4(0.64300746,12.768129,1.9141049,0.50990224),vec4(-0.049295485,4.4807224,1.4733979,1.801449),vec4(5.0039253,13.000481,3.3991797,-4.5561905))*buf[6]+mat4(vec4(-0.1285731,7.720628,-3.1425676,4.742367),vec4(0.6393625,3.714393,-0.8108378,-0.39174938),vec4(0.,0.,0.,0.),vec4(0.,0.,0.,0.))*buf[7]+vec4(-1.1811101,-21.621881,0.7851888,1.2329718);
    buf[2]=sigmoid(buf[2]);buf[3]=sigmoid(buf[3]);
    buf[4]=mat4(vec4(5.214916,-7.183024,2.7228765,2.6592617),vec4(-5.601878,-25.3591,4.067988,0.4602802),vec4(-10.57759,24.286327,21.102104,37.546658),vec4(4.3024497,-1.9625226,2.3458803,-1.372816))*buf[0]+mat4(vec4(-17.6526,-10.507558,2.2587414,12.462782),vec4(6.265566,-502.75443,-12.642513,0.9112289),vec4(-10.983244,20.741234,-9.701768,-0.7635988),vec4(5.383626,1.4819539,-4.1911616,-4.8444734))*buf[1]+mat4(vec4(12.785233,-16.345072,-0.39901125,1.7955981),vec4(-30.48365,-1.8345358,1.4542528,-1.1118771),vec4(19.872723,-7.337935,-42.941723,-98.52709),vec4(8.337645,-2.7312303,-2.2927687,-36.142323))*buf[2]+mat4(vec4(-16.298317,3.5471997,-0.44300047,-9.444417),vec4(57.5077,-35.609753,16.163465,-4.1534753),vec4(-0.07470326,-3.8656476,-7.0901804,3.1523974),vec4(-12.559385,-7.077619,1.490437,-0.8211543))*buf[3]+vec4(-7.67914,15.927437,1.3207729,-1.6686112);
    buf[5]=mat4(vec4(-1.4109162,-0.372762,-3.770383,-21.367174),vec4(-6.2103205,-9.35908,0.92529047,8.82561),vec4(11.460242,-22.348068,13.625772,-18.693201),vec4(-0.3429052,-3.9905605,-2.4626114,-0.45033523))*buf[0]+mat4(vec4(7.3481627,-4.3661838,-6.3037653,-3.868115),vec4(1.5462853,6.5488915,1.9701879,-0.58291394),vec4(6.5858274,-2.2180402,3.7127688,-1.3730392),vec4(-5.7973905,10.134961,-2.3395722,-5.965605))*buf[1]+mat4(vec4(-2.5132585,-6.6685553,-1.4029363,-0.16285264),vec4(-0.37908727,0.53738135,4.389061,-1.3024765),vec4(-0.70647055,2.0111287,-5.1659346,-3.728635),vec4(-13.562562,10.487719,-0.9173751,-2.6487076))*buf[2]+mat4(vec4(-8.645013,6.5546675,-6.3944063,-5.5933375),vec4(-0.57783127,-1.077275,36.91025,5.736769),vec4(14.283112,3.7146652,7.1452246,-4.5958776),vec4(2.7192075,3.6021907,-4.366337,-2.3653464))*buf[3]+vec4(-5.9000807,-4.329569,1.2427121,8.59503);
    buf[4]=sigmoid(buf[4]);buf[5]=sigmoid(buf[5]);
    buf[6]=mat4(vec4(-1.61102,0.7970257,1.4675229,0.20917463),vec4(-28.793737,-7.1390953,1.5025433,4.656581),vec4(-10.94861,39.66238,0.74318546,-10.095605),vec4(-0.7229728,-1.5483948,0.7301322,2.1687684))*buf[0]+mat4(vec4(3.2547753,21.489103,-1.0194173,-3.3100595),vec4(-3.7316632,-3.3792162,-7.223193,-0.23685838),vec4(13.1804495,0.7916005,5.338587,5.687114),vec4(-4.167605,-17.798311,-6.815736,-1.6451967))*buf[1]+mat4(vec4(0.604885,-7.800309,-7.213122,-2.741014),vec4(-3.522382,-0.12359311,-0.5258442,0.43852118),vec4(9.6752825,-22.853785,2.062431,0.099892326),vec4(-4.3196306,-17.730087,2.5184598,5.30267))*buf[2]+mat4(vec4(-6.545563,-15.790176,-6.0438633,-5.415399),vec4(-43.591583,28.551912,-16.00161,18.84728),vec4(4.212382,8.394307,3.0958717,8.657522),vec4(-5.0237565,-4.450633,-4.4768,-5.5010443))*buf[3]+mat4(vec4(1.6985557,-67.05806,6.897715,1.9004834),vec4(1.8680354,2.3915145,2.5231109,4.081538),vec4(11.158006,1.7294737,2.0738268,7.386411),vec4(-4.256034,-306.24686,8.258898,-17.132736))*buf[4]+mat4(vec4(1.6889864,-4.5852966,3.8534803,-6.3482175),vec4(1.3543309,-1.2640043,9.932754,2.9079645),vec4(-5.2770967,0.07150358,-0.13962056,3.3269649),vec4(28.34703,-4.918278,6.1044083,4.085355))*buf[5]+vec4(6.6818056,12.522166,-3.7075126,-4.104386);
    buf[7]=mat4(vec4(-8.265602,-4.7027016,5.098234,0.7509808),vec4(8.6507845,-17.15949,16.51939,-8.884479),vec4(-4.036479,-2.3946867,-2.6055532,-1.9866527),vec4(-2.2167742,-1.8135649,-5.9759874,4.8846445))*buf[0]+mat4(vec4(6.7790847,3.5076547,-2.8191125,-2.7028968),vec4(-5.743024,-0.27844876,1.4958696,-5.0517144),vec4(13.122226,15.735168,-2.9397483,-4.101023),vec4(-14.375265,-5.030483,-6.2599335,2.9848232))*buf[1]+mat4(vec4(4.0950394,-0.94011575,-5.674733,4.755022),vec4(4.3809423,4.8310084,1.7425908,-3.437416),vec4(2.117492,0.16342592,-104.56341,16.949184),vec4(-5.22543,-2.994248,3.8350096,-1.9364246))*buf[2]+mat4(vec4(-5.900337,1.7946124,-13.604192,-3.8060522),vec4(6.6583457,31.911177,25.164474,91.81147),vec4(11.840538,4.1503043,-0.7314397,6.768467),vec4(-6.3967767,4.034772,6.1714606,-0.32874924))*buf[3]+mat4(vec4(3.4992442,-196.91893,-8.923708,2.8142626),vec4(3.4806502,-3.1846354,5.1725626,5.1804223),vec4(-2.4009497,15.585794,1.2863957,2.0252278),vec4(-71.25271,-62.441242,-8.138444,0.50670296))*buf[4]+mat4(vec4(-12.291733,-11.176166,-7.3474145,4.390294),vec4(10.805477,5.6337385,-0.9385842,-4.7348723),vec4(-12.869276,-7.039391,5.3029537,7.5436664),vec4(1.4593618,8.91898,3.5101583,5.840625))*buf[5]+vec4(2.2415268,-6.705987,-0.98861027,-2.117676);
    buf[6]=sigmoid(buf[6]);buf[7]=sigmoid(buf[7]);
    buf[0]=mat4(vec4(1.6794263,1.3817469,2.9625452,0.),vec4(-1.8834411,-1.4806935,-3.5924516,0.),vec4(-1.3279216,-1.0918057,-2.3124623,0.),vec4(0.2662234,0.23235129,0.44178495,0.))*buf[0]+mat4(vec4(-0.6299101,-0.5945583,-0.9125601,0.),vec4(0.17828953,0.18300213,0.18182953,0.),vec4(-2.96544,-2.5819945,-4.9001055,0.),vec4(1.4195864,1.1868085,2.5176322,0.))*buf[1]+mat4(vec4(-1.2584374,-1.0552157,-2.1688404,0.),vec4(-0.7200217,-0.52666044,-1.438251,0.),vec4(0.15345335,0.15196142,0.272854,0.),vec4(0.945728,0.8861938,1.2766753,0.))*buf[2]+mat4(vec4(-2.4218085,-1.968602,-4.35166,0.),vec4(-22.683098,-18.0544,-41.954372,0.),vec4(0.63792,0.5470648,1.1078634,0.),vec4(-1.5489894,-1.3075932,-2.6444845,0.))*buf[3]+mat4(vec4(-0.49252132,-0.39877754,-0.91366625,0.),vec4(0.95609266,0.7923952,1.640221,0.),vec4(0.30616966,0.15693925,0.8639857,0.),vec4(1.1825981,0.94504964,2.176963,0.))*buf[4]+mat4(vec4(0.35446745,0.3293795,0.59547555,0.),vec4(-0.58784515,-0.48177817,-1.0614829,0.),vec4(2.5271258,1.9991658,4.6846647,0.),vec4(0.13042648,0.08864098,0.30187556,0.))*buf[5]+mat4(vec4(-1.7718065,-1.4033192,-3.3355875,0.),vec4(3.1664357,2.638297,5.378702,0.),vec4(-3.1724713,-2.6107926,-5.549295,0.),vec4(-2.851368,-2.249092,-5.3013067,0.))*buf[6]+mat4(vec4(1.5203838,1.2212278,2.8404984,0.),vec4(1.5210563,1.2651345,2.683903,0.),vec4(2.9789467,2.4364579,5.2347264,0.),vec4(2.2270417,1.8825914,3.8028636,0.))*buf[7]+vec4(-1.5468478,-3.6171484,0.24762098,0.);
    buf[0]=sigmoid(buf[0]);
    return vec4(buf[0].x,buf[0].y,buf[0].z,1.);
}

void mainImage(out vec4 fragColor,in vec2 fragCoord){
    vec2 uv=fragCoord/uResolution.xy*2.-1.;
    uv.x *= uResolution.x / uResolution.y;
    uv.y*=-1.;
    uv+=uWarp*vec2(sin(uv.y*6.283+uTime*0.5),cos(uv.x*6.283+uTime*0.5))*0.05;
    fragColor=cppn_fn(uv,0.1*sin(0.3*uTime),0.1*sin(0.69*uTime),0.1*sin(0.44*uTime));
}

void main(){
    vec4 col;mainImage(col,gl_FragCoord.xy);
    col.rgb=hueShiftRGB(col.rgb,uHueShift);
    float scanline_val=sin(gl_FragCoord.y*uScanFreq)*0.5+0.5;
    col.rgb*=1.-(scanline_val*scanline_val)*uScan;
    col.rgb+=(rand(gl_FragCoord.xy+uTime)-0.5)*uNoise;
    vec3 result=clamp(col.rgb,0.0,1.0);
    if(uLightMode>0.5){
      float energy=max(result.r,max(result.g,result.b));
      vec3 hue=result/max(energy,0.001);
      float coverage=smoothstep(0.08,0.82,energy);
      vec3 ink=mix(hue*0.32,hue*0.78,smoothstep(0.0,1.0,energy));
      result=mix(vec3(1.0),ink,coverage*0.82);
    }
    gl_FragColor=vec4(result,1.0);
}
`;

    document.querySelectorAll('[data-darkveil]').forEach(function (container) {
      const num = function (name, def) {
        const v = parseFloat(container.getAttribute(name));
        return Number.isFinite(v) ? v : def;
      };
      const speed = num('data-speed', 0.5);
      const resScale = num('data-res-scale', 1);

      const scene = new T.Scene();
      const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const geometry = new T.PlaneGeometry(2, 2);
      const material = new T.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depth: false,
        uniforms: {
          uTime: { value: 0 },
          uResolution: { value: [1, 1] },
          uHueShift: { value: num('data-hue-shift', 0) },
          uNoise: { value: num('data-noise-intensity', 0) },
          uScan: { value: num('data-scan-intensity', 0) },
          uScanFreq: { value: num('data-scan-freq', 0) },
          uWarp: { value: num('data-warp', 0) },
          uLightMode: { value: 0 }
        }
      });
      const mesh = new T.Mesh(geometry, material);
      mesh.frustumCulled = false;
      scene.add(mesh);

      const canvas = document.createElement('canvas');
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      container.appendChild(canvas);
      let renderer;
      try {
        renderer = new T.WebGLRenderer({ canvas, antialias: false, alpha: true });
      } catch (err) { void err; canvas.remove(); return; }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x000000, 0);
      const u = material.uniforms;

      const resize = function () {
        const w = Math.max(container.clientWidth, 1);
        const h = Math.max(container.clientHeight, 1);
        renderer.setSize(w * resScale, h * resScale, false);
        u.uResolution.value[0] = w;
        u.uResolution.value[1] = h;
      };
      const ro = new ResizeObserver(function () { resize(); renderer.render(scene, camera); });
      ro.observe(container);
      resize();

      const isLight = function () { return document.documentElement.getAttribute('data-theme') === 'light'; };
      u.uLightMode.value = isLight() ? 1 : 0;

      const start = performance.now();
      let raf = 0;
      let inView = false;
      const loop = function () {
        if (document.hidden || !inView) { raf = 0; return; }
        raf = requestAnimationFrame(loop);
        u.uTime.value = ((performance.now() - start) / 1000) * speed;
        renderer.render(scene, camera);
      };
      const wake = function () { if (!raf && !reduceMQ.matches) raf = requestAnimationFrame(loop); };
      const sleep = function () { if (raf) { cancelAnimationFrame(raf); raf = 0; } };
      const io = new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        if (inView) wake(); else sleep();
      }, { rootMargin: '120px' });
      io.observe(container);
      document.addEventListener('visibilitychange', function () { if (document.hidden) sleep(); else if (inView) wake(); });
      const mo = new MutationObserver(function () {
        u.uLightMode.value = isLight() ? 1 : 0;
        renderer.render(scene, camera);
      });
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      container.__darkveil = function () { return { running: !!raf, t: u.uTime.value }; };
    });
  })();

  /* ---- EvilEye 邪眼 · [data-evileye] — 极坐标噪声火焰 + 瞳孔追光 ---- */
  (function () {
    const T = window.THREE;
    if (!T) return;
    const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');

    const VERT = 'void main() {\n  gl_Position = vec4(position.xy, 0.0, 1.0);\n}\n';
    const FRAG = `precision highp float;

uniform float uTime;
uniform vec3 uResolution;
uniform sampler2D uNoiseTexture;
uniform float uPupilSize;
uniform float uIrisWidth;
uniform float uGlowIntensity;
uniform float uIntensity;
uniform float uScale;
uniform float uNoiseScale;
uniform vec2 uMouse;
uniform float uPupilFollow;
uniform float uFlameSpeed;
uniform vec3 uEyeColor;
uniform vec3 uBgColor;
uniform bool uLightMode;

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uResolution.xy) / uResolution.y;
  uv /= uScale;
  float ft = uTime * uFlameSpeed;

  float polarRadius = length(uv) * 2.0;
  float polarAngle = (2.0 * atan(uv.x, uv.y)) / 6.28 * 0.3;
  vec2 polarUv = vec2(polarRadius, polarAngle);

  vec4 noiseA = texture2D(uNoiseTexture, polarUv * vec2(0.2, 7.0) * uNoiseScale + vec2(-ft * 0.1, 0.0));
  vec4 noiseB = texture2D(uNoiseTexture, polarUv * vec2(0.3, 4.0) * uNoiseScale + vec2(-ft * 0.2, 0.0));
  vec4 noiseC = texture2D(uNoiseTexture, polarUv * vec2(0.1, 5.0) * uNoiseScale + vec2(-ft * 0.1, 0.0));

  float distanceMask = 1.0 - length(uv);

  float innerRing = clamp(-1.0 * ((distanceMask - 0.7) / uIrisWidth), 0.0, 1.0);
  innerRing = (innerRing * distanceMask - 0.2) / 0.28;
  innerRing += noiseA.r - 0.5;
  innerRing *= 1.3;
  innerRing = clamp(innerRing, 0.0, 1.0);

  float outerRing = clamp(-1.0 * ((distanceMask - 0.5) / 0.2), 0.0, 1.0);
  outerRing = (outerRing * distanceMask - 0.1) / 0.38;
  outerRing += noiseC.r - 0.5;
  outerRing *= 1.3;
  outerRing = clamp(outerRing, 0.0, 1.0);

  innerRing += outerRing;

  float innerEye = distanceMask - 0.1 * 2.0;
  innerEye *= noiseB.r * 2.0;

  vec2 pupilOffset = uMouse * uPupilFollow * 0.12;
  vec2 pupilUv = uv - pupilOffset;
  float pupil = 1.0 - length(pupilUv * vec2(9.0, 2.3));
  pupil *= uPupilSize;
  pupil = clamp(pupil, 0.0, 1.0);
  pupil /= 0.35;

  float outerEyeGlow = 1.0 - length(uv * vec2(0.5, 1.5));
  outerEyeGlow = clamp(outerEyeGlow + 0.5, 0.0, 1.0);
  outerEyeGlow += noiseC.r - 0.5;
  float outerBgGlow = outerEyeGlow;
  outerEyeGlow = pow(outerEyeGlow, 2.0);
  outerEyeGlow += distanceMask;
  outerEyeGlow *= uGlowIntensity;
  outerEyeGlow = clamp(outerEyeGlow, 0.0, 1.0);
  outerEyeGlow *= pow(1.0 - distanceMask, 2.0) * 2.5;

  outerBgGlow += distanceMask;
  outerBgGlow = pow(outerBgGlow, 0.5);
  outerBgGlow *= 0.15;

  vec3 eyeEnergy = uEyeColor * uIntensity * clamp(max(innerRing + innerEye, outerEyeGlow + outerBgGlow) - pupil, 0.0, 3.0);
  vec3 color;
  if (uLightMode) {
    vec3 mapped = vec3(1.0) - exp(-max(eyeEnergy, vec3(0.0)) * 1.3);
    float energy = clamp(max(mapped.r, max(mapped.g, mapped.b)), 0.0, 1.0);
    vec3 hue = mapped / max(energy, 0.0001);
    hue = pow(clamp(hue, 0.0, 1.0), vec3(1.2));
    color = mix(uBgColor, hue, smoothstep(0.02, 0.82, energy) * 0.96);
  } else {
    color = eyeEnergy + uBgColor;
  }

  gl_FragColor = vec4(color, 1.0);
}`;

    const generateNoiseTexture = function (size) {
      size = size || 256;
      const data = new Uint8Array(size * size * 4);
      function hash(x, y, s) {
        let n = x * 374761393 + y * 668265263 + s * 1274126177;
        n = Math.imul(n ^ (n >>> 13), 1274126177);
        return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
      }
      function noise(px, py, freq, seed) {
        const fx = (px / size) * freq;
        const fy = (py / size) * freq;
        const ix = Math.floor(fx);
        const iy = Math.floor(fy);
        const tx = fx - ix;
        const ty = fy - iy;
        const w = freq | 0;
        const v00 = hash(((ix % w) + w) % w, ((iy % w) + w) % w, seed);
        const v10 = hash((((ix + 1) % w) + w) % w, ((iy % w) + w) % w, seed);
        const v01 = hash(((ix % w) + w) % w, (((iy + 1) % w) + w) % w, seed);
        const v11 = hash((((ix + 1) % w) + w) % w, (((iy + 1) % w) + w) % w, seed);
        return v00 * (1 - tx) * (1 - ty) + v10 * tx * (1 - ty) + v01 * (1 - tx) * ty + v11 * tx * ty;
      }
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          let v = 0;
          let amp = 0.4;
          let totalAmp = 0;
          for (let o = 0; o < 8; o++) {
            const f = 32 * (1 << o);
            v += amp * noise(x, y, f, o * 31);
            totalAmp += amp;
            amp *= 0.65;
          }
          v /= totalAmp;
          v = (v - 0.5) * 2.2 + 0.5;
          v = Math.max(0, Math.min(1, v));
          const val = Math.round(v * 255);
          const i = (y * size + x) * 4;
          data[i] = val;
          data[i + 1] = val;
          data[i + 2] = val;
          data[i + 3] = 255;
        }
      }
      return data;
    };

    document.querySelectorAll('[data-evileye]').forEach(function (container) {
      const num = function (name, def) {
        const v = parseFloat(container.getAttribute(name));
        return Number.isFinite(v) ? v : def;
      };
      const bgDark = container.getAttribute('data-bg') || '#000000';
      const bgLight = container.getAttribute('data-bg-light') || '#f6f3fc';
      const bgColor = function () {
        return document.documentElement.getAttribute('data-theme') === 'light' ? bgLight : bgDark;
      };

      const noiseData = generateNoiseTexture(256);
      const noiseTexture = new T.DataTexture(noiseData, 256, 256, T.RGBAFormat);
      noiseTexture.minFilter = T.LinearFilter;
      noiseTexture.magFilter = T.LinearFilter;
      noiseTexture.wrapS = T.RepeatWrapping;
      noiseTexture.wrapT = T.RepeatWrapping;
      noiseTexture.generateMipmaps = false;
      noiseTexture.needsUpdate = true;

      const scene = new T.Scene();
      const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const geometry = new T.PlaneGeometry(2, 2);
      const material = new T.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depth: false,
        uniforms: {
          uTime: { value: 0 },
          uResolution: { value: [1, 1, 1] },
          uNoiseTexture: { value: noiseTexture },
          uPupilSize: { value: num('data-pupil-size', 0.6) },
          uIrisWidth: { value: num('data-iris-width', 0.25) },
          uGlowIntensity: { value: num('data-glow-intensity', 0.35) },
          uIntensity: { value: num('data-intensity', 1.5) },
          uScale: { value: num('data-scale', 0.8) },
          uNoiseScale: { value: num('data-noise-scale', 1.0) },
          uMouse: { value: [0, 0] },
          uPupilFollow: { value: num('data-pupil-follow', 1.0) },
          uFlameSpeed: { value: num('data-flame-speed', 1.0) },
          uEyeColor: { value: __hex3(container.getAttribute('data-eye-color') || '#FF6F37') },
          uBgColor: { value: __hex3(bgColor()) },
          uLightMode: { value: false }
        }
      });
      const mesh = new T.Mesh(geometry, material);
      mesh.frustumCulled = false;
      scene.add(mesh);

      const canvas = document.createElement('canvas');
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      container.appendChild(canvas);
      let renderer;
      try {
        renderer = new T.WebGLRenderer({ canvas, antialias: false, alpha: true, premultipliedAlpha: false });
      } catch (err) { void err; canvas.remove(); return; }
      renderer.setPixelRatio(1);
      renderer.setClearColor(0x000000, 0);
      const u = material.uniforms;

      const resize = function () {
        const w = Math.max(container.clientWidth, 1);
        const h = Math.max(container.clientHeight, 1);
        renderer.setSize(w, h, false);
        u.uResolution.value[0] = canvas.width;
        u.uResolution.value[1] = canvas.height;
        u.uResolution.value[2] = canvas.width / canvas.height;
      };
      const ro = new ResizeObserver(function () { resize(); renderer.render(scene, camera); });
      ro.observe(container);
      resize();

      const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
      const onMove = function (e) {
        const rect = container.getBoundingClientRect();
        mouse.tx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.ty = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      };
      const onLeave = function () { mouse.tx = 0; mouse.ty = 0; };

      let raf = 0;
      let inView = false;
      const loop = function (t) {
        if (document.hidden || !inView) { raf = 0; return; }
        raf = requestAnimationFrame(loop);
        mouse.x += (mouse.tx - mouse.x) * 0.05;
        mouse.y += (mouse.ty - mouse.y) * 0.05;
        u.uMouse.value[0] = mouse.x;
        u.uMouse.value[1] = mouse.y;
        u.uTime.value = t * 0.001;
        renderer.render(scene, camera);
      };
      const wake = function () {
        if (!raf && !reduceMQ.matches) {
          container.addEventListener('mousemove', onMove);
          container.addEventListener('mouseleave', onLeave);
          raf = requestAnimationFrame(loop);
        }
      };
      const sleep = function () {
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        container.removeEventListener('mousemove', onMove);
        container.removeEventListener('mouseleave', onLeave);
      };
      const io = new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        if (inView) wake(); else sleep();
      }, { rootMargin: '120px' });
      io.observe(container);
      document.addEventListener('visibilitychange', function () { if (document.hidden) sleep(); else if (inView) wake(); });
      const mo = new MutationObserver(function () {
        const light = document.documentElement.getAttribute('data-theme') === 'light';
        u.uLightMode.value = light;
        u.uBgColor.value = __hex3(bgColor());
        renderer.render(scene, camera);
      });
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      container.__evileye = function () { return { running: !!raf, t: u.uTime.value }; };
    });
  })();

  /* ---- LineWaves 线波干涉 · [data-linewaves] — 双位移场脊线三色干涉 ---- */
  (function () {
    const T = window.THREE;
    if (!T) return;
    const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');

    const VERT = 'void main() {\n  gl_Position = vec4(position.xy, 0.0, 1.0);\n}\n';
    const FRAG = `precision highp float;

uniform float uTime;
uniform vec3 uResolution;
uniform float uSpeed;
uniform float uInnerLines;
uniform float uOuterLines;
uniform float uWarpIntensity;
uniform float uRotation;
uniform float uEdgeFadeWidth;
uniform float uColorCycleSpeed;
uniform float uBrightness;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform vec2 uMouse;
uniform float uMouseInfluence;
uniform bool uEnableMouse;
uniform float uLightMode;

#define HALF_PI 1.5707963

float hashF(float n) {
  return fract(sin(n * 127.1) * 43758.5453123);
}

float smoothNoise(float x) {
  float i = floor(x);
  float f = fract(x);
  float u = f * f * (3.0 - 2.0 * f);
  return mix(hashF(i), hashF(i + 1.0), u);
}

float displaceA(float coord, float t) {
  float result = sin(coord * 2.123) * 0.2;
  result += sin(coord * 3.234 + t * 4.345) * 0.1;
  result += sin(coord * 0.589 + t * 0.934) * 0.5;
  return result;
}

float displaceB(float coord, float t) {
  float result = sin(coord * 1.345) * 0.3;
  result += sin(coord * 2.734 + t * 3.345) * 0.2;
  result += sin(coord * 0.189 + t * 0.934) * 0.3;
  return result;
}

vec2 rotate2D(vec2 p, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
}

void main() {
  vec2 coords = gl_FragCoord.xy / uResolution.xy;
  coords = coords * 2.0 - 1.0;
  coords = rotate2D(coords, uRotation);

  float halfT = uTime * uSpeed * 0.5;
  float fullT = uTime * uSpeed;

  float mouseWarp = 0.0;
  if (uEnableMouse) {
    vec2 mPos = rotate2D(uMouse * 2.0 - 1.0, uRotation);
    float mDist = length(coords - mPos);
    mouseWarp = uMouseInfluence * exp(-mDist * mDist * 4.0);
  }

  float warpAx = coords.x + displaceA(coords.y, halfT) * uWarpIntensity + mouseWarp;
  float warpAy = coords.y - displaceA(coords.x * cos(fullT) * 1.235, halfT) * uWarpIntensity;
  float warpBx = coords.x + displaceB(coords.y, halfT) * uWarpIntensity + mouseWarp;
  float warpBy = coords.y - displaceB(coords.x * sin(fullT) * 1.235, halfT) * uWarpIntensity;

  vec2 fieldA = vec2(warpAx, warpAy);
  vec2 fieldB = vec2(warpBx, warpBy);
  vec2 blended = mix(fieldA, fieldB, mix(fieldA, fieldB, 0.5));

  float fadeTop = smoothstep(uEdgeFadeWidth, uEdgeFadeWidth + 0.4, blended.y);
  float fadeBottom = smoothstep(-uEdgeFadeWidth, -(uEdgeFadeWidth + 0.4), blended.y);
  float vMask = 1.0 - max(fadeTop, fadeBottom);

  float tileCount = mix(uOuterLines, uInnerLines, vMask);
  float scaledY = blended.y * tileCount;
  float nY = smoothNoise(abs(scaledY));

  float ridge = pow(
    step(abs(nY - blended.x) * 2.0, HALF_PI) * cos(2.0 * (nY - blended.x)),
    5.0
  );

  float lines = 0.0;
  for (float i = 1.0; i < 3.0; i += 1.0) {
    lines += pow(max(fract(scaledY), fract(-scaledY)), i * 2.0);
  }

  float pattern = vMask * lines;

  float cycleT = fullT * uColorCycleSpeed;
  float rChannel = (pattern + lines * ridge) * (cos(blended.y + cycleT * 0.234) * 0.5 + 1.0);
  float gChannel = (pattern + vMask * ridge) * (sin(blended.x + cycleT * 1.745) * 0.5 + 1.0);
  float bChannel = (pattern + lines * ridge) * (cos(blended.x + cycleT * 0.534) * 0.5 + 1.0);

  vec3 col = (rChannel * uColor1 + gChannel * uColor2 + bChannel * uColor3) * uBrightness;
  float alpha = clamp(length(col), 0.0, 1.0);

  if (uLightMode > 0.5) {
    vec3 weights = pow(max(vec3(rChannel, gChannel, bChannel), vec3(0.0)), vec3(3.0));
    float weightSum = max(weights.r + weights.g + weights.b, 0.0001);
    vec3 chroma = (weights.r * uColor1 + weights.g * uColor2 + weights.b * uColor3) / weightSum;
    float neutral = min(chroma.r, min(chroma.g, chroma.b));
    chroma = max(chroma - vec3(neutral * 0.92), vec3(0.0));
    float peak = max(chroma.r, max(chroma.g, chroma.b));
    chroma = pow(clamp(chroma / max(peak, 0.0001), 0.0, 1.0), vec3(1.08));
    float ink = clamp(max(rChannel, max(gChannel, bChannel)) * uBrightness * 1.15, 0.0, 0.92);
    gl_FragColor = vec4(mix(vec3(1.0), chroma, ink), 1.0);
  } else {
    gl_FragColor = vec4(col, alpha);
  }
}`;

    document.querySelectorAll('[data-linewaves]').forEach(function (container) {
      const num = function (name, def) {
        const v = parseFloat(container.getAttribute(name));
        return Number.isFinite(v) ? v : def;
      };
      const enableMouse = container.getAttribute('data-no-mouse') !== 'true';

      const scene = new T.Scene();
      const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const geometry = new T.PlaneGeometry(2, 2);
      const material = new T.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depth: false,
        uniforms: {
          uTime: { value: 0 },
          uResolution: { value: [1, 1, 1] },
          uSpeed: { value: num('data-speed', 0.3) },
          uInnerLines: { value: num('data-inner-lines', 32) },
          uOuterLines: { value: num('data-outer-lines', 36) },
          uWarpIntensity: { value: num('data-warp-intensity', 1.0) },
          uRotation: { value: (num('data-rotation', -45) * Math.PI) / 180 },
          uEdgeFadeWidth: { value: num('data-edge-fade', 0) },
          uColorCycleSpeed: { value: num('data-cycle-speed', 1.0) },
          uBrightness: { value: num('data-brightness', 0.2) },
          uColor1: { value: __hex3(container.getAttribute('data-color1') || '#ffffff') },
          uColor2: { value: __hex3(container.getAttribute('data-color2') || '#ffffff') },
          uColor3: { value: __hex3(container.getAttribute('data-color3') || '#ffffff') },
          uMouse: { value: [0.5, 0.5] },
          uMouseInfluence: { value: num('data-mouse-influence', 2.0) },
          uEnableMouse: { value: enableMouse },
          uLightMode: { value: 0 }
        }
      });
      const mesh = new T.Mesh(geometry, material);
      mesh.frustumCulled = false;
      scene.add(mesh);

      const canvas = document.createElement('canvas');
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      container.appendChild(canvas);
      let renderer;
      try {
        renderer = new T.WebGLRenderer({ canvas, antialias: false, alpha: true, premultipliedAlpha: false });
      } catch (err) { void err; canvas.remove(); return; }
      renderer.setPixelRatio(1);
      renderer.setClearColor(0x000000, 0);
      const u = material.uniforms;

      const resize = function () {
        const w = Math.max(container.clientWidth, 1);
        const h = Math.max(container.clientHeight, 1);
        renderer.setSize(w, h, false);
        u.uResolution.value[0] = canvas.width;
        u.uResolution.value[1] = canvas.height;
        u.uResolution.value[2] = canvas.width / canvas.height;
      };
      const ro = new ResizeObserver(function () { resize(); renderer.render(scene, camera); });
      ro.observe(container);
      resize();

      let currentMouse = [0.5, 0.5];
      let targetMouse = [0.5, 0.5];
      const onMove = function (e) {
        const rect = canvas.getBoundingClientRect();
        targetMouse = [
          (e.clientX - rect.left) / rect.width,
          1.0 - (e.clientY - rect.top) / rect.height
        ];
      };
      const onLeave = function () { targetMouse = [0.5, 0.5]; };

      const isLight = function () { return document.documentElement.getAttribute('data-theme') === 'light'; };
      u.uLightMode.value = isLight() ? 1 : 0;

      let raf = 0;
      let inView = false;
      const loop = function (t) {
        if (document.hidden || !inView) { raf = 0; return; }
        raf = requestAnimationFrame(loop);
        u.uTime.value = t * 0.001;
        if (enableMouse) {
          currentMouse[0] += 0.05 * (targetMouse[0] - currentMouse[0]);
          currentMouse[1] += 0.05 * (targetMouse[1] - currentMouse[1]);
          u.uMouse.value[0] = currentMouse[0];
          u.uMouse.value[1] = currentMouse[1];
        } else {
          u.uMouse.value[0] = 0.5;
          u.uMouse.value[1] = 0.5;
        }
        renderer.render(scene, camera);
      };
      const wake = function () {
        if (!raf && !reduceMQ.matches) {
          if (enableMouse) {
            canvas.addEventListener('mousemove', onMove);
            canvas.addEventListener('mouseleave', onLeave);
          }
          raf = requestAnimationFrame(loop);
        }
      };
      const sleep = function () {
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        if (enableMouse) {
          canvas.removeEventListener('mousemove', onMove);
          canvas.removeEventListener('mouseleave', onLeave);
        }
      };
      const io = new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        if (inView) wake(); else sleep();
      }, { rootMargin: '120px' });
      io.observe(container);
      document.addEventListener('visibilitychange', function () { if (document.hidden) sleep(); else if (inView) wake(); });
      const mo = new MutationObserver(function () {
        u.uLightMode.value = isLight() ? 1 : 0;
        renderer.render(scene, camera);
      });
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      container.__linewaves = function () { return { running: !!raf, t: u.uTime.value }; };
    });
  })();

  /* ---- PixelSnow 像素雪场 · [data-pixelsnow] — 官方本就是 three, 体素 DDAC 雪景原样 ---- */
  (function () {
    const T = window.THREE;
    if (!T) return;
    const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');

    const VERT = 'void main() {\n  gl_Position = vec4(position, 1.0);\n}\n';
    const FRAG = `precision mediump float;

uniform float uTime;
uniform vec2 uResolution;
uniform float uFlakeSize;
uniform float uMinFlakeSize;
uniform float uPixelResolution;
uniform float uSpeed;
uniform float uDepthFade;
uniform float uFarPlane;
uniform vec3 uColor;
uniform float uBrightness;
uniform float uGamma;
uniform float uDensity;
uniform float uVariant;
uniform float uDirection;

#define PI 3.14159265
#define PI_OVER_6 0.5235988
#define PI_OVER_3 1.0471976
#define INV_SQRT3 0.57735027
#define M1 1597334677U
#define M2 3812015801U
#define M3 3299493293U
#define F0 2.3283064e-10

#define hash(n) (n * (n ^ (n >> 15)))
#define coord3(p) (uvec3(p).x * M1 ^ uvec3(p).y * M2 ^ uvec3(p).z * M3)

const vec3 camK = vec3(0.57735027, 0.57735027, 0.57735027);
const vec3 camI = vec3(0.70710678, 0.0, -0.70710678);
const vec3 camJ = vec3(-0.40824829, 0.81649658, -0.40824829);

const vec2 b1d = vec2(0.574, 0.819);

vec3 hash3(uint n) {
  uvec3 hashed = hash(n) * uvec3(1U, 511U, 262143U);
  return vec3(hashed) * F0;
}

float snowflakeDist(vec2 p) {
  float r = length(p);
  float a = atan(p.y, p.x);
  a = abs(mod(a + PI_OVER_6, PI_OVER_3) - PI_OVER_6);
  vec2 q = r * vec2(cos(a), sin(a));
  float dMain = max(abs(q.y), max(-q.x, q.x - 1.0));
  float b1t = clamp(dot(q - vec2(0.4, 0.0), b1d), 0.0, 0.4);
  float dB1 = length(q - vec2(0.4, 0.0) - b1t * b1d);
  float b2t = clamp(dot(q - vec2(0.7, 0.0), b1d), 0.0, 0.25);
  float dB2 = length(q - vec2(0.7, 0.0) - b2t * b1d);
  return min(dMain, min(dB1, dB2)) * 10.0;
}

void main() {
  float invPixelRes = 1.0 / uPixelResolution;
  float pixelSize = max(1.0, floor(0.5 + uResolution.x * invPixelRes));
  float invPixelSize = 1.0 / pixelSize;

  vec2 fragCoord = floor(gl_FragCoord.xy * invPixelSize);
  vec2 res = uResolution * invPixelSize;
  float invResX = 1.0 / res.x;

  vec3 ray = normalize(vec3((fragCoord - res * 0.5) * invResX, 1.0));
  ray = ray.x * camI + ray.y * camJ + ray.z * camK;

  float timeSpeed = uTime * uSpeed;
  float windX = cos(uDirection) * 0.4;
  float windY = sin(uDirection) * 0.4;
  vec3 camPos = (windX * camI + windY * camJ + 0.1 * camK) * timeSpeed;
  vec3 pos = camPos;

  vec3 absRay = max(abs(ray), vec3(0.001));
  vec3 strides = 1.0 / absRay;
  vec3 raySign = step(ray, vec3(0.0));
  vec3 phase = fract(pos) * strides;
  phase = mix(strides - phase, phase, raySign);

  float rayDotCamK = dot(ray, camK);
  float invRayDotCamK = 1.0 / rayDotCamK;
  float invDepthFade = 1.0 / uDepthFade;
  float halfInvResX = 0.5 * invResX;
  vec3 timeAnim = timeSpeed * 0.1 * vec3(7.0, 8.0, 5.0);

  float t = 0.0;
  for (int i = 0; i < 128; i++) {
    if (t >= uFarPlane) break;

    vec3 fpos = floor(pos);
    uint cellCoord = coord3(fpos);
    float cellHash = hash3(cellCoord).x;

    if (cellHash < uDensity) {
      vec3 h = hash3(cellCoord);

      vec3 sinArg1 = fpos.yzx * 0.073;
      vec3 sinArg2 = fpos.zxy * 0.27;
      vec3 flakePos = 0.5 - 0.5 * cos(4.0 * sin(sinArg1) + 4.0 * sin(sinArg2) + 2.0 * h + timeAnim);
      flakePos = flakePos * 0.8 + 0.1 + fpos;

      float toIntersection = dot(flakePos - pos, camK) * invRayDotCamK;

      if (toIntersection > 0.0) {
        vec3 testPos = pos + ray * toIntersection - flakePos;
        float testX = dot(testPos, camI);
        float testY = dot(testPos, camJ);
        vec2 testUV = abs(vec2(testX, testY));

        float depth = dot(flakePos - camPos, camK);
        float flakeSize = max(uFlakeSize, uMinFlakeSize * depth * halfInvResX);

        float dist;
        if (uVariant < 0.5) {
          dist = max(testUV.x, testUV.y);
        } else if (uVariant < 1.5) {
          dist = length(testUV);
        } else {
          float invFlakeSize = 1.0 / flakeSize;
          dist = snowflakeDist(vec2(testX, testY) * invFlakeSize) * flakeSize;
        }

        if (dist < flakeSize) {
          float flakeSizeRatio = uFlakeSize / flakeSize;
          float intensity = exp2(-(t + toIntersection) * invDepthFade) *
                           min(1.0, flakeSizeRatio * flakeSizeRatio) * uBrightness;
          gl_FragColor = vec4(uColor * pow(vec3(intensity), vec3(uGamma)), 1.0);
          return;
        }
      }
    }

    float nextStep = min(min(phase.x, phase.y), phase.z);
    vec3 sel = step(phase, vec3(nextStep));
    phase = phase - nextStep + strides * sel;
    t += nextStep;
    pos = mix(pos + ray * nextStep, floor(pos + ray * nextStep + 0.5), sel);
  }

  gl_FragColor = vec4(0.0);
}`;

    document.querySelectorAll('[data-pixelsnow]').forEach(function (container) {
      const num = function (name, def) {
        const v = parseFloat(container.getAttribute(name));
        return Number.isFinite(v) ? v : def;
      };
      const variant = container.getAttribute('data-variant') || 'square';
      const variantValue = variant === 'round' ? 1.0 : variant === 'snowflake' ? 2.0 : 0.0;

      const scene = new T.Scene();
      const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const geometry = new T.PlaneGeometry(2, 2);
      const material = new T.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depth: false,
        uniforms: {
          uTime: { value: 0 },
          uResolution: { value: new T.Vector2(1, 1) },
          uFlakeSize: { value: num('data-flake-size', 0.01) },
          uMinFlakeSize: { value: num('data-min-flake-size', 1.25) },
          uPixelResolution: { value: num('data-pixel-resolution', 200) },
          uSpeed: { value: num('data-speed', 1.25) },
          uDepthFade: { value: num('data-depth-fade', 8) },
          uFarPlane: { value: num('data-far-plane', 20) },
          uColor: { value: new T.Vector3().fromArray(__hex3(container.getAttribute('data-color') || '#ffffff')) },
          uBrightness: { value: num('data-brightness', 1) },
          uGamma: { value: num('data-gamma', 0.4545) },
          uDensity: { value: num('data-density', 0.3) },
          uVariant: { value: variantValue },
          uDirection: { value: (num('data-direction', 125) * Math.PI) / 180 }
        }
      });
      const mesh = new T.Mesh(geometry, material);
      mesh.frustumCulled = false;
      scene.add(mesh);

      const canvas = document.createElement('canvas');
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      container.appendChild(canvas);
      let renderer;
      try {
        renderer = new T.WebGLRenderer({ canvas, antialias: false, alpha: true, premultipliedAlpha: false, powerPreference: 'high-performance', stencil: false, depth: false });
      } catch (err) { void err; canvas.remove(); return; }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x000000, 0);
      const u = material.uniforms;

      let resizeTimer = 0;
      const doResize = function () {
        const w = Math.max(container.clientWidth, 1);
        const h = Math.max(container.clientHeight, 1);
        renderer.setSize(w, h, false);
        u.uResolution.value.set(canvas.width, canvas.height);
      };
      const onWinResize = function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(doResize, 100);
      };
      window.addEventListener('resize', onWinResize);
      const ro = new ResizeObserver(doResize);
      ro.observe(container);
      doResize();

      const startTime = performance.now();
      let raf = 0;
      let inView = false;
      const loop = function () {
        if (document.hidden || !inView) { raf = 0; return; }
        raf = requestAnimationFrame(loop);
        u.uTime.value = (performance.now() - startTime) * 0.001;
        renderer.render(scene, camera);
      };
      const wake = function () { if (!raf && !reduceMQ.matches) raf = requestAnimationFrame(loop); };
      const sleep = function () { if (raf) { cancelAnimationFrame(raf); raf = 0; } };
      const io = new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        if (inView) wake(); else sleep();
      }, { rootMargin: '120px' });
      io.observe(container);
      document.addEventListener('visibilitychange', function () { if (document.hidden) sleep(); else if (inView) wake(); });
      container.__pixelsnow = function () { return { running: !!raf, t: u.uTime.value }; };
    });
  })();

  /* ---- SideRays 侧射光 · [data-siderays] — 与 LightRays 同族的角光源双束射线 ---- */
  (function () {
    const T = window.THREE;
    if (!T) return;
    const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');

    const VERT = 'void main() {\n  gl_Position = vec4(position.xy, 0.0, 1.0);\n}\n';
    const FRAG = `precision highp float;

uniform float iTime;
uniform vec2 iResolution;
uniform float iSpeed;
uniform vec3 iRayColor1;
uniform vec3 iRayColor2;
uniform float iIntensity;
uniform float iSpread;
uniform float iFlipX;
uniform float iFlipY;
uniform float iTilt;
uniform float iSaturation;
uniform float iBlend;
uniform float iFalloff;
uniform float iOpacity;

float rayStrength(vec2 raySource, vec2 rayRefDirection, vec2 coord, float seedA, float seedB, float speed) {
  vec2 sourceToCoord = coord - raySource;
  float cosAngle = dot(normalize(sourceToCoord), rayRefDirection);
  return clamp(
    (0.45 + 0.15 * sin(cosAngle * seedA + iTime * speed)) +
    (0.3 + 0.2 * cos(-cosAngle * seedB + iTime * speed)),
    0.0, 1.0) *
    clamp((iResolution.x - length(sourceToCoord)) / iResolution.x, 0.5, 1.0);
}

void main() {
  vec2 fragCoord = gl_FragCoord.xy;
  if (iFlipX > 0.5) fragCoord.x = iResolution.x - fragCoord.x;
  if (iFlipY > 0.5) fragCoord.y = iResolution.y - fragCoord.y;

  vec2 coord = vec2(fragCoord.x, iResolution.y - fragCoord.y);
  vec2 rayPos = vec2(iResolution.x * 1.1, -0.5 * iResolution.y);

  float tiltRad = iTilt * 3.14159265 / 180.0;
  float cs = cos(tiltRad);
  float sn = sin(tiltRad);
  vec2 rel = coord - rayPos;
  vec2 tiltedCoord = vec2(rel.x * cs - rel.y * sn, rel.x * sn + rel.y * cs) + rayPos;

  float halfSpread = iSpread * 0.275;
  vec2 rayRefDir1 = normalize(vec2(cos(0.785398 + halfSpread), sin(0.785398 + halfSpread)));
  vec2 rayRefDir2 = normalize(vec2(cos(0.785398 - halfSpread), sin(0.785398 - halfSpread)));

  vec4 rays1 = vec4(iRayColor1, 1.0) * rayStrength(rayPos, rayRefDir1, tiltedCoord, 36.2214, 21.11349, iSpeed);
  vec4 rays2 = vec4(iRayColor2, 1.0) * rayStrength(rayPos, rayRefDir2, tiltedCoord, 22.3991, 18.0234, iSpeed * 0.2);

  vec4 color = rays1 * (1.0 - iBlend) * 0.9 + rays2 * iBlend * 0.9;

  float distanceToLight = length(fragCoord.xy - vec2(rayPos.x, iResolution.y - rayPos.y)) / iResolution.y;
  float brightness = iIntensity * 0.4 / pow(max(distanceToLight, 0.001), iFalloff);
  color.rgb *= brightness;

  float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  color.rgb = mix(vec3(gray), color.rgb, iSaturation);

  color.a = max(color.r, max(color.g, color.b)) * iOpacity;
  gl_FragColor = color;
}`;

    const originToFlip = function (origin) {
      switch (origin) {
        case 'top-left': return [1, 0];
        case 'bottom-right': return [0, 1];
        case 'bottom-left': return [1, 1];
        default: return [0, 0];
      }
    };

    document.querySelectorAll('[data-siderays]').forEach(function (container) {
      const num = function (name, def) {
        const v = parseFloat(container.getAttribute(name));
        return Number.isFinite(v) ? v : def;
      };
      const flip = originToFlip(container.getAttribute('data-origin') || 'top-right');

      const scene = new T.Scene();
      const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const geometry = new T.PlaneGeometry(2, 2);
      const material = new T.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depth: false,
        uniforms: {
          iTime: { value: 0 },
          iResolution: { value: [1, 1] },
          iSpeed: { value: num('data-speed', 2.5) },
          iRayColor1: { value: __hex3(container.getAttribute('data-color1') || '#EAB308') },
          iRayColor2: { value: __hex3(container.getAttribute('data-color2') || '#96c8ff') },
          iIntensity: { value: num('data-intensity', 2) },
          iSpread: { value: num('data-spread', 2) },
          iFlipX: { value: flip[0] },
          iFlipY: { value: flip[1] },
          iTilt: { value: num('data-tilt', 0) },
          iSaturation: { value: num('data-saturation', 1.5) },
          iBlend: { value: num('data-blend', 0.75) },
          iFalloff: { value: num('data-falloff', 1.6) },
          iOpacity: { value: num('data-opacity', 1.0) }
        }
      });
      const mesh = new T.Mesh(geometry, material);
      mesh.frustumCulled = false;
      scene.add(mesh);

      const canvas = document.createElement('canvas');
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      container.appendChild(canvas);
      let renderer;
      try {
        renderer = new T.WebGLRenderer({ canvas, antialias: false, alpha: true });
      } catch (err) { void err; canvas.remove(); return; }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x000000, 0);
      const u = material.uniforms;

      const resize = function () {
        const w = Math.max(container.clientWidth, 1);
        const h = Math.max(container.clientHeight, 1);
        renderer.setSize(w, h, false);
        const dpr = renderer.getPixelRatio();
        u.iResolution.value[0] = w * dpr;
        u.iResolution.value[1] = h * dpr;
      };
      const ro = new ResizeObserver(function () { resize(); renderer.render(scene, camera); });
      ro.observe(container);
      resize();

      let raf = 0;
      let inView = false;
      const loop = function (t) {
        if (document.hidden || !inView) { raf = 0; return; }
        raf = requestAnimationFrame(loop);
        u.iTime.value = t * 0.001;
        renderer.render(scene, camera);
      };
      const wake = function () { if (!raf && !reduceMQ.matches) raf = requestAnimationFrame(loop); };
      const sleep = function () { if (raf) { cancelAnimationFrame(raf); raf = 0; } };
      const io = new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        if (inView) wake(); else sleep();
      }, { rootMargin: '120px' });
      io.observe(container);
      document.addEventListener('visibilitychange', function () { if (document.hidden) sleep(); else if (inView) wake(); });
      container.__siderays = function () { return { running: !!raf, t: u.iTime.value }; };
    });
  })();

  /* ============ v106 · React Bits 第十四批 (Backgrounds) ============
     LiquidEther / MoltenMetal / PrismaticBurst / LightTunnel / Ferrofluid / ColorBends / Threads / GridDistortion
     Hyperspeed 未移植: 官方依赖 postprocessing 库(记录于注释, 同 PixelBlast 先例) */

  /* ---- LiquidEther 液态以太 · [data-liquidether] — 官方 three.js Navier-Stokes FBO 管线逐 pass 原样 ---- */
  (function () {
    const T = window.THREE;
    if (!T) return;
    const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
    document.querySelectorAll('[data-liquidether]').forEach(function (container) {
      const num = function (name, d) { const v = parseFloat(container.getAttribute(name)); return isNaN(v) ? d : v; };
      const bool = function (name, d) { const v = container.getAttribute(name); return v == null ? d : v === 'true'; };
      const dtV = num('data-dt', 0.014);
      const resolution = num('data-resolution', 0.5);
      const mouseForce = num('data-mouse-force', 20);
      const cursorSize = num('data-cursor-size', 100);
      const BFECC = bool('data-bfecc', true);
      const isBounce = bool('data-is-bounce', false);
      const iterationsPoisson = Math.max(1, num('data-iterations-poisson', 32) | 0);
      const autoDemo = bool('data-auto-demo', true);
      const autoSpeed = num('data-auto-speed', 0.5);
      const autoIntensity = num('data-auto-intensity', 2.2);
      const stops = (container.getAttribute('data-colors') || '#8B5CF6,#E879F9,#C4B5FD').split(',').map(function (s) { return s.trim(); }).filter(Boolean);

      const face_vert = `
  attribute vec3 position;
  uniform vec2 px;
  uniform vec2 boundarySpace;
  varying vec2 uv;
  precision highp float;
  void main(){
  vec3 pos = position;
  vec2 scale = 1.0 - boundarySpace * 2.0;
  pos.xy = pos.xy * scale;
  uv = vec2(0.5)+(pos.xy)*0.5;
  gl_Position = vec4(pos, 1.0);
}
`;
      const line_vert = `
  attribute vec3 position;
  uniform vec2 px;
  precision highp float;
  varying vec2 uv;
  void main(){
  vec3 pos = position;
  uv = 0.5 + pos.xy * 0.5;
  vec2 n = sign(pos.xy);
  pos.xy = abs(pos.xy) - px * 1.0;
  pos.xy *= n;
  gl_Position = vec4(pos, 1.0);
}
`;
      const mouse_vert = `
    precision highp float;
    attribute vec3 position;
    attribute vec2 uv;
    uniform vec2 center;
    uniform vec2 scale;
    uniform vec2 px;
    varying vec2 vUv;
    void main(){
    vec2 pos = position.xy * scale * 2.0 * px + center;
    vUv = uv;
    gl_Position = vec4(pos, 0.0, 1.0);
}
`;
      const advection_frag = `
    precision highp float;
    uniform sampler2D velocity;
    uniform float dt;
    uniform bool isBFECC;
    uniform vec2 fboSize;
    uniform vec2 px;
    varying vec2 uv;
    void main(){
    vec2 ratio = max(fboSize.x, fboSize.y) / fboSize;
    if(isBFECC == false){
        vec2 vel = texture2D(velocity, uv).xy;
        vec2 uv2 = uv - vel * dt * ratio;
        vec2 newVel = texture2D(velocity, uv2).xy;
        gl_FragColor = vec4(newVel, 0.0, 0.0);
    } else {
        vec2 spot_new = uv;
        vec2 vel_old = texture2D(velocity, uv).xy;
        vec2 spot_old = spot_new - vel_old * dt * ratio;
        vec2 vel_new1 = texture2D(velocity, spot_old).xy;
        vec2 spot_new2 = spot_old + vel_new1 * dt * ratio;
        vec2 error = spot_new2 - spot_new;
        vec2 spot_new3 = spot_new - error / 2.0;
        vec2 vel_2 = texture2D(velocity, spot_new3).xy;
        vec2 spot_old2 = spot_new3 - vel_2 * dt * ratio;
        vec2 newVel2 = texture2D(velocity, spot_old2).xy; 
        gl_FragColor = vec4(newVel2, 0.0, 0.0);
    }
}
`;
      const color_frag = `
    precision highp float;
    uniform sampler2D velocity;
    uniform sampler2D palette;
    uniform vec4 bgColor;
    uniform bool lightMode;
    varying vec2 uv;
    void main(){
    vec2 vel = texture2D(velocity, uv).xy;
    float lenv = clamp(length(vel), 0.0, 1.0);
    vec3 c = texture2D(palette, vec2(lenv, 0.5)).rgb;
    float peak = max(c.r, max(c.g, c.b));
    vec3 chroma = clamp(c / max(peak, 0.0001), 0.0, 1.0);
    chroma = pow(chroma, vec3(1.25));
    vec3 ink = lightMode ? chroma : c;
    vec3 outRGB = mix(bgColor.rgb, ink, lenv);
    float outA = mix(bgColor.a, 1.0, lenv);
    gl_FragColor = vec4(outRGB, outA);
}
`;
      const divergence_frag = `
    precision highp float;
    uniform sampler2D velocity;
    uniform float dt;
    uniform vec2 px;
    varying vec2 uv;
    void main(){
    float x0 = texture2D(velocity, uv-vec2(px.x, 0.0)).x;
    float x1 = texture2D(velocity, uv+vec2(px.x, 0.0)).x;
    float y0 = texture2D(velocity, uv-vec2(0.0, px.y)).y;
    float y1 = texture2D(velocity, uv+vec2(0.0, px.y)).y;
    float divergence = (x1 - x0 + y1 - y0) / 2.0;
    gl_FragColor = vec4(divergence / dt);
}
`;
      const externalForce_frag = `
    precision highp float;
    uniform vec2 force;
    uniform vec2 center;
    uniform vec2 scale;
    uniform vec2 px;
    varying vec2 vUv;
    void main(){
    vec2 circle = (vUv - 0.5) * 2.0;
    float d = 1.0 - min(length(circle), 1.0);
    d *= d;
    gl_FragColor = vec4(force * d, 0.0, 1.0);
}
`;
      const poisson_frag = `
    precision highp float;
    uniform sampler2D pressure;
    uniform sampler2D divergence;
    uniform vec2 px;
    varying vec2 uv;
    void main(){
    float p0 = texture2D(pressure, uv + vec2(px.x * 2.0, 0.0)).r;
    float p1 = texture2D(pressure, uv - vec2(px.x * 2.0, 0.0)).r;
    float p2 = texture2D(pressure, uv + vec2(0.0, px.y * 2.0)).r;
    float p3 = texture2D(pressure, uv - vec2(0.0, px.y * 2.0)).r;
    float div = texture2D(divergence, uv).r;
    float newP = (p0 + p1 + p2 + p3) / 4.0 - div;
    gl_FragColor = vec4(newP);
}
`;
      const pressure_frag = `
    precision highp float;
    uniform sampler2D pressure;
    uniform sampler2D velocity;
    uniform vec2 px;
    uniform float dt;
    varying vec2 uv;
    void main(){
    float step = 1.0;
    float p0 = texture2D(pressure, uv + vec2(px.x * step, 0.0)).r;
    float p1 = texture2D(pressure, uv - vec2(px.x * step, 0.0)).r;
    float p2 = texture2D(pressure, uv + vec2(0.0, px.y * step)).r;
    float p3 = texture2D(pressure, uv - vec2(0.0, px.y * step)).r;
    vec2 v = texture2D(velocity, uv).xy;
    vec2 gradP = vec2(p0 - p1, p2 - p3) * 0.5;
    v = v - gradP * dt;
    gl_FragColor = vec4(v, 0.0, 1.0);
}
`;

      const canvas = document.createElement('canvas');
      const renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
      renderer.autoClear = false;
      renderer.setClearColor(new T.Color(0x000000), 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      container.appendChild(canvas);

      function makePaletteTexture(arr) {
        const w = arr.length;
        const data = new Uint8Array(w * 4);
        for (let i = 0; i < w; i++) {
          const c = new T.Color(arr[i]);
          data[i * 4] = Math.round(c.r * 255);
          data[i * 4 + 1] = Math.round(c.g * 255);
          data[i * 4 + 2] = Math.round(c.b * 255);
          data[i * 4 + 3] = 255;
        }
        const tex = new T.DataTexture(data, w, 1, T.RGBAFormat);
        tex.magFilter = T.LinearFilter;
        tex.minFilter = T.LinearFilter;
        tex.wrapS = T.ClampToEdgeWrapping;
        tex.wrapT = T.ClampToEdgeWrapping;
        tex.generateMipmaps = false;
        tex.needsUpdate = true;
        return tex;
      }
      const paletteTex = makePaletteTexture(stops.length ? stops : ['#ffffff', '#ffffff']);

      let W = 1, H = 1;
      function measure() {
        const rect = container.getBoundingClientRect();
        W = Math.max(1, Math.floor(rect.width));
        H = Math.max(1, Math.floor(rect.height));
      }
      measure();
      renderer.setSize(W, H, false);
      const fboSize = new T.Vector2(Math.max(1, Math.round(resolution * W)), Math.max(1, Math.round(resolution * H)));
      const cellScale = new T.Vector2(1 / fboSize.x, 1 / fboSize.y);
      const boundarySpace = new T.Vector2();
      const isIOS = /(iPad|iPhone|iPod)/i.test(navigator.userAgent);
      const fboOpts = {
        type: isIOS ? T.HalfFloatType : T.FloatType,
        depthBuffer: false, stencilBuffer: false,
        minFilter: T.LinearFilter, magFilter: T.LinearFilter,
        wrapS: T.ClampToEdgeWrapping, wrapT: T.ClampToEdgeWrapping
      };
      const fbos = {};
      ['vel_0', 'vel_1', 'div', 'pressure_0', 'pressure_1'].forEach(function (k) {
        fbos[k] = new T.WebGLRenderTarget(fboSize.x, fboSize.y, fboOpts);
      });

      const orthoCam = new T.Camera();
      const planeGeo = new T.PlaneGeometry(2, 2);
      function makePass(frag, uniforms) {
        const mat = new T.RawShaderMaterial({ vertexShader: face_vert, fragmentShader: frag, uniforms: uniforms });
        const scene = new T.Scene();
        scene.add(new T.Mesh(planeGeo, mat));
        return { scene: scene, mat: mat };
      }
      function renderPass(scene, target) {
        renderer.setRenderTarget(target || null);
        renderer.render(scene, orthoCam);
        renderer.setRenderTarget(null);
      }

      const advU = {
        boundarySpace: { value: cellScale }, px: { value: cellScale }, fboSize: { value: fboSize },
        velocity: { value: fbos.vel_0.texture }, dt: { value: dtV }, isBFECC: { value: true }
      };
      const adv = makePass(advection_frag, advU);
      const boundaryG = new T.BufferGeometry();
      boundaryG.setAttribute('position', new T.BufferAttribute(new Float32Array([
        -1, -1, 0, -1, 1, 0, -1, 1, 0, 1, 1, 0, 1, 1, 0, 1, -1, 0, 1, -1, 0, -1, -1, 0
      ]), 3));
      const lineMat = new T.RawShaderMaterial({ vertexShader: line_vert, fragmentShader: advection_frag, uniforms: advU });
      const line = new T.LineSegments(boundaryG, lineMat);
      line.visible = isBounce;
      adv.scene.add(line);

      const efU = {
        px: { value: cellScale }, force: { value: new T.Vector2(0, 0) },
        center: { value: new T.Vector2(0, 0) }, scale: { value: new T.Vector2(cursorSize, cursorSize) }
      };
      const efScene = new T.Scene();
      const efMat = new T.RawShaderMaterial({
        vertexShader: mouse_vert, fragmentShader: externalForce_frag,
        blending: T.AdditiveBlending, depthWrite: false, uniforms: efU
      });
      efScene.add(new T.Mesh(new T.PlaneGeometry(1, 1), efMat));

      const divU = { boundarySpace: { value: cellScale }, velocity: { value: fbos.vel_1.texture }, px: { value: cellScale }, dt: { value: dtV } };
      const divPass = makePass(divergence_frag, divU);
      const poiU = { boundarySpace: { value: cellScale }, pressure: { value: fbos.pressure_0.texture }, divergence: { value: fbos.div.texture }, px: { value: cellScale } };
      const poiPass = makePass(poisson_frag, poiU);
      const preU = { boundarySpace: { value: cellScale }, pressure: { value: fbos.pressure_0.texture }, velocity: { value: fbos.vel_1.texture }, px: { value: cellScale }, dt: { value: dtV } };
      const prePass = makePass(pressure_frag, preU);

      const outU = {
        velocity: { value: fbos.vel_0.texture }, boundarySpace: { value: new T.Vector2() },
        palette: { value: paletteTex },
        bgColor: { value: new T.Vector4(0, 0, 0, 0) }, lightMode: { value: false }
      };
      const outScene = new T.Scene();
      outScene.add(new T.Mesh(planeGeo, new T.RawShaderMaterial({
        vertexShader: face_vert, fragmentShader: color_frag, transparent: true, depthWrite: false, uniforms: outU
      })));

      function applyTheme() {
        const light = document.documentElement.getAttribute('data-theme') === 'light';
        const bg = new T.Color(light ? '#f6f3fc' : '#000000');
        outU.lightMode.value = light;
        outU.bgColor.value = light ? new T.Vector4(bg.r, bg.g, bg.b, 1) : new T.Vector4(0, 0, 0, 0);
      }
      applyTheme();
      const mo = new MutationObserver(applyTheme);
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

      const coords = new T.Vector2();
      const coordsOld = new T.Vector2();
      const diff = new T.Vector2();
      let mouseMovedTimer = null;
      let hasUserControl = false;
      let isAutoActive = false;
      let isHoverInside = false;
      let lastUserInteraction = performance.now();
      let takeoverActive = false, takeoverStart = 0;
      const takeoverFrom = new T.Vector2(), takeoverTo = new T.Vector2();
      const takeoverDuration = 0.25;

      function onMouseMove(e) {
        const rect = container.getBoundingClientRect();
        if (!(e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom)) {
          isHoverInside = false;
          return;
        }
        isHoverInside = true;
        lastUserInteraction = performance.now();
        if (auto) { auto.active = false; isAutoActive = false; }
        const nx = (e.clientX - rect.left) / rect.width;
        const ny = (e.clientY - rect.top) / rect.height;
        if (isAutoActive && !hasUserControl && !takeoverActive) {
          takeoverFrom.copy(coords);
          takeoverTo.set(nx * 2 - 1, -(ny * 2 - 1));
          takeoverStart = performance.now();
          takeoverActive = true;
          hasUserControl = true;
          isAutoActive = false;
          return;
        }
        if (mouseMovedTimer) window.clearTimeout(mouseMovedTimer);
        coords.set(nx * 2 - 1, -(ny * 2 - 1));
        mouseMovedTimer = window.setTimeout(function () {}, 100);
        hasUserControl = true;
      }

      const auto = {
        current: new T.Vector2(0, 0), target: new T.Vector2(0.4, 0.3), active: false,
        lastTime: performance.now(), activationTime: 0, margin: 0.2,
        pick: function () { this.target.set((Math.random() * 2 - 1) * (1 - this.margin), (Math.random() * 2 - 1) * (1 - this.margin)); }
      };
      auto.pick();
      function updateAuto() {
        if (!autoDemo) return;
        const now = performance.now();
        if (now - lastUserInteraction < 1000 || isHoverInside) { auto.active = false; isAutoActive = false; return; }
        if (!auto.active) {
          auto.active = true;
          auto.current.copy(coords);
          auto.lastTime = now;
          auto.activationTime = now;
        }
        isAutoActive = true;
        let dtSec = (now - auto.lastTime) / 1000;
        auto.lastTime = now;
        if (dtSec > 0.2) dtSec = 0.016;
        const dir = auto.target.clone().sub(auto.current);
        const dist = dir.length();
        if (dist < 0.01) { auto.pick(); return; }
        dir.normalize();
        const t = Math.min(1, (now - auto.activationTime) / 600);
        const ramp = t * t * (3 - 2 * t);
        const move = Math.min(autoSpeed * dtSec * ramp, dist);
        auto.current.addScaledVector(dir, move);
        coords.copy(auto.current);
      }
      function updateMouse() {
        if (takeoverActive) {
          const t = (performance.now() - takeoverStart) / (takeoverDuration * 1000);
          if (t >= 1) {
            takeoverActive = false;
            coords.copy(takeoverTo);
            coordsOld.copy(coords);
            diff.set(0, 0);
          } else {
            const k = t * t * (3 - 2 * t);
            coords.copy(takeoverFrom).lerp(takeoverTo, k);
          }
        }
        diff.subVectors(coords, coordsOld);
        coordsOld.copy(coords);
        if (coordsOld.x === 0 && coordsOld.y === 0) diff.set(0, 0);
        if (isAutoActive && !takeoverActive) diff.multiplyScalar(autoIntensity);
      }

      function simStep() {
        if (isBounce) boundarySpace.set(0, 0);
        else boundarySpace.copy(cellScale);
        advU.dt.value = dtV;
        line.visible = isBounce;
        advU.isBFECC.value = BFECC;
        advU.velocity.value = fbos.vel_0.texture;
        renderPass(adv.scene, fbos.vel_1);
        const forceX = (diff.x / 2) * mouseForce;
        const forceY = (diff.y / 2) * mouseForce;
        const csx = cursorSize * cellScale.x;
        const csy = cursorSize * cellScale.y;
        efU.force.value.set(forceX, forceY);
        efU.center.value.set(
          Math.min(Math.max(coords.x, -1 + csx + cellScale.x * 2), 1 - csx - cellScale.x * 2),
          Math.min(Math.max(coords.y, -1 + csy + cellScale.y * 2), 1 - csy - cellScale.y * 2)
        );
        efU.scale.value.set(cursorSize, cursorSize);
        renderPass(efScene, fbos.vel_1);
        const vel = fbos.vel_1;
        divU.velocity.value = vel.texture;
        renderPass(divPass.scene, fbos.div);
        let pIn = fbos.pressure_0, pOut = fbos.pressure_1;
        for (let i = 0; i < iterationsPoisson; i++) {
          poiU.pressure.value = pIn.texture;
          renderPass(poiPass.scene, pOut);
          const tmp = pIn; pIn = pOut; pOut = tmp;
        }
        preU.pressure.value = pIn.texture;
        preU.velocity.value = vel.texture;
        renderPass(prePass.scene, fbos.vel_0);
        outU.velocity.value = fbos.vel_0.texture;
        renderPass(outScene, null);
      }

      let raf = 0, inView = false, tNow = 0;
      const io = new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        if (inView && !document.hidden && !raf && !reduceMQ.matches) {
          window.addEventListener('mousemove', onMouseMove, { passive: true });
          raf = requestAnimationFrame(loop);
        }
      }, { rootMargin: '120px' });
      io.observe(container);
      function loop(t) {
        if (document.hidden || !inView) { raf = 0; window.removeEventListener('mousemove', onMouseMove); return; }
        raf = requestAnimationFrame(loop);
        tNow = t * 0.001;
        updateAuto();
        updateMouse();
        simStep();
      }
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) {
          if (raf) { cancelAnimationFrame(raf); raf = 0; }
        } else if (inView && !raf && !reduceMQ.matches) {
          window.addEventListener('mousemove', onMouseMove, { passive: true });
          raf = requestAnimationFrame(loop);
        }
      });
      const ro = new ResizeObserver(function () {
        measure();
        renderer.setSize(W, H, false);
        fboSize.set(Math.max(1, Math.round(resolution * W)), Math.max(1, Math.round(resolution * H)));
        cellScale.set(1 / fboSize.x, 1 / fboSize.y);
        for (const k in fbos) fbos[k].setSize(fboSize.x, fboSize.y);
      });
      ro.observe(container);
      container.__liquidether = function () { return { running: !!raf, t: tNow }; };
    });
  })();

  /* ---- MoltenMetal 熔金 · [data-moltenmetal] — 官方 GLSL300 es 逐行, WebGL2 直用 ---- */
  (function () {
    const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
    document.querySelectorAll('[data-moltenmetal]').forEach(function (container) {
      const num = function (name, d) { const v = parseFloat(container.getAttribute(name)); return isNaN(v) ? d : v; };
      const canvas = document.createElement('canvas');
      container.appendChild(canvas);
      const VERT = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;
      const FRAG = `#version 300 es
precision highp float;
uniform vec2 iResolution;
uniform float iTime;
uniform float uSpeed;
uniform float uScale;
uniform float uDetail;
uniform float uGlow;
uniform float uCoreSize;
uniform float uSwirl;
uniform float uFold;
uniform float uBlackPoint;
uniform float uBrightness;
uniform float uColorMode;
uniform float uGrain;
uniform float uGrainIntensity;
uniform float uOpacity;
uniform vec2 uMouse;
uniform float uMouseStrength;
uniform bool uEnableMouse;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform vec3 uBackgroundColor;
uniform bool uLightMode;
out vec4 fragColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  float time = iTime * uSpeed;
  vec2 p = uScale * ((gl_FragCoord.xy - 0.5 * iResolution.xy) / iResolution.y) - 0.5;

  vec2 drift = vec2(0.0);
  if (uEnableMouse) {
    drift = (uMouse - 0.5) * uMouseStrength * 2.0;
  }
  p += drift;

  vec2 i = p;
  float c = 0.0;
  float r = length(p + vec2(sin(time), sin(time * 0.3 + 5.0)) * 0.5);
  float d = length(p);
  float rot = d + time + p.x * uSwirl;

  float cosRot = cos(rot);
  mat2 warp = mat2(cos(rot - sin(time / 5.0)), sin(rot), -sin(cosRot - time), cosRot) * uFold;
  float glowCore = uGlow * uCoreSize;

  for (float n = 0.0; n < 8.0; n++) {
    if (n >= uDetail) break;
    p *= warp;
    float t = r - time / (n + 3.0);
    i -= p + vec2(cos(t - i.x - r) + sin(t + i.y), sin(t - i.y) + cos(t + i.x) + r);
    c += glowCore / length(vec2(sin(i.x + t), cos(i.y + t)));
  }

  c /= 6.0;

  float intensity = max(c - uBlackPoint, 0.0) * uBrightness;

  float g = clamp(intensity, 0.0, 1.0);

  float mid = 0.5;
  if (uColorMode > 1.5) {
    mid = 0.65;
  } else if (uColorMode > 0.5) {
    mid = 0.35;
  }

  vec3 col = mix(uColor1, uColor2, smoothstep(0.0, mid, g));
  col = mix(col, uColor3, smoothstep(mid, 1.0, g));

  float a = g;
  if (uGrain > 0.5) {
    float gr = hash(gl_FragCoord.xy + iTime);
    a += (gr - 0.5) * uGrainIntensity;
  }
  a = clamp(a, 0.0, 1.0) * uOpacity;
  if (uLightMode) {
    float signal = 1.0 - exp(-max(c, 0.0) * 6.5);
    float body = smoothstep(0.075, 0.68, signal);
    float ridge = smoothstep(0.42, 0.92, signal);

    vec3 lightCol = mix(uColor1, uColor2, smoothstep(0.08, 0.52, signal));
    lightCol = mix(lightCol, uColor3, smoothstep(0.52, 0.96, signal));
    lightCol = mix(lightCol, lightCol * 0.72, ridge * 0.24);

    float coverage = body * mix(0.2, 0.86, signal) * uOpacity;
    if (uGrain > 0.5) {
      float gr = hash(gl_FragCoord.xy + iTime);
      coverage += (gr - 0.5) * uGrainIntensity * body * 0.16;
    }
    fragColor = vec4(mix(uBackgroundColor, lightCol, clamp(coverage, 0.0, 0.92)), 1.0);
  } else {
    fragColor = vec4(col * a, a);
  }
}
`;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const ctx = __fsGL2(canvas, VERT, FRAG, { alpha: true, premul: true, clear: [0, 0, 0, 0] });
      if (!ctx) return;
      const gl = ctx.gl, u = ctx.u;
      const mode = container.getAttribute('data-color-mode') || 'molten';
      gl.uniform1f(u.uSpeed, num('data-speed', 0.35));
      gl.uniform1f(u.uScale, num('data-scale', 4));
      gl.uniform1f(u.uDetail, num('data-detail', 3));
      gl.uniform1f(u.uGlow, num('data-glow', 1.6));
      gl.uniform1f(u.uCoreSize, Math.max(num('data-core-size', 0.1), 0.001));
      gl.uniform1f(u.uSwirl, num('data-swirl', 1));
      gl.uniform1f(u.uFold, num('data-fold', -0.2));
      gl.uniform1f(u.uBlackPoint, num('data-black-point', 0.05));
      gl.uniform1f(u.uBrightness, num('data-brightness', 1.3));
      gl.uniform1f(u.uColorMode, mode === 'ember' ? 1 : mode === 'frost' ? 2 : 0);
      gl.uniform1f(u.uGrain, container.getAttribute('data-grain') === 'false' ? 0 : 1);
      gl.uniform1f(u.uGrainIntensity, num('data-grain-intensity', 0.05));
      gl.uniform1f(u.uOpacity, num('data-opacity', 1));
      gl.uniform1f(u.uMouseStrength, num('data-mouse-strength', 0.3));
      gl.uniform1i(u.uEnableMouse, 1);
      gl.uniform2f(u.uMouse, 0.5, 0.5);
      gl.uniform3fv(u.uColor1, __hex3(container.getAttribute('data-color1') || '#5227FF'));
      gl.uniform3fv(u.uColor2, __hex3(container.getAttribute('data-color2') || '#FF9FFC'));
      gl.uniform3fv(u.uColor3, __hex3(container.getAttribute('data-color3') || '#FFFFFF'));
      function applyTheme() {
        const light = document.documentElement.getAttribute('data-theme') === 'light';
        gl.uniform1i(u.uLightMode, light ? 1 : 0);
        gl.uniform3fv(u.uBackgroundColor, __hex3(container.getAttribute('data-bg-light') || '#f6f3fc'));
      }
      applyTheme();
      const mo = new MutationObserver(function () { applyTheme(); if (!raf) once(); });
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

      const setSize = function () {
        ctx.resize(container.clientWidth, container.clientHeight, dpr);
        gl.uniform2f(u.iResolution, canvas.width, canvas.height);
      };
      const ro = new ResizeObserver(setSize);
      ro.observe(container);
      setSize();

      const target = [0.5, 0.5], current = [0.5, 0.5];
      const onMove = function (e) {
        const rect = canvas.getBoundingClientRect();
        target[0] = (e.clientX - rect.left) / rect.width;
        target[1] = 1.0 - (e.clientY - rect.top) / rect.height;
      };
      const onLeave = function () { target[0] = 0.5; target[1] = 0.5; };

      let raf = 0, inView = false, t0 = 0, tNow = 0;
      function once() { ctx.render(); }
      const loop = function (t) {
        if (document.hidden || !inView) { raf = 0; canvas.removeEventListener('mousemove', onMove); canvas.removeEventListener('mouseleave', onLeave); return; }
        raf = requestAnimationFrame(loop);
        if (!t0) t0 = t;
        tNow = (t - t0) * 0.001;
        gl.uniform1f(u.iTime, tNow);
        current[0] += 0.05 * (target[0] - current[0]);
        current[1] += 0.05 * (target[1] - current[1]);
        gl.uniform2f(u.uMouse, current[0], current[1]);
        ctx.render();
      };
      const io = new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        if (inView && !document.hidden && !raf) {
          if (reduceMQ.matches) { once(); return; }
          canvas.addEventListener('mousemove', onMove, { passive: true });
          canvas.addEventListener('mouseleave', onLeave);
          raf = requestAnimationFrame(loop);
        }
      }, { rootMargin: '120px' });
      io.observe(container);
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden && inView && !raf && !reduceMQ.matches) {
          canvas.addEventListener('mousemove', onMove, { passive: true });
          canvas.addEventListener('mouseleave', onLeave);
          raf = requestAnimationFrame(loop);
        }
      });
      container.__moltenmetal = function () { return { running: !!raf, t: tNow }; };
    });
  })();

  /* ---- PrismaticBurst 棱镜迸射 · [data-prismaticburst] — 官方 GLSL300 es raymarch 44 步原样 ---- */
  (function () {
    const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
    document.querySelectorAll('[data-prismaticburst]').forEach(function (container) {
      const num = function (name, d) { const v = parseFloat(container.getAttribute(name)); return isNaN(v) ? d : v; };
      const canvas = document.createElement('canvas');
      canvas.style.position = 'absolute';
      canvas.style.inset = '0';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      container.appendChild(canvas);
      const VERT = `#version 300 es
in vec2 position;
in vec2 uv;
out vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4(position, 0.0, 1.0);
}
`;
      const FRAG = `#version 300 es
precision highp float;
precision highp int;

out vec4 fragColor;

uniform vec2  uResolution;
uniform float uTime;

uniform float uIntensity;
uniform float uSpeed;
uniform int   uAnimType;
uniform vec2  uMouse;
uniform int   uColorCount;
uniform float uDistort;
uniform vec2  uOffset;
uniform sampler2D uGradient;
uniform float uNoiseAmount;
uniform int   uRayCount;
uniform float uLightMode;

float hash21(vec2 p){
    p = floor(p);
    float f = 52.9829189 * fract(dot(p, vec2(0.065, 0.005)));
    return fract(f);
}

mat2 rot30(){ return mat2(0.8, -0.5, 0.5, 0.8); }

float layeredNoise(vec2 fragPx){
    vec2 p = mod(fragPx + vec2(uTime * 30.0, -uTime * 21.0), 1024.0);
    vec2 q = rot30() * p;
    float n = 0.0;
    n += 0.40 * hash21(q);
    n += 0.25 * hash21(q * 2.0 + 17.0);
    n += 0.20 * hash21(q * 4.0 + 47.0);
    n += 0.10 * hash21(q * 8.0 + 113.0);
    n += 0.05 * hash21(q * 16.0 + 191.0);
    return n;
}

vec3 rayDir(vec2 frag, vec2 res, vec2 offset, float dist){
    float focal = res.y * max(dist, 1e-3);
    return normalize(vec3(2.0 * (frag - offset) - res, focal));
}

float edgeFade(vec2 frag, vec2 res, vec2 offset){
    vec2 toC = frag - 0.5 * res - offset;
    float r = length(toC) / (0.5 * min(res.x, res.y));
    float x = clamp(r, 0.0, 1.0);
    float q = x * x * x * (x * (x * 6.0 - 15.0) + 10.0);
    float s = q * 0.5;
    s = pow(s, 1.5);
    float tail = 1.0 - pow(1.0 - s, 2.0);
    s = mix(s, tail, 0.2);
    float dn = (layeredNoise(frag * 0.15) - 0.5) * 0.0015 * s;
    return clamp(s + dn, 0.0, 1.0);
}

mat3 rotX(float a){ float c = cos(a), s = sin(a); return mat3(1.0,0.0,0.0, 0.0,c,-s, 0.0,s,c); }
mat3 rotY(float a){ float c = cos(a), s = sin(a); return mat3(c,0.0,s, 0.0,1.0,0.0, -s,0.0,c); }
mat3 rotZ(float a){ float c = cos(a), s = sin(a); return mat3(c,-s,0.0, s,c,0.0, 0.0,0.0,1.0); }

vec3 sampleGradient(float t){
    t = clamp(t, 0.0, 1.0);
    return texture(uGradient, vec2(t, 0.5)).rgb;
}

vec2 rot2(vec2 v, float a){
    float s = sin(a), c = cos(a);
    return mat2(c, -s, s, c) * v;
}

float bendAngle(vec3 q, float t){
    float a = 0.8 * sin(q.x * 0.55 + t * 0.6)
            + 0.7 * sin(q.y * 0.50 - t * 0.5)
            + 0.6 * sin(q.z * 0.60 + t * 0.7);
    return a;
}

void main(){
    vec2 frag = gl_FragCoord.xy;
    float t = uTime * uSpeed;
    float jitterAmp = 0.1 * clamp(uNoiseAmount, 0.0, 1.0);
    vec3 dir = rayDir(frag, uResolution, uOffset, 1.0);
    float marchT = 0.0;
    vec3 col = vec3(0.0);
    float n = layeredNoise(frag);
    vec4 c = cos(t * 0.2 + vec4(0.0, 33.0, 11.0, 0.0));
    mat2 M2 = mat2(c.x, c.y, c.z, c.w);
    float amp = clamp(uDistort, 0.0, 50.0) * 0.15;

    mat3 rot3dMat = mat3(1.0);
    if(uAnimType == 1){
      vec3 ang = vec3(t * 0.31, t * 0.21, t * 0.17);
      rot3dMat = rotZ(ang.z) * rotY(ang.y) * rotX(ang.x);
    }
    mat3 hoverMat = mat3(1.0);
    if(uAnimType == 2){
      vec2 m = uMouse * 2.0 - 1.0;
      vec3 ang = vec3(m.y * 0.6, m.x * 0.6, 0.0);
      hoverMat = rotY(ang.y) * rotX(ang.x);
    }

    for (int i = 0; i < 44; ++i) {
        vec3 P = marchT * dir;
        P.z -= 2.0;
        float rad = length(P);
        vec3 Pl = P * (10.0 / max(rad, 1e-6));

        if(uAnimType == 0){
            Pl.xz *= M2;
        } else if(uAnimType == 1){
      Pl = rot3dMat * Pl;
        } else {
      Pl = hoverMat * Pl;
        }

        float stepLen = min(rad - 0.3, n * jitterAmp) + 0.1;

        float grow = smoothstep(0.35, 3.0, marchT);
        float a1 = amp * grow * bendAngle(Pl * 0.6, t);
        float a2 = 0.5 * amp * grow * bendAngle(Pl.zyx * 0.5 + 3.1, t * 0.9);
        vec3 Pb = Pl;
        Pb.xz = rot2(Pb.xz, a1);
        Pb.xy = rot2(Pb.xy, a2);

        float rayPattern = smoothstep(
            0.5, 0.7,
            sin(Pb.x + cos(Pb.y) * cos(Pb.z)) *
            sin(Pb.z + sin(Pb.y) * cos(Pb.x + t))
        );

        if (uRayCount > 0) {
            float ang = atan(Pb.y, Pb.x);
            float comb = 0.5 + 0.5 * cos(float(uRayCount) * ang);
            comb = pow(comb, 3.0);
            rayPattern *= smoothstep(0.15, 0.95, comb);
        }

        vec3 spectralDefault = 1.0 + vec3(
            cos(marchT * 3.0 + 0.0),
            cos(marchT * 3.0 + 1.0),
            cos(marchT * 3.0 + 2.0)
        );

        float saw = fract(marchT * 0.25);
        float tRay = saw * saw * (3.0 - 2.0 * saw);
        vec3 userGradient = 2.0 * sampleGradient(tRay);
        vec3 spectral = (uColorCount > 0) ? userGradient : spectralDefault;
        vec3 base = (0.05 / (0.4 + stepLen))
                  * smoothstep(5.0, 0.0, rad)
                  * spectral;

        col += base * rayPattern;
        marchT += stepLen;
    }

    col *= edgeFade(frag, uResolution, uOffset);
    col *= uIntensity;

    col = clamp(col, 0.0, 1.0);
    if (uLightMode > 0.5) {
        float energy = max(max(col.r, col.g), col.b);
        vec3 hue = col / max(energy, 0.0001);
        float neutral = min(hue.r, min(hue.g, hue.b));
        hue = max(hue - vec3(neutral * 0.68), vec3(0.0));
        hue /= max(max(hue.r, max(hue.g, hue.b)), 0.0001);
        vec3 pigment = mix(hue, hue * hue, 0.24) * 0.64;
        float coverage = smoothstep(0.001, 0.32, energy);
        coverage = pow(coverage, 0.72) * 0.92;
        col = mix(vec3(1.0), pigment, coverage);
    }
    fragColor = vec4(col, 1.0);
}`;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const ctx = __fsGL2(canvas, VERT, FRAG, { alpha: false, clear: [0, 0, 0, 1] });
      if (!ctx) return;
      const gl = ctx.gl, u = ctx.u;
      gl.uniform1f(u.uIntensity, num('data-intensity', 2));
      gl.uniform1f(u.uSpeed, num('data-speed', 0.5));
      const anim = container.getAttribute('data-anim-type') || 'rotate3d';
      gl.uniform1i(u.uAnimType, anim === 'rotate' ? 0 : anim === 'hover' ? 2 : 1);
      gl.uniform1f(u.uDistort, num('data-distort', 0));
      gl.uniform2f(u.uOffset, num('data-offset-x', 0), num('data-offset-y', 0));
      gl.uniform1i(u.uRayCount, Math.max(0, num('data-ray-count', 0) | 0));
      gl.uniform1f(u.uNoiseAmount, num('data-noise-amount', 0.8));
      gl.uniform2f(u.uMouse, 0.5, 0.5);

      const stops = (container.getAttribute('data-colors') || '#8B5CF6,#E879F9,#C4B5FD').split(',').map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 64);
      const gradTex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, gradTex);
      gl.uniform1i(u.uGradient, 0);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      if (stops.length) {
        const data = new Uint8Array(stops.length * 4);
        stops.forEach(function (hex, i) {
          const rgb = __hex3(hex);
          data[i * 4] = Math.round(rgb[0] * 255);
          data[i * 4 + 1] = Math.round(rgb[1] * 255);
          data[i * 4 + 2] = Math.round(rgb[2] * 255);
          data[i * 4 + 3] = 255;
        });
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, stops.length, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
      } else {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
      }
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.uniform1i(u.uColorCount, stops.length);

      function applyBlend() {
        const light = document.documentElement.getAttribute('data-theme') === 'light';
        canvas.style.mixBlendMode = light ? 'normal' : 'screen';
      }
      function applyTheme() {
        const light = document.documentElement.getAttribute('data-theme') === 'light';
        gl.uniform1f(u.uLightMode, light ? 1 : 0);
        applyBlend();
      }
      applyTheme();
      const mo = new MutationObserver(function () { applyTheme(); if (!raf) once(); });
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

      const setSize = function () {
        const wh = ctx.resize(container.clientWidth, container.clientHeight, dpr);
        gl.uniform2f(u.uResolution, wh[0], wh[1]);
      };
      const ro = new ResizeObserver(setSize);
      ro.observe(container);
      setSize();

      const target = [0.5, 0.5], sm = [0.5, 0.5];
      const onMove = function (e) {
        const rect = container.getBoundingClientRect();
        target[0] = Math.min(1, Math.max(0, (e.clientX - rect.left) / Math.max(rect.width, 1)));
        target[1] = Math.min(1, Math.max(0, (e.clientY - rect.top) / Math.max(rect.height, 1)));
      };
      let raf = 0, inView = false, t0 = 0, tNow = 0, last = 0;
      function once() { ctx.render(); }
      const loop = function (t) {
        if (document.hidden || !inView) { raf = 0; container.removeEventListener('pointermove', onMove); return; }
        raf = requestAnimationFrame(loop);
        if (!t0) { t0 = t; last = t; }
        const dt = Math.max(0, t - last) * 0.001;
        last = t;
        tNow += dt;
        const alpha = 1 - Math.exp(-dt / 0.02);
        sm[0] += (target[0] - sm[0]) * alpha;
        sm[1] += (target[1] - sm[1]) * alpha;
        gl.uniform2f(u.uMouse, sm[0], sm[1]);
        gl.uniform1f(u.uTime, tNow);
        ctx.render();
      };
      const io = new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        if (inView && !document.hidden && !raf) {
          if (reduceMQ.matches) { once(); return; }
          container.addEventListener('pointermove', onMove, { passive: true });
          raf = requestAnimationFrame(loop);
        }
      }, { rootMargin: '120px' });
      io.observe(container);
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden && inView && !raf && !reduceMQ.matches) {
          container.addEventListener('pointermove', onMove, { passive: true });
          raf = requestAnimationFrame(loop);
        }
      });
      container.__prismaticburst = function () { return { running: !!raf, t: tNow }; };
    });
  })();

  /* ---- LightTunnel 光缆隧道 · [data-lighttunnel] — 官方 GLSL300 es 光纤+脉冲原样 ---- */
  (function () {
    const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
    document.querySelectorAll('[data-lighttunnel]').forEach(function (container) {
      const num = function (name, d) { const v = parseFloat(container.getAttribute(name)); return isNaN(v) ? d : v; };
      const canvas = document.createElement('canvas');
      container.appendChild(canvas);
      const VERT = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;
      const FRAG = `#version 300 es
precision highp float;
uniform vec2 iResolution;
uniform float iTime;
uniform float uSpeed;
uniform float uFlowDir;
uniform float uPulseSpeed;
uniform float uPulseLength;
uniform float uPulseBlend;
uniform float uPulseWidth;
uniform float uCableCount;
uniform float uThickness;
uniform float uRimWidth;
uniform float uWaviness;
uniform float uSway;
uniform float uSize;
uniform vec2 uCenter;
uniform vec2 uMouseOffset;
uniform float uGlow;
uniform float uFadeNear;
uniform float uFadeFar;
uniform float uBrightness;
uniform float uColorVariance;
uniform float uOpacity;
uniform vec3 uCableColor;
uniform vec3 uPulseColor;
uniform vec3 uTunnelColor;
uniform float uTunnelOpacity;
uniform float uGrain;
uniform float uGrainIntensity;
uniform float uLightMode;
out vec4 fragColor;

void mainImage(out vec4 o, in vec2 fragCoord) {
  float size = uSize * 2.0;
  float flowDir = uFlowDir;
  float speedBase = uSpeed * 4.0 * flowDir;
  float waviness = uWaviness * 0.15;
  float rotationOsc = uSway * 0.5;
  float baseThick = uThickness * 0.35 + 0.05;
  float borderWeight = uRimWidth * 0.15 + 0.01;
  float cablesCount = floor(uCableCount);

  vec2 res = iResolution.xy;
  vec2 uv = (fragCoord - 0.5 * res) / min(res.y, res.x);
  uv -= (uCenter + uMouseOffset);
  uv /= (size + 0.0001);

  float r = length(uv);
  float angle = atan(uv.y, uv.x);
  float depth = -log(r + 0.0001);

  float swing = sin(iTime * (uSpeed * 0.5 + 0.1)) * rotationOsc;
  float waveOffset = sin(depth * 1.2 + iTime * speedBase * 0.25) * waviness;

  float angleNormalized = (angle / 6.2831853) + 0.5;
  float finalAngle = fract(angleNormalized + waveOffset + swing);

  float cableID = floor(finalAngle * cablesCount);
  float gvX = (fract(finalAngle * cablesCount) - 0.5);

  float rand = fract(sin(cableID * 12.9898) * 43758.5453);
  float randSpeed = (0.4 + rand * 0.6) * speedBase * uPulseSpeed;
  float cableThick = baseThick * (0.6 + rand * 0.4);

  vec3 cableCol = uCableColor;
  cableCol *= 1.0 + (rand - 0.5) * 0.4 * uColorVariance;
  cableCol = mix(cableCol, uPulseColor, rand * 0.25 * uColorVariance);

  float scroll = depth + (iTime * randSpeed);
  float pulseFact = fract(scroll);

  float distToCore = abs(gvX);
  float wireMask = smoothstep(cableThick, cableThick - 0.05, distToCore);
  float rimGlow = smoothstep(borderWeight, 0.0, abs(distToCore - cableThick));

  float pulseThick = cableThick * uPulseWidth;
  float pulseMask = smoothstep(pulseThick, pulseThick - 0.05 * uPulseWidth, distToCore);

  float pulseDist = abs(pulseFact - 0.5);
  float pulseTotal = uPulseLength;
  float pulseCore = pulseTotal * (1.0 - uPulseBlend);
  float pulseLo = min(pulseCore, pulseTotal - max(fwidth(scroll), 1e-4));
  float dataPulse = 1.0 - smoothstep(pulseLo, pulseTotal, pulseDist);

  float aBody = wireMask * uTunnelOpacity;
  float aRim = rimGlow;
  float aPulse = clamp(dataPulse * pulseMask, 0.0, 1.0);

  vec3 fiberCol = uTunnelColor * aBody
    + cableCol * aRim * 1.3 * uGlow
    + uPulseColor * dataPulse * 3.0 * pulseMask;

  float distFade = smoothstep(0.0, uFadeNear, r) * smoothstep(uFadeFar, uFadeFar - 0.9, r);
  float inten = clamp(aBody + aRim + aPulse, 0.0, 1.0) * distFade;

  vec3 finalCol = fiberCol * uBrightness;
  float alpha = clamp(inten, 0.0, 1.0) * uOpacity;
  vec3 outRgb = finalCol * alpha;

  if (uGrain > 0.5) {
    float gv = (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)) + iTime) * 43758.5453) - 0.5) * uGrainIntensity;
    outRgb = clamp(outRgb + gv, 0.0, 1.0);
    alpha = clamp(alpha + gv, 0.0, 1.0);
  }

  o = vec4(outRgb, alpha);
}

void main() {
  vec4 o = vec4(0.0);
  mainImage(o, gl_FragCoord.xy);
  if (uLightMode > 0.5) {
    float peak = max(o.r, max(o.g, o.b));
    vec3 chroma = pow(clamp(o.rgb / max(peak, 0.0001), 0.0, 1.0), vec3(1.16));
    fragColor = vec4(mix(vec3(1.0), chroma, o.a * 0.95), 1.0);
  } else {
    fragColor = o;
  }
}
`;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const ctx = __fsGL2(canvas, VERT, FRAG, { alpha: true, premul: true, clear: [0, 0, 0, 0] });
      if (!ctx) return;
      const gl = ctx.gl, u = ctx.u;
      gl.uniform1f(u.uSpeed, num('data-speed', 0.1));
      gl.uniform1f(u.uFlowDir, container.getAttribute('data-flow-direction') === 'inward' ? 1.0 : -1.0);
      gl.uniform1f(u.uPulseSpeed, num('data-pulse-speed', 2));
      gl.uniform1f(u.uPulseLength, num('data-pulse-length', 0.28));
      gl.uniform1f(u.uPulseBlend, num('data-pulse-blend', 1));
      gl.uniform1f(u.uPulseWidth, num('data-pulse-width', 1));
      gl.uniform1f(u.uCableCount, num('data-cable-count', 20));
      gl.uniform1f(u.uThickness, num('data-thickness', 0.35));
      gl.uniform1f(u.uRimWidth, num('data-rim-width', 0.15));
      gl.uniform1f(u.uWaviness, num('data-waviness', 0.3));
      gl.uniform1f(u.uSway, num('data-sway', 0.5));
      gl.uniform1f(u.uSize, num('data-size', 1));
      gl.uniform2f(u.uCenter, num('data-center-x', 0), num('data-center-y', 0));
      gl.uniform2f(u.uMouseOffset, 0, 0);
      gl.uniform1f(u.uGlow, num('data-glow', 1));
      gl.uniform1f(u.uFadeNear, num('data-fade-near', 0.5));
      gl.uniform1f(u.uFadeFar, num('data-fade-far', 2));
      gl.uniform1f(u.uBrightness, num('data-brightness', 1));
      gl.uniform1f(u.uColorVariance, container.getAttribute('data-color-variance') === 'false' ? 0 : 1);
      gl.uniform1f(u.uOpacity, num('data-opacity', 1));
      gl.uniform1f(u.uGrain, container.getAttribute('data-grain') === 'false' ? 0 : 1);
      gl.uniform1f(u.uGrainIntensity, num('data-grain-intensity', 0.05));
      gl.uniform3fv(u.uCableColor, __hex3(container.getAttribute('data-cable-color') || '#A855F7'));
      gl.uniform3fv(u.uPulseColor, __hex3(container.getAttribute('data-pulse-color') || '#E879F9'));
      gl.uniform3fv(u.uTunnelColor, __hex3(container.getAttribute('data-tunnel-color') || '#5227FF'));
      gl.uniform1f(u.uTunnelOpacity, num('data-tunnel-opacity', 0));
      function applyTheme() {
        gl.uniform1f(u.uLightMode, document.documentElement.getAttribute('data-theme') === 'light' ? 1 : 0);
      }
      applyTheme();
      const mo = new MutationObserver(function () { applyTheme(); if (!raf) once(); });
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

      const setSize = function () {
        ctx.resize(container.clientWidth, container.clientHeight, dpr);
        gl.uniform2f(u.iResolution, canvas.width, canvas.height);
      };
      const ro = new ResizeObserver(setSize);
      ro.observe(container);
      setSize();

      const strength = num('data-mouse-strength', 0.1);
      const target = [0.5, 0.5], current = [0.5, 0.5];
      const onMove = function (e) {
        const rect = canvas.getBoundingClientRect();
        target[0] = (e.clientX - rect.left) / rect.width;
        target[1] = 1.0 - (e.clientY - rect.top) / rect.height;
      };
      const onLeave = function () { target[0] = 0.5; target[1] = 0.5; };
      let raf = 0, inView = false, t0 = 0, tNow = 0;
      function once() { ctx.render(); }
      const loop = function (t) {
        if (document.hidden || !inView) { raf = 0; canvas.removeEventListener('mousemove', onMove); canvas.removeEventListener('mouseleave', onLeave); return; }
        raf = requestAnimationFrame(loop);
        if (!t0) t0 = t;
        tNow = (t - t0) * 0.001;
        gl.uniform1f(u.iTime, tNow);
        current[0] += 0.05 * (target[0] - current[0]);
        current[1] += 0.05 * (target[1] - current[1]);
        gl.uniform2f(u.uMouseOffset, (current[0] - 0.5) * strength, (current[1] - 0.5) * strength);
        ctx.render();
      };
      const io = new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        if (inView && !document.hidden && !raf) {
          if (reduceMQ.matches) { once(); return; }
          canvas.addEventListener('mousemove', onMove, { passive: true });
          canvas.addEventListener('mouseleave', onLeave);
          raf = requestAnimationFrame(loop);
        }
      }, { rootMargin: '120px' });
      io.observe(container);
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden && inView && !raf && !reduceMQ.matches) {
          canvas.addEventListener('mousemove', onMove, { passive: true });
          canvas.addEventListener('mouseleave', onLeave);
          raf = requestAnimationFrame(loop);
        }
      });
      container.__lighttunnel = function () { return { running: !!raf, t: tNow }; };
    });
  })();

  /* ---- Ferrofluid 磁性流体 · [data-ferrofluid] — ogl GLSL1 → three 原样 ---- */
  (function () {
    const T = window.THREE;
    if (!T) return;
    const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
    document.querySelectorAll('[data-ferrofluid]').forEach(function (container) {
      const num = function (name, d) { const v = parseFloat(container.getAttribute(name)); return isNaN(v) ? d : v; };
      const VERT = 'varying vec2 vUv;\nvoid main() {\n  vUv = uv;\n  gl_Position = vec4(position.xy, 0.0, 1.0);\n}\n';
      const FRAG = `precision highp float;

uniform vec3  iResolution;
uniform vec2  iMouse;
uniform float iTime;

uniform vec3  uColor0;
uniform vec3  uColor1;
uniform vec3  uColor2;
uniform vec3  uColor3;
uniform vec3  uColor4;
uniform vec3  uColor5;
uniform vec3  uColor6;
uniform vec3  uColor7;
uniform int   uColorCount;

uniform vec2  uFlow;
uniform float uSpeed;
uniform float uScale;
uniform float uTurbulence;
uniform float uFluidity;
uniform float uRimWidth;
uniform float uSharpness;
uniform float uShimmer;
uniform float uGlow;
uniform float uOpacity;
uniform float uMouseEnabled;
uniform float uMouseStrength;
uniform float uMouseRadius;

varying vec2 vUv;

#define PI 3.14159265

vec3 palette(float h) {
  int count = uColorCount;
  if (count < 1) count = 1;
  int idx = int(floor(clamp(h, 0.0, 0.999999) * float(count)));
  if (idx <= 0) return uColor0;
  if (idx == 1) return uColor1;
  if (idx == 2) return uColor2;
  if (idx == 3) return uColor3;
  if (idx == 4) return uColor4;
  if (idx == 5) return uColor5;
  if (idx == 6) return uColor6;
  return uColor7;
}

float hash(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float smin(float a, float b, float k) {
  float r = exp2(-a / k) + exp2(-b / k);
  return -k * log2(r);
}

float sinlerp(float a, float b, float w) {
  return mix(a, b, (sin(w * PI - PI / 2.0) + 1.0) / 2.0);
}

float vn(vec2 p, float s, float seed) {
  vec2 cellp = floor(p / s);
  vec2 relp = mod(p, s);
  float g1 = hash(vec3(cellp, seed));
  float g2 = hash(vec3(cellp.x + 1.0, cellp.y, seed));
  float g3 = hash(vec3(cellp.x + 1.0, cellp.y + 1.0, seed));
  float g4 = hash(vec3(cellp.x, cellp.y + 1.0, seed));
  float bx = sinlerp(g1, g2, relp.x / s);
  float tx = sinlerp(g4, g3, relp.x / s);
  return sinlerp(bx, tx, relp.y / s);
}

float dbn(vec2 p, float s, float seed) {
  float o = s / 2.0;
  float n0 = vn(p, s, seed);
  float n1 = vn(p + vec2(o, o), s, seed + 0.1);
  float n2 = vn(p + vec2(-o, o), s, seed + 0.2);
  float n3 = vn(p + vec2(o, -o), s, seed + 0.3);
  float n4 = vn(p + vec2(-o, -o), s, seed + 0.4);
  return (2.0 * n0 + 1.5 * n1 + 1.25 * n2 + 1.125 * n3 + n4) / 7.0;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  float ref = 700.0 / max(uScale, 0.05);
  vec2 p = fragCoord / iResolution.y * ref;

  float spd = 200.0 * uSpeed;
  float t = iTime;

  vec2 dir = uFlow;
  vec2 perp = vec2(-dir.y, dir.x);

  float distort1 = vn(p + perp * (t * spd), 60.0, 10.0) * 50.0 * uTurbulence;
  float distort2 = vn(p - perp * (t * spd), 120.0, 15.0) * 100.0 * uTurbulence;

  float peaks = dbn(p + distort1 + dir * (t * spd * 0.5), 40.0, 1.0);
  float peaks2 = dbn(p + distort2 - dir * (t * spd * 0.5), 40.0, 0.0);

  float mapeaks = smin(peaks, peaks2, max(uFluidity, 0.001));

  float mGlow = 0.0;
  if (uMouseEnabled > 0.5) {
    vec2 mp = iMouse / iResolution.y * ref;
    float md = length(p - mp) / ref;
    float rr = max(uMouseRadius, 0.02);
    mGlow = exp(-md * md / (rr * rr)) * uMouseStrength;
  }

  float band = (uRimWidth - abs((mapeaks - 0.4) * 2.0)) * 5.0;
  float ltn = clamp(band - vn(p + dir * (t * spd * 0.5), 60.0, 12.0) * uShimmer, 0.0, 1.0);
  ltn = pow(ltn, uSharpness) * uGlow;
  ltn *= clamp(1.0 - mGlow, 0.0, 1.0);

  float h = clamp(0.5 + (peaks - peaks2) * 0.8, 0.0, 1.0);
  vec3 col = palette(h);

  vec3 outc = col * ltn;
  float a = clamp(max(outc.r, max(outc.g, outc.b)), 0.0, 1.0);
  fragColor = vec4(outc, a * uOpacity);
}

void main() {
  vec4 color;
  mainImage(color, vUv * iResolution.xy);
  gl_FragColor = color;
}
`;
      const canvas = document.createElement('canvas');
      container.appendChild(canvas);
      const renderer = new T.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      const scene = new T.Scene();
      const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const stops = (container.getAttribute('data-colors') || '#E9D5FF,#C4B5FD,#8B5CF6').split(',').map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 8);
      const cols = [];
      for (let i = 0; i < 8; i++) {
        const rgb = __hex3(stops[Math.min(i, stops.length - 1)] || '#ffffff');
        cols.push(new T.Vector3(rgb[0], rgb[1], rgb[2]));
      }
      const flowMap = { up: [0, 1], down: [0, -1], left: [-1, 0], right: [1, 0] };
      const dirAttr = container.getAttribute('data-flow-direction') || 'down';
      const u = {
        iResolution: { value: new T.Vector3(1, 1, 1) },
        iMouse: { value: new T.Vector2(0, 0) },
        iTime: { value: 0 },
        uColor0: { value: cols[0] }, uColor1: { value: cols[1] }, uColor2: { value: cols[2] }, uColor3: { value: cols[3] },
        uColor4: { value: cols[4] }, uColor5: { value: cols[5] }, uColor6: { value: cols[6] }, uColor7: { value: cols[7] },
        uColorCount: { value: stops.length || 1 },
        uFlow: { value: new T.Vector2(flowMap[dirAttr] ? flowMap[dirAttr][0] : 0, flowMap[dirAttr] ? flowMap[dirAttr][1] : -1) },
        uSpeed: { value: num('data-speed', 0.5) },
        uScale: { value: num('data-scale', 1.6) },
        uTurbulence: { value: num('data-turbulence', 1) },
        uFluidity: { value: num('data-fluidity', 0.1) },
        uRimWidth: { value: num('data-rim-width', 0.2) },
        uSharpness: { value: num('data-sharpness', 2.5) },
        uShimmer: { value: num('data-shimmer', 1.5) },
        uGlow: { value: num('data-glow', 2) },
        uOpacity: { value: num('data-opacity', 1) },
        uMouseEnabled: { value: 1 },
        uMouseStrength: { value: num('data-mouse-strength', 1) },
        uMouseRadius: { value: num('data-mouse-radius', 0.35) }
      };
      const mesh = new T.Mesh(new T.PlaneGeometry(2, 2), new T.ShaderMaterial({
        vertexShader: VERT, fragmentShader: FRAG, uniforms: u, transparent: true, depthWrite: false
      }));
      mesh.frustumCulled = false;
      scene.add(mesh);
      const setSize = function () {
        const w = container.clientWidth || 1, h = container.clientHeight || 1;
        renderer.setSize(w, h, false);
        u.iResolution.value.set(renderer.domElement.width, renderer.domElement.height, 1);
      };
      const ro = new ResizeObserver(setSize);
      ro.observe(container);
      setSize();

      const dampening = num('data-mouse-dampening', 0.15);
      const target = [0, 0];
      const onMove = function (e) {
        const rect = canvas.getBoundingClientRect();
        const sc = renderer.getPixelRatio();
        target[0] = (e.clientX - rect.left) * sc;
        target[1] = (rect.height - (e.clientY - rect.top)) * sc;
      };
      let raf = 0, inView = false, tNow = 0, lastT = 0;
      const loop = function (t) {
        if (document.hidden || !inView) { raf = 0; canvas.removeEventListener('pointermove', onMove); return; }
        raf = requestAnimationFrame(loop);
        const dt = lastT ? Math.max(0, (t - lastT) / 1000) : 0.016;
        lastT = t;
        tNow = t * 0.001;
        u.iTime.value = tNow;
        if (dampening > 0) {
          let factor = 1 - Math.exp(-dt / Math.max(1e-4, dampening));
          if (factor > 1) factor = 1;
          u.iMouse.value.x += (target[0] - u.iMouse.value.x) * factor;
          u.iMouse.value.y += (target[1] - u.iMouse.value.y) * factor;
        } else {
          u.iMouse.value.set(target[0], target[1]);
        }
        renderer.render(scene, camera);
      };
      const io = new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        if (inView && !document.hidden && !raf && !reduceMQ.matches) {
          canvas.addEventListener('pointermove', onMove, { passive: true });
          raf = requestAnimationFrame(loop);
        }
      }, { rootMargin: '120px' });
      io.observe(container);
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden && inView && !raf && !reduceMQ.matches) {
          canvas.addEventListener('pointermove', onMove, { passive: true });
          raf = requestAnimationFrame(loop);
        }
      });
      container.__ferrofluid = function () { return { running: !!raf, t: tNow }; };
    });
  })();

  /* ---- ColorBends 折光层叠 · [data-colorbends] — 官方 three.js 迭代折叠场原样 ---- */
  (function () {
    const T = window.THREE;
    if (!T) return;
    const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
    document.querySelectorAll('[data-colorbends]').forEach(function (container) {
      const num = function (name, d) { const v = parseFloat(container.getAttribute(name)); return isNaN(v) ? d : v; };
      const MAX_COLORS = 8;
      const FRAG = `
#define MAX_COLORS 8
uniform vec2 uCanvas;
uniform float uTime;
uniform float uSpeed;
uniform vec2 uRot;
uniform int uColorCount;
uniform vec3 uColors[MAX_COLORS];
uniform int uTransparent;
uniform float uScale;
uniform float uFrequency;
uniform float uWarpStrength;
uniform vec2 uPointer;
uniform float uMouseInfluence;
uniform float uParallax;
uniform float uNoise;
uniform int uIterations;
uniform float uIntensity;
uniform float uBandWidth;
varying vec2 vUv;

void main() {
  float t = uTime * uSpeed;
  vec2 p = vUv * 2.0 - 1.0;
  p += uPointer * uParallax * 0.1;
  vec2 rp = vec2(p.x * uRot.x - p.y * uRot.y, p.x * uRot.y + p.y * uRot.x);
  vec2 q = vec2(rp.x * (uCanvas.x / uCanvas.y), rp.y);
  q /= max(uScale, 0.0001);
  q /= 0.5 + 0.2 * dot(q, q);
  q += 0.2 * cos(t) - 7.56;
  vec2 toward = (uPointer - rp);
  q += toward * uMouseInfluence * 0.2;

    for (int j = 0; j < 5; j++) {
      if (j >= uIterations - 1) break;
      vec2 rr = sin(1.5 * (q.yx * uFrequency) + 2.0 * cos(q * uFrequency));
      q += (rr - q) * 0.15;
    }

    vec3 col = vec3(0.0);
    float a = 1.0;

    if (uColorCount > 0) {
      vec2 s = q;
      vec3 sumCol = vec3(0.0);
      float cover = 0.0;
      for (int i = 0; i < MAX_COLORS; ++i) {
            if (i >= uColorCount) break;
            s -= 0.01;
            vec2 r = sin(1.5 * (s.yx * uFrequency) + 2.0 * cos(s * uFrequency));
            float m0 = length(r + sin(5.0 * r.y * uFrequency - 3.0 * t + float(i)) / 4.0);
            float kBelow = clamp(uWarpStrength, 0.0, 1.0);
            float kMix = pow(kBelow, 0.3);
            float gain = 1.0 + max(uWarpStrength - 1.0, 0.0);
            vec2 disp = (r - s) * kBelow;
            vec2 warped = s + disp * gain;
            float m1 = length(warped + sin(5.0 * warped.y * uFrequency - 3.0 * t + float(i)) / 4.0);
            float m = mix(m0, m1, kMix);
            float w = 1.0 - exp(-uBandWidth / exp(uBandWidth * m));
            sumCol += uColors[i] * w;
            cover = max(cover, w);
      }
      col = clamp(sumCol, 0.0, 1.0);
      a = uTransparent > 0 ? cover : 1.0;
    } else {
        vec2 s = q;
        for (int k = 0; k < 3; ++k) {
            s -= 0.01;
            vec2 r = sin(1.5 * (s.yx * uFrequency) + 2.0 * cos(s * uFrequency));
            float m0 = length(r + sin(5.0 * r.y * uFrequency - 3.0 * t + float(k)) / 4.0);
            float kBelow = clamp(uWarpStrength, 0.0, 1.0);
            float kMix = pow(kBelow, 0.3);
            float gain = 1.0 + max(uWarpStrength - 1.0, 0.0);
            vec2 disp = (r - s) * kBelow;
            vec2 warped = s + disp * gain;
            float m1 = length(warped + sin(5.0 * warped.y * uFrequency - 3.0 * t + float(k)) / 4.0);
            float m = mix(m0, m1, kMix);
            col[k] = 1.0 - exp(-uBandWidth / exp(uBandWidth * m));
        }
        a = uTransparent > 0 ? max(max(col.r, col.g), col.b) : 1.0;
    }

    col *= uIntensity;

    if (uNoise > 0.0001) {
      float n = fract(sin(dot(gl_FragCoord.xy + vec2(uTime), vec2(12.9898, 78.233))) * 43758.5453123);
      col += (n - 0.5) * uNoise;
      col = clamp(col, 0.0, 1.0);
    }

    vec3 rgb = (uTransparent > 0) ? col * a : col;
    gl_FragColor = vec4(rgb, a);
}
`;
      const VERT = 'varying vec2 vUv;\nvoid main() {\n  vUv = uv;\n  gl_Position = vec4(position.xy, 0.0, 1.0);\n}\n';
      const canvas = document.createElement('canvas');
      container.appendChild(canvas);
      const scene = new T.Scene();
      const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const stops = (container.getAttribute('data-colors') || '#8B5CF6,#E879F9,#C4B5FD,#06B6D4').split(',').map(function (s) { return s.trim(); }).filter(Boolean).slice(0, MAX_COLORS);
      const uColorsArray = Array.from({ length: MAX_COLORS }, function () { return new T.Vector3(0, 0, 0); });
      stops.forEach(function (hex, i) {
        const rgb = __hex3(hex);
        uColorsArray[i].set(rgb[0], rgb[1], rgb[2]);
      });
      const rotation = num('data-rotation', 90);
      const autoRotate = num('data-auto-rotate', 0);
      const material = new T.ShaderMaterial({
        vertexShader: VERT, fragmentShader: FRAG,
        uniforms: {
          uCanvas: { value: new T.Vector2(1, 1) },
          uTime: { value: 0 },
          uSpeed: { value: num('data-speed', 0.2) },
          uRot: { value: new T.Vector2(1, 0) },
          uColorCount: { value: stops.length },
          uColors: { value: uColorsArray },
          uTransparent: { value: container.getAttribute('data-transparent') === 'false' ? 0 : 1 },
          uScale: { value: num('data-scale', 1) },
          uFrequency: { value: num('data-frequency', 1) },
          uWarpStrength: { value: num('data-warp-strength', 1) },
          uPointer: { value: new T.Vector2(0, 0) },
          uMouseInfluence: { value: num('data-mouse-influence', 1) },
          uParallax: { value: num('data-parallax', 0.5) },
          uNoise: { value: num('data-noise', 0.15) },
          uIterations: { value: num('data-iterations', 1) | 0 },
          uIntensity: { value: num('data-intensity', 1.5) },
          uBandWidth: { value: num('data-band-width', 6) }
        },
        premultipliedAlpha: true, transparent: true
      });
      const mesh = new T.Mesh(new T.PlaneGeometry(2, 2), material);
      mesh.frustumCulled = false;
      scene.add(mesh);
      const renderer = new T.WebGLRenderer({ canvas: canvas, antialias: false, alpha: true });
      renderer.outputColorSpace = T.SRGBColorSpace;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x000000, material.uniforms.uTransparent.value ? 0 : 1);
      const handleResize = function () {
        const w = container.clientWidth || 1, h = container.clientHeight || 1;
        renderer.setSize(w, h, false);
        material.uniforms.uCanvas.value.set(w, h);
      };
      const ro = new ResizeObserver(handleResize);
      ro.observe(container);
      handleResize();
      const target = new T.Vector2(0, 0), cur = new T.Vector2(0, 0);
      const onMove = function (e) {
        const rect = container.getBoundingClientRect();
        target.set(((e.clientX - rect.left) / (rect.width || 1)) * 2 - 1, -(((e.clientY - rect.top) / (rect.height || 1)) * 2 - 1));
      };
      const clock = new T.Clock();
      let raf = 0, inView = false;
      const loop = function () {
        if (document.hidden || !inView) { raf = 0; container.removeEventListener('pointermove', onMove); return; }
        raf = requestAnimationFrame(loop);
        const dt = clock.getDelta();
        const elapsed = clock.elapsedTime;
        material.uniforms.uTime.value = elapsed;
        const deg = (rotation % 360) + autoRotate * elapsed;
        const rad = (deg * Math.PI) / 180;
        material.uniforms.uRot.value.set(Math.cos(rad), Math.sin(rad));
        cur.lerp(target, Math.min(1, dt * 8));
        material.uniforms.uPointer.value.copy(cur);
        renderer.render(scene, camera);
      };
      const io = new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        if (inView && !document.hidden && !raf && !reduceMQ.matches) {
          container.addEventListener('pointermove', onMove, { passive: true });
          raf = requestAnimationFrame(loop);
        }
      }, { rootMargin: '120px' });
      io.observe(container);
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden && inView && !raf && !reduceMQ.matches) {
          container.addEventListener('pointermove', onMove, { passive: true });
          raf = requestAnimationFrame(loop);
        }
      });
      container.__colorbends = function () { return { running: !!raf, t: material.uniforms.uTime.value }; };
    });
  })();

  /* ---- Threads 丝线场 · [data-threads] — ogl GLSL1 → three 原样(40 线 Perlin) ---- */
  (function () {
    const T = window.THREE;
    if (!T) return;
    const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
    document.querySelectorAll('[data-threads]').forEach(function (container) {
      const num = function (name, d) { const v = parseFloat(container.getAttribute(name)); return isNaN(v) ? d : v; };
      const VERT = 'void main() {\n  gl_Position = vec4(position.xy, 0.0, 1.0);\n}\n';
      const FRAG = `precision highp float;

uniform float iTime;
uniform vec3 iResolution;
uniform vec3 uColor;
uniform float uAmplitude;
uniform float uDistance;
uniform vec2 uMouse;

#define PI 3.1415926538

const int u_line_count = 40;
const float u_line_width = 7.0;
const float u_line_blur = 10.0;

float Perlin2D(vec2 P) {
    vec2 Pi = floor(P);
    vec4 Pf_Pfmin1 = P.xyxy - vec4(Pi, Pi + 1.0);
    vec4 Pt = vec4(Pi.xy, Pi.xy + 1.0);
    Pt = Pt - floor(Pt * (1.0 / 71.0)) * 71.0;
    Pt += vec2(26.0, 161.0).xyxy;
    Pt *= Pt;
    Pt = Pt.xzxz * Pt.yyww;
    vec4 hash_x = fract(Pt * (1.0 / 951.135664));
    vec4 hash_y = fract(Pt * (1.0 / 642.949883));
    vec4 grad_x = hash_x - 0.49999;
    vec4 grad_y = hash_y - 0.49999;
    vec4 grad_results = inversesqrt(grad_x * grad_x + grad_y * grad_y)
        * (grad_x * Pf_Pfmin1.xzxz + grad_y * Pf_Pfmin1.yyww);
    grad_results *= 1.4142135623730950;
    vec2 blend = Pf_Pfmin1.xy * Pf_Pfmin1.xy * Pf_Pfmin1.xy
               * (Pf_Pfmin1.xy * (Pf_Pfmin1.xy * 6.0 - 15.0) + 10.0);
    vec4 blend2 = vec4(blend, vec2(1.0 - blend));
    return dot(grad_results, blend2.zxzx * blend2.wwyy);
}

float pixel(float count, vec2 resolution) {
    return (1.0 / max(resolution.x, resolution.y)) * count;
}

float lineFn(vec2 st, float width, float perc, float offset, vec2 mouse, float time, float amplitude, float distance) {
    float split_offset = (perc * 0.4);
    float split_point = 0.1 + split_offset;

    float amplitude_normal = smoothstep(split_point, 0.7, st.x);
    float amplitude_strength = 0.5;
    float finalAmplitude = amplitude_normal * amplitude_strength
                           * amplitude * (1.0 + (mouse.y - 0.5) * 0.2);

    float time_scaled = time / 10.0 + (mouse.x - 0.5) * 1.0;
    float blur = smoothstep(split_point, split_point + 0.05, st.x) * perc;

    float xnoise = mix(
        Perlin2D(vec2(time_scaled, st.x + perc) * 2.5),
        Perlin2D(vec2(time_scaled, st.x + time_scaled) * 3.5) / 1.5,
        st.x * 0.3
    );

    float y = 0.5 + (perc - 0.5) * distance + xnoise / 2.0 * finalAmplitude;

    float line_start = smoothstep(
        y + (width / 2.0) + (u_line_blur * pixel(1.0, iResolution.xy) * blur),
        y,
        st.y
    );

    float line_end = smoothstep(
        y,
        y - (width / 2.0) - (u_line_blur * pixel(1.0, iResolution.xy) * blur),
        st.y
    );

    return clamp(
        (line_start - line_end) * (1.0 - smoothstep(0.0, 1.0, pow(perc, 0.3))),
        0.0, 1.0
    );
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;

    float line_strength = 1.0;
    for (int i = 0; i < u_line_count; i++) {
        float p = float(i) / float(u_line_count);
        line_strength *= (1.0 - lineFn(
            uv,
            u_line_width * pixel(1.0, iResolution.xy) * (1.0 - p),
            p,
            (PI * 1.0) * p,
            uMouse,
            iTime,
            uAmplitude,
            uDistance
        ));
    }

    float colorVal = 1.0 - line_strength;
    fragColor = vec4(uColor * colorVal, colorVal);
}

void main() {
    mainImage(gl_FragColor, gl_FragCoord.xy);
}
`;
      const canvas = document.createElement('canvas');
      container.appendChild(canvas);
      const renderer = new T.WebGLRenderer({ canvas: canvas, alpha: true, premultipliedAlpha: false });
      renderer.setClearColor(0x000000, 0);
      const scene = new T.Scene();
      const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const rgb = __hex3(container.getAttribute('data-color') || '#C4B5FD');
      const u = {
        iTime: { value: 0 },
        iResolution: { value: new T.Vector3(1, 1, 1) },
        uColor: { value: new T.Vector3(rgb[0], rgb[1], rgb[2]) },
        uAmplitude: { value: num('data-amplitude', 1) },
        uDistance: { value: num('data-distance', 0.3) },
        uMouse: { value: new T.Vector2(0.5, 0.5) }
      };
      const mesh = new T.Mesh(new T.PlaneGeometry(2, 2), new T.ShaderMaterial({
        vertexShader: VERT, fragmentShader: FRAG, uniforms: u, transparent: true, depthWrite: false
      }));
      mesh.frustumCulled = false;
      scene.add(mesh);
      const MAX_RENDER_DIM = 1920;
      const resize = function () {
        const cw = container.clientWidth || 1, ch = container.clientHeight || 1;
        const baseDpr = Math.min(window.devicePixelRatio || 1, 2);
        const longest = Math.max(cw, ch) * baseDpr;
        const dpr = longest > MAX_RENDER_DIM ? (baseDpr * MAX_RENDER_DIM) / longest : baseDpr;
        renderer.setPixelRatio(dpr);
        renderer.setSize(cw, ch, false);
        const cv = renderer.domElement;
        u.iResolution.value.set(cv.width, cv.height, cv.width / cv.height);
      };
      const ro = new ResizeObserver(resize);
      ro.observe(container);
      resize();
      const target = [0.5, 0.5], current = [0.5, 0.5];
      const onMove = function (e) {
        const rect = container.getBoundingClientRect();
        target[0] = (e.clientX - rect.left) / rect.width;
        target[1] = 1.0 - (e.clientY - rect.top) / rect.height;
      };
      const onLeave = function () { target[0] = 0.5; target[1] = 0.5; };
      let raf = 0, inView = false;
      const loop = function (t) {
        if (document.hidden || !inView) { raf = 0; container.removeEventListener('mousemove', onMove); container.removeEventListener('mouseleave', onLeave); return; }
        raf = requestAnimationFrame(loop);
        current[0] += 0.05 * (target[0] - current[0]);
        current[1] += 0.05 * (target[1] - current[1]);
        u.uMouse.value.set(current[0], current[1]);
        u.iTime.value = t * 0.001;
        renderer.render(scene, camera);
      };
      const io = new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        if (inView && !document.hidden && !raf && !reduceMQ.matches) {
          container.addEventListener('mousemove', onMove, { passive: true });
          container.addEventListener('mouseleave', onLeave);
          raf = requestAnimationFrame(loop);
        }
      }, { rootMargin: '120px' });
      io.observe(container);
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden && inView && !raf && !reduceMQ.matches) {
          container.addEventListener('mousemove', onMove, { passive: true });
          container.addEventListener('mouseleave', onLeave);
          raf = requestAnimationFrame(loop);
        }
      });
      container.__threads = function () { return { running: !!raf, t: u.iTime.value }; };
    });
  })();

  /* ---- GridDistortion 网格畸变 · [data-griddistortion] — 官方 three.js DataTexture 位移原样 ---- */
  (function () {
    const T = window.THREE;
    if (!T) return;
    const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
    document.querySelectorAll('[data-griddistortion]').forEach(function (container) {
      const num = function (name, d) { const v = parseFloat(container.getAttribute(name)); return isNaN(v) ? d : v; };
      const size = Math.max(2, num('data-grid', 15) | 0);
      const mouse = num('data-mouse', 0.1);
      const strength = num('data-strength', 0.15);
      const relaxation = num('data-relaxation', 0.9);
      const imageSrc = container.getAttribute('data-image') || 'assets/img/v94-work-lumen.webp';

      const VERT = `
uniform float time;
varying vec2 vUv;
varying vec3 vPosition;

void main() {
  vUv = uv;
  vPosition = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
      const FRAG = `
uniform sampler2D uDataTexture;
uniform sampler2D uTexture;
uniform vec4 resolution;
varying vec2 vUv;

void main() {
  vec2 uv = vUv;
  vec4 offset = texture2D(uDataTexture, vUv);
  gl_FragColor = texture2D(uTexture, uv - 0.02 * offset.rg);
}`;
      const canvas = document.createElement('canvas');
      container.appendChild(canvas);
      const scene = new T.Scene();
      const renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x000000, 0);
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      const camera = new T.OrthographicCamera(0, 0, 0, 0, -1000, 1000);
      camera.position.z = 2;
      const uniforms = {
        time: { value: 0 },
        resolution: { value: new T.Vector4() },
        uTexture: { value: null },
        uDataTexture: { value: null }
      };
      new T.TextureLoader().load(imageSrc, function (texture) {
        texture.minFilter = T.LinearFilter;
        texture.magFilter = T.LinearFilter;
        texture.wrapS = T.ClampToEdgeWrapping;
        texture.wrapT = T.ClampToEdgeWrapping;
        uniforms.uTexture.value = texture;
        handleResize();
      });
      const data = new Float32Array(4 * size * size);
      for (let i = 0; i < size * size; i++) {
        data[i * 4] = Math.random() * 255 - 125;
        data[i * 4 + 1] = Math.random() * 255 - 125;
      }
      const dataTexture = new T.DataTexture(data, size, size, T.RGBAFormat, T.FloatType);
      dataTexture.needsUpdate = true;
      uniforms.uDataTexture.value = dataTexture;
      const material = new T.ShaderMaterial({
        side: T.DoubleSide, uniforms: uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true
      });
      const geometry = new T.PlaneGeometry(1, 1, size - 1, size - 1);
      const plane = new T.Mesh(geometry, material);
      scene.add(plane);
      const handleResize = function () {
        const rect = container.getBoundingClientRect();
        const w = rect.width, h = rect.height;
        if (w === 0 || h === 0) return;
        const containerAspect = w / h;
        renderer.setSize(w, h);
        plane.scale.set(containerAspect, 1, 1);
        const frustumHeight = 1;
        const frustumWidth = frustumHeight * containerAspect;
        camera.left = -frustumWidth / 2;
        camera.right = frustumWidth / 2;
        camera.top = frustumHeight / 2;
        camera.bottom = -frustumHeight / 2;
        camera.updateProjectionMatrix();
        uniforms.resolution.value.set(w, h, 1, 1);
      };
      const ro = new ResizeObserver(handleResize);
      ro.observe(container);
      const mouseState = { x: 0, y: 0, prevX: 0, prevY: 0, vX: 0, vY: 0 };
      const onMouseMove = function (e) {
        const rect = container.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = 1 - (e.clientY - rect.top) / rect.height;
        mouseState.vX = x - mouseState.prevX;
        mouseState.vY = y - mouseState.prevY;
        Object.assign(mouseState, { x: x, y: y, prevX: x, prevY: y });
      };
      const onMouseLeave = function () {
        dataTexture.needsUpdate = true;
        Object.assign(mouseState, { x: 0, y: 0, prevX: 0, prevY: 0, vX: 0, vY: 0 });
      };
      handleResize();
      let raf = 0, inView = false;
      const loop = function () {
        if (document.hidden || !inView) { raf = 0; container.removeEventListener('mousemove', onMouseMove); container.removeEventListener('mouseleave', onMouseLeave); return; }
        raf = requestAnimationFrame(loop);
        uniforms.time.value += 0.05;
        const d = dataTexture.image.data;
        for (let i = 0; i < size * size; i++) {
          d[i * 4] *= relaxation;
          d[i * 4 + 1] *= relaxation;
        }
        const gridMouseX = size * mouseState.x;
        const gridMouseY = size * mouseState.y;
        const maxDist = size * mouse;
        for (let i = 0; i < size; i++) {
          for (let j = 0; j < size; j++) {
            const distSq = Math.pow(gridMouseX - i, 2) + Math.pow(gridMouseY - j, 2);
            if (distSq < maxDist * maxDist) {
              const index = 4 * (i + size * j);
              const power = Math.min(maxDist / Math.sqrt(distSq), 10);
              d[index] += strength * 100 * mouseState.vX * power;
              d[index + 1] -= strength * 100 * mouseState.vY * power;
            }
          }
        }
        dataTexture.needsUpdate = true;
        renderer.render(scene, camera);
      };
      const io = new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        if (inView && !document.hidden && !raf && !reduceMQ.matches) {
          container.addEventListener('mousemove', onMouseMove, { passive: true });
          container.addEventListener('mouseleave', onMouseLeave);
          raf = requestAnimationFrame(loop);
        }
      }, { rootMargin: '120px' });
      io.observe(container);
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden && inView && !raf && !reduceMQ.matches) {
          container.addEventListener('mousemove', onMouseMove, { passive: true });
          container.addEventListener('mouseleave', onMouseLeave);
          raf = requestAnimationFrame(loop);
        }
      });
      container.__griddistortion = function () { return { running: !!raf, t: uniforms.time.value }; };
    });
  })();

  /* ============ v107 · React Bits 第十五批 (Backgrounds) ============
     SlicedWaves / GradientWaves / WebThreads / Lightfall / FaultyTerminal / LetterGlitch / ShapeGrid / Ballpit
     Ballpit 环境: 官方 RoomEnvironment(three addon) → 品牌紫摄影棚 env 经 PMREM 等价; 余皆官方 GLSL 原样 */

  /* ---- SlicedWaves 切片波 · [data-slicedwaves] — ogl GLSL300es → __fsGL2 原样 ---- */
  (function () {
    const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
    const VS = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;
    const FS = `#version 300 es
precision highp float;
uniform vec2 iResolution;
uniform float iTime;
uniform float uColumns;
uniform float uRows;
uniform float uThickness;
uniform float uSpeed;
uniform float uTravel;
uniform float uWaveSpread;
uniform float uRowOffset;
uniform float uSoftness;
uniform float uGlow;
uniform float uBrightness;
uniform float uContrast;
uniform float uOpacity;
uniform float uVertical;
uniform float uAlternate;
uniform vec2 uMouse;
uniform float uMouseStrength;
uniform float uMouseRadius;
uniform float uEnableMouse;
uniform float uMouseActive;
uniform float uGrain;
uniform float uGrainIntensity;
uniform float uLightMode;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
out vec4 fragColor;

void main() {
  vec2 uv = gl_FragCoord.xy / iResolution.xy;
  vec2 grid = vec2(max(uColumns, 1.0), max(uRows, 1.0));
  vec2 p = uv * grid;
  vec2 gv = fract(p) - 0.5;
  vec2 id = floor(p);

  float barCoord, waveId, offId, along;
  if (uVertical > 0.5) {
    barCoord = gv.x; waveId = id.y; offId = id.x; along = uv.y;
  } else {
    barCoord = gv.y; waveId = id.x; offId = id.y; along = uv.x;
  }

  float dir = 1.0;
  if (uAlternate > 0.5 && mod(offId, 2.0) >= 1.0) dir = -1.0;

  float phase = iTime * uSpeed + waveId * uWaveSpread + cos(offId * uRowOffset);
  float mv = sin(phase) * 0.5 + 0.5;
  if (dir < 0.0) mv = 1.0 - mv;

  float infl = 0.0;
  if (uEnableMouse > 0.5) {
    float md = distance(uv, uMouse);
    infl = smoothstep(uMouseRadius, 0.0, md) * uMouseStrength * uMouseActive;
  }

  float thick = clamp(uThickness + infl * 0.25, 0.0, 1.0);
  float startPos = (0.5 - thick * 0.5) * uTravel;
  float endPos = (-0.5 + thick * 0.5) * uTravel;
  float pos = mix(startPos, endPos, mv);

  float aa = max(uSoftness, 0.0005);
  float d = abs(barCoord + pos) - thick * 0.5;
  float aaWidth = fwidth(uVertical > 0.5 ? p.x : p.y);
  float edge = max(aa, aaWidth);
  float mask = smoothstep(edge, -edge, d);
  float glow = exp(-max(d, 0.0) * (7.0 / (uGlow + 0.001))) * clamp(uGlow, 0.0, 1.0);
  float intensity = clamp(mask + glow * (1.0 - mask), 0.0, 1.0);

  if (uGrain > 0.5) {
    float g = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)) + iTime) * 43758.5453);
    intensity = clamp(intensity + (g - 0.5) * uGrainIntensity, 0.0, 1.0);
  }

  float tint = mv;
  vec3 grad = mix(uColor2, uColor1, tint);
  grad = mix(grad, uColor3, clamp(along, 0.0, 1.0) * 0.45);

  vec3 col = grad * uBrightness * (1.0 + infl * 0.6);
  col = (col - 0.5) * uContrast + 0.5;
  col = clamp(col, 0.0, 1.0);

  float a = intensity * uOpacity;
  if (uLightMode > 0.5) {
    float peak = max(col.r, max(col.g, col.b));
    vec3 chroma = pow(clamp(col / max(peak, 0.0001), 0.0, 1.0), vec3(1.16));
    fragColor = vec4(mix(vec3(1.0), chroma, a * 0.94), 1.0);
  } else {
    fragColor = vec4(col * a, a);
  }
}
`;
    document.querySelectorAll('[data-slicedwaves]').forEach(function (container) {
      const num = function (name, d) { const v = parseFloat(container.getAttribute(name)); return Number.isFinite(v) ? v : d; };
      const bool = function (name, d) { const v = container.getAttribute(name); return v == null ? d : v === 'true'; };
      const canvas = document.createElement('canvas');
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      container.appendChild(canvas);
      const g2 = __fsGL2(canvas, VS, FS, { alpha: true, premul: true, clear: [0, 0, 0, 0] });
      if (!g2) { canvas.remove(); return; }
      const gl = g2.gl;
      const uu = g2.u;
      const setF = function (n, v) { const l = uu[n]; if (l) gl.uniform1f(l, v); };
      const set2 = function (n, x, y) { const l = uu[n]; if (l) gl.uniform2f(l, x, y); };
      const set3 = function (n, a) { const l = uu[n]; if (l) gl.uniform3f(l, a[0], a[1], a[2]); };
      const c1 = __hex3(container.getAttribute('data-color1') || '#FF9FFC');
      const c2 = __hex3(container.getAttribute('data-color2') || '#5227FF');
      const c3 = __hex3(container.getAttribute('data-color3') || '#B497CF');
      setF('uColumns', Math.max(1, num('data-columns', 14) | 0));
      setF('uRows', Math.max(1, num('data-rows', 8) | 0));
      setF('uThickness', num('data-thickness', 0.1));
      setF('uSpeed', num('data-speed', 0.35));
      setF('uTravel', num('data-travel', 0.7));
      setF('uWaveSpread', num('data-wave-spread', 0.9));
      setF('uRowOffset', num('data-row-offset', 1.0));
      setF('uSoftness', num('data-softness', 0.05));
      setF('uGlow', num('data-glow', 0));
      setF('uBrightness', num('data-brightness', 1.0));
      setF('uContrast', num('data-contrast', 1.0));
      setF('uOpacity', num('data-opacity', 0.5));
      setF('uVertical', container.getAttribute('data-orientation') === 'vertical' ? 1 : 0);
      setF('uAlternate', bool('data-alternate', false) ? 1 : 0);
      setF('uMouseStrength', num('data-mouse-strength', 1));
      setF('uMouseRadius', num('data-mouse-radius', 0.3));
      setF('uEnableMouse', bool('data-mouse-interaction', true) ? 1 : 0);
      setF('uGrain', bool('data-grain', true) ? 1 : 0);
      setF('uGrainIntensity', num('data-grain-intensity', 0.05));
      set3('uColor1', c1);
      set3('uColor2', c2);
      set3('uColor3', c3);

      let curM = [0.5, 0.5];
      let tgtM = [0.5, 0.5];
      let curA = 0;
      let tgtA = 0;
      const onMove = function (e) {
        const r = canvas.getBoundingClientRect();
        tgtM[0] = (e.clientX - r.left) / r.width;
        tgtM[1] = 1.0 - (e.clientY - r.top) / r.height;
        tgtA = 1;
      };
      const onLeave = function () { tgtA = 0; };
      canvas.addEventListener('mousemove', onMove);
      canvas.addEventListener('mouseleave', onLeave);

      const resize = function () {
        const r = container.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const wh = g2.resize(Math.max(r.width, 1), Math.max(r.height, 1), dpr);
        set2('iResolution', wh[0], wh[1]);
        g2.render();
      };
      const ro = new ResizeObserver(resize);
      ro.observe(container);
      resize();

      let raf = 0;
      let inView = false;
      let t0 = performance.now();
      let timeV = 0;
      const loop = function (t) {
        if (document.hidden || !inView) { raf = 0; return; }
        raf = requestAnimationFrame(loop);
        curM[0] += 0.05 * (tgtM[0] - curM[0]);
        curM[1] += 0.05 * (tgtM[1] - curM[1]);
        curA += 0.05 * (tgtA - curA);
        timeV = (t - t0) * 0.001;
        setF('iTime', timeV);
        set2('uMouse', curM[0], curM[1]);
        setF('uMouseActive', curA);
        setF('uLightMode', document.documentElement.getAttribute('data-theme') === 'light' ? 1 : 0);
        g2.render();
      };
      const wake = function () { if (!raf && !reduceMQ.matches) { t0 = performance.now() - timeV * 1000; raf = requestAnimationFrame(loop); } };
      const sleep = function () { if (raf) { cancelAnimationFrame(raf); raf = 0; } };
      const io = new IntersectionObserver(function (es) {
        inView = es[0].isIntersecting;
        if (inView) wake(); else sleep();
      }, { rootMargin: '120px' });
      io.observe(container);
      document.addEventListener('visibilitychange', function () { if (document.hidden) sleep(); else if (inView) wake(); });
      if (reduceMQ.matches) { setF('iTime', 8); setF('uLightMode', document.documentElement.getAttribute('data-theme') === 'light' ? 1 : 0); g2.render(); }
      container.__slicedwaves = function () { return { running: !!raf, t: timeV }; };
    });
  })();

  /* ---- GradientWaves 梯度涌浪 · [data-gradientwaves] — 官方 GLSL300es raymarch 原样 ---- */
  (function () {
    const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
    const detailToSteps = function (d) { if (d === 'low') return 40.0; if (d === 'high') return 110.0; return 70.0; };
    const VS = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;
    const FS = `#version 300 es
precision highp float;
uniform vec2 iResolution;
uniform float iTime;
uniform float uSpeed;
uniform float uAmplitude;
uniform float uWaveScale;
uniform float uWaveRatio;
uniform float uSwell;
uniform float uTurbulence;
uniform float uTilt;
uniform float uZoom;
uniform float uHeight;
uniform float uFogDepth;
uniform float uSteps;
uniform float uBrightness;
uniform float uOpacity;
uniform float uGrain;
uniform float uGrainIntensity;
uniform vec2 uMouse;
uniform float uParallax;
uniform bool uEnableMouse;
uniform vec3 uHorizonColor;
uniform vec3 uWaveColor;
uniform vec3 uCrestColor;
out vec4 fragColor;

const float MAX_DIST = 20000.0;

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float plasma(vec3 r, vec2 freq, vec4 tc) {
  float mx = r.x + tc.x;
  mx += uSwell * sin((r.y + mx) / 20.0 + tc.y);
  float my = r.y - tc.z;
  my += uTurbulence * cos(r.x / 23.0 + tc.w);
  return r.z - (sin(mx * freq.x) * uAmplitude + sin(my * freq.y) * uAmplitude + uHeight);
}

float raymarch(vec3 pos, vec3 dir, vec2 freq, vec4 tc) {
  float dist = 0.0;
  for (int i = 0; i < 128; i++) {
    if (float(i) >= uSteps) break;
    float dscene = plasma(pos + dist * dir, freq, tc);
    if (abs(dscene) < 0.1) break;
    dist += 0.9 * dscene;
    if (!(abs(dist) < MAX_DIST)) return MAX_DIST;
  }
  return dist;
}

void main() {
  float T = iTime * uSpeed;
  vec2 freq = vec2(uWaveScale / 7.0, (uWaveScale * uWaveRatio) / 3.0);
  vec4 tc = vec4(T / 0.130, T / 0.810, T / 0.200, T / 0.710);
  float c, s;
  float vfov = (3.14159 / 2.3) / max(uZoom, 0.05);
  vec3 cam = vec3(0.0, 0.0, 30.0);
  vec2 uv = (gl_FragCoord.xy / iResolution.xy) - 0.5;
  uv.x *= iResolution.x / iResolution.y;
  uv.y *= -1.0;

  vec3 dir = vec3(0.0, 0.0, -1.0);
  float ulen = length(uv);
  float xrot = vfov * ulen;
  c = cos(xrot); s = sin(xrot);
  dir = mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c) * dir;
  vec2 nuv = ulen > 1e-5 ? uv / ulen : vec2(1.0, 0.0);
  c = nuv.x; s = nuv.y;
  dir = mat3(c, -s, 0.0, s, c, 0.0, 0.0, 0.0, 1.0) * dir;
  c = cos(uTilt); s = sin(uTilt);
  dir = mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c) * dir;

  if (uEnableMouse) {
    float yaw = (uMouse.x - 0.5) * uParallax * 0.4;
    float pitch = (uMouse.y - 0.5) * uParallax * 0.4;
    c = cos(yaw); s = sin(yaw);
    dir = mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c) * dir;
    c = cos(pitch); s = sin(pitch);
    dir = mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c) * dir;
  }

  float dist = raymarch(cam, dir, freq, tc);
  vec3 pos = cam + dist * dir;

  float t = clamp(uFogDepth / max(dist, 0.001), 0.0, 1.0);
  vec3 body = mix(uWaveColor, uCrestColor, clamp(pos.z * 0.08 + 0.5, 0.0, 1.0));
  vec3 col = mix(uHorizonColor, body, t);
  col *= uBrightness;
  col = clamp(col, 0.0, 1.0);

  float alpha = clamp(t, 0.0, 1.0) * uOpacity;
  if (uGrain > 0.5) {
    float g = hash21(gl_FragCoord.xy + mod(iTime, 64.0) * 11.0);
    alpha += (g - 0.5) * uGrainIntensity;
  }
  alpha = clamp(alpha, 0.0, 1.0);
  fragColor = vec4(col * alpha, alpha);
}
`;
    document.querySelectorAll('[data-gradientwaves]').forEach(function (container) {
      const num = function (name, d) { const v = parseFloat(container.getAttribute(name)); return Number.isFinite(v) ? v : d; };
      const bool = function (name, d) { const v = container.getAttribute(name); return v == null ? d : v === 'true'; };
      const canvas = document.createElement('canvas');
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      container.appendChild(canvas);
      const g2 = __fsGL2(canvas, VS, FS, { alpha: true, premul: true, clear: [0, 0, 0, 0] });
      if (!g2) { canvas.remove(); return; }
      const gl = g2.gl;
      const uu = g2.u;
      const setF = function (n, v) { const l = uu[n]; if (l) gl.uniform1f(l, v); };
      const set2 = function (n, x, y) { const l = uu[n]; if (l) gl.uniform2f(l, x, y); };
      const set3 = function (n, a) { const l = uu[n]; if (l) gl.uniform3f(l, a[0], a[1], a[2]); };
      const setI = function (n, v) { const l = uu[n]; if (l) gl.uniform1i(l, v); };
      const enableMouse = bool('data-mouse-interaction', true);
      setF('uSpeed', num('data-speed', 0.4));
      setF('uAmplitude', num('data-amplitude', 2.5));
      setF('uWaveScale', num('data-wave-scale', 0.6));
      setF('uWaveRatio', num('data-wave-ratio', 0.9));
      setF('uSwell', num('data-swell', 35));
      setF('uTurbulence', num('data-turbulence', 20));
      setF('uTilt', num('data-tilt', 1.11));
      setF('uZoom', num('data-zoom', 1.0));
      setF('uHeight', num('data-height', 5.5));
      setF('uFogDepth', num('data-fog-depth', 15));
      setF('uSteps', detailToSteps(container.getAttribute('data-detail') || 'medium'));
      setF('uBrightness', num('data-brightness', 1.0));
      setF('uOpacity', num('data-opacity', 1.0));
      setF('uGrain', bool('data-grain', true) ? 1 : 0);
      setF('uGrainIntensity', num('data-grain-intensity', 0.05));
      setF('uParallax', num('data-parallax', 0.5));
      setI('uEnableMouse', enableMouse);
      set3('uHorizonColor', __hex3(container.getAttribute('data-horizon-color') || '#5227FF'));
      set3('uWaveColor', __hex3(container.getAttribute('data-wave-color') || '#FF9FFC'));
      set3('uCrestColor', __hex3(container.getAttribute('data-crest-color') || '#FFFFFF'));

      const curM = [0.5, 0.5];
      const tgtM = [0.5, 0.5];
      const onMove = function (e) {
        const r = canvas.getBoundingClientRect();
        tgtM[0] = (e.clientX - r.left) / r.width;
        tgtM[1] = 1.0 - (e.clientY - r.top) / r.height;
      };
      const onLeave = function () { tgtM[0] = 0.5; tgtM[1] = 0.5; };
      canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('pointerleave', onLeave);

      const resize = function () {
        const r = container.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const wh = g2.resize(Math.max(r.width, 1), Math.max(r.height, 1), dpr);
        set2('iResolution', wh[0], wh[1]);
        g2.render();
      };
      const ro = new ResizeObserver(resize);
      ro.observe(container);
      resize();

      let raf = 0;
      let inView = false;
      let t0 = performance.now();
      let timeV = 0;
      const loop = function (t) {
        if (document.hidden || !inView) { raf = 0; return; }
        raf = requestAnimationFrame(loop);
        const tx = enableMouse ? tgtM[0] : 0.5;
        const ty = enableMouse ? tgtM[1] : 0.5;
        curM[0] += 0.05 * (tx - curM[0]);
        curM[1] += 0.05 * (ty - curM[1]);
        timeV = (t - t0) * 0.001;
        setF('iTime', timeV);
        set2('uMouse', curM[0], curM[1]);
        g2.render();
      };
      const wake = function () { if (!raf && !reduceMQ.matches) { t0 = performance.now() - timeV * 1000; raf = requestAnimationFrame(loop); } };
      const sleep = function () { if (raf) { cancelAnimationFrame(raf); raf = 0; } };
      const io = new IntersectionObserver(function (es) {
        inView = es[0].isIntersecting;
        if (inView) wake(); else sleep();
      }, { rootMargin: '120px' });
      io.observe(container);
      document.addEventListener('visibilitychange', function () { if (document.hidden) sleep(); else if (inView) wake(); });
      if (reduceMQ.matches) { setF('iTime', 8); g2.render(); }
      container.__gradientwaves = function () { return { running: !!raf, t: timeV }; };
    });
  })();

  /* ---- WebThreads 光丝 · [data-webthreads] — 官方 GLSL300es 原样 + lightMode 墨色路径 ---- */
  (function () {
    const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
    const FAN_MODE = { center: 0, left: 1, right: 2 };
    const VS = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;
    const FS = `#version 300 es
precision highp float;
uniform vec2 iResolution;
uniform float iTime;
uniform float uSpeed;
uniform float uThreadCount;
uniform float uFrequency;
uniform float uSpread;
uniform float uTaper;
uniform float uPosition;
uniform float uFanMode;
uniform float uGlow;
uniform float uFalloff;
uniform float uThickness;
uniform float uBrightness;
uniform float uOpacity;
uniform float uMirror;
uniform float uShimmer;
uniform float uGrain;
uniform float uGrainIntensity;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform vec3 uBackgroundColor;
uniform bool uLightMode;
uniform vec2 uMouse;
uniform float uMouseStrength;
uniform float uEnableMouse;
uniform float uMouseActive;
out vec4 fragColor;

#define TAU 6.28318530718
#define MAX_THREADS 10

float glow(float x, float str, float dist) {
  return dist / pow(max(x, 1e-4), str);
}

void main() {
  vec2 uv = gl_FragCoord.xy / iResolution.xy;
  float n = max(uThreadCount, 1.0);

  float pinchX = uFanMode < 0.5 ? 0.5 : (uFanMode < 1.5 ? 0.0 : 1.0);
  if (uEnableMouse > 0.5) {
    pinchX = mix(pinchX, uMouse.x, clamp(uMouseStrength, 0.0, 1.0) * uMouseActive);
  }

  float spreadDx = uSpread * abs(uv.x - pinchX);
  float baseT = iTime * uSpeed;
  float tauOverN = TAU / n;
  float mirror = uMirror > 0.5 ? sign(pinchX - uv.x) : 1.0;
  bool doShimmer = uShimmer > 0.5;
  float shimmerT = iTime * 1.7;
  float invThickness = 1.0 / max(uThickness, 0.01);
  float xFreq = uv.x * uFrequency;
  float yOff = uv.y - uPosition;
  float ciScale = n > 1.0 ? 1.0 / (n - 1.0) : 0.0;

  vec3 col = vec3(0.0);
  float gsum = 0.0;

  for (int idx = 0; idx < MAX_THREADS; idx++) {
    float i = float(idx);
    if (i >= n) break;

    float amplitude = spreadDx * (1.0 + i * uTaper);
    float shimmer = doShimmer ? sin(shimmerT + i * 1.3) * 0.35 : 0.0;
    float phase = (baseT + i * tauOverN) * mirror + shimmer;

    float sdf = abs(yOff + sin(xFreq + phase) * amplitude) * invThickness;

    float g = glow(sdf, uFalloff, uGlow);
    float ci = i * ciScale;
    vec3 threadCol = mix(uColor1, uColor2, ci);

    col += g * threadCol;
    gsum += g;
  }

  float coreAmt = smoothstep(0.5, 2.2, gsum);
  col = mix(col, uColor3 * gsum, coreAmt * 0.5);

  float bright = uBrightness;
  if (uEnableMouse > 0.5) {
    vec2 md = uv - uMouse;
    float d2 = dot(md, md);
    bright += clamp(uMouseStrength, 0.0, 1.0) * uMouseActive * exp(-d2 * 6.0) * 0.6;
  }
  col *= bright;

  float alpha = clamp(gsum, 0.0, 1.0) * uOpacity;

  vec3 outRgb = col * alpha;

  if (uGrain > 0.5) {
    float gv = (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)) + iTime) * 43758.5453) - 0.5) * uGrainIntensity;
    outRgb = clamp(outRgb + gv, 0.0, 1.0);
    alpha = clamp(alpha + gv, 0.0, 1.0);
  }

  if (uLightMode) {
    vec3 mapped = vec3(1.0) - exp(-max(col, vec3(0.0)) * 1.3);
    float rawEnergy = clamp(max(mapped.r, max(mapped.g, mapped.b)) * uOpacity, 0.0, 1.0);
    float coverage = smoothstep(0.18, 0.72, rawEnergy);
    coverage *= coverage;
    vec3 hue = mapped / max(max(mapped.r, max(mapped.g, mapped.b)), 1e-4);
    vec3 chroma = pow(clamp(hue, 0.0, 1.0), vec3(0.78));
    vec3 pigment = mix(chroma, vec3(0.08), 0.12);
    vec3 ink = mix(vec3(0.9), pigment, 0.82 + coverage * 0.18);
    fragColor = vec4(mix(uBackgroundColor, ink, coverage), 1.0);
  } else {
    fragColor = vec4(outRgb, alpha);
  }
}
`;
    document.querySelectorAll('[data-webthreads]').forEach(function (container) {
      const num = function (name, d) { const v = parseFloat(container.getAttribute(name)); return Number.isFinite(v) ? v : d; };
      const bool = function (name, d) { const v = container.getAttribute(name); return v == null ? d : v === 'true'; };
      const canvas = document.createElement('canvas');
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      container.appendChild(canvas);
      const g2 = __fsGL2(canvas, VS, FS, { alpha: true, premul: true, clear: [0, 0, 0, 0] });
      if (!g2) { canvas.remove(); return; }
      const gl = g2.gl;
      const uu = g2.u;
      const setF = function (n, v) { const l = uu[n]; if (l) gl.uniform1f(l, v); };
      const set2 = function (n, x, y) { const l = uu[n]; if (l) gl.uniform2f(l, x, y); };
      const set3 = function (n, a) { const l = uu[n]; if (l) gl.uniform3f(l, a[0], a[1], a[2]); };
      const setI = function (n, v) { const l = uu[n]; if (l) gl.uniform1i(l, v); };
      const mouseInteraction = bool('data-mouse-interaction', true);
      setF('uSpeed', num('data-speed', 0.2));
      setF('uThreadCount', Math.round(num('data-thread-count', 6)));
      setF('uFrequency', num('data-frequency', 5.0));
      setF('uSpread', num('data-spread', 0.18));
      setF('uTaper', num('data-taper', 1.0));
      setF('uPosition', num('data-position', 0.5));
      setF('uFanMode', FAN_MODE[container.getAttribute('data-fan-mode') || 'center'] ?? 0);
      setF('uGlow', num('data-glow', 0.02));
      setF('uFalloff', num('data-falloff', 0.6));
      setF('uThickness', num('data-thickness', 1.1));
      setF('uBrightness', num('data-brightness', 0.6));
      setF('uOpacity', num('data-opacity', 1.0));
      setF('uMirror', bool('data-mirror', true) ? 1 : 0);
      setF('uShimmer', bool('data-shimmer', false) ? 1 : 0);
      setF('uGrain', bool('data-grain', true) ? 1 : 0);
      setF('uGrainIntensity', num('data-grain-intensity', 0.05));
      set3('uColor1', __hex3(container.getAttribute('data-color1') || '#5227FF'));
      set3('uColor2', __hex3(container.getAttribute('data-color2') || '#FF9FFC'));
      set3('uColor3', __hex3(container.getAttribute('data-color3') || '#FFFFFF'));
      set3('uBackgroundColor', __hex3(container.getAttribute('data-bg-color') || '#FFFFFF'));
      setF('uMouseStrength', num('data-mouse-strength', 0.3));
      setF('uEnableMouse', mouseInteraction ? 1 : 0);

      const curM = [0.5, 0.5];
      const tgtM = [0.5, 0.5];
      let curA = 0;
      let tgtA = 0;
      const onMove = function (e) {
        const r = canvas.getBoundingClientRect();
        tgtM[0] = (e.clientX - r.left) / r.width;
        tgtM[1] = 1.0 - (e.clientY - r.top) / r.height;
        tgtA = 1;
      };
      const onEnter = function () { tgtA = 1; };
      const onLeave = function () { tgtA = 0; };
      canvas.addEventListener('mousemove', onMove);
      canvas.addEventListener('mouseenter', onEnter);
      canvas.addEventListener('mouseleave', onLeave);

      const resize = function () {
        const r = container.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const wh = g2.resize(Math.max(r.width, 1), Math.max(r.height, 1), dpr);
        set2('iResolution', wh[0], wh[1]);
        g2.render();
      };
      const ro = new ResizeObserver(resize);
      ro.observe(container);
      resize();

      let raf = 0;
      let inView = false;
      let t0 = performance.now();
      let timeV = 0;
      const loop = function (t) {
        if (document.hidden || !inView) { raf = 0; return; }
        raf = requestAnimationFrame(loop);
        curM[0] += 0.05 * (tgtM[0] - curM[0]);
        curM[1] += 0.05 * (tgtM[1] - curM[1]);
        curA += 0.05 * (tgtA - curA);
        timeV = (t - t0) * 0.001;
        setF('iTime', timeV);
        set2('uMouse', curM[0], curM[1]);
        setF('uMouseActive', curA);
        setI('uLightMode', document.documentElement.getAttribute('data-theme') === 'light');
        g2.render();
      };
      const wake = function () { if (!raf && !reduceMQ.matches) { t0 = performance.now() - timeV * 1000; raf = requestAnimationFrame(loop); } };
      const sleep = function () { if (raf) { cancelAnimationFrame(raf); raf = 0; } };
      const io = new IntersectionObserver(function (es) {
        inView = es[0].isIntersecting;
        if (inView) wake(); else sleep();
      }, { rootMargin: '120px' });
      io.observe(container);
      document.addEventListener('visibilitychange', function () { if (document.hidden) sleep(); else if (inView) wake(); });
      if (reduceMQ.matches) { setF('iTime', 8); g2.render(); }
      container.__webthreads = function () { return { running: !!raf, t: timeV }; };
    });
  })();

  /* ---- Lightfall 流星倾泻 · [data-lightfall] — 官方 GLSL1 → three ShaderMaterial 原样 ---- */
  (function () {
    const T = window.THREE;
    if (!T) return;
    const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
    const MAX_COLORS = 8;
    const VERT = 'varying vec2 vUv;\nvoid main() {\n  vUv = uv;\n  gl_Position = vec4(position.xy, 0.0, 1.0);\n}\n';
    const FRAG = `
precision highp float;

uniform vec3  iResolution;
uniform vec2  iMouse;
uniform float iTime;

uniform vec3  uColor0;
uniform vec3  uColor1;
uniform vec3  uColor2;
uniform vec3  uColor3;
uniform vec3  uColor4;
uniform vec3  uColor5;
uniform vec3  uColor6;
uniform vec3  uColor7;
uniform int   uColorCount;

uniform vec3  uBgColor;
uniform vec3  uMouseColor;
uniform float uSpeed;
uniform int   uStreakCount;
uniform float uStreakWidth;
uniform float uStreakLength;
uniform float uGlow;
uniform float uDensity;
uniform float uTwinkle;
uniform float uZoom;
uniform float uBgGlow;
uniform float uOpacity;
uniform float uMouseEnabled;
uniform float uMouseStrength;
uniform float uMouseRadius;
uniform float uLightMode;

varying vec2 vUv;

vec3 palette(float h) {
  int count = uColorCount;
  if (count < 1) count = 1;
  int idx = int(floor(clamp(h, 0.0, 0.999999) * float(count)));
  if (idx <= 0) return uColor0;
  if (idx == 1) return uColor1;
  if (idx == 2) return uColor2;
  if (idx == 3) return uColor3;
  if (idx == 4) return uColor4;
  if (idx == 5) return uColor5;
  if (idx == 6) return uColor6;
  return uColor7;
}

vec3 tanhv(vec3 x) {
  vec3 e = exp(-2.0 * x);
  return (1.0 - e) / (1.0 + e);
}

vec2 sceneC(vec2 frag, vec2 r) {
  vec2 P = (frag + frag - r) / r.x;
  float z = 0.0;
  float d = 1e3;
  vec4 O = vec4(0.0);
  for (int k = 0; k < 39; k++) {
    if (d <= 1e-4) break;
    O = z * normalize(vec4(P, uZoom, 0.0)) - vec4(0.0, 4.0, 1.0, 0.0) / 4.5;
    d = 1.0 - sqrt(length(O * O));
    z += d;
  }
  return vec2(O.x, atan(O.z, O.y));
}

void mainImage(out vec4 o, vec2 C) {
  vec2 r = iResolution.xy;
  vec2 uv0 = (C + C - r) / r.x;
  float T = 0.1 * iTime * uSpeed + 9.0;
  float angRings = max(1.0, floor(6.28318530718 * max(uDensity, 0.05) + 0.5));
  vec2 Y = vec2(5e-3, 6.28318530718 / angRings);

  vec2 c0 = sceneC(C, r);
  vec2 cdx = sceneC(C + vec2(1.0, 0.0), r);
  vec2 cdy = sceneC(C + vec2(0.0, 1.0), r);
  vec2 dCx = cdx - c0;
  vec2 dCy = cdy - c0;
  dCx.y -= 6.28318530718 * floor(dCx.y / 6.28318530718 + 0.5);
  dCy.y -= 6.28318530718 * floor(dCy.y / 6.28318530718 + 0.5);
  vec2 fw = abs(dCx) + abs(dCy);
  C = c0;

  vec2 P = vec2(2.0, 1.0) * uv0 - (r / r.x) * vec2(0.0, 1.0);
  vec4 O = uLightMode > 0.5
    ? vec4(0.0)
    : vec4(uBgColor * 90.0 * uBgGlow / (1e3 * dot(P, P) + 6.0), 0.0);

  float mGlow = 0.0;
  if (uMouseEnabled > 0.5) {
    vec2 mN = (iMouse + iMouse - r) / r.x;
    float md = length(uv0 - mN);
    mGlow = exp(-md * md / max(uMouseRadius * uMouseRadius, 1e-4)) * uMouseStrength;
    O.rgb += uMouseColor * mGlow * 0.25;
  }

  float zr = 5e-4 * uStreakWidth;
  vec2 rr = vec2(max(length(fw), 1e-5));
  float tail = 19.0 / max(uStreakLength, 0.05);

  for (int m = 0; m < 16; m++) {
    if (m >= uStreakCount) break;
    float jf = float(m) + 1.0;
    float ic = fract(sin(dot(vec2(jf, floor(C.x / Y.x + 0.5)), vec2(7.0, 11.0)) * 73.0));
    vec2 Pp = C - (T + T * ic) * vec2(0.0, 1.0);
    Pp -= floor(Pp / Y + 0.5) * Y;
    float h = fract(8663.0 * ic);
    vec3 col = palette(h);
    float weight = mix(1.5, 1.0 + sin(T + 7.0 * h + 4.0), uTwinkle);
    weight *= (1.0 + mGlow * 2.0);
    vec2 inner = vec2(length(max(Pp, vec2(-1.0, 0.0))), length(Pp) - zr) - zr;
    vec2 sm = vec2(1.0) - smoothstep(-rr, rr, inner);
    O.rgb += dot(sm, vec2(exp(tail * Pp.y), 3.0)) * col * weight;
    C.x += Y.x / 8.0;
  }

  vec3 colr = sqrt(tanhv(max(O.rgb * uGlow - vec3(0.04, 0.08, 0.02), 0.0)));
if (uLightMode > 0.5) {
  float peak = max(colr.r, max(colr.g, colr.b));
  float coverage = smoothstep(0.035, 0.58, peak) * uOpacity;
  vec3 chroma = clamp(colr / max(peak, 1e-4), 0.0, 1.0);
  chroma = pow(chroma, vec3(1.35));
  float chromaPeak = max(chroma.r, max(chroma.g, chroma.b));
  chroma /= max(chromaPeak, 1e-4);
  o = vec4(mix(vec3(1.0), chroma, coverage * 0.94), 1.0);
} else {
    o = vec4(colr, uOpacity);
  }
}

void main() {
  vec4 color;
  mainImage(color, vUv * iResolution.xy);
  gl_FragColor = color;
}
`;
    const hexToRGB = function (hex) {
      const c = (hex || '').replace('#', '').padEnd(6, '0');
      return [parseInt(c.slice(0, 2), 16) / 255, parseInt(c.slice(2, 4), 16) / 255, parseInt(c.slice(4, 6), 16) / 255];
    };
    const prepColors = function (input) {
      const base = (input && input.length ? input : ['#A6C8FF', '#5227FF', '#FF9FFC']).slice(0, MAX_COLORS);
      const count = base.length;
      const arr = [];
      for (let i = 0; i < MAX_COLORS; i++) arr.push(hexToRGB(base[Math.min(i, base.length - 1)]));
      const avg = [0, 0, 0];
      for (let i = 0; i < count; i++) { avg[0] += arr[i][0]; avg[1] += arr[i][1]; avg[2] += arr[i][2]; }
      avg[0] /= count; avg[1] /= count; avg[2] /= count;
      return { arr: arr, count: count, avg: avg };
    };
    document.querySelectorAll('[data-lightfall]').forEach(function (container) {
      const num = function (name, d) { const v = parseFloat(container.getAttribute(name)); return Number.isFinite(v) ? v : d; };
      const bool = function (name, d) { const v = container.getAttribute(name); return v == null ? d : v === 'true'; };
      const stops = (container.getAttribute('data-colors') || '#A6C8FF,#5227FF,#FF9FFC').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      const { arr, count, avg } = prepColors(stops);
      const mouseInteraction = bool('data-mouse-interaction', true);
      const mouseDampening = num('data-mouse-dampening', 0.15);

      const scene = new T.Scene();
      const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const geometry = new T.PlaneGeometry(2, 2);
      const material = new T.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depth: false,
        uniforms: {
          iResolution: { value: [1, 1, 1] },
          iMouse: { value: [0, 0] },
          iTime: { value: 0 },
          uColor0: { value: arr[0] }, uColor1: { value: arr[1] }, uColor2: { value: arr[2] }, uColor3: { value: arr[3] },
          uColor4: { value: arr[4] }, uColor5: { value: arr[5] }, uColor6: { value: arr[6] }, uColor7: { value: arr[7] },
          uColorCount: { value: count },
          uBgColor: { value: hexToRGB(container.getAttribute('data-bg-color') || '#0A29FF') },
          uMouseColor: { value: avg },
          uSpeed: { value: num('data-speed', 0.5) },
          uStreakCount: { value: Math.max(1, Math.min(16, Math.round(num('data-streak-count', 2)))) },
          uStreakWidth: { value: num('data-streak-width', 1) },
          uStreakLength: { value: num('data-streak-length', 1) },
          uGlow: { value: num('data-glow', 1) },
          uDensity: { value: num('data-density', 0.6) },
          uTwinkle: { value: num('data-twinkle', 1) },
          uZoom: { value: num('data-zoom', 3) },
          uBgGlow: { value: num('data-bg-glow', 0.5) },
          uOpacity: { value: num('data-opacity', 1) },
          uMouseEnabled: { value: mouseInteraction ? 1 : 0 },
          uMouseStrength: { value: num('data-mouse-strength', 0.5) },
          uMouseRadius: { value: num('data-mouse-radius', 1) },
          uLightMode: { value: 0 }
        }
      });
      const mesh = new T.Mesh(geometry, material);
      mesh.frustumCulled = false;
      scene.add(mesh);

      const canvas = document.createElement('canvas');
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      container.appendChild(canvas);
      let renderer;
      try {
        renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
      } catch (err) { void err; canvas.remove(); return; }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x000000, 0);
      const u = material.uniforms;

      const resize = function () {
        const w = Math.max(container.clientWidth, 1);
        const h = Math.max(container.clientHeight, 1);
        renderer.setSize(w, h, false);
        u.iResolution.value = [canvas.width, canvas.height, 1];
      };
      const ro = new ResizeObserver(function () { resize(); renderer.render(scene, camera); });
      ro.observe(container);
      resize();

      const mouseTarget = [0, 0];
      let lastT = 0;
      const onPointerMove = function (e) {
        const rect = canvas.getBoundingClientRect();
        const scale = renderer.getPixelRatio() || 1;
        const x = (e.clientX - rect.left) * scale;
        const y = (rect.height - (e.clientY - rect.top)) * scale;
        mouseTarget[0] = x;
        mouseTarget[1] = y;
        if (mouseDampening <= 0) u.iMouse.value = [x, y];
      };
      if (mouseInteraction) canvas.addEventListener('pointermove', onPointerMove);

      let raf = 0;
      let inView = false;
      let timeV = 0;
      const loop = function (t) {
        if (document.hidden || !inView) { raf = 0; return; }
        raf = requestAnimationFrame(loop);
        u.iTime.value = t * 0.001;
        timeV = u.iTime.value;
        if (mouseDampening > 0) {
          if (!lastT) lastT = t;
          const dt = (t - lastT) / 1000;
          lastT = t;
          const tau = Math.max(1e-4, mouseDampening);
          let factor = 1 - Math.exp(-dt / tau);
          if (factor > 1) factor = 1;
          const cur = u.iMouse.value;
          cur[0] += (mouseTarget[0] - cur[0]) * factor;
          cur[1] += (mouseTarget[1] - cur[1]) * factor;
        } else {
          lastT = t;
        }
        u.uLightMode.value = document.documentElement.getAttribute('data-theme') === 'light' ? 1 : 0;
        renderer.render(scene, camera);
      };
      const wake = function () { if (!raf && !reduceMQ.matches) raf = requestAnimationFrame(loop); };
      const sleep = function () { if (raf) { cancelAnimationFrame(raf); raf = 0; lastT = 0; } };
      const io = new IntersectionObserver(function (es) {
        inView = es[0].isIntersecting;
        if (inView) wake(); else sleep();
      }, { rootMargin: '120px' });
      io.observe(container);
      document.addEventListener('visibilitychange', function () { if (document.hidden) sleep(); else if (inView) wake(); });
      u.iTime.value = 8;
      u.uLightMode.value = document.documentElement.getAttribute('data-theme') === 'light' ? 1 : 0;
      renderer.render(scene, camera);
      container.__lightfall = function () { return { running: !!raf, t: timeV }; };
    });
  })();

  /* ---- FaultyTerminal 故障终端 · [data-faultyterminal] — 官方 GLSL1 mediump → three 原样 + 亮色墨路 ---- */
  (function () {
    const T = window.THREE;
    if (!T) return;
    const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
    const VERT = 'varying vec2 vUv;\nvoid main() {\n  vUv = uv;\n  gl_Position = vec4(position.xy, 0.0, 1.0);\n}\n';
    const FRAG = `
precision mediump float;

varying vec2 vUv;

uniform float iTime;
uniform vec3  iResolution;
uniform float uScale;

uniform vec2  uGridMul;
uniform float uDigitSize;
uniform float uScanlineIntensity;
uniform float uGlitchAmount;
uniform float uFlickerAmount;
uniform float uNoiseAmp;
uniform float uChromaticAberration;
uniform float uDither;
uniform float uCurvature;
uniform vec3  uTint;
uniform vec2  uMouse;
uniform float uMouseStrength;
uniform float uUseMouse;
uniform float uPageLoadProgress;
uniform float uUsePageLoadAnimation;
uniform float uBrightness;
uniform float uLightMode;

float time;

float hash21(vec2 p){
  p = fract(p * 234.56);
  p += dot(p, p + 34.56);
  return fract(p.x * p.y);
}

float noise(vec2 p)
{
  return sin(p.x * 10.0) * sin(p.y * (3.0 + sin(time * 0.090909))) + 0.2; 
}

mat2 rotate(float angle)
{
  float c = cos(angle);
  float s = sin(angle);
  return mat2(c, -s, s, c);
}

float fbm(vec2 p)
{
  p *= 1.1;
  float f = 0.0;
  float amp = 0.5 * uNoiseAmp;
  
  mat2 modify0 = rotate(time * 0.02);
  f += amp * noise(p);
  p = modify0 * p * 2.0;
  amp *= 0.454545;
  
  mat2 modify1 = rotate(time * 0.02);
  f += amp * noise(p);
  p = modify1 * p * 2.0;
  amp *= 0.454545;
  
  mat2 modify2 = rotate(time * 0.08);
  f += amp * noise(p);
  
  return f;
}

float pattern(vec2 p, out vec2 q, out vec2 r) {
  vec2 offset1 = vec2(1.0);
  vec2 offset0 = vec2(0.0);
  mat2 rot01 = rotate(0.1 * time);
  mat2 rot1 = rotate(0.1);
  
  q = vec2(fbm(p + offset1), fbm(rot01 * p + offset1));
  r = vec2(fbm(rot1 * q + offset0), fbm(q + offset0));
  return fbm(p + r);
}

float digit(vec2 p){
    vec2 grid = uGridMul * 15.0;
    vec2 s = floor(p * grid) / grid;
    p = p * grid;
    vec2 q, r;
    float intensity = pattern(s * 0.1, q, r) * 1.3 - 0.03;
    
    if(uUseMouse > 0.5){
        vec2 mouseWorld = uMouse * uScale;
        float distToMouse = distance(s, mouseWorld);
        float mouseInfluence = exp(-distToMouse * 8.0) * uMouseStrength * 10.0;
        intensity += mouseInfluence;
        
        float ripple = sin(distToMouse * 20.0 - iTime * 5.0) * 0.1 * mouseInfluence;
        intensity += ripple;
    }
    
    if(uUsePageLoadAnimation > 0.5){
        float cellRandom = fract(sin(dot(s, vec2(12.9898, 78.233))) * 43758.5453);
        float cellDelay = cellRandom * 0.8;
        float cellProgress = clamp((uPageLoadProgress - cellDelay) / 0.2, 0.0, 1.0);
        
        float fadeAlpha = smoothstep(0.0, 1.0, cellProgress);
        intensity *= fadeAlpha;
    }
    
    p = fract(p);
    p *= uDigitSize;
    
    float px5 = p.x * 5.0;
    float py5 = (1.0 - p.y) * 5.0;
    float x = fract(px5);
    float y = fract(py5);
    
    float i = floor(py5) - 2.0;
    float j = floor(px5) - 2.0;
    float n = i * i + j * j;
    float f = n * 0.0625;
    
    float isOn = step(0.1, intensity - f);
    float brightness = isOn * (0.2 + y * 0.8) * (0.75 + x * 0.25);
    
    return step(0.0, p.x) * step(p.x, 1.0) * step(0.0, p.y) * step(p.y, 1.0) * brightness;
}

float onOff(float a, float b, float c)
{
  return step(c, sin(iTime + a * cos(iTime * b))) * uFlickerAmount;
}

float displace(vec2 look)
{
    float y = look.y - mod(iTime * 0.25, 1.0);
    float window = 1.0 / (1.0 + 50.0 * y * y);
    return sin(look.y * 20.0 + iTime) * 0.0125 * onOff(4.0, 2.0, 0.8) * (1.0 + cos(iTime * 60.0)) * window;
}

vec3 getColor(vec2 p){
    
    float bar = step(mod(p.y + time * 20.0, 1.0), 0.2) * 0.4 + 1.0;
    bar *= uScanlineIntensity;
    
    float displacement = displace(p);
    p.x += displacement;

    if (uGlitchAmount != 1.0) {
      float extra = displacement * (uGlitchAmount - 1.0);
      p.x += extra;
    }

    float middle = digit(p);
    
    const float off = 0.002;
    float sum = digit(p + vec2(-off, -off)) + digit(p + vec2(0.0, -off)) + digit(p + vec2(off, -off)) +
                digit(p + vec2(-off, 0.0)) + digit(p + vec2(0.0, 0.0)) + digit(p + vec2(off, 0.0)) +
                digit(p + vec2(-off, off)) + digit(p + vec2(0.0, off)) + digit(p + vec2(off, off));
    
    vec3 baseColor = vec3(0.9) * middle + sum * 0.1 * vec3(1.0) * bar;
    return baseColor;
}

vec2 barrel(vec2 uv){
  vec2 c = uv * 2.0 - 1.0;
  float r2 = dot(c, c);
  c *= 1.0 + uCurvature * r2;
  return c * 0.5 + 0.5;
}

void main() {
    time = iTime * 0.333333;
    vec2 uv = vUv;

    if(uCurvature != 0.0){
      uv = barrel(uv);
    }
    
    vec2 p = uv * uScale;
    vec3 col = getColor(p);

    if(uChromaticAberration != 0.0){
      vec2 ca = vec2(uChromaticAberration) / iResolution.xy;
      col.r = getColor(p + ca).r;
      col.b = getColor(p - ca).b;
    }

    col *= uTint;
    col *= uBrightness;

    if(uDither > 0.0){
      float rnd = hash21(gl_FragCoord.xy);
      col += (rnd - 0.5) * (uDither * 0.003922);
    }

    if (uLightMode > 0.5) {
      float energy = max(max(col.r, col.g), col.b);
      float coverage = clamp(smoothstep(0.0, 0.72, energy) * 0.9, 0.0, 0.9);
      vec3 ink = clamp(col * 0.42, 0.0, 0.76);
      col = mix(vec3(1.0), ink, coverage);
    }

    gl_FragColor = vec4(col, 1.0);
}
`;
    const hexToRgb = function (hex) {
      let h = (hex || '#ffffff').replace('#', '').trim();
      if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
      const num = parseInt(h.slice(0, 6), 16);
      return [((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255];
    };
    document.querySelectorAll('[data-faultyterminal]').forEach(function (container) {
      const num = function (name, d) { const v = parseFloat(container.getAttribute(name)); return Number.isFinite(v) ? v : d; };
      const bool = function (name, d) { const v = container.getAttribute(name); return v == null ? d : v === 'true'; };
      const gridAttr = (container.getAttribute('data-grid-mul') || '2,1').split(',').map(parseFloat);
      const mouseReact = bool('data-mouse-react', true);
      const timeScale = num('data-time-scale', 0.3);
      const pageLoadAnimation = bool('data-page-load-animation', true);
      const ditherAttr = container.getAttribute('data-dither');
      const ditherValue = ditherAttr == null ? 0 : (ditherAttr === 'true' ? 1 : (ditherAttr === 'false' ? 0 : parseFloat(ditherAttr)));
      const tintVec = hexToRgb(container.getAttribute('data-tint') || '#ffffff');

      const scene = new T.Scene();
      const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const geometry = new T.PlaneGeometry(2, 2);
      const material = new T.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depth: false,
        uniforms: {
          iTime: { value: 0 },
          iResolution: { value: [1, 1, 1] },
          uScale: { value: num('data-scale', 1) },
          uGridMul: { value: [gridAttr[0] || 2, gridAttr[1] || 1] },
          uDigitSize: { value: num('data-digit-size', 1.5) },
          uScanlineIntensity: { value: num('data-scanline-intensity', 0.3) },
          uGlitchAmount: { value: num('data-glitch-amount', 1) },
          uFlickerAmount: { value: num('data-flicker-amount', 1) },
          uNoiseAmp: { value: num('data-noise-amp', 1) },
          uChromaticAberration: { value: num('data-chromatic-aberration', 0) },
          uDither: { value: Number.isFinite(ditherValue) ? ditherValue : 0 },
          uCurvature: { value: num('data-curvature', 0.2) },
          uTint: { value: tintVec },
          uMouse: { value: [0.5, 0.5] },
          uMouseStrength: { value: num('data-mouse-strength', 0.2) },
          uUseMouse: { value: mouseReact ? 1 : 0 },
          uPageLoadProgress: { value: pageLoadAnimation ? 0 : 1 },
          uUsePageLoadAnimation: { value: pageLoadAnimation ? 1 : 0 },
          uBrightness: { value: num('data-brightness', 1) },
          uLightMode: { value: 0 }
        }
      });
      const mesh = new T.Mesh(geometry, material);
      mesh.frustumCulled = false;
      scene.add(mesh);

      const canvas = document.createElement('canvas');
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      container.appendChild(canvas);
      let renderer;
      try {
        renderer = new T.WebGLRenderer({ canvas, antialias: false, alpha: true });
      } catch (err) { void err; canvas.remove(); return; }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x000000, 0);
      const u = material.uniforms;

      const resize = function () {
        const w = Math.max(container.clientWidth, 1);
        const h = Math.max(container.clientHeight, 1);
        renderer.setSize(w, h, false);
        u.iResolution.value = [canvas.width, canvas.height, canvas.width / canvas.height];
      };
      const ro = new ResizeObserver(function () { resize(); renderer.render(scene, camera); });
      ro.observe(container);
      resize();

      const mouse = { x: 0.5, y: 0.5 };
      const smoothMouse = { x: 0.5, y: 0.5 };
      const onMouseMove = function (e) {
        const rect = canvas.getBoundingClientRect();
        mouse.x = (e.clientX - rect.left) / rect.width;
        mouse.y = 1 - (e.clientY - rect.top) / rect.height;
      };
      if (mouseReact) container.addEventListener('mousemove', onMouseMove);

      const timeOffset = Math.random() * 100;
      let loadStart = 0;
      let raf = 0;
      let inView = false;
      let timeV = 0;
      const loop = function (t) {
        if (document.hidden || !inView) { raf = 0; return; }
        raf = requestAnimationFrame(loop);
        if (pageLoadAnimation && loadStart === 0) loadStart = t;
        const elapsed = (t * 0.001 + timeOffset) * timeScale;
        u.iTime.value = elapsed;
        timeV = elapsed;
        if (pageLoadAnimation && loadStart > 0) {
          u.uPageLoadProgress.value = Math.min((t - loadStart) / 2000, 1);
        }
        if (mouseReact) {
          smoothMouse.x += (mouse.x - smoothMouse.x) * 0.08;
          smoothMouse.y += (mouse.y - smoothMouse.y) * 0.08;
          u.uMouse.value[0] = smoothMouse.x;
          u.uMouse.value[1] = smoothMouse.y;
        }
        u.uLightMode.value = document.documentElement.getAttribute('data-theme') === 'light' ? 1 : 0;
        renderer.render(scene, camera);
      };
      const wake = function () { if (!raf && !reduceMQ.matches) raf = requestAnimationFrame(loop); };
      const sleep = function () { if (raf) { cancelAnimationFrame(raf); raf = 0; } };
      const io = new IntersectionObserver(function (es) {
        inView = es[0].isIntersecting;
        if (inView) wake(); else sleep();
      }, { rootMargin: '120px' });
      io.observe(container);
      document.addEventListener('visibilitychange', function () { if (document.hidden) sleep(); else if (inView) wake(); });
      if (reduceMQ.matches) {
        u.iTime.value = (timeOffset + 8) * timeScale;
        u.uPageLoadProgress.value = 1;
        u.uLightMode.value = document.documentElement.getAttribute('data-theme') === 'light' ? 1 : 0;
        renderer.render(scene, camera);
      }
      container.__faultyterminal = function () { return { running: !!raf, t: timeV }; };
    });
  })();

  /* ---- LetterGlitch 字母故障矩阵 · [data-letterglitch] — 官方 canvas2D 原样 + 站内门禁/主题 ---- */
  (function () {
    const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
    const FALLBACK_RGB = { r: 255, g: 255, b: 255 };
    document.querySelectorAll('[data-letterglitch]').forEach(function (container) {
      const num = function (name, d) { const v = parseFloat(container.getAttribute(name)); return Number.isFinite(v) ? v : d; };
      const bool = function (name, d) { const v = container.getAttribute(name); return v == null ? d : v === 'true'; };
      const glitchColors = (container.getAttribute('data-colors') || '#5227FF,#A855F7,#E879F9,#C4B5FD').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      const glitchSpeed = num('data-glitch-speed', 50);
      const smooth = bool('data-smooth', true);
      const centerVignette = bool('data-center-vignette', false);
      const characters = container.getAttribute('data-characters') || 'ABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$&*()-_+=/[]{};:<>.,0123456789';
      const lettersAndSymbols = Array.from(characters);
      const fontSize = 16;
      const charWidth = 10;
      const charHeight = 20;

      const canvas = document.createElement('canvas');
      canvas.style.position = 'absolute';
      canvas.style.inset = '0';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      container.appendChild(canvas);
      const ctx = canvas.getContext('2d');

      const outerVig = document.createElement('div');
      outerVig.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
      container.appendChild(outerVig);
      let centerVig = null;
      if (centerVignette) {
        centerVig = document.createElement('div');
        centerVig.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
        container.appendChild(centerVig);
      }

      const getRandomChar = function () { return lettersAndSymbols[Math.floor(Math.random() * lettersAndSymbols.length)]; };
      const getRandomColor = function () { return glitchColors[Math.floor(Math.random() * glitchColors.length)]; };
      const hexToRgb = function (hex) {
        const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
        hex = hex.replace(shorthandRegex, function (m, r, g, b) { return r + r + g + g + b + b; });
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null;
      };
      const mixRgb = function (start, end, factor) {
        return {
          r: Math.round(start.r + (end.r - start.r) * factor),
          g: Math.round(start.g + (end.g - start.g) * factor),
          b: Math.round(start.b + (end.b - start.b) * factor)
        };
      };
      const rgbToCss = function (c) { return 'rgb(' + c.r + ', ' + c.g + ', ' + c.b + ')'; };
      const getRandomRgb = function () { return hexToRgb(getRandomColor()) || FALLBACK_RGB; };

      let grid = { columns: 0, rows: 0 };
      let letters = [];
      let ticks = 0;
      let lastGlitchTime = Date.now();

      const initializeLetters = function (columns, rows) {
        grid = { columns: columns, rows: rows };
        const totalLetters = columns * rows;
        letters = Array.from({ length: totalLetters }, function () {
          const rgb = getRandomRgb();
          return { char: getRandomChar(), rgb: rgb, fromRgb: rgb, targetRgb: getRandomRgb(), colorProgress: 1 };
        });
      };

      const resizeCanvas = function () {
        const parent = canvas.parentElement;
        if (!parent) return;
        const dpr = window.devicePixelRatio || 1;
        const rect = parent.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const columns = Math.ceil(rect.width / charWidth);
        const rows = Math.ceil(rect.height / charHeight);
        initializeLetters(columns, rows);
        drawLetters();
      };

      const drawLetters = function () {
        if (letters.length === 0) return;
        const { width, height } = canvas.getBoundingClientRect();
        ctx.clearRect(0, 0, width, height);
        ctx.font = fontSize + 'px monospace';
        ctx.textBaseline = 'top';
        letters.forEach(function (letter, index) {
          const x = (index % grid.columns) * charWidth;
          const y = Math.floor(index / grid.columns) * charHeight;
          ctx.fillStyle = rgbToCss(letter.rgb);
          ctx.fillText(letter.char, x, y);
        });
      };

      const updateLetters = function () {
        if (!letters || letters.length === 0) return;
        const updateCount = Math.max(1, Math.floor(letters.length * 0.05));
        for (let i = 0; i < updateCount; i++) {
          const index = Math.floor(Math.random() * letters.length);
          if (!letters[index]) continue;
          letters[index].char = getRandomChar();
          letters[index].fromRgb = letters[index].rgb;
          letters[index].targetRgb = getRandomRgb();
          if (!smooth) {
            letters[index].rgb = letters[index].targetRgb;
            letters[index].colorProgress = 1;
          } else {
            letters[index].colorProgress = 0;
          }
        }
      };

      const handleSmoothTransitions = function () {
        let needsRedraw = false;
        letters.forEach(function (letter) {
          if (letter.colorProgress < 1) {
            letter.colorProgress += 0.05;
            if (letter.colorProgress > 1) letter.colorProgress = 1;
            letter.rgb = mixRgb(letter.fromRgb, letter.targetRgb, letter.colorProgress);
            needsRedraw = true;
          }
        });
        if (needsRedraw) drawLetters();
      };

      let lastLight = null;
      const syncTheme = function () {
        const light = document.documentElement.getAttribute('data-theme') === 'light';
        if (light === lastLight) return;
        lastLight = light;
        container.style.backgroundColor = light ? '#ffffff' : '#000000';
        outerVig.style.background = light
          ? 'radial-gradient(circle, rgba(255,255,255,0) 58%, rgba(255,255,255,0.96) 100%)'
          : 'radial-gradient(circle, rgba(0,0,0,0) 60%, rgba(0,0,0,1) 100%)';
        if (centerVig) {
          centerVig.style.background = light
            ? 'radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0) 60%)'
            : 'radial-gradient(circle, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0) 60%)';
        }
      };
      syncTheme();

      let raf = 0;
      let inView = false;
      const loop = function () {
        if (document.hidden || !inView) { raf = 0; return; }
        raf = requestAnimationFrame(loop);
        syncTheme();
        const now = Date.now();
        if (now - lastGlitchTime >= glitchSpeed) {
          updateLetters();
          drawLetters();
          lastGlitchTime = now;
          ticks++;
        }
        if (smooth) handleSmoothTransitions();
      };
      const wake = function () { if (!raf && !reduceMQ.matches) { lastGlitchTime = Date.now(); raf = requestAnimationFrame(loop); } };
      const sleep = function () { if (raf) { cancelAnimationFrame(raf); raf = 0; } };
      const io = new IntersectionObserver(function (es) {
        inView = es[0].isIntersecting;
        if (inView) wake(); else sleep();
      }, { rootMargin: '120px' });
      io.observe(container);
      document.addEventListener('visibilitychange', function () { if (document.hidden) sleep(); else if (inView) wake(); });

      let resizeTimeout;
      window.addEventListener('resize', function () {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(function () {
          const wasRunning = !!raf;
          sleep();
          syncTheme();
          resizeCanvas();
          if (wasRunning) wake();
        }, 100);
      });
      resizeCanvas();

      container.__letterglitch = function () { return { running: !!raf, t: ticks }; };
    });
  })();

  /* ---- ShapeGrid 形状网格 · [data-shapegrid] — 官方 canvas2D 滚动网格/悬停轨迹 原样 ---- */
  (function () {
    const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
    document.querySelectorAll('[data-shapegrid]').forEach(function (container) {
      const num = function (name, d) { const v = parseFloat(container.getAttribute(name)); return Number.isFinite(v) ? v : d; };
      const direction = container.getAttribute('data-direction') || 'right';
      const speed = num('data-speed', 1);
      const squareSize = num('data-square-size', 40);
      const shape = container.getAttribute('data-shape') || 'square';
      const hoverTrailAmount = Math.max(0, num('data-hover-trail', 0) | 0);
      const attrBorder = container.getAttribute('data-border-color');
      const attrHover = container.getAttribute('data-hover-fill');

      const canvas = document.createElement('canvas');
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      container.appendChild(canvas);
      const ctx = canvas.getContext('2d');

      const isHex = shape === 'hexagon';
      const isTri = shape === 'triangle';
      const hexHoriz = squareSize * 1.5;
      const hexVert = squareSize * Math.sqrt(3);

      let borderColor = '#999';
      let hoverFillColor = '#222';
      const syncColors = function () {
        const light = document.documentElement.getAttribute('data-theme') === 'light';
        borderColor = attrBorder || (light ? 'rgba(109,40,217,0.30)' : 'rgba(196,181,253,0.26)');
        hoverFillColor = attrHover || (light ? 'rgba(139,92,246,0.28)' : 'rgba(139,92,246,0.55)');
      };
      syncColors();

      let requestRef = 0;
      let frames = 0;
      const gridOffset = { x: 0, y: 0 };
      let hoveredSquare = null;
      let trailCells = [];
      const cellOpacities = new Map();

      const resizeCanvas = function () {
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
      };
      window.addEventListener('resize', resizeCanvas);
      resizeCanvas();

      const drawHex = function (cx, cy, size) {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i;
          const vx = cx + size * Math.cos(angle);
          const vy = cy + size * Math.sin(angle);
          if (i === 0) ctx.moveTo(vx, vy);
          else ctx.lineTo(vx, vy);
        }
        ctx.closePath();
      };
      const drawCircle = function (cx, cy, size) {
        ctx.beginPath();
        ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
        ctx.closePath();
      };
      const drawTriangle = function (cx, cy, size, flip) {
        ctx.beginPath();
        if (flip) {
          ctx.moveTo(cx, cy + size / 2);
          ctx.lineTo(cx + size / 2, cy - size / 2);
          ctx.lineTo(cx - size / 2, cy - size / 2);
        } else {
          ctx.moveTo(cx, cy - size / 2);
          ctx.lineTo(cx + size / 2, cy + size / 2);
          ctx.lineTo(cx - size / 2, cy + size / 2);
        }
        ctx.closePath();
      };

      const drawGrid = function () {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (isHex) {
          const colShift = Math.floor(gridOffset.x / hexHoriz);
          const offsetX = ((gridOffset.x % hexHoriz) + hexHoriz) % hexHoriz;
          const offsetY = ((gridOffset.y % hexVert) + hexVert) % hexVert;
          const cols = Math.ceil(canvas.width / hexHoriz) + 3;
          const rows = Math.ceil(canvas.height / hexVert) + 3;
          for (let col = -2; col < cols; col++) {
            for (let row = -2; row < rows; row++) {
              const cx = col * hexHoriz + offsetX;
              const cy = row * hexVert + ((col + colShift) % 2 !== 0 ? hexVert / 2 : 0) + offsetY;
              const cellKey = col + ',' + row;
              const alpha = cellOpacities.get(cellKey);
              if (alpha) {
                ctx.globalAlpha = alpha;
                drawHex(cx, cy, squareSize);
                ctx.fillStyle = hoverFillColor;
                ctx.fill();
                ctx.globalAlpha = 1;
              }
              drawHex(cx, cy, squareSize);
              ctx.strokeStyle = borderColor;
              ctx.stroke();
            }
          }
        } else if (isTri) {
          const halfW = squareSize / 2;
          const colShift = Math.floor(gridOffset.x / halfW);
          const rowShift = Math.floor(gridOffset.y / squareSize);
          const offsetX = ((gridOffset.x % halfW) + halfW) % halfW;
          const offsetY = ((gridOffset.y % squareSize) + squareSize) % squareSize;
          const cols = Math.ceil(canvas.width / halfW) + 4;
          const rows = Math.ceil(canvas.height / squareSize) + 4;
          for (let col = -2; col < cols; col++) {
            for (let row = -2; row < rows; row++) {
              const cx = col * halfW + offsetX;
              const cy = row * squareSize + squareSize / 2 + offsetY;
              const flip = ((col + colShift + row + rowShift) % 2 + 2) % 2 !== 0;
              const cellKey = col + ',' + row;
              const alpha = cellOpacities.get(cellKey);
              if (alpha) {
                ctx.globalAlpha = alpha;
                drawTriangle(cx, cy, squareSize, flip);
                ctx.fillStyle = hoverFillColor;
                ctx.fill();
                ctx.globalAlpha = 1;
              }
              drawTriangle(cx, cy, squareSize, flip);
              ctx.strokeStyle = borderColor;
              ctx.stroke();
            }
          }
        } else if (shape === 'circle') {
          const offsetX = ((gridOffset.x % squareSize) + squareSize) % squareSize;
          const offsetY = ((gridOffset.y % squareSize) + squareSize) % squareSize;
          const cols = Math.ceil(canvas.width / squareSize) + 3;
          const rows = Math.ceil(canvas.height / squareSize) + 3;
          for (let col = -2; col < cols; col++) {
            for (let row = -2; row < rows; row++) {
              const cx = col * squareSize + squareSize / 2 + offsetX;
              const cy = row * squareSize + squareSize / 2 + offsetY;
              const cellKey = col + ',' + row;
              const alpha = cellOpacities.get(cellKey);
              if (alpha) {
                ctx.globalAlpha = alpha;
                drawCircle(cx, cy, squareSize);
                ctx.fillStyle = hoverFillColor;
                ctx.fill();
                ctx.globalAlpha = 1;
              }
              drawCircle(cx, cy, squareSize);
              ctx.strokeStyle = borderColor;
              ctx.stroke();
            }
          }
        } else {
          const offsetX = ((gridOffset.x % squareSize) + squareSize) % squareSize;
          const offsetY = ((gridOffset.y % squareSize) + squareSize) % squareSize;
          const cols = Math.ceil(canvas.width / squareSize) + 3;
          const rows = Math.ceil(canvas.height / squareSize) + 3;
          for (let col = -2; col < cols; col++) {
            for (let row = -2; row < rows; row++) {
              const sx = col * squareSize + offsetX;
              const sy = row * squareSize + offsetY;
              const cellKey = col + ',' + row;
              const alpha = cellOpacities.get(cellKey);
              if (alpha) {
                ctx.globalAlpha = alpha;
                ctx.fillStyle = hoverFillColor;
                ctx.fillRect(sx, sy, squareSize, squareSize);
                ctx.globalAlpha = 1;
              }
              ctx.strokeStyle = borderColor;
              ctx.strokeRect(sx, sy, squareSize, squareSize);
            }
          }
        }

        const gradient = ctx.createRadialGradient(
          canvas.width / 2, canvas.height / 2, 0,
          canvas.width / 2, canvas.height / 2,
          Math.sqrt(canvas.width ** 2 + canvas.height ** 2) / 2
        );
        gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      };

      const updateCellOpacities = function () {
        const targets = new Map();
        if (hoveredSquare) {
          targets.set(hoveredSquare.x + ',' + hoveredSquare.y, 1);
        }
        if (hoverTrailAmount > 0) {
          for (let i = 0; i < trailCells.length; i++) {
            const tcell = trailCells[i];
            const key = tcell.x + ',' + tcell.y;
            if (!targets.has(key)) {
              targets.set(key, (trailCells.length - i) / (trailCells.length + 1));
            }
          }
        }
        for (const [key] of targets) {
          if (!cellOpacities.has(key)) cellOpacities.set(key, 0);
        }
        for (const [key, opacity] of cellOpacities) {
          const target = targets.get(key) || 0;
          const next = opacity + (target - opacity) * 0.15;
          if (next < 0.005) cellOpacities.delete(key);
          else cellOpacities.set(key, next);
        }
      };

      const updateAnimation = function () {
        if (document.hidden) { requestRef = 0; return; }
        const effectiveSpeed = Math.max(speed, 0.1);
        const wrapX = isHex ? hexHoriz * 2 : squareSize;
        const wrapY = isHex ? hexVert : isTri ? squareSize * 2 : squareSize;
        switch (direction) {
          case 'right':
            gridOffset.x = (gridOffset.x - effectiveSpeed + wrapX) % wrapX;
            break;
          case 'left':
            gridOffset.x = (gridOffset.x + effectiveSpeed + wrapX) % wrapX;
            break;
          case 'up':
            gridOffset.y = (gridOffset.y + effectiveSpeed + wrapY) % wrapY;
            break;
          case 'down':
            gridOffset.y = (gridOffset.y - effectiveSpeed + wrapY) % wrapY;
            break;
          case 'diagonal':
            gridOffset.x = (gridOffset.x - effectiveSpeed + wrapX) % wrapX;
            gridOffset.y = (gridOffset.y - effectiveSpeed + wrapY) % wrapY;
            break;
          default:
            break;
        }
        syncColors();
        updateCellOpacities();
        drawGrid();
        frames++;
        requestRef = requestAnimationFrame(updateAnimation);
      };

      const pushTrail = function () {
        if (hoveredSquare && hoverTrailAmount > 0) {
          trailCells.unshift({ x: hoveredSquare.x, y: hoveredSquare.y });
          if (trailCells.length > hoverTrailAmount) trailCells.length = hoverTrailAmount;
        }
      };

      const handleMouseMove = function (event) {
        const rect = canvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;
        let col, row;
        if (isHex) {
          const colShift = Math.floor(gridOffset.x / hexHoriz);
          const offsetX = ((gridOffset.x % hexHoriz) + hexHoriz) % hexHoriz;
          const offsetY = ((gridOffset.y % hexVert) + hexVert) % hexVert;
          const adjustedX = mouseX - offsetX;
          const adjustedY = mouseY - offsetY;
          col = Math.round(adjustedX / hexHoriz);
          const rowOffset = (col + colShift) % 2 !== 0 ? hexVert / 2 : 0;
          row = Math.round((adjustedY - rowOffset) / hexVert);
        } else if (isTri) {
          const halfW = squareSize / 2;
          const offsetX = ((gridOffset.x % halfW) + halfW) % halfW;
          const offsetY = ((gridOffset.y % squareSize) + squareSize) % squareSize;
          col = Math.round((mouseX - offsetX) / halfW);
          row = Math.floor((mouseY - offsetY) / squareSize);
        } else if (shape === 'circle') {
          const offsetX = ((gridOffset.x % squareSize) + squareSize) % squareSize;
          const offsetY = ((gridOffset.y % squareSize) + squareSize) % squareSize;
          col = Math.round((mouseX - offsetX) / squareSize);
          row = Math.round((mouseY - offsetY) / squareSize);
        } else {
          const offsetX = ((gridOffset.x % squareSize) + squareSize) % squareSize;
          const offsetY = ((gridOffset.y % squareSize) + squareSize) % squareSize;
          col = Math.floor((mouseX - offsetX) / squareSize);
          row = Math.floor((mouseY - offsetY) / squareSize);
        }
        if (!hoveredSquare || hoveredSquare.x !== col || hoveredSquare.y !== row) {
          pushTrail();
          hoveredSquare = { x: col, y: row };
        }
      };

      const handleMouseLeave = function () {
        pushTrail();
        hoveredSquare = null;
      };

      canvas.addEventListener('mousemove', handleMouseMove);
      canvas.addEventListener('mouseleave', handleMouseLeave);

      let isVisible = false;
      let isPageVisible = !document.hidden;
      const tryStart = function () {
        if (isVisible && isPageVisible && !requestRef && !reduceMQ.matches) {
          requestRef = requestAnimationFrame(updateAnimation);
        }
      };
      const tryStop = function () {
        if (requestRef) {
          cancelAnimationFrame(requestRef);
          requestRef = 0;
        }
      };
      const io = new IntersectionObserver(function (entries) {
        isVisible = entries[0].isIntersecting;
        if (isVisible) tryStart(); else tryStop();
      }, { rootMargin: '120px' });
      io.observe(canvas);
      const onVisibility = function () {
        isPageVisible = !document.hidden;
        if (isPageVisible) tryStart(); else tryStop();
      };
      document.addEventListener('visibilitychange', onVisibility);
      if (reduceMQ.matches) drawGrid();
      tryStart();

      container.__shapegrid = function () { return { running: !!requestRef, t: frames }; };
    });
  })();

  /* ---- Ballpit 物理球阵 · [data-ballpit] — 官方 three 物理/散射补丁原样; env 用品牌紫摄影棚替代 RoomEnvironment addon ---- */
  (function () {
    const T = window.THREE;
    if (!T || !T.PMREMGenerator || !T.InstancedMesh || !T.MeshPhysicalMaterial) return;
    const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
    document.querySelectorAll('[data-ballpit]').forEach(function (container) {
      const num = function (name, d) { const v = parseFloat(container.getAttribute(name)); return Number.isFinite(v) ? v : d; };
      const bool = function (name, d) { const v = container.getAttribute(name); return v == null ? d : v === 'true'; };
      const cfg = {
        count: Math.max(2, num('data-count', 120) | 0),
        colors: (container.getAttribute('data-colors') || '#8B5CF6,#E879F9,#C4B5FD').split(',').map(function (s) { return s.trim(); }).filter(Boolean),
        ambientColor: 0xffffff,
        ambientIntensity: 1,
        lightIntensity: num('data-light-intensity', 200),
        minSize: num('data-min-size', 0.5),
        maxSize: num('data-max-size', 1),
        size0: num('data-size0', 1),
        gravity: num('data-gravity', 0.5),
        friction: num('data-friction', 0.9975),
        wallBounce: num('data-wall-bounce', 0.95),
        maxVelocity: num('data-max-velocity', 0.15),
        maxX: 5,
        maxY: 5,
        maxZ: 2,
        controlSphere0: false,
        followCursor: bool('data-follow-cursor', true)
      };

      const canvas = document.createElement('canvas');
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      canvas.style.touchAction = 'none';
      canvas.style.userSelect = 'none';
      container.appendChild(canvas);
      let renderer;
      try {
        renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
      } catch (err) { void err; canvas.remove(); return; }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x000000, 0);
      renderer.toneMapping = T.ACESFilmicToneMapping;
      if ('outputColorSpace' in renderer) renderer.outputColorSpace = T.SRGBColorSpace;

      const scene = new T.Scene();
      const camera = new T.PerspectiveCamera();
      const baseFov = camera.fov;
      camera.position.set(0, 0, 20);
      camera.lookAt(0, 0, 0);

      const envScene = new T.Scene();
      const shell = new T.Mesh(new T.BoxGeometry(10, 6, 10), new T.MeshBasicMaterial({ color: new T.Color('#0d0620'), side: T.BackSide }));
      envScene.add(shell);
      const panel = function (w, h, hex, x, y, z, rx, ry) {
        const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(hex), side: T.DoubleSide }));
        m.position.set(x, y, z);
        m.rotation.set(rx || 0, ry || 0, 0);
        envScene.add(m);
      };
      panel(7, 7, '#ffffff', 0, 2.95, 0, Math.PI / 2, 0);
      panel(9, 5, '#E879F9', -4.95, 0.4, 0, 0, Math.PI / 2);
      panel(9, 5, '#5227FF', 4.95, 0.4, 0, 0, -Math.PI / 2);
      panel(9, 4, '#C4B5FD', 0, 0.4, -4.95, 0, 0);
      panel(9, 4, '#3B0764', 0, 0.4, 4.95, 0, Math.PI);
      const pmrem = new T.PMREMGenerator(renderer, 0.04);
      const envTex = pmrem.fromScene(envScene, 0.04).texture;
      pmrem.dispose();
      envScene.traverse(function (o) { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });

      const thkU = {
        thicknessDistortion: { value: 0.1 },
        thicknessAmbient: { value: 0 },
        thicknessAttenuation: { value: 0.1 },
        thicknessPower: { value: 2 },
        thicknessScale: { value: 10 }
      };
      const mat = new T.MeshPhysicalMaterial({
        envMap: envTex,
        metalness: 0.5,
        roughness: 0.5,
        clearcoat: 1,
        clearcoatRoughness: 0.15
      });
      if (mat.envMapRotation) mat.envMapRotation.x = -Math.PI / 2;
      mat.defines = { USE_UV: '' };
      const DIRECT_CALL = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
      const SCATTER_DEF = '\n        void RE_Direct_Scattering(const in IncidentLight directLight, const in vec2 uv, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, inout ReflectedLight reflectedLight) {\n          vec3 scatteringHalf = normalize(directLight.direction + (geometryNormal * thicknessDistortion));\n          float scatteringDot = pow(saturate(dot(geometryViewDir, -scatteringHalf)), thicknessPower) * thicknessScale;\n          #ifdef USE_COLOR\n            vec3 scatteringIllu = (scatteringDot + thicknessAmbient) * vColor;\n          #else\n            vec3 scatteringIllu = (scatteringDot + thicknessAmbient) * diffuse;\n          #endif\n          reflectedLight.directDiffuse += scatteringIllu * thicknessAttenuation * directLight.color;\n        }\n\n        void main() {\n      ';
      mat.onBeforeCompile = function (shader) {
        Object.assign(shader.uniforms, thkU);
        shader.fragmentShader =
          '\n        uniform float thicknessPower;\n        uniform float thicknessScale;\n        uniform float thicknessDistortion;\n        uniform float thicknessAmbient;\n        uniform float thicknessAttenuation;\n      ' +
          shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace('void main() {', SCATTER_DEF);
        const chunk = T.ShaderChunk && T.ShaderChunk.lights_fragment_begin;
        if (chunk && chunk.indexOf(DIRECT_CALL) !== -1) {
          const patched = chunk.split(DIRECT_CALL).join(
            DIRECT_CALL + '\n          RE_Direct_Scattering(directLight, vUv, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, reflectedLight);\n        '
          );
          shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_begin>', patched);
        }
      };

      const geo = new T.SphereGeometry();
      const mesh = new T.InstancedMesh(geo, mat, cfg.count);
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      scene.add(mesh);
      const ambient = new T.AmbientLight(cfg.ambientColor, cfg.ambientIntensity);
      const pointLight = new T.PointLight(new T.Color(cfg.colors[0] || '#ffffff'), cfg.lightIntensity);
      scene.add(ambient);
      scene.add(pointLight);

      const stopCols = cfg.colors.map(function (c) { return new T.Color(c); });
      const tmpCol = new T.Color();
      const getColorAt = function (ratio, out) {
        const scaled = Math.max(0, Math.min(1, ratio)) * (stopCols.length - 1);
        const idx = Math.floor(scaled);
        const start = stopCols[idx];
        if (idx >= stopCols.length - 1) { out.copy(start); return out; }
        const alpha = scaled - idx;
        const end = stopCols[idx + 1];
        out.r = start.r + alpha * (end.r - start.r);
        out.g = start.g + alpha * (end.g - start.g);
        out.b = start.b + alpha * (end.b - start.b);
        return out;
      };
      for (let idx = 0; idx < cfg.count; idx++) {
        getColorAt(idx / cfg.count, tmpCol);
        mesh.setColorAt(idx, tmpCol);
        if (idx === 0) pointLight.color.copy(tmpCol);
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

      const positionData = new Float32Array(3 * cfg.count).fill(0);
      const velocityData = new Float32Array(3 * cfg.count).fill(0);
      const sizeData = new Float32Array(cfg.count).fill(1);
      const center = new T.Vector3();
      const randFloatSpread = function (range) { return range * (Math.random() - 0.5); };
      const randFloat = function (min, max) { return Math.random() * (max - min) + min; };
      (function initPositions() {
        center.toArray(positionData, 0);
        for (let i = 1; i < cfg.count; i++) {
          const s = 3 * i;
          positionData[s] = randFloatSpread(2 * cfg.maxX);
          positionData[s + 1] = randFloatSpread(2 * cfg.maxY);
          positionData[s + 2] = randFloatSpread(2 * cfg.maxZ);
        }
      })();
      const setSizes = function () {
        sizeData[0] = cfg.size0;
        for (let i = 1; i < cfg.count; i++) sizeData[i] = randFloat(cfg.minSize, cfg.maxSize);
      };
      setSizes();

      const F = new T.Vector3();
      const I = new T.Vector3();
      const Vv = new T.Vector3();
      const B = new T.Vector3();
      const O = new T.Vector3();
      const Nv = new T.Vector3();
      const D = new T.Vector3();
      const J = new T.Vector3();
      const H = new T.Vector3();
      const TK = new T.Vector3();

      const updatePhysics = function (e) {
        let r = 0;
        if (cfg.controlSphere0) {
          r = 1;
          F.fromArray(positionData, 0);
          F.lerp(center, 0.1).toArray(positionData, 0);
          Vv.set(0, 0, 0).toArray(velocityData, 0);
        }
        for (let idx = r; idx < cfg.count; idx++) {
          const base = 3 * idx;
          I.fromArray(positionData, base);
          B.fromArray(velocityData, base);
          B.y -= e.delta * cfg.gravity * sizeData[idx];
          B.multiplyScalar(cfg.friction);
          B.clampLength(0, cfg.maxVelocity);
          I.add(B);
          I.toArray(positionData, base);
          B.toArray(velocityData, base);
        }
        for (let idx = r; idx < cfg.count; idx++) {
          const base = 3 * idx;
          I.fromArray(positionData, base);
          B.fromArray(velocityData, base);
          const radius = sizeData[idx];
          for (let jdx = idx + 1; jdx < cfg.count; jdx++) {
            const otherBase = 3 * jdx;
            O.fromArray(positionData, otherBase);
            Nv.fromArray(velocityData, otherBase);
            const otherRadius = sizeData[jdx];
            D.copy(O).sub(I);
            const dist = D.length();
            const sumRadius = radius + otherRadius;
            if (dist < sumRadius) {
              const overlap = sumRadius - dist;
              J.copy(D).normalize().multiplyScalar(0.5 * overlap);
              H.copy(J).multiplyScalar(Math.max(B.length(), 1));
              TK.copy(J).multiplyScalar(Math.max(Nv.length(), 1));
              I.sub(J);
              B.sub(H);
              I.toArray(positionData, base);
              B.toArray(velocityData, base);
              O.add(J);
              Nv.add(TK);
              O.toArray(positionData, otherBase);
              Nv.toArray(velocityData, otherBase);
            }
          }
          if (cfg.controlSphere0) {
            D.copy(F).sub(I);
            const dist = D.length();
            const sumRadius0 = radius + sizeData[0];
            if (dist < sumRadius0) {
              const diff = sumRadius0 - dist;
              J.copy(D).normalize().multiplyScalar(diff);
              H.copy(J).multiplyScalar(Math.max(B.length(), 2));
              I.sub(J);
              B.sub(H);
            }
          }
          if (Math.abs(I.x) + radius > cfg.maxX) {
            I.x = Math.sign(I.x) * (cfg.maxX - radius);
            B.x = -B.x * cfg.wallBounce;
          }
          if (cfg.gravity === 0) {
            if (Math.abs(I.y) + radius > cfg.maxY) {
              I.y = Math.sign(I.y) * (cfg.maxY - radius);
              B.y = -B.y * cfg.wallBounce;
            }
          } else if (I.y - radius < -cfg.maxY) {
            I.y = -cfg.maxY + radius;
            B.y = -B.y * cfg.wallBounce;
          }
          const maxBoundary = Math.max(cfg.maxZ, cfg.maxSize);
          if (Math.abs(I.z) + radius > maxBoundary) {
            I.z = Math.sign(I.z) * (cfg.maxZ - radius);
            B.z = -B.z * cfg.wallBounce;
          }
          I.toArray(positionData, base);
          B.toArray(velocityData, base);
        }
      };

      const U = new T.Object3D();
      const updateMeshes = function (e) {
        updatePhysics(e);
        for (let idx = 0; idx < cfg.count; idx++) {
          U.position.fromArray(positionData, 3 * idx);
          if (idx === 0 && cfg.followCursor === false) {
            U.scale.setScalar(0);
          } else {
            U.scale.setScalar(sizeData[idx]);
          }
          U.updateMatrix();
          mesh.setMatrixAt(idx, U.matrix);
          if (idx === 0) pointLight.position.copy(U.position);
        }
        mesh.instanceMatrix.needsUpdate = true;
      };

      const resize = function () {
        const rect = container.getBoundingClientRect();
        const w = Math.max(1, Math.floor(rect.width));
        const h = Math.max(1, Math.floor(rect.height));
        const ratio = w / h;
        camera.aspect = ratio;
        if (ratio > 1.5) {
          const t = Math.tan((baseFov / 2) * Math.PI / 180) / (ratio / 1.5);
          camera.fov = 2 * (Math.atan(t) * 180 / Math.PI);
        } else {
          camera.fov = baseFov;
        }
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
        const halfFov = (camera.fov * Math.PI / 180) / 2;
        const wHeight = 2 * Math.tan(halfFov) * camera.position.length();
        const wWidth = wHeight * camera.aspect;
        cfg.maxX = wWidth / 2;
        cfg.maxY = wHeight / 2;
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(container);

      const raycaster = new T.Raycaster();
      const ndc = new T.Vector2();
      const planeZ = new T.Plane(new T.Vector3(0, 0, 1), 0);
      const hitPoint = new T.Vector3();
      const onMove = function (e) {
        const rect = canvas.getBoundingClientRect();
        ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(ndc, camera);
        if (raycaster.ray.intersectPlane(planeZ, hitPoint)) {
          center.copy(hitPoint);
          cfg.controlSphere0 = true;
        }
      };
      const onLeave = function () { cfg.controlSphere0 = false; };
      canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('pointerdown', onMove);
      canvas.addEventListener('pointerleave', onLeave);
      canvas.addEventListener('pointerup', onLeave);

      let raf = 0;
      let inView = false;
      let last = 0;
      let elapsed = 0;
      const loop = function (t) {
        if (document.hidden || !inView) { raf = 0; return; }
        raf = requestAnimationFrame(loop);
        if (!last) last = t;
        const delta = (t - last) / 1000;
        last = t;
        elapsed += delta;
        updateMeshes({ delta: delta, elapsed: elapsed });
        renderer.render(scene, camera);
      };
      const wake = function () { if (!raf && !reduceMQ.matches) { last = 0; raf = requestAnimationFrame(loop); } };
      const sleep = function () { if (raf) { cancelAnimationFrame(raf); raf = 0; } };
      const io = new IntersectionObserver(function (es) {
        inView = es[0].isIntersecting;
        if (inView) wake(); else sleep();
      }, { rootMargin: '120px' });
      io.observe(container);
      document.addEventListener('visibilitychange', function () { if (document.hidden) sleep(); else if (inView) wake(); });
      if (reduceMQ.matches) {
        updateMeshes({ delta: 0.016, elapsed: 0 });
        renderer.render(scene, camera);
      }

      container.__ballpit = function () { return { running: !!raf, t: elapsed }; };
    });
  })();

  /* ============ v109 · React Bits 第十六批 (Backgrounds 收尾) ============
     Radar / Dither
     AeroShards 未移植: 官方依赖 vgpu(WebGPU) 库, 与站内 three/raw-WebGL 体系不兼容
       (同 ShapeWaves/Hyperspeed 先例, 记录于 DESIGN.md Appendix D)。
     Dither 官方用 @react-three/postprocessing EffectComposer; 其后处理仅一遍 Bayer 抖动,
       此处以原生 WebGL2 双通道(波场→FBO 纹理→抖动合成)等价复刻, GLSL 逐行保留。 */

  /* ---- Radar 雷达环扫 · [data-radar] — ogl GLSL1 → __fsGL2 GLSL300es 等价 ---- */
  (function () {
    const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
    const VS = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;
    const FS = `#version 300 es
precision highp float;

uniform float uTime;
uniform vec3 uResolution;
uniform float uSpeed;
uniform float uScale;
uniform float uRingCount;
uniform float uSpokeCount;
uniform float uRingThickness;
uniform float uSpokeThickness;
uniform float uSweepSpeed;
uniform float uSweepWidth;
uniform float uSweepLobes;
uniform vec3 uColor;
uniform vec3 uBgColor;
uniform bool uLightMode;
uniform float uFalloff;
uniform float uBrightness;
uniform vec2 uMouse;
uniform float uMouseInfluence;
uniform bool uEnableMouse;

#define TAU 6.28318530718
#define PI 3.14159265359

out vec4 fragColor;

void main() {
  vec2 st = gl_FragCoord.xy / uResolution.xy;
  st = st * 2.0 - 1.0;
  st.x *= uResolution.x / uResolution.y;

  if (uEnableMouse) {
    vec2 mShift = (uMouse * 2.0 - 1.0);
    mShift.x *= uResolution.x / uResolution.y;
    st -= mShift * uMouseInfluence;
  }

  st *= uScale;

  float dist = length(st);
  float theta = atan(st.y, st.x);
  float t = uTime * uSpeed;

  float ringPhase = dist * uRingCount - t;
  float ringDist = abs(fract(ringPhase) - 0.5);
  float ringGlow = 1.0 - smoothstep(0.0, uRingThickness, ringDist);

  float spokeAngle = abs(fract(theta * uSpokeCount / TAU + 0.5) - 0.5) * TAU / uSpokeCount;
  float arcDist = spokeAngle * dist;
  float spokeGlow = (1.0 - smoothstep(0.0, uSpokeThickness, arcDist)) * smoothstep(0.0, 0.1, dist);

  float sweepPhase = t * uSweepSpeed;
  float sweepBeam = pow(max(0.5 * sin(uSweepLobes * theta + sweepPhase) + 0.5, 0.0), uSweepWidth);

  float fade = smoothstep(1.05, 0.85, dist) * pow(max(1.0 - dist, 0.0), uFalloff);

  float intensity = max((ringGlow + spokeGlow + sweepBeam) * fade * uBrightness, 0.0);
  vec3 signal = uColor * intensity;
  vec3 col;
  if (uLightMode) {
    vec3 mapped = vec3(1.0) - exp(-max(signal, vec3(0.0)) * 1.45);
    float energy = clamp(max(mapped.r, max(mapped.g, mapped.b)), 0.0, 1.0);
    vec3 hue = mapped / max(energy, 0.0001);
    hue = pow(clamp(hue, 0.0, 1.0), vec3(1.2));
    col = mix(uBgColor, hue, smoothstep(0.015, 0.8, energy) * 0.96);
    fragColor = vec4(col, 1.0);
  } else {
    col = signal + uBgColor;
    float alpha = clamp(length(col), 0.0, 1.0);
    fragColor = vec4(col, alpha);
  }
}
`;
    document.querySelectorAll('[data-radar]').forEach(function (container) {
      const num = function (name, d) { const v = parseFloat(container.getAttribute(name)); return Number.isFinite(v) ? v : d; };
      const canvas = document.createElement('canvas');
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      container.appendChild(canvas);
      const g2 = __fsGL2(canvas, VS, FS, { alpha: true, premul: false, clear: [0, 0, 0, 0] });
      if (!g2) { canvas.remove(); return; }
      const gl = g2.gl;
      const uu = g2.u;
      const setF = function (n, v) { const l = uu[n]; if (l) gl.uniform1f(l, v); };
      const setI = function (n, v) { const l = uu[n]; if (l) gl.uniform1i(l, v); };
      const set2 = function (n, x, y) { const l = uu[n]; if (l) gl.uniform2f(l, x, y); };
      const set3 = function (n, a) { const l = uu[n]; if (l) gl.uniform3f(l, a[0], a[1], a[2]); };
      setF('uSpeed', num('data-speed', 1.0));
      setF('uScale', num('data-scale', 0.5));
      setF('uRingCount', num('data-ring-count', 10));
      setF('uSpokeCount', num('data-spoke-count', 10));
      setF('uRingThickness', num('data-ring-thickness', 0.05));
      setF('uSpokeThickness', num('data-spoke-thickness', 0.01));
      setF('uSweepSpeed', num('data-sweep-speed', 1.0));
      setF('uSweepWidth', num('data-sweep-width', 2.0));
      setF('uSweepLobes', num('data-sweep-lobes', 1.0));
      setF('uFalloff', num('data-falloff', 2.0));
      setF('uBrightness', num('data-brightness', 1.0));
      setF('uMouseInfluence', num('data-mouse-influence', 0.1));
      setI('uEnableMouse', 1);
      const hex3 = function (h) { return __hex3(h); };
      const color = hex3(container.getAttribute('data-color') || '#A855F7');
      const bgDark = hex3(container.getAttribute('data-bg-color') || '#000000');
      const bgLight = hex3(container.getAttribute('data-bg-color-light') || '#f6f3fc');

      let curM = [0.5, 0.5];
      let tgtM = [0.5, 0.5];
      const onMove = function (e) {
        const r = canvas.getBoundingClientRect();
        tgtM[0] = (e.clientX - r.left) / r.width;
        tgtM[1] = 1.0 - (e.clientY - r.top) / r.height;
      };
      const onLeave = function () { tgtM = [0.5, 0.5]; };
      canvas.addEventListener('mousemove', onMove);
      canvas.addEventListener('mouseleave', onLeave);

      let resArr = [1, 1, 1];
      const resize = function () {
        const r = container.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const wh = g2.resize(Math.max(r.width, 1), Math.max(r.height, 1), dpr);
        resArr = [wh[0], wh[1], wh[0] / wh[1]];
        const l = uu.uResolution; if (l) gl.uniform3f(l, resArr[0], resArr[1], resArr[2]);
        g2.render();
      };
      const ro = new ResizeObserver(resize);
      ro.observe(container);
      resize();

      let raf = 0;
      let inView = false;
      let t0 = performance.now();
      let timeV = 0;
      const loop = function (t) {
        if (document.hidden || !inView) { raf = 0; return; }
        raf = requestAnimationFrame(loop);
        curM[0] += 0.05 * (tgtM[0] - curM[0]);
        curM[1] += 0.05 * (tgtM[1] - curM[1]);
        set2('uMouse', curM[0], curM[1]);
        timeV = (t - t0) * 0.001;
        setF('uTime', timeV);
        const light = document.documentElement.getAttribute('data-theme') === 'light';
        setI('uLightMode', light ? 1 : 0);
        set3('uColor', color);
        set3('uBgColor', light ? bgLight : bgDark);
        g2.render();
      };
      const wake = function () { if (!raf && !reduceMQ.matches) { t0 = performance.now() - timeV * 1000; raf = requestAnimationFrame(loop); } };
      const sleep = function () { if (raf) { cancelAnimationFrame(raf); raf = 0; } };
      const io = new IntersectionObserver(function (es) {
        inView = es[0].isIntersecting;
        if (inView) wake(); else sleep();
      }, { rootMargin: '120px' });
      io.observe(container);
      document.addEventListener('visibilitychange', function () { if (document.hidden) sleep(); else if (inView) wake(); });
      if (reduceMQ.matches) { setF('uTime', 6); setI('uLightMode', document.documentElement.getAttribute('data-theme') === 'light' ? 1 : 0); set3('uColor', color); g2.render(); }
      container.__radar = function () { return { running: !!raf, t: timeV }; };
    });
  })();

  /* ---- Dither 复古抖动波 · [data-dither] — 波场 GLSL + Bayer 8x8 后处理, 双通道等价 ---- */
  (function () {
    const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
    const VS = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;
    const WAVE_FS = `#version 300 es
precision highp float;
uniform vec2 resolution;
uniform float time;
uniform float waveSpeed;
uniform float waveFrequency;
uniform float waveAmplitude;
uniform vec3 waveColor;
uniform vec3 backgroundColor;
uniform vec2 mousePos;
uniform int enableMouseInteraction;
uniform float mouseRadius;
out vec4 fragColor;

vec4 mod289(vec4 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
vec2 fade(vec2 t) { return t*t*t*(t*(t*6.0-15.0)+10.0); }

float cnoise(vec2 P) {
  vec4 Pi = floor(P.xyxy) + vec4(0.0,0.0,1.0,1.0);
  vec4 Pf = fract(P.xyxy) - vec4(0.0,0.0,1.0,1.0);
  Pi = mod289(Pi);
  vec4 ix = Pi.xzxz;
  vec4 iy = Pi.yyww;
  vec4 fx = Pf.xzxz;
  vec4 fy = Pf.yyww;
  vec4 i = permute(permute(ix) + iy);
  vec4 gx = fract(i * (1.0/41.0)) * 2.0 - 1.0;
  vec4 gy = abs(gx) - 0.5;
  vec4 tx = floor(gx + 0.5);
  gx = gx - tx;
  vec2 g00 = vec2(gx.x, gy.x);
  vec2 g10 = vec2(gx.y, gy.y);
  vec2 g01 = vec2(gx.z, gy.z);
  vec2 g11 = vec2(gx.w, gy.w);
  vec4 norm = taylorInvSqrt(vec4(dot(g00,g00), dot(g01,g01), dot(g10,g10), dot(g11,g11)));
  g00 *= norm.x; g01 *= norm.y; g10 *= norm.z; g11 *= norm.w;
  float n00 = dot(g00, vec2(fx.x, fy.x));
  float n10 = dot(g10, vec2(fx.y, fy.y));
  float n01 = dot(g01, vec2(fx.z, fy.z));
  float n11 = dot(g11, vec2(fx.w, fy.w));
  vec2 fade_xy = fade(Pf.xy);
  vec2 n_x = mix(vec2(n00, n01), vec2(n10, n11), fade_xy.x);
  return 2.3 * mix(n_x.x, n_x.y, fade_xy.y);
}

const int OCTAVES = 4;
float fbm(vec2 p) {
  float value = 0.0;
  float amp = 1.0;
  float freq = waveFrequency;
  for (int i = 0; i < OCTAVES; i++) {
    value += amp * abs(cnoise(p));
    p *= freq;
    amp *= waveAmplitude;
  }
  return value;
}

float pattern(vec2 p) {
  vec2 p2 = p - time * waveSpeed;
  return fbm(p + fbm(p2));
}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  uv -= 0.5;
  uv.x *= resolution.x / resolution.y;
  float f = pattern(uv);
  if (enableMouseInteraction == 1) {
    vec2 mouseNDC = (mousePos / resolution - 0.5) * vec2(1.0, -1.0);
    mouseNDC.x *= resolution.x / resolution.y;
    float dist = length(uv - mouseNDC);
    float effect = 1.0 - smoothstep(0.0, mouseRadius, dist);
    f -= 0.5 * effect;
  }
  vec3 col = mix(backgroundColor, waveColor, clamp(f, 0.0, 1.0));
  fragColor = vec4(col, 1.0);
}
`;
    const DITHER_FS = `#version 300 es
precision highp float;
uniform sampler2D inputBuffer;
uniform vec2 resolution;
uniform float colorNum;
uniform float pixelSize;
out vec4 outputColor;

const float bayerMatrix8x8[64] = float[64](
  0.0/64.0, 48.0/64.0, 12.0/64.0, 60.0/64.0,  3.0/64.0, 51.0/64.0, 15.0/64.0, 63.0/64.0,
  32.0/64.0,16.0/64.0, 44.0/64.0, 28.0/64.0, 35.0/64.0,19.0/64.0, 47.0/64.0, 31.0/64.0,
  8.0/64.0, 56.0/64.0,  4.0/64.0, 52.0/64.0, 11.0/64.0,59.0/64.0,  7.0/64.0, 55.0/64.0,
  40.0/64.0,24.0/64.0, 36.0/64.0, 20.0/64.0, 43.0/64.0,27.0/64.0, 39.0/64.0, 23.0/64.0,
  2.0/64.0, 50.0/64.0, 14.0/64.0, 62.0/64.0,  1.0/64.0,49.0/64.0, 13.0/64.0, 61.0/64.0,
  34.0/64.0,18.0/64.0, 46.0/64.0, 30.0/64.0, 33.0/64.0,17.0/64.0, 45.0/64.0, 29.0/64.0,
  10.0/64.0,58.0/64.0,  6.0/64.0, 54.0/64.0,  9.0/64.0,57.0/64.0,  5.0/64.0, 53.0/64.0,
  42.0/64.0,26.0/64.0, 38.0/64.0, 22.0/64.0, 41.0/64.0,25.0/64.0, 37.0/64.0, 21.0/64.0
);

vec3 dither(vec2 uv, vec3 color) {
  vec2 scaledCoord = floor(uv * resolution / pixelSize);
  int x = int(mod(scaledCoord.x, 8.0));
  int y = int(mod(scaledCoord.y, 8.0));
  float threshold = bayerMatrix8x8[y * 8 + x] - 0.25;
  float step = 1.0 / (colorNum - 1.0);
  color += threshold * step;
  float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
  float bias = mix(0.2, 0.0, smoothstep(0.45, 0.8, luminance));
  color = clamp(color - bias, 0.0, 1.0);
  return floor(color * (colorNum - 1.0) + 0.5) / (colorNum - 1.0);
}

void mainImage(in vec4 inputColor, in vec2 uv, out vec4 oCol) {
  vec2 normalizedPixelSize = pixelSize / resolution;
  vec2 uvPixel = normalizedPixelSize * floor(uv / normalizedPixelSize);
  vec4 color = texture(inputBuffer, uvPixel);
  color.rgb = dither(uv, color.rgb);
  oCol = color;
}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution;
  mainImage(vec4(1.0), uv, outputColor);
}
`;
    document.querySelectorAll('[data-dither]').forEach(function (container) {
      const num = function (name, d) { const v = parseFloat(container.getAttribute(name)); return Number.isFinite(v) ? v : d; };
      const canvas = document.createElement('canvas');
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      container.appendChild(canvas);
      let gl;
      try { gl = canvas.getContext('webgl2', { alpha: false, antialias: true, __vnRawGL: true }); } catch (err) { void err; gl = null; }
      if (!gl) { canvas.remove(); return; }
      const mkProg = function (fsSrc) {
        const mk = function (type, src) {
          const s = gl.createShader(type);
          gl.shaderSource(s, src);
          gl.compileShader(s);
          if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn('[rb-dither]', gl.getShaderInfoLog(s)); return null; }
          return s;
        };
        const vs = mk(gl.VERTEX_SHADER, VS);
        const fs = mk(gl.FRAGMENT_SHADER, fsSrc);
        if (!vs || !fs) return null;
        const prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.warn('[rb-dither]', gl.getProgramInfoLog(prog)); return null; }
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(prog, 'position');
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        const u = {};
        const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
        for (let i = 0; i < n; i++) {
          const info = gl.getActiveUniform(prog, i);
          u[info.name] = gl.getUniformLocation(prog, info.name);
        }
        return { prog: prog, u: u };
      };
      const wave = mkProg(WAVE_FS);
      const dith = mkProg(DITHER_FS);
      if (!wave || !dith) { canvas.remove(); return; }
      const wu = wave.u;
      const du = dith.u;

      const waveColor = __hex3(container.getAttribute('data-wave-color') || '#B497CF');
      const bgColor = __hex3(container.getAttribute('data-bg-color') || '#0D0620');
      gl.useProgram(wave.prog); /* uniform 仅对当前 program 生效, 初始化必须先绑定 */
      gl.uniform1f(wu.waveSpeed, num('data-wave-speed', 0.05));
      gl.uniform1f(wu.waveFrequency, num('data-wave-frequency', 3));
      gl.uniform1f(wu.waveAmplitude, num('data-wave-amplitude', 0.3));
      gl.uniform3f(wu.waveColor, waveColor[0], waveColor[1], waveColor[2]);
      gl.uniform3f(wu.backgroundColor, bgColor[0], bgColor[1], bgColor[2]);
      gl.uniform1i(wu.enableMouseInteraction, 1);
      gl.uniform1f(wu.mouseRadius, num('data-mouse-radius', 1));
      gl.useProgram(dith.prog);
      gl.uniform1f(du.colorNum, num('data-color-num', 4));
      gl.uniform1f(du.pixelSize, num('data-pixel-size', 2));

      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fbo = gl.createFramebuffer();
      let texW = 0, texH = 0;
      const attach = function (w, h) {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        texW = w; texH = h;
      };

      const mouse = [0, 0];
      const onMove = function (e) {
        const r = canvas.getBoundingClientRect();
        mouse[0] = (e.clientX - r.left);
        mouse[1] = (e.clientY - r.top);
      };
      canvas.addEventListener('mousemove', onMove);

      let curW = 0, curH = 0;
      const draw = function () {
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.viewport(0, 0, texW, texH);
        gl.useProgram(wave.prog);
        gl.uniform2f(wu.resolution, texW, texH);
        gl.uniform2f(wu.mousePos, mouse[0], mouse[1]);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, curW, curH);
        gl.useProgram(dith.prog);
        gl.uniform2f(du.resolution, curW, curH);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform1i(du.inputBuffer, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      };
      const resize = function () {
        const r = container.getBoundingClientRect();
        const dpr = 1; /* 官方 Canvas dpr={1} 忠实复现 */
        const w = Math.max(1, Math.floor(Math.max(r.width, 1) * dpr));
        const h = Math.max(1, Math.floor(Math.max(r.height, 1) * dpr));
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
        curW = w; curH = h;
        if (w !== texW || h !== texH) attach(w, h);
        draw();
      };
      const ro = new ResizeObserver(resize);
      ro.observe(container);
      resize();

      let raf = 0;
      let inView = false;
      let t0 = performance.now();
      let timeV = 0;
      const loop = function (t) {
        if (document.hidden || !inView) { raf = 0; return; }
        raf = requestAnimationFrame(loop);
        timeV = (t - t0) * 0.001;
        gl.useProgram(wave.prog);
        gl.uniform1f(wu.time, timeV);
        draw();
      };
      const wake = function () { if (!raf && !reduceMQ.matches) { t0 = performance.now() - timeV * 1000; raf = requestAnimationFrame(loop); } };
      const sleep = function () { if (raf) { cancelAnimationFrame(raf); raf = 0; } };
      const io = new IntersectionObserver(function (es) {
        inView = es[0].isIntersecting;
        if (inView) wake(); else sleep();
      }, { rootMargin: '120px' });
      io.observe(container);
      document.addEventListener('visibilitychange', function () { if (document.hidden) sleep(); else if (inView) wake(); });
      if (reduceMQ.matches) { gl.useProgram(wave.prog); gl.uniform1f(wu.time, 8); draw(); }
      container.__dither = function () { return { running: !!raf, t: timeV }; };
    });
  })();

})();
