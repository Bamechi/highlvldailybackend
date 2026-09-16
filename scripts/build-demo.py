#!/usr/bin/env python3
"""Builds demo.html: Desk + Stage in one self-contained file with sample data (no backend needed)."""
import pathlib, sys, json
root = pathlib.Path(__file__).resolve().parent.parent
a = lambda p: (root / 'assets' / p).read_text()

def svg_img(bg, fg, text):
    s = f"""<svg xmlns='http://www.w3.org/2000/svg' width='620' height='620' viewBox='0 0 620 620'><rect width='620' height='620' fill='{bg}'/><rect x='30' y='30' width='560' height='560' fill='none' stroke='{fg}' stroke-opacity='.35'/><text x='60' y='560' font-family='Helvetica,Arial' font-weight='800' font-size='72' fill='{fg}' letter-spacing='-3'>{text}</text><text x='60' y='90' font-family='Menlo,monospace' font-size='16' fill='{fg}' fill-opacity='.7' letter-spacing='3'>DEMO IMAGE</text></svg>"""
    from urllib.parse import quote
    return 'data:image/svg+xml;utf8,' + quote(s, safe="/:'=,. ")

def item(i, **k):
    base = dict(id=f'demo{i}', type='text', url=None, headline='', summary='', talking_points='', image_url=None, author=None, source='DESK', embed_html=None, segment='the-news', frame='standard', status='queued', position=i, added_by='desk')
    base.update(k); return base

items = [
    item(1, type='card', headline='THE OPEN', segment='the-open', source='SEGMENT'),
    item(2, headline='The AI layoffs nobody is counting', summary='Every quarter the headline number drops, and every quarter the roles that never get re-listed grow. The monologue is about the jobs that disappear without an announcement.', talking_points='Open with the barbershop story.\nName three roles that vanished this year.\nLand it on: build something that cannot be quietly removed.', segment='the-open', frame='opinion', source='MONOLOGUE', author='19Keys'),
    item(3, type='ad', headline="WE'LL BE RIGHT BACK", segment='the-news', source='AD BREAK'),
    item(4, type='card', headline='TECH NEWS', segment='tech-news', source='SEGMENT'),
    item(5, type='x', url='https://x.com/example/status/1', headline='Every founder I know is quietly replacing their first three hires with agents. Say it louder for the people still writing job descriptions.', author='@example', source='X', segment='tech-news', talking_points='Is this true at the seed stage or only post-Series A?\nWhat does the first human hire look like now?', added_by='telegram:1'),
    item(6, type='article', url='https://example.com/story', headline='Survey: four in ten under-30s take financial advice from creators before banks', summary='A new survey of 4,000 adults finds trust in creator-led money content now rivals traditional institutions for the under-30 cohort.', image_url=svg_img('#002FA7', '#F0EEE6', 'CREATORS'), source='Demo Wire', author='Staff', segment='the-news', talking_points='Who is liable when the advice is wrong?\nThis is the Creator Growth Program thesis in one stat.'),
    item(7, type='card', headline='CULTURE', segment='culture', source='SEGMENT'),
    item(8, type='instagram', url='https://www.instagram.com/p/demo/', headline='Reel: inside the Atlanta creator house, day one of the Peace on the Pond residency', author='@highlvl', source='Instagram', image_url=svg_img('#0B6B4B', '#F0EEE6', 'ATLANTA'), segment='culture', added_by='telegram:2'),
    item(9, type='card', headline='THE SHOUTOUT', segment='the-shoutout', source='SEGMENT'),
    item(10, headline='Shoutout of the Day: the 17-year-old who built a free tutoring app for his whole block', summary='Twelve tutors, two hundred students, zero funding. He starts college in the fall.', image_url=svg_img('#A49358', '#0B0B09', 'SHOUTOUT'), segment='the-shoutout', source='SHOUTOUT'),
    item(11, type='card', headline='THE SEAT', summary='Ziion members only. Call in from the community.', segment='the-seat', source='SEGMENT'),
    item(12, type='card', headline='THE CLOSE', summary='Tomorrow 4:44PM PT.', segment='the-close', source='SEGMENT'),
    item(13, status='backlog', type='article', url='https://example.com/chips', headline='Chipmaker says next-gen accelerators ship a quarter early', source='Demo Tech', segment='tech-news', added_by='telegram:1'),
    item(14, status='backlog', headline='Do we cover the London Black History Month lineup this week or next?', segment='culture', source='DESK'),
    item(15, status='backlog', type='x', url='https://x.com/example/status/2', headline='The best time to start a daily show was ten years ago. The second best time is 4:44 today.', author='@nineteenkeys', source='X', segment='the-open'),
]
for n, it in enumerate([i for i in items if i['status'] == 'backlog'], 1): it['position'] = n
fields = ['id','type','url','headline','summary','talking_points','image_url','author','source','embed_html','segment','frame']
rundown = [{k: i[k] for k in fields} for i in items if i['status'] == 'queued']
state = dict(id=1, rundown=rundown, idx=4, mode='item', ticker_on=True, upnext_on=True, sponsor_on=True, show_embed=False, ticker_text='', sponsor_name='SUPERMIND', sponsor_url='supermind.com', episode_label='EP 001', ad_seconds=90, ad_started_at=None, published_at='2026-09-16T16:00:00Z')
seed = json.dumps({'items': items, 'state': state})

html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>HIGH - LVL DAILY · Rundown (demo)</title>
<style>
{a('brand.css')}
{a('stage.css')}
{a('desk.css')}
html,body{{height:100%}}
body{{display:flex;flex-direction:column;overflow:hidden}}
.bar{{display:flex;align-items:center;gap:10px;padding:8px 14px;background:var(--ox);border-bottom:1px solid var(--gold);font-family:var(--mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;flex:none}}
.bar .lbl{{color:var(--paper);opacity:.8;margin-right:auto}}
.bar .btn{{padding:6px 10px;font-size:11px}}
.wrap{{flex:1;min-height:0;display:grid;grid-template-columns:1fr;position:relative}}
.wrap.split{{grid-template-columns:minmax(420px,46%) 1fr}}
.pane{{min-height:0;min-width:0;overflow:auto;position:relative}}
.pane.desk{{overflow:auto}}
.pane.stagepane{{overflow:hidden;background:#000;border-left:1px solid var(--gold)}}
.wrap:not(.split) .pane.hidden{{display:none}}
@media (max-width:900px){{.bar .lbl{{display:none}}.wrap.split{{grid-template-columns:1fr}}.wrap.split .pane.stagepane{{display:none}}}}
</style>
</head>
<body>
<div class="bar">
  <span class="lbl">HIGH - LVL DAILY rundown · demo mode · data lives in this browser only</span>
  <button class="btn" data-view="split">Split</button>
  <button class="btn" data-view="desk">Desk</button>
  <button class="btn" data-view="stage">Stage</button>
  <button class="btn ghost" id="reset">Reset demo</button>
</div>
<div class="wrap split" id="wrap">
  <div class="pane desk" id="deskPane"></div>
  <div class="pane stagepane" id="stagePane"></div>
</div>
<script>
{a('store.js')}
{a('stage.js')}
{a('desk.js')}
const SEED = {seed};
const store = HLD.createStore(null, () => JSON.parse(JSON.stringify(SEED)));
mountDesk(document.getElementById('deskPane'), store, {{}});
const stageApi = mountStage(document.getElementById('stagePane'), store);
const wrap = document.getElementById('wrap');
document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => {{
  const v = b.dataset.view; wrap.classList.toggle('split', v === 'split');
  document.getElementById('deskPane').classList.toggle('hidden', v === 'stage');
  document.getElementById('stagePane').classList.toggle('hidden', v === 'desk');
  document.querySelectorAll('[data-view]').forEach(x => x.classList.toggle('on', x === b));
  setTimeout(stageApi.fit, 30);
}});
document.querySelector('[data-view="split"]').classList.add('on');
document.getElementById('reset').onclick = () => {{ if (confirm('Reset the demo data?')) store.act('reset'); }};
</script>
</body>
</html>"""
out = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'demo.html'
out.write_text(html)
print('wrote', out, len(html), 'bytes')
