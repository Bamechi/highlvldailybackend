// mountDesk(hostElement, store, options) — the producer's control surface.
(function (global) {
  const H = global.HLD;
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const segOptions = v => H.SEGMENTS.map(s => `<option value="${s}" ${s === v ? 'selected' : ''}>${H.SEGMENT_LABEL[s]}</option>`).join('');

  global.mountDesk = function (host, store, opts = {}) {
    host.classList.add('desk');
    host.innerHTML = `
      <div class="top">
        <div class="wm compact"><div class="wm-l1">HIGH - LVL</div><div class="wm-l2">DAILY<span class="dot"></span></div></div>
        <div class="title">Producer Desk</div>
        <div class="onair" data-onair></div>
        <button class="btn" data-publish>Publish</button>
        ${opts.stageUrl ? `<a class="btn ghost" href="${esc(opts.stageUrl)}" target="_blank" rel="noopener">Open Stage</a>` : ''}
        ${opts.extraTop || ''}
      </div>
      <div class="cols">
        <div class="col">
          <h2>Rundown <span class="cnt" data-qcnt></span></h2>
          <div class="list" data-queued></div>
          <div style="height:26px"></div>
          <h2>Backlog <span class="cnt" data-bcnt></span></h2>
          <div class="list" data-backlog></div>
        </div>
        <div class="col right">
          <div class="livepanel">
            <h2>Stage <span class="kbd">← → A S</span></h2>
            <div class="now" data-now></div>
            <div class="grid">
              <button class="btn" data-act="prev">Previous</button>
              <button class="btn" data-act="next">Next</button>
              <button class="btn" data-mode="agenda">Show agenda</button>
              <button class="btn" data-mode="standby">Standby</button>
            </div>
            <div class="toggles">
              <button class="btn sm" data-tog="ticker_on">Ticker</button>
              <button class="btn sm" data-tog="upnext_on">Up next</button>
              <button class="btn sm" data-tog="sponsor_on">Sponsor</button>
              <button class="btn sm" data-tog="show_embed">Live embed</button>
            </div>
            <label class="f">Ticker line (blank = current headline)</label>
            <input data-live="ticker_text" placeholder="Breaking: ...">
            <div class="row" style="margin-top:10px">
              <div style="flex:1"><label class="f" style="margin-top:0">Sponsor</label><input data-live="sponsor_name"></div>
              <div style="flex:1"><label class="f" style="margin-top:0">Episode</label><input data-live="episode_label"></div>
              <div style="width:90px"><label class="f" style="margin-top:0">Ad secs</label><input data-live="ad_seconds" type="number" min="10" step="5"></div>
            </div>
          </div>
          <div>
            <h2>Add</h2>
            <textarea data-add placeholder="Paste an X, Instagram or article link, or type a topic. Add a second line for talking points."></textarea>
            <div class="row" style="margin-top:8px">
              <div style="flex:1"><select data-addseg>${segOptions('the-news')}</select></div>
              <button class="btn" data-addto="backlog">To backlog</button>
              <button class="btn gold" data-addto="queued">To rundown</button>
            </div>
            <div class="row" style="margin-top:8px">
              <span class="kbd">Quick cards</span>
              ${H.SEGMENTS.map(s => `<button class="btn sm ghost" data-card="${s}">${H.SEGMENT_LABEL[s]}</button>`).join('')}
              <button class="btn sm ghost" data-card="ad">Ad break</button>
            </div>
          </div>
        </div>
      </div>
      <div class="toast" data-toast></div>`;

    const $ = s => host.querySelector(s);
    const $$ = s => [...host.querySelectorAll(s)];
    let toastT; const toast = m => { const t = $('[data-toast]'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 1800); };
    const act = async (a, p) => { try { return await store.act(a, p); } catch (e) { toast(e.message); throw e; } };

    // --- add ---
    async function add(status) {
      const raw = $('[data-add]').value.trim(); if (!raw) return;
      const lines = raw.split('\n'); const first = lines[0].trim(); const rest = lines.slice(1).join('\n').trim();
      const isUrl = /^https?:\/\//i.test(first);
      const seg = $('[data-addseg]').value;
      toast(isUrl ? 'Reading link…' : 'Adding…');
      await act('add', isUrl ? { url: first, talking_points: rest, segment: seg, status } : { text: first, talking_points: rest, segment: seg, status });
      $('[data-add]').value = ''; toast(status === 'queued' ? 'Added to rundown' : 'Added to backlog');
    }
    $$('[data-addto]').forEach(b => b.onclick = () => add(b.dataset.addto));
    $('[data-add]').addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') add('queued'); });
    $$('[data-card]').forEach(b => b.onclick = () => {
      const s = b.dataset.card;
      if (s === 'ad') act('add', { type: 'ad', headline: "WE'LL BE RIGHT BACK", segment: 'the-news', status: 'queued' });
      else act('add', { type: 'card', headline: H.SEGMENT_LABEL[s], segment: s, status: 'queued' });
    });

    // --- live ---
    $$('[data-act]').forEach(b => b.onclick = () => act(b.dataset.act));
    $$('[data-mode]').forEach(b => b.onclick = () => act('live', { patch: { mode: b.dataset.mode } }));
    $$('[data-tog]').forEach(b => b.onclick = () => act('live', { patch: { [b.dataset.tog]: !store.state[b.dataset.tog] } }));
    $$('[data-live]').forEach(inp => inp.addEventListener('change', () => { const k = inp.dataset.live; let v = inp.value; if (k === 'ad_seconds') v = parseInt(v, 10) || 90; if (k === 'sponsor_name') v = v.toUpperCase(); act('live', { patch: { [k]: v } }); }));
    $('[data-publish]').onclick = async () => { await act('publish'); toast('Published to the Stage'); };
    document.addEventListener('keydown', e => {
      if (e.target.matches('input,textarea,select') || e.metaKey || e.ctrlKey) return;
      if (e.key === 'ArrowRight') act('next'); if (e.key === 'ArrowLeft') act('prev');
      if (e.key === 'a' || e.key === 'A') act('live', { patch: { mode: 'agenda' } });
      if (e.key === 's' || e.key === 'S') act('live', { patch: { mode: 'standby' } });
    });

    // --- lists ---
    function itemRow(it, n, queued, onstage) {
      return `<div class="it ${onstage ? 'onstage' : ''}" draggable="${queued}" data-id="${it.id}">
        <div class="grip" title="Drag to reorder">${queued ? '⋮⋮' : ''}</div>
        <div class="n ${queued ? '' : 'b'}">${queued ? String(n).padStart(2, '0') : 'B' + n}</div>
        <div class="main">
          <div class="h" data-edit title="Click to edit">${esc(it.headline)}</div>
          <div class="meta">
            <span class="chip seg-${esc(it.segment)}" data-cycleseg title="Click to change segment">${H.SEGMENT_LABEL[it.segment] || it.segment}</span>
            <span class="s">${esc(it.source || it.type)}${it.author ? ' · ' + esc(it.author) : ''}</span>
            ${it.frame === 'opinion' ? '<span class="s op">Opinion</span>' : ''}
            ${it.image_url ? '<span class="s">img</span>' : ''}
            ${it.added_by && it.added_by.startsWith('telegram') ? '<span class="s">via Telegram</span>' : ''}
          </div>
        </div>
        <div class="acts">
          ${queued ? `<button class="btn sm ${onstage ? 'red' : ''}" data-go title="Put on stage">${onstage ? 'On air' : 'Air'}</button><button class="btn sm ghost" data-up title="Move up">↑</button><button class="btn sm ghost" data-down title="Move down">↓</button><button class="btn sm ghost" data-unq title="Back to backlog">Bench</button>` : `<button class="btn sm gold" data-q title="Add to rundown">Queue</button>`}
          <button class="btn sm ghost" data-open title="Edit details">Edit</button>
          <button class="btn sm ghost" data-trash title="Trash">✕</button>
        </div>
      </div>`;
    }

    function paint({ items, state }) {
      const queued = items.filter(i => i.status === 'queued'), backlog = items.filter(i => i.status === 'backlog');
      const r = state.rundown || []; const cur = state.mode === 'item' ? r[state.idx] : null;
      $('[data-qcnt]').textContent = queued.length; $('[data-bcnt]').textContent = backlog.length;
      $('[data-queued]').innerHTML = queued.length ? queued.map((it, i) => itemRow(it, i + 1, true, cur && cur.id === it.id)).join('') : `<div class="empty">Nothing in the rundown. Queue items from the backlog or add straight to the rundown, then press Publish.</div>`;
      $('[data-backlog]').innerHTML = backlog.length ? backlog.map((it, i) => itemRow(it, i + 1, false, false)).join('') : `<div class="empty">Backlog is empty. Paste links here or send them to the Telegram bot.</div>`;
      const dirty = H.isDirty(store);
      const pb = $('[data-publish]'); pb.classList.toggle('red', dirty); pb.textContent = dirty ? 'Publish changes' : 'Published';
      $('[data-now]').innerHTML = state.mode === 'agenda' ? '<small>On stage</small>Agenda' : state.mode === 'standby' ? '<small>On stage</small>Standby' : cur ? `<small>On stage · ${state.idx + 1} of ${r.length}</small>${esc(cur.headline)}` : '<small>On stage</small>Nothing published';
      $('[data-onair]').innerHTML = state.mode === 'item' && cur ? `<span class="red">On air</span> ${state.idx + 1}/${r.length} <b>${esc(cur.headline)}</b>` : `<span class="red">On air</span> <b>${state.mode}</b>`;
      $$('[data-tog]').forEach(b => b.classList.toggle('on', !!state[b.dataset.tog]));
      $$('[data-live]').forEach(inp => { if (document.activeElement !== inp) inp.value = state[inp.dataset.live] ?? ''; });
      $$('[data-mode]').forEach(b => b.classList.toggle('on', state.mode === b.dataset.mode));

      // row actions
      $$('.it').forEach(row => {
        const id = row.dataset.id; const it = items.find(x => x.id === id);
        row.querySelector('[data-open]').onclick = () => openEditor(it);
        row.querySelector('[data-edit]').onclick = () => openEditor(it);
        row.querySelector('[data-trash]').onclick = () => { if (confirm(`Trash "${it.headline}"?`)) act('status', { id, status: 'trash' }); };
        const q = row.querySelector('[data-q]'); if (q) q.onclick = () => act('status', { id, status: 'queued' });
        const u = row.querySelector('[data-unq]'); if (u) u.onclick = () => act('status', { id, status: 'backlog' });
        const g = row.querySelector('[data-go]'); if (g) g.onclick = async () => { const idx = (store.state.rundown || []).findIndex(c => c.id === id); if (idx < 0) { toast('Publish first, then this item can go on stage'); return; } act('goto', { idx }); };
        const up = row.querySelector('[data-up]'); if (up) up.onclick = () => move(queued, id, -1);
        const dn = row.querySelector('[data-down]'); if (dn) dn.onclick = () => move(queued, id, 1);
        row.querySelector('[data-cycleseg]').onclick = () => { const i = H.SEGMENTS.indexOf(it.segment); act('update', { id, fields: { segment: H.SEGMENTS[(i + 1) % H.SEGMENTS.length] } }); };
        if (row.draggable) {
          row.addEventListener('dragstart', e => { row.classList.add('dragging'); e.dataTransfer.setData('text/plain', id); });
          row.addEventListener('dragend', () => row.classList.remove('dragging'));
          row.addEventListener('dragover', e => { e.preventDefault(); row.classList.add('over'); });
          row.addEventListener('dragleave', () => row.classList.remove('over'));
          row.addEventListener('drop', e => { e.preventDefault(); row.classList.remove('over'); const from = e.dataTransfer.getData('text/plain'); if (from && from !== id) { const ids = queued.map(x => x.id).filter(x => x !== from); ids.splice(ids.indexOf(id), 0, from); act('reorder', { ids }); } });
        }
      });
    }
    function move(queued, id, d) { const ids = queued.map(x => x.id); const i = ids.indexOf(id); const j = i + d; if (j < 0 || j >= ids.length) return; [ids[i], ids[j]] = [ids[j], ids[i]]; act('reorder', { ids }); }

    // --- editor ---
    function openEditor(it) {
      const m = document.createElement('div'); m.className = 'modal';
      m.innerHTML = `<div class="box">
        <h3>Edit item</h3>
        <label class="f">Headline</label><textarea data-f="headline" style="min-height:64px;font-family:var(--tight);font-weight:600;font-size:18px">${esc(it.headline)}</textarea>
        <label class="f">Summary (shown under the headline)</label><textarea data-f="summary">${esc(it.summary)}</textarea>
        <label class="f">Talking points (gold rule block, for the hosts)</label><textarea data-f="talking_points">${esc(it.talking_points)}</textarea>
        <div class="row"><div style="flex:1"><label class="f">Segment</label><select data-f="segment">${segOptions(it.segment)}</select></div>
        <div style="flex:1"><label class="f">Frame</label><select data-f="frame"><option value="standard" ${it.frame === 'standard' ? 'selected' : ''}>Standard</option><option value="opinion" ${it.frame === 'opinion' ? 'selected' : ''}>Opinion (red frame)</option></select></div>
        <div style="flex:1"><label class="f">Type</label><select data-f="type">${['x', 'instagram', 'article', 'text', 'card', 'ad'].map(t => `<option ${it.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div></div>
        <label class="f">Image URL</label><input data-f="image_url" value="${esc(it.image_url || '')}">
        <div class="row"><div style="flex:1"><label class="f">Source label</label><input data-f="source" value="${esc(it.source || '')}"></div><div style="flex:1"><label class="f">Author / handle</label><input data-f="author" value="${esc(it.author || '')}"></div></div>
        <label class="f">Link</label><input data-f="url" value="${esc(it.url || '')}">
        <div class="row" style="margin-top:18px;justify-content:flex-end"><button class="btn ghost" data-cancel>Cancel</button><button class="btn gold" data-save>Save</button></div>
      </div>`;
      document.body.appendChild(m);
      const close = () => m.remove();
      m.querySelector('[data-cancel]').onclick = close; m.addEventListener('click', e => { if (e.target === m) close(); });
      m.querySelector('[data-save]').onclick = async () => { const fields = {}; m.querySelectorAll('[data-f]').forEach(el => { fields[el.dataset.f] = el.value; }); if (!fields.image_url) fields.image_url = null; await act('update', { id: it.id, fields }); close(); toast('Saved. Publish to update the Stage.'); };
      setTimeout(() => m.querySelector('[data-f="headline"]').focus(), 30);
    }

    store.onChange(paint);
  };
})(window);
