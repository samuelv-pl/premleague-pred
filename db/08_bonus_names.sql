-- 08_bonus_names.sql: one spelling per bonus answer.
-- The picks came over from the Sheet as people typed them, so the same answer shows up
-- as "Bruno F", "Bruno. F" and "Bruno F." and the Bonus tab lists them as three answers.
-- This rewrites each pick to one agreed name (full name for people; club names were
-- already consistent). What each person originally typed is kept in bonus_picks_original.
-- Paste this whole file into SQL Editor > New query > Run. Safe to run again.

-- 1. Keep the original text, once. Later runs never overwrite it.
create table if not exists public.bonus_picks_original (
  player_id uuid not null,
  slot      text not null,
  pick      text,
  saved_at  timestamptz not null default now(),
  primary key (player_id, slot)
);
alter table public.bonus_picks_original enable row level security; -- no policies: dashboard only

insert into public.bonus_picks_original (player_id, slot, pick)
select player_id, slot, pick from public.bonus_picks
on conflict (player_id, slot) do nothing;

-- 2. Rewrite to the agreed names. Matching ignores capitals and spaces at the ends.
update public.bonus_picks bp
   set pick = m.new_name
  from (values
    -- same answer, different spellings
    ('bruno f',         'Bruno Fernandes'),
    ('bruno. f',        'Bruno Fernandes'),
    ('bruno f.',        'Bruno Fernandes'),
    ('bouaddi',         'Ayyoub Bouaddi'),
    ('gabriel 🥱',      'Gabriel'),
    -- surname only, made full names to match the rest
    ('haaland',         'Erling Haaland'),
    ('raya',            'David Raya'),
    ('rogers',          'Morgan Rogers'),
    ('palmer',          'Cole Palmer'),
    ('arteta',          'Mikel Arteta'),
    ('arbeloa',         'Alvaro Arbeloa'),
    ('de zerbi',        'Roberto De Zerbi'),
    ('lampard',         'Frank Lampard')
  ) as m(old_name, new_name)
 where lower(trim(bp.pick)) = m.old_name
   and bp.pick is distinct from m.new_name;

-- 3. Check: one row per answer, with how many people picked it.
select s.group_key as category, bp.pick as answer, count(*) as people
  from public.bonus_picks bp
  join public.bonus_slots s on s.slot = bp.slot
 group by s.group_key, bp.pick
 order by s.group_key, people desc, bp.pick;
