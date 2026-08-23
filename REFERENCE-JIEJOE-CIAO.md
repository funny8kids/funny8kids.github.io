# 参考设计系统：JIEJOE + CIAO ENERGY（REFERENCE-JIEJOE-CIAO.md）

> 来源：对 https://www.jiejoe.com 与 https://www.ciaoenergy.com 的线上检查。
> 目标：不打开原站，也能复刻两者的"交互物理感"与"明亮金属 3D 质感"，并知道本站在哪里借用了它们。
> 证据方式：静态 HTML + 线上 JS bundle 源码分析（本机 agent-browser 因 Chrome 缺失无法启动，未做 DOM 实机提取；所有结论均标注为"源码级观测"或"推断"）。

## 一、两个站点的本质

| | jiejoe.com | ciaoenergy.com |
| --- | --- | --- |
| 定位 | 视觉设计师个人站（Vue SPA） | 能量饮料品牌站（Webflow + Three.js） |
| 招牌 | **滚动驱动的 2D 物理**：台灯精灵摔落、滚动施力、点击击碎 | **金属 3D 罐**：MeshPhysicalMaterial 光泽罐漂浮在影棚光里 |
| 风格 | 深底 `#171717`、手绘插画、怪趣文案（"be wild! creative! and cool!"） | 明亮水果色、视频背景、高级产品摄影感 |
| 学习点 | 物理小游戏的交互语法 | 明亮金属 3D 的材质配方 |

## 二、JIEJOE 的物理交互系统（源码级观测）

JIEJOE 把 Matter.js（bundled 于 app bundle，`import k from matter-js`）拆成三个小场景，全部以"低配引擎 + 视口开关"跑：

### 1. 台灯阵（home_idea）—— 招牌游戏
- `Engine.create({ constraintIterations: 1 })`（刻意降迭代省 CPU）+ 暗色渲染 `wireframes:false`，背景 `#171717`。
- 四面静态墙：顶部 `rectangle(w/2, -15, w, 30)`、底部、左右，`isStatic:true`，填充 `#171717`（隐形盒壁）。
- 20 个台灯形刚体：`Bodies.fromVertices(随机x, 随机y/2, [8 个灯形顶点…])`，贴 `render.sprite`（灯/碎灯两套贴图），前 3 个 `if_break=true`。
- **滚动施力**：`window scroll` 里 `Body.applyForce(lamp, lamp.position, {x:0, y:-random*force*dir})`，方向 = 滚动方向（下滚上抛、上滚下吸），力度随视口面积缩放。这是"物理回应滚动"的核心语法。
- **点击击碎**：`Query.point(allBodies, {x, y})[0]` 命中后把贴图换成碎灯，计数 3 个全碎 → `html.classList.add("gray")` 整页变灰（彩蛋闭环）。
- **睡眠判定**：每秒轮询 `allBodies` 的 `speed<1` 全体成立 → 才允许滚动施力（静止时不浪费力）。
- **生命周期**：`IntersectionObserver` 进视口 → `Render.run` + rAF `Engine.update`；出视口 → `Render.stop` + 移除监听；引擎销毁 `Engine.clear + render.canvas.remove()`。整套是小场景的范本。

### 2. 技能挂件（home_skills）—— 每个技能块一个小物理
- 每个技能卡一个 `<div class="hss_block_canvas">`，挂件 = 一个多边形刚体 + 一条**软约束**：
  `Constraint.create({ pointA: {x: w/2, y: 0}, bodyB: body, pointB: {x:0, y:-w/10}, stiffness: 0.1 })`，`render:{lineWidth:2, strokeStyle:'#f7f7f7'}`（可见的绳）。
- 手感关键词：**stiffness 0.1 的软绳**，重物随手拖、松手荡回。

### 3. 电话摇摆（home_contact）—— 抛掷测速反馈
- 电话 SVG 贴图刚体 + 软约束吊挂；`MouseConstraint`（stiffness .2，约束不可见）拖拽。
- `Events.on(mc, "mousedown")` → 开始测速；`mouseup` → `check_phone_speed()`：速度够快触发反馈动效。**"甩出去 → 达标 → 反馈"是它的交互语法**。

### 4. 其它可学
- 欢迎区：Lottie logo（`lottie-web loadAnimation`，svg 渲染，loop，视口进出 play/pause）+ 鼠标视差球（GSAP timeline `rotate/x` 3s ease power3.out）。
- 照片区：纯 CSS transform 卡片轮播（rotate/translate 位移表 + zIndex），0.3s ease 切换。
- 自定义滚动条 + "Scroll carefully, it's smooth" 的文案自嘲（把性能骄傲写进文案）。

## 三、CIAO ENERGY 的明亮金属 3D（源码级观测）

- 栈：Webflow + `gsap 3.15 + ScrollTrigger + SplitText`（无 React），Three.js 由内联 bundle 驱动。
- 场景：`gltfLoader.loadAsync('…/webgl/base.glb')`（金属底座）+ `…/can.glb`（罐壳），每罐 `clone()` + 贴口味标签纹理。
- **材质配方（核心可复用值）**：`MeshPhysicalMaterial`：
  - 罐体 `color 0x555555, metalness 0.9, roughness 0.2, sheen 0.8, sheenRoughness 0.2, sheenColor 0xffffff, clearcoat 1, clearcoatRoughness 0.1, reflectivity 1, ior 2, envMapIntensity 3` + 金属度贴图。
  - 标签带 `metalness 0.9, roughness 0.2, sheen 0.05, sheenRoughness 0.125, clearcoat 0.5, clearcoatRoughness 0.3` + `map` 标签纹理。
  - `applyEnvironmentTint()` 把环境光色调刷进所有材质（统一氛围）。
- 罐体 `rotation.z = π/360*45`（常驻 45° 倾斜，比正立更有"商品感"）。
- 品牌色：明亮水果色系（柠檬黄/青柠绿/莓果红），视频循环背景 + 液态动效，**亮度来自材质高光与高饱和底色**，不是场景灯。
- 推断（未实测交互）：罐体常驻慢旋 + 鼠标视差；页面滚动由 GSAP 编排。

## 四、本站（funny8kids.github.io）如何落地这两套语言

| 借用点 | 本站实现 | 文件 |
| --- | --- | --- |
| Matter 官方 Constraints 演示 1:1 复刻 | 800×600 世界等比缩放，8 组约束逐项同参、官方色板/锚点/角度指示/睡眠半透明、angularStiffness:0 拖拽 | assets/js/playground.js |
| jiejoe 技能挂件 | 技能列软绳钟摆（stiffness .1），甩速达标迸火花 | assets/js/pendulums.js |
| jiejoe 抛掷测速反馈 | 挂件松手测速 → 火花粒子 + 微抖 | assets/js/pendulums.js |
| jiejoe 生命周期 | 全部场景 IntersectionObserver 进出暂停、休眠零计算、后台暂停 | 各模块 |
| ciao 金属罐材质 | 程序化"F8K 罐"：metalness .92 / roughness .28 / sheen .6 / clearcoat .6 + 三点影棚布光 | assets/js/lab3d.js |
| ciao 常驻倾斜 + 慢旋 | 拖拽惯性旋转（松手滑行）+ 呼吸缩放 | assets/js/lab3d.js |
| jiejoe Lottie logo | 页脚 F8K 动态徽标（lottie_light 懒加载 + 视口暂停） | assets/js/main.js / assets/lottie/ |

## 五、可复用规则（Agent Prompt Guide）

- 复刻"物理回应滚动"："深色盒内 N 个贴图刚体自由落体；scroll 事件按滚动方向 `applyForce`；点击 `Query.point` 换贴图；全部击碎触发页面级状态（如去色）。"
- 复刻"技能挂件"："每张卡片一个 150px 小 canvas；静态锚点 + 多边形重物 + `stiffness:0.1` 可见软绳；拖拽松手测速，速度超阈值迸粒子。"
- 复刻"明亮金属 3D"："透明背景 + 明亮渐变舞台；MeshPhysicalMaterial(metalness .9, roughness .25, sheen .6, clearcoat .6) + 白键光/薄荷轮廓/暖阳补光三灯；罐体 45° 倾斜 + 慢旋 + 拖拽惯性。"
- 性能底线："所有 canvas 场景必须有 IntersectionObserver 进出暂停、visibilitychange 暂停、静止休眠、DPR 上限；渲染能隔帧就隔帧。"

## 六、Evidence Notes

- 观测方式：jiejoe.com 为 Vue SPA，对其 `js/app.*.js`（1.5MB，含 Matter.js 调用点）与 `js/chunk-vendors.*.js` 做了源码级提取；ciaoenergy.com 为 Webflow 站，对内联 `<script>` 中的 Three.js 场景代码做了源码级提取。均未实机 DOM/截图观测（本机无 Chrome，agent-browser 无法启动）。
- 推断（已标注）：ciao 罐体的交互方式、jiejoe 触屏行为、两站移动端布局。
- 缺口：两站的完整移动端断点、ciao 的滚动编排细节、jiejoe 其余页面（works/about 等）。
