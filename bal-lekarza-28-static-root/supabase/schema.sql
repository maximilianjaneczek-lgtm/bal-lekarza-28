-- Bal Lekarza 2028 - statyczna strona + Supabase.
-- Uruchom calosc w Supabase SQL Editor przed wrzuceniem strony na GitHuba.
-- Ten schemat nie uzywa tajnego klucza Supabase w frontendzie.

create extension if not exists pgcrypto;

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  owner_id uuid references auth.users(id) on delete set null,
  participant_type text not null default 'absolwent',
  invited_by uuid references public.participants(id) on delete set null,
  name text not null,
  email text,
  phone text,
  album_number text,
  dean_group text,
  diet text not null default 'standard',
  companion_name text,
  companion_diet text,
  transport_mode text not null default 'none',
  seating_preference text,
  note text,
  paid_deposit boolean not null default false,
  paid_installment1 boolean not null default false,
  paid_installment2 boolean not null default false,
  paid_transport boolean not null default false,
  manual_verified boolean not null default false,
  registration_status text not null default 'nowy zapis',
  room_id text,
  room_name text,
  table_id text,
  seat_no text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists participants_album_number_unique
  on public.participants (upper(album_number))
  where album_number is not null and album_number <> '';

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  role text not null default 'participant',
  participant_id uuid references public.participants(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.site_state (
  id text primary key default 'main',
  settings jsonb not null default '{}'::jsonb,
  infopack jsonb not null default '{}'::jsonb,
  tables jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.site_state (id, settings, infopack, tables)
values (
  'main',
  '{
    "eventName": "Bal Lekarza 2028",
    "subtitle": "Konto uczestnika, platnosci i infopak",
    "heroCopy": "Twoje miejsce, platnosci, dieta, transport i infopak w jednej eleganckiej stronie.",
    "venueName": "Bialy Dom",
    "venueAddress": "ul. Karola Darwina 50, 44-177 Paniowki",
    "mapUrl": "https://maps.google.com/?q=Bia%C5%82y%20Dom%20Karola%20Darwina%2050%20Pani%C3%B3wki",
    "organizedTransportInfo": "Informacje o transporcie zorganizowanym pojawia sie po zatwierdzeniu listy.",
    "ownTransportInfo": "Transport wlasny: przy obiekcie dostepny jest parking. Liczba miejsc moze byc ograniczona.",
    "seatingVisible": false,
    "seatingLockedMessage": "Plan stolikow jest jeszcze w przygotowaniu.",
    "theme": { "primary": "#173d35", "background": "#f8f2e7" }
  }'::jsonb,
  '{
    "intro": "Infopak Bal Lekarza 2028. Wszystkie tresci administrator moze edytowac w panelu.",
    "schedule": [
      { "time": "19:00", "title": "Rozpoczecie czesci oficjalnej" },
      { "time": "19:45", "title": "Danie glowne" },
      { "time": "22:30", "title": "Kolacja I" },
      { "time": "00:00", "title": "Kolacja II" },
      { "time": "04:00", "title": "Zakonczenie" }
    ],
    "sections": [
      { "title": "Dress code", "body": "Elegancki wieczorowy charakter wydarzenia." },
      { "title": "Diety", "body": "Diete mozna oznaczyc w profilu uczestnika." },
      { "title": "Transport", "body": "Uczestnik wybiera transport zorganizowany, wlasny albo brak transportu." }
    ]
  }'::jsonb,
  '[
    {
      "roomId": "sala-glowna",
      "roomName": "Sala glowna",
      "tables": [
        { "id": "S1", "label": "Stol 1", "capacity": 10 },
        { "id": "S2", "label": "Stol 2", "capacity": 10 },
        { "id": "S3", "label": "Stol 3", "capacity": 10 },
        { "id": "S4", "label": "Stol 4", "capacity": 10 },
        { "id": "S5", "label": "Stol 5", "capacity": 10 },
        { "id": "S6", "label": "Stol 6", "capacity": 10 },
        { "id": "S7", "label": "Stol 7", "capacity": 10 },
        { "id": "S8", "label": "Stol 8", "capacity": 10 },
        { "id": "S9", "label": "Stol 9", "capacity": 10 },
        { "id": "S10", "label": "Stol 10", "capacity": 10 }
      ]
    }
  ]'::jsonb
)
on conflict (id) do nothing;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

create or replace function public.register_participant(payload jsonb)
returns public.participants
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', payload ->> 'email', ''));
  v_album text := upper(regexp_replace(coalesce(payload ->> 'album_number', ''), '[[:space:]_-]+', '', 'g'));
  v_participant public.participants;
  v_companion text := nullif(trim(coalesce(payload ->> 'companion_name', '')), '');
begin
  if v_user_id is null then
    raise exception 'Musisz byc zalogowany.';
  end if;

  if exists (select 1 from public.profiles where id = v_user_id) then
    raise exception 'To konto ma juz profil.';
  end if;

  if v_album = '' then
    raise exception 'Numer albumu jest wymagany.';
  end if;

  if exists (
    select 1
    from public.participants
    where upper(album_number) = v_album
      and owner_id is not null
      and owner_id <> v_user_id
  ) then
    raise exception 'Ten numer albumu jest juz zapisany.';
  end if;

  select *
  into v_participant
  from public.participants
  where owner_id is null
    and (
      upper(coalesce(album_number, '')) = v_album
      or lower(coalesce(email, '')) = v_email
    )
  order by created_at
  limit 1;

  if found then
    update public.participants
    set
      owner_id = v_user_id,
      name = coalesce(nullif(trim(payload ->> 'name'), ''), name),
      email = v_email,
      phone = nullif(trim(coalesce(payload ->> 'phone', phone)), ''),
      album_number = v_album,
      dean_group = nullif(trim(coalesce(payload ->> 'dean_group', dean_group)), ''),
      diet = coalesce(nullif(payload ->> 'diet', ''), diet, 'standard'),
      companion_name = nullif(trim(coalesce(payload ->> 'companion_name', companion_name)), ''),
      companion_diet = coalesce(nullif(payload ->> 'companion_diet', ''), companion_diet, 'standard'),
      transport_mode = coalesce(nullif(payload ->> 'transport_mode', ''), transport_mode, 'none'),
      seating_preference = nullif(trim(coalesce(payload ->> 'seating_preference', seating_preference)), ''),
      updated_at = now()
    where id = v_participant.id
    returning * into v_participant;
  else
    insert into public.participants (
      owner_id,
      participant_type,
      name,
      email,
      phone,
      album_number,
      dean_group,
      diet,
      companion_name,
      companion_diet,
      transport_mode,
      seating_preference
    )
    values (
      v_user_id,
      'absolwent',
      nullif(trim(payload ->> 'name'), ''),
      v_email,
      nullif(trim(payload ->> 'phone'), ''),
      v_album,
      nullif(trim(payload ->> 'dean_group'), ''),
      coalesce(nullif(payload ->> 'diet', ''), 'standard'),
      v_companion,
      coalesce(nullif(payload ->> 'companion_diet', ''), 'standard'),
      coalesce(nullif(payload ->> 'transport_mode', ''), 'none'),
      nullif(trim(payload ->> 'seating_preference'), '')
    )
    returning * into v_participant;
  end if;

  if v_companion is not null then
    insert into public.participants (
      owner_id,
      participant_type,
      invited_by,
      name,
      email,
      diet,
      transport_mode,
      registration_status
    )
    values (
      v_user_id,
      'gosc absolwenta',
      v_participant.id,
      v_companion,
      null,
      coalesce(nullif(payload ->> 'companion_diet', ''), 'standard'),
      coalesce(nullif(payload ->> 'transport_mode', ''), 'none'),
      'gosc absolwenta'
    )
    on conflict do nothing;
  end if;

  insert into public.profiles (id, email, display_name, role, participant_id)
  values (v_user_id, v_email, v_participant.name, 'participant', v_participant.id);

  return v_participant;
end;
$$;

create or replace function public.update_my_participant(payload jsonb)
returns public.participants
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_participant_id uuid;
  v_participant public.participants;
begin
  if v_user_id is null then
    raise exception 'Musisz byc zalogowany.';
  end if;

  select participant_id into v_participant_id
  from public.profiles
  where id = v_user_id;

  if v_participant_id is null then
    raise exception 'Brak przypisanego uczestnika.';
  end if;

  update public.participants
  set
    phone = nullif(trim(coalesce(payload ->> 'phone', phone)), ''),
    diet = coalesce(nullif(payload ->> 'diet', ''), diet),
    transport_mode = coalesce(nullif(payload ->> 'transport_mode', ''), transport_mode),
    seating_preference = nullif(trim(coalesce(payload ->> 'seating_preference', seating_preference)), ''),
    updated_at = now()
  where id = v_participant_id
    and owner_id = v_user_id
  returning * into v_participant;

  return v_participant;
end;
$$;

alter table public.participants enable row level security;
alter table public.profiles enable row level security;
alter table public.site_state enable row level security;

drop policy if exists participants_select_own_or_admin on public.participants;
create policy participants_select_own_or_admin
on public.participants
for select
to authenticated
using (public.is_admin() or owner_id = auth.uid());

drop policy if exists participants_admin_insert on public.participants;
create policy participants_admin_insert
on public.participants
for insert
to authenticated
with check (public.is_admin());

drop policy if exists participants_admin_update on public.participants;
create policy participants_admin_update
on public.participants
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists participants_admin_delete on public.participants;
create policy participants_admin_delete
on public.participants
for delete
to authenticated
using (public.is_admin());

drop policy if exists profiles_select_own_or_admin on public.profiles;
create policy profiles_select_own_or_admin
on public.profiles
for select
to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update
on public.profiles
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists site_state_select_authenticated on public.site_state;
create policy site_state_select_authenticated
on public.site_state
for select
to authenticated
using (true);

drop policy if exists site_state_admin_update on public.site_state;
create policy site_state_admin_update
on public.site_state
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists site_state_admin_insert on public.site_state;
create policy site_state_admin_insert
on public.site_state
for insert
to authenticated
with check (public.is_admin());

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.participants to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update on public.site_state to authenticated;
grant execute on function public.register_participant(jsonb) to authenticated;
grant execute on function public.update_my_participant(jsonb) to authenticated;

-- Opcjonalna migracja ze starej tabeli app_state, jesli istnieje.
do $$
begin
  if to_regclass('public.app_state') is not null then
    execute $migration$
      insert into public.participants (
        legacy_id,
        participant_type,
        name,
        email,
        phone,
        album_number,
        dean_group,
        diet,
        transport_mode,
        paid_deposit,
        paid_installment1,
        paid_installment2,
        paid_transport,
        manual_verified,
        registration_status,
        room_id,
        room_name,
        table_id,
        seat_no,
        seating_preference,
        note
      )
      select
        p ->> 'id',
        case when coalesce(p ->> 'registrationType', '') = 'companion' or coalesce(p ->> 'isCompanion', '') = 'true' then 'gosc absolwenta' else 'absolwent' end,
        coalesce(nullif(p ->> 'name', ''), 'Bez nazwy'),
        nullif(p ->> 'email', ''),
        nullif(p ->> 'phone', ''),
        nullif(p ->> 'albumNumber', ''),
        nullif(p ->> 'deanGroup', ''),
        coalesce(nullif(p ->> 'diet', ''), 'standard'),
        coalesce(nullif(p ->> 'transportMode', ''), 'none'),
        lower(coalesce(p ->> 'paidDeposit', 'false')) in ('true', '1', 'tak', 'yes'),
        lower(coalesce(p ->> 'paidInstallment1', 'false')) in ('true', '1', 'tak', 'yes'),
        lower(coalesce(p ->> 'paidInstallment2', 'false')) in ('true', '1', 'tak', 'yes'),
        lower(coalesce(p ->> 'paidTransport', 'false')) in ('true', '1', 'tak', 'yes'),
        lower(coalesce(p ->> 'manualVerified', 'false')) in ('true', '1', 'tak', 'yes'),
        coalesce(nullif(p ->> 'registrationStatus', ''), 'migracja'),
        nullif(p ->> 'roomId', ''),
        nullif(p ->> 'roomName', ''),
        nullif(p ->> 'tableId', ''),
        nullif(p ->> 'seatNo', ''),
        nullif(p ->> 'seatingPreference', ''),
        nullif(p ->> 'adminNote', '')
      from public.app_state s,
      jsonb_array_elements(coalesce(s.data -> 'participants', '[]'::jsonb)) as p
      where s.id = 'main'
      on conflict (legacy_id) do update
      set
        name = excluded.name,
        email = excluded.email,
        phone = excluded.phone,
        album_number = excluded.album_number,
        dean_group = excluded.dean_group,
        diet = excluded.diet,
        transport_mode = excluded.transport_mode,
        paid_deposit = excluded.paid_deposit,
        paid_installment1 = excluded.paid_installment1,
        paid_installment2 = excluded.paid_installment2,
        paid_transport = excluded.paid_transport,
        manual_verified = excluded.manual_verified,
        registration_status = excluded.registration_status,
        room_id = excluded.room_id,
        room_name = excluded.room_name,
        table_id = excluded.table_id,
        seat_no = excluded.seat_no,
        seating_preference = excluded.seating_preference,
        note = excluded.note,
        updated_at = now();
    $migration$;
  end if;
end $$;

-- Pierwszego admina utworz tak:
-- 1. W Supabase Auth dodaj uzytkownika z Twoim emailem.
-- 2. Podmien email ponizej i uruchom:
--
-- insert into public.profiles (id, email, display_name, role)
-- select id, email, 'Administrator', 'admin'
-- from auth.users
-- where email = 'TWOJ_EMAIL_ADMINA'
-- on conflict (id) do update set role = 'admin', updated_at = now();
