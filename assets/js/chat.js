/* AI 分身：大模型对话面板
   端点从 window.F8K_CHAT_ENDPOINT 读取（需你接的代理函数，见 functions/ai/chat.js）。
   未配置端点 / 拉取失败时优雅降级：面板照常可用，返回本站内置示例话术，不弹错。
   文案走 i18n.js（F8K_T），随 f8k-lang 实时取当前语言。 */
(function () {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const toggle = document.getElementById('chatToggle');
  const panel = document.getElementById('chatPanel');
  const close = document.getElementById('chatClose');
  const log = document.getElementById('chatLog');
  const form = document.getElementById('chatForm');
  const input = document.getElementById('chatInput');
  if (!toggle || !panel || !log || !form) return;

  const t = (key) => (window.F8K_T ? window.F8K_T(key) : key);
  const ENDPOINT = window.F8K_CHAT_ENDPOINT || '';
  const SYS_HINT = () => ENDPOINT ? t('chat.sysHint.on') : t('chat.sysHint.off');
  const FALLBACK = () => [t('chat.fb.1'), t('chat.fb.2'), t('chat.fb.3')];

  const say = (text, who, kind) => {
    const row = document.createElement('div');
    row.className = 'chat-line chat-line--' + who + (kind ? ' chat-line--' + kind : '');
    row.textContent = text;
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
    if (who === 'bot') document.dispatchEvent(new CustomEvent('f8k-chat-bot'));
    return row;
  };

  const boot = () => {
    say(SYS_HINT(), 'bot', 'boot');
    say(t('chat.boot'), 'bot', 'boot');
  };

  // 语言切换：面板已打开时，仅就地重译系统引导行（用户历史消息不动）
  document.addEventListener('f8k-lang', () => {
    const texts = [SYS_HINT(), t('chat.boot')];
    log.querySelectorAll('.chat-line--boot').forEach((el, i) => {
      if (texts[i] != null) el.textContent = texts[i];
    });
  });

  const open = () => {
    panel.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    toggle.classList.add('is-on');
    if (!reduced) panel.classList.add('is-in');
    if (!log.children.length) boot();
    document.dispatchEvent(new CustomEvent('f8k-chat-open'));
    input.focus();
  };
  const shut = () => {
    panel.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.classList.remove('is-on');
    panel.classList.remove('is-in');
    document.dispatchEvent(new CustomEvent('f8k-chat-close'));
  };
  toggle.addEventListener('click', () => (panel.hidden ? open() : shut()));
  close.addEventListener('click', shut);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) shut();
  });

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
          const val = j.reply != null ? j.reply : j.delta;
          if (val) { row.textContent += val; log.scrollTop = log.scrollHeight; }
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
      row.textContent = FALLBACK()[fb++ % FALLBACK().length];
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
        row.textContent = j.reply || t('chat.empty');
      }
    } catch (err) {
      row.textContent = t('chat.error').replace('msg', err.message);
    }
    log.scrollTop = log.scrollHeight;
  });
})();
