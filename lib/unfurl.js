// Turns a URL into a card: headline, image, author, source, embed HTML.
// X: publish.twitter.com/oembed (no credentials). Instagram: Meta tokenless oEmbed (June 2026).
// Everything else: Open Graph tags.

const UA = 'Mozilla/5.0 (compatible; HighLvlDailyRundown/1.0; +https://19keys.com)';

function strip(html = '') {
  return html.replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

async function getJSON(url, ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

async function getText(url, ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html,*/*' }, signal: ctrl.signal, redirect: 'follow' });
    const text = await r.text();
    return { text: text.slice(0, 400000), finalUrl: r.url || url };
  } finally { clearTimeout(t); }
}

function meta(html, key) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`, 'i');
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`, 'i');
  const m = html.match(re) || html.match(re2);
  return m ? strip(m[1]) : '';
}

export function detectType(url) {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '');
    if ((h === 'x.com' || h === 'twitter.com' || h.endsWith('.x.com') || h.endsWith('.twitter.com')) && /\/status\/\d+/.test(url)) return 'x';
    if (h === 'instagram.com' || h.endsWith('.instagram.com')) return 'instagram';
    return 'article';
  } catch { return 'article'; }
}

export async function unfurl(url) {
  const type = detectType(url);
  const base = { type, url, headline: '', summary: '', image_url: null, author: null, source: null, embed_html: null };
  try {
    if (type === 'x') {
      const clean = url.replace('x.com/', 'twitter.com/');
      const j = await getJSON(`https://publish.twitter.com/oembed?omit_script=1&dnt=1&url=${encodeURIComponent(clean)}`);
      const text = strip(j.html || '');
      const quote = text.replace(/—\s*.*$/, '').trim();
      return { ...base, headline: quote.slice(0, 280) || `Post by ${j.author_name || 'X'}`, author: j.author_name ? `@${(j.author_url || '').split('/').pop() || j.author_name}` : null, source: 'X', embed_html: j.html || null };
    }
    if (type === 'instagram') {
      let j = null;
      try { j = await getJSON(`https://graph.facebook.com/v26.0/instagram_oembed?omit_script=true&url=${encodeURIComponent(url)}`); } catch {}
      const handle = (url.match(/instagram\.com\/([^/?#]+)\/?(?:p|reel)?/) || [])[1];
      const text = j ? strip(j.html || '') : '';
      const cap = text.match(/A post shared by (.+?)\s*\(/);
      return { ...base, headline: (text.split('View this post on Instagram')[0] || '').trim().slice(0, 240) || `Instagram post${handle && handle !== 'p' && handle !== 'reel' ? ` by @${handle}` : ''}`, author: cap ? cap[1].trim() : (handle && !['p', 'reel', 'reels'].includes(handle) ? `@${handle}` : null), source: 'Instagram', embed_html: j?.html || null };
    }
    const { text: html, finalUrl } = await getText(url);
    const title = meta(html, 'og:title') || meta(html, 'twitter:title') || strip((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
    const desc = meta(html, 'og:description') || meta(html, 'description') || '';
    let img = meta(html, 'og:image') || meta(html, 'twitter:image') || null;
    if (img && img.startsWith('/')) img = new URL(img, finalUrl).href;
    const site = meta(html, 'og:site_name') || new URL(finalUrl).hostname.replace(/^www\./, '');
    const author = meta(html, 'author') || meta(html, 'article:author') || null;
    return { ...base, headline: title.slice(0, 240) || new URL(finalUrl).hostname, summary: desc.slice(0, 500), image_url: img, author: author && !author.startsWith('http') ? author : null, source: site };
  } catch (e) {
    let host = url; try { host = new URL(url).hostname.replace(/^www\./, ''); } catch {}
    return { ...base, headline: host, summary: `Could not read this link automatically (${e.message}). Edit the headline on the Desk.`, source: host };
  }
}
