/* LUMEN VIOLA — iridescent petal field + cursor wind + click shockwave */
(function () {
  'use strict';
  if (!window.THREE) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const canvas = document.getElementById('petalWebGL');
  if (!canvas) return;

  const THREE = window.THREE;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
  camera.position.z = 26;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);

  const isMobile = window.innerWidth < 720;
  const COUNT = isMobile ? 140 : 320;

  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(COUNT * 3);
  const velocities = new Float32Array(COUNT * 3);
  const scales = new Float32Array(COUNT);
  const phases = new Float32Array(COUNT);
  const speeds = new Float32Array(COUNT);
  const hues = new Float32Array(COUNT);
  const spins = new Float32Array(COUNT);

  for (let i = 0; i < COUNT; i++) {
    positions[i * 3 + 0] = (Math.random() - 0.5) * 64;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 42;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 32;
    velocities[i * 3 + 0] = 0;
    velocities[i * 3 + 1] = 0;
    velocities[i * 3 + 2] = 0;
    scales[i] = 0.45 + Math.random() * 1.7;
    phases[i] = Math.random() * Math.PI * 2;
    speeds[i] = 0.12 + Math.random() * 0.55;
    hues[i] = Math.random();
    spins[i] = (Math.random() - 0.5) * 2.4;
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
  geometry.setAttribute('aHue', new THREE.BufferAttribute(hues, 1));
  geometry.setAttribute('aSpin', new THREE.BufferAttribute(spins, 1));

  const uniforms = {
    uTime: { value: 0 },
    uPixelRatio: { value: renderer.getPixelRatio() },
    uScroll: { value: 0 },
  };

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms,
    vertexShader: `
      attribute float aScale;
      attribute float aPhase;
      attribute float aSpeed;
      attribute float aHue;
      attribute float aSpin;
      uniform float uTime;
      uniform float uPixelRatio;
      uniform float uScroll;
      varying float vHue;
      varying float vFade;
      varying float vTwist;
      void main() {
        vec3 p = position;
        float t = uTime * aSpeed;
        // gentle breathing drift
        p.x += sin(t + aPhase) * 1.6 + cos(t * 0.35 + aPhase) * 0.5;
        p.y += cos(t * 0.8 + aPhase * 1.3) * 1.1 + sin(t * 0.22) * 0.35 + uScroll * 4.0;
        p.z += sin(t * 0.5 + aPhase) * 0.9;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float size = aScale * 46.0 * uPixelRatio;
        gl_PointSize = size / max(1.0, -mv.z);
        vHue = aHue;
        vTwist = sin(t * 1.4 + aPhase) * 0.5 + 0.5;
        vFade = smoothstep(70.0, 6.0, -mv.z);
      }
    `,
    fragmentShader: `
      varying float vHue;
      varying float vFade;
      varying float vTwist;
      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        // petal silhouette — elongated ellipse with soft tip
        float ang = atan(uv.y, uv.x);
        float r = length(vec2(uv.x * (1.2 + vTwist * 0.4), uv.y * 0.72));
        float alpha = smoothstep(0.48, 0.06, r);
        // vein fold shading
        float fold = abs(sin(ang * 2.0 + vTwist * 3.14));
        alpha *= 0.75 + fold * 0.25;
        // iridescent palette: violet → orchid → lilac → signal glint
        vec3 c1 = vec3(0.42, 0.28, 0.96);
        vec3 c2 = vec3(0.91, 0.47, 0.98);
        vec3 c3 = vec3(0.77, 0.71, 0.99);
        vec3 c4 = vec3(0.40, 0.91, 0.98); // signal
        vec3 col = mix(c1, c2, smoothstep(0.0, 0.45, vHue));
        col = mix(col, c3, smoothstep(0.45, 0.78, vHue));
        col = mix(col, c4, smoothstep(0.88, 1.0, vHue) * 0.55);
        float glow = smoothstep(0.4, 0.0, r) * 0.4;
        col += glow * vec3(0.7, 0.5, 1.0);
        gl_FragColor = vec4(col, alpha * vFade * 0.88);
        if (gl_FragColor.a < 0.012) discard;
      }
    `,
  });

  const points = new THREE.Points(geometry, material);
  scene.add(points);

  // soft volumetric orbs
  const orbGeo = new THREE.BufferGeometry();
  const ORBS = isMobile ? 5 : 9;
  const orbPos = new Float32Array(ORBS * 3);
  const orbScale = new Float32Array(ORBS);
  for (let i = 0; i < ORBS; i++) {
    orbPos[i * 3 + 0] = (Math.random() - 0.5) * 52;
    orbPos[i * 3 + 1] = (Math.random() - 0.5) * 32;
    orbPos[i * 3 + 2] = -10 - Math.random() * 14;
    orbScale[i] = 9 + Math.random() * 16;
  }
  orbGeo.setAttribute('position', new THREE.BufferAttribute(orbPos, 3));
  orbGeo.setAttribute('aScale', new THREE.BufferAttribute(orbScale, 1));
  const orbMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uPixelRatio: { value: renderer.getPixelRatio() } },
    vertexShader: `
      attribute float aScale;
      uniform float uPixelRatio;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aScale * 95.0 * uPixelRatio / max(1.0, -mv.z);
      }
    `,
    fragmentShader: `
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * 0.085;
        gl_FragColor = vec4(0.52, 0.32, 0.95, a);
      }
    `,
  });
  scene.add(new THREE.Points(orbGeo, orbMat));

  /* —— hero centerpiece: procedural violet bloom (the 3D protagonist) —— */
  const bloomUniforms = { uOpen: { value: 0 }, uTime: uniforms.uTime };
  const petalMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: bloomUniforms,
    vertexShader: `
      varying vec2 vUv;
      uniform float uTime;
      void main() {
        vUv = uv;
        vec3 p = position;
        p.z += sin(uTime * 1.3 + uv.y * 3.2 + uv.x * 4.0) * 0.14 * uv.y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float uOpen;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(vec2(p.x * 2.35, (p.y - 0.1) * 1.05));
        float body = smoothstep(0.95, 0.42, r);
        float vein = 0.78 + 0.22 * abs(sin(vUv.x * 24.0));
        float edge = (1.0 - smoothstep(0.35, 0.9, r)) * smoothstep(0.55, 0.9, r);
        vec3 c1 = vec3(0.38, 0.24, 0.94);
        vec3 c2 = vec3(0.90, 0.46, 0.98);
        vec3 col = mix(c1, c2, vUv.y);
        col += edge * vec3(0.5, 0.36, 0.9);
        float a = body * vein * (0.55 + edge * 0.45) * 0.85 * uOpen;
        if (a < 0.01) discard;
        gl_FragColor = vec4(col, a);
      }
    `,
  });
  const bloom = new THREE.Group();
  const petalGeo = new THREE.PlaneGeometry(2.6, 4.2);
  petalGeo.translate(0, 2.1, 0);
  for (let ring = 0; ring < 2; ring++) {
    const n = ring ? 6 : 8;
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(petalGeo, petalMat);
      const a = (i / n) * Math.PI * 2 + ring * 0.42;
      m.rotation.order = 'ZXY';
      m.rotation.z = a - Math.PI / 2;
      m.rotation.x = ring ? 0.58 : 0.24;
      m.position.z = ring * 0.4;
      m.scale.setScalar(ring ? 0.66 : 1);
      bloom.add(m);
    }
  }
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 24, 24),
    new THREE.MeshBasicMaterial({ color: 0xf0e2ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(1.7, 24, 24),
    new THREE.MeshBasicMaterial({ color: 0x8b5cf6, transparent: true, opacity: 0.09, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  bloom.add(core, halo);
  const bloomBase = { x: isMobile ? 0 : 11.5, y: isMobile ? -9 : 2.4, z: isMobile ? -8 : -3.5 };
  const bloomScale = isMobile ? 1.15 : 1.55;
  bloom.position.set(bloomBase.x, bloomBase.y, bloomBase.z);
  bloom.scale.setScalar(0.001);
  scene.add(bloom);
  let openT = 0;
  let openTarget = 0;

  // light theme needs normal blending — additive light on a bright page is invisible
  // dark theme: additive glow WITHOUT letting the canvas alpha accumulate — three's
  // AdditiveBlending saturates alpha to 1, and premultiplied compositing then reads white.
  const blendMats = [material, orbMat, petalMat, core.material, halo.material];
  function applyBlend(light) {
    for (let i = 0; i < blendMats.length; i++) {
      const m = blendMats[i];
      if (light) {
        m.blending = THREE.NormalBlending;
      } else {
        m.blending = THREE.CustomBlending;
        m.blendEquation = THREE.AddEquation;
        m.blendSrc = THREE.SrcAlphaFactor;
        m.blendDst = THREE.OneFactor;
        m.blendEquationAlpha = THREE.AddEquation;
        m.blendSrcAlpha = THREE.ZeroFactor;
        m.blendDstAlpha = THREE.OneFactor;
      }
      m.needsUpdate = true;
    }
  }
  applyBlend(document.documentElement.getAttribute('data-theme') === 'light');
  window.addEventListener('vn:theme', (e) => applyBlend(e.detail && e.detail.theme === 'light'));

  // pointer wind in world-ish space
  let targetX = 0;
  let targetY = 0;
  let mouseX = 0;
  let mouseY = 0;
  let pointerWorldX = 0;
  let pointerWorldY = 0;
  let windStrength = 0;
  let shock = 0;
  let shockX = 0;
  let shockY = 0;
  let running = true;
  let raf = 0;
  let frames = 0;
  let fpsLast = performance.now();
  const clock = new THREE.Clock();
  const posAttr = geometry.getAttribute('position');
  const velAttr = new THREE.BufferAttribute(new Float32Array(velocities), 3);

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    uniforms.uPixelRatio.value = renderer.getPixelRatio();
  }

  function onPointer(e) {
    const x = e.clientX / window.innerWidth;
    const y = e.clientY / window.innerHeight;
    targetX = (x - 0.5) * 4;
    targetY = (y - 0.5) * 2;
    // map to scene plane roughly matching camera at z=0
    const aspect = camera.aspect;
    pointerWorldX = (x - 0.5) * 36 * aspect;
    pointerWorldY = (0.5 - y) * 24;
    windStrength = 1;
  }

  function onClick(e) {
    // ignore clicks on interactive UI
    const t = e.target;
    if (t && t.closest && t.closest('a, button, .header, .btn')) return;
    const x = e.clientX / window.innerWidth;
    const y = e.clientY / window.innerHeight;
    const aspect = camera.aspect;
    shockX = (x - 0.5) * 36 * aspect;
    shockY = (0.5 - y) * 24;
    shock = 1;
  }

  function applyForces(dt) {
    const arr = posAttr.array;
    const vel = velAttr.array;
    const damp = Math.pow(0.92, dt * 60);
    const px = pointerWorldX;
    const py = pointerWorldY;
    const s = shock;
    for (let i = 0; i < COUNT; i++) {
      const i3 = i * 3;
      let x = arr[i3];
      let y = arr[i3 + 1];
      let z = arr[i3 + 2];

      // cursor wind: radial push + swirl
      if (windStrength > 0.01) {
        const dx = x - px;
        const dy = y - py;
        const dist = Math.sqrt(dx * dx + dy * dy) + 0.001;
        if (dist < 14) {
          const fall = 1 - dist / 14;
          const force = fall * fall * 18 * windStrength;
          vel[i3] += (dx / dist) * force * dt;
          vel[i3 + 1] += (dy / dist) * force * dt;
          // tangential swirl
          vel[i3] += (-dy / dist) * force * 0.45 * dt;
          vel[i3 + 1] += (dx / dist) * force * 0.45 * dt;
        }
      }

      // click shockwave
      if (s > 0.01) {
        const dx = x - shockX;
        const dy = y - shockY;
        const dist = Math.sqrt(dx * dx + dy * dy) + 0.001;
        if (dist < 18) {
          const fall = 1 - dist / 18;
          const force = fall * 90 * s;
          vel[i3] += (dx / dist) * force * dt;
          vel[i3 + 1] += (dy / dist) * force * dt;
        }
      }

      vel[i3] *= damp;
      vel[i3 + 1] *= damp;
      vel[i3 + 2] *= damp;

      arr[i3] = x + vel[i3] * dt;
      arr[i3 + 1] = y + vel[i3 + 1] * dt;
      arr[i3 + 2] = z + vel[i3 + 2] * dt;
    }
    posAttr.needsUpdate = true;
  }

  const hudPointer = document.getElementById('hudPointer');
  const hudFps = document.getElementById('hudFps');

  function tick() {
    if (!running) return;
    const dt = Math.min(0.033, clock.getDelta());
    const t = clock.getElapsedTime();
    uniforms.uTime.value = t;

    windStrength *= 0.96;
    shock *= 0.9;
    mouseX += (targetX - mouseX) * 0.045;
    mouseY += (targetY - mouseY) * 0.045;

    if (!isMobile) applyForces(dt);

    points.rotation.y = mouseX * 0.07;
    points.rotation.x = mouseY * 0.04;
    camera.position.x = mouseX * 0.55;
    camera.position.y = -mouseY * 0.35;
    camera.lookAt(0, 0, 0);

    openT += (openTarget - openT) * Math.min(1, dt * 2.4);
    bloomUniforms.uOpen.value = openT;
    bloom.rotation.z = Math.sin(t * 0.16) * 0.12 - mouseX * 0.16;
    bloom.rotation.x = 0.42 - mouseY * 0.1;
    bloom.rotation.y = Math.sin(t * 0.12) * 0.5;
    bloom.position.y = bloomBase.y + Math.sin(t * 0.55) * 0.35;
    bloom.scale.setScalar(bloomScale * (0.25 + openT * 0.75) * (1 + Math.sin(t * 0.8) * 0.02));
    core.scale.setScalar(0.95 + Math.sin(t * 2.2) * 0.08);

    renderer.render(scene, camera);

    frames++;
    const now = performance.now();
    if (now - fpsLast > 500) {
      const fps = Math.round((frames * 1000) / (now - fpsLast));
      if (hudFps) hudFps.textContent = fps + ' FPS';
      if (hudPointer) {
        const px = Math.round(((pointerWorldX + 18) / 36) * 9999);
        const py = Math.round(((12 - pointerWorldY) / 24) * 9999);
        hudPointer.textContent =
          'X ' + String(px).padStart(4, '0') + ' · Y ' + String(py).padStart(4, '0');
      }
      frames = 0;
      fpsLast = now;
    }
    raf = requestAnimationFrame(tick);
  }

  function start() {
    if (running && raf) return;
    running = true;
    clock.start();
    raf = requestAnimationFrame(tick);
  }
  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function openBloom() {
    openTarget = 1;
    shock = 0.8;
    shockX = bloomBase.x * 0.6;
    shockY = bloomBase.y;
  }
  window.addEventListener('vn:ready', openBloom);
  setTimeout(openBloom, 4200);

  resize();
  start();
  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('pointermove', onPointer, { passive: true });
  window.addEventListener('pointerdown', onClick, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else start();
  });

  if ('IntersectionObserver' in window) {
    const hero = document.getElementById('hero');
    if (hero) {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((en) => {
            if (en.isIntersecting) start();
            else stop();
          });
        },
        { threshold: 0.04 }
      );
      io.observe(hero);
    }
  }

  window.__vnPetal = {
    bloom: openBloom,
    setScroll(p) {
      uniforms.uScroll.value = p;
      points.position.y = p * 5;
      points.rotation.z = p * 0.12;
    },
  };
})();
