// mountStage(hostElement, store) — renders the broadcast view and keeps it in sync.
(function (global) {
  const L = () => global.HLD.SEGMENT_LABEL;
  const SITE = '19keys.com/daily'; // where the audience follows up on the show
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const hlSize = t => { const n = (t || '').length; return n <= 40 ? 's1' : n <= 80 ? 's2' : n <= 130 ? 's3' : n <= 200 ? 's4' : 's5'; };
  const ptTime = () => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', timeZone: 'America/Los_Angeles' }).format(new Date()) + ' PT';
  const ptDate = () => new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' }).format(new Date());

  function wordmark(size, compact) {
    return `<div class="wm ${compact ? 'compact' : ''}" style="font-size:${size}px"><div class="wm-l1">HIGH - LVL</div><div class="wm-l2">DAILY<span class="dot"></span></div><div class="wm-rule"></div><div class="wm-sub">${compact ? SITE : 'A HIGH - LVL NETWORK PRODUCTION · WEEKDAYS 4:44PM PT'}</div></div>`;
  }

  function nextTopic(state) {
    const r = state.rundown || [];
    return r.slice(state.idx + 1).find(c => c.type !== 'ad' && c.type !== 'card');
  }
  function renderItem(card, state) {
    if (!card) return renderStandby();
    if (card.type === 'card') return renderCard(card, state);
    if (card.type === 'ad') return renderAd(card, state);
    const src = [card.source, card.author].filter(Boolean).join(' · ') || 'DESK';
    const embed = state.show_embed && card.embed_html;
    let right = '';
    if (embed) right = `<div class="embed">${card.embed_html}</div>`;
    else if (card.image_url) right = `<img class="pic" src="${esc(card.image_url)}" alt="">`;
    else right = `<div class="segfield seg-${esc(card.segment)}"><div class="mark">${esc(card.source || 'HIGH - LVL DAILY')}</div><div class="big">${esc(L()[card.segment] || card.segment).replace(' ', '<br>')}</div></div>`;
    return `<div class="item">
      <div class="item-l">
        <div class="src"><span class="sq ${card.frame === 'opinion' ? 'red' : ''}"></span>${esc(src)}${card.frame === 'opinion' ? ' · OPINION' : ''}</div>
        <div class="hl ${hlSize(card.headline)}">${esc(card.headline)}</div>
        ${card.summary ? `<div class="sum">${esc(card.summary)}</div>` : ''}
        ${card.talking_points ? `<div class="tp">${esc(card.talking_points)}</div>` : ''}
      </div>
      <div class="item-r">${right}</div>
    </div>`;
  }

  function renderCard(card, state) {
    const label = L()[card.segment] || card.segment;
    const big = card.headline && card.headline.toUpperCase() !== label ? card.headline : label;
    const nx = state.upnext_on ? nextTopic(state) : null;
    const sub = card.summary || (nx ? `Up next: ${nx.headline}` : '');
    return `<div class="card seg-${esc(card.segment)}"><div class="ghost">${esc(label.split(' ').pop())}</div><div class="eyebrow">HIGH - LVL DAILY${big === label ? '' : ' · ' + esc(label)}</div><div class="big ${big.length > 14 ? 'small' : ''}">${esc(big)}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div>`;
  }

  function renderAd(card, state) {
    return `<div class="ad"><div class="big">${esc(card.headline || "WE'LL BE RIGHT BACK")}</div>
      ${state.sponsor_on ? `<div class="presented">Presented by <span class="sponsor">${esc(state.sponsor_name)}</span></div>` : ''}
      ${state.upnext_on && nextTopic(state) ? `<div class="sub">Up next: ${esc(nextTopic(state).headline)}</div>` : ''}
      <div class="site">${SITE}</div>
      <div class="count" data-ad-count></div></div>`;
  }

  function renderAgenda(state) {
    const r = state.rundown || [];
    const rows = r.map((c, i) => `<li class="${i < state.idx ? 'done' : i === state.idx ? 'now' : ''}"><span class="n">${String(i + 1).padStart(2, '0')}</span><span class="chip seg-${esc(c.segment)}">${esc(L()[c.segment] || c.segment)}</span><span class="h">${esc(c.headline)}</span></li>`).join('');
    return `<div class="agenda"><div class="title"><span>Today's rundown</span><span class="mono">${esc(state.episode_label)} · ${SITE}</span></div><ol class="${r.length > 9 ? 'two' : ''}">${rows || '<li><span class="n">--</span><span></span><span class="h">Nothing published yet</span></li>'}</ol></div>`;
  }

  function renderStandby() {
    return `<div class="standby">${wordmark(190, false)}<div class="starts">Weekdays · 4:44PM PT · ${SITE}</div></div>`;
  }

  global.mountStage = function (host, store) {
    host.classList.add('stage-host');
    host.innerHTML = `<div class="stage">
      <div class="frame"></div>
      <div class="brand">${wordmark(64, true)}</div>
      <div class="topright"><span class="chip" data-seg></span><span class="opchip chip" data-op hidden>Opinion</span><span class="ep" data-ep></span><span class="clock" data-clock></span></div>
      <div class="view"><div data-view></div></div>
      <div class="upnext hide"><div class="lab"><i></i>Up next</div><div class="h1" data-un1></div><div class="h2" data-un2></div></div>
      <div class="ticker"><div class="tk-brand">High - Lvl Daily</div><div class="tk-track"><div class="tk-text" data-tk></div></div><div class="tk-site">${SITE}</div><div class="tk-sponsor" data-sp hidden>Presented by <b data-spn></b></div><div class="tk-live"><div class="live"><i></i>Live</div></div></div>
      <div class="grain"></div>
    </div>`;
    const stage = host.querySelector('.stage');
    const $ = s => host.querySelector(s);
    const fit = () => { const s = Math.min(host.clientWidth / 1920, host.clientHeight / 1080); stage.style.transform = `translate(-50%,-50%) scale(${s})`; };
    new ResizeObserver(fit).observe(host); fit();
    setInterval(() => { $('[data-clock]').textContent = ptTime(); }, 1000);
    $('[data-clock]').textContent = ptTime();

    let key = null, adTimer = null;
    function paint({ state }) {
      const r = state.rundown || [];
      const card = state.mode === 'item' ? r[state.idx] : null;
      const seg = card ? card.segment : 'the-open';
      $('[data-ep]').textContent = `${state.episode_label} · ${ptDate()}`;
      const segEl = $('[data-seg]'); segEl.className = `chip seg-${seg}`; segEl.textContent = state.mode === 'agenda' ? 'RUNDOWN' : (L()[seg] || seg);
      $('[data-op]').hidden = !(card && card.frame === 'opinion');
      stage.classList.toggle('opinion', !!(card && card.frame === 'opinion'));

      // ticker
      const tkText = state.ticker_text || (card && card.type !== 'ad' && card.type !== 'card' ? card.headline : '') || '30 minutes a day to keep you in the know on all things AI, culture, and money, decoded by 19Keys';
      const tk = $('[data-tk]');
      const line = `${tkText}    ·    `;
      tk.textContent = line + line; // doubled for seamless loop
      requestAnimationFrame(() => { const track = tk.parentElement.clientWidth; const w = tk.scrollWidth / 2; tk.classList.toggle('scroll', w > track - 20); tk.style.setProperty('--tkdur', Math.max(18, w / 70) + 's'); if (w <= track - 20) tk.textContent = tkText; });
      $('.ticker').classList.toggle('hide', !state.ticker_on);
      $('[data-sp]').hidden = !state.sponsor_on; $('[data-spn]').textContent = state.sponsor_name;

      // up next
      const topics = state.mode === 'item' ? r.slice(state.idx + 1).filter(c => c.type !== 'ad' && c.type !== 'card') : [];
      const next = topics[0], next2 = topics[1];
      const un = $('.upnext');
      if (state.upnext_on && next && state.mode === 'item' && card && card.type !== 'ad' && card.type !== 'card') { un.classList.remove('hide'); $('[data-un1]').textContent = next.headline; $('[data-un2]').textContent = next2 ? `Then: ${next2.headline}` : (L()[next.segment] || ''); }
      else un.classList.add('hide');

      // main view (animate only when the thing on screen changes)
      const k = `${state.mode}|${state.idx}|${card ? card.id + card.headline + card.image_url + card.summary + card.talking_points + card.frame + state.show_embed : ''}|${state.mode === 'agenda' ? JSON.stringify(r.map(x => x.headline)) : ''}`;
      if (k !== key) {
        const wrap = $('.view'); const old = wrap.firstElementChild;
        const html = state.mode === 'agenda' ? renderAgenda(state) : state.mode === 'item' ? renderItem(card, state) : renderStandby();
        const swap = () => { wrap.innerHTML = `<div class="in">${html}</div>`; if (global.twttr && global.twttr.widgets) global.twttr.widgets.load(wrap); if (global.instgrm && global.instgrm.Embeds) global.instgrm.Embeds.process(); };
        if (old && key !== null) { old.classList.add('out'); setTimeout(swap, 200); } else swap();
        key = k;
      }
      // ad countdown
      clearInterval(adTimer);
      if (card && card.type === 'ad') {
        const tick = () => { const el = host.querySelector('[data-ad-count]'); if (!el) return; const start = state.ad_started_at ? new Date(state.ad_started_at).getTime() : Date.now(); const left = Math.max(0, state.ad_seconds - Math.floor((Date.now() - start) / 1000)); el.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`; };
        adTimer = setInterval(tick, 500); setTimeout(tick, 250);
      }
    }
    store.onChange(paint);
    return { fit };
  };
})(window);
