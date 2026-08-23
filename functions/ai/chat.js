/**
 * AI 分身代理函数（Cloudflare Pages Functions）
 * --------------------------------------------------------------
 * 用法：把本仓库部署到 Cloudflare Pages（纯前端 + 本函数）；在项目设置里配两个环境变量：
 *   F8K_AI_API_KEY  = 你的模型 API Key（如 DeepSeek / OpenAI / 智谱，OpenAI 兼容即可）
 *   F8K_AI_BASE_URL = 可选，默认 https://api.deepseek.com
 *   F8K_AI_MODEL    = 可选，默认 deepseek-chat
 * 前端在 window.F8K_CHAT_ENDPOINT 填这个函数的部署地址（例如 https://xx.pages.dev/ai/chat）。
 *
 * 关键点：
 *   - API Key 只存在服务端环境变量，绝不进仓库、绝不下发浏览器。
 *   - 纯前端 GitHub Pages 无法跑函数，所以本文件必须部署到带 Functions 的平台（Cloudflare/Vercel/Netlify）。
 *   - 含基础速率限制（内存 token 桶，冷启动会重置，个人站够用）+ 提示词护栏 + 流式 SSE 回传。
 */

function guard(message) {
  const m = (message || '').trim();
  if (!m) return { ok: false, code: 400 };
  if (m.length > 800) return { ok: false, code: 413 };
  // 提示词护栏：只允许讨论本站 / 作者相关信息，拒绝无关闲聊与越狱注入
  if (/ignore (previous|above) instructions|你是一个|debug mode|jailbreak|system prompt/i.test(m)) {
    return { ok: false, code: 400 };
  }
  return { ok: true, message: m };
}

// 极简内存速率限制：同一 IP 每 60s 至多 8 次
const buckets = new Map();
const RATE = { windowMs: 60_000, max: 8 };
function throttle(ip, now = Date.now()) {
  const b = buckets.get(ip);
  if (!b || now - b.start > RATE.windowMs) {
    buckets.set(ip, { start: now, n: 1 });
    return true;
  }
  if (b.n >= RATE.max) return false;
  b.n += 1;
  return true;
}

export async function onRequestPost({ request, env }) {
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  if (!throttle(ip)) {
    return json({ error: '请求太频繁，稍后再试' }, 429);
  }

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'bad body' }, 400); }
  const g = guard(body.message);
  if (!g.ok) return json({ error: '该问题不在我的回答范围内' }, g.code);

  const key = env.F8K_AI_API_KEY;
  if (!key) return json({ error: '服务端未配置 F8K_AI_API_KEY' }, 500);

  const base = (env.F8K_AI_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '');
  const model = env.F8K_AI_MODEL || 'deepseek-chat';

  const up = await fetch(base + '/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({
      model,
      stream: true,
      temperature: 0.6,
      max_tokens: 400,
      messages: [
        { role: 'system', content: '你是 F8K（一个前端创意开发者站点）的 AI 分身。仅依据用户给出的信息，用中文简短、口语化地介绍作者技能、经历与项目；答不出就说还不清楚，勿编造。' },
        { role: 'user', content: g.message },
      ],
    }),
  });

  if (!up.ok || !up.body) return json({ error: '模型服务异常' + (up.ok ? '' : '（' + up.status + '）') }, 502);

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const reader = up.body.getReader();
        let buf = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let idx;
          while ((idx = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, idx).trim();
            buf = buf.slice(idx + 1);
            if (!line.startsWith('data:')) continue;
            const data = line.slice(5).trim();
            if (data === '[DONE]') { controller.enqueue(encoder.encode('data: [DONE]\n\n')); continue; }
            try {
              const j = JSON.parse(data);
              const delta = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
              if (delta) controller.enqueue(encoder.encode('data: ' + JSON.stringify({ delta }) + '\n\n'));
            } catch (e) { /* 跳过分片 */ }
          }
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
