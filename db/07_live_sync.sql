-- 07_live_sync.sql: fetch fixtures and scores from inside Supabase, on a reliable timer.
-- GitHub runs scheduled jobs late (roughly hourly on a quiet repo), which is too slow for
-- live scores. This uses Supabase's free scheduler (pg_cron) and HTTP client (pg_net):
--   * every minute while a match is on (15 minutes before kick-off to 2.5 hours after),
--   * every 30 minutes otherwise.
-- Same rules as sync/sync_fixtures.py: matches are found by football-data's match id,
-- in-play scores are stored but never scored (scoring views only use FINISHED),
-- admin-entered results are never overwritten, an abandoned live match loses its partial score.
-- The GitHub job keeps running as a backup; both write the same values.
--
-- BEFORE running this file, store the football-data.org token once (see README):
--   select vault.create_secret('PASTE-TOKEN-HERE', 'football_data_token');
-- Then paste this whole file into SQL Editor > New query > Run. Safe to run again.

create extension if not exists pg_net;
create extension if not exists pg_cron;

create table if not exists public.sync_state (
  id              int primary key default 1 check (id = 1),
  last_request    bigint,
  last_request_at timestamptz,
  last_applied_at timestamptz,
  last_status     text
);
insert into public.sync_state (id) values (1) on conflict (id) do nothing;
alter table public.sync_state enable row level security;
-- The site may show when scores were last checked. Nothing secret lives in this table.
drop policy if exists sync_state_read on public.sync_state;
create policy sync_state_read on public.sync_state for select to anon, authenticated using (true);
grant select (last_applied_at, last_status) on public.sync_state to anon, authenticated;

-- Is a match on, or about to start?
create or replace function public.sync_hot() returns boolean
language sql stable set search_path = public as $$
  select exists (
    select 1 from public.fixtures
    where status = 'IN_PLAY'
       or (status not in ('FINISHED', 'POSTPONED')
           and now() between kickoff - interval '15 minutes' and kickoff + interval '150 minutes')
  );
$$;

-- Apply one football-data.org /matches response to the fixtures table.
create or replace function public.sync_apply(body jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  m jsonb; fx public.fixtures%rowtype;
  st text; hg int; ag int; ko timestamptz;
  n_hg int; n_ag int; n_changed int := 0;
begin
  for m in select * from jsonb_array_elements(coalesce(body -> 'matches', '[]'::jsonb)) loop
    select * into fx from public.fixtures where api_match_id = (m ->> 'id')::int;
    continue when not found;

    st := case m ->> 'status'
            when 'FINISHED' then 'FINISHED' when 'AWARDED' then 'FINISHED'
            when 'IN_PLAY' then 'IN_PLAY'   when 'PAUSED' then 'IN_PLAY'
            when 'POSTPONED' then 'POSTPONED' when 'SUSPENDED' then 'POSTPONED' when 'CANCELLED' then 'POSTPONED'
            else 'SCHEDULED' end;
    hg := nullif(m #>> '{score,fullTime,home}', '')::int;
    ag := nullif(m #>> '{score,fullTime,away}', '')::int;
    ko := (m ->> 'utcDate')::timestamptz;

    -- Admin-entered final results stay as they are; only a moved kick-off is copied.
    if fx.result_source = 'admin' and fx.status = 'FINISHED' then
      if fx.kickoff is distinct from ko then
        update public.fixtures set kickoff = ko where id = fx.id;
        n_changed := n_changed + 1;
      end if;
      continue;
    end if;

    n_hg := fx.home_goals; n_ag := fx.away_goals;
    if st in ('FINISHED', 'IN_PLAY') and hg is not null and ag is not null then
      n_hg := hg; n_ag := ag;
    elsif st in ('SCHEDULED', 'POSTPONED') and fx.status = 'IN_PLAY' then
      n_hg := null; n_ag := null;
    end if;

    if (fx.kickoff, fx.status, fx.home_goals, fx.away_goals) is distinct from (ko, st, n_hg, n_ag) then
      update public.fixtures
         set kickoff = ko, status = st, home_goals = n_hg, away_goals = n_ag
       where id = fx.id;
      n_changed := n_changed + 1;
    end if;
  end loop;
  return n_changed;
end;
$$;

-- Runs every minute: apply the previous response, then ask again if it is due.
create or replace function public.sync_tick() returns void
language plpgsql security definer set search_path = public as $$
declare
  st public.sync_state%rowtype; r record; token text; n int;
begin
  select * into st from public.sync_state where id = 1 for update;

  if st.last_request is not null then
    select status_code, content, timed_out, error_msg into r
      from net._http_response where id = st.last_request;
    if found then
      if r.status_code = 200 then
        n := public.sync_apply(r.content::jsonb);
        update public.sync_state set last_request = null, last_applied_at = now(),
               last_status = 'ok, ' || n || ' changed' where id = 1;
      else
        update public.sync_state set last_request = null,
               last_status = coalesce('http ' || r.status_code, 'failed: ' || coalesce(r.error_msg, 'timed out')) where id = 1;
      end if;
      select * into st from public.sync_state where id = 1;
    elsif st.last_request_at < now() - interval '5 minutes' then
      update public.sync_state set last_request = null, last_status = 'no response' where id = 1;
    else
      return; -- still waiting for the answer
    end if;
  end if;

  if not (public.sync_hot() or st.last_applied_at is null or st.last_applied_at < now() - interval '30 minutes') then
    return;
  end if;

  select decrypted_secret into token from vault.decrypted_secrets where name = 'football_data_token' limit 1;
  if token is null then
    update public.sync_state set last_status = 'no football_data_token in Vault' where id = 1;
    return;
  end if;

  update public.sync_state
     set last_request = net.http_get(
           url := 'https://api.football-data.org/v4/competitions/PL/matches?season=2026',
           headers := jsonb_build_object('X-Auth-Token', token),
           timeout_milliseconds := 20000),
         last_request_at = now()
   where id = 1;
end;
$$;

revoke all on function public.sync_apply(jsonb) from public, anon, authenticated;
revoke all on function public.sync_tick() from public, anon, authenticated;

-- Every minute. Scheduling again under the same name replaces the old schedule.
select cron.schedule('super6-live-sync', '* * * * *', 'select public.sync_tick()');
