// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, a filterable table, a per-protocol detail
// view with the model's own inputs and the protocol's farm plan, and the live set.
// No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;

  var rowsEl = document.getElementById('rows');
  var detailEl = document.getElementById('detail');
  var countEl = document.getElementById('count');
  var statsEl = document.getElementById('stats');
  var qEl = document.getElementById('q');
  var catEl = document.getElementById('category');
  var chainEl = document.getElementById('chain');
  var sortEl = document.getElementById('sort');
  var tabsEl = document.getElementById('tabs');

  var state = { tab: 'pre-token', q: '', category: 'all', chain: 'all', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Fill the stats bar and the filter lists from the data itself.
  (function init() {
    var cats = {};
    var chains = {};
    DATA.rows.forEach(function (r) {
      if (r.category) cats[r.category] = 1;
      r.chains.forEach(function (c) { chains[c] = 1; });
    });
    Object.keys(cats).sort().forEach(function (c) {
      var o = document.createElement('option');
      o.value = c; o.textContent = c; catEl.appendChild(o);
    });
    Object.keys(chains).sort().forEach(function (c) {
      var o = document.createElement('option');
      o.value = c; o.textContent = c; chainEl.appendChild(o);
    });
    statsEl.innerHTML =
      '<div><dt>Pre-token protocols</dt><dd>' + DATA.board_size + '</dd></div>' +
      '<div><dt>On the watchlist</dt><dd>' + DATA.watchlist_size + '</dd></div>' +
      '<div><dt>Below the floor</dt><dd>' + DATA.early_size + '</dd></div>' +
      '<div><dt>Live set</dt><dd>' + DATA.live_size + '</dd></div>' +
      '<div><dt>Snapshot</dt><dd>' + esc(DATA.as_of) + '</dd></div>';
    // Hash state: #detail=<slug>, #tab=live, #category=<name>, #chain=<name>, #q=<text>.
    var hash = new URLSearchParams((location.hash || '').slice(1));
    if (hash.get('tab') === 'live') state.tab = 'live';
    if (hash.get('category')) state.category = hash.get('category');
    if (hash.get('chain')) state.chain = hash.get('chain');
    if (hash.get('q')) state.q = hash.get('q');
    if (hash.get('detail')) state.selected = hash.get('detail');
    qEl.value = state.q;
    catEl.value = state.category;
    chainEl.value = state.chain;
    render();
  })();

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) === -1) return false;
      if (q && r.name.toLowerCase().indexOf(q) === -1 && r.slug.toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
  }

  function sortRows(list) {
    var key = state.sort;
    var dir = state.dir;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'rank') { av = a.rank; bv = b.rank; }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? -1 : a.age_days; bv = b.age_days === null ? -1 : b.age_days; }
      else if (key === 'name') { av = a.name; bv = b.name; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return a.slug < b.slug ? -1 : 1;
    });
  }

  function render() {
    tabsEl.querySelectorAll('button').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === state.tab);
    });
    document.querySelectorAll('#board th[data-sort]').forEach(function (th) {
      th.classList.toggle('sorted', th.getAttribute('data-sort') === state.sort);
    });
    if (state.tab === 'live') { renderLive(); return; }
    var list = sortRows(filteredRows());
    countEl.textContent = list.length + ' of ' + DATA.board_size + ' pre-token protocols' +
      (state.category !== 'all' ? ' · ' + state.category : '') +
      (state.chain !== 'all' ? ' · ' + state.chain : '');
    var html = '';
    list.forEach(function (r) {
      var chg = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var cls = r.change_7d === null ? '' : (r.change_7d >= 0 ? 'up' : 'down');
      html += '<tr data-slug="' + esc(r.slug) + '"' + (state.selected === r.slug ? ' class="selected"' : '') + '>' +
        '<td class="rank">#' + r.rank + '</td>' +
        '<td class="name">' + esc(r.name) + '<span class="sub">' + esc(r.slug) + '</span></td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td>' + r.chains.slice(0, 2).map(esc).join(', ') + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '') + '</td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
        '<td class="num ' + cls + '">' + chg + '</td>' +
        '<td class="num">' + fmtAge(r.age_days) + '</td>' +
        '<td class="num"><b>' + fmtUsd(r.implied_value_usd) + '</b></td>' +
        '</tr>';
    });
    rowsEl.innerHTML = html || '<tr><td colspan="8">No protocol matches these filters.</td></tr>';
    renderDetail();
  }

  function renderLive() {
    countEl.textContent = DATA.live_size + ' protocols whose token already trades — the market\u2019s own value, not a model claim.';
    var html = '';
    DATA.live.forEach(function (r) {
      var chg = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var cls = r.change_7d === null ? '' : (r.change_7d >= 0 ? 'up' : 'down');
      html += '<tr data-slug="' + esc(r.slug) + '">' +
        '<td class="rank">—</td>' +
        '<td class="name">' + esc(r.name) + '<span class="sub">' + esc(r.slug) + '</span></td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td>' + r.chains.slice(0, 2).map(esc).join(', ') + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '') + '</td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
        '<td class="num ' + cls + '">' + chg + '</td>' +
        '<td class="num">—</td>' +
        '<td class="num"><b>' + fmtUsd(r.mcap_usd) + '</b></td>' +
        '</tr>';
    });
    rowsEl.innerHTML = html;
    detailEl.innerHTML = '<h2>Live set</h2><p class="meta">These protocols already have a token that trades, so they are ' +
      'never ranked on the pre-token board. Their market cap is the market\u2019s own number; the model does not score them.</p>';
  }

  function renderDetail() {
    var r = null;
    if (state.selected) r = DATA.rows.filter(function (x) { return x.slug === state.selected; })[0] || null;
    if (!r) r = DATA.rows[0];
    if (!r) { detailEl.innerHTML = ''; return; }
    var steps = r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    detailEl.innerHTML =
      '<h2>#' + r.rank + ' ' + esc(r.name) + '</h2>' +
      '<p class="meta">' + esc(r.slug) + ' · ' + esc(r.category || 'uncategorised') + ' · ' + r.chains.map(esc).join(', ') +
      ' · listed ' + (r.listed_at ? esc(r.listed_at) : 'unknown') + ' · records no token</p>' +
      '<div class="facts">' +
      '<div><dt>Implied value</dt><dd>' + fmtUsd(r.implied_value_usd) + '</dd></div>' +
      '<div><dt>TVL</dt><dd>' + fmtUsd(r.tvl_usd) + '</dd></div>' +
      '<div><dt>7-day change</dt><dd>' + fmtPct(r.change_7d) + '</dd></div>' +
      '<div><dt>Age with no token</dt><dd>' + fmtAge(r.age_days) + '</dd></div>' +
      '</div>' +
      '<h3>How the number is made</h3>' +
      '<table class="model-table"><tbody>' +
      '<tr><td>Size — 100 &times; TVL<sup>0.7</sup></td><td>' + fmtUsd(Math.round(100 * Math.pow(r.tvl_usd, 0.7))) + '</td></tr>' +
      '<tr><td>Growth multiplier — 1 + 0.35 &times; ' + fmtPct(r.change_7d) + ' (clamped)</td><td>&times;' + r.growth_multiplier.toFixed(4) + '</td></tr>' +
      '<tr><td>Maturity multiplier — ' + fmtAge(r.age_days) + ' on the books</td><td>&times;' + r.maturity_multiplier.toFixed(4) + '</td></tr>' +
      '<tr><td>Breadth multiplier — ' + r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's') + '</td><td>&times;' + r.breadth_multiplier.toFixed(4) + '</td></tr>' +
      '<tr><td>Plausibility multiplier</td><td>&times;' + r.plausibility_multiplier.toFixed(2) + '</td></tr>' +
      '<tr><td><b>Implied value</b></td><td><b>' + fmtUsd(r.implied_value_usd) + '</b></td></tr>' +
      '</tbody></table>' +
      '<h3>How to farm it</h3>' +
      '<ol class="steps">' + steps + '</ol>';
  }

  rowsEl.addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-slug]');
    if (!tr) return;
    state.selected = tr.getAttribute('data-slug');
    render();
  });

  document.querySelectorAll('#board th[data-sort]').forEach(function (th) {
    th.addEventListener('click', function () {
      var key = th.getAttribute('data-sort');
      if (state.sort === key) state.dir = -state.dir;
      else { state.sort = key; state.dir = key === 'name' ? 1 : -1; }
      render();
    });
  });

  tabsEl.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-tab]');
    if (!b) return;
    state.tab = b.getAttribute('data-tab');
    render();
  });

  qEl.addEventListener('input', function () { state.q = qEl.value; render(); });
  catEl.addEventListener('change', function () { state.category = catEl.value; render(); });
  chainEl.addEventListener('change', function () { state.chain = chainEl.value; render(); });
  sortEl.addEventListener('change', function () {
    state.sort = sortEl.value;
    state.dir = state.sort === 'rank' ? 1 : -1;
    render();
  });
})();
