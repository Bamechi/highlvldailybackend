// Store: one interface, two backends.
//  - Supabase mode (production): reads + realtime via supabase-js (anon key), writes via /api/desk.
//  - Local mode (demo / no config): everything in the browser, synced across tabs with BroadcastChannel.
(function (global) {
  const SEGMENTS = ['the-open', 'tech-news', 'the-news', 'culture', 'the-shoutout', 'the-seat', 'the-close'];
  const SEGMENT_LABEL = { 'the-open': 'THE OPEN', 'tech-news': 'TECH NEWS', 'the-news': 'THE NEWS', 'culture': 'CULTURE', 'the-shoutout': 'THE SHOUTOUT', 'the-seat': 'THE SEAT', 'the-close': 'THE CLOSE' };
  const CARD_FIELDS = ['id', 'type', 'url', 'headline', 'summary', 'talking_points', 'image_url', 'author', 'source', 'embed_html', 'segment', 'frame'];
  const DEFAULT_STATE = { id: 1, rundown: [], idx: 0, mode: 'standby', ticker_on: true, upnext_on: true, sponsor_on: true, show_embed: false, ticker_text: '', sponsor_name: 'SUPERMIND', sponsor_url: 'supermind.com', episode_label: 'EP 001', ad_seconds: 90, ad_started_at: null, published_at: null };

  // ---------- Supabase backend ----------
  function supabaseStore(cfg) {
    const sb = global.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: false } });
    let items = [], state = { ...DEFAULT_STATE };
    const subs = new Set();
    const emit = () => subs.forEach(fn => fn({ items, state }));
    async function refresh() {
      const [a, b] = await Promise.all([
        sb.from('items').select('*').neq('status', 'trash').order('position').order('created_at'),
        sb.from('stage_state').select('*').eq('id', 1).single(),
      ]);
      if (a.data) items = a.data;
      if (b.data) state = b.data;
      emit();
    }
    sb.channel('hld')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stage_state' }, refresh)
      .subscribe();
    setInterval(refresh, 15000); // belt and braces if realtime drops
    refresh();
    async function act(action, payload = {}) {
      const r = await fetch('/api/desk', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...payload }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      refresh();
      return j;
    }
    return { mode: 'supabase', get items() { return items; }, get state() { return state; }, onChange: fn => { subs.add(fn); fn({ items, state }); return () => subs.delete(fn); }, act, refresh };
  }

  // ---------- Local backend (demo) ----------
  function localStore(seed) {
    const KEY = 'hld_demo_v1';
    const chan = ('BroadcastChannel' in global) ? new BroadcastChannel('hld_demo') : null;
    let data;
    try { data = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { data = null; }
    if (!data) data = seed ? seed() : { items: [], state: { ...DEFAULT_STATE } };
    const subs = new Set();
    const live = () => ({ items: data.items.filter(i => i.status !== 'trash').sort((a, b) => a.position - b.position), state: data.state });
    const emit = () => subs.forEach(fn => fn(live()));
    const save = (broadcast = true) => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {} if (broadcast && chan) chan.postMessage('sync'); emit(); };
    if (chan) chan.onmessage = () => { try { data = JSON.parse(localStorage.getItem(KEY)) || data; } catch {} emit(); };
    const uid = () => 'i' + Math.random().toString(36).slice(2, 10);
    const byStatus = s => data.items.filter(i => i.status === s).sort((a, b) => a.position - b.position);
    const nextPos = s => (byStatus(s).slice(-1)[0]?.position || 0) + 1;
    const snapshot = () => byStatus('queued').map(i => Object.fromEntries(CARD_FIELDS.map(k => [k, i[k] ?? null])));
    function goto(i) {
      const n = data.state.rundown.length; if (!n) return;
      data.state.idx = Math.max(0, Math.min(n - 1, i)); data.state.mode = 'item';
      if (data.state.rundown[data.state.idx]?.type === 'ad') data.state.ad_started_at = new Date().toISOString();
    }
    async function act(action, p = {}) {
      switch (action) {
        case 'add': {
          let row;
          if (p.url) {
            let host = p.url; try { host = new URL(p.url).hostname.replace(/^www\./, ''); } catch {}
            const type = /x\.com|twitter\.com/.test(host) ? 'x' : /instagram\.com/.test(host) ? 'instagram' : 'article';
            row = { type, url: p.url, headline: p.headline || `Link from ${host} (demo mode reads titles only when deployed)`, summary: p.summary || '', source: type === 'x' ? 'X' : type === 'instagram' ? 'Instagram' : host, author: null, image_url: null };
          } else {
            row = { type: p.type || 'text', headline: (p.headline || p.text || '').slice(0, 240), summary: p.summary || '', source: p.type === 'card' ? 'SEGMENT' : p.type === 'ad' ? 'AD BREAK' : 'DESK' };
          }
          const status = p.status || 'backlog';
          data.items.push({ id: uid(), talking_points: p.talking_points || '', segment: p.segment || 'the-news', frame: p.frame || 'standard', embed_html: null, added_by: 'desk', created_at: new Date().toISOString(), ...row, status, position: nextPos(status) });
          break;
        }
        case 'update': { const it = data.items.find(i => i.id === p.id); if (it) Object.assign(it, p.fields || {}); break; }
        case 'status': { const it = data.items.find(i => i.id === p.id); if (it) { it.status = p.status; it.position = nextPos(p.status); } break; }
        case 'reorder': { (p.ids || []).forEach((id, i) => { const it = data.items.find(x => x.id === id); if (it) { it.position = i + 1; it.status = 'queued'; } }); break; }
        case 'publish': { data.state.rundown = snapshot(); data.state.idx = Math.min(data.state.idx, Math.max(0, data.state.rundown.length - 1)); data.state.published_at = new Date().toISOString(); if (data.state.mode === 'standby' && data.state.rundown.length) data.state.mode = 'item'; break; }
        case 'live': Object.assign(data.state, p.patch || {}); break;
        case 'next': goto(data.state.idx + 1); break;
        case 'prev': goto(data.state.idx - 1); break;
        case 'goto': goto(p.idx | 0); break;
        case 'dirty': return { dirty: JSON.stringify(snapshot()) !== JSON.stringify(data.state.rundown) };
        case 'reset': data = seed ? seed() : { items: [], state: { ...DEFAULT_STATE } }; break;
      }
      data.state.updated_at = new Date().toISOString();
      save();
      return { ok: true };
    }
    setTimeout(emit, 0);
    return { mode: 'local', get items() { return live().items; }, get state() { return data.state; }, onChange: fn => { subs.add(fn); fn(live()); return () => subs.delete(fn); }, act, refresh: emit };
  }

  function isDirty(store) {
    const snap = store.items.filter(i => i.status === 'queued').map(i => Object.fromEntries(CARD_FIELDS.map(k => [k, i[k] ?? null])));
    return JSON.stringify(snap) !== JSON.stringify(store.state.rundown || []);
  }

  global.HLD = { SEGMENTS, SEGMENT_LABEL, CARD_FIELDS, DEFAULT_STATE, isDirty,
    createStore(cfg, seed) { return (cfg && cfg.supabaseUrl && global.supabase) ? supabaseStore(cfg) : localStore(seed); } };
})(window);
