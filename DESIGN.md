# haoqi.design 设计系统（DESIGN.md）

> 来源：agent-browser 对 https://haoqi.design 的深度检查（桌面端 1258px 视口）。
> 目标：让任何 agent 不看原站也能复刻其设计语言、内容语气与交互质感。

## Visual Theme & Atmosphere

暖白纸底上的"工程系统"美学：整个站点像一台被精心校准的仪器，而非一本画册。它几乎不用图片，全部信息由文字、等宽注记和精确的对位承载；页头常驻 GMT+8 时钟、气温、光标 X/Y 坐标读数，主题与声音都有方括号开关（`THEME[A]`、`SOUND[-]`），营造出"系统 HUD"式的冷静氛围。克制的双色主题（暖白 ↔ 近黑）配纯黑文字，唯一的彩色是外链蓝；公司名用实心方块 ■■■■■■ 打码，反而成为个性签名。整体气质：克制、精密、工程师的幽默感。

### Key Characteristics

- 暖白纸底 `#FBFAF4` + 纯黑文字，近黑 `#0F1111` 暗色主题，切换为慢速交叉淡化（>1.6s）
- 文字优先：项目是"前缀标签 + 名称 + 年份"的大文字块，不是图片卡片
- 系统注记无处不在：时区时钟、气温、X/Y 光标坐标、`[A]`/`[-]` 方括号开关状态
- 几何无衬线（tiktok 字体）承担全部正文与大字，等宽字体（tronica-mono）只做 HUD 注记
- 全大写标签文化：链接 700 字重全大写，项目前缀 "CODING PROJECT"、页脚 "INNOVATE WITH PURPOSE"
- 双语内容策略：英文为主、中文为辅（如"阿里云盘"），™ 与 © 上标频繁出现
- 自定义光标；交互可选音效（SOUND 开关）
- 动效曲线保守而精确，含一条戏剧性的快起慢收曲线 `cubic-bezier(.66,0,.01,1)`

## Color Palette & Roles

| Role | Value | Usage |
| --- | --- | --- |
| 背景 · 亮色 | `#FBFAF4` `rgb(251,250,244)` | 亮色主题的全局背景（暖白纸） |
| 背景 · 暗色 | `#0F1111` `rgb(15,17,17)` | 暗色主题的全局背景 |
| 前景 | `#000000` | 亮色主题下所有文字与图形 |
| 外链蓝 | `#0066DC` / `#007BFF` / `#3C93FF` | 样式表中的链接色阶（推断：外链与强调） |
| 暗色面板 | `#292D39` / `#181C20` / `#373C4B` | 样式表中的暗色表面色阶（推断：暗色主题表面） |
| 打码块 | `#000` 实心 | 敏感信息的 ■■■■■■ 方块 |

配色哲学：一个背景 + 一个前景 + 透明度阶梯。不使用品牌强调色，靠字重、字号与留白制造层级。

### Theme Modes

- 亮色（默认观测态）：`#FBFAF4` 底 / `#000` 字。暗色：`#0F1111` 底 / 亮字（具体前景色未采样到，推断为近白）。
- 切换控件是文本按钮 `THEME[A]` ↔ `THEME[D]`，方括号内字母即当前状态；切换伴随 >1.6s 的慢速交叉淡化。
- 两套主题共享同一套版式与字号，只有背景/前景翻转，无第二套彩色。

## Typography Rules

| Level | Font | Size | Weight | Style | 用途 |
| --- | --- | --- | --- | --- | --- |
| Display | tiktok | 85.5px（≈6.8vw） | 700 | uppercase | 页脚 CTA "INNOVATE…" |
| Statement | tiktok | 75.5px（≈6vw） | 700 | uppercase | 宣言行 "I BRING CRAFT & TASTE TO DIGITAL WORK" |
| Lead | tiktok | 52.8px（≈4.2vw） | 400 | normal | 首屏大号正文段落（标志性手法） |
| Eyebrow | tiktok | 30px | 500 | normal | 首屏眉题 "Design & Engineering" |
| Base | tiktok | 16px | 400 | — | 正文，行高 24px（1.5） |
| HUD | tronica-mono | 16px | 400 | uppercase | 开关、时钟、坐标、按钮 |
| Link | tiktok | 16px | 700 | uppercase | 导航与页脚链接 |

- 字体观测：`font-family: tiktok, sans-serif`（几何无衬线，疑似自托管 TikTok Sans）；`tronica-mono, monospace` 用于全部技术注记。@font-face 规则未在可读样式表中（推断：next/font 内联注入）。
- 行高纪律：大字 1.0–1.25，正文 1.5，无 letter-spacing 调整（normal）。
- 层级完全靠"字号 × 字重 × 大写"三维驱动，不靠颜色。

## Component Stylings

### Header（系统 HUD）

左：`HAOQI.DESIGN` 文字 logo（链接回首页）。中/右：`WORK` `CONTACT` 大写按钮；`THEME[A]` `SOUND[-]` 等宽字体状态开关；`GMT+8 CN 19:18 28°C` 实时时钟与气温；`0629 X 0283 Y` 光标坐标实时读数。所有注记等宽、大写、同字号（16px），像仪表盘读数排成一行。

### 项目行（Project Rows）

`<a>` 块级元素（观测约 764×469px，padding 8px），文案格式：`[类型前缀] [名称™] [年份区间]`，如 `CODING PROJECT REUNIMOS™ 2024-2026`、`ADRIVE 阿里云盘 2020-2022`、`FOF: SEE HEAR TOUCH 2022 EVENT ↗`。外链项尾部带 `↗`。无图片、无边框分隔，靠间距与换行分组。悬停态采样无颜色/内边距变化（推断：动效由 JS 驱动或作用于子元素）。

### 页脚 CTA

`INNOVATE WITH PURPOSE`（85px 大写）+ `LET'S CREATE SOMETHING EXTRAORDINARY` + 超大 `CURIOSITY.WEN@GMAIL.COM` 邮箱链接 + `TWITTER/X` `FIGMA` `GITHUB` 大写等宽/粗体链接列。

### 链接与按钮

全部 `text-transform: uppercase`；导航链接 700 字重；按钮用等宽字体 400 字重大写。无圆角、无阴影、无填充底色的文本控件风格。

## Layout Principles

- 全幅布局：主容器 padding 0、max-width none，内容直接贴合视口（观测 mainPad 0px / mainMaxW none）。
- 项目块两列排布（推断：764px 宽块在 1258px 视口下约为两列网格）。
- 留白替代分隔线：段落与项目组之间用大间距分组，未观测到装饰性边框。
- HUD 信息行横贯页头，仪表读数与导航混排一行。

## Depth & Elevation

- 零阴影、零圆角卡片、零渐变。层级只存在于排版维度。
- 主题切换的交叉淡化是唯一的"深度"表达；其余全部平面。
- 透明度阶梯（rgba(var(--label)) 类 token）用于次级信息，而非灰色块。

## Do's and Don'ts

**Do**

- 用等宽字体的"仪表读数"制造系统感：时钟、坐标、方括号状态开关
- 让正文段落成为首屏主角（52.8px 的 Lead 段落）
- 项目列表用"前缀 + 名称 + 年份"的文案结构，外链加 ↗
- 双语混排（英文骨架 + 中文点睛），™/© 上标做细节装饰
- 主题切换做慢速交叉淡化（>1.6s）

**Don't**

- 不要加品牌强调色、渐变、阴影、圆角卡片——它的美来自克制
- 不要用图片轰炸；文字与排版就是画面
- 不要给大字加 letter-spacing；层级靠字号与字重
- 不要把 HUD 注记做成装饰性图形——它们必须输出真实数据（真实时间、真实坐标）

## Responsive Behavior

- 观测仅覆盖桌面端 1258×566 视口（证据缺口）。
- 推断（未验证）：HUD 行在小屏折叠或隐藏坐标读数；项目块两列降为单列；大字按 vw 缩放（85px ≈ 6.8vw、75px ≈ 6vw 均为流式）。

## Agent Prompt Guide

- 复刻首屏："暖白纸底 #FBFAF4，纯黑几何无衬线。首屏眉题 30px 'Design & Engineering Thinking in systems.'，下方 52.8px/400 的两行大号正文段落占满视口，页头一行等宽大写 HUD：logo、WORK、CONTACT、THEME[A]、SOUND[-]、GMT+8 时钟与气温、X/Y 光标坐标。"
- 复刻项目列表："无图片项目块，文案格式 'CODING PROJECT 名称™ 年份'，大写前缀标签 + 名称 + 年份，外链尾部 ↗，两列网格，间距分组不用边框。"
- 复刻页脚："85px/700 大写 CTA 'INNOVATE WITH PURPOSE'，下方超大邮箱链接与 TWITTER/X、FIGMA、GITHUB 大写链接列。"
- 迭代规则：先调字号与字重，再动间距；禁止引入新颜色。

## Observed Pages

- https://haoqi.design/ （首页，Next.js App Router + Vercel 部署，观测时标题 HAOQI©2026）

## Evidence Notes

- 直接观测：body 计算样式、代表性元素字号/字重/大写、主题切换前后背景色、项目块几何、页头与页脚文案、样式表色值与贝塞尔曲线、自定义光标存在性。
- 推断（已标注）：暗色主题前景色、项目两列网格、字体注入方式（next/font）、悬停动效实现方式。
- 缺口：移动端断点行为、暗色主题完整 token、音效行为未实际听到、单项目详情页未访问。
- 工具：agent-browser 0.27.0（DOM 与计算样式为主证据，未使用截图）。
