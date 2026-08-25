/* =========================================================
   F8K® — 首屏玻璃折射 HELLO（WarpText 移植，Three.js 核心实现）
   原作：React Bits <WarpText />（ogl 版，MIT）
   本文件：同款 shader/参数体系 + three.js r160 核心（无新依赖），
   监听 f8k-idle 懒启动；离屏 / 后台 / 上下文丢失均自动暂停与恢复；
   无 WebGL / 减少动效时给容器挂 is-fallback，CSS 静态衬线字接管
   ========================================================= */
(() => {
  'use strict';

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 可调参数（与 React Bits WarpText props 一一对应） ---------- */
  const HELLO_PROPS = {
    text: 'hello',
    colorVar: '--ink',               // 主题变量名，亮/暗自动重光栅化
    fallbackColor: '#171512',
    fontFamily: "'Instrument Serif', 'Songti SC', serif",
    fontStyle: 'italic',
    fontWeight: 400,
    fontSize: 'clamp(8.4rem, 28.5vw, 24rem)',
    letterSpacing: -0.02,
    lineHeight: 0.9,
    warpStrength: 0.10,
    warpScale: 1.7,
    speed: 0.5,
    pointerInfluence: 0.55,
    pointerStrength: 0.45,
    refraction: 0.02,
    ripple: true
  };

  const TAGLINE_PROPS = {
    text: '我在训练代码的灵魂',
    colorVar: '--ink',
    fallbackColor: '#171512',
    /* 艺术字：站酷小薇体（自托管子集）→ 行楷/楷体兜底，优雅手书感 */
    fontFamily: "'ZCOOL XiaoWei', 'STXingkai', 'KaiTi', 'STKaiti', 'Kaiti SC', 'Songti SC', serif",
    fontStyle: 'normal',
    fontWeight: 400,
    fontSize: 'clamp(5rem, 15vw, 13rem)',
    letterSpacing: 0.04,
    lineHeight: 0.96,
    warpStrength: 0.10,
    warpScale: 1.7,
    speed: 0.5,
    pointerInfluence: 0.55,
    pointerStrength: 0.45,
    refraction: 0.02,
    ripple: true
  };

  const WARPS = [
    ['heroWarp', HELLO_PROPS],
    ['taglineWarp', TAGLINE_PROPS]
  ].filter(([id]) => document.getElementById(id));

  const fallback = () => WARPS.forEach(([id]) => document.getElementById(id).classList.add('is-fallback'));

  // 减少动效：WebGL 让位，静态降级
  if (reducedMotion) { fallback(); return; }

  const loadScript = (src) => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });

  document.addEventListener('f8k-idle', () => {
    // 与 lab3d.js 共享同一次 three.js 加载（避免双实例）
    window.__f8kThree = window.__f8kThree || loadScript('assets/vendor/three.min.js');
    window.__f8kThree.then(() => WARPS.forEach(([id, props]) => initWarpText(document.getElementById(id), props)))
      .catch(fallback);
  }, { once: true });

  function initWarpText(wrap, PROPS) {
    if (!window.THREE) return;
    const T = window.THREE;
    try {
      /* ---------- 渲染器（透明底，背景交给 DOM 渐变） ---------- */
      const canvas = document.createElement('canvas');
      wrap.appendChild(canvas);
      const renderer = new T.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: false, // 高 DPR 已足够平滑，关 AA 省 GPU
        powerPreference: 'high-performance'
      });
      const dprCap = window.innerWidth > 1200 ? 1.75 : 1.25;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
      renderer.setClearColor(0x000000, 0);

      const scene = new T.Scene();
      const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);

      /* ---------- 全屏三角形（quad 的退化写法，只画一个三角形覆盖屏幕） ---------- */
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
      geo.setAttribute('uv', new T.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));

      /* ---------- 文字纹理：每次光栅化换全新 CanvasTexture（避免替换 image 时 GPU 侧残留旧纹理） ---------- */
      let texture = null;
      const makeTexture = (raw) => {
        const t = new T.CanvasTexture(raw);
        t.generateMipmaps = false;
        t.minFilter = T.LinearFilter;
        t.magFilter = T.LinearFilter;
        t.wrapS = T.ClampToEdgeWrapping;
        t.wrapT = T.ClampToEdgeWrapping;
        return t;
      };
      texture = makeTexture(document.createElement('canvas'));

      const vertex = `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `;
      const fragment = `
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
        varying vec2 vUv;

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
          if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0);
          return texture2D(uTextTexture, uv);
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
          gl_FragColor = vec4(color, a);
        }
      `;

      const program = new T.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          uTextTexture: { value: texture },
          uResolution: { value: new T.Vector2(1, 1) },
          uPointer: { value: new T.Vector2(0.5, 0.5) },
          uPointerActive: { value: 0 },
          uTime: { value: 0 },
          uWarpStrength: { value: PROPS.warpStrength },
          uWarpScale: { value: PROPS.warpScale },
          uSpeed: { value: PROPS.speed },
          uPointerInfluence: { value: PROPS.pointerInfluence },
          uPointerStrength: { value: PROPS.pointerStrength },
          uRefraction: { value: PROPS.refraction },
          uRipple: { value: PROPS.ripple ? 1 : 0 },
          uMotion: { value: 1 }
        }
      });
      scene.add(new T.Mesh(geo, program));

      /* ---------- 文字光栅化（与 WarpText buildTextCanvas 同逻辑，补充 fontStyle 支持） ---------- */
      const getFontValue = (v) => typeof v === 'number' ? v + 'px' : v;
      const measureLine = (ctx, line, ls) => {
        const chars = Array.from(line);
        return chars.reduce((w, ch) => w + ctx.measureText(ch).width, 0) + Math.max(0, chars.length - 1) * ls;
      };
      const drawLine = (ctx, line, x, y, ls) => {
        const chars = Array.from(line);
        let cursor = x; // 左对齐：从左边距起笔，让玻璃 hello 落在首屏左列
        chars.forEach((ch, i) => {
          ctx.fillText(ch, cursor, y);
          cursor += ctx.measureText(ch).width + (i === chars.length - 1 ? 0 : ls);
        });
      };
      const readColor = () => {
        const v = getComputedStyle(document.documentElement).getPropertyValue(PROPS.colorVar).trim();
        return v || PROPS.fallbackColor;
      };

      let rasterVersion = 0;
      const rasterize = async () => {
        const version = ++rasterVersion;
        if (document.fonts) {
          // 显式加载家族（含自托管艺术字），避免 canvas 用兜底字体先画一帧
          try { await document.fonts.load(`16px ${PROPS.fontFamily}`); } catch (e) {}
          if (document.fonts.status === 'loading') {
            try { await document.fonts.ready; } catch (e) {}
          }
          if (version !== rasterVersion) return;
        }
        const w = wrap.clientWidth, h = wrap.clientHeight;
        if (!w || !h) return;
        const dpr = renderer.getPixelRatio();
        const raw = document.createElement('canvas');
        raw.width = Math.max(1, Math.floor(w * dpr));
        raw.height = Math.max(1, Math.floor(h * dpr));
        const ctx = raw.getContext('2d');
        if (!ctx) return;

        const probe = document.createElement('span');
        probe.textContent = PROPS.text;
        Object.assign(probe.style, {
          position: 'absolute', visibility: 'hidden', pointerEvents: 'none',
          whiteSpace: 'pre', inset: '0 auto auto 0',
          fontFamily: PROPS.fontFamily, fontSize: getFontValue(PROPS.fontSize),
          fontWeight: String(PROPS.fontWeight), letterSpacing: getFontValue(PROPS.letterSpacing),
          fontStyle: PROPS.fontStyle
        });
        wrap.appendChild(probe);
        const cs = getComputedStyle(probe);
        let fontSizePx = parseFloat(cs.fontSize) || 96;
        const fontFamily = cs.fontFamily || 'sans-serif';
        const fontWeight = cs.fontWeight || String(PROPS.fontWeight);
        const fontStyle = cs.fontStyle || 'normal';
        let letterSpacing = cs.letterSpacing === 'normal' ? 0 : parseFloat(cs.letterSpacing) || 0;
        let lineHeight = parseFloat(cs.lineHeight);
        if (!Number.isFinite(lineHeight)) lineHeight = fontSizePx * (typeof PROPS.lineHeight === 'number' ? PROPS.lineHeight : 0.92);
        probe.remove();

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = readColor();
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        const lines = String(PROPS.text || '').split('\n');
        const applyFont = () => { ctx.font = fontStyle + ' ' + fontWeight + ' ' + fontSizePx + 'px ' + fontFamily; };
        applyFont();

        const maxWidth = w * 0.90, maxHeight = h * 0.92;
        const widest = Math.max(...lines.map((line) => measureLine(ctx, line, letterSpacing)), 1);
        const blockHeight = Math.max(lineHeight * lines.length, 1);
        const fit = Math.min(1, maxWidth / widest, maxHeight / blockHeight);
        if (fit < 1) {
          fontSizePx *= fit; letterSpacing *= fit; lineHeight *= fit;
          applyFont();
        }
        const startY = h / 2 - (lineHeight * (lines.length - 1)) / 2;
        const startX = w * 0.03; // 左对齐边距，贴合首屏左列
        lines.forEach((line, i) => drawLine(ctx, line, startX, startY + i * lineHeight, letterSpacing));

        const next = makeTexture(raw);
        if (program.uniforms.uTextTexture.value) program.uniforms.uTextTexture.value.dispose();
        program.uniforms.uTextTexture.value = next;
        texture = next;
        renderOnce();
      };

      /* ---------- 尺寸 / 指针 / 帧循环（沿用本站的暂停与节流纪律） ---------- */
      const resize = () => {
        const w = wrap.clientWidth || 1, h = wrap.clientHeight || 1;
        renderer.setSize(w, h, false);
        program.uniforms.uResolution.value.set(
          renderer.getContext().drawingBufferWidth,
          renderer.getContext().drawingBufferHeight
        );
        rasterize();
      };

      const pointer = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, active: 0, activeTarget: 0 };
      const startTime = performance.now();
      window.addEventListener('mousemove', (e) => {
        const r = wrap.getBoundingClientRect();
        if (!r.width || !r.height) return;
        pointer.tx = (e.clientX - r.left) / r.width;
        pointer.ty = 1 - (e.clientY - r.top) / r.height;
        pointer.activeTarget = 1;
      }, { passive: true });
      window.addEventListener('mouseleave', () => { pointer.activeTarget = 0; });

      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
      const onReduce = (ev) => { program.uniforms.uMotion.value = ev.matches ? 0 : 1; renderOnce(); };
      if (reduceMotion.addEventListener) reduceMotion.addEventListener('change', onReduce);

      document.addEventListener('f8k-theme', () => { program.uniforms.uMotion.value = 1; rasterize(); });

      let running = false, inView = true, rafId = 0, rendered = false, lastRs = 0;
      const renderOnce = () => { if (running) renderer.render(scene, camera); };
      const tick = (now) => {
        if (!running) return;
        if (now - lastRs >= 33) { // ≈30fps：满屏片元 4 次采样，节流省一半 GPU
          lastRs = now - (now - lastRs) % 33;
          const elapsed = (now - startTime) * 0.001;
          const idleX = 0.5 + Math.sin(elapsed * 0.33) * 0.12;
          const idleY = 0.5 + Math.cos(elapsed * 0.27) * 0.1;
          const targetX = pointer.activeTarget > 0 ? pointer.tx : idleX;
          const targetY = pointer.activeTarget > 0 ? pointer.ty : idleY;
          const damping = pointer.activeTarget > 0 ? 0.12 : 0.035;
          pointer.x += (targetX - pointer.x) * damping;
          pointer.y += (targetY - pointer.y) * damping;
          pointer.active += ((pointer.activeTarget > 0 ? 1 : 0.18) - pointer.active) * 0.06;
          program.uniforms.uPointer.value.set(pointer.x, pointer.y);
          program.uniforms.uPointerActive.value = pointer.active;
          program.uniforms.uTime.value = elapsed;
          renderer.render(scene, camera);
          if (!rendered) { rendered = true; wrap.classList.add('is-on'); }
        }
        rafId = requestAnimationFrame(tick);
      };
      const setRunning = (on) => {
        const want = on && inView && !document.hidden;
        if (want === running) return;
        running = want;
        if (running) rafId = requestAnimationFrame(tick);
        else cancelAnimationFrame(rafId);
      };

      canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        running = false;
        cancelAnimationFrame(rafId);
        wrap.classList.remove('is-on');
      }, false);
      canvas.addEventListener('webglcontextrestored', () => {
        resize();
        rendered = false;
        setRunning(true);
      }, false);

      new IntersectionObserver((en) => {
        inView = en[0].isIntersecting;
        setRunning(true);
      }, { rootMargin: '80px' }).observe(wrap);
      document.addEventListener('visibilitychange', () => setRunning(true));

      let hResize;
      new ResizeObserver(() => {
        clearTimeout(hResize);
        hResize = setTimeout(resize, 150); // 防抖：等窗口稳定再改画布尺寸
      }).observe(wrap);

      resize();
      setRunning(true);
    } catch (e) {
      wrap.classList.add('is-fallback');
    }
  }
})();
