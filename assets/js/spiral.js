/* ---------- 首屏右侧：黄金螺旋 + 数学几何 + AI 数据流（原生 Canvas 2D） ----------
   在 React Bits <Antigravity /> 移植基础上强化：
   A 数学纵深：真·黄金 Fibonacci 方阵 + 转角斐波那契数字 + 每节点极坐标构建线 + 实时 φ 值
   B AI 数据流：粒子沿螺旋曲线流动成光带；芯片节点连成神经网络、悬停激活脉冲
   C 反空虚：极点光核 + 同心 φ 环 + 自相似缩小回声螺旋（容器 aura 由 CSS 提供）
   与 hero3d.js 一致：仅在黄金螺旋进入视口时运行。 */
(() => {
  const root = document.querySelector('.hero__spiral');
  const canvas = document.getElementById('spiralCanvas');
  if (!root || !canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const nodes = Array.from(root.querySelectorAll('.hero__spiral-node'));

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const P = 1.6180339887;                 // 黄金比
  const B = Math.log(P) / (Math.PI / 2);  // 对数螺旋：每转过 90° 半径放大 φ 倍
  const TURNS = 1.18, THETA_MAX = TURNS * Math.PI * 2;

  let w = 0, h = 0, cx = 0, cy = 0, RMAX = 0, R0 = 0, scale = 1;
  let R = 0, raf = 0, running = false, prev = performance.now(), dt = 0;
  const nodeData = [];

  // 与左侧波浪相同的品牌渐变（蓝→薄荷→暖阳）
  const GRAD = [[44, 67, 245], [18, 183, 126], [242, 169, 59]];
  const gradCss = (t) => {
    let c;
    if (t < 0.5) {
      const k = t / 0.5;
      c = [0, 1, 2].map((j) => GRAD[0][j] + (GRAD[1][j] - GRAD[0][j]) * k);
    } else {
      const k = (t - 0.5) / 0.5;
      c = [0, 1, 2].map((j) => GRAD[1][j] + (GRAD[2][j] - GRAD[1][j]) * k);
    }
    return 'rgb(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ')';
  };

  const MONO = getComputedStyle(document.documentElement).getPropertyValue('--font-mono') ||
    "'SFMono-Regular', ui-monospace, 'Cascadia Mono', Consolas, monospace";
  // 数学衬线斜体（STIX Two Text，弧度/公式标注用，与正文小字形成"手稿"对比）
  const MATH_IT = getComputedStyle(document.documentElement).getPropertyValue('--font-math-italic') ||
    "'STIX Two Text', 'Georgia', 'Times New Roman', serif";

  const setup = () => {
    const r = root.getBoundingClientRect();
    w = Math.max(1, r.width); h = Math.max(1, r.height);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx = w / 2; cy = h / 2;
    scale = Math.min(w, h) / 500 || 1;
    RMAX = Math.min(w, h) * 0.46;
    R0 = RMAX / Math.exp(B * THETA_MAX);
    const fr = [0.16, 0.34, 0.49, 0.63, 0.77];
    nodeData.length = 0;
    nodes.forEach((el, i) => {
      const rf = fr[i % fr.length];
      const radius = rf * RMAX;
      const theta = Math.log(radius / R0) / B;
      const baseOff = Math.max(34, el.offsetWidth / 2 + 12);
      nodeData.push({ el, radius, theta, baseOff, ph: i * 1.37 });
    });
    buildFrames();
    initStream();
    initChips();
  };

  /* —— 屏幕空间帮助：局部坐标 → 屏幕坐标（绕轴心随 R 旋转） —— */
  const scr = (lx, ly, cosR, sinR) => [cx + lx * cosR - ly * sinR, cy + lx * sinR + ly * cosR];

  /* —— A：黄金 Fibonacci 方阵（真·黄金矩形分解） + 转角数字 —— */
  const FIB = [1, 1, 2, 3, 5, 8];
  let fibSquares = [], fibLabels = [], goldRect = null;
  const buildFrames = () => {
    const sum = FIB.reduce((a, b) => a + b, 0);
    const unit = RMAX / (sum + 1);
    fibSquares.length = 0; fibLabels.length = 0;
    let pen = [0, 0], x0 = 0, y0 = 0, x1 = 0, y1 = 0;
    for (let i = 0; i < FIB.length; i++) {
      const s = FIB[i] * unit;
      const a = i * Math.PI / 2;
      const d1 = [Math.cos(a), Math.sin(a)];
      const d2 = [Math.cos(a + Math.PI / 2), Math.sin(a + Math.PI / 2)];
      const c0 = [pen[0], pen[1]];
      const c1 = [pen[0] + s * d1[0], pen[1] + s * d1[1]];
      const c2 = [c1[0] + s * d2[0], c1[1] + s * d2[1]];
      const c3 = [pen[0] + s * d2[0], pen[1] + s * d2[1]];
      fibSquares.push({ c0, c1, c2, c3 });
      fibLabels.push({ x: c2[0], y: c2[1], n: FIB[i] });
      for (const p of [c0, c1, c2, c3]) {
        x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]);
        x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]);
      }
      pen = c1; // 笔移到共享角，下一块沿切线向外堆叠
    }
    goldRect = { x0, y0, x1, y1 };
  };
  /* —— 极坐标图底：同心环 + 放射线 + 度/弧度双层标注 + 黄金角射线扇 + 刻度尺（固定不旋转，作数学坐标纸） —— */
  const RAD = ['0', 'π/6', 'π/3', 'π/2', '2π/3', '5π/6', 'π', '7π/6', '4π/3', '3π/2', '5π/3', '11π/6'];
  const GA = 137.5 * Math.PI / 180; // 黄金角 ≈ 360°/φ²，向日葵叶序的"调音"角度
  const drawPolarGrid = () => {
    ctx.save();
    ctx.lineWidth = 1;
    // 同心环
    for (let k = 1; k <= 6; k++) {
      ctx.strokeStyle = 'rgba(124,139,255,.07)';
      ctx.beginPath(); ctx.arc(cx, cy, RMAX * k / 6, 0, Math.PI * 2); ctx.stroke();
    }
    // 放射线（标准数学方位：0° 右、90° 上）
    for (let deg = 0; deg < 360; deg += 30) {
      const a = deg * Math.PI / 180;
      const dx = Math.cos(a), dy = -Math.sin(a);
      ctx.strokeStyle = 'rgba(124,139,255,.05)';
      ctx.beginPath();
      ctx.moveTo(cx - dx * RMAX, cy - dy * RMAX);
      ctx.lineTo(cx + dx * RMAX, cy + dy * RMAX);
      ctx.stroke();
    }
    // 黄金角射线扇：极点向外的一组种子序射线
    for (let k = 0; k < 9; k++) {
      const a = (k * GA) % (Math.PI * 2);
      const dx = Math.cos(a), dy = -Math.sin(a);
      ctx.strokeStyle = 'rgba(124,139,255,.045)';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + dx * RMAX * 0.9, cy + dy * RMAX * 0.9);
      ctx.stroke();
    }
    // 外环刻度尺：5° 短刻 / 30° 长刻（仪表仪器感）
    for (let deg = 0; deg < 360; deg += 5) {
      const a = deg * Math.PI / 180;
      const dx = Math.cos(a), dy = -Math.sin(a);
      const big = deg % 30 === 0;
      const r0 = RMAX * 0.90, len = big ? 7 : 3;
      ctx.strokeStyle = big ? 'rgba(124,139,255,.32)' : 'rgba(124,139,255,.14)';
      ctx.beginPath();
      ctx.moveTo(cx + dx * r0, cy + dy * r0);
      ctx.lineTo(cx + dx * (r0 + len), cy + dy * (r0 + len));
      ctx.stroke();
    }
    // 角度标注：外圈度数（mono 仪器风）+ 内圈弧度（衬线斜体手稿风）
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let deg = 0; deg < 360; deg += 30) {
      const a = deg * Math.PI / 180;
      const lx = RMAX * 0.94 * Math.cos(a), ly = -RMAX * 0.94 * Math.sin(a);
      ctx.font = '9px ' + MONO;
      ctx.fillStyle = 'rgba(124,139,255,.38)';
      ctx.fillText(deg + '°', cx + lx, cy + ly);
      ctx.font = 'italic 9px ' + MATH_IT;
      ctx.fillStyle = 'rgba(124,139,255,.45)';
      ctx.fillText(RAD[deg / 30], cx + lx * 0.92, cy + ly * 0.92);
    }
    // 黄金角主射线：加亮 + 端点标注
    ctx.font = 'italic 10px ' + MATH_IT;
    ctx.fillStyle = 'rgba(124,139,255,.72)';
    ctx.strokeStyle = 'rgba(124,139,255,.5)';
    {
      const dx = Math.cos(GA), dy = -Math.sin(GA);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + dx * RMAX * 0.9, cy + dy * RMAX * 0.9);
      ctx.stroke();
      ctx.fillText('137.5°', cx + dx * RMAX * 0.965, cy + dy * RMAX * 0.965);
    }
    ctx.restore();
  };

  const drawFrames = () => {
    const cosR = Math.cos(R), sinR = Math.sin(R);
    ctx.save();
    ctx.lineJoin = 'round';
    // 外接黄金矩形：方阵整体构成一个黄金矩形，螺旋内切于其中（旋转随 R 与方阵同步）
    if (goldRect) {
      const pA = scr(goldRect.x0, goldRect.y0, cosR, sinR);
      const pB = scr(goldRect.x1, goldRect.y0, cosR, sinR);
      const pC = scr(goldRect.x1, goldRect.y1, cosR, sinR);
      const pD = scr(goldRect.x0, goldRect.y1, cosR, sinR);
      ctx.strokeStyle = 'rgba(124,139,255,.20)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pA[0], pA[1]); ctx.lineTo(pB[0], pB[1]); ctx.lineTo(pC[0], pC[1]); ctx.lineTo(pD[0], pD[1]); ctx.closePath();
      ctx.stroke();
      // 对角线，强调矩形比例
      ctx.strokeStyle = 'rgba(124,139,255,.10)';
      ctx.beginPath(); ctx.moveTo(pA[0], pA[1]); ctx.lineTo(pC[0], pC[1]); ctx.stroke();
    }
    for (const sq of fibSquares) {
      const p0 = scr(sq.c0[0], sq.c0[1], cosR, sinR);
      const p1 = scr(sq.c1[0], sq.c1[1], cosR, sinR);
      const p2 = scr(sq.c2[0], sq.c2[1], cosR, sinR);
      const p3 = scr(sq.c3[0], sq.c3[1], cosR, sinR);
      ctx.beginPath();
      ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.lineTo(p3[0], p3[1]);
      ctx.closePath();
      ctx.fillStyle = 'rgba(124,139,255,.075)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(124,139,255,.38)';
      ctx.lineWidth = 1;
      ctx.stroke();
      // 对角线微光，强调方阵自相似
      ctx.strokeStyle = 'rgba(124,139,255,.14)';
      ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
    }
    ctx.restore();
  };
  const drawFibLabels = () => {
    const cosR = Math.cos(R), sinR = Math.sin(R);
    ctx.save();
    ctx.font = '11px ' + MONO;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(58,72,168,.92)';
    for (const L of fibLabels) {
      const p = scr(L.x, L.y, cosR, sinR);
      ctx.fillText(String(L.n), p[0], p[1]);
    }
    ctx.restore();
  };

  /* —— C：极点光核 + 同心 φ 环（聚焦圆心，右列不再空虚） —— */
  const drawPole = (t) => {
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.4);
    const CR = Math.max(3, RMAX * 0.055) * (0.82 + pulse * 0.34);
    ctx.save();
    // 光核
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, CR * 3.2);
    g.addColorStop(0, gradCss(0.5));
    g.addColorStop(0.35, 'rgba(124,139,255,' + (0.16 + pulse * 0.1) + ')');
    g.addColorStop(1, 'rgba(124,139,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, CR * 3.2, 0, Math.PI * 2); ctx.fill();
    // 脉冲环
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(124,139,255,' + (0.5 + pulse * 0.3) + ')';
    ctx.beginPath(); ctx.arc(cx, cy, CR, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(124,139,255,' + (0.28 + pulse * 0.16) + ')';
    ctx.beginPath(); ctx.arc(cx, cy, CR * 1.7, 0, Math.PI * 2); ctx.stroke();
    // 同心 φ 环（虚线，读数用）
    ctx.setLineDash([2, 5]);
    for (let k = 1; k <= 4; k++) {
      const rr = RMAX * Math.pow(1 / P, k);
      ctx.strokeStyle = 'rgba(124,139,255,' + (0.14 - k * 0.025) + ')';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  };

  /* —— C：自相似回声螺旋（缩小 φ 倍、更淡） —— */
  const drawEchoes = (t) => {
    drawSpiral(t, 0.366, 0.42, 1);
    drawSpiral(t, 0.618, 0.6, 1);
  };

  /* —— 主螺旋 + 高亮游标（scaleK 用于回声缩放 R0，绕极点即自相似） —— */
  const drawSpiral = (t, scaleK, alpha, width) => {
    const cosR = Math.cos(R), sinR = Math.sin(R);
    const k = scaleK || 1;
    const a = alpha || 1;
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, gradCss(0)); g.addColorStop(0.5, gradCss(0.5)); g.addColorStop(1, gradCss(1));
    const breathe = 0.75 + 0.25 * Math.sin(t * 1.2);
    const R0k = R0 * k;
    ctx.save();
    ctx.lineWidth = width || 1.5;
    ctx.strokeStyle = g;
    ctx.shadowColor = gradCss(0.5);
    ctx.shadowBlur = (6 + breathe * 10) * a;
    ctx.globalAlpha = a * (0.55 + breathe * 0.35);
    ctx.beginPath();
    for (let th = 0; th <= THETA_MAX; th += 0.03) {
      const rr = R0k * Math.exp(B * th);
      const lx = rr * Math.cos(th), ly = rr * Math.sin(th);
      const pxx = cx + lx * cosR - ly * sinR, pyy = cy + lx * sinR + ly * cosR;
      th === 0 ? ctx.moveTo(pxx, pyy) : ctx.lineTo(pxx, pyy);
    }
    ctx.stroke();
    ctx.restore();
    if (k === 1) {
      const shim = (t * 0.6) % THETA_MAX;
      const sr = R0 * Math.exp(B * shim);
      const slx = sr * Math.cos(shim), sly = sr * Math.sin(shim);
      ctx.save();
      ctx.shadowBlur = 12 + breathe * 10;
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = gradCss(1);
      ctx.beginPath();
      ctx.arc(cx + slx * cosR - sly * sinR, cy + slx * sinR + sly * cosR, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  };

  /* —— B：粒子沿螺旋曲线流动成光带（替代原地磁环），悬停加速 + 近指针增亮 —— */
  const COUNT = window.innerWidth < 700 ? 90 : 150;
  const stream = [];
  const initStream = () => {
    stream.length = 0;
    for (let i = 0; i < COUNT; i++) {
      stream.push({
        th: Math.random() * THETA_MAX,
        speed: 0.02 + Math.random() * 0.07,
        back: Math.random() < 0.35,
        z: (Math.random() - 0.5) * 10,
        size: 0.7 + Math.random() * 1.7,
        ph: Math.random() * 100,
      });
    }
  };
  const drawStream = (t, hover) => {
    const cosR = Math.cos(R), sinR = Math.sin(R);
    ctx.save();
    ctx.lineCap = 'round';
    for (const p of stream) {
      const th = p.th;
      const rr = R0 * Math.exp(B * th);
      const lx = rr * Math.cos(th), ly = rr * Math.sin(th);
      const [x, y] = scr(lx, ly, cosR, sinR);
      // 切线方向（dθ 单位），反向即尾迹
      const drx = (B * lx - ly), dry = (B * ly + lx);
      const tdx = drx * cosR - dry * sinR, tdy = drx * sinR + dry * cosR;
      const tl = Math.hypot(tdx, tdy) || 1;
      const sx = (p.back ? 1 : -1);
      const len = (2 + p.size * 2.2) * (hover ? 1.35 : 1);
      const col = gradCss(0.18 + (th / THETA_MAX) * 0.62);
      const baseA = 0.3 + p.size * 0.16;
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(1, p.size * 1.2);
      ctx.globalAlpha = baseA;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (tdx / tl) * len * sx, y + (tdy / tl) * len * sx);
      ctx.stroke();
      // 头部亮珠（不逐粒开 shadowBlur，避免 150 次模糊拖慢帧率，靠高亮色即可）
      ctx.fillStyle = col;
      ctx.globalAlpha = baseA + 0.3;
      ctx.beginPath(); ctx.arc(x, y, Math.max(0.9, p.size * 0.7), 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  };

  /* —— A + B：节点锚点、极坐标构建线、神经连线与激活脉冲 —— */
  let chipAnchors = [];
  const initChips = () => { chipAnchors = []; };
  const computeNodePoints = (t) => {
    chipAnchors.length = 0;
    const grow = 1 + 2.2 * scat;
    for (const d of nodeData) {
      const ang = d.theta + R;
      const x = cx + d.radius * grow * Math.cos(ang) + Math.sin(t * 0.5 + d.ph) * 6;
      const y = cy + d.radius * grow * Math.sin(ang) + Math.cos(t * 0.45 + d.ph) * 5;
      chipAnchors.push({ x, y, d, ang, grow });
    }
  };
  const drawNodes = (t, hover) => {
    ctx.save();
    const cosR = Math.cos(R), sinR = Math.sin(R);
    // 极坐标构建线：轴心 → 锚点，标注半径占比（A）
    for (const n of chipAnchors) {
      ctx.strokeStyle = 'rgba(124,139,255,.16)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(n.x, n.y); ctx.stroke();
      const midx = cx + (n.x - cx) * 0.5, midy = cy + (n.y - cy) * 0.5;
      ctx.font = '9px ' + MONO;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(124,139,255,.5)';
      const ratio = (n.d.radius / RMAX).toFixed(2);
      ctx.fillText(ratio + 'R', midx, midy - 5);
    }
    // 神经连线（B）：相邻锚点相连，悬停变亮
    if (chipAnchors.length > 1) {
      ctx.lineWidth = 1;
      for (let i = 0; i < chipAnchors.length - 1; i++) {
        ctx.strokeStyle = 'rgba(124,139,255,' + (hover ? 0.4 : 0.2) + ')';
        ctx.beginPath();
        ctx.moveTo(chipAnchors[i].x, chipAnchors[i].y);
        ctx.lineTo(chipAnchors[i + 1].x, chipAnchors[i + 1].y);
        ctx.stroke();
      }
      // 激活脉冲：沿折线游走
      const segs = chipAnchors.length - 1;
      const pu = ((t * (hover ? 0.5 : 0.22)) % 1);
      const f = pu * segs;
      const i = Math.min(segs - 1, Math.floor(f));
      const fr = f - i;
      const A0 = chipAnchors[i], A1 = chipAnchors[i + 1];
      const px = A0.x + (A1.x - A0.x) * fr, py = A0.y + (A1.y - A0.y) * fr;
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = gradCss(1);
      ctx.shadowColor = gradCss(0.5); ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(px, py, 3.4, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }
    // 锚点圆点（保持原有行星漂移，随散开增长）
    for (const n of chipAnchors) {
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = gradCss(0);
      ctx.shadowColor = gradCss(0.5); ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(n.x, n.y, 3, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  };

  const placeNodes = (t) => {
    const grow = 1 + 2.2 * scat;
    for (const d of nodeData) {
      const ang = d.theta + R;
      const x = cx + d.radius * grow * Math.cos(ang) + Math.sin(t * 0.5 + d.ph) * 6;
      const y = cy + d.radius * grow * Math.sin(ang) + Math.cos(t * 0.45 + d.ph) * 5;
      const px = x + Math.cos(ang) * (d.baseOff * grow), py = y + Math.sin(ang) * (d.baseOff * grow);
      d.el.style.transform = 'translate(' + px.toFixed(1) + 'px,' + py.toFixed(1) + 'px) translate(-50%,-50%)';
    }
  };

  /* —— 交互：悬停加速 / 点击拆解重组 —— */
  let hovering = false, scat = 0, burstStart = -1;
  const onTap = () => { if (burstStart < 0) burstStart = performance.now() / 1000; };
  root.addEventListener('click', onTap);
  if (!reduce) {
    root.addEventListener('pointerenter', () => { hovering = true; });
    root.addEventListener('pointerleave', () => { hovering = false; });
  }

  const tick = (now) => {
    dt = Math.min(0.05, (now - prev) / 1000); prev = now;
    R += dt * 0.12;
    const t = now / 1000;
    if (burstStart >= 0) {
      const bt = t - burstStart;
      if (bt >= 1.4) { burstStart = -1; scat = 0; }
      else scat = bt < 0.7 ? bt / 0.7 : (1.4 - bt) / 0.7;
    } else scat = 0;
    for (const p of stream) {
      let dth = dt * p.speed * (hovering ? 3.2 : 1);
      p.th = (p.th + dth) % THETA_MAX;
      if (p.th < 0) p.th += THETA_MAX;
    }
    ctx.clearRect(0, 0, w, h);
    computeNodePoints(t);
    drawPolarGrid();
    drawFrames();
    drawPole(t);
    drawEchoes(t);
    drawSpiral(t, 1, 1, 1.5);
    drawStream(t, hovering);
    drawNodes(t, hovering);
    placeNodes(t);
    raf = requestAnimationFrame(tick);
  };
  const start = () => { if (!running) { running = true; prev = performance.now(); raf = requestAnimationFrame(tick); } };
  const stop = () => { running = false; cancelAnimationFrame(raf); };

  // 所有辅助函数（buildFrames/initStream/initChips 等）定义完毕后，再初始化布局
  setup();
  window.addEventListener('resize', setup);

  if (reduce) {
    computeNodePoints(0);
    drawPolarGrid();
    drawFrames();
    drawPole(0);
    drawEchoes(0);
    drawSpiral(0, 1, 1, 1.5);
    drawStream(0, false);
    drawNodes(0, false);
    placeNodes(0);
  } else {
    const io = new IntersectionObserver((entries) => {
      entries[0].isIntersecting ? start() : stop();
    }, { threshold: 0.25 });
    io.observe(root);
  }
})();
