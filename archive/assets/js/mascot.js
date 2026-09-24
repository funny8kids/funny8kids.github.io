/* Live2D 吉祥物（骨架版）
   —— 需要你准备两样东西才会点亮：
      1) 一只拥有公开/商用授权的 Live2D 模型（.model3.json / .moc3 + 贴图）
      2) 把模型地址配到 window.F8K_LIVE2D_MODEL（或用下方默认 CDN 地址）
   未配置 / 加载失败 / prefers-reduced-motion 时整体隐藏，绝不弹错，也不拖累首屏。
   运行时会从 CDN 动态拉取（PIXI + pixi-live2d-display + Cubism 5 运行时），请确保模型授权允许本用法。 */
(function () {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const host = document.getElementById('mascot');
  if (!host) return;

  const modelUrl = window.F8K_LIVE2D_MODEL || '';
  const RUNTIME = window.F8K_LIVE2D_RUNTIME || 'https://cdn.jsdelivr.net/npm/pixi-live2d-display@0.4.0';

  // 任何一步失败都静默收起；没有模型时默认保持隐藏（这是页面的常态）
  const hide = () => {
    host.classList.remove('is-live');
    host.setAttribute('aria-hidden', 'true');
  };
  const fail = (e) => {
    hide();
    // eslint-disable-next-line no-console
    if (window.console) console.warn('Live2D companion unavailable:', e && e.message ? e.message : e);
  };

  // 骨架前置条件：必须有模型地址、非 reduced-motion、且浏览器不拒绝 WebGL
  if (!modelUrl || reduced || !('WebGLRenderingContext' in window)) return hide();

  const css = (src) => new Promise((res, rej) => { const s = document.createElement('link'); s.rel = 'stylesheet'; s.href = src; s.onload = res; s.onerror = () => rej(new Error('css ' + src)); document.head.appendChild(s); });
  const script = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('script ' + src)); document.head.appendChild(s); });

  const boot = async () => {
    await script(RUNTIME + '/dist/pixi-live2d-display.min.js');
    const T = window.PIXI || window.PIXI_live2d_display;
    if (!T) throw new Error('pixi-live2d-display 未就绪');
    const canvas = document.getElementById('mascotCanvas');
    if (!canvas) throw new Error('no canvas');
    let app = null;
    try {
      app = new T.Application({ view: canvas, autoStart: false, transparent: true });
    } catch (e) {
      const P = window.PIXI;
      if (!P) throw e;
      app = new P.Application({ view: canvas, autoStart: false, transparent: true });
    }
    const model = await T.Live2DModel.from(modelUrl);
    app.stage.addChild(model);
    host.classList.add('is-live');
    host.setAttribute('aria-hidden', 'false');
    document.getElementById('mascotClose').addEventListener('click', hide, { once: true });

    let raf = null;
    const tick = () => { if (app.ticker) app.ticker.update(); app.render(); raf = requestAnimationFrame(tick); };
    const toggle = (run) => { if (run) { if (!raf) raf = requestAnimationFrame(tick); } else { if (raf) { cancelAnimationFrame(raf); raf = null; } } };
    new IntersectionObserver((en) => toggle(en[0].isIntersecting), { threshold: .15 }).observe(host);
    document.addEventListener('visibilitychange', () => toggle(!document.hidden && !!host.classList.contains('is-live')));
    toggle(true);
  };

  boot().catch(fail);
})();
