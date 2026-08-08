-- ============================================================
-- Tabs — cloud-synced website collection & tab manager
-- Core schema: profiles, collections, saved_tabs, user_settings
-- ============================================================

-- ---------- shared helpers ----------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------- profiles ----------

create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.profiles is 'Public profile data, one row per auth user.';

-- ---------- collections ----------

create table public.collections (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 200),
  description text check (char_length(description) <= 2000),
  collapsed   boolean not null default false,
  -- fractional index: inserting between 1000 and 2000 assigns 1500,
  -- so a single move never rewrites its siblings.
  position    double precision not null default 1000,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index collections_user_position_idx on public.collections (user_id, position, id);

-- ---------- saved_tabs ----------

create table public.saved_tabs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  collection_id uuid not null references public.collections(id) on delete cascade,

  title         text not null default '',
  url           text not null check (char_length(url) between 1 and 4000),

  description   text check (char_length(description) <= 2000),
  favicon       text,
  favicon_url   text,

  tags          jsonb not null default '[]'::jsonb check (jsonb_typeof(tags) = 'array'),

  position      double precision not null default 1000,

  -- Normalization is done client-side (JS URL parser) so the app and the
  -- database can never disagree about what "the same site" means.
  normalized_url text,

  -- Millisecond epoch from an imported v2.0 export, preserved verbatim.
  original_created_at bigint,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index saved_tabs_collection_position_idx on public.saved_tabs (collection_id, position, id);
create index saved_tabs_user_idx               on public.saved_tabs (user_id);
create index saved_tabs_user_normalized_idx    on public.saved_tabs (user_id, normalized_url);
create index saved_tabs_tags_idx               on public.saved_tabs using gin (tags jsonb_path_ops);

-- ---------- user_settings ----------

create table public.user_settings (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  theme               text not null default 'system' check (theme in ('system', 'light', 'dark')),
  double_shift_search boolean not null default true,
  fuzzy_search        boolean not null default true,
  search_descriptions boolean not null default true,
  search_tags         boolean not null default true,
  view_mode           text not null default 'list' check (view_mode in ('list', 'grid', 'compact')),
  sidebar_open        boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ---------- updated_at triggers ----------

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger collections_set_updated_at
  before update on public.collections
  for each row execute function public.set_updated_at();

create trigger saved_tabs_set_updated_at
  before update on public.saved_tabs
  for each row execute function public.set_updated_at();

create trigger user_settings_set_updated_at
  before update on public.user_settings
  for each row execute function public.set_updated_at();

-- ---------- provision rows for every new auth user ----------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- Trigger-only. Must not be reachable as a PostgREST RPC endpoint.
revoke execute on function public.handle_new_user() from anon, authenticated, public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- Row Level Security — a user may only ever touch their own rows.
-- (select auth.uid()) is wrapped so Postgres hoists it to an
-- InitPlan instead of re-evaluating it per row.
-- ============================================================

alter table public.profiles      enable row level security;
alter table public.collections   enable row level security;
alter table public.saved_tabs    enable row level security;
alter table public.user_settings enable row level security;

-- profiles
create policy "profiles: select own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "profiles: insert own" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles: update own" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "profiles: delete own" on public.profiles
  for delete to authenticated using ((select auth.uid()) = id);

-- collections
create policy "collections: select own" on public.collections
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "collections: insert own" on public.collections
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "collections: update own" on public.collections
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "collections: delete own" on public.collections
  for delete to authenticated using ((select auth.uid()) = user_id);

-- saved_tabs
create policy "saved_tabs: select own" on public.saved_tabs
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "saved_tabs: insert own" on public.saved_tabs
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "saved_tabs: update own" on public.saved_tabs
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "saved_tabs: delete own" on public.saved_tabs
  for delete to authenticated using ((select auth.uid()) = user_id);

-- user_settings
create policy "user_settings: select own" on public.user_settings
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "user_settings: insert own" on public.user_settings
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "user_settings: update own" on public.user_settings
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "user_settings: delete own" on public.user_settings
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------- realtime ----------

alter publication supabase_realtime add table public.collections;
alter publication supabase_realtime add table public.saved_tabs;
alter publication supabase_realtime add table public.user_settings;

-- REPLICA IDENTITY FULL so DELETE events carry enough data for the
-- client to evict the right row from its normalized store.
alter table public.collections   replica identity full;
alter table public.saved_tabs    replica identity full;
alter table public.user_settings replica identity full;
