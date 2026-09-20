# funny8kids.github.io

**VioletNotes Garden** — 电影感暗夜温室个人站。目标是 Awwwards 级别的滚动叙事与沉浸体验。

## 预览

```bash
python -m http.server 8000
# http://localhost:8000
```

## 技术栈

- **GSAP + ScrollTrigger** — 逐字入场、视差、章节揭示
- **Lenis** — 丝滑平滑滚动
- **Three.js** — Hero WebGL 发光花瓣粒子场（着色器）
- **i18n** — 中 / 英一键切换（顶栏 `中 / EN`）
- **无构建** — 纯静态，GitHub Pages 直接可用

## 结构

| 文件 | 作用 |
| --- | --- |
| `index.html` | 页面结构与双语文案 key |
| `assets/css/style.css` | 暗夜紫罗兰设计系统 |
| `assets/js/main.js` | 预加载、i18n、Lenis、GSAP 编排、光标、磁吸 |
| `assets/js/petals3d.js` | Three.js 花瓣粒子 |
| `assets/img/violet-*.png` | AI 生成的氛围摄影素材 |

## 体验要点

1. 进度条预加载 → 幕布揭幕
2. Hero 逐字浮现 + WebGL 花瓣 + 视差退场
3. 滚动章节：花园 / 体验 / 手记 / 来访
4. 自定义光标 + 磁吸按钮
5. 顶栏中英切换，整站文案即时替换
6. `prefers-reduced-motion` 全量降级

## 邮箱

dominicjamil404@gmail.com
