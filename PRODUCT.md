# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

delegated: plain HTML, CSS and JavaScript with no build step, loading supabase-js from a pinned CDN version. Supabase (Postgres, Auth, row level security) holds the data and logins. Hosted on Netlify's free tier from the `site/` folder of this repo, so friends see a Netlify address and never the GitHub repo. A GitHub Action (`sync/sync_fixtures.py`) pulls fixtures and results from football-data.org every 15 minutes.

## Users

The nine players of the RTFM Mods Premier League 2026/27 "Super 6" prediction league: a group of friends, some living outside the UK. They check the table, results, kick-off times and each other's picks around matchdays, on phones and desktops equally. Sam runs the league and is also a player, so he is the admin but has no special view of other people's picks before the lock. Sam is not a developer and does not use a terminal.

## Product Purpose

Replace the Google Sheet the league runs on today. Each gameweek six matches are picked (the "Super 6"); every player predicts the score of each. The site shows the league table, gameweek history, fixtures and results, and the season bonus picks, with times in each person's own time zone alongside UK time. Success: the friends stop needing the Sheet, and the table on the site matches what the Sheet would say.

## Positioning

A private league for one friend group, built around its own rules: the Super 6 selection, the lock at the first Super 6 kick-off, and the season bonus categories. Not a public prediction game.

## Operating Context

- Matchdays are UK matchdays. Kick-offs are stored in UTC and shown in the viewer's local time with UK time (GMT/BST) beside it; the gameweek list is grouped by UK date so everyone sees the same list.
- Results arrive from the sync job, delayed by a few minutes on the free feed. Sam can override a result.
- The Google Sheet stays live during a parallel run until the site is trusted.

## Capabilities and Constraints

- Picks lock per match at each kick-off (`lock_mode = per_match`, set by Sam on 8 Nov 2026). Bonus picks are public.
- Login is a league name plus password (the site turns `adam` into `adam@super6.league`). No email reset; Sam resets passwords in the Supabase dashboard.
- Anyone with the link can view the site (table, gameweeks, fixtures, results, bonus, rules). Signing in, top right, adds the player's own picks on the Predictions tab and, for Sam, the Admin tab. Other players' picks are visible only after the lock; bonus picks of others only when Sam makes them public. Bonus picks cannot be edited on the site.
- Scoring: exact score 5, correct goal difference 3, correct result 1. Season bonus up to 140. Ties break on total, then exact scores, then goal differences.
- Built: public view, sign in, change password, table, predictions entry with lock, gameweeks (chart, weekly winners, picks grid), fixtures and results, bonus (read only), rules, admin (choose the six with the Big 4 rule, override results, late picks, bonus answers, settings, active players).
- Undecided: derby markers, renumbering fixtures, Sheet cutover date, late joiners.

## Brand Commitments

Name: "Super 6", for RTFM Mods. Premier League purple is the accent. Sam asked for neat, clean, minimal and modern, guided by impeccable.style.

## Evidence on Hand

Real data only: 9 players, 380 fixtures, picks and bonus picks imported from the Sheet (`db/`). Club crests and the Premier League emblem are shown at Sam's request, loaded from football-data.org (the results feed) with a club-code fallback. No player photos. No invented stats, quotes or testimonials.

## Product Principles

- The table must be right. It matches the database views exactly; never estimate.
- Time is local first, UK always beside it.
- Fair by construction: the server enforces the lock and visibility, never the browser.
- Quiet and fast on a phone in a pub as much as on a desk.

## Accessibility & Inclusion

WCAG AA contrast, no meaning by colour alone (points show as numbers as well as tints), readable at 16px body text, works in light and dark mode.
