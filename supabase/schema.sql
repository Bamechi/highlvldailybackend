-- HIGH - LVL DAILY Rundown — database schema
-- Paste this whole file into Supabase -> SQL Editor -> New query -> Run.

create extension if not exists pgcrypto;

-- Every topic, post, article, card or ad the show can put on the Stage.
create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'text',          -- x | instagram | article | text | card | ad
  url text,
  headline text not null default '',
  summary text not null default '',
  talking_points text not null default '',
  image_url text,
  author text,
  source text,
  embed_html text,
  segment text not null default 'the-news',   -- the-open | tech-news | the-news | culture | the-shoutout | the-seat | the-close
  frame text not null default 'standard',     -- standard | opinion
  status text not null default 'backlog',     -- backlog | queued | trash
  position integer not null default 0,
  added_by text not null default 'desk',      -- desk | telegram:<user id>
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row. What the Stage is showing right now.
create table if not exists stage_state (
  id integer primary key default 1 check (id = 1),
  rundown jsonb not null default '[]'::jsonb, -- published snapshot of queued items
  idx integer not null default 0,             -- index into rundown
  mode text not null default 'standby',       -- standby | item | agenda
  ticker_on boolean not null default true,
  upnext_on boolean not null default true,
  sponsor_on boolean not null default true,
  show_embed boolean not null default false,
  ticker_text text not null default '',
  sponsor_name text not null default 'SUPERMIND',
  sponsor_url text not null default 'asupermind.com',
  episode_label text not null default 'EP 001',
  ad_seconds integer not null default 90,
  ad_started_at timestamptz,
  published_at timestamptz,
  updated_at timestamptz not null default now()
);
insert into stage_state (id) values (1) on conflict (id) do nothing;

-- Added Sept 16: host names + full sponsor block. Safe to re-run.
alter table stage_state add column if not exists host1 text not null default '19KEYS';
alter table stage_state add column if not exists host2 text not null default 'B. AMECHI';
alter table stage_state add column if not exists sponsor_script text not null default 'Get Clarity in a cup today. Visit asupermind.com and try the best tasting mushroom coffee.';
alter table stage_state add column if not exists sponsor_qr text not null default '';

-- Telegram confirmations waiting for a yes/no tap.
create table if not exists pending_actions (
  id uuid primary key default gen_random_uuid(),
  chat_id bigint not null,
  action jsonb not null,
  created_at timestamptz not null default now()
);

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists items_touch on items;
create trigger items_touch before update on items for each row execute function touch_updated_at();
drop trigger if exists stage_touch on stage_state;
create trigger stage_touch before update on stage_state for each row execute function touch_updated_at();

-- Browser reads with the anon key; all writes go through the Vercel API with the service key.
alter table items enable row level security;
alter table stage_state enable row level security;
alter table pending_actions enable row level security;
drop policy if exists "public read items" on items;
create policy "public read items" on items for select using (true);
drop policy if exists "public read stage" on stage_state;
create policy "public read stage" on stage_state for select using (true);

-- Storage bucket for screenshots (only used when SCREENSHOTONE_ACCESS_KEY is set;
-- Microlink returns its own hosted URLs and needs no bucket).
insert into storage.buckets (id, name, public)
values ('shots', 'shots', true)
on conflict (id) do nothing;
drop policy if exists "public read shots" on storage.objects;
create policy "public read shots" on storage.objects for select using (bucket_id = 'shots');

-- Realtime: the Desk and the Stage subscribe to changes on these two tables.
do $$
begin
  begin alter publication supabase_realtime add table items; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table stage_state; exception when duplicate_object then null; end;
end $$;
