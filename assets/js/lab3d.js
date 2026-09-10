/* =========================================================
   F8K® — 实验室 3D：迷你太阳系（可交互太空场景）
   —— 太阳 + 八大行星 + 土星环 + 小行星带 + 星野，紫罗兰色板。
   交互：
     · 拖动旋转镜头（带惯性）    · 滚轮缩放
     · 悬停行星高亮 + 双语铭牌    · 点击行星锁定跟随，点空白复位
   纪律：共享 three.js 单例、离屏/后台暂停、30fps 隔帧渲染、
         prefers-reduced-motion 直接让位静态降级。
   ========================================================= */
(() => {
  'use strict';

  const canvas = document.getElementById('labCanvas');
  if (!canvas) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const loadScript = (src) => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });

  document.addEventListener('f8k-idle', () => {
    // 与 hero3d.js 共享同一次 three.js 加载（避免双实例）；
    // three.min.js 已在 index.html 静态引入时，直接复用 window.THREE，不重复下载
    window.__f8kThree = window.__f8kThree ||
      (window.THREE ? Promise.resolve() : loadScript('assets/vendor/three.min.js'));
    window.__f8kThree.then(init).catch(() => { /* 静默放弃 3D */ });
  }, { once: true });

  const lang = () => (window.F8K_LANG === 'zh' ? 'zh' : 'en');

  function init() {
    if (!window.THREE) return;
    const T = window.THREE;
    try {
      const doc = document.documentElement;
      const readVars = () => {
        const s = getComputedStyle(doc);
        const hex = (v, fb) => { const t = s.getPropertyValue(v).trim(); return t.startsWith('#') ? parseInt(t.slice(1), 16) : fb; };
        return {
          accent: hex('--accent', 0x6b56d3),
          mint: hex('--accent-mint', 0x12b77e),
          sun: hex('--accent-sun', 0xf2a93b)
        };
      };
      let V = readVars();
      const lowPower = /iPad|iPhone|iPod/.test(navigator.userAgent) || window.innerWidth < 1024;

      const renderer = new T.WebGLRenderer({
        canvas,
        alpha: false,
        antialias: !lowPower,
        powerPreference: 'low-power'
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 2 : 1.5));
      renderer.outputColorSpace = T.SRGBColorSpace;
      renderer.toneMapping = T.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;

      const scene = new T.Scene();
      scene.background = new T.Color('#0b0918');

      const camera = new T.PerspectiveCamera(40, 1, 0.1, 140);
      camera.position.set(0, 5, 17);

      /* ---------- 深空背景：内面球体，顶点色纵向渐变（紫罗兰星云） ---------- */
      const mkSpaceBg = () => {
        const geo = new T.SphereGeometry(46, 32, 24);
        const mat = new T.ShaderMaterial({
          side: T.BackSide,
          depthWrite: false,
          depthTest: false,
          uniforms: {
            uTop: { value: new T.Color('#0b0918') },
            uMid: { value: new T.Color('#241a4d') },
            uBot: { value: new T.Color('#3b2a63') }
          },
          vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
          fragmentShader: [
            'uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uBot;',
            'varying vec3 vP;',
            'void main(){',
            '  float t = clamp(vP.y / 46.0, -1.0, 1.0);',
            '  vec3 c = t > 0.0 ? mix(uMid, uTop, pow(t, 0.8)) : mix(uMid, uBot, pow(-t, 0.8));',
            '  gl_FragColor = vec4(c, 1.0);',
            '}'
          ].join('\n')
        });
        return new T.Mesh(geo, mat);
      };
      const spaceBg = mkSpaceBg();
      scene.add(spaceBg);

      /* ---------- 星野：两层 Points，轻微视差 ---------- */
      const stars = new T.Group();
      const mkStars = (count, rMin, rMax, size, opacity) => {
        const pos = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
          const r = rMin + Math.random() * (rMax - rMin);
          const th = Math.random() * Math.PI * 2;
          const ph = Math.acos(2 * Math.random() - 1);
          pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
          pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
          pos[i * 3 + 2] = r * Math.cos(ph);
        }
        const g = new T.BufferGeometry();
        g.setAttribute('position', new T.BufferAttribute(pos, 3));
        const m = new T.PointsMaterial({
          color: 0xdfd7ff, size, sizeAttenuation: true, transparent: true,
          opacity, depthWrite: false, blending: T.AdditiveBlending
        });
        return new T.Points(g, m);
      };
      stars.add(mkStars(lowPower ? 260 : 520, 26, 44, 0.16, 0.75));
      stars.add(mkStars(lowPower ? 140 : 260, 18, 26, 0.1, 0.5));
      scene.add(stars);

      /* ---------- 光照：太阳点光 + 环境 + 冷色轮廓 ---------- */
      scene.add(new T.AmbientLight(0x8d85c9, 0.5));
      const sunLight = new T.PointLight(0xfff3d6, 3.0, 0, 0);
      scene.add(sunLight);
      const rim = new T.DirectionalLight(V.mint, 0.7);
      rim.position.set(-8, 6, -6);
      scene.add(rim);

      /* ---------- 程序化贴图：带状（气态巨行星）与斑块（类地行星） ---------- */
      const texCache = {};
      const bandTexture = (stops) => {
        const key = 'band' + stops.map((s) => s[0]).join(',');
        if (texCache[key]) return texCache[key];
        const c = document.createElement('canvas'); c.width = 128; c.height = 64;
        const g = c.getContext('2d');
        const grad = g.createLinearGradient(0, 0, 0, 64);
        stops.forEach(([t, col]) => grad.addColorStop(t, col));
        g.fillStyle = grad; g.fillRect(0, 0, 128, 64);
        const t = new T.CanvasTexture(c);
        t.colorSpace = T.SRGBColorSpace;
        texCache[key] = t;
        return t;
      };
      const speckTexture = (base, specks) => {
        const key = 'speck' + base.toString(16) + specks.length;
        if (texCache[key]) return texCache[key];
        const c = document.createElement('canvas'); c.width = 128; c.height = 64;
        const g = c.getContext('2d');
        g.fillStyle = '#' + base.toString(16).padStart(6, '0'); g.fillRect(0, 0, 128, 64);
        specks.forEach(([col, n, rMax]) => {
          g.fillStyle = '#' + col.toString(16).padStart(6, '0');
          for (let i = 0; i < n; i++) {
            g.globalAlpha = 0.25 + Math.random() * 0.5;
            g.beginPath();
            g.arc(Math.random() * 128, Math.random() * 64, 1 + Math.random() * rMax, 0, Math.PI * 2);
            g.fill();
          }
        });
        g.globalAlpha = 1;
        const t = new T.CanvasTexture(c);
        t.colorSpace = T.SRGBColorSpace;
        texCache[key] = t;
        return t;
      };

      /* ---------- 行星数据（艺术化比例，非真实比例） ---------- */
      const PLANETS = [
        { key: 'sun',      name: { en: 'Sun', zh: '太阳' },   fact: { en: 'the star at the center', zh: '恒星 · 中心之火' },  radius: 1.05, dist: 0,    speed: 0,   color: 0xf4c469, emissive: 0xeaa14f, bands: null, specks: null, glow: 6.4 },
        { key: 'mercury',  name: { en: 'Mercury', zh: '水星' }, fact: { en: 'smallest · fastest planet', zh: '最小 · 最快' },  radius: 0.16, dist: 2.0,  speed: 0.9,  color: 0xb7b1c9, bands: null, specks: [[0x8f88a6, 12, 3]], glow: 0 },
        { key: 'venus',    name: { en: 'Venus', zh: '金星' },   fact: { en: 'the hottest planet', zh: '最炽热的行星' },         radius: 0.28, dist: 2.9,  speed: 0.72, color: 0xe7cf9b, bands: null, specks: [[0xcaa66a, 10, 4]], glow: 0 },
        { key: 'earth',    name: { en: 'Earth', zh: '地球' },   fact: { en: 'our home', zh: '我们的家园' },                      radius: 0.3,  dist: 3.8,  speed: 0.6,  color: 0x4f7fd6, bands: null, specks: [[0x58a86b, 14, 6], [0xd8e6f2, 10, 5]], glow: 0 },
        { key: 'mars',     name: { en: 'Mars', zh: '火星' },    fact: { en: 'the red planet', zh: '红色星球' },                  radius: 0.22, dist: 4.7,  speed: 0.5,  color: 0xc96f6f, bands: null, specks: [[0x8f4a4a, 12, 4]], glow: 0 },
        { key: 'jupiter',  name: { en: 'Jupiter', zh: '木星' }, fact: { en: 'the largest planet', zh: '最大的行星' },            radius: 0.85, dist: 6.6,  speed: 0.34, color: 0xd9c7a8, bands: [[0, '#d9c7a8'], [0.25, '#c9b28f'], [0.45, '#a88a72'], [0.62, '#d9c7a8'], [0.8, '#b3926f'], [1, '#e4d6bd']], specks: null, glow: 0 },
        { key: 'saturn',   name: { en: 'Saturn', zh: '土星' },  fact: { en: 'the ringed giant', zh: '带光环的巨行星' },           radius: 0.72, dist: 8.6,  speed: 0.26, color: 0xe5d0a2, bands: [[0, '#e5d0a2'], [0.3, '#d6bd8c'], [0.55, '#c8ab7c'], [0.8, '#e8d6ad'], [1, '#d9c292']], specks: null, ring: { inner: 1.05, outer: 1.75, color: 0xd8c49a }, glow: 0 },
        { key: 'uranus',   name: { en: 'Uranus', zh: '天王星' }, fact: { en: 'the tilted ice giant', zh: '倾斜的冰巨星' },         radius: 0.5,  dist: 10.4, speed: 0.2,  color: 0x8fd3d8, bands: [[0, '#8fd3d8'], [0.5, '#9fdcdf'], [1, '#7fc2c8']], specks: null, glow: 0 },
        { key: 'neptune',  name: { en: 'Neptune', zh: '海王星' }, fact: { en: 'the farthest planet', zh: '最遥远的行星' },        radius: 0.48, dist: 12.0, speed: 0.16, color: 0x5a7fd6, bands: [[0, '#5a7fd6'], [0.4, '#4a6cc2'], [0.7, '#668bd8'], [1, '#5274c8']], specks: null, glow: 0 }
      ];

      /* ---------- 构建轨道 + 行星 ---------- */
      const orbitGroup = new T.Group();     // 整体绕太阳公转的容器
      const pickables = [];                 // 可悬停/点击的网格（含太阳）
      const planets = [];                   // { def, mesh, orbit } 运行时状态

      const orbitGeo = () => {
        const seg = 128;
        const pts = new Float32Array((seg + 1) * 3);
        for (let i = 0; i <= seg; i++) {
          const a = (i / seg) * Math.PI * 2;
          pts[i * 3] = Math.cos(a); pts[i * 3 + 1] = 0; pts[i * 3 + 2] = Math.sin(a);
        }
        const g = new T.BufferGeometry();
        g.setAttribute('position', new T.BufferAttribute(pts, 3));
        return g;
      };

      // 太阳
      const sunMesh = new T.Mesh(
        new T.SphereGeometry(PLANETS[0].radius, 40, 26),
        new T.MeshBasicMaterial({ color: PLANETS[0].color })
      );
      orbitGroup.add(sunMesh);
      pickables.push(sunMesh);
      // 太阳辉光
      const glow = (() => {
        const c = document.createElement('canvas'); c.width = 128; c.height = 128;
        const g = c.getContext('2d');
        const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
        grad.addColorStop(0, 'rgba(255,214,140,0.95)');
        grad.addColorStop(0.25, 'rgba(244,171,90,0.55)');
        grad.addColorStop(0.6, 'rgba(150,90,160,0.18)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
        const t = new T.CanvasTexture(c);
        const s = new T.Sprite(new T.SpriteMaterial({
          map: t, color: 0xf4c469, blending: T.AdditiveBlending, transparent: true, depthWrite: false
        }));
        s.scale.setScalar(PLANETS[0].glow);
        return s;
      })();
      orbitGroup.add(glow);
      const sunRef = { def: PLANETS[0], mesh: sunMesh, orbit: null, glow };

      planets.push(sunRef);

      PLANETS.slice(1).forEach((def) => {
        const orbit = new T.Group();
        const mesh = new T.Mesh(
          new T.SphereGeometry(def.radius, lowPower ? 24 : 40, lowPower ? 16 : 26),
          new T.MeshStandardMaterial({
            color: def.color, roughness: 0.85, metalness: 0.05,
            map: def.bands ? bandTexture(def.bands) : (def.specks ? speckTexture(def.color, def.specks) : null)
          })
        );
        mesh.position.x = def.dist;
        orbit.add(mesh);
        // 轨道线
        const line = new T.LineLoop(
          orbitGeo(),
          new T.LineBasicMaterial({ color: 0x9a8fe0, transparent: true, opacity: 0.16 })
        );
        line.scale.setScalar(def.dist);
        orbit.add(line);
        // 土星环
        if (def.ring) {
          const ring = new T.Mesh(
            new T.RingGeometry(def.ring.inner, def.ring.outer, 72),
            new T.MeshBasicMaterial({ color: def.ring.color, side: T.DoubleSide, transparent: true, opacity: 0.55, depthWrite: false })
          );
          ring.rotation.x = Math.PI / 2.35;
          ring.position.x = def.dist;
          mesh.add(ring);
        }
        orbitGroup.add(orbit);
        pickables.push(mesh);
        planets.push({ def, mesh, orbit });
      });

      // 小行星带（火星与木星之间，Points 环带）
      const belt = (() => {
        const n = lowPower ? 300 : 700;
        const pos = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2;
          const r = 7.1 + (Math.random() - 0.5) * 1.3;
          const y = (Math.random() - 0.5) * 0.42;
          pos[i * 3] = Math.cos(a) * r;
          pos[i * 3 + 1] = y;
          pos[i * 3 + 2] = Math.sin(a) * r;
        }
        const g = new T.BufferGeometry();
        g.setAttribute('position', new T.BufferAttribute(pos, 3));
        return new T.Points(g, new T.PointsMaterial({
          color: 0xc9bfe8, size: 0.05, transparent: true, opacity: 0.7,
          depthWrite: false, sizeAttenuation: true
        }));
      })();
      orbitGroup.add(belt);

      scene.add(orbitGroup);

      /* ---------- 交互状态 ---------- */
      let yaw = 0.4, pitch = 0.42, dist = 16.5;
      let yawVel = 0, pitchVel = 0;
      let dragging = false, lastX = 0, lastY = 0, moved = 0;
      let hovered = null, focused = null;   // planet runtime ref
      const camTarget = new T.Vector3(0, 0, 0);
      const focusTarget = new T.Vector3(0, 0, 0);

      // 行星铭牌：若 HTML 未提供则动态创建（挂在 stage 内，绝对定位）
      let tooltip = document.getElementById('labTooltip');
      if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'labTooltip';
        tooltip.className = 'lab__tooltip';
        tooltip.setAttribute('aria-hidden', 'true');
        (canvas.parentElement || document.body).appendChild(tooltip);
      }
      const showTooltip = (p) => {
        if (!tooltip) return;
        const l = lang();
        tooltip.innerHTML = '<b>' + p.def.name[l] + '</b><span>' + p.def.fact[l] + '</span>';
        tooltip.classList.add('is-on');
        const world = new T.Vector3();
        p.mesh.getWorldPosition(world);
        const v = world.clone().project(camera);
        const r = canvas.getBoundingClientRect();
        let x = (v.x * 0.5 + 0.5) * r.width + 14;
        let y = (-v.y * 0.5 + 0.5) * r.height - 8;
        x = Math.min(Math.max(x, 12), r.width - tooltip.offsetWidth - 12);
        y = Math.min(Math.max(y, 12), r.height - tooltip.offsetHeight - 12);
        tooltip.style.transform = 'translate(' + x.toFixed(0) + 'px,' + y.toFixed(0) + 'px)';
      };
      const hideTooltip = () => { if (tooltip) tooltip.classList.remove('is-on'); };

      const raycaster = new T.Raycaster();
      const ndc = new T.Vector2();
      const pick = (e) => {
        const r = canvas.getBoundingClientRect();
        ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
        ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
        raycaster.setFromCamera(ndc, camera);
        const hits = raycaster.intersectObjects(pickables, false);
        return hits.length ? hits[0].object : null;
      };
      const applyHighlight = (p, on) => {
        if (!p || p.def.key === 'sun') return;
        p.mesh.material.emissive = new T.Color(on ? 0x6b56d3 : 0x000000);
        p.mesh.material.emissiveIntensity = on ? 0.55 : 0;
      };
      const setHover = (p) => {
        if (hovered === p) return;
        if (hovered) applyHighlight(hovered, false);
        hovered = p;
        if (p) { applyHighlight(p, true); showTooltip(p); }
        else hideTooltip();
      };
      const setFocus = (p) => {
        focused = p;
        hideTooltip();
        if (p && tooltip) { showTooltip(p); }
      };

      canvas.addEventListener('pointerdown', (e) => {
        dragging = true; moved = 0;
        lastX = e.clientX; lastY = e.clientY;
        canvas.setPointerCapture(e.pointerId);
      });
      canvas.addEventListener('pointermove', (e) => {
        if (dragging) {
          const dx = e.clientX - lastX, dy = e.clientY - lastY;
          lastX = e.clientX; lastY = e.clientY;
          moved += Math.abs(dx) + Math.abs(dy);
          // 1:1 跟手：直接转动相机，同时记录速度供松手惯性滑行
          yaw -= dx * 0.0045;
          pitch += dy * 0.0032;
          yawVel = -dx * 0.0045;
          pitchVel = dy * 0.0032;
        } else {
          const hit = pick(e);
          setHover(hit ? planets.find((p) => p.mesh === hit) || null : null);
        }
      });
      const endDrag = (e) => {
        if (!dragging) return;
        dragging = false;
        if (moved < 6) { // 视为点击：锁定跟随 / 复位
          const hit = pick(e);
          const p = hit ? planets.find((pp) => pp.mesh === hit) : null;
          setFocus(p);
        }
      };
      canvas.addEventListener('pointerup', endDrag);
      canvas.addEventListener('pointercancel', endDrag);
      canvas.addEventListener('pointerleave', () => { if (!dragging) setHover(null); });
      canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        dist = Math.min(26, Math.max(7, dist + e.deltaY * 0.012));
      }, { passive: false });

      /* ---------- 帧循环 ---------- */
      const mkVec = () => new T.Vector3();
      let running = false, inView = false, rafId = 0, frame = 0, rendered = false;
      let lastT = 0;
      const tick = (t) => {
        if (!running) return;
        const dt = lastT ? Math.min((t - lastT) / 1000, 0.05) : 0.016;
        lastT = t;

        // 相机：拖动惯性 + 空闲缓慢漂移（与刷新率无关，按 dt 积分）
        if (!dragging) {
          yaw += (yawVel + 0.05) * dt;   // 0.05 rad/s 慢漂 + 惯性
          pitch += pitchVel * dt;
        }
        const damp = Math.pow(0.0016, dt); // 每秒衰减到 0.16%：约 0.9^60
        yawVel *= damp; pitchVel *= damp;
        pitch = Math.min(1.32, Math.max(0.06, pitch));

        // 公转
        planets.forEach((p) => {
          if (p.orbit) p.orbit.rotation.y += p.def.speed * dt;
          if (p.mesh) p.mesh.rotation.y += 0.25 * dt;
        });
        sunRef.mesh.rotation.y += 0.1 * dt;
        orbitGroup.rotation.y += 0.025 * dt; // 极缓慢整体自旋（星野相对运动）
        stars.rotation.y += 0.012 * dt;

        // 相机目标：锁定行星则跟随其世界坐标
        const target = focused ? focused.mesh.getWorldPosition(mkVec()) : focusTarget.set(0, 0, 0);
        camTarget.lerp(target, 0.08);
        camera.position.set(
          camTarget.x + dist * Math.cos(pitch) * Math.cos(yaw),
          camTarget.y + dist * Math.sin(pitch),
          camTarget.z + dist * Math.cos(pitch) * Math.sin(yaw)
        );
        camera.lookAt(camTarget);

        // 悬停铭牌跟随（行星在动）
        if (hovered && !dragging && tooltip && tooltip.classList.contains('is-on')) showTooltip(hovered);

        if ((frame++ & 1) === 0) {
          renderer.render(scene, camera);
          if (!rendered) { rendered = true; canvas.classList.add('is-on'); }
        }
        rafId = requestAnimationFrame(tick);
      };
      const setRunning = (on) => {
        const want = on && inView && !document.hidden;
        if (want === running) return;
        running = want;
        lastT = 0; // 重置时间基准，避免恢复瞬间大步长跳变
        if (running) rafId = requestAnimationFrame(tick);
        else cancelAnimationFrame(rafId);
      };

      canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        running = false; cancelAnimationFrame(rafId);
        canvas.classList.remove('is-on');
      }, false);
      canvas.addEventListener('webglcontextrestored', () => { resize(); frame = 0; setRunning(true); }, false);

      const resize = () => {
        const w = canvas.clientWidth || 300, h = canvas.clientHeight || 300;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      resize();
      window.addEventListener('resize', () => {
        clearTimeout(resize.t);
        resize.t = setTimeout(resize, 200);
      });

      new IntersectionObserver((en) => {
        inView = en[0].isIntersecting;
        setRunning(true);
      }, { rootMargin: '120px' }).observe(canvas);
      document.addEventListener('visibilitychange', () => setRunning(true));

      /* ---------- 主题联动 ---------- */
      document.addEventListener('f8k-theme', () => {
        V = readVars();
        rim.color.setHex(V.mint);
        sunRef.mesh.material.color.setHex(PLANETS[0].color);
        glow.material.color.setHex(V.sun);
        sunLight.color.setHex(0xfff3d6);
        spaceBg.material.uniforms.uMid.value.setHex(V.accent);
        spaceBg.material.uniforms.uTop.value.set(new T.Color('#0b0918'));
        spaceBg.material.uniforms.uBot.value.set(new T.Color('#2a1d4d'));
      });

      /* ---------- 语言切换：刷新铭牌 ---------- */
      document.addEventListener('f8k-lang', () => {
        if (hovered && tooltip && tooltip.classList.contains('is-on')) showTooltip(hovered);
        else if (focused && tooltip) { /* 聚焦态下一帧重新定位 */ setTimeout(() => { if (focused) showTooltip(focused); }, 60); }
      });

      window.__f8kLab = true; // 调试验证标记
    } catch (e) { /* WebGL 不可用则静默跳过 */ }
  }
})();
