-- Noah's Garden: where the garden is saved in Supabase, and the rules that keep it private to the people who
-- share it. In Supabase, open SQL Editor, paste all of this, and click Run. It's safe to run again.
--
-- Everyone listed in garden_members shares one garden: the same This week check-offs, recorded first-frost
-- dates and plant changes (renames, confirmed IDs, plants finished for the season). Nobody else can read or
-- change any of it, even with an account.
--
-- To add someone: create their account under Authentication > Users (Add user > Create new user, with
-- "Auto Confirm User" ticked), then run this line here with their email:
--   select private.add_member('their@email.com');
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

create or replace function private.is_member() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.garden_members where user_id = (select auth.uid())) $$;
revoke all on function private.is_member() from public, anon;
grant execute on function private.is_member() to authenticated;

create or replace function private.add_member(who text) returns text
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
  insert into public.garden_members (user_id, email) values (found_id, found_email)
    on conflict (user_id) do update set email = excluded.email;
  return found_email || ' is in the garden';
end $$;
-- Only you, here in the SQL Editor, can add people. The app can't.
revoke all on function private.add_member(text) from public, anon, authenticated;

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

revoke all on public.garden_members, public.checkoffs, public.frosts, public.plant_edits from anon, authenticated;
grant select on public.garden_members to authenticated;
grant select, insert, update, delete on public.checkoffs, public.frosts, public.plant_edits to authenticated;

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

commit;

-- Who's in the garden now. You should see your own email, plus anyone you've added.
select email as "In the garden", added_on as "Added" from public.garden_members order by added_on;
