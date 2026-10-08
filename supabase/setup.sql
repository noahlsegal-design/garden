-- Noah's Garden: where the garden is saved in Supabase, and the rules that keep it private to the people who
-- share it. In Supabase, open SQL Editor, paste all of this, and click Run. It's safe to run again.
--
-- Everyone listed in garden_members shares one garden: the same This week check-offs, recorded first-frost
-- dates, plant changes (renames, confirmed IDs, plants finished for the season), each plant's notes and
-- photos, and the photo checks (health checks and bugs found) that Claude saves. Nobody else can read or change
-- any of it, even with an account.
--
-- To add someone: create their account under Authentication > Users (Add user > Create new user, with
-- "Auto Confirm User" ticked), then run this line here with their email and the name to show on their notes:
--   select private.add_member('their@email.com', 'Sam');
-- Running it again for someone already in the garden just changes their name.
-- To remove someone:
--   delete from public.garden_members where email = 'their@email.com';

begin;

-- Helpers the security rules use. They live in a "private" schema, which the app's web address can't reach.
create schema if not exists private;
grant usage on schema private to authenticated;

-- ---------- who shares the garden ----------
create table if not exists public.garden_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  added_on timestamptz not null default now()
);
-- The name shown on someone's notes ("June 12 · Noah"). Without one, the start of their email is shown.
alter table public.garden_members add column if not exists name text check (char_length(name) <= 40);

create or replace function private.is_member() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.garden_members where user_id = (select auth.uid())) $$;
revoke all on function private.is_member() from public, anon;
grant execute on function private.is_member() to authenticated;

-- (The first version took only an email. It's replaced by this one, where the name is optional.)
drop function if exists private.add_member(text);
create or replace function private.add_member(who text, called text default null) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  found_id uuid;
  found_email text;
begin
  select id, email into found_id, found_email from auth.users where lower(email) = lower(trim(who));
  if found_id is null then
    raise exception 'There''s no account with the email %. Add it first under Authentication > Users.', who;
  end if;
  insert into public.garden_members (user_id, email, name) values (found_id, found_email, nullif(trim(called), ''))
    on conflict (user_id) do update set email = excluded.email, name = coalesce(excluded.name, public.garden_members.name);
  return found_email || ' is in the garden' || coalesce(' as ' || nullif(trim(called), ''), '');
end $$;
revoke all on function private.add_member(text, text) from public, anon, authenticated;

-- ---------- check-offs: one row per checked-off task (and per plant, for one-time jobs) ----------
-- user_id is who checked it off.
create table if not exists public.checkoffs (
  key text not null,
  done_on date not null,
  user_id uuid default auth.uid(),
  primary key (key)
);

-- ---------- the first frost recorded each fall ----------
create table if not exists public.frosts (
  year int not null,
  first_frost date not null,
  user_id uuid default auth.uid(),
  primary key (year)
);

-- ---------- plant changes made in the app, layered on top of data/plants.json ----------
-- One row per changed detail of a plant ("field" is the detail's name in plants.json, like name or finished).
-- value is the new value; empty (null) means the detail is taken away. "Save app edits into files" on the Mac
-- writes changes into plants.json and marks them saved_to_file, keeping what the file had before in file_had.
-- The website keeps showing a saved change until its own copy of plants.json has moved on from file_had (that
-- is, once the garden is published), then clears it.
create table if not exists public.plant_edits (
  plant_id text not null check (char_length(plant_id) between 1 and 100),
  field text not null check (field ~ '^[A-Za-z]{1,40}$'),
  value jsonb check (pg_column_size(value) <= 10000),
  saved_to_file boolean not null default false,
  file_had jsonb check (pg_column_size(file_had) <= 10000),
  user_id uuid default auth.uid(),
  changed_at timestamptz not null default now(),
  primary key (plant_id, field)
);

-- ---------- notes and photos on each plant ("June 12: thrips on dahlia #9") ----------
-- One row per note. The app makes up the id, so a note that waited on a phone without signal is never saved
-- twice. noted_on is the day it's about (today, unless you pick an earlier day). photo, if there is one, is the
-- picture's name in the private "plant-photos" storage folder below; its small copy has "-thumb" before
-- ".jpg". photo_bytes is how much room both copies take, so the app can keep an eye on the free plan's 1 GB.
create table if not exists public.plant_notes (
  id uuid primary key,
  plant_id text not null check (char_length(plant_id) between 1 and 100),
  noted_on date not null,
  body text not null default '' check (char_length(body) <= 2000),
  photo text check (photo ~ '^[0-9a-f-]{36}\.jpg$'),
  photo_w int check (photo_w between 1 and 4000),
  photo_h int check (photo_h between 1 and 4000),
  photo_bytes int not null default 0 check (photo_bytes between 0 and 4000000),
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (body <> '' or photo is not null)
);
create index if not exists plant_notes_by_plant on public.plant_notes (plant_id, noted_on desc, created_at desc);

-- Each note records who added it and when, whatever the app sends.
create or replace function private.stamp_note() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.user_id := coalesce((select auth.uid()), new.user_id);
  new.created_at := now();
  return new;
end $$;
drop trigger if exists stamp_note on public.plant_notes;
create trigger stamp_note before insert on public.plant_notes
  for each row execute function private.stamp_note();

-- ---------- photo checks: Plant health and Friend or foe ----------
-- One row per photo checked by Claude. The app adds the row first, as "waiting", with its photo (in the same
-- private folder as notes' photos) and a note, then you send the photo to Claude in the Claude app. Your Claude
-- skill saves the answer with private.record_check below, through the Supabase connector, and the row becomes
-- "done". kind is "plant" (a health check) or "bug" (friend or foe). plant_id is the plant it's about or the
-- bug was on, if any. report is Claude's whole answer, in the shape the skills describe.
create table if not exists public.photo_checks (
  id uuid primary key,
  kind text not null check (kind in ('plant', 'bug')),
  plant_id text check (char_length(plant_id) between 1 and 100),
  checked_on date not null default ((now() at time zone 'America/New_York')::date),
  status text not null default 'waiting' check (status in ('waiting', 'done')),
  note text not null default '' check (char_length(note) <= 2000),
  report jsonb check (jsonb_typeof(report) = 'object' and pg_column_size(report) <= 30000),
  photo text check (photo ~ '^[0-9a-f-]{36}\.jpg$'),
  photo_w int check (photo_w between 1 and 4000),
  photo_h int check (photo_h between 1 and 4000),
  photo_bytes int not null default 0 check (photo_bytes between 0 and 4000000),
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  done_at timestamptz,
  check (status = 'waiting' or report is not null)
);
create index if not exists photo_checks_by_day on public.photo_checks (checked_on desc, created_at desc);
drop trigger if exists stamp_check on public.photo_checks;
create trigger stamp_check before insert on public.photo_checks
  for each row execute function private.stamp_note();

-- How Claude saves an answer. This is the only thing the skills are allowed to run through the Supabase
-- connector:  select private.record_check($garden$ { ...the answer... } $garden$::jsonb);
-- It checks the answer is complete, then fills in the waiting check with that check_id (or adds a new one when
-- the photo didn't start in the app), and says what it saved. Only the connector (which signs in as you, the
-- project's owner) can run it; the app and other accounts can't.
create or replace function private.record_check(result jsonb) returns text
language plpgsql set search_path = ''
as $$
declare
  k text;
  pid text;
  cid uuid;
  had public.photo_checks;
  what text;
begin
  if result is null or jsonb_typeof(result) <> 'object' then
    raise exception 'Pass the answer as one JSON object.';
  end if;
  k := result->>'kind';
  pid := nullif(trim(coalesce(result->>'plant_id', '')), '');
  if k is null or k not in ('plant', 'bug') then
    raise exception 'kind must be "plant" or "bug".';
  end if;
  if k = 'plant' and coalesce(result->>'outcome', '') not in ('issues', 'healthy') then
    raise exception 'Only save a finished plant check (outcome "issues" or "healthy"). If you asked Noah for the plant''s name or a better photo, wait for the answer first.';
  end if;
  if k = 'plant' and jsonb_typeof(coalesce(result->'diagnoses', '[]'::jsonb)) <> 'array' then
    raise exception 'diagnoses must be a list.';
  end if;
  if k = 'bug' and (coalesce(result->>'verdict', '') not in ('friend', 'foe', 'neutral') or coalesce(trim(result->>'common_name'), '') = '') then
    raise exception 'A bug needs a common_name and a verdict of "friend", "foe" or "neutral".';
  end if;
  if pid is not null and char_length(pid) > 100 then
    raise exception 'plant_id is too long.';
  end if;
  begin
    cid := nullif(trim(coalesce(result->>'check_id', '')), '')::uuid;
  exception when invalid_text_representation then
    raise exception 'check_id must be the id the garden app gave (it looks like 1b4e28ba-2fa1-4d3b-9c6e-2f8a8e5b7a10), or left out.';
  end;
  if cid is not null then
    select * into had from public.photo_checks where id = cid;
    if had.id is not null and had.kind <> k then
      raise exception 'Check % is a % check, not a % check.', cid, had.kind, k;
    end if;
  end if;
  insert into public.photo_checks (id, kind, plant_id, status, report, done_at)
  values (coalesce(cid, gen_random_uuid()), k, pid, 'done', result - 'check_id', now())
  on conflict (id) do update
    set status = 'done', report = excluded.report, done_at = now(),
        plant_id = coalesce(excluded.plant_id, public.photo_checks.plant_id);
  what := case
    when k = 'bug' then (result->>'common_name') || ', ' || (result->>'verdict')
    when result->>'outcome' = 'healthy' then 'healthy'
    else coalesce((select d->>'cause' from jsonb_array_elements(coalesce(result->'diagnoses', '[]'::jsonb)) d
                   where d->>'likelihood' = 'most_likely' limit 1), 'checked')
  end;
  return 'Saved to the garden app: ' || what || coalesce(' (' || pid || ')', '') || '.';
end $$;
revoke all on function private.record_check(jsonb) from public, anon, authenticated;

-- The private storage folder for the photos. Nothing in it has a public address: the app fetches each photo
-- while signed in. The app shrinks photos on the phone first (about 1600 px, and a small copy for the list)
-- and drops their location data, so each one is well under the 2 MB limit here, and only JPEGs are taken.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('plant-photos', 'plant-photos', false, 2097152, array['image/jpeg'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- ---------- moving from one list per person to one shared garden ----------
-- Before the garden was shared, each person had their own check-offs and frost dates. This merges them into
-- one list without dropping any task: if two people checked off the same task, it keeps the earlier date.
-- (On a garden that's already shared, none of this changes anything.)

-- The first time this runs, whoever already has check-offs or frost dates joins the garden, so the app keeps
-- working for you right away.
insert into public.garden_members (user_id, email)
select u.id, u.email from auth.users u
where not exists (select 1 from public.garden_members)
  and (exists (select 1 from public.checkoffs c where c.user_id = u.id)
       or exists (select 1 from public.frosts f where f.user_id = u.id))
on conflict (user_id) do nothing;

delete from public.checkoffs a using public.checkoffs b
where a.key = b.key
  and (a.done_on, coalesce(a.user_id::text, '')) > (b.done_on, coalesce(b.user_id::text, ''));
delete from public.frosts a using public.frosts b
where a.year = b.year
  and (a.first_frost, coalesce(a.user_id::text, '')) > (b.first_frost, coalesce(b.user_id::text, ''));

-- Rows now belong to the garden, not to one person, and stay if someone's account is ever removed.
alter table public.checkoffs drop constraint if exists checkoffs_pkey;
alter table public.checkoffs add constraint checkoffs_pkey primary key (key);
alter table public.checkoffs alter column user_id drop not null;
alter table public.checkoffs drop constraint if exists checkoffs_user_id_fkey;
alter table public.checkoffs add constraint checkoffs_user_id_fkey foreign key (user_id) references auth.users (id) on delete set null;

alter table public.frosts drop constraint if exists frosts_pkey;
alter table public.frosts add constraint frosts_pkey primary key (year);
alter table public.frosts alter column user_id drop not null;
alter table public.frosts drop constraint if exists frosts_user_id_fkey;
alter table public.frosts add constraint frosts_user_id_fkey foreign key (user_id) references auth.users (id) on delete set null;

alter table public.plant_edits drop constraint if exists plant_edits_user_id_fkey;
alter table public.plant_edits add constraint plant_edits_user_id_fkey foreign key (user_id) references auth.users (id) on delete set null;

-- Each plant change records who made it and when, whatever the app sends.
create or replace function private.stamp_edit() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.user_id := coalesce((select auth.uid()), new.user_id);
  new.changed_at := now();
  return new;
end $$;
drop trigger if exists stamp_edit on public.plant_edits;
create trigger stamp_edit before insert or update on public.plant_edits
  for each row execute function private.stamp_edit();

-- ---------- security ----------
-- Nobody can read or change anything without signing in, and only people in the garden see or change its rows.
alter table public.garden_members enable row level security;
alter table public.checkoffs enable row level security;
alter table public.frosts enable row level security;
alter table public.plant_edits enable row level security;
alter table public.plant_notes enable row level security;
alter table public.photo_checks enable row level security;

revoke all on public.garden_members, public.checkoffs, public.frosts, public.plant_edits, public.plant_notes,
  public.photo_checks from anon, authenticated;
grant select on public.garden_members to authenticated;
grant select, insert, update, delete on public.checkoffs, public.frosts, public.plant_edits to authenticated;
-- Notes are added and deleted, never changed in place.
grant select, insert, delete on public.plant_notes to authenticated;
-- The app adds a photo check as "waiting" (only Claude, through record_check, fills in the answer), can move it
-- to a different plant, and can delete it.
grant select, delete on public.photo_checks to authenticated;
grant insert (id, kind, plant_id, checked_on, note, photo, photo_w, photo_h, photo_bytes) on public.photo_checks to authenticated;
grant update (plant_id) on public.photo_checks to authenticated;

drop policy if exists "Members see who's in the garden" on public.garden_members;
create policy "Members see who's in the garden" on public.garden_members
  for select to authenticated
  using ((select private.is_member()));

drop policy if exists "Own check-offs" on public.checkoffs;
drop policy if exists "Garden check-offs" on public.checkoffs;
create policy "Garden check-offs" on public.checkoffs
  for all to authenticated
  using ((select private.is_member()))
  with check ((select private.is_member()));

drop policy if exists "Own frost dates" on public.frosts;
drop policy if exists "Garden frost dates" on public.frosts;
create policy "Garden frost dates" on public.frosts
  for all to authenticated
  using ((select private.is_member()))
  with check ((select private.is_member()));

drop policy if exists "Garden plant changes" on public.plant_edits;
create policy "Garden plant changes" on public.plant_edits
  for all to authenticated
  using ((select private.is_member()))
  with check ((select private.is_member()));

drop policy if exists "Garden notes" on public.plant_notes;
create policy "Garden notes" on public.plant_notes
  for all to authenticated
  using ((select private.is_member()))
  with check ((select private.is_member()));

drop policy if exists "Garden photo checks" on public.photo_checks;
create policy "Garden photo checks" on public.photo_checks
  for all to authenticated
  using ((select private.is_member()))
  with check ((select private.is_member()));

-- The photos: only people in the garden can see, add or delete them. A photo's name has to be one the app
-- makes (the note's id, then .jpg or -thumb.jpg), and photos can't be replaced once they're up.
drop policy if exists "Garden photos: see" on storage.objects;
create policy "Garden photos: see" on storage.objects
  for select to authenticated
  using (bucket_id = 'plant-photos' and (select private.is_member()));
drop policy if exists "Garden photos: add" on storage.objects;
create policy "Garden photos: add" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'plant-photos' and (select private.is_member()) and name ~ '^[0-9a-f-]{36}(-thumb)?\.jpg$');
drop policy if exists "Garden photos: delete" on storage.objects;
create policy "Garden photos: delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'plant-photos' and (select private.is_member()));

commit;

-- Who's in the garden now. You should see your own email, plus anyone you've added.
select email as "In the garden", coalesce(name, '(no name yet)') as "Name on notes", added_on as "Added"
from public.garden_members order by added_on;
