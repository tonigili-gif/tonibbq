create table if not exists public.bbq_groups (
  code text primary key,
  plan jsonb not null default '{}'::jsonb,
  archived_plans jsonb not null default '[]'::jsonb,
  friends jsonb not null default '[]'::jsonb,
  expenses jsonb not null default '[]'::jsonb,
  items jsonb not null default '[]'::jsonb,
  messages jsonb not null default '[]'::jsonb,
  updated_by text,
  updated_reason text,
  updated_at timestamptz not null default now()
);

alter table public.bbq_groups
add column if not exists archived_plans jsonb not null default '[]'::jsonb;

alter table public.bbq_groups
add column if not exists expenses jsonb not null default '[]'::jsonb;

alter table public.bbq_groups enable row level security;

drop policy if exists "anon can read bbq groups" on public.bbq_groups;
create policy "anon can read bbq groups"
on public.bbq_groups
for select
to anon
using (true);

drop policy if exists "anon can insert bbq groups" on public.bbq_groups;
create policy "anon can insert bbq groups"
on public.bbq_groups
for insert
to anon
with check (true);

drop policy if exists "anon can update bbq groups" on public.bbq_groups;
create policy "anon can update bbq groups"
on public.bbq_groups
for update
to anon
using (true)
with check (true);

alter publication supabase_realtime add table public.bbq_groups;
