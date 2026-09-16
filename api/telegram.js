// Telegram webhook. Set with:
//   https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<your-domain>/api/telegram&secret_token=<TELEGRAM_WEBHOOK_SECRET>&drop_pending_updates=true
import { json, readBody } from '../lib/auth.js';
import { send, answer, edit, esc, allowed, extractUrls } from '../lib/telegram.js';
import { db } from '../lib/db.js';
import * as A from '../lib/actions.js';
import { interpret, runTool } from '../lib/producer.js';

const HELP = `<b>HIGH - LVL DAILY producer bot</b>
Send any X, Instagram or article link and it lands in the backlog.
Type anything else in plain English ("move 3 to the top", "build the agenda", "delete B2") and it gets done.

Commands:
/list - rundown and backlog
/agenda - put the agenda on the Stage
/next  /prev  /go 3 - drive the Stage
/queue B2  /unqueue 4  /delete 3
/publish - push the rundown to the Stage
/standby - blank the Stage to the wordmark
/ticker your text - custom ticker line (/ticker reset)
/id - show your Telegram ID`;

async function confirmButtons(chat_id, pendingList) {
  for (const p of pendingList) {
    const { data } = await db().from('pending_actions').insert({ chat_id, action: p }).select().single();
    await send(chat_id, `Delete <b>${esc(p.headline)}</b>?`, { reply_markup: { inline_keyboard: [[{ text: 'Yes, delete', callback_data: `ok:${data.id}` }, { text: 'Keep it', callback_data: `no:${data.id}` }]] } });
  }
}

async function handleMessage(msg) {
  const chat_id = msg.chat.id;
  const from = msg.from || {};
  const gate = allowed(from.id);
  if (!gate.configured) {
    await send(chat_id, `Bot is online but no producers are allowed yet.\nYour Telegram ID is <code>${from.id}</code>. Add it to TELEGRAM_ALLOWED_IDS on Vercel and redeploy.`);
    return;
  }
  if (!gate.ok) return; // strangers are ignored silently

  const text = (msg.text || msg.caption || '').trim();
  const who = `telegram:${from.id}`;
  const name = from.first_name || from.username || 'producer';

  if (/^\/(start|help)\b/.test(text)) return send(chat_id, HELP);
  if (/^\/id\b/.test(text)) return send(chat_id, `Your Telegram ID: <code>${from.id}</code>`);
  if (/^\/list\b/.test(text)) return send(chat_id, `<pre>${esc(await A.rundownText())}</pre>`);
  if (/^\/agenda\b/.test(text)) { await A.patchState({ mode: 'agenda' }); return send(chat_id, 'Agenda is on the Stage.'); }
  if (/^\/standby\b/.test(text)) { await A.patchState({ mode: 'standby' }); return send(chat_id, 'Stage on standby.'); }
  if (/^\/next\b/.test(text)) { const s = await A.go(1); return send(chat_id, `On stage #${s.idx + 1}: ${esc(s.rundown[s.idx]?.headline || '')}`); }
  if (/^\/prev\b/.test(text)) { const s = await A.go(-1); return send(chat_id, `On stage #${s.idx + 1}: ${esc(s.rundown[s.idx]?.headline || '')}`); }
  let m;
  if ((m = text.match(/^\/go\s+(\d+)/))) { const s = await A.goto(+m[1] - 1); return send(chat_id, `On stage #${s.idx + 1}: ${esc(s.rundown[s.idx]?.headline || '')}`); }
  if ((m = text.match(/^\/queue\s+(\S+)(?:\s+(\d+))?/))) { const r = await runTool('queue_item', { ref: m[1], position: m[2] ? +m[2] : undefined }, { added_by: who }); return send(chat_id, esc(r.line)); }
  if ((m = text.match(/^\/unqueue\s+(\S+)/))) { const r = await runTool('unqueue_item', { ref: m[1] }, { added_by: who }); return send(chat_id, esc(r.line)); }
  if ((m = text.match(/^\/delete\s+(\S+)/))) { const r = await runTool('delete_item', { ref: m[1] }); if (r.pending) return confirmButtons(chat_id, [r.pending]); return send(chat_id, esc(r.line)); }
  if (/^\/publish\b/.test(text)) { const s = await A.publish(); return send(chat_id, `Published. ${s.rundown.length} items on the Stage.`); }
  if ((m = text.match(/^\/ticker\s*(.*)/s))) { const t = m[1].trim(); await A.patchState({ ticker_text: t.toLowerCase() === 'reset' ? '' : t }); return send(chat_id, t.toLowerCase() === 'reset' || !t ? 'Ticker reset.' : `Ticker: ${esc(t)}`); }

  // Links: every URL becomes a backlog item.
  const urls = extractUrls(msg);
  if (urls.length) {
    const note = text.replace(/https?:\/\/\S+/g, '').trim();
    const added = [];
    for (const u of urls.slice(0, 10)) {
      try { added.push(await A.addItem({ url: u, talking_points: note, added_by: who })); }
      catch (e) { await send(chat_id, `Could not add ${esc(u)}: ${esc(e.message)}`); }
    }
    for (const it of added) {
      await send(chat_id, `<b>${esc(it.headline)}</b>\n${esc((it.source || it.type).toUpperCase())}${it.author ? ' · ' + esc(it.author) : ''} · ${esc(A.SEGMENT_LABEL[it.segment])}\nIn the backlog.`, {
        reply_markup: { inline_keyboard: [[{ text: 'Queue it', callback_data: `q:${it.id}` }, { text: 'Opinion frame', callback_data: `op:${it.id}` }, { text: 'Trash', callback_data: `t:${it.id}` }]] },
      });
    }
    return;
  }

  if (!text) return;
  // Everything else: Claude interprets and acts.
  const { reply, pending } = await interpret(text, { name, added_by: who });
  if (reply) await send(chat_id, esc(reply));
  if (pending.length) await confirmButtons(chat_id, pending);
}

async function handleCallback(cb) {
  const chat_id = cb.message.chat.id;
  const gate = allowed(cb.from.id);
  if (!gate.ok) return answer(cb.id, 'Not allowed');
  const [kind, id] = cb.data.split(':');
  try {
    if (kind === 'q') { await A.setStatus(id, 'queued'); await answer(cb.id, 'Queued'); return edit(chat_id, cb.message.message_id, cb.message.text + '\n\nQueued into the rundown.'); }
    if (kind === 't') { await A.setStatus(id, 'trash'); await answer(cb.id, 'Trashed'); return edit(chat_id, cb.message.message_id, cb.message.text + '\n\nTrashed.'); }
    if (kind === 'op') { await A.updateItem(id, { frame: 'opinion' }); await answer(cb.id, 'Opinion frame set'); return edit(chat_id, cb.message.message_id, cb.message.text + '\n\nOpinion frame on.'); }
    if (kind === 'ok' || kind === 'no') {
      const { data: p } = await db().from('pending_actions').select('*').eq('id', id).single();
      await db().from('pending_actions').delete().eq('id', id);
      if (!p) return answer(cb.id, 'Expired');
      if (kind === 'no') { await answer(cb.id, 'Kept'); return edit(chat_id, cb.message.message_id, `Kept: ${esc(p.action.headline)}`); }
      if (p.action.kind === 'delete') { await A.setStatus(p.action.id, 'trash'); await answer(cb.id, 'Deleted'); return edit(chat_id, cb.message.message_id, `Deleted: ${esc(p.action.headline)}`); }
    }
  } catch (e) { await answer(cb.id, 'Error'); await send(chat_id, `Error: ${esc(e.message)}`); }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 200, { ok: true, hint: 'Telegram webhook endpoint' });
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers['x-telegram-bot-api-secret-token'] !== secret) return json(res, 401, { error: 'bad secret' });
  const update = await readBody(req);
  try {
    if (update.message) await handleMessage(update.message);
    else if (update.channel_post) await handleMessage(update.channel_post);
    else if (update.callback_query) await handleCallback(update.callback_query);
  } catch (e) {
    console.error(e);
    const chat = update.message?.chat?.id || update.callback_query?.message?.chat?.id;
    if (chat) await send(chat, `Error: ${esc(e.message)}`);
  }
  return json(res, 200, { ok: true }); // always 200 so Telegram does not retry
}
