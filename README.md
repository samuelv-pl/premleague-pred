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

## Two settings to check in Supabase

1. **Sign-ups off:** Authentication > Sign In / Providers > turn off **Allow new users to sign up**. (Uninvited emails are blocked by the database anyway, but this closes the door properly.)
2. **Logins exist:** Authentication > Users should list the nine `<name>@super6.league` users. Players sign in on the site with just their name (`adam`) and password.

Forgotten passwords: Authentication > Users > the player > **Send password recovery** will not work (no real emails), so use the three dots > **Update user** and set a new password, then tell the player.
