// Turns plain-English Telegram messages into show actions using Claude tool use.
// Destructive actions (delete) are returned as "pending" so the bot can ask for a tap to confirm.
import * as A from './actions.js';

const TOOLS = [
  { name: 'add_item', description: 'Add a new topic to the rundown or backlog from typed text (no URL).', input_schema: { type: 'object', properties: { headline: { type: 'string' }, summary: { type: 'string' }, talking_points: { type: 'string' }, segment: { type: 'string', enum: A.SEGMENTS }, frame: { type: 'string', enum: ['standard', 'opinion'] }, type: { type: 'string', enum: ['text', 'card', 'ad'], description: 'card = segment title card, ad = ad break' }, queue: { type: 'boolean', description: 'true puts it straight into the rundown' } }, required: ['headline'] } },
  { name: 'queue_item', description: 'Move a backlog item (B1, B2...) into the rundown, optionally at a position.', input_schema: { type: 'object', properties: { ref: { type: 'string' }, position: { type: 'integer' } }, required: ['ref'] } },
  { name: 'unqueue_item', description: 'Move a rundown item (1, 2...) back to the backlog.', input_schema: { type: 'object', properties: { ref: { type: 'string' } }, required: ['ref'] } },
  { name: 'move_item', description: 'Reorder: move rundown item to a new 1-based position.', input_schema: { type: 'object', properties: { ref: { type: 'string' }, position: { type: 'integer' } }, required: ['ref', 'position'] } },
  { name: 'edit_item', description: 'Change headline, summary, talking points, segment or frame of an item.', input_schema: { type: 'object', properties: { ref: { type: 'string' }, headline: { type: 'string' }, summary: { type: 'string' }, talking_points: { type: 'string' }, segment: { type: 'string', enum: A.SEGMENTS }, frame: { type: 'string', enum: ['standard', 'opinion'] } }, required: ['ref'] } },
  { name: 'delete_item', description: 'Trash an item. Requires confirmation from the user.', input_schema: { type: 'object', properties: { ref: { type: 'string' } }, required: ['ref'] } },
  { name: 'publish', description: 'Push the current rundown to the Stage.', input_schema: { type: 'object', properties: {} } },
  { name: 'stage', description: 'Live Stage control.', input_schema: { type: 'object', properties: { command: { type: 'string', enum: ['next', 'prev', 'goto', 'agenda', 'standby', 'ticker_on', 'ticker_off', 'upnext_on', 'upnext_off'] }, index: { type: 'integer', description: '1-based rundown position for goto' } }, required: ['command'] } },
  { name: 'set_ticker', description: 'Set the custom ticker line (empty string resets to the current headline).', input_schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } },
  { name: 'set_sponsor', description: 'Set the sponsor shown on the ticker and ad cards.', input_schema: { type: 'object', properties: { name: { type: 'string' }, url: { type: 'string' } }, required: ['name'] } },
];

const SYSTEM = `You are the producer bot for HIGH - LVL DAILY, 19Keys' weekday desk show. You manage the show rundown for B. Amechi (producer) and 19Keys (host).
Rundown items are numbered 1..N, backlog items B1..Bn. Segments: the-open, tech-news, the-news, culture, the-shoutout, the-seat, the-close.
Use tools to make changes. Be decisive: if the request is clear, act without asking. If a reference is ambiguous, ask a short question instead of guessing.
After acting, reply in one or two short lines. No emojis. Never invent items that do not exist in the rundown.
When asked to "build the agenda" or "set the order", produce a sensible broadcast order: THE OPEN card, monologue/opinion items, ad, TECH NEWS, THE NEWS, CULTURE, ad, THE SHOUTOUT, THE SEAT, THE CLOSE.`;

export async function interpret(userText, meta = {}) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { reply: 'ANTHROPIC_API_KEY is not set, so free-text commands are off. Use /help for slash commands.', pending: [] };
  const context = await A.rundownText();
  const body = {
    model: process.env.CLAUDE_MODEL || 'claude-sonnet-5',
    max_tokens: 1200,
    system: SYSTEM,
    tools: TOOLS,
    messages: [{ role: 'user', content: `Current show state:\n${context}\n\nMessage from ${meta.name || 'producer'}:\n${userText}` }],
  };
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) return { reply: `Claude error: ${j.error?.message || r.status}`, pending: [] };

  const results = [];
  const pending = [];
  for (const block of j.content || []) {
    if (block.type === 'text' && block.text.trim()) results.push(block.text.trim());
    if (block.type !== 'tool_use') continue;
    const out = await runTool(block.name, block.input, meta);
    if (out.pending) pending.push(out.pending); else if (out.line) results.push(out.line);
  }
  return { reply: results.join('\n'), pending };
}

export async function runTool(name, input, meta = {}) {
  const who = meta.added_by || 'telegram';
  try {
    switch (name) {
      case 'add_item': {
        const it = await A.addItem({ ...input, added_by: who, status: input.queue ? 'queued' : 'backlog' });
        return { line: `Added ${input.queue ? 'to rundown' : 'to backlog'}: ${it.headline}` };
      }
      case 'queue_item': {
        const it = await A.resolveRef(input.ref); if (!it) return { line: `No item ${input.ref}.` };
        await A.setStatus(it.id, 'queued');
        if (input.position) await A.moveQueued(it.id, input.position - 1);
        return { line: `Queued: ${it.headline}` };
      }
      case 'unqueue_item': {
        const it = await A.resolveRef(input.ref); if (!it) return { line: `No item ${input.ref}.` };
        await A.setStatus(it.id, 'backlog'); return { line: `Back to backlog: ${it.headline}` };
      }
      case 'move_item': {
        const it = await A.resolveRef(input.ref); if (!it) return { line: `No item ${input.ref}.` };
        await A.moveQueued(it.id, input.position - 1); return { line: `Moved to #${input.position}: ${it.headline}` };
      }
      case 'edit_item': {
        const it = await A.resolveRef(input.ref); if (!it) return { line: `No item ${input.ref}.` };
        const { ref, ...fields } = input; await A.updateItem(it.id, fields);
        return { line: `Updated: ${fields.headline || it.headline}` };
      }
      case 'delete_item': {
        const it = await A.resolveRef(input.ref); if (!it) return { line: `No item ${input.ref}.` };
        return { pending: { kind: 'delete', id: it.id, headline: it.headline } };
      }
      case 'publish': { const s = await A.publish(); return { line: `Published. ${s.rundown.length} items on the Stage.` }; }
      case 'stage': {
        const c = input.command;
        if (c === 'next') { const s = await A.go(1); return { line: `On stage: #${s.idx + 1} ${s.rundown[s.idx]?.headline || ''}` }; }
        if (c === 'prev') { const s = await A.go(-1); return { line: `On stage: #${s.idx + 1} ${s.rundown[s.idx]?.headline || ''}` }; }
        if (c === 'goto') { const s = await A.goto((input.index || 1) - 1); return { line: `On stage: #${s.idx + 1} ${s.rundown[s.idx]?.headline || ''}` }; }
        if (c === 'agenda') { await A.patchState({ mode: 'agenda' }); return { line: 'Agenda is on the Stage.' }; }
        if (c === 'standby') { await A.patchState({ mode: 'standby' }); return { line: 'Stage on standby.' }; }
        if (c === 'ticker_on' || c === 'ticker_off') { await A.patchState({ ticker_on: c === 'ticker_on' }); return { line: `Ticker ${c === 'ticker_on' ? 'on' : 'off'}.` }; }
        if (c === 'upnext_on' || c === 'upnext_off') { await A.patchState({ upnext_on: c === 'upnext_on' }); return { line: `Up Next ${c === 'upnext_on' ? 'on' : 'off'}.` }; }
        return { line: `Unknown stage command ${c}` };
      }
      case 'set_ticker': { await A.patchState({ ticker_text: input.text || '' }); return { line: input.text ? `Ticker: ${input.text}` : 'Ticker reset.' }; }
      case 'set_sponsor': { await A.patchState({ sponsor_name: input.name.toUpperCase(), sponsor_url: input.url || '' , sponsor_on: true }); return { line: `Sponsor: ${input.name}` }; }
      default: return { line: `Unknown tool ${name}` };
    }
  } catch (e) { return { line: `Error: ${e.message}` }; }
}
