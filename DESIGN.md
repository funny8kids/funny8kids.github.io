# LUMEN VIOLA — Design System (DESIGN.md)

> 由 website-to-design-md 技能生成:证据来自 agent-browser 对运行中站点(http://localhost:8123)的 DOM/computed-style/CSS 变量双主题提取,辅以仓库样式源码交叉验证。生成日期 2026-09-19(v97)。

## 1. Visual Theme & Atmosphere

**概念**:深夜玻璃温室里的生物荧光紫罗兰。站点不是"介绍花园",站点**就是**温室——滚动是行走,光标是萤火,花瓣服从风与重力。

整体氛围是 **Cinematic × Editorial**:超大 display 标题 + 电影静帧构图 + 细等宽 HUD 注记,运行在近乎单色的紫调上,用唯一的青色信号色打破单调。动效手感"慢进慢出 + 物理惯性":签名段落用 Matter.js 真实碰撞,3D 段落用虹彩玻璃花瓣(three.js clearcoat),装饰段落用官方 Skottie 验证过的 Lottie 呼吸绽放。

- 密度:低。章节 padding `clamp(4.5rem, 11vw, 8rem)`,大量留白即布景。
- 亮度基线:dark 为默认人格(首屏即深色),light 是同一系统的白昼温室,不是简单反色。
- 质感关键词:发丝线(1px hairline)、辉光阴影(紫色投影代替边框)、颗粒/噪点覆膜、玻璃(backdrop-blur 仅用于导航胶囊)。
- 签名交互:全站自定义光标(内点+外环 lerp 跟随)、DotGrid 点击冲击波、物理花园拖拽/弹弓、Silk 丝绸着色器、3D 花瓣拖拽甩动惯性。

### Key Characteristics
1. 一个品牌紫 + 一个花心品红高光 + 一个冷色信号青,三色完成全部语义。
2. 阴影即边框:主按钮靠 `0 12px 32px rgba(109,40,217,.45)` 悬浮,卡片靠 1px `--line` 发丝线 + 极浅紫投影。
3. 等宽字体只用于"仪器读数"类文本(章节号、HUD、组件标签),制造温室仪表盘感。
4. 所有动效可降级:`prefers-reduced-motion` 全站静态化;所有 rAF 循环受 IntersectionObserver + document.hidden 门控。

## 2. Color Palette & Roles

### Theme Modes
站点支持 `html[data-theme="light|dark"]` 双主题,localStorage `vn-theme` 持久化,首帧内联脚本判定(无闪烁)。token 全部随主题翻转,但**语义角色不变**。

| Token | Dark | Light | 角色 |
| --- | --- | --- | --- |
| `--void` | `#0A0814` | `#F1ECFA` | 页面底(唯一背景色,禁止叠两层近黑/近白) |
| `--void-2` | `#120C22` | `#E6DDF5` | 章节抬升面 |
| `--ink` | `#F4EFFF` | `#1B1430` | 主文字 |
| `--ink-soft` | `#C4B5E8` | `#453A66` | 次级文字 |
| `--ink-dim` | `#7C6A9E` | `#8879AC` | 弱化文字/页脚 |
| `--violet` | `#8B5CF6` | `#7C3AED` | 主品牌紫:按钮、链接、强调 |
| `--orchid` | `#E879F9` | `#C026D3` | 花心高光:章节序号、渐变端点、chip 辉光 |
| `--lilac` | `#C4B5FD` | `#5B21B6` | 浅紫:衬线斜体强调词、hover 文字 |
| `--signal` | `#67E8F9` | `#0E7490` | **唯一冷色信号**:HUD、焦点环、光标内环、组件标签 |
| `--line` | `rgba(244,239,255,.10)` | `rgba(27,20,48,.12)` | 发丝线 |
| `--line2` | `rgba(244,239,255,.18)` | `rgba(27,20,48,.22)` | 强一档的发丝线 |
| `--glow` | `rgba(139,92,246,.4)` | `rgba(124,58,237,.25)` | 辉光色 |

### Primary / Interactive / Neutral
- Primary:`--violet`(渐变常与 `#6D28D9`、`--orchid` 组成 120° 渐变,文字渐变用 `background-clip:text`)。
- Interactive hover/focus 一律落到 `--signal` 或 `--orchid`,不引入新色。
- Neutral 即 ink 三档;禁止出现纯灰。

### Surface & Overlay
- 只有一个表面层级对:`--void` → `--void-2`。导航胶囊是唯一的玻璃面(半透明 + backdrop-blur)。
- Silk 等着色器画布自带深色底 `#0B0716`,属于"展品内部世界",不算页面表面。

### Shadows & Depth
- 主按钮:`0 12px 32px rgba(109,40,217,.45)`(dark/light 同值,即"阴影即边框")。
- 卡片(light 下):`0 20px 45px rgba(76,29,149,.07)` + 1px `--line` 边框;dark 下去掉投影只留发丝线。
- Chip:`0 6px 18px rgba(232,121,249,.35)` 品红辉光。
- 文字辉光:`text-shadow: 0 0 60px rgba(196,181,253,.35)`(hero 衬线强调词)。

## 3. Typography Rules

### Font Family
| Token | 字体 | 用途 |
| --- | --- | --- |
| `--display` | Clash Display(自托管 woff2 500/600)+ PingFang SC/YaHei 回退 | 全部标题、按钮、ticker |
| `--body` | 系统栈(-apple-system / PingFang SC / Segoe UI) | 正文、note |
| `--mono` | ui-monospace / Cascadia Mono / Consolas | 章节号、HUD、`<Tag />` 标签、chip |
| `--serif` | Instrument Serif 斜体(自托管)+ Songti/Georgia 回退 | 诗意强调词(Garden、引言、bloom 章节) |

### Hierarchy(observed)
| 层级 | 规格 |
| --- | --- |
| Hero 主词 `.hero__word` | Clash 600, `clamp(2.9rem,12.8vw,9.5rem)`, lh .95, ls -.045em |
| Hero 衬线词 `.hero__garden em` | Instrument Serif 斜体, `clamp(2.6rem,9vw,6.4rem)`, `--lilac` + 60px 辉光 |
| Hero 引导行 `.hero__line` | Clash 500, `clamp(1.15rem,2.6vw,1.7rem)`, ls .06em |
| 章节中文题 `.section__cn` | Clash 600, `clamp(2.2rem,5.8vw,4.5rem)`, ls -.03em |
| 章节英文题 h2 | Clash 600, 72px@desktop, lh 1.15, ls -.03em |
| 章节号 `.sec__idx` | mono 12.8px, ls .14em, `--orchid` |
| 正文 lead | 0.98–1.1rem, lh 1.95, `--ink-soft` |
| 组件标签 `.gal__tag` | mono 10.56px, ls .16em, `--signal` |
| 注释 `.gal__note` | body 13.6px, `--ink-dim` |
| Ticker | Clash, `clamp(.9rem,1.7vw,1.2rem)`, ls .12em, uppercase |

### Principles
- 大标题永远负字距(-.03em ~ -.05em),小标签永远正字距(≥.12em)——"挤压即身份"。
- 中英混排:英文 display 定调,中文在同 token 下用 PingFang 回退,不单独造中文标题字体。
- 渐变文字只用于数字/单词级(gal__count、loader 数字),整句永不渐变。

## 4. Component Stylings

### Navigation
React Bits 药丸风格:浮动胶囊、圆角 999px、半透明底 + backdrop-blur、active 项高亮药丸;章节滚动联动。

### Buttons / CTA
- 主按钮:999px 胶囊、padding `0 24px`(高约 48px)、Clash 15.2px、紫渐变底 + 45% 透明紫色大投影;hover 提升辉光。
- Hero 双 CTA:"走进温室 / 触碰风场"——动词开头、四字中文、无感叹号。
- 邮箱胶囊(StarBorder):流光描边动画只在 hover/visit 时运行。

### Cards & Containers
- Gallery 单元 `.gal__cell`:20px 圆角、1px `--line`、padding 24px、透明底;wide 变体跨 2 列。结构固定为 `<标签 mono> + <展品> + <一句中文 note>`。
- Works 卡:电影 WebP 图 + 线稿发光叠层 + 颗粒 + 揭幕动画;图不裸放,一律过"电影级处理"。
- 展品容器统一 250px 高、14px 圆角、overflow hidden。

### Chips / Badges
物理工具条 chip:mono 10.88px、ls .087em、999px、padding 约 7px 12.8px、品红辉光投影。

### Distinctive Components
- **DotGrid** `[data-dotgrid]`:canvas 点阵,近距 rgb 混色、快速划过推动(power2.out)+ elastic.out 回弹、点击冲击波。
- **Silk** `[data-silk]`:官方 GLSL 逐行原样,three.js 正交平面全屏 quad,`uTime += 0.1*dt`。
- **Lottie Violet Bloom** `[data-lottie]`:90 帧无缝呼吸绽放(5 花瓣 st 相位错位 + trim 环),SVG renderer,离屏暂停,reduced 停在中帧。
- **matter.js 物理花园**:官方 Render/Runner/lookAt 管线真复刻 + 站点层(花瓣精灵、重力切换、弹弓计分)。
- **bloom3d.js**:LatheGeometry 玻璃紫罗兰 ×8、clearcoat、萤火 Points、拖拽惯性。
- TextAnimations 系列:data-decrypt / blur / shiny / rotate / glitch / gradient / typewriter / circular,全部 IO 门控。

## 5. Layout Principles

### Spacing System
- 基准单位 rem,节奏 `--pad: clamp(1.1rem,4vw,3.5rem)`(左右),章节纵向 `clamp(4.5rem,11vw,8rem)`(实测 128px@1440)。
- 组件内:标签→展品 .3rem 上距,展品→note .8rem 下距。

### Grid & Container
- 无最大宽度容器,全出血 + padding clamp;gallery 为 auto-fit 网格,`--wide` 跨 2 列,`--tall` 纵跨。
- 章节头部三段式:`序号(mono) + 英文题 + 中文 kicker`,左对齐,序号与题基线对齐。

### Whitespace Philosophy
留白承担叙事:章节间的大空场是"温室走廊",滚动进入下一展区。分隔优先用负空间与对齐,其次一根发丝线,最后才允许卡片面。

### Border Radius Scale
`2px(HUD 角标) → 14px(展品) → 20px(卡) → 24/28/30px(大面板) → 999px/50%(胶囊与圆)`。没有 8px/12px 中间档——要么很大要么没有。

## 6. Depth & Elevation

层级从后到前:three.js 画布/背景场 → `--void` 底 → `--void-2` 章节面 → 内容/展品 → 导航胶囊(glass) → 光标环/十字线 → loader(莫比乌斯玻璃)。深度感主要靠 **辉光与雾化**(drop-shadow/text-shadow/紫色投影),不靠灰阶叠层。

## 7. Do's and Don'ts

- ✅ 新颜色先问"能不能用现有 token";全站冷色信号只留 `--signal` 一个。
- ✅ 新动画必须:IO + document.hidden 门控、reduced-motion 降级、transform/opacity 优先(gsap-performance 规则)。
- ✅ 图片一律电影级处理(调色、颗粒、发光线稿、水印检查),掉价时修图不删图。
- ✅ 文案:中文四字动宾短语 CTA;技术注解用 mono + 一句克制说明。
- ❌ 不加第二块玻璃面、不叠两层近黑。
- ❌ 不用 width/height/top/left 做位移动画。
- ❌ 不给整句文字上渐变、不用彩色 emoji 装饰。
- ❌ 不为"高级感"堆卡片边框/分割线;chrome 预算默认为 0。

## 8. Responsive Behavior

- 标题全部 `clamp()` 流式,无跳档;hero 主词 12.8vw 直落 2.9rem。
- 章节 padding、grid 列数随宽度收放;wide 卡在窄屏退为单列。
- 触屏:自定义光标 `(hover:hover) and (pointer:fine)` 才启用;物理/3D 交互绑定 pointer 事件,触摸可玩。
- 触控目标:chip/按钮实际高 ≥28px,胶囊按钮 ≥44px。
- Breakpoints(observed 类名切换点):约 1024 / 768 / 560px。

## 9. Agent Prompt Guide

### Quick Color Reference
底 `#0A0814` / 抬升 `#120C22` / 主文字 `#F4EFFF` / 品牌紫 `#8B5CF6` / 花心 `#E879F9` / 浅紫 `#C4B5FD` / 信号青 `#67E8F9` / 发丝线 `rgba(244,239,255,.10)`。

### Example Component Prompts
- **Hero**:"居中三行 display 标题,最大词 clamp(2.9rem,12.8vw,9.5rem) 负字距 -.045em,下一词用 Instrument Serif 斜体浅紫 + 60px 紫辉光;下方 1rem 行距正文 + 两枚 999px 紫渐变胶囊按钮(投影 0 12px 32px rgba(109,40,217,.45));背景是 canvas 花瓣场。"
- **Gallery cell**:"20px 圆角透明卡,1px rgba(244,239,255,.10) 发丝边;顶部一行 mono 10.5px 信号青标签 `<ComponentName />`,中间 250px 展品,底部 13.6px 灰紫中文一句,克制说明技术要点。"
- **Section head**:"mono 12.8px 品红序号 07 + Clash 600 72px 英文题(负字距) + 中文 kicker,左对齐,章节 padding 上下 128px。"
- **Loader**:"全屏深色,中央 Clash 600 clamp(4.2rem,15vw,7rem) 数字,白→lilac→orchid 120° 渐变 clip:text,配莫比乌斯玻璃环;完成后整体淡出停回首屏。"

### Iteration Guide
1. 改动前先跑无头验证(playwright-core + 本机 chromium,强制 `vn-theme=dark`),零 console error 是底线。
2. 每批新特效进 gallery 前:下载官方源码 → 逐行移植 → 门控 → cache-bust(`?v=NN` 同步递增 css/main/reactbits)。
3. 评估图像资产:先查水印与构图;掉价 = 修处理,不删图。
4. 性能基线:空闲 rAF ≤ 一个合成器循环;长任务只允许出现在 preloader 期间。

## Appendix A · Interaction Patterns
- 光标:内点即时、外环 lerp .16,静止归位自停。
- 滚动:Lenis 平滑 + ScrollTrigger 章节联动 + 导航药丸同步。
- Hover:DotGrid 推动、CircularText 加速 ×4、GlitchText 悬停才播放。
- 点击:DotGrid 冲击波、物理拖拽/弹弓、3D 花瓣甩动惯性。
- 主题:切换即时翻转全部 token,图片/着色器同步换光感(Silk uLightMode)。

## Appendix B · Content & Messaging Patterns
- 语气:诗意、安静、第一人称复数("走进温室")。中文短语优先四字,英文全大写做装饰。
- 信任信号:直接展示技术出处(React Bits、matter-js 官方复刻、Skottie 验证)。
- 命名:章节 = 园艺词汇(Garden/Physics/Works/Bloom/Gallery/Notes/Visit)。

## Appendix C · Evidence Notes
- 观测手段:agent-browser eval(结构/双主题 tokens/computed styles/radius 与 shadow 集合)+ 运行中截图验证。
- 标注推断:works 卡细节、breakpoints 数值来自样式源码交叉(`assets/css/style.css`),非纯 DOM 观测。

## Appendix D · Skill Application Record (技能落点)
| Skill | 落点 | 证据 |
| --- | --- | --- |
| text-to-lottie | 紫色罗兰花苞 loader/mark 动画 | assets/lottie/violet-bloom.json(+logo-dark/light.json),经 Skottie 播放器逐帧验收 |
| GSAP 官方技能集(8) | Lenis+ScrollTrigger 章节联动、timeline 编排、quickTo 光标跟随、matchMedia 降级 | assets/js/main.js、cinema.js |
| website-to-design-md | 本 DESIGN.md 即其产物(DOM/computed-style 双主题提取) | DESIGN.md 全文 |
| three-scope-map | 判定不适用:该技能面向中国地图可视化(Vue+ECharts 地理数据),与本站品牌叙事无交集;结论按技能文档规范留档于此 | 本行 |
| matter-js 官方 constraints demo | §04 物理花园:链条/棘轮/弹弓小游戏逐约束复刻 | assets/js/physics-garden.js |
| ciaoenergy 3D 物件 / jiejoe 2D 物理 | §06 Bloom 3D 花瓣实体 + §04 花园物理 | assets/js/bloom3d.js、petals3d.js |
| reactbits.dev Backgrounds Textures 等 | v95→v109 十六批 ≈89 件组件原生移植,IO/visibility 门禁,双主题墨路;仅三件因第三方库依赖按先例跳过并留档:Hyperspeed(postprocessing)、ShapeWaves/AeroShards(vgpu·WebGPU) | assets/js/reactbits.js |
