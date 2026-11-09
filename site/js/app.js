/* Super 6 League site. Plain JS, no build step.
 * Data comes from Supabase under row level security. Anyone can view;
 * signing in adds your own picks (and the admin tab for admins). Kick-offs are stored in UTC and shown in each viewer's
 * own time zone, with UK time (Europe/London) as the shared reference. */
(function () {
  'use strict';

  const CFG = window.S6_CONFIG;
  const app = document.getElementById('app');
  const tip = document.getElementById('tip');

  if (!window.supabase || !CFG) {
    app.innerHTML = '<div class="boot err">Could not load the site. Check your connection and refresh.</div>';
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

  // Kick-off time in the viewer's own zone. UK time follows as a quiet reference
  // only when it differs. Days are grouped by UK matchday, so when the viewer's date
  // differs from the UK date their weekday is added.
  function timeHTML(d) {
    const loc = hm(d, LOCAL);
    if (localIsUK || sameClock(d)) return `<span class="main">${loc}</span>`;
    const locDiff = dayKey(d, LOCAL) !== dayKey(d, UK);
    const main = (locDiff ? fmt(d, LOCAL, { weekday: 'short' }) + ' ' : '') + loc;
    return `<span class="main">${esc(main)}</span><span class="alt">${hm(d, UK)}\u00a0UK</span>`;
  }
  // One-line version for sentences: "Sat 21 Nov, 18:00 (12:30 UK)".
  function whenText(d) {
    const loc = `${shortDay(d, LOCAL)}, ${hm(d, LOCAL)}`;
    if (localIsUK || sameClock(d)) return loc;
    const sameDay = dayKey(d, LOCAL) === dayKey(d, UK);
    return `${loc} (${sameDay ? hm(d, UK) : shortDay(d, UK) + ', ' + hm(d, UK)}\u00a0UK)`;
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
    sun: svg('M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM8 1.5v1.2M8 13.3v1.2M1.5 8h1.2M13.3 8h1.2M3.4 3.4l.9.9M11.7 11.7l.9.9M3.4 12.6l.9-.9M11.7 4.3l.9-.9'),
    moon: svg('M13.5 9.6A5.6 5.6 0 0 1 6.4 2.5a5.6 5.6 0 1 0 7.1 7.1z'),
    trophy: svg('M5 2.5h6v3.2a3 3 0 0 1-6 0zM5 3.5H3.2v.8A2.2 2.2 0 0 0 5 6.5M11 3.5h1.8v.8A2.2 2.2 0 0 1 11 6.5M8 8.7v2.6M5.5 13.5h5M6.3 11.3h3.4v2.2H6.3z'),
    bars: svg('M3 13.5V9M8 13.5V3.5M13 13.5V6.5'),
    minus: svg('M4 8h8'), plus: svg('M8 4v8M4 8h8'),
    clock: svg('M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM8 5v3.2l2.2 1.4'),
    lock: svg('M4.5 7.5h7v6h-7zM6 7.5V5.5a2 2 0 0 1 4 0v2'),
    same: svg('M5 8h6'),
  };
  // Page heading: title and one status line, with page controls (gameweek stepper) beside it.
  function pageHead(title, lede, right) {
    return `<div class="head"><div class="head-t"><h1>${title}</h1>${lede ? `<p class="lede">${lede}</p>` : ''}</div>${right ? `<div class="head-r">${right}</div>` : ''}</div>`;
  }
  // The block between the two teams: full-time score, live, postponed, or "v".
  function scoreHTML(f) {
    if (isDone(f)) return `<span class="score"><b>${f.home_goals}-${f.away_goals}</b><small>FT</small></span>`;
    if (f.status === 'POSTPONED') return '<span class="score pp"><b>P-P</b></span>';
    if (isLive(f)) return `<span class="score live"><b>${f.home_goals}-${f.away_goals}</b><small>Live</small></span>`;
    if (f.status === 'IN_PLAY') return '<span class="score live"><b>Live</b></span>';
    return '<span class="score v"><b>v</b></span>';
  }
  const ptsChip = (pts) => `<span class="pts p${pts}">${pts}\u00a0pt${pts === 1 ? '' : 's'}</span>`;
  // Club crests and the competition emblem, served by football-data.org (the results feed).
  const CREST_IDS = {
    'Arsenal': 57, 'Aston Villa': 58, 'Bournemouth': 1044, 'Brentford': 402, 'Brighton': 397,
    'Chelsea': 61, 'Coventry': 1076, 'Crystal Palace': 354, 'Everton': 62, 'Fulham': 63,
    'Hull City': 322, 'Ipswich': 349, 'Leeds': 341, 'Liverpool': 64, 'Man City': 65,
    'Man United': 66, 'Newcastle': 67, "Nott'm Forest": 351, 'Sunderland': 71, 'Tottenham': 73,
  };
  const CREST_BASE = 'https://crests.football-data.org/';
  const PL_EMBLEM = CREST_BASE + 'PL.png';
  function crest(team, size) {
    const id = CREST_IDS[team];
    const px = size || 28;
    if (!id) return `<span class="crest code">${esc(code(team))}</span>`;
    return `<img class="crest" src="${CREST_BASE}${id}.png" alt="" width="${px}" height="${px}" loading="lazy" decoding="async" data-code="${esc(code(team))}">`;
  }
  // If a crest fails to load, show the three-letter club code instead.
  document.addEventListener('error', (ev) => {
    const el = ev.target;
    if (el && el.tagName === 'IMG' && el.classList.contains('crest')) {
      const s = document.createElement('span');
      s.className = 'crest code'; s.textContent = el.getAttribute('data-code') || '';
      el.replaceWith(s);
    } else if (el && el.tagName === 'IMG' && el.classList.contains('emblem')) {
      const box = el.parentElement;
      if (box && box.classList.contains('hero-mark')) box.remove();
      else if (box && box.classList.contains('mark')) box.textContent = '6';
      else el.remove();
    }
  }, true);
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
  // Live: in play with a (delayed) score from the feed. Live points are provisional and never
  // reach the official table, which only counts finished matches.
  const isLive = (f) => f.status === 'IN_PLAY' && f.home_goals != null && f.away_goals != null;
  const ptsNow = (pr, f) => (pr && (isDone(f) || isLive(f)) ? score(pr.home_goals, pr.away_goals, f.home_goals, f.away_goals) : null);
  // Provisional points per player from matches in play right now.
  function livePoints() {
    const d = S.data, out = {};
    d.fixtures.filter((f) => f.super6 && isLive(f)).forEach((f) => {
      d.board.forEach((b) => {
        const pts = ptsNow(d.predMap.get(b.player_id + ':' + f.id), f);
        if (pts != null) out[b.player_id] = (out[b.player_id] || 0) + pts;
      });
    });
    return out;
  }

  // ---------------------------------------------------------------- data
  const S = { session: null, me: null, data: null, loadedAt: null, error: null, dirty: false };

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
      fetchAll('players', 'id,name,is_admin,active', ['name']),
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
    // Picks made per player, counted like the old Sheet (db/06). Optional: older databases lack the view.
    let pickCounts = null;
    try { pickCounts = await fetchAll('v_pick_counts', 'player_id,made,total', ['player_id']); } catch (e) { pickCounts = null; }
    // When scores were last fetched by the Supabase timer (db/07). Optional.
    let syncedAt = null;
    try {
      const r = await sb.from('sync_state').select('last_applied_at').limit(1);
      if (!r.error && r.data && r.data[0] && r.data[0].last_applied_at) syncedAt = new Date(r.data[0].last_applied_at);
    } catch (e) { syncedAt = null; }
    const set = Object.fromEntries(settings.map((r) => [r.key, r.value]));
    const byId = Object.fromEntries(players.map((p) => [p.id, p]));
    const predMap = new Map(preds.map((p) => [p.player_id + ':' + p.fixture_id, p]));
    const d = { players, byId, fixtures, preds, predMap, points, gwPoints, board, set, slots, picks, actual, vbonus, pickCounts, syncedAt };
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
  // Anyone can view. Signing in adds your own picks and, for the admin, the admin tab.
  async function boot() {
    const { data } = await sb.auth.getSession();
    S.session = data.session;
    sb.auth.onAuthStateChange((evt, session) => {
      const had = !!S.session;
      S.session = session;
      if (evt === 'SIGNED_OUT' || (!session && had)) { S.me = null; refresh(false); }
    });
    await refresh(true);
    window.addEventListener('hashchange', () => { hideTip(); render(); window.scrollTo(0, 0); });
    // Refresh every minute around matches (kick-off minus 15 min to 2.5 h after), otherwise
    // every 10 minutes. Paused while the tab is hidden. Keeps data use small on the free plan.
    setInterval(() => {
      if (document.visibilityState !== 'visible' || busyForm()) return;
      const age = Date.now() - (S.loadedAt || 0);
      if (matchTime() || age > 10 * 60000) refresh(false);
    }, 60000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && S.loadedAt && Date.now() - S.loadedAt > 60000 && !busyForm()) refresh(false);
    });
  }
  function matchTime() {
    if (!S.data) return true;
    const now = Date.now();
    return S.data.fixtures.some((f) => f.status === 'IN_PLAY'
      || (f.status !== 'FINISHED' && f.status !== 'POSTPONED' && now > f.ko.getTime() - 15 * 60000 && now < f.ko.getTime() + 150 * 60000));
  }
  // Do not redraw under someone who is typing or has unsaved picks.
  const busyForm = () => (!!document.activeElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) || S.dirty;

  async function refresh(first) {
    if (first && !S.data) app.innerHTML = '<div class="boot">Loading the league…</div>';
    try {
      const data = await loadData();
      let me = null;
      if (S.session) {
        const r = await sb.rpc('current_player');
        if (r.error && /JWT|token|expired/i.test(r.error.message)) { await sb.auth.signOut(); return; }
        me = data.players.find((p) => p.id === r.data) || null;
      }
      S.data = data; S.me = me; S.loadedAt = Date.now(); S.error = null;
    } catch (e) {
      S.error = e.message || String(e);
    }
    render();
  }

  // ---------------------------------------------------------------- shell
  function tabs() {
    const t = [['table', 'Table'], ['predict', 'Predictions'], ['gameweeks', 'Gameweeks'], ['fixtures', 'Fixtures'], ['bonus', 'Bonus'], ['rules', 'Rules']];
    if (S.me && S.me.is_admin) t.push(['admin', 'Admin']);
    return t;
  }
  function route() {
    const parts = (location.hash.replace(/^#\/?/, '') || 'table').split('/');
    return { name: parts[0], arg: parts[1] };
  }

  function render() {
    const rn = route().name;
    if (rn !== S.lastRoute) { S.dirty = false; S.lastRoute = rn; }
    hideTip();
    if (!S.data) {
      app.innerHTML = shell('', S.error
        ? `<div class="notice err"><span>Could not load the league (${esc(S.error)}).${S.session ? '' : ' If this keeps happening, the public view may not be switched on yet.'}</span><button class="btn quiet sm" data-act="retry">Try again</button></div>`
        : '<div class="boot">Loading the league…</div>');
      bind();
      return;
    }
    const r = route();
    let body;
    switch (r.name) {
      case 'predict': body = viewPredict(r.arg ? parseInt(r.arg, 10) : openGw()); break;
      case 'gameweeks': body = viewGameweeks(); break;
      case 'gw': body = viewGw(parseInt(r.arg, 10)); break;
      case 'fixtures': body = viewFixtures(r.arg ? parseInt(r.arg, 10) : S.data.currentGw); break;
      case 'bonus': body = viewBonus(); break;
      case 'rules': body = viewRules(); break;
      case 'login': body = S.session ? viewAccount() : viewLogin(); break;
      case 'account': body = S.session ? viewAccount() : viewLogin(); break;
      case 'admin': body = S.me && S.me.is_admin ? viewAdmin(r.arg ? parseInt(r.arg, 10) : openGw()) : viewTable(); break;
      default: body = viewTable();
    }
    const map = { gw: 'gameweeks' };
    const active = map[r.name] || r.name;
    const oldNav = app.querySelector('nav.tabs');
    const navX = oldNav ? oldNav.scrollLeft : 0;
    app.innerHTML = shell(active, body);
    fitTabs(navX);
    bind();
    if (r.name === 'predict') stickProgress();
    if (r.name === 'gameweeks') bindChart();
    if (r.name === 'predict') bindPredict();
    if (r.name === 'admin') bindAdmin();
    if ((r.name === 'login' || r.name === 'account') && !S.session) bindLogin();
  }

  // Phones: the tab row scrolls sideways. Keep its place between redraws, make sure the
  // current tab is in view, and fade only the edge that has more tabs behind it.
  function fitTabs(x) {
    const nav = app.querySelector('nav.tabs');
    if (!nav) return;
    nav.scrollLeft = x;
    const cur = nav.querySelector('[aria-current]');
    if (cur && nav.scrollWidth > nav.clientWidth) {
      const l = cur.getBoundingClientRect().left - nav.getBoundingClientRect().left + nav.scrollLeft;
      const r = l + cur.offsetWidth, pad = 36;
      if (l - pad < nav.scrollLeft) nav.scrollLeft = l - pad;
      else if (r + pad > nav.scrollLeft + nav.clientWidth) nav.scrollLeft = r + pad - nav.clientWidth;
    }
    const edges = () => {
      const max = nav.scrollWidth - nav.clientWidth;
      nav.classList.toggle('more-l', nav.scrollLeft > 2);
      nav.classList.toggle('more-r', nav.scrollLeft < max - 2);
    };
    edges();
    nav.addEventListener('scroll', edges, { passive: true });
  }

  // Phones and tablets: the picks counter sticks to the top of the screen while scrolling
  // the six. A hairline shows once it is stuck.
  let stickObs = null;
  function stickProgress() {
    if (stickObs) { stickObs.disconnect(); stickObs = null; }
    const side = app.querySelector('.predside');
    if (!side || !('IntersectionObserver' in window)) return;
    stickObs = new IntersectionObserver(([e]) => {
      side.classList.toggle('stuck', e.intersectionRatio < 1 && e.boundingClientRect.top < 1);
    }, { threshold: [1] });
    stickObs.observe(side);
  }

  function shell(active, body) {
    const d = S.data;
    const warn = [];
    if (S.error && S.data) warn.push(`<div class="notice err"><span>The last refresh failed (${esc(S.error)}). You are looking at the data from before.</span><button class="btn quiet sm" data-act="retry">Try again</button></div>`);
    if (S.session && S.data && !S.me) warn.push('<div class="notice err">Your login is not linked to a player yet. Ask Sam to check that your player email matches your login.</div>');
    const initial = S.me ? S.me.name.slice(0, 1).toUpperCase() : '?';
    const right = S.session
      ? `<a class="who" href="#/account" title="Your account"><span class="av">${esc(initial)}</span>${esc(S.me ? S.me.name : 'Account')}</a>`
      : `<a class="signin" href="#/login">Sign in</a>`;
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    return `
<header class="mast"><div class="wrap">
  <div class="bar">
    <a class="brand" href="#/table"><span class="mark"><img class="emblem" src="${PL_EMBLEM}" alt="" width="30" height="30"></span><span class="bt"><b>Super 6</b><small>RTFM Mods · ${seasonHTML()}</small></span></a>
    <div class="tools"><button class="iconbtn" type="button" data-act="theme" aria-label="${dark ? 'Switch to light mode' : 'Switch to dark mode'}" title="${dark ? 'Light mode' : 'Dark mode'}">${dark ? ICON.sun : ICON.moon}</button>${right}</div>
  </div>
  <nav class="tabs" aria-label="Sections">${tabs().map(([k, l]) => `<a href="#/${k}"${k === active ? ' aria-current="page"' : ''}>${l}</a>`).join('')}</nav>
</div></header>
<main><div class="wrap">${warn.join('')}${body}</div></main>
<footer class="foot"><div class="wrap"><p class="f-when"><span>RTFM Mods · ${esc(CFG.season)}.</span> <span>Updated ${S.loadedAt ? esc(hm(new Date(S.loadedAt), LOCAL)) : '-'}${S.data && S.data.syncedAt ? `, scores last checked ${esc(hm(S.data.syncedAt, LOCAL))}` : ''}.</span></p><p class="f-src">Scores come from football-data.org and run a few minutes behind the real game. This page refreshes every minute during matches.</p></div></footer>`;
  }
  // "Premier League 2026/27": phones drop the competition name so the season fits the masthead.
  function seasonHTML() {
    const s = String(CFG.season || '');
    const m = s.match(/^(Premier League )(.+)$/);
    return m ? `<span class="bt-pl">${esc(m[1])}</span>${esc(m[2])}` : esc(s);
  }

  function bind() {
    app.querySelectorAll('[data-act]').forEach((el) => {
      const act = el.getAttribute('data-act');
      if (el.tagName === 'FORM') return;
      el.addEventListener('click', (ev) => {
        if (act === 'retry') { ev.preventDefault(); refresh(!S.data); }
        if (act === 'bview') { store.set('s6.bonusView', el.getAttribute('data-v')); render(); }
        if (act === 's6only') { store.set('s6.s6only', el.checked ? '1' : '0'); render(); }
        if (act === 'theme') {
          const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
          document.documentElement.setAttribute('data-theme', next); store.set('s6.theme', next); render();
          return;
        }
        if (act === 'signout') { ev.preventDefault(); S.dirty = false; location.hash = '#/table'; sb.auth.signOut(); }
      });
    });
    app.querySelectorAll('select[data-gw]').forEach((gwSel) => {
      gwSel.addEventListener('change', () => { location.hash = '#/' + gwSel.getAttribute('data-gw') + '/' + gwSel.value; });
    });
    const chartSel = app.querySelector('select[data-chart-player]');
    if (chartSel) chartSel.addEventListener('change', () => { store.set('s6.chartPlayer', chartSel.value); render(); });
    const pw = app.querySelector('form[data-act="password"]');
    if (pw) pw.addEventListener('submit', onChangePassword);
  }

  // ---------------------------------------------------------------- login
  function viewLogin() {
    return `
<div class="login"><div class="panel">
  <h1>Sign in</h1>
  <p class="lede">Sign in with your league name to enter your picks. Everything else is open to view.</p>
  <form class="form" id="loginForm" novalidate>
    <label>Name<input name="u" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required placeholder="adam"></label>
    <label>Password<input name="p" type="password" autocomplete="current-password" required></label>
    <p class="err" id="loginErr" role="alert"></p>
    <button class="btn" type="submit">Sign in</button>
  </form>
  <p class="note">Forgotten your password? Ask Sam to reset it.</p>
</div></div>`;
  }
  function bindLogin() {
    const form = document.getElementById('loginForm');
    if (!form) return;
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
      await refresh(false);
      location.hash = '#/predict';
    });
    if (window.innerWidth > 640) form.u.focus();
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

  // The next deadline people care about: the week lock, or the next match lock in per-match mode.
  function nextDeadline() {
    const d = S.data;
    const now = Date.now();
    const open = d.fixtures.filter((f) => f.super6 && !isLocked(f) && f.ko.getTime() > now).sort((a, b) => a.ko - b.ko);
    if (!open.length) return null;
    const f = open[0];
    if (d.set.lock_mode === 'per_match') return { gw: f.gw, at: f.ko, fixture: f };
    return { gw: f.gw, at: lockTime(f.gw), fixture: null };
  }

  function formSVG(vals) {
    const W = 74, H = 22, bw = 11, gap = 4;
    const bars = vals.map((v, i) => {
      const h = Math.max(3, Math.round((Math.min(v, 30) / 30) * H));
      return `<rect x="${i * (bw + gap)}" y="0" width="${bw}" height="${H}" rx="3" fill="var(--track)"/><rect x="${i * (bw + gap)}" y="${H - h}" width="${bw}" height="${h}" rx="3" fill="var(--bar)"><title>${v} pts</title></rect>`;
    }).join('');
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Last ${vals.length} gameweeks: ${vals.join(', ')} points">${bars}</svg>`;
  }

  function viewTable() {
    const d = S.data;
    const base = movementBase();
    const before = base != null ? standings(base) : null;
    const scored = d.fixtures.filter((f) => f.super6 && isDone(f)).length;
    const total6 = d.fixtures.filter((f) => f.super6).length;
    const weeks = gwSummary();
    const completeWeeks = weeks.filter((w) => w.complete);
    const lastFive = completeWeeks.slice(-5);
    const cur = weeks[d.currentGw - 1];
    const outstanding = cur ? cur.six.filter((f) => !isDone(f)).length : 0;
    const live = livePoints();
    const nLive = d.fixtures.filter((f) => f.super6 && isLive(f)).length;
    // As in the Sheet: picks made (including future ones) out of every Super 6 match.
    // Without db/06 we can only count locked matches, so fall back to that.
    let picksTotal = d.fixtures.filter((f) => f.super6 && isLocked(f)).length;
    const picks = {};
    if (d.pickCounts) {
      picksTotal = d.fixtures.filter((f) => f.super6).length;
      d.pickCounts.forEach((c) => { picks[c.player_id] = c.made; });
    } else {
      d.preds.forEach((p) => { const f = d.fixtures.find((x) => x.id === p.fixture_id); if (f && f.super6 && isLocked(f)) picks[p.player_id] = (picks[p.player_id] || 0) + 1; });
    }

    // summary strip: a short title, one or two short detail lines, then the action on its own line
    const line = (t) => `<span class="ln">${t}</span>`;
    const act = (href, t) => `<a class="act" href="${href}">${t}</a>`;
    const lead = d.board[0], second = d.board[1];
    let leadLine = '';
    if (lead) {
      const gap = second ? lead.total - second.total : 0;
      const leaders = d.board.filter((b) => b.rank === 1).map((b) => b.name);
      leadLine = leaders.length > 1
        ? `<b>${ICON.trophy}${leaders.map(esc).join(' and ')} lead</b>${line(`Level on ${lead.total} points`)}`
        : `<b>${ICON.trophy}${esc(lead.name)} leads</b>${line(`${lead.total} points, ${gap ? `${gap} clear of ${esc(second.name)}` : `ahead of ${esc(second.name)} on the tie-break`}`)}`;
    }
    let weekLine = '';
    if (cur && cur.six.length) {
      weekLine = cur.done
        ? `<b>${ICON.bars}GW${cur.gw}: ${cur.done} of ${cur.six.length} results in</b>${line(`${esc(cur.leaders.join(', '))} ${cur.complete ? 'won it' : (cur.leaders.length > 1 ? 'lead' : 'leads')} with ${cur.best}`)}${act(`#/gw/${cur.gw}`, 'See the picks')}`
        : `<b>${ICON.bars}GW${cur.gw} starts ${esc(shortDay(cur.six.slice().sort((x, y) => x.ko - y.ko)[0].ko, LOCAL))}</b>${act(`#/fixtures/${cur.gw}`, 'See the fixtures')}`;
    }
    const dl = nextDeadline();
    let dlLine = `<b>${ICON.clock}No open picks</b>${line('The season is done')}`;
    if (dl) {
      const what = dl.fixture ? `${esc(dl.fixture.home)} v ${esc(dl.fixture.away)}` : `GW${dl.gw} picks`;
      const ukPart = localIsUK || sameClock(dl.at) ? '' : ` <span class="muted">(${esc(hm(dl.at, UK))} UK)</span>`;
      let cta = '';
      if (!S.session) cta = act('#/login', 'Sign in to pick');
      else if (S.me) {
        const six = d.fixtures.filter((f) => f.gw === dl.gw && f.super6);
        const mine = six.filter((f) => d.predMap.get(S.me.id + ':' + f.id)).length;
        cta = act(`#/predict/${dl.gw}`, mine === six.length ? 'All six picked, review' : `${mine} of ${six.length} picked, pick now`);
      }
      dlLine = `<b>${ICON.clock}Next lock ${esc(untilText(dl.at))}</b>${line(what)}${line(`${esc(shortDay(dl.at, LOCAL))}, ${esc(hm(dl.at, LOCAL))}${ukPart}`)}${cta}`;
    }

    const rows = d.board.map((b) => {
      let mv = `<span class="mv same" title="No earlier week to compare">${ICON.same}<span class="sr">No change</span></span>`;
      if (before && before[b.player_id] != null) {
        const diff = before[b.player_id] - b.rank;
        if (diff > 0) mv = `<span class="mv up" title="Up ${diff} since GW${base}">${ICON.up}${diff}</span>`;
        else if (diff < 0) mv = `<span class="mv down" title="Down ${-diff} since GW${base}">${ICON.down}${-diff}</span>`;
        else mv = `<span class="mv same" title="No change since GW${base}">${ICON.same}<span class="sr">No change</span></span>`;
      }
      const me = S.me && S.me.id === b.player_id;
      const podium = b.rank <= 3 ? ` p${b.rank}` : '';
      const form = lastFive.map((w) => w.pts[b.player_id] || 0);
      return `<tr class="${me ? 'me' : ''}${podium}">
        <td class="pos"><span class="rank">${b.rank}</span></td>
        <td class="mvc">${mv}</td>
        <td class="l name"><span class="nmx">${esc(b.name)}${me ? '<span class="you">You</span>' : ''}</span><span class="sub"><span>${b.exact} exact</span><span>${b.gd} GD</span><span>${b.outcome} result${b.outcome === 1 ? '' : 's'}</span>${b.bonus ? `<span>${b.bonus} bonus</span>` : ''}</span></td>
        <td class="wide">${b.exact}</td><td class="wide">${b.gd}</td><td class="wide">${b.outcome}</td>
        <td class="xwide">${b.match_pts}</td><td class="wide">${b.bonus}</td>
        <td class="xwide formc">${form.length ? formSVG(form) : ''}</td>
        <td>${b.last5}</td>
        <td class="xwide picksc">${picks[b.player_id] || 0}<small> / ${picksTotal}</small></td>
        <td class="tot">${b.total}${live[b.player_id] ? `<small class="livetag" title="${live[b.player_id]} provisional point${live[b.player_id] === 1 ? '' : 's'} from matches in play, not counted until full time">+${live[b.player_id]} live</small>` : ''}</td>
      </tr>`;
    }).join('');
    const facts = `Gameweek ${d.currentGw} of 38. ${scored} of ${total6} Super 6 results in${outstanding && cur && cur.done ? `, ${outstanding} still to play this week` : ''}.${nLive ? ` <span class="livedot"></span>${nLive} Super\u00a06 match${nLive === 1 ? '' : 'es'} live: points marked live count once the game ends.` : ''}`;
    return `
${pageHead('League table', facts)}
<section class="summary panel" aria-label="At a glance">
  <div class="item lead"><p>${leadLine}</p></div>
  <div class="item"><p>${weekLine}</p></div>
  <div class="item"><p>${dlLine}</p></div>
</section>
<div class="panel tablewrap">
<table class="league">
  <thead><tr>
    <th class="l" title="Position">#</th><th class="l"><span class="sr">Move</span></th><th class="l">Player</th>
    <th class="wide" title="Exact scores, 5 points each">Exact</th><th class="wide" title="Correct goal difference, 3 points each">GD</th><th class="wide" title="Correct result, 1 point each">Result</th>
    <th class="xwide" title="Points from match picks">Match</th><th class="wide" title="Season bonus points">Bonus</th>
    <th class="xwide formh" title="Points in each of the last five completed gameweeks">Form</th>
    <th title="Points over the last five completed gameweeks">Last 5</th>
    <th class="xwide" title="Super 6 picks entered, out of every Super 6 match this season">Picks</th><th>Pts</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
</div>
<p class="note">Ties are split on exact scores, then correct goal differences. Arrows show moves since the end of GW${base != null ? base : '-'}. Last 5 counts the last five gameweeks with all six results in. Bonus points arrive as the season awards are settled; see <a href="#/bonus">Bonus</a>.</p>`;
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
    // Default to the league leader; once someone picks a player, remember it in this browser.
    let pid = store.get('s6.chartPlayer', active[0] && active[0].id);
    if (!active.some((p) => p.id === pid)) pid = active[0] && active[0].id;
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
        winner = w.lock ? `<span class="muted">${d.set.lock_mode === 'per_match' ? 'First kick-off' : 'Picks lock'} ${esc(whenText(w.lock))}</span>` : '';
      }
      const mine = S.me && w.done ? `<small>You</small><b>${w.pts[S.me.id] != null ? w.pts[S.me.id] : 0}</b>` : '';
      return `<li><a href="#/gw/${w.gw}"><span class="n">GW${w.gw}</span><span class="w">${winner}${state}</span><span class="mine">${mine}</span><span class="go">${ICON.next}</span></a></li>`;
    }).join('');

    return `
${pageHead('Gameweeks', 'Points per week, and who took each one.')}
<div class="panel">
  <div class="panel-head"><h2>Points per gameweek</h2><label class="sr" for="chartPlayer">Player</label><select id="chartPlayer" data-chart-player class="sel">${opts}</select></div>
  <div class="chart">
  ${started.length ? chartSVG(started, pid) : '<p class="note">No results yet.</p>'}
  <div class="key"><span><i class="k-bar"></i>${esc(who ? who.name : '')}</span><span><i class="k-avg"></i>League average</span><span><i class="k-prog"></i>Week still in progress</span></div>
  </div>
</div>
<h2 class="section-title">Week by week</h2>
<ul class="gwlist panel">${list}</ul>
<p class="note">Later gameweeks are on the <a href="#/fixtures">fixtures</a> page.</p>`;
  }

  let chartWeeks = null;
  function chartSVG(weeks, pid) {
    chartWeeks = { weeks, pid };
    const W = Math.round(Math.max(300, Math.min(1176, window.innerWidth - (window.innerWidth >= 900 ? 64 : 32)) - 40)), H = W < 500 ? 200 : 240, L = 28, R = 6, T = 10, B = 24;
    const max = Math.max(30, ...weeks.map((w) => Math.max(w.best, w.pts[pid] || 0)));
    const top = Math.ceil(max / 10) * 10;
    const y = (v) => T + (H - T - B) * (1 - v / top);
    const n = weeks.length;
    const slot = (W - L - R) / Math.max(n, 10);
    const bw = Math.max(4, Math.min(28, slot - 4));
    let g = '';
    for (let v = 0; v <= top; v += 10) {
      g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/>`;
      g += `<text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${v}</text>`;
    }
    const every = n > 20 ? 5 : n > 12 ? 2 : 1;
    weeks.forEach((w, i) => {
      const cx = L + slot * i + slot / 2;
      const v = w.pts[pid] || 0;
      const x0 = cx - bw / 2, y0 = y(v), yb = y(0), r = Math.min(4, bw / 2, yb - y0);
      const fill = w.complete ? 'var(--bar)' : 'color-mix(in srgb, var(--bar) 55%, var(--panel))';
      if (v > 0) {
        g += `<path d="M${x0},${yb} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} H${x0 + bw - r} Q${x0 + bw},${y0} ${x0 + bw},${y0 + r} V${yb} Z" fill="${fill}"/>`;
      }
      g += `<line x1="${cx - bw / 2 - 2}" x2="${cx + bw / 2 + 2}" y1="${y(w.avg)}" y2="${y(w.avg)}" stroke="var(--pink)" stroke-width="2.5" stroke-linecap="round"/>`;
      if (i % every === 0 || i === n - 1) g += `<text x="${cx}" y="${H - 8}" text-anchor="middle" font-size="11" fill="var(--muted)">${w.gw}</text>`;
      g += `<rect class="hit" data-i="${i}" x="${L + slot * i}" y="${T}" width="${slot}" height="${H - T - B}" fill="transparent"/>`;
    });
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Points per gameweek bar chart">${g}</svg>`;
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
    const done = six.filter(isDone).length;
    const anyLive = six.some(isLive);
    const anyDone = done > 0 || anyLive;
    const rows = people.map((p) => {
      let tot = 0, live = 0;
      const cells = six.map((f) => {
        const pr = d.predMap.get(p.id + ':' + f.id);
        if (!pr) {
          const hidden = !(S.me && p.id === S.me.id) && !isLocked(f);
          return hidden
            ? `<td><span class="pk hid" title="Hidden until kick-off">${ICON.lock}<span class="sr">Hidden until kick-off</span></span></td>`
            : '<td><span class="pk none" title="No pick"><span class="sr">No pick</span></span></td>';
        }
        const pts = ptsNow(pr, f);
        if (pts != null) { if (isDone(f)) tot += pts; else live += pts; }
        const cls = (pts == null ? 'wait' : 'p' + pts) + (isLive(f) ? ' prov' : '');
        const t = `${p.name}: ${f.home} ${pr.home_goals}-${pr.away_goals} ${f.away}${pts != null ? `, ${pts} point${pts === 1 ? '' : 's'}` : ''}`;
        return `<td><span class="pk ${cls}" title="${esc(t)}"><b>${pr.home_goals}-${pr.away_goals}</b>${pts ? `<i><span class="sr">, </span>${pts}<span class="sr"> points</span></i>` : ''}</span></td>`;
      }).join('');
      return { p, tot, live, html: cells };
    });
    // While matches are live, order by points including the provisional live ones.
    rows.forEach((r) => { r.proj = r.tot + r.live; });
    if (anyDone) rows.sort((a, b) => b.proj - a.proj || a.p.name.localeCompare(b.p.name));
    rows.forEach((r, i) => { r.rank = anyDone ? (i && rows[i - 1].proj === r.proj ? rows[i - 1].rank : i + 1) : null; });

    const head = six.map((f) => {
      let res, st;
      if (isDone(f)) { res = `${f.home_goals}-${f.away_goals}`; st = 'FT'; }
      else if (isLive(f)) { res = `${f.home_goals}-${f.away_goals}`; st = '<span class="live">Live</span>'; }
      else if (f.status === 'IN_PLAY') { res = '<span class="live">Live</span>'; st = ''; }
      else if (f.status === 'POSTPONED') { res = 'P-P'; st = 'Off'; }
      else { res = esc(hm(f.ko, LOCAL)); st = esc(fmt(f.ko, LOCAL, { weekday: 'short' })); }
      const cls = isDone(f) ? ' ft' : isLive(f) ? ' lv' : '';
      return `<th scope="col" class="mcol${cls}" title="${esc(f.home)} v ${esc(f.away)}, ${esc(whenText(f.ko))}"><span class="mh"><span class="ch">${crest(f.home, 20)}</span><span class="rs">${res}</span><span class="ca">${crest(f.away, 20)}</span></span><span class="ms">${st}</span><span class="sr">${esc(f.home)} v ${esc(f.away)}</span></th>`;
    }).join('');
    const body = rows.map((r) => {
      const me = S.me && r.p.id === S.me.id;
      return `<tr class="${me ? 'me' : ''}"><th scope="row" class="pn"><span class="rk">${r.rank != null ? r.rank : ''}</span><span class="nm">${esc(r.p.name)}</span></th>${r.html}<td class="tot">${anyDone ? `${r.proj}${r.live ? `<small class="livetag" title="Includes ${r.live} provisional point${r.live === 1 ? '' : 's'} from matches in play">live</small>` : ''}` : ''}</td></tr>`;
    }).join('');

    // One status line: results in and who leads, then your own points.
    let status = '';
    if (!six.length) status = 'The six for this week have not been picked yet.';
    else if (!anyDone) {
      const first = six[0].ko;
      status = first.getTime() > Date.now() ? `First kick-off ${esc(whenText(first))}.` : 'Under way. No results in yet.';
    } else {
      const best = rows[0].proj;
      const lead = rows.filter((r) => r.proj === best).map((r) => esc(r.p.name));
      const allIn = done === six.length;
      const nLive = six.filter(isLive).length;
      status = `${done} of ${six.length} results in${nLive ? `, ${nLive} live` : ''}. ${lead.join(', ')} ${allIn ? 'won it' : (lead.length > 1 ? 'lead' : 'leads')} with ${best}${nLive ? ' if it stays like this' : ''}.`;
      const mineRow = S.me && rows.find((r) => r.p.id === S.me.id);
      if (mineRow) status += ` You have ${mineRow.proj}.`;
    }
    let lockNote;
    if (perMatch) lockNote = 'Other players’ picks show as each match kicks off.';
    else if (locked) lockNote = `Picks locked ${esc(whenText(lock))}.`;
    else lockNote = lock ? `Picks lock ${esc(whenText(lock))}. Until then you only see your own.` : '';

    return `
${pageHead(`Gameweek ${gw}`, status, gwStepper('gw', gw))}
${six.length ? `<div class="panel bleed">
<div class="grid-scroll"><table class="picks"><thead><tr><th scope="col" class="pn"><span class="sr">Player</span></th>${head}<th scope="col" class="tot">Pts</th></tr></thead><tbody>${body}</tbody></table></div>
<div class="panel-foot legend"><span><span class="pk p5"><b>5</b></span>Exact score</span><span><span class="pk p3"><b>3</b></span>Goal difference</span><span><span class="pk p1"><b>1</b></span>Result</span><span><span class="pk hid">${ICON.lock}</span>Hidden until kick-off</span></div>
</div>` : ''}
<p class="note">${lockNote} <a href="#/fixtures/${gw}">All GW${gw} fixtures</a></p>`;
  }

  // ---------------------------------------------------------------- fixtures
  function viewFixtures(gw) {
    const d = S.data;
    if (!(gw >= 1 && gw <= 38)) gw = d.currentGw;
    const s6only = store.get('s6.s6only', '1') === '1';
    const list = d.fixtures.filter((f) => f.gw === gw && (!s6only || f.super6)).sort((a, b) => a.ko - b.ko || a.id - b.id);
    const lock = lockTime(gw);
    const days = [];
    list.forEach((f) => {
      const k = dayKey(f.ko, UK);
      let day = days[days.length - 1];
      if (!day || day.key !== k) { day = { key: k, label: fmt(f.ko, UK, { weekday: 'long', day: 'numeric', month: 'long' }), items: [] }; days.push(day); }
      day.items.push(f);
    });
    const rows = days.map((day) => `<section class="panel day-panel"><div class="panel-head"><h2>${esc(day.label)}</h2></div>` + day.items.map((f) => {
      const sc = scoreHTML(f);
      const extra = [];
      if (f.result_source === 'admin' && isDone(f)) extra.push('Result entered by admin');
      if (f.super6 && S.me) {
        const pr = d.predMap.get(S.me.id + ':' + f.id);
        if (pr) {
          const pts = ptsNow(pr, f);
          extra.push(`Your pick <b>${pr.home_goals}-${pr.away_goals}</b>${pts != null ? ' ' + ptsChip(pts) + (isLive(f) ? ' <span class="livetag">live</span>' : '') : ''}`);
        } else if (!isLocked(f)) extra.push(`<a href="#/predict/${f.gw}">No pick yet. Add one</a>`);
      }
      return `<div class="fx${f.status === 'POSTPONED' ? ' dim' : ''}">
        <div class="time">${timeHTML(f.ko)}</div>
        <div class="teams"><span class="team h"><span class="nm">${esc(f.home)}</span>${crest(f.home)}</span>${sc}<span class="team a">${crest(f.away)}<span class="nm">${esc(f.away)}</span></span></div>
        <div class="tag">${f.super6 ? '<span class="s6" title="Super 6 match">S6</span>' : ''}</div>
        ${extra.length ? `<div class="extra">${extra.join(' · ')}</div>` : ''}
      </div>`;
    }).join('') + '</section>').join('');

    const now = new Date();
    const zoneName = fmt(now, LOCAL, { timeZoneName: 'long' }).split(', ').pop();
    const zoneLine = localIsUK
      ? `Kick-off times are UK time (${esc(tzAbbr(now, UK))}).`
      : `Kick-off times are in ${esc(zoneName)}, with UK time beside them when it differs. Days follow the UK matchday so everyone sees the same list.`;
    let lockLine = '';
    if (lock) {
      lockLine = d.set.lock_mode === 'per_match'
        ? 'Each Super 6 pick locks at its own kick-off.'
        : `Super 6 picks ${Date.now() >= lock.getTime() ? 'locked' : 'lock'} at the first Super 6 kick-off: ${esc(whenText(lock))}.`;
    }
    return `
${pageHead('Fixtures &amp; results', `Gameweek ${gw}. ${lockLine}`, gwStepper('fixtures', gw))}
<div class="controls">
  <label class="check"><input type="checkbox" data-act="s6only"${s6only ? ' checked' : ''}> Super 6 only</label>
</div>
${rows ? `<div class="fixtures-days">${rows}</div>` : '<div class="panel pad empty"><p>No matches for this gameweek.</p></div>'}
<p class="note">${zoneLine}</p>`;
  }
  const score_ = (pr, f) => score(pr.home_goals, pr.away_goals, f.home_goals, f.away_goals);

  // ---------------------------------------------------------------- bonus
  // Short initials for player dots: two letters, longer only where two players would clash.
  function initialsFor(names) {
    const out = {};
    names.forEach((n) => {
      let k = 2;
      const clash = () => names.some((m) => m !== n && m.slice(0, k).toLowerCase() === n.slice(0, k).toLowerCase());
      while (k < n.length && k < 3 && clash()) k++;
      out[n] = n.slice(0, 1).toUpperCase() + n.slice(1, k).toLowerCase();
    });
    return out;
  }

  function viewBonus() {
    const d = S.data;
    const isPublic = d.set.bonus_public === 'true';
    const groups = [];
    d.slots.forEach((s) => {
      let g = groups.find((x) => x.key === s.group_key);
      if (!g) { g = { key: s.group_key, label: s.label, each: s.points_each, slots: [] }; groups.push(g); }
      g.slots.push(s.slot);
    });
    const order = ['champion', 'top4', 'bottom3', 'golden_boot', 'playmaker', 'pots', 'young', 'golden_glove', 'manager', 'first_sacked', 'best_promoted'];
    const rankOf = (k) => { const i = order.indexOf(k); return i < 0 ? order.length : i; };
    groups.sort((a, b) => rankOf(a.key) - rankOf(b.key));
    const max = groups.reduce((s, g) => s + g.each * g.slots.length, 0);
    const actual = Object.fromEntries(d.actual.map((a) => [a.group_key, a.accepted || []]));
    const hits = new Set(d.vbonus.map((b) => b.player_id + ':' + b.slot));
    const people = d.board.map((b) => d.byId[b.player_id]).filter(Boolean);
    const visible = new Set(d.picks.map((p) => p.player_id));
    const pickers = people.filter((p) => visible.has(p.id));
    const ini = initialsFor(people.map((p) => p.name));
    const isMe = (id) => S.me && S.me.id === id;
    const ptsLabel = (g) => (g.slots.length > 1 ? `${g.each} pts each` : `${g.each} pts`);
    const ansText = (g) => {
      const ans = actual[g.key];
      if (!ans || !ans.length) return '';
      return g.key === 'top4' || g.key === 'bottom3' ? ans.map(esc).join(', ') : esc(ans[0]);
    };
    const label = (t, size) => `${CREST_IDS[t] ? crest(t, size) : ''}<span class="bt-l">${esc(t)}</span>`;

    let vis;
    if (isPublic) vis = 'Picks were made before the season and can no longer be changed.';
    else if (visible.size > 1) vis = 'Showing the picks you are allowed to see.';
    else if (S.me) vis = 'Only your own picks are shown. Sam will reveal everyone’s picks later in the season.';
    else vis = 'The picks are hidden until Sam reveals them later in the season.';

    const lede = `Up to ${max} extra points, settled as the season’s awards are decided. They go straight into the Bonus column of the table.`;

    if (!pickers.length) {
      const list = groups.map((g) => `<li><span>${esc(g.label)}${g.slots.length > 1 ? ` (${g.slots.length} picks)` : ''}</span><span>${ptsLabel(g)}</span></li>`).join('');
      return `
${pageHead('Season bonus', lede)}
<div class="panel pad empty"><h2>${ICON.lock}Picks are hidden for now</h2><p>These are the categories and what each is worth.</p><ul class="blist">${list}</ul></div>
<p class="note">${vis}</p>`;
    }

    const view = store.get('s6.bonusView', 'cat') === 'player' ? 'player' : 'cat';
    const seg = pickers.length > 1 ? `<span class="seg" role="group" aria-label="Show picks"><button type="button" data-act="bview" data-v="cat" aria-pressed="${view === 'cat'}">By category</button><button type="button" data-act="bview" data-v="player" aria-pressed="${view === 'player'}">By player</button></span>` : '';

    let main;
    if (view === 'cat') {
      // Each answer with one dot per player, in table order, so a column follows one person down the page.
      main = '<div class="bgrid">' + groups.map((g) => {
        const buckets = new Map();
        d.picks.filter((p) => g.slots.includes(p.slot)).forEach((p) => {
          const k = p.pick.trim().toLowerCase();
          if (!buckets.has(k)) buckets.set(k, { label: p.pick.trim(), ids: new Set(), hit: false });
          const b = buckets.get(k);
          b.ids.add(p.player_id);
          if (hits.has(p.player_id + ':' + p.slot)) b.hit = true;
        });
        const settled = !!ansText(g);
        const opts = Array.from(buckets.values())
          .sort((a, b) => b.ids.size - a.ids.size || a.label.localeCompare(b.label))
          .map((b) => {
            const names = pickers.filter((p) => b.ids.has(p.id)).map((p) => p.name);
            const dots = pickers.map((p) => (b.ids.has(p.id)
              ? `<span class="dot${isMe(p.id) ? ' me' : ''}" title="${esc(p.name)}">${esc(ini[p.name])}</span>`
              : '<span class="dot off"></span>')).join('');
            return `<li class="opt${b.hit ? ' hit' : ''}${settled && !b.hit ? ' miss' : ''}${S.me && b.ids.has(S.me.id) ? ' mine' : ''}">
              <span class="on">${label(b.label, 20)}${b.hit ? `<span class="tick">${ICON.check}<span class="sr">Correct</span></span>` : ''}</span>
              <span class="dots" aria-hidden="true">${dots}</span>
              <span class="cnt">${b.ids.size}<small>/${pickers.length}</small></span>
              <span class="sr">Picked by ${names.map(esc).join(', ')}</span>
            </li>`;
          }).join('');
        const status = settled
          ? `<span class="ans">${ICON.check}${ansText(g)}</span>`
          : '<span class="muted">Not settled yet</span>';
        return `<section class="panel bcat">
          <div class="panel-head"><h2>${esc(g.label)}</h2><span class="ptag">${ptsLabel(g)}</span></div>
          <div class="bstat">${status}${g.slots.length > 1 ? `<span class="muted">${g.slots.length} picks each</span>` : ''}</div>
          <ul class="opts">${opts || '<li class="muted">No picks</li>'}</ul>
        </section>`;
      }).join('') + '</div>';
    } else {
      // One card per player: their picks and the bonus points they have banked.
      const cards = pickers.map((p) => {
        const b = d.board.find((x) => x.player_id === p.id);
        const n = d.vbonus.filter((x) => x.player_id === p.id).length;
        const rowsP = groups.map((g) => {
          const mine = g.slots.map((sl) => d.picks.find((x) => x.player_id === p.id && x.slot === sl)).filter(Boolean);
          const vals = mine.length
            ? mine.map((x) => `<span class="pv${hits.has(p.id + ':' + x.slot) ? ' hit' : ''}">${label(x.pick.trim(), 18)}${hits.has(p.id + ':' + x.slot) ? `<span class="tick">${ICON.check}<span class="sr">Correct</span></span>` : ''}</span>`).join('')
            : '<span class="muted">None</span>';
          return `<div class="prw"><dt>${esc(g.label)}</dt><dd>${vals}</dd></div>`;
        }).join('');
        return { p, bonus: b ? b.bonus : 0, html: `<section class="panel pcard${isMe(p.id) ? ' me' : ''}">
          <div class="panel-head"><h2>${esc(p.name)}${isMe(p.id) ? '<span class="you">You</span>' : ''}</h2><span class="pc-pts"><b>${b ? b.bonus : 0}</b> pts<small>${n} correct</small></span></div>
          <dl class="plist">${rowsP}</dl>
        </section>` };
      }).sort((a, b) => b.bonus - a.bonus).map((x) => x.html).join('');
      main = `<div class="pgrid">${cards}</div>`;
    }

    return `
${pageHead('Season bonus', lede, seg)}
${main}
<p class="note">${vis}${view === 'cat' && pickers.length > 1 ? ' Each dot is a player, in table order. Yours is filled in purple.' : ''}</p>`;
  }

  // ---------------------------------------------------------------- rules
  function viewRules() {
    const d = S.data;
    const perMatch = d.set.lock_mode === 'per_match';
    const groups = [];
    d.slots.forEach((s) => {
      let g = groups.find((x) => x.key === s.group_key);
      if (!g) { g = { key: s.group_key, label: s.label, each: s.points_each, n: 0 }; groups.push(g); }
      g.n++;
    });
    const max = d.slots.reduce((t, x) => t + x.points_each, 0);
    return `
${pageHead('How it works', 'Six matches a week. Call the score.')}
<div class="rules">
  <section class="panel pad"><h2>Points per match</h2>
    <ul class="pts-list">
      <li><span class="pk p5"><b>5</b></span><span>Exact score. Predict 2-1, result\u00a02-1.</span></li>
      <li><span class="pk p3"><b>3</b></span><span>Right goal difference, wrong score. Predict 2-1, result 3-2. A correctly called draw always lands here or\u00a0higher.</span></li>
      <li><span class="pk p1"><b>1</b></span><span>Right winner, wrong margin. Predict 3-0, result 1-0. Draws never score 1.</span></li>
      <li><span class="pk p0"><b>0</b></span><span>Anything else.</span></li>
    </ul>
  </section>
  <section class="panel pad"><h2>The six and the deadline</h2>
    <p>Each gameweek has six Super 6 matches. Arsenal, Chelsea, Man City and Man United are in the six every week.</p>
    <p>${perMatch ? 'Each pick locks at that match\u2019s own kick-off, so you can still pick Sunday\u2019s games after Saturday\u2019s have started.' : 'All six picks lock at the first Super 6 kick-off of the gameweek.'} The lock is checked by the server, so a wrong clock on your phone makes no difference. Nobody, Sam included, can see other people\u2019s picks for a match before it locks.</p>
  </section>
  <section class="panel pad"><h2>Season bonus, up to ${max} points</h2>
    <ul class="blist">${groups.map((g) => `<li><span>${esc(g.label)}${g.n > 1 ? ` (${g.n} picks)` : ''}</span><span>${g.n > 1 ? `${g.each} each` : `${g.each} pts`}</span></li>`).join('')}</ul>
  </section>
  <section class="panel pad"><h2>Tie-breaks and times</h2>
    <p>Ties break on total points, then exact scores, then correct goal differences.</p>
    <p>Kick-offs show in your own time zone, with UK time beside them when it differs. Gameweeks are listed by UK matchday.</p>
  </section>
</div>`;
  }

  // ---------------------------------------------------------------- predictions
  // The first gameweek still open for picks.
  function openGw() {
    const now = Date.now();
    for (let gw = 1; gw <= 38; gw++) {
      const six = S.data.fixtures.filter((f) => f.gw === gw && f.super6);
      if (six.length && six.some((f) => !isLocked(f) && f.ko.getTime() > now)) return gw;
    }
    return S.data.currentGw;
  }

  function untilText(d) {
    const ms = d.getTime() - Date.now();
    if (ms <= 0) return '';
    const h = Math.floor(ms / 3600e3), m = Math.floor((ms % 3600e3) / 60e3);
    if (h >= 48) return `in ${Math.floor(h / 24)}\u00a0days`;
    if (h >= 1) return `in ${h}\u00a0h ${m}\u00a0min`;
    return `in ${m}\u00a0min`;
  }

  function gwStepper(kind, gw) {
    const prev = gw > 1 ? `<a href="#/${kind}/${gw - 1}" aria-label="Previous gameweek">${ICON.prev}</a>` : `<span class="dis">${ICON.prev}</span>`;
    const next = gw < 38 ? `<a href="#/${kind}/${gw + 1}" aria-label="Next gameweek">${ICON.next}</a>` : `<span class="dis">${ICON.next}</span>`;
    const sel = Array.from({ length: 38 }, (_, i) => `<option value="${i + 1}"${i + 1 === gw ? ' selected' : ''}>GW${i + 1}</option>`).join('');
    return `<div class="stepper">${prev}<select class="sel" data-gw="${kind}" aria-label="Choose gameweek">${sel}</select>${next}</div>`;
  }

  const QUICK = ['1-0', '2-0', '2-1', '3-1', '1-1', '0-0', '0-1', '1-2', '0-2'];

  function viewPredict(gw) {
    const d = S.data;
    if (!(gw >= 1 && gw <= 38)) gw = openGw();
    const six = d.fixtures.filter((f) => f.gw === gw && f.super6).sort((a, b) => a.ko - b.ko || a.id - b.id);
    const lock = lockTime(gw);
    const perMatch = d.set.lock_mode === 'per_match';
    const allLocked = six.length && six.every(isLocked);
    const editable = !!S.me;
    const openCount = six.filter((f) => !isLocked(f)).length;
    let lede;
    if (!six.length) lede = 'The six for this week have not been picked yet.';
    else if (allLocked) lede = `All picks for this week are locked. <a href="#/gw/${gw}">See everyone’s picks</a>.`;
    else if (perMatch) {
      const next = six.filter((f) => !isLocked(f))[0];
      lede = `Each pick locks at its own kick-off. Next up: ${esc(next.home)} v ${esc(next.away)}, ${esc(untilText(next.ko))}.`;
    } else lede = `Picks lock ${esc(untilText(lock))}, at the first Super 6 kick-off: ${esc(whenText(lock))}.`;

    let lastDay = '';
    const rows = six.map((f) => {
      const dk = dayKey(f.ko, UK);
      const dayHead = dk !== lastDay ? `<div class="pday">${esc(fmt(f.ko, UK, { weekday: 'long', day: 'numeric', month: 'long' }))}</div>` : '';
      lastDay = dk;
      return dayHead + predRow(f);
    }).join('');

    function predRow(f) {
      const locked = isLocked(f);
      const pr = S.me ? d.predMap.get(S.me.id + ':' + f.id) : null;
      const done = isDone(f);
      const pts = ptsNow(pr, f);
      const teams = `<div class="match"><span class="team h"><span class="nm">${esc(f.home)}</span>${crest(f.home)}</span>${scoreHTML(f)}<span class="team a">${crest(f.away)}<span class="nm">${esc(f.away)}</span></span></div>`;
      if (editable && !locked) {
        const box = (side, v, team) => `<span class="step">
            <button type="button" class="stepbtn" data-step="-1" data-side="${side}" aria-label="One fewer ${esc(team)} goal">${ICON.minus}</button>
            <input class="goal" type="number" inputmode="numeric" min="0" max="20" step="1" data-side="${side}" value="${v}" aria-label="${esc(team)} goals">
            <button type="button" class="stepbtn" data-step="1" data-side="${side}" aria-label="One more ${esc(team)} goal">${ICON.plus}</button>
          </span>`;
        return `<div class="prow open" data-fid="${f.id}">
          <div class="time">${timeHTML(f.ko)}</div>
          ${teams}
          <div class="entry">${box('h', pr ? pr.home_goals : '', f.home)}<span class="dash">-</span>${box('a', pr ? pr.away_goals : '', f.away)}</div>
          <div class="quick" role="group" aria-label="Quick scores">${QUICK.map((q) => `<button type="button" class="qbtn" data-q="${q}">${q}</button>`).join('')}</div>
          <div class="rstat${pr ? ' ok' : ''}" aria-live="polite">${pr ? `${ICON.check}Saved` : 'No pick yet'}</div>
        </div>`;
      }
      // Locked or view-only: the result sits between the teams; your pick and points below.
      let line = '';
      if (editable) {
        line = pr
          ? `<span class="pick-l">Your pick</span><span class="pick">${pr.home_goals}-${pr.away_goals}</span>${pts != null ? ptsChip(pts) + (isLive(f) ? '<span class="livetag">live</span>' : '') : (locked && !done ? '<span class="muted">Locked</span>' : '')}`
          : `<span class="muted">${locked ? 'No pick made' : 'No pick yet'}</span>`;
      } else if (locked && !done && f.status !== 'IN_PLAY') line = '<span class="muted">Locked</span>';
      return `<div class="prow${locked ? ' locked' : ''}">
        <div class="time">${timeHTML(f.ko)}</div>
        ${teams}
        ${line ? `<div class="entry mine">${line}</div>` : ''}
      </div>`;
    }

    let top = '';
    if (!S.session) top = `<div class="notice"><span>Sign in to enter your picks. Other players’ picks show once each match locks.</span><a class="btn sm" href="#/login">Sign in</a></div>`;
    let progress = '';
    if (S.me && six.length) {
      const have = six.filter((f) => d.predMap.get(S.me.id + ':' + f.id)).length;
      progress = `<div class="progress" id="predProg"><span class="pbar"><i class="pfill w${have}"></i></span><span><b>${have} of ${six.length}</b> picked</span></div>`;
    }
    // Beside the list on wide screens (a sticky bar on phones): your progress and the next lock.
    let side = '';
    if (progress) {
      const nextOpen = six.filter((f) => !isLocked(f))[0];
      let lockLine = '';
      if (nextOpen) {
        const at = perMatch ? nextOpen.ko : lock;
        lockLine = `<p class="ps-lock">${ICON.clock}<span><b>${perMatch ? 'Next lock' : 'Picks lock'} ${esc(untilText(at))}</b>${perMatch ? `<span>${esc(nextOpen.home)} v ${esc(nextOpen.away)}</span>` : ''}<span>${esc(whenText(at))}</span></span></p>`;
      }
      side = `<aside class="predside" aria-label="Your picks this week"><h2 class="ps-t">Your picks</h2>${progress}${lockLine}</aside>`;
    }
    return `<div class="${side ? 'predlay' : 'narrow'}">
<div class="pl-head">${pageHead('Predictions', `Gameweek ${gw}. ${lede}`, gwStepper('predict', gw))}</div>
${side}
<div class="pl-main">
${top}
${six.length ? `<div class="panel bleed" id="predForm">${rows}</div>` : ''}
${S.me && openCount ? '<p class="note">Picks save by themselves as soon as both scores are in. Type a number and the cursor jumps to the next box, or use the buttons (use + for 10 or more). You can change a pick as often as you like until that match locks; clear both boxes to remove it.</p>' : ''}</div></div>`;
  }

  // Autosave: each match saves on its own as soon as both scores are filled in.
  function bindPredict() {
    const wrap = document.getElementById('predForm');
    if (!wrap || !S.me) return;
    const timers = new Map();
    const inputs = Array.from(wrap.querySelectorAll('input.goal'));
    const status = (row, cls, html) => { const el = row.querySelector('.rstat'); el.className = 'rstat ' + cls; el.innerHTML = html; };
    const updateProgress = () => {
      const prog = document.getElementById('predProg');
      if (!prog) return;
      const gw = S.data.fixtures.find((f) => f.id === +wrap.querySelector('.prow[data-fid]')?.dataset.fid)?.gw;
      const six = S.data.fixtures.filter((f) => f.gw === gw && f.super6);
      if (!gw) return;
      const have = six.filter((f) => S.data.predMap.get(S.me.id + ':' + f.id)).length;
      prog.innerHTML = `<span class="pbar"><i class="pfill w${have}"></i></span><span><b>${have} of ${six.length}</b> picked</span>`;
    };
    async function save(row) {
      const fid = +row.dataset.fid;
      const h = row.querySelector('input[data-side=h]').value.trim();
      const a = row.querySelector('input[data-side=a]').value.trim();
      const key = S.me.id + ':' + fid;
      const had = S.data.predMap.get(key);
      if (h === '' && a === '') {
        if (!had) { status(row, '', 'No pick yet'); return; }
        status(row, 'busy', 'Removing…');
        const { error } = await sb.from('predictions').delete().eq('player_id', S.me.id).eq('fixture_id', fid);
        if (error) { status(row, 'err', 'Not removed: ' + esc(lockMsg(error))); return; }
        S.data.predMap.delete(key);
        S.data.preds = S.data.preds.filter((p) => !(p.player_id === S.me.id && p.fixture_id === fid));
        status(row, '', 'Pick removed'); updateProgress(); return;
      }
      const hn = Number(h), an = Number(a);
      if (h === '' || a === '') { status(row, 'warn', 'Add the other score to save'); return; }
      if (!Number.isInteger(hn) || !Number.isInteger(an) || hn < 0 || an < 0 || hn > 20 || an > 20) { status(row, 'err', 'Scores are whole numbers from 0 to 20'); return; }
      if (had && had.home_goals === hn && had.away_goals === an) { status(row, 'ok', `${ICON.check}Saved`); return; }
      status(row, 'busy', 'Saving…');
      const rec = { player_id: S.me.id, fixture_id: fid, home_goals: hn, away_goals: an };
      const { error } = await sb.from('predictions').upsert([rec], { onConflict: 'player_id,fixture_id' });
      if (error) { status(row, 'err', 'Not saved: ' + esc(lockMsg(error))); return; }
      S.data.predMap.set(key, rec);
      S.data.preds = S.data.preds.filter((p) => !(p.player_id === S.me.id && p.fixture_id === fid)).concat([rec]);
      status(row, 'ok', `${ICON.check}Saved ${esc(hm(new Date(), LOCAL))}`);
      updateProgress();
    }
    // Saves for one row run one after another, each reading the boxes when it starts,
    // so a slow earlier save can never land after a newer one.
    let inFlight = 0;
    const enqueue = (row) => {
      inFlight++;
      row._chain = (row._chain || Promise.resolve()).then(() => save(row)).catch((e) => status(row, 'err', 'Not saved: ' + esc(e.message || e)))
        .finally(() => { inFlight--; if (!timers.size && !inFlight) S.dirty = false; });
    };
    const schedule = (row, ms) => {
      S.dirty = true;
      clearTimeout(timers.get(row));
      timers.set(row, setTimeout(() => { timers.delete(row); enqueue(row); }, ms));
    };
    S.flushPicks = () => { timers.forEach((t, row) => { clearTimeout(t); enqueue(row); }); timers.clear(); };
    wrap.addEventListener('input', (ev) => {
      const inp = ev.target;
      if (!inp.matches('input.goal')) return;
      const row = inp.closest('.prow');
      if (inp.value.length > 2) inp.value = inp.value.slice(0, 2);
      // One digit typed: jump to the next box so a whole week is twelve keystrokes.
      if (/^\d$/.test(inp.value) && ev.inputType && ev.inputType.startsWith('insert')) {
        const i = inputs.indexOf(inp);
        if (inputs[i + 1]) { inputs[i + 1].focus(); inputs[i + 1].select(); }
      }
      schedule(row, 700);
    });
    wrap.addEventListener('focusin', (ev) => { if (ev.target.matches('input.goal')) ev.target.select(); });
    // A mouse click would otherwise undo the selection, so typing appended to the old score.
    wrap.addEventListener('mouseup', (ev) => { if (ev.target.matches('input.goal')) { ev.preventDefault(); ev.target.select(); } });
    wrap.addEventListener('click', (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      const row = b.closest('.prow');
      if (b.dataset.step) {
        const inp = row.querySelector(`input[data-side=${b.dataset.side}]`);
        const cur = inp.value === '' ? (b.dataset.step === '1' ? -1 : 1) : Number(inp.value);
        inp.value = String(Math.max(0, Math.min(20, cur + Number(b.dataset.step))));
        const other = row.querySelector(`input[data-side=${b.dataset.side === 'h' ? 'a' : 'h'}]`);
        schedule(row, other.value === '' ? 1500 : 700);
      } else if (b.dataset.q) {
        const [h, a] = b.dataset.q.split('-');
        row.querySelector('input[data-side=h]').value = h;
        row.querySelector('input[data-side=a]').value = a;
        schedule(row, 150);
      }
    });
  }
  // Save anything pending if the page is being left (one listener for the whole app).
  window.addEventListener('pagehide', () => { if (S.flushPicks) S.flushPicks(); });
  const lockMsg = (error) => (/row-level security|policy/i.test(error.message) ? 'this match has locked' : error.message);

  window.addEventListener('beforeunload', (ev) => { if (S.dirty) { ev.preventDefault(); ev.returnValue = ''; } });

  // ---------------------------------------------------------------- admin
  const BIG4 = ['Arsenal', 'Chelsea', 'Man City', 'Man United'];

  function viewAdmin(gw) {
    const d = S.data;
    if (!(gw >= 1 && gw <= 38)) gw = openGw();
    const all = d.fixtures.filter((f) => f.gw === gw).sort((a, b) => a.ko - b.ko || a.id - b.id);
    const six = all.filter((f) => f.super6);
    const lock = lockTime(gw);
    const sixLocked = lock && Date.now() >= lock.getTime();

    const pickRows = all.map((f) => `<label class="arow">
      <input type="checkbox" name="s6" value="${f.id}"${f.super6 ? ' checked' : ''}${sixLocked ? ' disabled' : ''}>
      <span class="atime">${esc(shortDay(f.ko, UK))} ${esc(hm(f.ko, UK))} UK</span>
      <span class="ateams">${esc(f.home)} v ${esc(f.away)}</span>
    </label>`).join('');

    const resRows = all.map((f) => `<div class="arow res" data-fid="${f.id}">
      <span class="ateams">${esc(f.home)} v ${esc(f.away)}<small>${esc(f.status === 'FINISHED' ? 'Full time' : f.status === 'IN_PLAY' ? 'Live' : f.status === 'POSTPONED' ? 'Postponed' : 'Not played')}${f.result_source === 'admin' ? ' · set by admin' : ''}</small></span>
      <span class="ains"><input class="goal sm" type="number" inputmode="numeric" min="0" max="30" data-side="h" value="${f.home_goals != null ? f.home_goals : ''}" aria-label="${esc(f.home)} goals"><span class="dash">-</span><input class="goal sm" type="number" inputmode="numeric" min="0" max="30" data-side="a" value="${f.away_goals != null ? f.away_goals : ''}" aria-label="${esc(f.away)} goals"></span>
      <span class="abtns"><button class="btn quiet sm" type="button" data-res="set">Set full time</button>${f.result_source === 'admin' ? '<button class="linkbtn small" type="button" data-res="feed">Hand back to feed</button>' : ''}</span>
    </div>`).join('');

    const players = d.players.slice().sort((a, b) => a.name.localeCompare(b.name));
    const activePlayers = players.filter((p) => p.active);
    const groups = [];
    d.slots.forEach((s) => { if (!groups.some((g) => g.key === s.group_key)) groups.push({ key: s.group_key, label: s.label }); });
    const actual = Object.fromEntries(d.actual.map((a) => [a.group_key, a.accepted || []]));

    return `
${pageHead('Admin', 'Only you can see this tab. Changes go live for everyone straight away.', gwStepper('admin', gw))}

<form class="aform panel" id="fSix" novalidate>
  <div class="panel-head"><h2>The six for GW${gw}</h2></div><div class="body">
  <p class="note">${sixLocked ? 'This week has locked, so the six can no longer change here.' : 'Pick exactly six. Arsenal, Chelsea, Man City and Man United must each be in one of them.'}</p>
  <div class="alist">${pickRows || '<p class="note">No fixtures.</p>'}</div>
  </div>${sixLocked ? '' : '<div class="panel-foot savebar"><button class="btn" type="submit">Save the six</button><span class="msg" role="status"></span></div>'}
</form>

<form class="aform panel" id="fRes" novalidate>
  <div class="panel-head"><h2>Results for GW${gw}</h2></div><div class="body">
  <p class="note">Use this when the feed is late or wrong. A result you set is never overwritten by the feed until you hand it back.</p>
  <div class="alist">${resRows}</div>
  </div><div class="panel-foot"><span class="msg" role="status"></span></div>
</form>

<form class="aform panel" id="fLate" novalidate>
  <div class="panel-head"><h2>Late pick</h2></div><div class="body">
  <p class="note">Enter a pick for someone who missed the deadline. Works before or after the lock and replaces any pick they already have for that match.</p>
  <div class="agrid">
    <label>Player<select class="sel" name="pid">${activePlayers.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></label>
    <label>Match<select class="sel" name="fid">${six.map((f) => `<option value="${f.id}">${esc(f.home)} v ${esc(f.away)}</option>`).join('')}</select></label>
    <label>Score<span class="ains"><input class="goal sm" type="number" inputmode="numeric" min="0" max="20" name="h" aria-label="Home goals"><span class="dash">-</span><input class="goal sm" type="number" inputmode="numeric" min="0" max="20" name="a" aria-label="Away goals"></span></label>
  </div>
  </div><div class="panel-foot savebar"><button class="btn" type="submit"${six.length ? '' : ' disabled'}>Save pick</button><span class="msg" role="status"></span></div>
</form>

<form class="aform panel" id="fBonus" novalidate>
  <div class="panel-head"><h2>Season bonus answers</h2></div><div class="body">
  <p class="note">Fill these in as the awards are settled. List every spelling that should count, separated by commas (for example: Bruno F, Bruno F., Bruno Fernandes). For Top 4 and Bottom 3 list the clubs. Matching ignores capitals and spaces at the ends.</p>
  <div class="alist">${groups.map((g) => `<label class="bfield">${esc(g.label)}<input type="text" name="${esc(g.key)}" value="${esc((actual[g.key] || []).join(', '))}" autocomplete="off"></label>`).join('')}</div>
  </div><div class="panel-foot savebar"><button class="btn" type="submit">Save answers</button><span class="msg" role="status"></span></div>
</form>

<form class="aform panel" id="fSet" novalidate>
  <div class="panel-head"><h2>Settings</h2></div><div class="body">
  <div class="alist">
    <label class="bfield">When picks lock<select class="sel" name="lock_mode">
      <option value="first_super6"${d.set.lock_mode !== 'per_match' ? ' selected' : ''}>All six at the first Super 6 kick-off</option>
      <option value="per_match"${d.set.lock_mode === 'per_match' ? ' selected' : ''}>Each match at its own kick-off</option>
    </select></label>
    <label class="check"><input type="checkbox" name="bonus_public"${d.set.bonus_public === 'true' ? ' checked' : ''}> Show everyone’s bonus picks on the Bonus tab</label>
  </div>
  </div><div class="panel-foot savebar"><button class="btn" type="submit">Save settings</button><span class="msg" role="status"></span></div>
</form>

<form class="aform panel" id="fPlayers" novalidate>
  <div class="panel-head"><h2>Players</h2></div><div class="body">
  <p class="note">Untick someone to take them off the table. Their picks are kept. New logins and password resets are done in Supabase (Authentication, Users).</p>
  <div class="alist">${players.map((p) => `<label class="check"><input type="checkbox" name="active" value="${esc(p.id)}"${p.active ? ' checked' : ''}${S.me && p.id === S.me.id ? ' disabled' : ''}> ${esc(p.name)}${p.is_admin ? ' <span class="muted small">admin</span>' : ''}</label>`).join('')}</div>
  </div><div class="panel-foot savebar"><button class="btn" type="submit">Save players</button><span class="msg" role="status"></span></div>
</form>`;
  }

  // Run one admin save: lock the button, show the outcome, reload the data.
  async function adminRun(form, fn) {
    const msg = form.querySelector('.msg');
    const btns = form.querySelectorAll('button');
    btns.forEach((b) => { b.disabled = true; });
    msg.className = 'msg'; msg.textContent = 'Saving…';
    let err = null;
    try { err = await fn(); } catch (e) { err = e.message || String(e); }
    btns.forEach((b) => { b.disabled = false; });
    if (err === 'Cancelled.') { msg.className = 'msg'; msg.textContent = 'Not saved.'; return; }
    if (err) { msg.className = 'msg err'; msg.textContent = err; return; }
    const id = form.id;
    S.dirty = false;
    await refresh(false);
    const m2 = document.querySelector('#' + id + ' .msg');
    if (m2) { m2.className = 'msg ok'; m2.textContent = 'Saved.'; }
  }
  const dbErr = (r) => (r && r.error ? r.error.message : null);

  function bindAdmin() {
    const d = S.data;
    const gw = parseInt(route().arg, 10) || openGw();
    app.querySelectorAll('form.aform').forEach((f) => f.addEventListener('input', () => { S.dirty = true; }));

    const fSix = document.getElementById('fSix');
    fSix.addEventListener('submit', (ev) => {
      ev.preventDefault();
      adminRun(fSix, async () => {
        const chosen = new Set(Array.from(fSix.querySelectorAll('input[name=s6]:checked')).map((i) => +i.value));
        if (chosen.size !== 6) return `Pick exactly six. You have ${chosen.size}.`;
        const week = d.fixtures.filter((f) => f.gw === gw);
        const missing = BIG4.filter((club) => week.some((f) => f.home === club || f.away === club)
          && !week.some((f) => chosen.has(f.id) && (f.home === club || f.away === club)));
        if (missing.length) return `${missing.join(' and ')} must be in the six.`;
        for (const f of week) {
          if (f.super6 !== chosen.has(f.id)) {
            const e = dbErr(await sb.from('fixtures').update({ super6: chosen.has(f.id) }).eq('id', f.id));
            if (e) return e;
          }
        }
        return null;
      });
    });

    const fRes = document.getElementById('fRes');
    fRes.addEventListener('submit', (ev) => ev.preventDefault());
    fRes.querySelectorAll('button[data-res]').forEach((b) => b.addEventListener('click', () => {
      const row = b.closest('.res');
      const fid = +row.dataset.fid;
      const f = d.fixtures.find((x) => x.id === fid);
      adminRun(fRes, async () => {
        if (b.dataset.res === 'feed') return dbErr(await sb.from('fixtures').update({ result_source: 'feed' }).eq('id', fid));
        const h = row.querySelector('[data-side=h]').value.trim(), a = row.querySelector('[data-side=a]').value.trim();
        const hn = Number(h), an = Number(a);
        if (h === '' || a === '' || !Number.isInteger(hn) || !Number.isInteger(an) || hn < 0 || an < 0 || hn > 30 || an > 30) return `Enter both scores (0 to 30) for ${f.home} v ${f.away}.`;
        if (!confirm(`Set ${f.home} ${hn}-${an} ${f.away} as the full-time result?`)) return 'Cancelled.';
        return dbErr(await sb.from('fixtures').update({ home_goals: hn, away_goals: an, status: 'FINISHED', result_source: 'admin' }).eq('id', fid));
      });
    }));

    const fLate = document.getElementById('fLate');
    fLate.addEventListener('submit', (ev) => {
      ev.preventDefault();
      adminRun(fLate, async () => {
        const h = fLate.h.value.trim(), a = fLate.a.value.trim();
        const hn = Number(h), an = Number(a);
        if (h === '' || a === '' || !Number.isInteger(hn) || !Number.isInteger(an) || hn < 0 || an < 0 || hn > 20 || an > 20) return 'Enter both scores (0 to 20).';
        const p = d.byId[fLate.pid.value];
        const f = d.fixtures.find((x) => x.id === +fLate.fid.value);
        if (!confirm(`Save ${p.name}'s pick ${f.home} ${hn}-${an} ${f.away}? It replaces any pick they already have.`)) return 'Cancelled.';
        return dbErr(await sb.rpc('admin_set_prediction', { pid: fLate.pid.value, fid: +fLate.fid.value, h: hn, a: an }));
      });
    });

    const fBonus = document.getElementById('fBonus');
    fBonus.addEventListener('submit', (ev) => {
      ev.preventDefault();
      adminRun(fBonus, async () => {
        const ups = [], dels = [];
        fBonus.querySelectorAll('input[type=text]').forEach((i) => {
          const vals = i.value.split(',').map((x) => x.trim()).filter(Boolean);
          if (vals.length) ups.push({ group_key: i.name, accepted: vals });
          else if (d.actual.some((a) => a.group_key === i.name)) dels.push(i.name);
        });
        if (ups.length) { const e = dbErr(await sb.from('bonus_actual').upsert(ups, { onConflict: 'group_key' })); if (e) return e; }
        if (dels.length) { const e = dbErr(await sb.from('bonus_actual').delete().in('group_key', dels)); if (e) return e; }
        return null;
      });
    });

    const fSet = document.getElementById('fSet');
    fSet.addEventListener('submit', (ev) => {
      ev.preventDefault();
      adminRun(fSet, async () => {
        const vals = { lock_mode: fSet.lock_mode.value, bonus_public: fSet.bonus_public.checked ? 'true' : 'false' };
        for (const [key, value] of Object.entries(vals)) {
          if (d.set[key] === value) continue;
          const e = dbErr(await sb.from('settings').update({ value }).eq('key', key));
          if (e) return e;
        }
        return null;
      });
    });

    const fPlayers = document.getElementById('fPlayers');
    fPlayers.addEventListener('submit', (ev) => {
      ev.preventDefault();
      adminRun(fPlayers, async () => {
        const on = new Set(Array.from(fPlayers.querySelectorAll('input[name=active]:checked')).map((i) => i.value));
        for (const p of d.players) {
          if (S.me && p.id === S.me.id) continue;
          if (p.active !== on.has(p.id)) {
            const e = dbErr(await sb.from('players').update({ active: on.has(p.id) }).eq('id', p.id));
            if (e) return e;
          }
        }
        return null;
      });
    });
  }

  // ---------------------------------------------------------------- account
  function viewAccount() {
    const name = S.me ? S.me.name : '';
    return `
${pageHead('Your account', `Signed in as ${esc(name || S.session.user.email)}.`)}
<div class="account"><div class="panel pad">
  <h2>Change password</h2>
  <form class="form" data-act="password" novalidate>
    <label>New password<input name="p1" type="password" autocomplete="new-password" minlength="6" required></label>
    <label>Type it again<input name="p2" type="password" autocomplete="new-password" minlength="6" required></label>
    <p class="err" role="alert"></p>
    <button class="btn" type="submit">Save new password</button>
  </form>
  <p class="note">At least 6 characters, and not your name. If you forget it, Sam can reset it.</p>
</div>
<p class="signout-row"><button class="btn quiet" data-act="signout">Sign out</button></p></div>`;
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
    form.reset();
    err.className = 'ok';
    err.textContent = 'Saved. Use the new password next time you sign in.';
  }

  boot().catch((e) => {
    app.innerHTML = `<div class="boot err">Something went wrong: ${esc(e.message || e)}</div>`;
  });
})();
