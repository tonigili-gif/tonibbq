-- Reset total de ToniBBQ en Supabase.
-- Deja cada grupo sin usuarios, sin plan activo, sin historico, sin compras y sin chat.
-- Ejecutalo en el SQL Editor de Supabase cuando quieras vaciar la app completa.

alter table public.bbq_groups
add column if not exists archived_plans jsonb not null default '[]'::jsonb;

update public.bbq_groups
set
  friends = '[]'::jsonb,
  expenses = '[]'::jsonb,
  items = '[]'::jsonb,
  messages = '[]'::jsonb,
  archived_plans = '[]'::jsonb,
  plan = jsonb_build_object(
    'date', '',
    'bbqReserved', false,
    'tablesReserved', false,
    'notes', '',
    'archivedAt', null,
    'updatedAt', now()
  ),
  updated_reason = 'manual reset all',
  updated_at = now();
