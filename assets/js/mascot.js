/* =========================================================
   F8K® — Live2D 吉祥物（真实模型版）
   —— 默认加载 Live2D 官方免费示例角色「Haru（受付スーツ）」，
      Cubism 4（.model3.json），由 pixi-live2d-display 0.4.0 驱动。
   行为（全部来自插件内置能力，稳定无自写交互）：
     · 自动待机动作 + 眨眼（MotionManager / EyeBlink）
     · 视线跟随指针（autoInteract → focus）
     · 点击点按触发「Tap」动作（autoInteract → tap → hit → motion('Tap')）
     · 离屏 / 后台暂停渲染；DPR 分级；reduced-motion 直接隐藏
   可替换模型：覆盖 window.F8K_LIVE2D_MODEL 为任意公开授权的
   .model3.json（Cubism 3/4）。Cubism 2.1（.model.json）需额外
   提供 live2d.min.js 运行时（本文件默认仅载 Cubism 4 核心）。
   任何一步失败都静默隐藏，绝不弹错、不阻塞首屏。
   ========================================================= */
(() => {
  'use strict';

  const host = document.getElementById('mascot');
  if (!host) return;
  const canvas = document.getElementById('mascotCanvas');
  const closeBtn = document.getElementById('mascotClose');

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const CFG = Object.assign({
    model: 'https://cdn.jsdelivr.net/gh/guansss/pixi-live2d-display@0.4.0/test/assets/haru/haru_greeter_t03.model3.json',
    pixi: 'https://cdn.jsdelivr.net/npm/pixi.js@6.5.10/dist/browser/pixi.min.js',
    core: 'https://cdn.jsdelivr.net/npm/live2dcubismcore@1.0.2/live2dcubismcore.min.js',
    coreFallback: 'https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js',
    // 仅 Cubism 4 子包：只依赖 live2dcubismcore，无需 Cubism 2 的 live2d.min.js
    plugin: 'https://cdn.jsdelivr.net/npm/pixi-live2d-display@0.4.0/dist/cubism4.min.js'
  }, window.F8K_LIVE2D_CONFIG || {});
  const modelUrl = window.F8K_LIVE2D_MODEL || CFG.model;

  const hide = () => {
    host.classList.remove('is-live');
    host.setAttribute('aria-hidden', 'true');
  };
  const fail = (e) => {
    hide();
    if (window.console) console.warn('Live2D companion unavailable:', e && e.message ? e.message : e);
  };

  if (reduced || !('WebGLRenderingContext' in window) || window.F8K_LIVE2D_DISABLED) return hide();

  const loadScript = (src) => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error('failed to load ' + src));
    document.head.appendChild(s);
  });
  const loadCore = () => loadScript(CFG.core).catch(() => loadScript(CFG.coreFallback));

  let app = null, model = null;
  let raf = null, visible = false, destroyed = false;

  const fitModel = (w, h) => {
    if (!model || !model.width || !model.height) return;
    const scale = Math.min(w / model.width, h / model.height) * 0.96;
    model.scale.set(scale);
    model.anchor.set(0.5, 1);          // 底部居中，贴合吉祥物窗口
    model.position.set(w / 2, h);
  };
  const resize = () => {
    if (!app) return;
    const w = host.clientWidth || 180, h = host.clientHeight || 220;
    app.renderer.resize(w, h);
    fitModel(w, h);
  };

  const loop = () => {
    if (!visible || destroyed) { raf = null; return; }
    // Ticker.shared.update() 同时驱动：插件 onTickerUpdate（模型更新）+ 应用渲染
    app.ticker.update();
    app.render();
    raf = requestAnimationFrame(loop);
  };
  const setRunning = (on) => {
    visible = on;
    if (on) { if (!raf) raf = requestAnimationFrame(loop); }
    else if (raf) { cancelAnimationFrame(raf); raf = null; }
  };

  const boot = async () => {
    if (!window.PIXI) await loadScript(CFG.pixi);
    if (!window.PIXI) throw new Error('PIXI not ready');
    if (!window.Live2DCubismCore) await loadCore();
    if (!window.PIXI.live2d) await loadScript(CFG.plugin);
    const L2D = window.PIXI.live2d;
    if (!L2D || !L2D.Live2DModel) throw new Error('pixi-live2d-display not ready');
    if (!window.Live2DCubismCore) throw new Error('Live2DCubismCore not ready');
    if (L2D.config) L2D.config.sound = false; // 站内吉祥物不发出声音

    const w = host.clientWidth || 180, h = host.clientHeight || 220;
    app = new window.PIXI.Application({
      view: canvas,
      width: w,
      height: h,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      backgroundAlpha: 0,
      autoStart: false
    });

    // autoUpdate / autoInteract 均为插件默认（true）：自动待机 + 视线跟随 + 点击命中
    model = await L2D.Live2DModel.from(modelUrl, { autoUpdate: true, autoInteract: true });
    app.stage.addChild(model);
    fitModel(w, h);

    if (typeof model.on === 'function') {
      model.on('hit', () => { try { model.motion('Tap'); } catch (e) { /* 无 Tap 组则忽略 */ } });
    }

    host.classList.add('is-live');
    host.setAttribute('aria-hidden', 'false');
    setRunning(true);

    window.addEventListener('resize', () => { clearTimeout(resize.t); resize.t = setTimeout(resize, 200); });
    new IntersectionObserver((en) => setRunning(en[0].isIntersecting), { threshold: 0 }).observe(host);
    document.addEventListener('visibilitychange', () => setRunning(!document.hidden));
  };

  const teardown = () => {
    destroyed = true;
    setRunning(false);
    try { if (model) model.destroy(true); } catch (e) { /* 忽略 */ }
    try { if (app) app.destroy(true, { children: true, texture: true, baseTexture: true }); } catch (e) { /* 忽略 */ }
    hide();
  };

  if (closeBtn) closeBtn.addEventListener('click', () => { teardown(); window.F8K_LIVE2D_DISABLED = true; });

  // 懒启动：等待浏览器空闲（与 hero3d / playground 同节奏），兜底 3s 超时
  let started = false;
  const start = () => { if (started) return; started = true; boot().catch(fail); };
  document.addEventListener('f8k-idle', start, { once: true });
  setTimeout(start, 3000);
})();
