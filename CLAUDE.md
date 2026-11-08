# Super 6 league website

Read `docs/HANDOVER.md` first, then `PRODUCT.md`. The handover has the full state, architecture, database rules and remaining work.

Standing rules for this repo:
- The owner (Sam) has no terminal and is not a developer. Never ask him to run commands. Give beginner-friendly browser steps.
- No secrets in code, commits, chat or docs. The site only ever holds the Supabase URL and publishable key.
- Do not touch epldesk.com or its DNS. Sam approved pushing to `main` on 8 Nov 2026; `main` auto-deploys to Netlify.
- Hosting is Netlify (free tier), serving only `site/`. Not GitHub Pages: Sam does not want friends to see the GitHub repo.
- Design work uses the Impeccable skill (`.claude/skills/impeccable`, hooks in `.claude/settings.json`). It needs `impeccable.style` reachable to download its engine.
- Kick-offs are stored in UTC. Show each user's local time with UK (GMT/BST) as the base reference.
- Do not re-run `db/01_schema.sql`, `02_seed.sql` or `03_history.sql` on the live Supabase project. New schema changes go in new numbered files.
- No em dashes or AI-sounding phrasing in anything written for Sam.
- Design: one clear concept, no invented data, phone and desktop matter equally, check desktop and mobile once, fix in one batch, stop.
