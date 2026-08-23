/* AI 分身：大模型对话面板
   端点从 window.F8K_CHAT_ENDPOINT 读取（需你接的代理函数，见 functions/ai/chat.js）。
   未配置端点 / 拉取失败时优雅降级：面板照常可用，返回本站内置示例话术，不弹错。 */
(function () {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const toggle = document.getElementById('chatToggle');
  const panel = document.getElementById('chatPanel');
  const close = document.getElementById('chatClose');
  const log = document.getElementById('chatLog');
  const form = document.getElementById('chatForm');
  const input = document.getElementById('chatInput');
  if (!toggle || !panel || !log || !form) return;

  const ENDPOINT = window.F8K_CHAT_ENDPOINT || '';
  const SYS_HINT = ENDPOINT
    ? '已接入 AI 分身后端 · 问问关于我的技能/经历/项目。'
    : 'AI 未接入——配置代理端点后即可对话（见 functions/ai/chat.js）。以下是本站内置示例，可先感受交互。';

  const say = (text, who) => {
    const row = document.createElement('div');
    row.className = 'chat-line chat-line--' + who;
    row.textContent = text;
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
    return row;
  };

  const boot = () => {
    say(SYS_HINT, 'bot');
    say('你好，我是 F8K 的 AI 分身 ✦ 试着问我：做过哪些项目？', 'bot');
  };

  const open = () => {
    panel.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    toggle.classList.add('is-on');
    if (!reduced) panel.classList.add('is-in');
    if (!log.children.length) boot();
    input.focus();
  };
  const shut = () => {
    panel.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.classList.remove('is-on');
    panel.classList.remove('is-in');
  };
  toggle.addEventListener('click', () => (panel.hidden ? open() : shut()));
  close.addEventListener('click', shut);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) shut();
  });

  /* 内置示例话术（未接入后端时兜底，循环复用） */
  const FALLBACK = [
    '我是本地示例回复。接入后端后，我会基于你的真实经历回答。',
    '目前还没有连到模型。把 API 端到 functions/ai/chat.js 代理后，这里就会用你的资料作答。',
    '你可以先感受交互：这条也是内置话术。',
  ];
  let fb = 0;

  const streamIn = async (res, row) => {
    if (!res.body) { row.textContent = await res.text(); return; }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') return;
        try {
          const j = JSON.parse(data);
          const t = j.reply != null ? j.reply : j.delta;
          if (t) { row.textContent += t; log.scrollTop = log.scrollHeight; }
        } catch (e) { continue; }
      }
    }
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    say(text, 'user');
    input.value = '';
    const row = say('…', 'bot');
    if (!ENDPOINT) {
      row.textContent = FALLBACK[fb++ % FALLBACK.length];
      return;
    }
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      if (!res.ok) throw new Error('http ' + res.status);
      if ((res.headers.get('content-type') || '').includes('text/event-stream')) await streamIn(res, row);
      else {
        const j = await res.json();
        row.textContent = j.reply || '（空回复）';
      }
    } catch (err) {
      row.textContent = '连接后端失败（' + err.message + '）。请检查代理端点配置。';
    }
    log.scrollTop = log.scrollHeight;
  });
})();
