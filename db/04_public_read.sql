-- 04_public_read.sql: let people who are not signed in VIEW the league.
-- Paste this whole file into Supabase > SQL Editor > New query > Run. Run it once.
--
-- What becomes public (read only):
--   player names (not emails or login ids), fixtures and results, settings,
--   bonus categories and confirmed answers, the scoring views (table,
--   gameweek points), predictions only after that week's lock, and bonus
--   picks only when bonus_public = 'true'.
-- Nothing can be written without a login. Signed-in rules are unchanged.

-- Players: names only. Column grants keep email and auth_id hidden.
grant select (id, name, is_admin, active) on public.players to anon;
create policy players_read_anon on public.players for select to anon using (true);

grant select on public.fixtures, public.settings, public.bonus_slots, public.bonus_actual to anon;
create policy fixtures_read_anon on public.fixtures     for select to anon using (true);
create policy settings_read_anon on public.settings     for select to anon using (true);
create policy slots_read_anon    on public.bonus_slots  for select to anon using (true);
create policy actual_read_anon   on public.bonus_actual for select to anon using (true);

-- Predictions: only once the week (or match, in per_match mode) has locked.
grant execute on function public.pred_locked(int) to anon;
grant select on public.predictions to anon;
create policy pred_read_anon on public.predictions for select to anon
  using (public.pred_locked(fixture_id));

-- Bonus picks: only when the admin has made them public.
grant select on public.bonus_picks to anon;
create policy bonus_read_anon on public.bonus_picks for select to anon
  using ((select value from public.settings where key = 'bonus_public') = 'true');

-- Scoring views only ever contain finished matches.
grant select on public.v_points, public.v_gw_points, public.v_bonus, public.v_leaderboard to anon;

-- Players see the bonus but no longer edit it on the site (picks came from the Sheet).
update public.settings set value = 'false' where key = 'bonus_open';
