#!/usr/bin/env python3
"""Pull fixtures, kick-off times and full-time scores from football-data.org
and write any changes into the Supabase `fixtures` table.

Needs three secrets as environment variables (set in GitHub, never in code):
  FOOTBALL_DATA_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY
Run with --dry-run to print what would change without writing anything.
"""
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

DRY = "--dry-run" in sys.argv
SEASON = os.environ.get("SEASON", "2026")  # 2026 = the 2026/27 season

# Name used in our database -> text that must appear in the API's team name.
TEAMS = {
    "Arsenal": "arsenal", "Aston Villa": "aston villa", "Bournemouth": "bournemouth",
    "Brentford": "brentford", "Brighton": "brighton", "Chelsea": "chelsea",
    "Coventry": "coventry", "Crystal Palace": "crystal palace", "Everton": "everton",
    "Fulham": "fulham", "Hull City": "hull", "Ipswich": "ipswich", "Leeds": "leeds",
    "Liverpool": "liverpool", "Man City": "manchester city",
    "Man United": "manchester united", "Newcastle": "newcastle",
    "Nott'm Forest": "nottingham", "Sunderland": "sunderland", "Tottenham": "tottenham",
}

STATUS = {
    "FINISHED": "FINISHED", "AWARDED": "FINISHED",
    "IN_PLAY": "IN_PLAY", "PAUSED": "IN_PLAY",
    "POSTPONED": "POSTPONED", "SUSPENDED": "POSTPONED", "CANCELLED": "POSTPONED",
}  # anything else (SCHEDULED, TIMED) counts as SCHEDULED


def http(method, url, headers, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        sys.exit(f"HTTP {e.code} from {url.split('?')[0]}: {e.read().decode()[:300]}")


def team_name(api_team):
    text = f"{api_team.get('name', '')} {api_team.get('shortName', '')}".lower()
    hits = [ours for ours, needle in TEAMS.items() if needle in text]
    return hits[0] if len(hits) == 1 else None


def parse_utc(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(timezone.utc)


def main():
    fd_token = os.environ["FOOTBALL_DATA_TOKEN"]
    sb_url = os.environ["SUPABASE_URL"].rstrip("/")
    sb_key = os.environ["SUPABASE_SERVICE_KEY"]
    sb = {"apikey": sb_key, "Authorization": f"Bearer {sb_key}",
          "Content-Type": "application/json", "Prefer": "return=minimal"}

    api = http("GET", f"https://api.football-data.org/v4/competitions/PL/matches?season={SEASON}",
               {"X-Auth-Token": fd_token})
    matches = api.get("matches", [])
    rows = http("GET", f"{sb_url}/rest/v1/fixtures?select=*&order=id.asc&limit=1000", sb)
    by_pair = {(r["home"], r["away"]): r for r in rows}
    print(f"feed: {len(matches)} matches | database: {len(rows)} fixtures | dry run: {DRY}")

    unmatched, changes, warnings = [], [], []
    for m in matches:
        home, away = team_name(m["homeTeam"]), team_name(m["awayTeam"])
        row = by_pair.get((home, away)) if home and away else None
        if not row:
            unmatched.append(f"{m['homeTeam'].get('name')} v {m['awayTeam'].get('name')}")
            continue

        status = STATUS.get(m["status"], "SCHEDULED")
        full = (m.get("score") or {}).get("fullTime") or {}
        # Live (in-play) scores are stored too, so the site can show them. They never count
        # for points: the scoring views only use matches with status FINISHED.
        hg, ag = (full.get("home"), full.get("away")) if status in ("FINISHED", "IN_PLAY") else (None, None)
        patch = {}

        if parse_utc(m["utcDate"]) != parse_utc(row["kickoff"]):
            patch["kickoff"] = parse_utc(m["utcDate"]).strftime("%Y-%m-%dT%H:%M:%S+00:00")
        if row.get("api_match_id") != m["id"]:
            patch["api_match_id"] = m["id"]
        if m.get("matchday") and m["matchday"] != row["gw"]:
            warnings.append(f"#{row['id']} {home} v {away}: feed says matchday {m['matchday']}, we have GW {row['gw']} (not changed)")

        # Admin-entered final results are never overwritten by the feed.
        if row["result_source"] == "admin" and row["status"] == "FINISHED":
            if status == "FINISHED" and (hg, ag) != (row["home_goals"], row["away_goals"]):
                warnings.append(f"ADMIN RESULT DIFFERS #{row['id']} {home} v {away}: ours {row['home_goals']}-{row['away_goals']}, feed {hg}-{ag} (kept ours)")
        else:
            if status != row["status"]:
                patch["status"] = status
            if status in ("FINISHED", "IN_PLAY") and hg is not None and ag is not None \
                    and (hg, ag) != (row["home_goals"], row["away_goals"]):
                if status == "FINISHED" and row["status"] == "FINISHED":
                    warnings.append(f"RESULT CHANGED #{row['id']} {home} v {away}: {row['home_goals']}-{row['away_goals']} -> {hg}-{ag}")
                patch["home_goals"], patch["away_goals"] = hg, ag
            elif status in ("SCHEDULED", "POSTPONED") and row["status"] == "IN_PLAY" and row["home_goals"] is not None:
                # A match that was live and then abandoned or reset: drop the partial score.
                patch["home_goals"], patch["away_goals"] = None, None

        if patch:
            changes.append((row, patch))

    for row, patch in changes:
        print(f"#{row['id']:>3} {row['home']} v {row['away']}: {patch}")
        if not DRY:
            http("PATCH", f"{sb_url}/rest/v1/fixtures?id=eq.{row['id']}", sb, patch)

    for w in warnings:
        print("WARNING:", w)
    print(f"{len(changes)} fixture(s) {'would change' if DRY else 'updated'}; {len(unmatched)} unmatched")
    if unmatched:
        print("UNMATCHED (add the team to TEAMS):", "; ".join(unmatched[:10]))
        sys.exit(1)


if __name__ == "__main__":
    main()
