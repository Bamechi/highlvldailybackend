// Turns a link into a screenshot image (hosted URL) and an AI headline + summary.
// Screenshot: Microlink free tier by default (no key). If SCREENSHOTONE_ACCESS_KEY is set,
// it uses ScreenshotOne and stores the image in the Supabase 'shots' bucket.
// Summary: Claude, using the ANTHROPIC_API_KEY already configured for the Telegram bot.
import { db } from './db.js';

export async function screenshot(url) {
  const soKey = process.env.SCREENSHOTONE_ACCESS_KEY;
  try {
    if (soKey) {
      const api = `https://api.screenshotone.com/take?access_key=${soKey}`
        + `&url=${encodeURIComponent(url)}&format=jpg&image_quality=82`
        + `&block_ads=true&block_cookie_banners=true&block_chat_widgets=true`
        + `&viewport_width=820&viewport_height=1200&full_page=false&delay=2&cache=true&cache_ttl=2592000`;
      const r = await fetch(api);
      if (!r.ok) throw new Error('screenshotone ' + r.status);
      const buf = Buffer.from(await r.arrayBuffer());
      const name = `shot_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
      const up = await db().storage.from('shots').upload(name, buf, { contentType: 'image/jpeg', upsert: false });
      if (up.error) throw up.error;
      return db().storage.from('shots').getPublicUrl(name).data.publicUrl;
    }
    // Microlink free tier — returns a hosted screenshot URL, no key needed.
    const api = `https://api.microlink.io/?url=${encodeURIComponent(url)}&screenshot=true&meta=false&waitForTimeout=2500&viewport.width=820`;
    const r = await fetch(api, { headers: { accept: 'application/json' } });
    const j = await r.json();
    if (j.status === 'success' && j.data?.screenshot?.url) return j.data.screenshot.url;
    throw new Error('microlink ' + (j.status || 'fail'));
  } catch (e) {
    console.error('screenshot failed', e.message);
    return null;
  }
}

export async function summarize(card) {
  const key = process.env.ANTHROPIC_API_KEY;
  const raw = [card.headline, card.summary].filter(Boolean).join(' — ').slice(0, 1600);
  if (!key || raw.length < 20) return null;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: process.env.CLAUDE_SUMMARY_MODEL || process.env.CLAUDE_MODEL || 'claude-sonnet-5',
        max_tokens: 220,
        system: 'You write on-screen chyrons for HIGH - LVL DAILY, a weekday AI/culture/money desk show hosted by 19Keys. Given a social post or article, return STRICT JSON only: {"headline":"...","summary":"..."}. headline: max 9 words, punchy, no ending period, captures the hook, reads well in all caps. summary: one sentence, max 22 words, plain language, what it is and why it matters to people building something. No emojis, no hashtags, no surrounding quotes. Output JSON and nothing else.',
        messages: [{ role: 'user', content: `Source: ${card.source || card.type}${card.author ? ' · ' + card.author : ''}\nContent: ${raw}` }],
      }),
    });
    const j = await r.json();
    if (!r.ok) return null;
    let text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    text = text.replace(/^```json\s*/i, '').replace(/```$/,'').trim();
    const p = JSON.parse(text);
    if (p.headline) return { headline: String(p.headline).slice(0, 120), summary: String(p.summary || '').slice(0, 240) };
  } catch (e) { console.error('summarize failed', e.message); }
  return null;
}
