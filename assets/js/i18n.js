/* =========================================================
   F8K® — 全站中英文切换（默认英文）
   - 词典：window.F8K_DICT = { en, zh }
   - 应用：data-i18n（textContent）/ data-i18n-html（innerHTML）/
            data-i18n-placeholder / data-i18n-aria / data-i18n-title
   - 跳过 .echo-text 与 [data-split]（由各自模块随 f8k-lang 重渲染）
   - 切换：f8k-lang 事件广播，供 canvas/跑马灯/聊天等模块重渲染
   - 记忆：localStorage 'f8k-lang'（默认 en）
   ========================================================= */
(() => {
  'use strict';

  const DICT = {
    en: {
      'meta.title': 'dominicjamil — Creative Developer',
      'meta.desc': 'dominicjamil — a creative developer focused on interaction, motion & creative coding, turning ideas into interfaces that breathe.',
      'meta.jobTitle': 'Creative Developer',

      'nav.aria': 'Navigation',
      'nav.about': 'About', 'nav.skills': 'Skills', 'nav.work': 'Work', 'nav.contact': 'Contact',
      'menu.aria': 'Mobile navigation',
      'aria.sound': 'Toggle interaction sound',
      'aria.theme': 'Toggle light/dark theme',
      'aria.burger': 'Open menu',
      'aria.mail': 'Email',
      'menu.about': 'About', 'menu.about.em': '关于',
      'menu.skills': 'Skills', 'menu.skills.em': '技能',
      'menu.work': 'Work', 'menu.work.em': '作品',
      'menu.contact': 'Contact', 'menu.contact.em': '联系',

      'hero.tagline': 'breathing life into code',
      'hero.geek': 'Geek',
      'hero.desc': "Building rigorous compute infrastructure with code, so scientific ideas keep growing — focused on <span class='echo-text__kw'>AI Infra, AI4S, AI4MATH</span>, reshaping the symbiosis of compute and science, and obsessed with performance and every computational detail.",

      'techloop.cap': 'TECH STACK',
      'marquee.violet': 'Violet Garden',
      'marquee.breathe': 'turning ideas into breathing interfaces',
      'marquee.grace': 'Grace', 'marquee.restraint': 'Restraint',
      'marquee.precision': 'Precision', 'marquee.poetry': 'Poetry in code',

      'sec.about': 'About', 'sec.services': 'Services', 'sec.skills': 'Skills',
      'sec.work': 'Selected Work', 'sec.exp': 'Experience', 'sec.voices': 'Kind Words',
      'sec.lab': 'Lab', 'sec.play': 'Motion Study', 'sec.secret': 'Secret Level', 'sec.stack': 'Tech Stack',
      'sec.contact': 'Contact',

      'lock.prompt': 'PASSCODE — enter passcode to unlock this project',
      'lock.unlockedAria': 'Unlocked project',
      'lock.unlockedName': 'SECRET LAB — hidden project',
      'lock.unlockedMeta': 'unlocked · 2026',

      'about.status': 'Online',
      'about.contact': 'Contact me',
      'about.contactAria': 'Contact dominicjamil',
      'about.role': 'Creative Developer',
      'about.hint': 'Hover this card — 3D holographic · feel it',
      'about.stat.years': 'years experience',
      'about.stat.projects': 'projects delivered',
      'about.stat.repos': 'open-source repos',
      'about.stat.curiosity': 'curiosity',

      'services.1.title': 'Web Development',
      'services.1.desc': 'From design to launch, complete delivery: responsive, accessible, SEO-friendly — stunning on open, within the performance budget.',
      'services.2.title': 'Interaction & Motion',
      'services.2.desc': "GSAP / Three.js / WebGL: scroll storytelling, micro-interactions, load choreography — motion that serves content, never showing off.",
      'services.3.title': 'Performance & Engineering',
      'services.3.desc': 'Performance audits, build optimization, design systems & component libraries — making pages fast, and teams faster.',

      'skills.devTitle': 'Development <em>开发</em>',
      'skills.designTitle': 'Design <em>设计</em>',
      'skills.toolTitle': 'Tooling <em>工具</em>',
      'skill.designSystem': 'Design systems',
      'skill.motionDesign': 'Motion design',
      'skill.proto': 'Prototyping',
      'note.proto': 'prototyping',
      'note.daily': 'daily driver', 'note.deep': 'deep usage', 'note.proficient': 'proficient',
      'note.server': 'server-side', 'note.motion': 'motion', 'note.webgl': 'WebGL 3D',
      'note.collab': 'design collab', 'note.spec': 'components & specs',
      'note.build': 'build', 'note.vcs': 'version control',
      'note.containers': 'containers', 'note.deploy': 'deploy', 'note.orchestration': 'orchestration',
      'note.aiScripts': 'AI scripts', 'note.security': 'security', 'note.gpu': 'GPU rendering',
      'note.interaction': 'interaction & motion', 'note.framework': 'React framework',

      'work.deckHint': 'SCROLL TO EXPLORE',
      'work.card.orbit': 'Star Ark <em>ORBIT</em>',
      'work.card.lumen': 'LUMEN <em>E-commerce</em>',
      'work.card.mood': 'MOOD <em>AI Diary</em>',
      'work.card.pulse': 'PULSE <em>Music Visualizer</em>',
      'work.card.cta': 'All Projects',
      'work.moreHead': 'MORE — more projects & output',
      'work.more.lockedAria': 'Protected project, click to enter passcode',
      'work.more.lockedMeta': 'unreleased · 2026',
      'work.more.vsMeta': 'FIGMA plugin · 2023',
      'work.more.colorMeta': 'web tool · 2024',
      'work.more.motionName': 'MOTION NOTES',
      'work.more.motionMeta': 'graphic tutorial · 2023',
      'work.more.cliMeta': 'terminal toy · 2022',
      'work.more.blogName': 'Blog',
      'work.more.blogMeta': 'writing · 2020 — now',
      'work.more.siteName': 'RESUME SITE',
      'work.more.siteMeta': 'design & dev · 2026',

      'creed.aria': 'Creed',
      'creed.eyebrow': 'C R E E D — VIOLET GARDEN NOTE',
      'creed.statement': 'Every work is a letter to the future.',
      'creed.sub': '每一件作品，都是一封寄给未来的信。',

      'exp.time.now': '2024 — now',
      'exp.1.title': 'Senior Front-End Engineer', 'exp.1.org': 'Starship Tech',
      'exp.2.title': 'Front-End Engineer', 'exp.2.org': 'Lightyear Studio',
      'exp.3.title': 'Computer Science · B.S.', 'exp.3.org': 'University',
      'exp.loc.shanghai': 'Shanghai', 'exp.loc.remote': 'Remote',

      'voices.1.text': "The delivered site is stunning the moment it opens — delicate motion that never drags, and the performance numbers look great too.",
      'voices.1.by': '— Startup CEO · LUMEN project',
      'voices.2.text': "A rare collaborator who understands both design and engineering — after the design system shipped, the team's efficiency visibly improved.",
      'voices.2.by': '— Design Lead · Lightyear Studio',
      'voices.3.text': 'The open-source repos rival commercial projects in code quality, and issue response is impressively fast.',
      'voices.3.by': '— Open-source community member',

      'lab.kicker': 'MINI SOLAR SYSTEM · WEBGL',
      'lab.hint': 'DRAG TO ORBIT',
      'lab.title': "A <em class='serif'>living</em> solar system",
      'lab.copy': "The whole solar system in miniature — the Sun, eight planets, Saturn's rings and an asteroid belt on real elliptical orbits. Drag to fly the camera, scroll to zoom, hover a planet for its name, click to lock the view onto it. Procedural textures mean zero downloads; it pauses off-screen and renders at 30fps, halving GPU cost.",
      'lab.fact.1.name': 'Eight planets', 'lab.fact.1.note': 'orbits · rings · asteroid belt',
      'lab.fact.2.name': 'Interactive camera', 'lab.fact.2.note': 'drag orbit · wheel zoom · click lock',
      'lab.fact.3.name': 'Zero assets', 'lab.fact.3.note': 'procedural textures · 30fps · off-screen pause',

      'play.hint': "A double pendulum in low gravity, its chaos traced in ink — violet when slow, gold when fast. Drag an arm to set it spinning; the dial dilates time.",

      'secret.lead': "Passcode accepted. Light the three brand colors in order to prove you found the way: <b>mint → sun → klein blue</b>.",
      'secret.pad.mint': 'mint', 'secret.pad.mintAria': 'mint light',
      'secret.pad.sun': 'sun', 'secret.pad.sunAria': 'sun light',
      'secret.pad.blue': 'blue', 'secret.pad.blueAria': 'klein blue light',
      'secret.msg': "✦ Level unlocked — you've stepped behind the scenes of this site. A wish tucked inside the code: <em class='serif'>make it glow.</em> ✦",

      'stack.lead': "From <b>TypeScript</b> to <b>Three.js</b>, and on to <em>K8s</em> and <em>WebGL</em> — this is the toolbox I use to polish every line of code and turn ideas into runnable experiences. Hover the icons; the light follows your cursor.",

      'footer.kicker': "10 — Contact · LET'S BUILD SOMETHING EXTRAORDINARY",
      'footer.title.1': 'Got a project in mind?',
      'footer.sealAria': 'Press the wax seal',
      'footer.social.juejin': 'JUEJIN ↗',
      'footer.quote': '“Turning ideas into interfaces that breathe.” — this site',
      'footer.visitsPrefix': 'Visits: ', 'footer.visitsSuffix': '',
      'footer.built': 'Built with code & care · BUILT WITH CARE',
      'footer.top': 'Back to top ↑',
      'lanyard.aria': 'Lanyard card interaction',
      'lanyard.hint': 'DRAG & SWING',

      'cursor.hologram': 'Hologram', 'cursor.swing': 'Swing', 'cursor.scroll': 'Scroll',
      'cursor.unlock': 'Unlock', 'cursor.rotate': 'Rotate', 'cursor.orbit': 'Orbit', 'cursor.drag': 'Drag',
      'cursor.light': 'Light', 'cursor.pull': 'Pull',

      'chat.title': 'F8K · AI Avatar',
      'chat.aria': 'AI chat dialog',
      'chat.close': 'Close chat',
      'chat.askAria': 'Ask a question',
      'chat.sendAria': 'Send',
      'mascot.closeAria': 'Hide mascot',
      'chat.placeholder': 'Ask about my skills / experience / projects…',
      'chat.sysHint.on': 'Connected to the AI avatar backend · ask about my skills / experience / projects.',
      'chat.sysHint.off': "AI not connected — configure the proxy endpoint to chat (see functions/ai/chat.js). Here's a built-in sample so you can feel the interaction.",
      'chat.boot': "Hi, I'm F8K's AI avatar ✦ try asking: what projects have you done?",
      'chat.fb.1': "I'm a local sample reply. Once the backend is connected, I'll answer from your real experience.",
      'chat.fb.2': "Not wired to a model yet. Point the API to the functions/ai/chat.js proxy and I'll answer with your actual data.",
      'chat.fb.3': 'Feel the interaction first — this is also a built-in line.',
      'chat.empty': '(empty reply)',
      'chat.error': 'Backend connection failed (msg). Please check the proxy endpoint.',

      'preloader.beauty': 'beauty in simplicity'
    },

    zh: {
      'meta.title': 'dominicjamil — 前端开发者 / Creative Developer',
      'meta.desc': 'dominicjamil，前端开发者。专注交互体验、动效与创意编码，把想法做成会呼吸的界面。',
      'meta.jobTitle': '前端开发者',

      'nav.aria': '主导航',
      'nav.about': '关于', 'nav.skills': '技能', 'nav.work': '作品', 'nav.contact': '联系',
      'menu.aria': '移动端导航',
      'aria.sound': '切换交互音效',
      'aria.theme': '切换明暗主题',
      'aria.burger': '打开菜单',
      'aria.mail': '邮箱',
      'menu.about': '关于', 'menu.about.em': 'About',
      'menu.skills': '技能', 'menu.skills.em': 'Skills',
      'menu.work': '作品', 'menu.work.em': 'Work',
      'menu.contact': '联系', 'menu.contact.em': 'Contact',

      'hero.tagline': '我在训练代码的灵魂',
      'hero.geek': '极客',
      'hero.desc': "用代码打磨严谨的算力基建，让科学想法生生不息 —— 聚焦 <span class='echo-text__kw'>AI Infra, AI4S, AI4MATH</span>，重塑算力与科学的共生关系，专注性能与每一个计算细节。",

      'techloop.cap': '技术栈 — TECH STACK',
      'marquee.violet': '紫罗兰花园',
      'marquee.breathe': '把想法做成会呼吸的界面',
      'marquee.grace': '优雅', 'marquee.restraint': '克制',
      'marquee.precision': '精确', 'marquee.poetry': '以代码写诗',

      'sec.about': '关于', 'sec.services': '服务', 'sec.skills': '技能',
      'sec.work': '精选作品', 'sec.exp': '经历', 'sec.voices': '评价',
      'sec.lab': '实验室', 'sec.play': '运动研究', 'sec.secret': '秘密关卡', 'sec.stack': '技术栈',
      'sec.contact': '联系',

      'lock.prompt': 'PASSCODE — 输入口令解锁该项目',
      'lock.unlockedAria': '已解锁项目',
      'lock.unlockedName': 'SECRET LAB — 秘密项目',
      'lock.unlockedMeta': '已解锁 · 2026',

      'about.status': '在线',
      'about.contact': '联系我',
      'about.contactAria': '联系 dominicjamil',
      'about.role': '前端开发者 · Creative Developer',
      'about.hint': '悬停这张卡 —— 3D 全息光效 · hover to feel it',
      'about.stat.years': '年开发经验',
      'about.stat.projects': '交付项目',
      'about.stat.repos': '开源仓库',
      'about.stat.curiosity': '好奇心',

      'services.1.title': '网站开发',
      'services.1.desc': '从设计稿到上线完整交付：响应式、无障碍、SEO 友好，在性能预算内做到打开即惊艳。',
      'services.2.title': '交互动效',
      'services.2.desc': 'GSAP / Three.js / WebGL：滚动叙事、微交互、加载编排 —— 动效服务内容，而非炫技。',
      'services.3.title': '性能与工程',
      'services.3.desc': '性能审计、构建优化、设计系统与组件库搭建，让页面快、让团队跑得更快。',

      'skills.devTitle': '开发 <em>DEVELOPMENT</em>',
      'skills.designTitle': '设计 <em>DESIGN</em>',
      'skills.toolTitle': '工具 <em>TOOLING</em>',
      'skill.designSystem': '设计系统',
      'skill.motionDesign': '动效设计',
      'skill.proto': '交互原型',
      'note.proto': '原型',
      'note.daily': '日常主语言', 'note.deep': '深度使用', 'note.proficient': '熟练',
      'note.server': '服务端', 'note.motion': '动效', 'note.webgl': 'WebGL 3D',
      'note.collab': '设计协作', 'note.spec': '组件与规范',
      'note.build': '构建', 'note.vcs': '版本管理',
      'note.containers': '容器', 'note.deploy': '部署', 'note.orchestration': '编排',
      'note.aiScripts': 'AI 脚本', 'note.security': '安全渗透', 'note.gpu': 'GPU 渲染',
      'note.interaction': '交互动效', 'note.framework': 'React 框架',

      'work.deckHint': '滚动浏览 — SCROLL TO EXPLORE',
      'work.card.orbit': '星舟 <em>ORBIT</em>',
      'work.card.lumen': 'LUMEN <em>电商</em>',
      'work.card.mood': 'MOOD <em>AI 日记</em>',
      'work.card.pulse': 'PULSE <em>音乐可视化</em>',
      'work.card.cta': '全部项目',
      'work.moreHead': 'MORE — 更多项目与产出',
      'work.more.lockedAria': '受保护项目，点击输入口令解锁',
      'work.more.lockedMeta': '未公开 · 2026',
      'work.more.vsMeta': 'FIGMA 插件 · 2023',
      'work.more.colorMeta': '在线工具 · 2024',
      'work.more.motionName': 'MOTION 备忘',
      'work.more.motionMeta': '图文教程 · 2023',
      'work.more.cliMeta': '终端玩具 · 2022',
      'work.more.blogName': '个人博客',
      'work.more.blogMeta': '写作 · 2020 — 至今',
      'work.more.siteName': 'RESUME SITE 本站',
      'work.more.siteMeta': '设计与开发 · 2026',

      'creed.aria': '信条',
      'creed.eyebrow': 'C R E E D · 信 条 — 紫 罗 兰 手 札',
      'creed.statement': '每一件作品，都是一封寄给未来的信。',
      'creed.sub': 'every work is a letter to the future.',

      'exp.time.now': '2024 — 至今',
      'exp.1.title': '高级前端工程师', 'exp.1.org': '星舟科技 · Starship Tech',
      'exp.2.title': '前端工程师', 'exp.2.org': '光年工作室 · Lightyear Studio',
      'exp.3.title': '计算机科学与技术 · 本科', 'exp.3.org': '某大学 · University',
      'exp.loc.shanghai': '上海', 'exp.loc.remote': '远程',

      'voices.1.text': '「交付的官网打开即惊艳，动效细腻但一点不拖沓，性能数据也很漂亮。」',
      'voices.1.by': '—— 某创业公司 CEO · LUMEN 项目',
      'voices.2.text': '「罕见的既懂设计又懂工程的合作者，设计系统交付后团队效率肉眼可见地提升。」',
      'voices.2.by': '—— 设计负责人 · 光年工作室',
      'voices.3.text': '「开源仓库的代码质量堪比商业项目，issue 响应速度感人。」',
      'voices.3.by': '—— 开源社区用户',

      'lab.kicker': '迷你太阳系 · WEBGL',
      'lab.hint': '拖动环绕镜头 — DRAG TO ORBIT',
      'lab.title': "一座<em class='serif'>活着的</em>太阳系",
      'lab.copy': '把整个太阳系收进方寸之间 —— 太阳、八大行星、土星环与小行星带，沿椭圆轨道缓缓公转。拖拽转动镜头，滚轮缩放，悬停行星显示名字，点击锁定跟随；程序化纹理零下载，离屏即暂停、隔帧 30fps 渲染省一半 GPU。',
      'lab.fact.1.name': '八大行星', 'lab.fact.1.note': '公转轨道 · 土星环 · 小行星带',
      'lab.fact.2.name': '交互镜头', 'lab.fact.2.note': '拖拽环绕 · 滚轮缩放 · 点击锁定',
      'lab.fact.3.name': '零资源加载', 'lab.fact.3.note': '程序化纹理 · 30fps · 离屏暂停',

      'play.hint': '低重力下的双摆，以墨迹描摹混沌 —— 慢时紫，快时金。拽动摆臂让它旋转；旋钮可拉长或压缩时间。',

      'secret.lead': '口令正确。按顺序点亮三盏品牌色，证明你走对了路：<b>薄荷 → 暖阳 → 克莱因</b>。',
      'secret.pad.mint': '薄荷', 'secret.pad.mintAria': '薄荷色灯',
      'secret.pad.sun': '暖阳', 'secret.pad.sunAria': '暖阳色灯',
      'secret.pad.blue': '克莱因', 'secret.pad.blueAria': '克莱因蓝灯',
      'secret.msg': "✦ 恭喜解锁隐藏关卡 —— 你已经走进了这个站点的\"幕后\"。送一句藏在代码里的祝语：<em class='serif'>make it glow.</em> ✦",

      'stack.lead': '从 <b>TypeScript</b> 到 <b>Three.js</b>，再到 <em>K8s</em> 与 <em>WebGL</em> — 这是我打磨每一行代码、把创意变成可运行体验的「工具箱」。图标区可悬停，光线会跟随你的光标。',

      'footer.kicker': "10 — 联系 · LET'S BUILD SOMETHING EXTRAORDINARY",
      'footer.title.1': '有项目想聊？',
      'footer.sealAria': '盖下火漆印章',
      'footer.social.juejin': '掘金 ↗',
      'footer.quote': '「把想法做成会呼吸的界面。」 —— 本站',
      'footer.visitsPrefix': '本站访问 ', 'footer.visitsSuffix': ' 次',
      'footer.built': '用代码与热爱构建 · BUILT WITH CARE',
      'footer.top': '回到顶部 ↑',
      'lanyard.aria': '挂绳实体卡互动',
      'lanyard.hint': '按住卡片拉甩 — DRAG & SWING',

      'cursor.hologram': '全息', 'cursor.swing': '甩动', 'cursor.scroll': '滚动',
      'cursor.unlock': '解锁', 'cursor.rotate': '旋转', 'cursor.orbit': '环绕', 'cursor.drag': '拖动',
      'cursor.light': '点亮', 'cursor.pull': '拖拽',

      'chat.title': 'F8K · AI 分身',
      'chat.aria': 'AI 对话',
      'chat.close': '关闭对话',
      'chat.askAria': '提问',
      'chat.sendAria': '发送',
      'mascot.closeAria': '隐藏吉祥物',
      'chat.placeholder': '问问关于我的技能 / 经历 / 项目…',
      'chat.sysHint.on': '已接入 AI 分身后端 · 问问关于我的技能/经历/项目。',
      'chat.sysHint.off': 'AI 未接入——配置代理端点后即可对话（见 functions/ai/chat.js）。以下是本站内置示例，可先感受交互。',
      'chat.boot': '你好，我是 F8K 的 AI 分身 ✦ 试着问我：做过哪些项目？',
      'chat.fb.1': '我是本地示例回复。接入后端后，我会基于你的真实经历回答。',
      'chat.fb.2': '目前还没有连到模型。把 API 端到 functions/ai/chat.js 代理后，这里就会用你的资料作答。',
      'chat.fb.3': '你可以先感受交互：这条也是内置话术。',
      'chat.empty': '（空回复）',
      'chat.error': '连接后端失败（msg）。请检查代理端点配置。',

      'preloader.beauty': '至简至美'
    }
  };

  const KEY = 'f8k-lang';
  let lang = 'en';
  try { lang = localStorage.getItem(KEY) || 'en'; } catch (e) { /* 隐私模式 */ }
  if (lang !== 'zh' && lang !== 'en') lang = 'en';

  window.F8K_DICT = DICT;
  window.F8K_LANG = lang;
  window.F8K_T = (key) => {
    const table = DICT[lang] || DICT.en;
    return table[key] != null ? table[key] : (DICT.en[key] != null ? DICT.en[key] : key);
  };

  const updateMeta = () => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.title = F8K_T('meta.title');
    const set = (sel, attr, val) => { const el = document.querySelector(sel); if (el && val) el.setAttribute(attr, val); };
    set('meta[name="description"]', 'content', F8K_T('meta.desc'));
    set('meta[property="og:title"]', 'content', F8K_T('meta.title'));
    set('meta[property="og:description"]', 'content', F8K_T('meta.desc'));
    set('meta[name="twitter:title"]', 'content', F8K_T('meta.title'));
    set('meta[name="twitter:description"]', 'content', F8K_T('meta.desc'));
    const ld = document.querySelector('script[type="application/ld+json"]');
    if (ld) {
      try {
        const data = JSON.parse(ld.textContent);
        if (data.jobTitle) data.jobTitle = F8K_T('meta.jobTitle');
        ld.textContent = JSON.stringify(data);
      } catch (e) { /* 忽略 */ }
    }
  };

  const applyI18n = () => {
    updateMeta();
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      if (el.classList.contains('echo-text') || el.hasAttribute('data-split')) return;
      el.textContent = F8K_T(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-html]').forEach((el) => {
      if (el.classList.contains('echo-text') || el.hasAttribute('data-split')) return;
      el.innerHTML = F8K_T(el.getAttribute('data-i18n-html'));
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.setAttribute('placeholder', F8K_T(el.getAttribute('data-i18n-placeholder')));
    });
    document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
      el.setAttribute('aria-label', F8K_T(el.getAttribute('data-i18n-aria')));
    });
    document.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.setAttribute('title', F8K_T(el.getAttribute('data-i18n-title')));
    });
    document.querySelectorAll('[data-i18n-cursor]').forEach((el) => {
      el.setAttribute('data-cursor-label', F8K_T(el.getAttribute('data-i18n-cursor')));
    });
    const tagline = document.getElementById('taglineWarp');
    if (tagline) tagline.setAttribute('data-fallback', F8K_T('hero.tagline'));
    const btn = document.getElementById('langToggle');
    if (btn) {
      const i = btn.querySelector('i');
      if (i) i.textContent = lang === 'zh' ? '[中]' : '[EN]';
      btn.setAttribute('aria-label', lang === 'zh' ? 'Switch to English' : '切换为中文');
    }
    document.dispatchEvent(new CustomEvent('f8k-lang', { detail: { lang } }));
  };

  const setLang = (next) => {
    if (next !== 'zh' && next !== 'en') return;
    lang = next;
    window.F8K_LANG = lang;
    try { localStorage.setItem(KEY, lang); } catch (e) { /* 忽略 */ }
    applyI18n();
  };
  window.F8K_SET_LANG = setLang;

  applyI18n();

  const btn = document.getElementById('langToggle');
  if (btn) {
    btn.addEventListener('click', () => {
      setLang(lang === 'zh' ? 'en' : 'zh');
      if (window.__f8kSound) window.__f8kSound(520, .12, 'sine');
    });
  }
})();
