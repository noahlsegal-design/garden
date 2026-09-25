-- Noah's Garden: where your This week check-offs and first-frost dates are saved, and the rules that keep them
-- yours. In Supabase, open SQL Editor, paste all of this, and click Run. It's safe to run again.

-- One row per checked-off task (and per plant, for one-time jobs).
create table if not exists public.checkoffs (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null,
  done_on date not null,
  primary key (user_id, key)
);

-- The first frost you recorded each fall.
create table if not exists public.frosts (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  year int not null,
  first_frost date not null,
  primary key (user_id, year)
);

-- Security: nobody can read or change anything without signing in, and a signed-in person only ever sees
-- and changes their own rows.
alter table public.checkoffs enable row level security;
alter table public.frosts enable row level security;

revoke all on public.checkoffs, public.frosts from anon;
grant select, insert, update, delete on public.checkoffs, public.frosts to authenticated;

drop policy if exists "Own check-offs" on public.checkoffs;
create policy "Own check-offs" on public.checkoffs
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Own frost dates" on public.frosts;
create policy "Own frost dates" on public.frosts
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
