# Super 6 League

Website for the RTFM Mods Premier League 2026/27 Super 6 prediction league.

- `site/` is the website (plain HTML, CSS and JavaScript, no build step). Netlify publishes only this folder.
- `db/` holds the SQL that set up the Supabase database. Already run; do not run again.
- `sync/` and `.github/workflows/sync.yml` pull fixtures and results from football-data.org every 15 minutes.
- `PRODUCT.md` and `docs/HANDOVER.md` describe the league, the rules and what is left to build.

## Put the site live on Netlify (one time, about 5 minutes)

1. Go to https://app.netlify.com and sign up (free) with your GitHub account.
2. Click **Add new site** > **Import an existing project** > **GitHub**.
3. Allow Netlify to see the `premleague-pred` repository, then pick it.
4. On the settings screen leave everything as it is (the `netlify.toml` file in this repo already tells Netlify to publish the `site` folder) and click **Deploy**.
5. When it finishes, go to **Site configuration** > **Change site name** and pick a name, for example `super6-rtfm`. The address becomes `https://super6-rtfm.netlify.app`. That is the link to send your friends. It does not show or link to GitHub.

From then on, every change pushed to `main` goes live by itself within a minute or so.

## Open the site to everyone (view only)

Run this once, so people can see the table without signing in:

1. Supabase > **SQL Editor** > **New query**.
2. Open `db/04_public_read.sql` here on GitHub, click the copy button (top right of the file), paste it into the query box and click **Run**.
3. It should say "Success. No rows returned". Open the site in a private window: the table should show without signing in.

It makes the table, fixtures, results, player names and picks after the lock readable by anyone with the link. Login emails stay hidden, and nobody can change anything without signing in.

## Live scores: let Supabase fetch them every minute (one time, about 3 minutes)

GitHub runs the scheduled sync late (about once an hour on a quiet repo), so Supabase does the fetching instead. Scores from the free football-data.org plan still run a few minutes behind the real game.

1. Find your football-data.org API token: sign in at football-data.org, it is on your account page (it was also emailed to you when you registered).
2. Supabase > **SQL Editor** > **New query**. Paste this line, replace `PASTE-TOKEN-HERE` with your token (keep the quotes), click **Run**:
   `select vault.create_secret('PASTE-TOKEN-HERE', 'football_data_token');`
   This stores the token encrypted in Supabase Vault. Do not paste the token anywhere else.
3. **New query** again. Open `db/07_live_sync.sql` here on GitHub, copy it all, paste, click **Run**.
4. Wait two minutes, then run `select last_status, last_applied_at from public.sync_state;` It should say `ok, ... changed` with a recent time. The site footer then shows "scores last checked" with that time.

## Two settings to check in Supabase

1. **Sign-ups off:** Authentication > Sign In / Providers > turn off **Allow new users to sign up**. (Uninvited emails are blocked by the database anyway, but this closes the door properly.)
2. **Logins exist:** Authentication > Users should list the nine `<name>@super6.league` users. Players sign in on the site with just their name (`adam`) and password. When adding someone later, tick **Auto Confirm User**, because "Confirm email" is on and these addresses cannot receive mail.

Forgotten passwords: Authentication > Users > the player > **Send password recovery** will not work (no real emails), so use the three dots > **Update user** and set a new password, then tell the player.
