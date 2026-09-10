# funny8kids.github.io

个人简历 / 作品集网站 —— 紫罗兰花园（Violet Evergarden）式优雅编辑风设计（羊皮纸底 · 鸢尾紫 × 干枯玫瑰 × 镀金 · 墨紫黑信笺字 · 大字排版 · 丝滑动效）。

## 本地预览

直接双击 `index.html` 即可，或在仓库根目录运行：

```bash
python -m http.server 8000
# 浏览器打开 http://localhost:8000
```

## 替换为你的真实资料

所有个人资料均为**占位内容**，打开 `index.html` 搜索 `TODO(你)`，逐项替换姓名、自介、技能、项目、经历与联系方式即可。项目图片可直接换成本地路径（放进 `assets/img/`）。

## 技术说明

- 纯静态 HTML/CSS/JS，无构建步骤，GitHub Pages 开箱即用
- **依赖全部本地化**于 `assets/vendor/`（GSAP / ScrollTrigger / Lenis / Three.js / Matter.js / lottie_light），无外部单点故障；脚本标签带 `?v=N` 缓存版本号，发版时递增
- 代码按职责分文件：`main.js`（主题/路由/预加载/滚动动效/光标/文本动效/跑马灯）+ `hero3d.js`（首屏 3D）+ `lab3d.js`（实验室迷你太阳系）+ `playground.js`（物理彩蛋）+ `pendulums.js`（技能钟摆）+ `petals.js`（紫罗兰花园落花瓣氛围层，口令解锁触发「信风」）+ `prism.js`（棱镜折射背景，React Bits Prism 思路），通过 `f8k-idle` / `f8k-theme` / `f8k-layout` DOM 事件解耦通信
- **物理彩蛋**：Matter.js 官方 Constraints 演示（brm.io/matter-js/demo/#constraints）1:1 完全复刻 —— 8 组约束设施逐项同参、800×600 世界等比缩放、紫罗兰色板/约束锚点/角度指示线/睡眠半透明（结构 1:1，仅色板换用品牌紫罗兰）、拖拽可旋转（angularStiffness:0）
- **动效精选**：React Bits 的明亮风格组件已品牌化落地 —— ShinyText / GradientText / BlurText / TrueFocus / PixelTrail / TextPressure / StarBorder / ClickSpark / WordRotate / CountUp / SpotlightCard / ScrollVelocity / Magnetic / Prism（棱镜折射背景，紫罗兰花园配色）；页脚 F8K 动态徽标（text-to-lottie 资产 + lottie_light 懒加载）
- **编辑式大字（学习 Bombon / Jesper Landberg）**：`#creed` 信条段「每一件作品，都是一封寄给未来的信」用 `data-split` 逐词揭示 —— 透明度 + 微上浮 + 模糊三重，随滚动 scrub 推进；配字距拉开的纪念碑式眉题；预加载加入 EDOLUS 式百分比计数器（`preloader__pct`）
- **横向长卷（学习 Bombon / EDOLUS 的 pinned 滚动叙事）**：作品卡组改为 sticky 舞台 + ScrollTrigger scrub —— 桌面端滚入 #work 后舞台吸顶、滚动进度驱动卡组横向位移（进度即卡序读数 01/05）；触屏回退原生横滑 + 吸附；规避 GSAP pin 的祖先 transform 冲突，用 `position: sticky` 实现
- **火漆封缄（紫罗兰手札签名彩蛋）**：页脚巨型邮箱旁一枚蜡封印章，hover 融化滴蜡、点击「盖章」触发花瓣信风 + 棱镜闪亮 + 微音效
- **过渡系统**（学习 haoqi.design 的编排方法论）：`data-reveal` 变体按章节编排入场（上浮/侧滑/扇形/中心擦除/行级描画等"一章一性格"）；`data-line` 描画线由 CSS 过渡承担 scaleX；`.scene-aura` 三枚品牌色光晕随章节离散流转（transform/opacity）；主题切换走 View Transition 整页交叉淡化（不支持时回退 CSS 变量过渡）；导航 Scrollspy 墨线滑移 + 锚点落点柔光脉冲；预加载双层幕布与首屏大字重叠交接
- **滚动体验**（学习 haoqi.design 的"背景随滚动活着" + GSAP 官网跑马灯）：两段大字跑马灯带由滚动速度驱动（空闲慢漂、加速、反向，第二段衬线斜体反向流动）并在桌面 pin 驻留一段滚动；章节随滚动速度轻微歪斜（transform 合成层）；三枚品牌色光晕随滚动正弦漂移 + 速度摆动；顶部进度线 + 左下章节读数（`00 HELLO → 09 联系`）+ 右下 X/Y 坐标与滚动百分比系统 HUD；首屏退场为缩放下沉 + 3D 反向视差
- **haoqi.design 迁移件**：虚线边框悬停框（交互行签名反馈）、主题 >1.5s 慢速交叉淡化（View Transition）、戏剧性缓动曲线 `cubic-bezier(.66,0,.01,1)`、首屏 Lead 大段落、页脚超大邮箱 CTA、■■■■■■ 打码口令解锁行（口令 2026）、SOUND[\|/»] 交互音效开关（WebAudio 合成微音效，无音频文件，默认关，本地记忆）
- **免费 API 接入**（全部懒加载 + 缓存 + 失败静默回退）：一言 hitokoto 页脚每日一句（按天缓存）、ipwho.is 访客城市（sessionStorage 缓存，坐标预留给天气接入）、不蒜子访问量（唯一外部脚本依赖，数据未到达时整行隐藏）
- 参考设计文档：`REFERENCE-JIEJOE-CIAO.md`（jiejoe.com 物理交互语法 + ciaoenergy.com 明亮金属 3D 配方，含证据说明）
- **错误边界**：任何脚本故障都会解锁页面（绝不卡死在预加载屏），并有 7 秒看门狗兜底
- **性能**：全部 canvas 场景（3D / 物理 / 钟摆）遵循同一套纪律 —— 空闲懒加载、IntersectionObserver 进出暂停、`visibilitychange` 后台暂停、物理休眠零计算、DPR 上限、3D 隔帧 30fps；GSAP 动效只用 transform/opacity + quickTo（见 gsap-performance 技能）；滚动体感中枢带速度死区（静止帧跳过歪斜/摆动写入）、一次性入场触发器播完即销毁（`once`）、`f8k-layout` 刷新 rAF 合并，滚动全程低开销
- **hash 路由**：锚点写入地址栏，链接可分享、浏览器后退可用；`href="#"` 占位链接不再跳顶
- 预加载进度绑定真实 `window.load`（超时 3.5s + 点击/按键可跳过）；触屏可拖拽彩蛋刚体与技能钟摆（仅命中时锁定滚动）
- 无障碍：THEME 按钮 `aria-pressed`、菜单 Esc 关闭 + 焦点归还、`prefers-reduced-motion` 全量降级、无 JS 时系统光标可用
- SEO：og:image 分享卡（`assets/img/og-cover.png`）、Person JSON-LD、robots.txt、sitemap.xml
- 明暗双主题（默认明亮，THEME[A/D] 切换 + 记忆）、字体自托管 + 关键字重 preload
