const API = () => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

export async function tg(method, body) {
  const r = await fetch(`${API()}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) console.error('telegram', method, j);
  return j;
}

export const send = (chat_id, text, extra = {}) => tg('sendMessage', { chat_id, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra });
export const answer = (id, text) => tg('answerCallbackQuery', { callback_query_id: id, text });
export const edit = (chat_id, message_id, text, extra = {}) => tg('editMessageText', { chat_id, message_id, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra });

export const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function allowed(userId) {
  const ids = (process.env.TELEGRAM_ALLOWED_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  return { configured: ids.length > 0, ok: ids.includes(String(userId)) };
}

export function extractUrls(msg) {
  const text = msg.text || msg.caption || '';
  const ents = [...(msg.entities || []), ...(msg.caption_entities || [])];
  const urls = new Set();
  for (const e of ents) {
    if (e.type === 'url') urls.add(text.substr(e.offset, e.length));
    if (e.type === 'text_link' && e.url) urls.add(e.url);
  }
  for (const m of text.matchAll(/https?:\/\/[^\s<>"')\]]+/g)) urls.add(m[0]);
  return [...urls].map(u => u.replace(/[.,;:!?]+$/, ''));
}
