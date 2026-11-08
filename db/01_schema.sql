-- =====================================================================
-- RTFM Mods Super 6 league: database foundation
-- Paste this whole file into Supabase > SQL Editor > New query > Run.
-- Safe to run once on a fresh project. Do not run it twice.
-- =====================================================================

-- ---------- tables ---------------------------------------------------

create table public.players (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  email       text not null unique,
  auth_id     uuid unique references auth.users(id) on delete set null,
  is_admin    boolean not null default false,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- One row per Premier League match. id is the fixture number (1..380)
-- used in the old Sheet, so history lines up one to one.
create table public.fixtures (
  id            int primary key check (id between 1 and 380),
  gw            int not null check (gw between 1 and 38),
  kickoff       timestamptz not null,
  home          text not null,
  away          text not null,
  super6        boolean not null default false,
  derby         boolean not null default false,
  status        text not null default 'SCHEDULED',   -- SCHEDULED, IN_PLAY, FINISHED, POSTPONED
  home_goals    int,
  away_goals    int,
  result_source text not null default 'feed',        -- 'feed' or 'admin'
  api_match_id  int unique,                          -- football-data.org match id
  updated_at    timestamptz not null default now(),
  unique (home, away)                                -- every pairing happens once
);

create table public.predictions (
  player_id   uuid not null references public.players(id) on delete cascade,
  fixture_id  int  not null references public.fixtures(id) on delete cascade,
  home_goals  int  not null check (home_goals between 0 and 20),
  away_goals  int  not null check (away_goals between 0 and 20),
  updated_at  timestamptz not null default now(),
  primary key (player_id, fixture_id)
);

create table public.settings (
  key    text primary key,
  value  text not null
);

-- Season bonus: one row per pick slot, grouped for scoring.
create table public.bonus_slots (
  slot        text primary key,
  group_key   text not null,
  label       text not null,
  points_each int  not null
);

create table public.bonus_picks (
  player_id  uuid not null references public.players(id) on delete cascade,
  slot       text not null references public.bonus_slots(slot),
  pick       text not null,
  primary key (player_id, slot)
);

-- Admin fills this as awards are confirmed. 'accepted' lists every
-- spelling that counts (top 4 = the four clubs, one row for the group).
create table public.bonus_actual (
  group_key  text primary key,
  accepted   text[] not null
);

-- ---------- seed: settings and bonus slots ---------------------------

insert into public.settings (key, value) values
  ('lock_mode',    'first_super6'),  -- or 'per_match'
  ('bonus_open',   'true'),          -- players may edit bonus picks
  ('bonus_public', 'false');         -- everyone can see everyone's bonus picks

insert into public.bonus_slots (slot, group_key, label, points_each) values
  ('champion',      'champion',      'Champion',                20),
  ('top4_1',        'top4',          'Top 4',                    5),
  ('top4_2',        'top4',          'Top 4',                    5),
  ('top4_3',        'top4',          'Top 4',                    5),
  ('top4_4',        'top4',          'Top 4',                    5),
  ('bottom3_1',     'bottom3',       'Bottom 3',                 5),
  ('bottom3_2',     'bottom3',       'Bottom 3',                 5),
  ('bottom3_3',     'bottom3',       'Bottom 3',                 5),
  ('golden_boot',   'golden_boot',   'Golden Boot',             10),
  ('playmaker',     'playmaker',     'Playmaker',               10),
  ('pots',          'pots',          'Player of the Season',    15),
  ('young',         'young',         'Young Player of the Season', 10),
  ('golden_glove',  'golden_glove',  'Golden Glove',            10),
  ('manager',       'manager',       'Manager of the Season',   10),
  ('first_sacked',  'first_sacked',  'First manager sacked',    10),
  ('best_promoted', 'best_promoted', 'Best promoted club',      10);

-- ---------- helper functions -----------------------------------------

create function public.current_player() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.players where auth_id = auth.uid();
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.players where auth_id = auth.uid()), false);
$$;

-- Has the prediction window for this fixture closed?
-- first_super6: all six picks lock at the first Super 6 kick-off of the gameweek.
-- per_match:    each match locks at its own kick-off.
create function public.pred_locked(fid int) returns boolean
language sql stable security definer set search_path = public as $$
  select now() >= case (select value from public.settings where key = 'lock_mode')
    when 'per_match' then
      (select kickoff from public.fixtures where id = fid)
    else
      (select min(f2.kickoff) from public.fixtures f2
        where f2.super6 and f2.gw = (select gw from public.fixtures where id = fid))
  end;
$$;

-- Points for one pick: 5 exact, 3 right goal difference, 1 right outcome.
-- A correctly called draw always lands on the goal difference tier (3 or 5).
create function public.score(ph int, pa int, ah int, aa int) returns int
language sql immutable as $$
  select case
    when ph is null or pa is null or ah is null or aa is null then null
    when ph = ah and pa = aa then 5
    when (ph - pa) = (ah - aa) then 3
    when sign(ph - pa) = sign(ah - aa) then 1
    else 0
  end;
$$;

-- Link a new login to its player row. Only invited emails can sign up.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.players set auth_id = new.id
   where lower(email) = lower(new.email) and auth_id is null;
  if not found then
    raise exception 'This email has not been invited to the league';
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger predictions_touch before update on public.predictions
  for each row execute function public.touch_updated_at();
create trigger fixtures_touch before update on public.fixtures
  for each row execute function public.touch_updated_at();

-- Admin can enter or fix a pick on someone's behalf (late entries).
-- Runs as the database owner, so it works even before the lock.
create function public.admin_set_prediction(pid uuid, fid int, h int, a int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only';
  end if;
  insert into public.predictions (player_id, fixture_id, home_goals, away_goals)
  values (pid, fid, h, a)
  on conflict (player_id, fixture_id)
  do update set home_goals = excluded.home_goals, away_goals = excluded.away_goals;
end;
$$;

-- ---------- scoring views --------------------------------------------
-- These only ever include FINISHED matches, which are always past the
-- lock, so showing them to every logged-in player leaks nothing.

create view public.v_points as
select p.player_id, f.gw, f.id as fixture_id,
       p.home_goals as pred_home, p.away_goals as pred_away,
       f.home_goals as act_home,  f.away_goals as act_away,
       public.score(p.home_goals, p.away_goals, f.home_goals, f.away_goals) as pts
from public.predictions p
join public.fixtures f on f.id = p.fixture_id
where f.super6 and f.status = 'FINISHED' and f.home_goals is not null;

-- A week counts once all six Super 6 results are in.
create view public.v_gw_points as
with gw_status as (
  select gw,
         count(*) filter (where super6) as n6,
         count(*) filter (where super6 and status = 'FINISHED' and home_goals is not null) as done6
  from public.fixtures
  group by gw
)
select pl.id as player_id, pl.name, g.gw,
       coalesce(sum(vp.pts), 0)::int as pts,
       (g.n6 > 0 and g.done6 = g.n6) as complete
from public.players pl
cross join gw_status g
left join public.v_points vp on vp.player_id = pl.id and vp.gw = g.gw
where pl.active
group by pl.id, pl.name, g.gw, g.n6, g.done6;

create view public.v_bonus as
select bp.player_id, bp.slot, bs.points_each as points
from public.bonus_picks bp
join public.bonus_slots bs on bs.slot = bp.slot
join public.bonus_actual ba on ba.group_key = bs.group_key
where lower(trim(bp.pick)) in (select lower(trim(x)) from unnest(ba.accepted) as x);

-- Ranked by total, then exact scores, then correct goal differences.
create view public.v_leaderboard as
with m as (
  select pl.id as player_id, pl.name,
         count(vp.fixture_id) filter (where vp.pts = 5) as exact,
         count(vp.fixture_id) filter (where vp.pts = 3) as gd,
         count(vp.fixture_id) filter (where vp.pts = 1) as outcome,
         coalesce(sum(vp.pts), 0)::int as match_pts,
         count(vp.fixture_id) as scored
  from public.players pl
  left join public.v_points vp on vp.player_id = pl.id
  where pl.active
  group by pl.id, pl.name
),
l5 as (
  select player_id, sum(pts)::int as last5
  from (
    select player_id, pts,
           row_number() over (partition by player_id order by gw desc) as rn
    from public.v_gw_points where complete
  ) x
  where rn <= 5
  group by player_id
),
b as (
  select player_id, sum(points)::int as bonus from public.v_bonus group by player_id
)
select rank() over (
         order by (m.match_pts + coalesce(b.bonus, 0)) desc, m.exact desc, m.gd desc
       ) as rank,
       m.player_id, m.name, m.exact, m.gd, m.outcome, m.match_pts,
       coalesce(b.bonus, 0) as bonus,
       m.match_pts + coalesce(b.bonus, 0) as total,
       coalesce(l5.last5, 0) as last5,
       m.scored
from m
left join l5 on l5.player_id = m.player_id
left join b  on b.player_id  = m.player_id;

-- ---------- row level security ---------------------------------------

alter table public.players      enable row level security;
alter table public.fixtures     enable row level security;
alter table public.predictions  enable row level security;
alter table public.settings     enable row level security;
alter table public.bonus_slots  enable row level security;
alter table public.bonus_picks  enable row level security;
alter table public.bonus_actual enable row level security;

-- Everyone logged in can read the shared tables.
create policy players_read  on public.players      for select to authenticated using (true);
create policy fixtures_read on public.fixtures     for select to authenticated using (true);
create policy settings_read on public.settings     for select to authenticated using (true);
create policy slots_read    on public.bonus_slots  for select to authenticated using (true);
create policy actual_read   on public.bonus_actual for select to authenticated using (true);

-- Only the admin changes them (the feed job uses the service key and skips this).
create policy players_admin  on public.players      for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy fixtures_admin on public.fixtures     for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy settings_admin on public.settings     for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy actual_admin   on public.bonus_actual for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Predictions: your own any time, everyone else's only after the lock.
create policy pred_read on public.predictions for select to authenticated
  using (player_id = public.current_player() or public.pred_locked(fixture_id));

create policy pred_insert on public.predictions for insert to authenticated
  with check (
    player_id = public.current_player()
    and not public.pred_locked(fixture_id)
    and exists (select 1 from public.fixtures f where f.id = fixture_id and f.super6)
  );

create policy pred_update on public.predictions for update to authenticated
  using (player_id = public.current_player() and not public.pred_locked(fixture_id))
  with check (player_id = public.current_player() and not public.pred_locked(fixture_id));

create policy pred_delete on public.predictions for delete to authenticated
  using (player_id = public.current_player() and not public.pred_locked(fixture_id));

-- Bonus picks: yours any time, others' only when the admin opens them.
create policy bonus_read on public.bonus_picks for select to authenticated
  using (
    player_id = public.current_player()
    or (select value from public.settings where key = 'bonus_public') = 'true'
  );

create policy bonus_write on public.bonus_picks for insert to authenticated
  with check (
    player_id = public.current_player()
    and (select value from public.settings where key = 'bonus_open') = 'true'
  );

create policy bonus_change on public.bonus_picks for update to authenticated
  using (
    player_id = public.current_player()
    and (select value from public.settings where key = 'bonus_open') = 'true'
  )
  with check (
    player_id = public.current_player()
    and (select value from public.settings where key = 'bonus_open') = 'true'
  );

-- ---------- invite only: nothing is visible without a login ----------

revoke all on all tables    in schema public from anon;
revoke all on all functions in schema public from anon;
grant select on public.v_points, public.v_gw_points, public.v_bonus, public.v_leaderboard to authenticated;
