-- 05_lock_per_match.sql: each pick locks at its own match's kick-off (Sam, 8 Nov 2026).
-- Same as Admin > Settings > "Each match at its own kick-off". Run once in the SQL Editor.
update public.settings set value = 'per_match' where key = 'lock_mode';
