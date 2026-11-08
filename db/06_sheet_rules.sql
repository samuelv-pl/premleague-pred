-- 06_sheet_rules.sql: make two leaderboard columns follow the old Google Sheet exactly.
-- Paste into Supabase > SQL Editor > New query > Run. Safe to run more than once.
--
-- 1. LAST 5 GW. The Sheet takes L = the highest gameweek with all six results in,
--    then sums points from complete gameweeks numbered L-4 to L. A week in that
--    window still waiting on a rearranged match counts as nothing (it does not reach
--    further back). Previously this view summed the five most recent complete weeks.
-- 2. PREDICTIONS "made / 228". The Sheet counts every pick entered (future ones too).
--    v_pick_counts exposes only the number of picks per player, never the picks.

create or replace view public.v_leaderboard as
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
lastgw as (
  select max(gw) as l from public.v_gw_points where complete
),
l5 as (
  select g.player_id, sum(g.pts)::int as last5
  from public.v_gw_points g, lastgw
  where g.complete and g.gw between greatest(lastgw.l - 4, 1) and lastgw.l
  group by g.player_id
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

create or replace view public.v_pick_counts as
select p.player_id, count(*)::int as made,
       (select count(*) from public.fixtures where super6)::int as total
from public.predictions p
join public.fixtures f on f.id = p.fixture_id and f.super6
group by p.player_id;

grant select on public.v_leaderboard, public.v_pick_counts to anon, authenticated;
