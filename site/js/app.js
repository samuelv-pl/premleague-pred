/* Super 6 League site. Plain JS, no build step.
 * Data comes from Supabase under row level security; nothing is readable
 * without a login. Kick-offs are stored in UTC and shown in each viewer's
 * own time zone, with UK time (Europe/London) as the shared reference. */
(function () {
  'use strict';

  const CFG = window.S6_CONFIG;
  const app = document.getElementById('app');
  const tip = document.getElementById('tip');

  if (!window.supabase || !CFG) {
    app.innerHTML = '<div class="boot">Could not load the site. Check your connection and refresh.</div>';
    return;
  }
  const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });

  // ---------------------------------------------------------------- utils
  const UK = 'Europe/London';
  const LOCAL = (Intl.DateTimeFormat().resolvedOptions().timeZone) || UK;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
  };
  const fmtCache = new Map();
  function fmt(date, tz, opts) {
    const key = tz + JSON.stringify(opts);
    let f = fmtCache.get(key);
    if (!f) { f = new Intl.DateTimeFormat('en-GB', Object.assign({ timeZone: tz }, opts)); fmtCache.set(key, f); }
    return f.format(date);
  }
  const hm = (d, tz) => fmt(d, tz, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const dayKey = (d, tz) => fmt(d, tz, { year: 'numeric', month: '2-digit', day: '2-digit' });
  const shortDay = (d, tz) => fmt(d, tz, { weekday: 'short', day: 'numeric', month: 'short' });
  const tzAbbr = (d, tz) => {
    try {
      const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz, timeZoneName: 'short' }).formatToParts(d);
      return (p.find((x) => x.type === 'timeZoneName') || {}).value || '';
    } catch (e) { return ''; }
  };
  const sameClock = (d) => hm(d, LOCAL) === hm(d, UK) && dayKey(d, LOCAL) === dayKey(d, UK);
  const localIsUK = sameClock(new Date('2026-01-15T12:00:00Z')) && sameClock(new Date('2026-07-15T12:00:00Z'));

  function timeMode() { return localIsUK ? 'uk' : store.get('s6.timeMode', 'local'); }

  // Main time plus the other zone underneath. Days are grouped by UK matchday,
  // so when the viewer's date differs from the UK date we show their weekday too.
  function timeHTML(d) {
    const ukT = hm(d, UK);
    if (localIsUK || sameClock(d)) {
      return `<span class="main">${ukT}</span><span class="alt">${localIsUK ? 'UK' : 'UK and you'}</span>`;
    }
    const locT = hm(d, LOCAL);
    const locDiff = dayKey(d, LOCAL) !== dayKey(d, UK);
    const locLabel = (locDiff ? fmt(d, LOCAL, { weekday: 'short' }) + ' ' : '') + locT;
    if (timeMode() === 'uk') {
      return `<span class="main">${ukT}</span><span class="alt">You ${esc(locLabel)}</span>`;
    }
    return `<span class="main">${esc(locLabel)}</span><span class="alt">UK ${ukT}</span>`;
  }
  // One-line version for sentences: "Sat 21 Nov 12:30 UK (18:00 your time)".
  function whenText(d) {
    const uk = `${shortDay(d, UK)} ${hm(d, UK)} UK`;
    if (localIsUK || sameClock(d)) return uk;
    const sameDay = dayKey(d, LOCAL) === dayKey(d, UK);
    const loc = (sameDay ? '' : shortDay(d, LOCAL) + ' ') + hm(d, LOCAL);
    return timeMode() === 'uk' ? `${uk} (${loc} your time)` : `${loc} your time (${uk})`;
  }

  const CODES = {
    'Arsenal': 'ARS', 'Aston Villa': 'AVL', 'Bournemouth': 'BOU', 'Brentford': 'BRE', 'Brighton': 'BHA',
    'Chelsea': 'CHE', 'Coventry': 'COV', 'Crystal Palace': 'CRY', 'Everton': 'EVE', 'Fulham': 'FUL',
    'Hull City': 'HUL', 'Ipswich': 'IPS', 'Leeds': 'LEE', 'Liverpool': 'LIV', 'Man City': 'MCI',
    'Man United': 'MUN', 'Newcastle': 'NEW', "Nott'm Forest": 'NFO', 'Sunderland': 'SUN', 'Tottenham': 'TOT',
  };
  // Small drawn icons (stroke icons, one weight) instead of text glyphs.
  const svg = (d, cls) => `<svg class="ic${cls ? ' ' + cls : ''}" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;
  const ICON = {
    up: svg('M4 10l4-4 4 4'), down: svg('M4 6l4 4 4-4'),
    prev: svg('M10 3.5L5.5 8l4.5 4.5'), next: svg('M6 3.5L10.5 8 6 12.5'),
    check: svg('M3.5 8.5l3 3 6-7'),
  };
  const code = (t) => CODES[t] || String(t).slice(0, 3).toUpperCase();

  // Same rule as public.score() in the database.
  function score(ph, pa, ah, aa) {
    if ([ph, pa, ah, aa].some((x) => x == null)) return null;
    if (ph === ah && pa === aa) return 5;
    if (ph - pa === ah - aa) return 3;
    if (Math.sign(ph - pa) === Math.sign(ah - aa)) return 1;
    return 0;
  }
  const isDone = (f) => f.status === 'FINISHED' && f.home_goals != null && f.away_goals != null;

  // ---------------------------------------------------------------- data
  const S = { session: null, me: null, data: null, loadedAt: null, error: null };

  async function fetchAll(table, cols, order) {
    const out = [];
    for (let from = 0; ; from += 1000) {
      let q = sb.from(table).select(cols).range(from, from + 999);
      if (order) q = q.order(order[0], { ascending: true }).order(order[1] || order[0], { ascending: true });
      const { data, error } = await q;
      if (error) throw new Error(`${table}: ${error.message}`);
      out.push(...data);
      if (data.length < 1000) return out;
    }
  }

  async function loadData() {
    const [players, fixtures, preds, points, gwPoints, board, settings, slots, picks, actual, vbonus] = await Promise.all([
      fetchAll('players', 'id,name,is_admin,active,auth_id', ['name']),
      fetchAll('fixtures', 'id,gw,kickoff,home,away,super6,derby,status,home_goals,away_goals,result_source,updated_at', ['id']),
      fetchAll('predictions', 'player_id,fixture_id,home_goals,away_goals', ['fixture_id', 'player_id']),
      fetchAll('v_points', 'player_id,gw,fixture_id,pts', ['fixture_id', 'player_id']),
      fetchAll('v_gw_points', 'player_id,name,gw,pts,complete', ['gw', 'player_id']),
      fetchAll('v_leaderboard', '*', ['rank', 'name']),
      fetchAll('settings', 'key,value', ['key']),
      fetchAll('bonus_slots', 'slot,group_key,label,points_each', ['slot']),
      fetchAll('bonus_picks', 'player_id,slot,pick', ['slot', 'player_id']),
      fetchAll('bonus_actual', 'group_key,accepted', ['group_key']),
      fetchAll('v_bonus', 'player_id,slot,points', ['slot', 'player_id']),
    ]);
    fixtures.forEach((f) => { f.ko = new Date(f.kickoff); });
    const set = Object.fromEntries(settings.map((r) => [r.key, r.value]));
    const byId = Object.fromEntries(players.map((p) => [p.id, p]));
    const predMap = new Map(preds.map((p) => [p.player_id + ':' + p.fixture_id, p]));
    const d = { players, byId, fixtures, preds, predMap, points, gwPoints, board, set, slots, picks, actual, vbonus };
    d.currentGw = currentGw(fixtures);
    return d;
  }

  // The week people care about now: the first gameweek whose last Super 6
  // match has not long kicked off. Falls back to 38 at the end of the season.
  function currentGw(fixtures) {
    const now = Date.now();
    for (let gw = 1; gw <= 38; gw++) {
      const six = fixtures.filter((f) => f.gw === gw && f.super6);
      if (!six.length) continue;
      const last = Math.max(...six.map((f) => f.ko.getTime()));
      if (last + 3 * 3600e3 > now || six.some((f) => !isDone(f) && f.status !== 'POSTPONED')) return gw;
    }
    return 38;
  }

  function lockTime(gw) {
    const six = S.data.fixtures.filter((f) => f.gw === gw && f.super6);
    if (!six.length) return null;
    return new Date(Math.min(...six.map((f) => f.ko.getTime())));
  }
  function isLocked(f) {
    if (S.data.set.lock_mode === 'per_match') return Date.now() >= f.ko.getTime();
    const l = lockTime(f.gw);
    return l ? Date.now() >= l.getTime() : false;
  }

  // ---------------------------------------------------------------- auth
  async function boot() {
    const { data } = await sb.auth.getSession();
    S.session = data.session;
    sb.auth.onAuthStateChange((evt, session) => {
      const had = !!S.session;
      S.session = session;
      if (evt === 'SIGNED_OUT' || (!session && had)) { S.me = null; S.data = null; render(); }
    });
    if (S.session) await refresh(true); else render();
    window.addEventListener('hashchange', () => { hideTip(); render(); window.scrollTo(0, 0); });
    setInterval(() => {
      if (S.session && document.visibilityState === 'visible' && !busyForm()) refresh(false);
    }, 60000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && S.session && S.loadedAt && Date.now() - S.loadedAt > 60000 && !busyForm()) refresh(false);
    });
  }
  const busyForm = () => !!document.activeElement && document.activeElement.tagName === 'INPUT';

  async function refresh(first) {
    if (first) app.innerHTML = '<div class="boot">Loading the league…</div>';
    try {
      S.data = await loadData();
      S.loadedAt = Date.now();
      S.error = null;
      const uid = S.session && S.session.user && S.session.user.id;
      S.me = S.data.players.find((p) => p.auth_id && p.auth_id === uid) || null;
    } catch (e) {
      S.error = e.message || String(e);
      if (/JWT|token|auth/i.test(S.error) && first) { await sb.auth.signOut(); return; }
    }
    render();
  }

  // ---------------------------------------------------------------- shell
  const TABS = [
    ['table', 'Table'], ['gameweeks', 'Gameweeks'], ['fixtures', 'Fixtures'],
    ['bonus', 'Bonus'], ['rules', 'Rules'], ['account', 'Account'],
  ];
  function route() {
    const parts = (location.hash.replace(/^#\/?/, '') || 'table').split('/');
    return { name: parts[0], arg: parts[1] };
  }

  function render() {
    hideTip();
    if (!S.session) { renderLogin(); return; }
    if (!S.data) {
      app.innerHTML = S.error ? shell('', `<div class="notice err">Could not load the league: ${esc(S.error)} <button class="linkbtn" data-act="retry">Try again</button></div>`) : '<div class="boot">Loading the league…</div>';
      bind();
      return;
    }
    const r = route();
    let body;
    switch (r.name) {
      case 'gameweeks': body = viewGameweeks(); break;
      case 'gw': body = viewGw(parseInt(r.arg, 10)); break;
      case 'fixtures': body = viewFixtures(r.arg ? parseInt(r.arg, 10) : S.data.currentGw); break;
      case 'bonus': body = viewBonus(); break;
      case 'rules': body = viewRules(); break;
      case 'account': body = viewAccount(); break;
      default: body = viewTable();
    }
    const active = r.name === 'gw' ? 'gameweeks' : (TABS.some((t) => t[0] === r.name) ? r.name : 'table');
    app.innerHTML = shell(active, body);
    bind();
    if (r.name === 'gameweeks') bindChart();
  }

  function shell(active, body) {
    const d = S.data;
    const name = S.me ? S.me.name : (S.session.user.email || '').split('@')[0];
    const warn = [];
    if (S.error) warn.push(`<div class="notice err"><span>The last refresh failed (${esc(S.error)}). You are looking at the data from before.</span><button class="btn quiet sm" data-act="retry">Try again</button></div>`);
    if (S.data && !S.me) warn.push('<div class="notice err">Your login is not linked to a player yet. Ask Sam to check that your player email matches your login.</div>');
    if (S.me && store.get('s6.pw.' + S.me.id, '') !== 'done' && route().name !== 'account') {
      warn.push(`<div class="notice"><span>Still on the starter password Sam gave you? Set your own so nobody else can sign in as you.</span><span class="acts"><a class="btn sm" href="#/account">Change password</a><button class="linkbtn small" data-act="pw-dismiss">Not now</button></span></div>`);
    }
    return `
<header class="top"><div class="wrap">
  <div class="bar">
    <a class="brand" href="#/table">Super 6<span>${d ? `GW${d.currentGw}` : ''}</span></a>
    <a class="who" href="#/account">${esc(name)}</a>
  </div>
  <nav class="tabs" aria-label="Sections">${TABS.map(([k, l]) => `<a href="#/${k}"${k === active ? ' aria-current="page"' : ''}>${l}</a>`).join('')}</nav>
</div></header>
<main><div class="wrap">${warn.join('')}${body}</div></main>
<footer class="foot"><div class="wrap"><p>RTFM Mods · ${esc(CFG.season)}. Updated ${S.loadedAt ? esc(hm(new Date(S.loadedAt), LOCAL)) : '-'} your time. Results come from football-data.org and can arrive a few minutes late. This page refreshes every minute.</p></div></footer>`;
  }

  function bind() {
    app.querySelectorAll('[data-act]').forEach((el) => {
      const act = el.getAttribute('data-act');
      if (el.tagName === 'FORM') return;
      el.addEventListener('click', (ev) => {
        if (act === 'retry') { ev.preventDefault(); refresh(!S.data); }
        if (act === 'pw-dismiss') { ev.preventDefault(); if (S.me) store.set('s6.pw.' + S.me.id, 'done'); render(); }
        if (act === 'tm') { store.set('s6.timeMode', el.getAttribute('data-v')); render(); }
        if (act === 's6only') { store.set('s6.s6only', el.checked ? '1' : '0'); render(); }
        if (act === 'signout') { ev.preventDefault(); sb.auth.signOut(); location.hash = ''; }
      });
    });
    const gwSel = app.querySelector('select[data-gw]');
    if (gwSel) gwSel.addEventListener('change', () => { location.hash = '#/' + gwSel.getAttribute('data-gw') + '/' + gwSel.value; });
    const chartSel = app.querySelector('select[data-chart-player]');
    if (chartSel) chartSel.addEventListener('change', () => { store.set('s6.chartPlayer', chartSel.value); render(); });
    const pw = app.querySelector('form[data-act="password"]');
    if (pw) pw.addEventListener('submit', onChangePassword);
  }

  // ---------------------------------------------------------------- login
  function renderLogin() {
    app.innerHTML = `
<div class="login">
  <h1 class="brand">Super 6</h1>
  <p class="lede">The RTFM Mods prediction league, ${esc(CFG.season)}. Sign in with your league name.</p>
  <form class="form" id="loginForm" novalidate>
    <label>Name<input name="u" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required placeholder="e.g. adam"></label>
    <label>Password<input name="p" type="password" autocomplete="current-password" required></label>
    <p class="err" id="loginErr" role="alert"></p>
    <button class="btn" type="submit">Sign in</button>
  </form>
  <p class="note">Forgotten your password? Ask Sam to reset it.</p>
</div>`;
    const form = document.getElementById('loginForm');
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const u = form.u.value.trim().toLowerCase().replace(/@.*$/, '');
      const p = form.p.value;
      const err = document.getElementById('loginErr');
      if (!u || !p) { err.textContent = 'Enter your name and password.'; return; }
      if (!/^[a-z0-9._-]+$/.test(u)) { err.textContent = 'Use just your league name, like adam.'; return; }
      const btn = form.querySelector('button');
      btn.disabled = true; btn.textContent = 'Signing in…'; err.textContent = '';
      const { data, error } = await sb.auth.signInWithPassword({ email: `${u}@${CFG.loginDomain}`, password: p });
      if (error) {
        btn.disabled = false; btn.textContent = 'Sign in';
        err.textContent = /invalid/i.test(error.message) ? 'That name and password do not match.' : error.message;
        return;
      }
      S.session = data.session;
      if (!location.hash || location.hash === '#/') location.hash = '#/table';
      await refresh(true);
    });
    form.u.focus();
  }

  // ---------------------------------------------------------------- table
  // Standings from scored picks up to a gameweek, ranked the same way as
  // v_leaderboard: total, then exact scores, then goal differences.
  function standings(maxGw) {
    const d = S.data;
    const bonus = Object.fromEntries(d.board.map((b) => [b.player_id, b.bonus || 0]));
    const rows = d.board.map((b) => ({ id: b.player_id, pts: 0, exact: 0, gd: 0, bonus: bonus[b.player_id] || 0 }));
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    d.points.forEach((p) => {
      const r = byId[p.player_id];
      if (!r || p.gw > maxGw || p.pts == null) return;
      r.pts += p.pts; if (p.pts === 5) r.exact++; if (p.pts === 3) r.gd++;
    });
    rows.forEach((r) => { r.total = r.pts + r.bonus; });
    rows.sort((a, b) => b.total - a.total || b.exact - a.exact || b.gd - a.gd);
    const rank = {};
    rows.forEach((r, i) => {
      const prev = rows[i - 1];
      r.rank = prev && prev.total === r.total && prev.exact === r.exact && prev.gd === r.gd ? prev.rank : i + 1;
      rank[r.id] = r.rank;
    });
    return rank;
  }

  function movementBase() {
    const d = S.data;
    if (!d.points.length) return null;
    const maxScored = Math.max(...d.points.map((p) => p.gw));
    const complete = new Set(d.gwPoints.filter((g) => g.complete).map((g) => g.gw));
    let base = null;
    complete.forEach((gw) => { if (gw < maxScored && (base == null || gw > base)) base = gw; });
    return base;
  }

  function viewTable() {
    const d = S.data;
    const base = movementBase();
    const before = base != null ? standings(base) : null;
    const scored = d.fixtures.filter((f) => f.super6 && isDone(f)).length;
    const total6 = d.fixtures.filter((f) => f.super6).length;
    const rows = d.board.map((b) => {
      let mv = '<span class="mv same">–</span>';
      if (before && before[b.player_id] != null) {
        const diff = before[b.player_id] - b.rank;
        if (diff > 0) mv = `<span class="mv up" title="Up ${diff} since GW${base}">${ICON.up}${diff}</span>`;
        else if (diff < 0) mv = `<span class="mv down" title="Down ${-diff} since GW${base}">${ICON.down}${-diff}</span>`;
        else mv = `<span class="mv same" title="No change since GW${base}">=</span>`;
      }
      const me = S.me && S.me.id === b.player_id;
      return `<tr class="${me ? 'me' : ''}">
        <td class="pos">${b.rank}</td>
        <td class="l">${mv}</td>
        <td class="l name">${esc(b.name)}<span class="sub">${b.exact} exact · ${b.gd} GD · ${b.outcome} result${b.bonus ? ` · ${b.bonus} bonus` : ''}</span></td>
        <td class="wide">${b.exact}</td><td class="wide">${b.gd}</td><td class="wide">${b.outcome}</td>
        <td class="wide">${b.match_pts}</td><td class="wide">${b.bonus}</td>
        <td>${b.last5}</td>
        <td class="tot">${b.total}</td>
      </tr>`;
    }).join('');
    return `
<div class="head"><div><h1>The table</h1>
<p class="lede">${scored} of ${total6} Super 6 results in.${base != null ? ` Arrows show moves since the end of GW${base}.` : ''}</p></div></div>
<table class="league">
  <thead><tr>
    <th class="l" title="Position">Pos</th><th class="l"><span class="sr">Move</span></th><th class="l">Player</th>
    <th class="wide" title="Exact scores, 5 points each">Exact</th><th class="wide" title="Correct goal difference, 3 points each">GD</th><th class="wide" title="Correct result, 1 point each">Result</th>
    <th class="wide" title="Points from match picks">Match</th><th class="wide" title="Season bonus points">Bonus</th>
    <th title="Points over the last five completed gameweeks">Last 5</th><th>Pts</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
<p class="note">Ties are split on exact scores, then correct goal differences. Last 5 counts the last five gameweeks with all six results in. Bonus points arrive as the season awards are settled; see <a href="#/bonus">Bonus</a>.</p>`;
  }

  // ---------------------------------------------------------------- gameweeks
  function gwSummary() {
    const d = S.data;
    const weeks = [];
    for (let gw = 1; gw <= 38; gw++) {
      const six = d.fixtures.filter((f) => f.gw === gw && f.super6);
      const done = six.filter(isDone).length;
      const rows = d.gwPoints.filter((g) => g.gw === gw);
      const complete = rows.length ? rows[0].complete : false;
      const best = rows.length ? Math.max(...rows.map((r) => r.pts)) : 0;
      const leaders = done ? rows.filter((r) => r.pts === best).map((r) => r.name) : [];
      const avg = rows.length ? rows.reduce((s, r) => s + r.pts, 0) / rows.length : 0;
      const pts = Object.fromEntries(rows.map((r) => [r.player_id, r.pts]));
      weeks.push({ gw, six, done, complete, best, leaders, avg, pts, lock: six.length ? new Date(Math.min(...six.map((f) => f.ko.getTime()))) : null });
    }
    return weeks;
  }

  function viewGameweeks() {
    const d = S.data;
    const weeks = gwSummary();
    const started = weeks.filter((w) => w.done > 0);
    const active = d.board.map((b) => d.byId[b.player_id]).filter(Boolean);
    let pid = store.get('s6.chartPlayer', S.me ? S.me.id : (active[0] && active[0].id));
    if (!active.some((p) => p.id === pid)) pid = S.me ? S.me.id : active[0] && active[0].id;
    const who = d.byId[pid];
    const opts = active.map((p) => `<option value="${esc(p.id)}"${p.id === pid ? ' selected' : ''}>${esc(p.name)}</option>`).join('');

    const nextUp = weeks.find((w) => w.six.length && !w.done);
    const shown = weeks.filter((w) => w.six.length && (w.done || w === nextUp));
    const list = shown.slice().reverse().map((w) => {
      let state, winner;
      if (w.complete) {
        state = '';
        winner = `<b>${w.leaders.map(esc).join(', ')}</b> won with ${w.best}`;
      } else if (w.done) {
        state = `<span class="pill">${w.done}/6 in</span>`;
        winner = `<b>${w.leaders.map(esc).join(', ')}</b> leading on ${w.best}`;
      } else {
        state = '<span class="pill">to play</span>';
        winner = w.lock ? `<span class="muted">Picks lock ${esc(whenText(w.lock))}</span>` : '';
      }
      const mine = S.me && w.done ? `${w.pts[S.me.id] != null ? w.pts[S.me.id] : 0}<small>you</small>` : '';
      return `<li><a href="#/gw/${w.gw}"><span class="n">GW${w.gw}</span><span class="w">${winner}${state}</span><span class="mine">${mine}</span></a></li>`;
    }).join('');

    return `
<div class="head"><div><h1>Gameweeks</h1>
<p class="lede">Points per week, and who took each one.</p></div></div>
<div class="chart">
  <div class="controls">
    <label class="small muted" for="chartPlayer">Points per gameweek for</label>
    <select id="chartPlayer" data-chart-player class="sel">${opts}</select>
  </div>
  ${started.length ? chartSVG(started, pid) : '<p class="note">No results yet.</p>'}
  <div class="key"><span><i class="k-bar"></i>${esc(who ? who.name : '')}</span><span><i class="k-avg"></i>League average</span><span><i class="k-prog"></i>Week still in progress</span></div>
</div>
<ul class="gwlist">${list}</ul>
<p class="note">Later gameweeks are on the <a href="#/fixtures">fixtures</a> page.</p>`;
  }

  let chartWeeks = null;
  function chartSVG(weeks, pid) {
    chartWeeks = { weeks, pid };
    const W = Math.round(Math.max(300, Math.min(808, window.innerWidth - 32))), H = W < 500 ? 200 : 240, L = 28, R = 6, T = 10, B = 24;
    const max = Math.max(30, ...weeks.map((w) => Math.max(w.best, w.pts[pid] || 0)));
    const top = Math.ceil(max / 10) * 10;
    const y = (v) => T + (H - T - B) * (1 - v / top);
    const n = weeks.length;
    const slot = (W - L - R) / Math.max(n, 10);
    const bw = Math.max(4, Math.min(28, slot - 4));
    let g = '';
    for (let v = 0; v <= top; v += 10) {
      g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--rule)" stroke-width="1"/>`;
      g += `<text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${v}</text>`;
    }
    const every = n > 20 ? 5 : n > 12 ? 2 : 1;
    weeks.forEach((w, i) => {
      const cx = L + slot * i + slot / 2;
      const v = w.pts[pid] || 0;
      const x0 = cx - bw / 2, y0 = y(v), yb = y(0), r = Math.min(4, bw / 2, yb - y0);
      const fill = w.complete ? 'var(--t5)' : 'var(--t1)';
      if (v > 0) {
        g += `<path d="M${x0},${yb} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} H${x0 + bw - r} Q${x0 + bw},${y0} ${x0 + bw},${y0 + r} V${yb} Z" fill="${fill}"/>`;
      }
      g += `<line x1="${cx - bw / 2 - 2}" x2="${cx + bw / 2 + 2}" y1="${y(w.avg)}" y2="${y(w.avg)}" stroke="var(--ink-2)" stroke-width="2"/>`;
      if (i % every === 0 || i === n - 1) g += `<text x="${cx}" y="${H - 8}" text-anchor="middle" font-size="11" fill="var(--muted)">${w.gw}</text>`;
      g += `<rect class="hit" data-i="${i}" x="${L + slot * i}" y="${T}" width="${slot}" height="${H - T - B}" fill="transparent"/>`;
    });
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Points per gameweek bar chart">${g}<text x="${W - R}" y="${H - 8}" text-anchor="end" font-size="0">GW</text></svg>`;
  }

  function bindChart() {
    const svg = app.querySelector('.chart svg');
    if (!svg || !chartWeeks) return;
    const show = (ev, el) => {
      const w = chartWeeks.weeks[+el.getAttribute('data-i')];
      const p = S.data.byId[chartWeeks.pid];
      tip.innerHTML = `<b>GW${w.gw}</b>${w.complete ? '' : ' (in progress)'}<br>${esc(p ? p.name : '')}: <b>${w.pts[chartWeeks.pid] || 0}</b><br>League average: ${w.avg.toFixed(1)}<br>${w.complete ? 'Won by' : 'Leading'}: ${w.leaders.map(esc).join(', ')} (${w.best})`;
      tip.hidden = false;
      const rect = el.getBoundingClientRect();
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      let x = rect.left + rect.width / 2 - tw / 2;
      x = Math.max(8, Math.min(window.innerWidth - tw - 8, x));
      let yy = rect.top - th - 6; if (yy < 8) yy = rect.top + 8;
      tip.style.left = x + 'px'; tip.style.top = yy + 'px';
    };
    svg.querySelectorAll('.hit').forEach((el) => {
      el.addEventListener('mouseenter', (ev) => show(ev, el));
      el.addEventListener('mouseleave', hideTip);
      el.addEventListener('click', (ev) => { show(ev, el); });
    });
  }
  function hideTip() { tip.hidden = true; }
  let resizeT = null, lastW = window.innerWidth;
  window.addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      if (Math.abs(window.innerWidth - lastW) > 40 && route().name === 'gameweeks' && S.data && !busyForm()) { lastW = window.innerWidth; render(); }
    }, 200);
  });
  window.addEventListener('scroll', hideTip, { passive: true });
  document.addEventListener('click', (ev) => { if (!(ev.target.closest && ev.target.closest('.hit'))) hideTip(); });

  function viewGw(gw) {
    const d = S.data;
    if (!(gw >= 1 && gw <= 38)) { location.hash = '#/gameweeks'; return ''; }
    const six = d.fixtures.filter((f) => f.gw === gw && f.super6).sort((a, b) => a.ko - b.ko || a.id - b.id);
    const lock = lockTime(gw);
    const locked = lock && Date.now() >= lock.getTime();
    const perMatch = d.set.lock_mode === 'per_match';
    const people = d.board.map((b) => d.byId[b.player_id]).filter(Boolean);
    const rows = people.map((p) => {
      let tot = 0;
      const cells = six.map((f) => {
        const pr = d.predMap.get(p.id + ':' + f.id);
        if (!pr) {
          const hidden = !(S.me && p.id === S.me.id) && !isLocked(f);
          return `<td><span class="cell none" title="${hidden ? 'Hidden until the lock' : 'No pick'}">${hidden ? '·' : '–'}</span></td>`;
        }
        const pts = isDone(f) ? score(pr.home_goals, pr.away_goals, f.home_goals, f.away_goals) : null;
        if (pts != null) tot += pts;
        const cls = pts == null ? 'p0' : 'p' + pts;
        const t = `${p.name}: ${pr.home_goals}-${pr.away_goals}${pts != null ? `, ${pts} pt${pts === 1 ? '' : 's'}` : ''}`;
        return `<td><span class="cell ${cls}" title="${esc(t)}">${pr.home_goals}-${pr.away_goals}${pts ? `<sup>${pts}</sup>` : ''}</span></td>`;
      }).join('');
      return { p, tot, html: cells };
    });
    const anyDone = six.some(isDone);
    if (anyDone) rows.sort((a, b) => b.tot - a.tot || a.p.name.localeCompare(b.p.name));
    const head = six.map((f) => {
      const res = isDone(f) ? `${f.home_goals}-${f.away_goals}` : f.status === 'IN_PLAY' ? '<span class="live">Live</span>' : f.status === 'POSTPONED' ? 'P-P' : esc(hm(f.ko, timeMode() === 'uk' ? UK : LOCAL));
      return `<th title="${esc(f.home)} v ${esc(f.away)}">${code(f.home)}<br>${code(f.away)}<span class="res">${res}</span></th>`;
    }).join('');
    const body = rows.map((r) => `<tr class="${S.me && r.p.id === S.me.id ? 'me' : ''}"><td class="pn">${esc(r.p.name)}</td>${r.html}<td class="tot">${anyDone ? r.tot : ''}</td></tr>`).join('');

    let status = '';
    if (!six.length) status = 'No Super 6 matches picked for this week yet.';
    else if (perMatch) status = 'Each pick locks at its own kick-off. Other players’ picks show once a match has kicked off.';
    else if (locked) status = `Picks locked ${esc(whenText(lock))}.`;
    else status = `Picks lock ${esc(whenText(lock))}. Until then you only see your own.`;

    const prev = gw > 1 ? `<a href="#/gw/${gw - 1}" aria-label="Previous gameweek">${ICON.prev}</a>` : `<span class="dis">${ICON.prev}</span>`;
    const next = gw < 38 ? `<a href="#/gw/${gw + 1}" aria-label="Next gameweek">${ICON.next}</a>` : `<span class="dis">${ICON.next}</span>`;
    const sel = Array.from({ length: 38 }, (_, i) => `<option value="${i + 1}"${i + 1 === gw ? ' selected' : ''}>GW${i + 1}</option>`).join('');
    return `
<div class="head"><div><h1>Gameweek ${gw}</h1><p class="lede">${status}</p></div>
<div class="stepper">${prev}<select class="sel" data-gw="gw" aria-label="Choose gameweek">${sel}</select>${next}</div></div>
${six.length ? `<div class="legend"><span><span class="cell p5">5</span> Exact score</span><span><span class="cell p3">3</span> Goal difference</span><span><span class="cell p1">1</span> Result</span><span><span class="cell p0">0</span> Wrong</span></div>
<div class="grid-scroll"><table class="picks"><thead><tr><th></th>${head}<th>Pts</th></tr></thead><tbody>${body}</tbody></table></div>` : ''}
<p class="note"><a href="#/fixtures/${gw}">All GW${gw} fixtures and kick-off times</a></p>`;
  }

  // ---------------------------------------------------------------- fixtures
  function viewFixtures(gw) {
    const d = S.data;
    if (!(gw >= 1 && gw <= 38)) gw = d.currentGw;
    const s6only = store.get('s6.s6only', '0') === '1';
    const list = d.fixtures.filter((f) => f.gw === gw && (!s6only || f.super6)).sort((a, b) => a.ko - b.ko || a.id - b.id);
    const lock = lockTime(gw);
    const days = [];
    list.forEach((f) => {
      const k = dayKey(f.ko, UK);
      let day = days[days.length - 1];
      if (!day || day.key !== k) { day = { key: k, label: fmt(f.ko, UK, { weekday: 'long', day: 'numeric', month: 'long' }), items: [] }; days.push(day); }
      day.items.push(f);
    });
    const rows = days.map((day) => `<div class="day">${esc(day.label)}</div>` + day.items.map((f) => {
      let score;
      if (isDone(f)) score = `<span class="score">${f.home_goals}–${f.away_goals}</span>`;
      else if (f.status === 'POSTPONED') score = '<span class="score pp">P–P</span>';
      else if (f.status === 'IN_PLAY') score = '<span class="score v"><span class="live">Live</span></span>';
      else score = '<span class="score v">v</span>';
      const extra = [];
      if (isDone(f)) extra.push('<span class="ft">Full time</span>');
      if (f.result_source === 'admin' && isDone(f)) extra.push('result entered by admin');
      if (f.super6 && S.me) {
        const pr = d.predMap.get(S.me.id + ':' + f.id);
        if (pr) {
          const pts = isDone(f) ? score_(pr, f) : null;
          extra.push(`your pick ${pr.home_goals}–${pr.away_goals}${pts != null ? ` · ${pts} pt${pts === 1 ? '' : 's'}` : ''}`);
        } else if (!isLocked(f)) extra.push('no pick yet');
      }
      return `<div class="fx${f.status === 'POSTPONED' ? ' dim' : ''}">
        <div class="time">${timeHTML(f.ko)}</div>
        <div class="teams"><span class="h">${esc(f.home)}</span>${score}<span class="a">${esc(f.away)}</span></div>
        <div class="tag">${f.super6 ? '<span class="s6" title="Super 6 match">S6</span>' : ''}</div>
        ${extra.length ? `<div class="extra">${extra.join(' · ')}</div>` : ''}
      </div>`;
    }).join('')).join('');

    const prev = gw > 1 ? `<a href="#/fixtures/${gw - 1}" aria-label="Previous gameweek">${ICON.prev}</a>` : `<span class="dis">${ICON.prev}</span>`;
    const next = gw < 38 ? `<a href="#/fixtures/${gw + 1}" aria-label="Next gameweek">${ICON.next}</a>` : `<span class="dis">${ICON.next}</span>`;
    const sel = Array.from({ length: 38 }, (_, i) => `<option value="${i + 1}"${i + 1 === gw ? ' selected' : ''}>GW${i + 1}</option>`).join('');
    const tm = timeMode();
    const now = new Date();
    const zoneLine = localIsUK
      ? `Times are UK time (${esc(tzAbbr(now, UK))}).`
      : `Your time zone: ${esc(LOCAL.replace(/_/g, ' '))} (${esc(tzAbbr(now, LOCAL))}). UK is on ${esc(tzAbbr(now, UK))}. Days follow the UK matchday so everyone sees the same list.`;
    let lockLine = '';
    if (lock) {
      lockLine = d.set.lock_mode === 'per_match'
        ? 'Super 6 picks lock at each match’s kick-off.'
        : `Super 6 picks ${Date.now() >= lock.getTime() ? 'locked' : 'lock'} at the first Super 6 kick-off: ${esc(whenText(lock))}.`;
    }
    return `
<div class="head"><div><h1>Fixtures &amp; results</h1><p class="lede">Gameweek ${gw}${lockLine ? '. ' + lockLine : ''}</p></div>
<div class="stepper">${prev}<select class="sel" data-gw="fixtures" aria-label="Choose gameweek">${sel}</select>${next}</div></div>
<div class="controls">
  ${localIsUK ? '' : `<span class="seg" role="group" aria-label="Show times in"><button data-act="tm" data-v="local" aria-pressed="${tm === 'local'}">My time</button><button data-act="tm" data-v="uk" aria-pressed="${tm === 'uk'}">UK time</button></span>`}
  <label class="check"><input type="checkbox" data-act="s6only"${s6only ? ' checked' : ''}> Super 6 only</label>
</div>
<p class="note">${zoneLine}</p>
${rows || '<p class="note">No matches.</p>'}`;
  }
  const score_ = (pr, f) => score(pr.home_goals, pr.away_goals, f.home_goals, f.away_goals);

  // ---------------------------------------------------------------- bonus
  function viewBonus() {
    const d = S.data;
    const isPublic = d.set.bonus_public === 'true';
    const open = d.set.bonus_open === 'true';
    const groups = [];
    d.slots.forEach((s) => {
      let g = groups.find((x) => x.key === s.group_key);
      if (!g) { g = { key: s.group_key, label: s.label, each: s.points_each, slots: [] }; groups.push(g); }
      g.slots.push(s.slot);
    });
    const order = ['champion', 'top4', 'bottom3', 'golden_boot', 'playmaker', 'pots', 'young', 'golden_glove', 'manager', 'first_sacked', 'best_promoted'];
    groups.sort((a, b) => (order.indexOf(a.key) + 99) % 199 - (order.indexOf(b.key) + 99) % 199);
    const max = groups.reduce((s, g) => s + g.each * g.slots.length, 0);
    const actual = Object.fromEntries(d.actual.map((a) => [a.group_key, a.accepted || []]));
    const hits = new Set(d.vbonus.map((b) => b.player_id + ':' + b.slot));
    const people = d.board.map((b) => d.byId[b.player_id]).filter(Boolean);
    const visible = new Set(d.picks.map((p) => p.player_id));

    const sections = groups.map((g) => {
      const picks = d.picks.filter((p) => g.slots.includes(p.slot));
      // group identical answers (case and spacing ignored) so the page reads like a poll
      const buckets = new Map();
      picks.forEach((p) => {
        const k = p.pick.trim().toLowerCase();
        if (!buckets.has(k)) buckets.set(k, { label: p.pick.trim(), who: [], hit: false, mine: false });
        const b = buckets.get(k);
        const pl = d.byId[p.player_id];
        if (pl && !b.who.includes(pl.name)) b.who.push(pl.name);
        if (hits.has(p.player_id + ':' + p.slot)) b.hit = true;
        if (S.me && p.player_id === S.me.id) b.mine = true;
      });
      const chips = Array.from(buckets.values())
        .sort((a, b) => b.who.length - a.who.length || a.label.localeCompare(b.label))
        .map((b) => `<span class="chip${b.hit ? ' hit' : ''}${b.mine ? ' mine' : ''}"${b.hit ? ' title="Correct"' : ''}><b>${esc(b.label)}</b>${b.hit ? ICON.check : ''}<span class="by">${b.who.map(esc).join(', ')}</span></span>`).join('');
      const ans = actual[g.key];
      const pts = g.slots.length > 1 ? `${g.each} pts each, ${g.slots.length} picks` : `${g.each} pts`;
      return `<div class="bonus-row">
        <div class="top2"><h3>${esc(g.label)}</h3><span class="pts">${pts}</span></div>
        <div class="ans">${ans && ans.length ? `Answer: <b>${esc(ans[0])}</b>${g.key === 'top4' || g.key === 'bottom3' ? '' : ''}${ans.length > 1 && (g.key === 'top4' || g.key === 'bottom3') ? ', ' + ans.slice(1).map(esc).join(', ') : ''}` : '<span class="muted">Not settled yet</span>'}</div>
        <div class="chips">${chips || '<span class="muted small">No picks</span>'}</div>
      </div>`;
    }).join('');

    const totals = people.map((p) => {
      const b = d.board.find((x) => x.player_id === p.id);
      const n = d.vbonus.filter((x) => x.player_id === p.id).length;
      return `<tr${S.me && S.me.id === p.id ? ' class="me"' : ''}><td class="l">${esc(p.name)}</td><td>${n}</td><td>${b ? b.bonus : 0}</td></tr>`;
    }).join('');

    let vis;
    if (isPublic) vis = 'Everyone’s picks are on show. Your picks have a heavier border.';
    else if (visible.size > 1) vis = 'Showing the picks you are allowed to see.';
    else vis = 'Only your own picks are shown. Sam will reveal everyone’s picks later in the season.';

    return `
<div class="head"><div><h1>Season bonus</h1>
<p class="lede">Up to ${max} extra points, settled as the season’s awards are decided. They go straight into the Bonus column of the table.</p></div></div>
<p class="note">${vis} ${open ? '' : 'Bonus picks are closed.'} A correct pick turns purple with a tick.</p>
<h2>Bonus points so far</h2>
<table class="btable"><thead><tr><th class="l">Player</th><th>Correct</th><th>Points</th></tr></thead><tbody>${totals}</tbody></table>
<h2>The picks</h2>
${sections}`;
  }

  // ---------------------------------------------------------------- rules
  function viewRules() {
    const d = S.data;
    const perMatch = d.set.lock_mode === 'per_match';
    const bonus = [];
    const seen = new Set();
    d.slots.forEach((s) => { if (seen.has(s.group_key)) return; seen.add(s.group_key);
      const n = d.slots.filter((x) => x.group_key === s.group_key).length;
      bonus.push(`<li>${esc(s.label)}: ${n > 1 ? `${s.points_each} points per club (${n} picks)` : `${s.points_each} points`}</li>`); });
    const max = d.slots.reduce((s, x) => s + x.points_each, 0);
    return `
<div class="head"><div><h1>How it works</h1><p class="lede">Six matches a week. Call the score.</p></div></div>
<div class="rules">
<h2>Points per match</h2>
<dl>
  <dt>5</dt><dd>Exact score</dd>
  <dt>3</dt><dd>Right goal difference, wrong score (a correctly called draw always gets at least 3)</dd>
  <dt>1</dt><dd>Right result only (home win or away win)</dd>
  <dt>0</dt><dd>Anything else</dd>
</dl>
<h2>The six</h2>
<p>Each gameweek has six Super 6 matches. Arsenal, Chelsea, Man City and Man United are in the six every week.</p>
<h2>Deadline</h2>
<p>${perMatch ? 'Each pick locks at that match’s kick-off.' : 'All six picks lock at the first Super 6 kick-off of the gameweek, not the first match of the gameweek. A Friday game outside the six does not lock anything.'} The lock is checked by the server on UK time, so a wrong clock on your phone makes no difference. Nobody, Sam included, can see other people’s picks before the lock.</p>
<h2>Season bonus (up to ${max} points)</h2>
<ul>${bonus.join('')}</ul>
<h2>Tie-breaks</h2>
<p>Total points, then number of exact scores, then number of correct goal differences.</p>
<h2>Times</h2>
<p>Kick-offs show in your own time zone with UK time alongside. Gameweeks are listed by UK matchday.</p>
</div>`;
  }

  // ---------------------------------------------------------------- account
  function viewAccount() {
    const name = S.me ? S.me.name : '';
    return `
<div class="head"><div><h1>Your account</h1><p class="lede">Signed in as ${esc(name || S.session.user.email)}.</p></div></div>
<div class="card">
  <h2>Change password</h2>
  <form class="form" data-act="password" novalidate>
    <label>New password<input name="p1" type="password" autocomplete="new-password" minlength="6" required></label>
    <label>Type it again<input name="p2" type="password" autocomplete="new-password" minlength="6" required></label>
    <p class="err" role="alert"></p>
    <button class="btn" type="submit">Save new password</button>
  </form>
  <p class="note">At least 6 characters, and not your name. If you forget it, Sam can reset it.</p>
</div>
<p><button class="btn quiet" data-act="signout">Sign out</button></p>`;
  }

  async function onChangePassword(ev) {
    ev.preventDefault();
    const form = ev.target;
    const err = form.querySelector('.err');
    const p1 = form.p1.value, p2 = form.p2.value;
    err.className = 'err';
    const nm = (S.me ? S.me.name : '').toLowerCase();
    if (p1.length < 6) { err.textContent = 'Use at least 6 characters.'; return; }
    if (nm && p1.toLowerCase().includes(nm)) { err.textContent = 'Pick something that is not your name.'; return; }
    if (p1 !== p2) { err.textContent = 'The two passwords are different.'; return; }
    const btn = form.querySelector('button');
    btn.disabled = true;
    const { error } = await sb.auth.updateUser({ password: p1 });
    btn.disabled = false;
    if (error) { err.textContent = error.message; return; }
    if (S.me) store.set('s6.pw.' + S.me.id, 'done');
    form.reset();
    err.className = 'ok';
    err.textContent = 'Saved. Use the new password next time you sign in.';
  }

  boot().catch((e) => {
    app.innerHTML = `<div class="boot">Something went wrong: ${esc(e.message || e)}</div>`;
  });
})();
