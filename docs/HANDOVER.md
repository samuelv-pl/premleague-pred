# Super 6 League Website: Handover to Claude Code

> Update 8 Nov 2026: Milestone 1 is built in `site/` (login, change password, table, gameweeks, fixtures and results, bonus, rules). Hosting moved from GitHub Pages to **Netlify** (free tier, publishes `site/`, see `netlify.toml` and the README). supabase-js 2.49.4 is bundled in `site/js/vendor/` instead of loaded from a CDN. Supabase Auth still reports sign-ups as enabled; the `handle_new_user` trigger blocks uninvited emails, but switch sign-ups off anyway.

Written 8 Nov 2026 from the chat session that designed and started the build. Read this top to bottom before touching anything. Sam (the owner) is not a developer and has no terminal he runs himself, so see section 11 for how to work with him.

## 1. What we are building

A website for the **RTFM Mods Premier League 2026/27 "Super 6" prediction league**: nine friends, each predicts the scores of six selected matches per gameweek, points are awarded for exact score, correct goal difference and correct outcome, plus a season-long bonus. It currently runs in a Google Sheet. The goal is to rebuild it as a website with:

- all the Sheet's tabs as pages (Leaderboard, Gameweeks, Fixtures, Predictions, Results, Bonus, Setup/rules),
- fixtures, kick-off times and full-time scores updated automatically,
- simple per-player logins, server-enforced prediction deadlines, and an admin screen,
- hosting from a GitHub repo.

Sam asked explicitly for a full rebuild with logins, not a read-only view of the Sheet.

## 2. Status at handover

| Piece | State |
|---|---|
| Supabase project `super6` (free plan, EU Frankfurt, chosen on purpose) | Created |
| `01_schema.sql` (tables, scoring, views, RLS, lock logic) | Run successfully in the Supabase SQL Editor |
| `02_seed.sql` (9 players, 380 fixtures) and `03_history.sql` (519 picks, 138 bonus picks) | Run. `v_leaderboard` matches the Sheet exactly (see section 6) |
| Player emails set to `<name>@super6.league` | Done (SQL run) |
| Supabase Auth: public sign-ups switched off | Done |
| The nine Auth users (email + password, Auto Confirm ticked) | **Unconfirmed.** Sam was asked to create them; he has not said they exist. Check Authentication > Users |
| GitHub repo `samuelv-pl/premleague-pred` (public) | Exists. Contains README, `sync/sync_fixtures.py`, `.github/workflows/sync.yml` |
| Fixture sync Action | Working. Dry run and a live run both succeeded: 380 matches, 0 unmatched. It now runs every 15 minutes |
| GitHub Pages | **Not confirmed enabled** |
| Website (any HTML/JS) | **Not started** |
| Admin screen, prediction entry, bonus screens | Not started |
| Derby flag on fixtures | Column exists, all false. The Sheet did not record derbies |

Things not yet verified, so do not assume they work: the RLS policies against a real logged-in user, the `handle_new_user` trigger (it only runs when an Auth user is created), `admin_set_prediction`, and the first log lines for kick-off diffs (Sam saw the top and bottom of the sync log, only match-id/score updates were visible; he was asked to search the log for the word `kickoff` and has not replied).

## 3. Architecture

```
football-data.org  --(GitHub Action, every 15 min, python)-->  Supabase Postgres
                                                                  ^   |
Browser (static site on GitHub Pages) --(supabase-js, login)------+   |
        reads views/tables, writes own predictions under RLS  <-------+
```

- **Site:** plain HTML, CSS and JavaScript, no build step. Load `supabase-js` from a CDN at an exact pinned version that is at least two weeks old. Hosted by GitHub Pages from the `main` branch. Public repo, so **no secrets in code**.
- **Database and auth:** Supabase. The browser only ever holds the project URL and the **publishable** key. Row-level security does the protecting.
- **Sync job:** `sync/sync_fixtures.py`, run by `.github/workflows/sync.yml`. Uses the football-data.org v4 API (`/competitions/PL/matches?season=2026`, header `X-Auth-Token`), one request per run (free tier allows 10 per minute and delays scores, which is fine for full-time results). Writes with the Supabase secret key via the REST API.
- **Why Supabase at all:** GitHub Pages is static and cannot hold logins or enforce a deadline server-side.

## 4. Accounts, identifiers and secrets

Never write secret values into any file, commit, chat or document.

- Supabase project URL: `https://zwbhubxcvdqzvqzwlkbe.supabase.co` (project name `super6`, main branch, production)
- GitHub repo: `https://github.com/samuelv-pl/premleague-pred` (account `samuelv-pl`; his separate portfolio site lives under `samuel13-cell` and is unrelated)
- Source Google Sheet (still the live system of record during the parallel run): `https://docs.google.com/spreadsheets/d/12GyEAvMng-j7qV4FCcCqhg9iTUN4upxgU-oh8LNltCQ` ("Premier League 2026 - Prediction ML v0821")
- GitHub repository secrets (already created, values live only in GitHub): `FOOTBALL_DATA_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
- Public values the site needs and that Sam has **not yet supplied**: the Supabase publishable key (`sb_publishable_...`) from Project Settings > API Keys. Ask him for it. Do not ask for the secret key.
- Player starter passwords were given to Sam in chat and are deliberately not recorded here.

## 5. Database

Schema source of truth: `db/01_schema.sql` (add the three SQL files to the repo under `db/`; today they exist only as tabs in Sam's SQL Editor and as files from this chat). Run SQL through the Supabase SQL Editor. If you change the schema, write a new numbered file (`04_...sql`) and keep them in the repo. Do not re-run 01 to 03 on the live project.

**Tables (all RLS-enabled):**
- `players(id uuid, name unique, email unique, auth_id -> auth.users, is_admin, active)`. Players exist before their login does; the Auth trigger links them by email.
- `fixtures(id 1..380, gw, kickoff timestamptz UTC, home, away, super6, derby, status, home_goals, away_goals, result_source 'feed'|'admin', api_match_id, updated_at, unique(home,away))`. `id` is the fixture number from the Sheet's `#` column, so history lines up. Every league pairing happens once, which is what makes `unique(home,away)` safe.
- `predictions(player_id, fixture_id, home_goals, away_goals, updated_at)` primary key `(player_id, fixture_id)`.
- `settings(key, value)`: `lock_mode` = `first_super6` (or `per_match`), `bonus_open` = `true`, `bonus_public` = `false`.
- `bonus_slots`, `bonus_picks`, `bonus_actual`. Slots: `champion`, `top4_1..4`, `bottom3_1..3`, `golden_boot`, `playmaker`, `pots`, `young`, `golden_glove`, `manager`, `first_sacked`, `best_promoted`. `bonus_actual(group_key, accepted text[])` lists every accepted spelling; matching is case-insensitive and trimmed. Imported picks have inconsistent spellings (for example `Bruno F`, `Bruno F.`, `Bruno. F`), so list all variants when awards are confirmed.

**Functions:** `current_player()`, `is_admin()`, `pred_locked(fid)`, `score(ph,pa,ah,aa)`, `handle_new_user()` (trigger on `auth.users`; links by email and **raises an exception for an uninvited email**), `admin_set_prediction(pid,fid,h,a)` (security definer, admin only, bypasses the lock for late entries), `touch_updated_at()`.

**Views:** `v_points` (finished Super 6 matches only), `v_gw_points` (a week is `complete` only when all six Super 6 results are in), `v_bonus`, `v_leaderboard` (rank by total, then exact, then GD). They run with owner rights and only ever expose finished matches, which are always past the lock, so nothing leaks. Supabase labels them "UNRESTRICTED" in the table editor; that is expected. `anon` has all privileges revoked, so everything needs a login.

**RLS in plain terms:** everyone logged in can read players, fixtures, settings, bonus slots and `bonus_actual`. Only the admin writes those (the sync job uses the secret key and bypasses RLS). Predictions: you read your own any time, other people's only once `pred_locked`. You insert, update or delete only your own, only before the lock, and only for Super 6 fixtures. Bonus picks: own any time, others' only when `bonus_public = 'true'`; writes only when `bonus_open = 'true'`. The admin cannot read others' picks before the lock either (Sam is also a competitor); admin entries go through `admin_set_prediction`.

**Lock rule (default, Sam accepted the defaults but check he still agrees):** all six picks lock at the **first kick-off among that week's Super 6 matches**, not the first match of the gameweek, so a Friday non-Super 6 game does not lock anyone. `per_match` is available via the setting.

**Scoring:** exact score 5; correct goal difference 3 (a correctly called draw always lands here); correct outcome 1 (draws never score 1); otherwise 0. Season bonus maximum 140: champion 20, top 4 at 5 each, bottom 3 at 5 each, Golden Boot 10, Playmaker 10, Player of the Season 15, Young Player 10, Golden Glove 10, Manager of the Season 10, first manager sacked 10, best promoted club 10. Ties break on total, then exact scores, then correct goal differences.

**Super 6 selection:** 228 of 380 fixtures are flagged `super6` (six per gameweek, 38 weeks). The Big 4 (Arsenal, Chelsea, Man City, Man United) feature in the six every single week without exception. The flags were imported from the Sheet; the admin screen needs to let Sam change them, enforcing exactly six per week and the Big 4 rule.

## 6. Import and reconciliation

The import was generated from an `.xlsx` export of the Sheet. Team names in the database use the Sheet's spellings (`Man City`, `Man United`, `Nott'm Forest`, `Hull City`, `Tottenham`, and so on).

Baseline from `select * from v_leaderboard order by rank;` immediately after import (56 scored results, GW1 to GW9 plus two GW10 games). It will move as results come in; use it as a regression check against the Sheet:

| Rank | Player | Exact | GD | Outcome | Total | Last 5 GW |
|---|---|---|---|---|---|---|
| 1 | Bijeon | 7 | 11 | 10 | 78 | 45 |
| 2 | Adam | 5 | 11 | 14 | 72 | 38 |
| 3 | Sergi | 3 | 13 | 15 | 69 | 34 |
| 4 | Julian | 6 | 8 | 14 | 68 | 27 |
| 5 | Rush | 4 | 12 | 12 | 68 | 22 |
| 6 | Hockey | 5 | 8 | 17 | 66 | 39 |
| 7 | Andreas | 6 | 4 | 18 | 60 | 39 |
| 8 | Sam | 3 | 8 | 16 | 55 | 27 |
| 9 | Notty | 2 | 4 | 17 | 39 | 21 |

Kick-offs were converted from the Sheet's UK local times to UTC using Europe/London rules (BST until 25 Oct 2026, GMT through winter, BST again from 28 Mar 2027). The sync job writes the feed's UTC times directly, so no conversion is needed there.

## 7. The sync job

`sync/sync_fixtures.py` matches API teams to our names by a lowercase substring table (`TEAMS`), pairs matches by (home, away), and patches only what changed: `kickoff`, `status` (FINISHED, IN_PLAY, POSTPONED, SCHEDULED), full-time goals when finished, and `api_match_id`. Behaviour worth knowing:

- Results entered by the admin (`result_source = 'admin'`, status FINISHED) are **never overwritten**; a warning is printed if the feed disagrees.
- If a finished result changes in the feed, it logs `RESULT CHANGED`.
- If the feed's matchday differs from our `gw`, it logs a warning and does not change `gw`.
- Any team it cannot match makes the run fail (exit 1), so a failed run means "add a team to `TEAMS`".
- Manual runs default to dry run (`workflow_dispatch` input `dry_run`); the schedule runs live.
- GitHub disables scheduled workflows after 60 days of no repository activity.
- Cosmetic: `actions/checkout@v4` triggers a Node 20 deprecation warning. Bump to `@v5` when convenient.

Known limit: the free feed is delayed, so scores can arrive late. The admin override is the fallback.

## 8. Specs for the site

**Timezones (explicit requirement):** base time is UK (GMT/BST), but every kick-off is displayed **converted to each user's browser timezone**. Show local time as the main figure with a small "UK 15:00" beside it, plus a toggle to flip the main display to UK. Use `Intl.DateTimeFormat` (local zone and `timeZone: 'Europe/London'`). Group each gameweek by **UK matchday** so everyone sees the same list; show the local date next to the time when it differs (a 20:00 UK game is 01:30 the next day in India). The lock is enforced server-side in UTC and never depends on a client clock.

**Login:** username-only. The login screen takes a name such as `adam` and password; the site builds the email `adam@super6.league` (lowercased) and calls `signInWithPassword`. No real emails are collected, there is no email confirmation (users are created in the Supabase dashboard with Auto Confirm ticked), and password reset emails cannot work, so the admin resets passwords in the dashboard. Passwords must not equal names (Sam originally wanted that; the reason for declining was that any player could impersonate another and edit their picks before the lock, and Supabase wants at least 6 characters anyway). The site needs a **Change password** screen (`supabase.auth.updateUser({ password })`) and players should be encouraged to use it on first login.

**Pages:**
1. Login.
2. Leaderboard (from `v_leaderboard`): rank, exact, GD, outcome, match points, bonus, total, last 5 GW, movement since the previous complete week.
3. This week: the six Super 6 fixtures, own picks editable until the lock; after the lock, everyone's picks beside live and final results.
4. Gameweek history (`v_gw_points`): points per week chart, weekly winner.
5. Fixtures: all 380, local plus UK time, status, score, Super 6 marker.
6. Players: per-player history.
7. Bonus: own picks editable while `bonus_open`; others' picks only when `bonus_public`.
8. Rules: the points table and tie-breaks.
9. Admin (only when `is_admin()`): choose the six per week (exactly six, Big 4 always in), override a result (`status='FINISHED'`, goals, `result_source='admin'`), enter late predictions via `admin_set_prediction`, set `bonus_actual`, toggle `settings`, manage `active` players. Creating or deleting Auth users needs the secret key and cannot be done from the browser; either keep that in the Supabase dashboard or build a small Edge Function later.

Poll or refresh data about once a minute during matches; no realtime needed.

**Design brief:** apply Sam's "Impeccable" design approach: commit to one clear concept rather than a template, honour his brief over your taste, never invent prices, customers, testimonials or data, use real assets rather than gradients and generic icons, check desktop and mobile once, fix everything in one batch, then stop. Mobile first, since friends will open it on phones. A proposed (not yet approved) concept: a Saturday-paper league table in Premier League purple. Show Sam the concept before building.

## 9. Remaining work, in order

1. **Prerequisites:** confirm the nine Auth users exist and each links to a player (`select name, auth_id from players;` should show no nulls); enable GitHub Pages (Settings > Pages > Deploy from a branch > `main` / root); get the publishable key from Sam; add `db/` and the SQL files to the repo; read the sync log for `kickoff` lines.
2. **Milestone 1:** login, leaderboard, gameweek history, fixtures and results, timezone handling. Acceptance: logged-out users see nothing; leaderboard matches the baseline above (or the live Sheet).
3. **Security tests before any picks are entered on the site** (use two real logins): player A cannot read player B's pre-lock picks; an insert or update after the lock is rejected; a non-Super 6 fixture insert is rejected; a non-admin cannot update `fixtures`; `admin_set_prediction` works for the admin and fails for others; an uninvited email cannot sign up.
4. **Milestone 2:** prediction entry with lock, bonus picks.
5. **Milestone 3:** admin screen.
6. **Parallel run:** keep the Sheet and the site running side by side for two gameweeks and compare leaderboards, then retire the Sheet. A nightly backup export back to a Sheet was agreed in principle and is not designed yet. The launch target is GW11, which starts Sat 21 Nov 2026 (first game 12:30 UK); players can keep entering GW11 picks in the Sheet if the site is not ready.
7. **When the Premier League publishes new amendments** (TV selections for GW21 onward come in batches, the next due the week of 30 Nov), the sync job picks up the new times by itself.

## 10. Current state of the Google Sheet

It is still live. In this session the Sheet was changed as follows, so be aware if you read it: Fixtures tab date and kick-off columns for GW10 to GW20 were updated to the official amended schedule (GW21 to GW38 are still the original June times because no amendments exist yet); GW11 to GW20 rows were sorted chronologically, and the Predictions, Results and Calc formulas were re-pointed so they follow; GW10 was left untouched because players had already entered picks. Fixture numbers (`#`) stayed attached to their matches, so a week can read #102, #101, #103. Sam typed the Newcastle 0-1 Everton result himself. The Sheet's Calc tab uses a helper with absolute references to specific Fixtures rows, so do not sort or move Fixtures rows there again without re-pointing.

## 11. Working with Sam

- He writes lowercase and telegraphic and iterates in small nudges. Short, direct answers.
- **He does not use a terminal.** Never ask him to run commands. Prefer browser steps he can follow (GitHub web UI, Supabase dashboard), explained step by step for a beginner. In his own domains (analytics, Fantasy Premier League, EA FC) skip the basics.
- No em dashes and no AI-sounding phrasing in anything written for him; it should sound human.
- Verify accuracy on anything consequential and say what you checked.
- Default deliverables to Google Docs, Sheets and Slides in his Drive, not Office files.
- **Never edit his live epldesk.com site** (push, deploy, data writes) without his explicit permission. It is a separate project; this league site must not touch it or its DNS. The default address for this site is the github.io one.
- Ask before pushing to `main` in this repo for the first time.
- All times in Football research are shown in IST for him, but this site's rule is local-per-user with UK as the base (section 8).
- Never put credentials in chat, files or commits.

## 12. Open questions for Sam

1. Is the lock rule (first Super 6 kick-off of the week) what he wants, or per match?
2. Derby flags: does he want derbies marked, and if so which fixtures?
3. Does he want fixture numbers renumbered so they read in order within a week?
4. Cutover date for retiring the Sheet, and how the nightly backup should look.
5. How late joiners and players leaving should be handled (`active` flag exists; points for missed weeks are not defined).
6. Whether the bonus picks should be public from the start or revealed later (`bonus_public`).
