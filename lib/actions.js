// Every change to the show goes through here, whether it came from the Desk or from Telegram.
import { db } from './db.js';
import { unfurl } from './unfurl.js';
import { screenshot, summarize } from './enrich.js';

export const SEGMENTS = ['the-open', 'tech-news', 'the-news', 'culture', 'the-shoutout', 'the-seat', 'the-close'];
export const SEGMENT_LABEL = {
  'the-open': 'THE OPEN', 'tech-news': 'TECH NEWS', 'the-news': 'THE NEWS', 'culture': 'CULTURE',
  'the-shoutout': 'THE SHOUTOUT', 'the-seat': 'THE SEAT', 'the-close': 'THE CLOSE',
};

const CARD_FIELDS = ['id', 'type', 'url', 'headline', 'summary', 'talking_points', 'image_url', 'author', 'source', 'embed_html', 'segment', 'frame'];

export async function getState() {
  const { data, error } = await db().from('stage_state').select('*').eq('id', 1).single();
  if (error) throw error;
  return data;
}

export async function patchState(patch) {
  const { data, error } = await db().from('stage_state').update(patch).eq('id', 1).select().single();
  if (error) throw error;
  return data;
}

export async function listItems(status) {
  let q = db().from('items').select('*').order('position', { ascending: true }).order('created_at', { ascending: true });
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

async function nextPosition(status) {
  const { data } = await db().from('items').select('position').eq('status', status).order('position', { ascending: false }).limit(1);
  return data && data[0] ? data[0].position + 1 : 1;
}

export async function addItem({ url, text, headline, summary, talking_points, segment, frame, type, added_by = 'desk', status = 'backlog' }) {
  let row;
  if (url) {
    const clean = url.trim();
    const u = await unfurl(clean);
    const [shot, sum] = await Promise.all([screenshot(clean), summarize(u)]);
    row = { ...u, talking_points: talking_points || '', segment: segment || guessSegment(u), frame: frame || 'standard', added_by, status };
    if (shot) row.image_url = shot;           // screenshot becomes the on-screen visual
    if (sum) { row.headline = sum.headline; if (sum.summary) row.summary = sum.summary; }  // AI chyron
    if (headline) row.headline = headline;    // explicit override always wins
    // row.url stays the original post link, so the Desk can click through to the source
  } else {
    const h = (headline || text || '').trim();
    if (!h) throw new Error('Nothing to add');
    row = { type: type || 'text', headline: h.slice(0, 240), summary: summary || (text && text.length > 240 ? text : ''), talking_points: talking_points || '', segment: segment || 'the-news', frame: frame || 'standard', added_by, status, source: type === 'card' ? 'SEGMENT' : type === 'ad' ? 'AD BREAK' : 'DESK' };
  }
  row.position = await nextPosition(status);
  const { data, error } = await db().from('items').insert(row).select().single();
  if (error) throw error;
  return data;
}

function guessSegment(u) {
  const t = `${u.headline} ${u.summary} ${u.source}`.toLowerCase();
  if (/\b(ai|openai|anthropic|nvidia|robot|chip|startup|app|tech|crypto|bitcoin|software|model)\b/.test(t)) return 'tech-news';
  if (/\b(music|album|rapper|film|movie|nba|nfl|game|fashion|drake|kendrick|culture|artist)\b/.test(t)) return 'culture';
  return 'the-news';
}

export async function updateItem(id, fields) {
  const allowed = ['type', 'url', 'headline', 'summary', 'talking_points', 'image_url', 'author', 'source', 'embed_html', 'segment', 'frame', 'status', 'position'];
  const patch = {};
  for (const k of allowed) if (k in fields) patch[k] = fields[k];
  const { data, error } = await db().from('items').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function capture(id) {
  const { data: it, error } = await db().from('items').select('*').eq('id', id).single();
  if (error) throw error;
  if (!it || !it.url) throw new Error('This item has no source link to capture');
  const shot = await screenshot(it.url);
  if (!shot) throw new Error('Capture failed — try again or upload an image');
  return updateItem(id, { image_url: shot });
}

export async function resummarize(id) {
  const { data: it, error } = await db().from('items').select('*').eq('id', id).single();
  if (error) throw error;
  const sum = await summarize(it);
  if (!sum) throw new Error('Could not summarize this item');
  return updateItem(id, { headline: sum.headline, summary: sum.summary || it.summary });
}

export async function setStatus(id, status) {
  const position = await nextPosition(status);
  return updateItem(id, { status, position });
}

export async function reorder(ids) {
  // ids in the desired order for the queued list
  const updates = ids.map((id, i) => db().from('items').update({ position: i + 1, status: 'queued' }).eq('id', id));
  const results = await Promise.all(updates);
  for (const r of results) if (r.error) throw r.error;
  return true;
}

export async function moveQueued(id, toIndex) {
  const queued = await listItems('queued');
  const ids = queued.map(i => i.id).filter(x => x !== id);
  ids.splice(Math.max(0, Math.min(ids.length, toIndex)), 0, id);
  await reorder(ids);
  return ids;
}

export async function publish() {
  const queued = await listItems('queued');
  const rundown = queued.map(i => Object.fromEntries(CARD_FIELDS.map(k => [k, i[k] ?? null])));
  const state = await getState();
  const idx = Math.min(state.idx, Math.max(0, rundown.length - 1));
  return patchState({ rundown, idx, published_at: new Date().toISOString(), mode: state.mode === 'standby' && rundown.length ? 'item' : state.mode });
}

export async function go(delta) {
  const s = await getState();
  const n = (s.rundown || []).length;
  if (!n) return s;
  const idx = Math.max(0, Math.min(n - 1, s.idx + delta));
  const patch = { idx, mode: 'item' };
  const card = s.rundown[idx];
  if (card && card.type === 'ad') patch.ad_started_at = new Date().toISOString();
  return patchState(patch);
}

export async function goto(idx) {
  const s = await getState();
  const n = (s.rundown || []).length;
  if (!n) return s;
  const i = Math.max(0, Math.min(n - 1, idx));
  const patch = { idx: i, mode: 'item' };
  if (s.rundown[i] && s.rundown[i].type === 'ad') patch.ad_started_at = new Date().toISOString();
  return patchState(patch);
}

export async function unpublishedChanges() {
  const [queued, s] = await Promise.all([listItems('queued'), getState()]);
  const a = JSON.stringify(queued.map(i => Object.fromEntries(CARD_FIELDS.map(k => [k, i[k] ?? null]))));
  return a !== JSON.stringify(s.rundown || []);
}

// Plain-text rundown used by the Telegram bot and by Claude for context.
export async function rundownText() {
  const [queued, backlog, s] = await Promise.all([listItems('queued'), listItems('backlog'), getState()]);
  const lines = [];
  lines.push(`RUNDOWN (${queued.length} items)${s.mode === 'item' ? ` · on stage: #${s.idx + 1}` : ''}`);
  queued.forEach((i, n) => lines.push(`${n + 1}. [${SEGMENT_LABEL[i.segment] || i.segment}] ${i.headline}${i.frame === 'opinion' ? ' (opinion)' : ''}`));
  if (!queued.length) lines.push('(empty)');
  lines.push('');
  lines.push(`BACKLOG (${backlog.length})`);
  backlog.forEach((i, n) => lines.push(`B${n + 1}. [${SEGMENT_LABEL[i.segment] || i.segment}] ${i.headline}`));
  if (!backlog.length) lines.push('(empty)');
  return lines.join('\n');
}

// Resolve "3" or "B2" to an item id.
export async function resolveRef(ref) {
  ref = String(ref).trim().toUpperCase();
  if (ref.startsWith('B')) {
    const list = await listItems('backlog');
    return list[parseInt(ref.slice(1), 10) - 1] || null;
  }
  const list = await listItems('queued');
  return list[parseInt(ref, 10) - 1] || null;
}
