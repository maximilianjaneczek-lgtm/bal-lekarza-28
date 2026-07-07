-- Bal Lekarza 2028 - minimalny most do Supabase.
-- Uruchom ten plik w Supabase SQL Editor przed ustawieniem zmiennych na serwerze.

create table if not exists public.app_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

-- Celowo bez publicznych polityk RLS.
-- Dostep do tego wiersza powinien miec tylko backend przez klucz server-side.

insert into public.app_state (id, data)
values (
  'main',
  '{
    "version": 1,
    "settings": {},
    "infopack": { "schedule": [], "sections": [] },
    "layouts": {},
    "participants": [],
    "registrations": [],
    "assets": [],
    "notifications": [],
    "scheduledNotifications": [],
    "paymentImports": [],
    "users": []
  }'::jsonb
)
on conflict (id) do nothing;
