/* =========================================================
   F8K® — 首屏 3D 几何体（Three.js，本地 vendor）
   监听 f8k-idle 懒启动；离屏 / 后台 / 上下文丢失均自动暂停与恢复
   ========================================================= */
(() => {
  'use strict';

  const canvas = document.getElementById('heroCanvas');
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
    // 与 lab3d.js 共享同一次 three.js 加载（避免双实例）
    window.__f8kThree = window.__f8kThree || loadScript('assets/vendor/three.min.js');
    window.__f8kThree.then(init).catch(() => { /* 静默放弃 3D */ });
  }, { once: true });

  function init() {
    if (!window.THREE) return;
    const T = window.THREE;
    try {
      const doc = document.documentElement;
      const readAccent = () =>
        getComputedStyle(doc).getPropertyValue('--accent').trim() || '#2c43f5';

      const renderer = new T.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: false, // 高 DPR 已足够平滑，关 AA 省 GPU
        powerPreference: 'low-power'
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

      const scene = new T.Scene();
      const camera = new T.PerspectiveCamera(42, 1, 0.1, 50);
      camera.position.z = 6.2;

      const group = new T.Group();
      const accent = readAccent();
      const geo = new T.IcosahedronGeometry(1.75, 0);
      const wireMat = new T.MeshBasicMaterial({ color: accent, wireframe: true, transparent: true, opacity: 0.9 });
      group.add(new T.Mesh(geo, wireMat));

      // 顶点圆点 —— 呼应品牌标志的"双点"语言
      const posAttr = geo.attributes.position;
      const seen = new Set();
      const dotGeo = new T.SphereGeometry(0.085, 10, 8);
      const dotMat = new T.MeshBasicMaterial({ color: accent });
      for (let i = 0; i < posAttr.count; i++) {
        const x = posAttr.getX(i), y = posAttr.getY(i), z = posAttr.getZ(i);
        const key = x.toFixed(2) + ',' + y.toFixed(2) + ',' + z.toFixed(2);
        if (seen.has(key)) continue;
        seen.add(key);
        const m = new T.Mesh(dotGeo, dotMat);
        m.position.set(x, y, z);
        group.add(m);
      }
      scene.add(group);

      document.addEventListener('f8k-theme', () => {
        const c = readAccent();
        wireMat.color.set(c);
        dotMat.color.set(c);
      });

      const resize = () => {
        const s = canvas.clientWidth || 300;
        renderer.setSize(s, s, false);
      };
      resize();
      let hRsz;
      window.addEventListener('resize', () => {
        clearTimeout(hRsz);
        hRsz = setTimeout(resize, 200); // 防抖：等窗口稳定再改画布尺寸
      });

      let running = false, inView = true, rafId = 0;
      let mx = 0, my = 0, rx = 0, ry = 0, frame = 0, rendered = false;
      const tick = (t) => {
        if (!running) return;
        ry += (my * 0.35 - ry) * 0.04;
        rx += (mx * 0.25 - rx) * 0.04;
        group.rotation.y = t * 0.00022 + ry;
        group.rotation.x = rx + Math.sin(t * 0.0005) * 0.12;
        group.position.y = Math.sin(t * 0.0011) * 0.12;
        // 慢速旋转的线框 30fps 足够，隔帧渲染省一半 GPU；首帧后淡入避免突兀弹出
        if ((frame++ & 1) === 0) {
          renderer.render(scene, camera);
          if (!rendered) {
            rendered = true;
            canvas.classList.add('is-on');
          }
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

      // GPU 重置自愈：上下文丢失即暂停，恢复后继续渲染
      canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        running = false;
        cancelAnimationFrame(rafId);
        canvas.classList.remove('is-on');
      }, false);
      canvas.addEventListener('webglcontextrestored', () => {
        resize();
        frame = 0;
        setRunning(true);
      }, false);

      new IntersectionObserver((en) => {
        inView = en[0].isIntersecting;
        setRunning(true);
      }, { rootMargin: '80px' }).observe(canvas);
      document.addEventListener('visibilitychange', () => setRunning(true));
      window.addEventListener('mousemove', (e) => {
        mx = (e.clientX / window.innerWidth) * 2 - 1;
        my = (e.clientY / window.innerHeight) * 2 - 1;
      }, { passive: true });

      window.__f8k3d = true; // 调试验证标记
    } catch (e) { /* WebGL 不可用则静默跳过 */ }
  }
})();
