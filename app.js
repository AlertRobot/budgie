/* Budgie app: screens, syncing and offline queue. The maths lives in engine.js. */
(function () {
  "use strict";
  var B = window.Budgie, TH = window.BudgieThemes, APP_VERSION = "1.0.1";
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return String(s === undefined || s === null ? "" : s).replace(/[&<>"']/g, function (c) { return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]; }); };
  var LS = {get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }};
  var todayIso = function () { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  var newId = function (p) { return (p || "r") + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); };
  var ICON = {
    home: '<path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>', chart: '<path d="M5 20V10M12 20V4M19 20v-7"/>', plus: '<path d="M12 5v14M5 12h14"/>',
    people: '<circle cx="9" cy="8" r="3.5"/><circle cx="17" cy="9.5" r="2.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15 14.5c3 0 6 1.8 6 5"/>',
    grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
    back: '<path d="M15 6l-6 6 6 6"/>', chev: '<path d="M9 6l6 6-6 6"/>', close: '<path d="M6 6l12 12M18 6L6 18"/>', eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    pay: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>', pot: '<path d="M5 9h14l-1.5 10a2 2 0 0 1-2 1.7h-7a2 2 0 0 1-2-1.7z"/><path d="M8 9V6a4 4 0 0 1 8 0v3"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>', target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>',
    lisa: '<path d="M4 18l5-6 4 3 7-9"/><path d="M15 6h5v5"/>', house: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>', scale: '<path d="M12 3v18M5 7h14M7 7l-3 7a3 3 0 0 0 6 0zM17 7l-3 7a3 3 0 0 0 6 0z"/>',
    debt: '<path d="M4 7h16M4 12h16M4 17h10"/>', spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>',
    gift: '<rect x="3" y="9" width="18" height="12" rx="1.5"/><path d="M3 13h18M12 9v12M12 9c-2-4-6-4-6-1.5S10 9 12 9zM12 9c2-4 6-4 6-1.5S14 9 12 9z"/>', gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>'
  };
  var icon = function (n, size) { return '<svg width="' + (size || 22) + '" height="' + (size || 22) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICON[n] || "") + "</svg>"; };

  // ---------- storage (IndexedDB, falling back to localStorage) ----------
  var store = {
    db: null,
    open: function () { return new Promise(function (res) { try { var r = indexedDB.open("budgie", 1); r.onupgradeneeded = function () { r.result.createObjectStore("kv"); }; r.onsuccess = function () { store.db = r.result; res(); }; r.onerror = function () { res(); }; } catch (e) { res(); } }); },
    get: function (k) { return new Promise(function (res) { if (!store.db) return res(LS.get("budgie.kv." + k, null)); try { var q = store.db.transaction("kv").objectStore("kv").get(k); q.onsuccess = function () { res(q.result || null); }; q.onerror = function () { res(null); }; } catch (e) { res(null); } }); },
    set: function (k, v) { if (!store.db) { LS.set("budgie.kv." + k, v); return; } try { store.db.transaction("kv", "readwrite").objectStore("kv").put(v, k); } catch (e) { LS.set("budgie.kv." + k, v); } }
  };

  // ---------- state ----------
  var S = {
    cfg: LS.get("budgie.cfg", null),
    prefs: Object.assign({mode: "system", colour: "", special: "", easy: null, size: "normal", hide: false, demo: false}, LS.get("budgie.prefs", {})),
    data: {tables: {}, since: 0, me: "", summary: null, queue: []},
    demo: null, stack: [], view: {s: "today", p: {}},
    ui: {money: "month", monthOff: 0, calOff: 0, keys: "", add: {}, reveal: false, house: {}},
    syncing: false, lastError: "", lastSync: 0
  };
  var DB = null, last = {todo: [], coming: {}};
  var demoOn = function () { return !!S.prefs.demo; };
  var tables = function () { return demoOn() ? S.demo.tables : S.data.tables; };
  var me = function () { return demoOn() ? S.demo.me : S.data.me; };
  var db = function () { if (!DB) DB = B.load(tables(), todayIso()); return DB; };
  var dirty = function () { DB = null; };
  var savePrefs = function () { LS.set("budgie.prefs", S.prefs); };
  var persist = function () { if (!demoOn()) store.set("data", S.data); };
  var person = function (id) { return B.person(db(), id || me()); };
  var partner = function () { return B.partnerOf(db(), me()); };
  var potWord = function (plural) { var w = person().potWord || "pot"; return plural ? w + "s" : w; };

  // ---------- money display ----------
  var M = function (n) { return S.prefs.hide && !S.ui.reveal ? "£••••" : B.money(n); };
  var M0 = function (n) { return S.prefs.hide && !S.ui.reveal ? "£••••" : "£" + Math.round(+n || 0).toLocaleString("en-GB"); };

  // ---------- changes ----------
  function upsert(t, row) {
    var list = tables()[t] = tables()[t] || [], key = t === "meta" ? "key" : "id";
    var i = list.findIndex(function (r) { return r[key] === row[key]; });
    if (i >= 0) list[i] = Object.assign({}, list[i], row); else list.push(row);
  }
  function put(t, row, quiet) {
    row = Object.assign({}, row, {updated: Date.now(), by: me()});
    upsert(t, row);
    if (!demoOn()) { S.data.queue.push({op: "put", table: t, row: row}); persist(); syncSoon(); }
    dirty(); if (!quiet) render();
    return row;
  }
  function del(t, id) {
    upsert(t, {id: id, deleted: true, updated: Date.now()});
    if (!demoOn()) { S.data.queue.push({op: "delete", table: t, id: id}); persist(); syncSoon(); }
    dirty(); render();
  }
  function setting(key, value) { var id = me() + ":" + key; put("settings", {id: id, person: me(), key: key, value: String(value)}, true); }
  function getSetting(key, d) { return B.setting(db(), me(), key, d); }

  // ---------- sync ----------
  var syncTimer = null;
  function syncSoon() { clearTimeout(syncTimer); syncTimer = setTimeout(function () { sync(false); }, 400); }
  function merge(rows, full) {
    var T = S.data.tables;
    if (full) { T = S.data.tables = {}; }
    Object.keys(rows || {}).forEach(function (t) {
      T[t] = T[t] || [];
      rows[t].forEach(function (r) { var key = t === "meta" ? "key" : "id", i = T[t].findIndex(function (x) { return x[key] === r[key]; }); if (i >= 0) T[t][i] = r; else T[t].push(r); });
    });
    // changes still waiting to go up stay applied on top
    S.data.queue.forEach(function (op) { if (op.op === "put") { var list = T[op.table] = T[op.table] || []; var i = list.findIndex(function (x) { return x.id === op.row.id; }); if (i >= 0) list[i] = Object.assign({}, list[i], op.row); else list.push(op.row); } });
  }
  async function sync(full) {
    if (demoOn() || !S.cfg || S.syncing) return;
    S.syncing = true; renderTop();
    try {
      var ops = S.data.queue.slice(0, 40);
      var res = await fetch(S.cfg.u, {method: "POST", headers: {"Content-Type": "text/plain;charset=utf-8"}, body: JSON.stringify({key: S.cfg.k, since: full ? 0 : S.data.since, full: !!full || !S.data.since, ops: ops})});
      var j = await res.json();
      if (!j.ok) throw new Error(j.error || "The sheet said no");
      S.data.queue = S.data.queue.slice(ops.length);
      merge(j.rows, j.full);
      S.data.since = j.now; S.data.me = j.person; S.data.summary = j.partnerSummary;
      persist(); dirty(); S.lastSync = Date.now(); S.lastError = "";
      applyPersonPrefs();
      if (S.data.queue.length) setTimeout(function () { sync(false); }, 60);
    } catch (e) { S.lastError = navigator.onLine === false ? "Offline: changes will sync when you're back online" : String(e && e.message || e); }
    finally { S.syncing = false; render(); }
  }

  // ---------- themes ----------
  function applyPersonPrefs() {
    if (demoOn() || !me()) return;
    var d = db(), s = d.set[me()] || {};
    if (s["theme.mode"] && !S.prefs._local) { S.prefs.mode = s["theme.mode"]; S.prefs.colour = s["theme.colour"] || ""; S.prefs.special = s["theme.special"] || ""; }
    if (S.prefs.easy === null && s.easy !== undefined) S.prefs.easy = /^true$/i.test(String(s.easy));
    applyTheme();
  }
  function applyTheme() {
    var col = S.prefs.colour || (me() === "sophie" || me() === "sam" ? "green" : "blue");
    var easy = S.prefs.easy === null ? (demoOn() ? me() === "sam" : false) : S.prefs.easy;
    TH.apply({mode: S.prefs.mode, colour: col, special: S.prefs.special, easy: easy, size: S.prefs.size});
  }
  var isEasy = function () { return document.body.classList.contains("easy"); };

  // ---------- navigation ----------
  var TABS = ["today", "money", "add", "partner", "more"];
  function go(s, p, replace) {
    if (TABS.indexOf(s) >= 0) S.stack = []; else S.stack.push(S.view);
    S.view = {s: s, p: p || {}};
    try { history[replace ? "replaceState" : "pushState"]({s: s}, ""); } catch (e) {}
    closeSheet(true); render(); window.scrollTo(0, 0);
  }
  function back() { if (sheetOpen()) { closeSheet(); return; } if (S.stack.length) { S.view = S.stack.pop(); render(); window.scrollTo(0, 0); } else if (S.view.s !== "today") { S.view = {s: "today", p: {}}; render(); } }
  var ignorePop = 0;
  window.addEventListener("popstate", function () { if (ignorePop) { ignorePop--; return; } back(); });

  // ---------- sheets and toasts ----------
  var sheetOpen = function () { return !!$("#sheets").firstChild; };
  function openSheet(html) {
    $("#sheets").innerHTML = '<div class="sheet-bg" data-a="sheetbg"><div class="sheet" role="dialog" aria-modal="true">' + html + "</div></div>";
    try { history.pushState({sheet: 1}, ""); } catch (e) {}
    var f = $("#sheets").querySelector("input,select,button.btn"); if (f && f.tagName !== "BUTTON") setTimeout(function () { f.focus(); }, 60);
  }
  // closing a sheet ourselves undoes the history entry it added, without going back a screen
  function closeSheet(silent) { if (!sheetOpen()) return; $("#sheets").innerHTML = ""; try { ignorePop++; history.back(); } catch (e) { ignorePop = 0; } }
  var toastTimer = null;
  function toast(msg, undo) {
    var el = $("#toast"); el.innerHTML = '<div class="toast"><span>' + esc(msg) + "</span>" + (undo ? '<button type="button" data-a="undo">Undo</button>' : "") + "</div>";
    S.ui.undo = undo || null; clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.innerHTML = ""; S.ui.undo = null; }, undo ? 6000 : 3000);
  }

  // ---------- small building blocks ----------
  var card = function (inner, cls) { return '<section class="card ' + (cls || "") + '">' + inner + "</section>"; };
  var bar = function (pct, mark, col) { return '<div class="bar wrap" aria-hidden="true"><i style="width:' + Math.max(0, Math.min(100, pct)) + "%" + (col ? ";background:" + col : "") + '"></i>' + (mark !== undefined && mark !== null ? '<b style="left:calc(' + Math.min(100, mark) + '% - 1px)"></b>' : "") + "</div>"; };
  var dateBox = function (iso) { var p = B.nice(iso).split(" "); return '<span class="date">' + esc(p[0]) + "<br>" + esc(p[1]) + "</span>"; };
  var chev = function () { return '<span class="chev">' + icon("chev", 18) + "</span>"; };
  var li = function (what, why, right, act, val) {
    var inner = '<span class="grow"><span class="what">' + what + "</span>" + (why ? '<span class="why">' + why + "</span>" : "") + "</span>" + (right || "");
    return act ? '<button type="button" class="li" data-a="' + act + '" data-v="' + esc(val || "") + '">' + inner + chev() + "</button>" : '<div class="li">' + inner + "</div>";
  };
  var num = function (n, cls) { return '<span class="num ' + (cls || "") + '">' + n + "</span>"; };
  var accOptions = function (sel, owner, kinds) {
    return B.accountsOf(db(), owner || me()).filter(function (a) { return !kinds || kinds.test(a.kind || "pot"); }).map(function (a) { return '<option value="' + esc(a.id) + '"' + (a.id === sel ? " selected" : "") + ">" + esc(a.name) + "</option>"; }).join("");
  };
  function chart(vals, w, h, opts) {
    opts = opts || {};
    if (!vals.length) return "";
    var max = Math.max.apply(null, vals.concat(opts.extra || [])), min = Math.min.apply(null, vals.concat(opts.extra || []));
    if (max === min) { max += 1; min -= 1; }
    var y = function (v) { return 8 + (h - 16) * (1 - (v - min) / (max - min)); }, x = function (i, n) { return (i / Math.max(1, n - 1)) * w; };
    var line = function (vs) { return "M" + vs.map(function (v, i) { return x(i, vs.length).toFixed(1) + " " + y(v).toFixed(1); }).join(" L"); };
    var l = line(vals);
    return '<svg viewBox="0 0 ' + w + " " + h + '" width="100%" height="' + h + '" preserveAspectRatio="none" role="img" aria-label="' + esc(opts.label || "Chart") + '"><path d="' + l + " L" + w + " " + h + " L0 " + h + ' Z" fill="var(--soft)"/>' +
      (opts.second ? '<path d="' + line(opts.second) + '" fill="none" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="4 4" vector-effect="non-scaling-stroke"/>' : "") +
      '<path d="' + l + '" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>';
  }

  // ---------- header and nav ----------
  var TITLES = {
    today: function () { return ["Hi " + (person().name || ""), B.nice(todayIso()).replace(/^(\w+)/, function (d) { return {Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday"}[d] || d; })]; },
    money: function () { return ["Money", "Your budget"]; }, add: function () { return ["Add", "Log a payment or a bill"]; }, partner: function () { return [person(partner()).name || "Partner", "How you're both doing"]; },
    more: function () { return ["More", "All your money tools"]; }, payday: function () { return ["Payday", "Sort your pay"]; }, pots: function () { return [cap(potWord(true)), "What should be where"]; },
    bills: function () { return ["Bills", "Calendar and subscriptions"]; }, goals: function () { return ["Goals", "Saving for things"]; }, lisa: function () { return ["LISA tracker", "Lifetime ISA"]; },
    house: function () { return ["House", "Deposit and mortgage"]; }, networth: function () { return ["Net worth", "Own minus owe"]; }, debts: function () { return ["Debts and IOUs", "Who owes what"]; },
    insights: function () { return ["Insights", "How your spending is going"]; }, gifts: function () { return ["Gifts", "Ideas and what you've bought"]; }, settings: function () { return ["Settings", person().name]; },
    edit: function () { return [S.view.p.title || "Edit", "Settings"]; }, list: function () { return [S.view.p.title || "", "Settings"]; }, themes: function () { return ["Themes", "How Budgie looks"]; },
    sharing: function () { return ["Partner and sharing", "What " + (person(partner()).name || "your partner") + " sees"]; }, sync: function () { return ["Google Sheet", "Sync and backup"]; }, importcsv: function () { return ["Import", "Bank statement"]; },
    connect: function () { return ["Budgie", "Connect your sheet"]; }
  };
  var cap = function (s) { s = String(s || ""); return s.charAt(0).toUpperCase() + s.slice(1); };
  function renderTop() {
    var t = (TITLES[S.view.s] || TITLES.today)(), back = S.stack.length > 0;
    var status = demoOn() ? "Show and tell" : S.syncing ? "Syncing…" : S.data.queue.length ? S.data.queue.length + " change" + (S.data.queue.length > 1 ? "s" : "") + " waiting" : S.lastError ? "Not synced" : "";
    $("#top").innerHTML = (back ? '<button type="button" class="round" data-a="back" aria-label="Back">' + icon("back", 20) + "</button>" : "") +
      '<div class="t"><div class="sub">' + esc(t[1]) + (status ? ' · <span class="' + (S.lastError && !S.syncing ? "warn" : "") + '">' + esc(status) + "</span>" : "") + "</div><h1>" + esc(t[0]) + "</h1></div>" +
      (S.prefs.hide ? '<button type="button" class="round" data-a="reveal" aria-label="' + (S.ui.reveal ? "Hide amounts" : "Show amounts") + '" aria-pressed="' + S.ui.reveal + '">' + icon("eye", 20) + "</button>" : "") +
      (me() ? '<button type="button" class="round avatar" data-a="who" aria-label="Account">' + esc((person().name || "?").charAt(0)) + "</button>" : "");
  }
  function renderNav() {
    if (!me()) { $("#nav").innerHTML = ""; return; }
    var cur = S.view.s, inMore = TABS.indexOf(cur) < 0 || cur === "more";
    var b = function (s, label, ic, on) { return '<button type="button" data-a="tab" data-v="' + s + '"' + (on ? ' aria-current="page"' : "") + ">" + icon(ic, 24) + esc(label) + "</button>"; };
    $("#nav").innerHTML = '<div class="in">' + b("today", "Today", "home", cur === "today") + b("money", "Money", "chart", cur === "money") +
      '<button type="button" data-a="tab" data-v="add" aria-label="Add a payment"' + (cur === "add" ? ' aria-current="page"' : "") + '><span class="plus">' + icon("plus", 26) + "</span></button>" +
      b("partner", person(partner()).name || "Partner", "people", cur === "partner") + b("more", "More", "grid", inMore && cur !== "today" && cur !== "money" && cur !== "add" && cur !== "partner") + "</div>";
  }
  function render() {
    applyTheme();
    if (!me()) { S.view = {s: "connect", p: {}}; }
    renderTop(); renderNav();
    var fn = SCREENS[S.view.s] || SCREENS.today, html = "";
    try { html = fn(S.view.p); } catch (e) { html = card('<h2>Something went wrong</h2><p class="muted small">' + esc(e && e.message) + '</p><button class="btn ghost sm" type="button" data-a="tab" data-v="today">Back to Today</button>'); console.error(e); }
    $("#main").innerHTML = (demoOn() ? '<button type="button" class="banner demo li" data-a="demoinfo" style="padding:10px 14px;border:0;color:var(--accent-ink)"><span class="grow"><span class="what">Show and tell is on</span><span class="why" style="color:inherit;opacity:.9">Made-up people and money. Tap to switch person or turn it off.</span></span></button>' : "") + html;
  }

  // ---------- screens ----------
  var SCREENS = {};

  SCREENS.connect = function () {
    return card('<h2 style="font-size:22px">Welcome to Budgie</h2><p class="muted">Budgie works from your own Google Sheet. Open the connect link from your sheet on this phone, or paste it here.</p>' +
      '<label class="f">Connect link<input id="connectLink" type="url" placeholder="https://alertrobot.github.io/budgie/#connect=…" autocomplete="off"></label>' +
      '<button type="button" class="btn wide" style="margin-top:12px" data-a="connect">Connect</button>' + (S.lastError ? '<p class="bad small">' + esc(S.lastError) + "</p>" : "")) +
      card('<h2>Just looking?</h2><p class="muted">Try Budgie with a made-up household. Nothing is saved.</p><button type="button" class="btn ghost wide" data-a="demo" data-v="on">Show me with sample data</button>');
  };

  // ----- Today
  SCREENS.today = function () {
    var d = db(), p = me(), now = todayIso(), t = B.today(d, p, now), html = "";
    var spendNames = t.tiles.filter(function (x) { return x.day !== null; }).map(function (x) { return x.name.toLowerCase().replace(/ \(what's left\)/, ""); });
    var daysTo = B.diff(now, t.nextPay);
    html += '<section class="hero card"><div class="row"><span class="small" style="opacity:.92">You can spend today</span><span class="pill">' + esc(t.status) + "</span></div>" +
      '<div class="big">' + M(t.safe) + '</div><div class="small" style="opacity:.92">' + (spendNames.length ? "for " + esc(joinWords(spendNames)) : "") + "</div>" +
      '<div class="line"><span>' + (daysTo === 0 ? "Payday is today" : "Payday in " + daysTo + " day" + (daysTo === 1 ? "" : "s") + " · " + esc(B.nice(t.nextPay))) + "</span><span class=\"num\">" + (t.nextPayAmount ? M(t.nextPayAmount) : "") + "</span></div></section>";
    if (t.plan.shortfall > 0.5) html += card('<div class="what bad" style="font-weight:700">This month is ' + M(t.plan.shortfall) + " short</div><p class=\"small muted\" style=\"margin:4px 0 0\">Bills, budgets and savings add up to more than is coming in. Lower a budget or saving in Settings.</p>");
    // to do
    var items = t.todo, payItems = items.filter(function (x) { return x.payday; }), rest = items.filter(function (x) { return !x.payday; });
    last.todo = rest;
    var rows = "";
    if (payItems.length) rows += li("Sort your pay into " + esc(potWord(true)), payItems.length + " " + (payItems.length === 1 ? potWord() : potWord(true)) + " still to move", "", "go", "payday");
    rest.forEach(function (it, i) {
      var right = num(it.type === "warn" ? "" : M(it.amount));
      var why = esc(it.why) + (it.short ? ' <span class="warn">Only ' + M(Math.max(0, it.amount - it.short)) + " is there right now.</span>" : "");
      if (it.type === "warn") rows += '<div class="li"><span class="grow"><span class="what warn">' + esc(it.what) + '</span><span class="why">' + why + '</span></span><button type="button" class="btn ghost sm" data-a="tick" data-v="' + i + '">Got it</button></div>';
      else if (it.info) rows += '<div class="li"><span class="grow"><span class="what">' + esc(it.what) + '</span><span class="why">' + why + '</span></span><button type="button" class="btn ghost sm" data-a="tick" data-v="' + i + '">I\'ve paid</button></div>';
      else rows += '<label class="li" style="cursor:pointer"><input type="checkbox" class="tick" data-c="tick" data-v="' + i + '" aria-label="Done: ' + esc(it.what) + '"><span class="grow"><span class="what">' + esc(it.what) + '</span><span class="why">' + why + "</span></span>" + right + "</label>";
    });
    html += card('<div class="row"><h2>To do</h2><span class="small muted">' + (items.length ? (rest.length + (payItems.length ? 1 : 0)) + " left" : "") + "</span></div>" + (rows ? '<div class="list">' + rows + "</div>" : '<p class="muted" style="margin:8px 0 0">All done. Everything is where it should be.</p>'));
    // tiles
    if (t.tiles.length) {
      html += '<h2 class="h2">' + (isEasy() ? "What you can spend" : "Each day until payday") + '</h2><div class="grid2">';
      t.tiles.forEach(function (x) {
        var name = esc(x.name.replace(/ \(what's left\)/, "")), v, sub;
        if (x.mode === "weekly") { v = M(x.weekLeft) + "<small> this week</small>"; sub = M(Math.max(0, x.left)) + " left this month"; }
        else if (x.day !== null) { v = M(x.day) + "<small> a day</small>"; sub = M(Math.max(0, x.left)) + " left of " + M(x.amount); }
        else { v = M(Math.max(0, x.left)) + "<small> left</small>"; sub = "For one-offs this month"; }
        var pace = x.over > 0.004 ? '<span class="bad">' + M(x.over) + " over</span>" : x.pace < -0.5 ? '<span class="warn">' + M(-x.pace) + " ahead of plan</span>" : x.mode === "oneoff" ? "" : '<span class="good">' + (x.pace > 0.5 ? M(x.pace) + " under plan" : "On plan") + "</span>";
        html += '<button type="button" class="tile" data-a="go" data-v="money" style="text-align:left;color:var(--ink)"><div class="n">' + name + '</div><div class="v">' + v + "</div>" + bar(x.pct, x.mode === "oneoff" ? null : x.paceMark) + '<div class="small" style="margin-top:6px">' + sub + '</div><div class="tiny hide-easy" style="font-weight:600">' + pace + "</div></button>";
      });
      html += "</div>";
      if (t.tiles.some(function (x) { return x.mode === "weekly"; })) html += '<p class="tiny muted hide-easy" style="margin:6px 4px 0">Food is paced week by week, so a big shop at the start of a week isn\'t counted as over.</p>';
    }
    html += comingCard(t.coming);
    return html;
  };
  function joinWords(a) { return a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]; }
  function comingCard(list) {
    last.coming = {};
    var rows = list.slice(0, 8).map(function (c) {
      last.coming[c.key] = c;
      var mine = canEditItem(c);
      return '<div class="swipe">' + (mine ? '<div class="acts"><button type="button" data-a="occskip" data-v="' + esc(c.key) + '" style="background:var(--bad)">Didn\'t happen</button><button type="button" data-a="occ" data-v="' + esc(c.key) + '" style="background:var(--accent)">Change</button></div>' : "") +
        '<button type="button" class="face li" data-a="occ" data-v="' + esc(c.key) + '">' + dateBox(c.date) + '<span class="grow"><span class="what">' + esc(c.name) + '</span><span class="why hide-easy">' + esc(c.account || "") + (c.changed ? " · changed" : "") + "</span></span>" + num((c.sign > 0 ? "+" : "−") + M(c.amount), c.sign > 0 ? "good" : "") + "</button></div>";
    }).join("");
    return card('<div class="row"><h2>Coming up</h2><span class="tiny muted hide-easy">Swipe or tap to change</span></div>' + (rows ? '<div class="list">' + rows + "</div>" : '<p class="muted">Nothing in the next two weeks.</p>'));
  }
  function canEditItem(c) { var it = db().byId[c.item]; if (!it) return false; if (c.table === "loans") return true; return it.person === me() || it.from === me(); }

  // ----- Money (month / year)
  SCREENS.money = function () {
    var d = db(), p = me(), now = todayIso(), html = '<div class="seg" role="group" aria-label="View"><button type="button" data-a="moneyview" data-v="month" aria-pressed="' + (S.ui.money === "month") + '">Month</button><button type="button" data-a="moneyview" data-v="year" aria-pressed="' + (S.ui.money === "year") + '">Year</button></div>';
    if (S.ui.money === "year") return html + yearView(d, p, now);
    var per = B.periodAt(d, p, now);
    for (var i = 0; i < Math.abs(S.ui.monthOff); i++) per = S.ui.monthOff > 0 ? B.nextPeriod(d, p, per) : B.prevPeriod(d, p, per);
    var mv = B.monthView(d, p, per), pl = mv.plan;
    html += '<div class="row" style="margin:14px 0 0;align-items:center"><button type="button" class="round" data-a="month" data-v="-1" aria-label="Earlier month">' + icon("back", 18) + '</button><div style="text-align:center"><div style="font-weight:800">' + esc(per.name) + '</div><div class="small muted">' + esc(B.nice(per.start)) + " to " + esc(B.nice(B.addDays(per.next, -1))) + '</div></div><button type="button" class="round" data-a="month" data-v="1" aria-label="Later month" style="transform:scaleX(-1)">' + icon("back", 18) + "</button></div>";
    var sec = function (kind, title) {
      var ls = mv.lines.filter(function (l) { return kind.indexOf(l.kind) >= 0; }); if (!ls.length) return "";
      var tot = ls.reduce(function (s, l) { return s + l.amount; }, 0);
      return card('<div class="row"><h2>' + title + "</h2>" + num(M(tot)) + '</div><div class="list" style="margin-top:6px">' + ls.map(function (l) {
        var right = num(M(l.amount)), why = "", tbl = l.kind === "in" ? (l.id === "opening" ? "" : (db().byId[l.id] && db().income.indexOf(db().byId[l.id]) >= 0 ? "income" : "transfers")) : l.kind === "bill" ? (l.transfer ? "transfers" : l.loan ? "loans" : "bills") : l.kind === "topup" ? "" : "budgets";
        if (l.kind === "spend" && l.spent !== undefined) { why = M(l.spent) + " spent of " + M(l.avail) + bar(l.avail ? l.spent / l.avail * 100 : 0); }
        else if (l.date) why = esc(B.nice(l.date)) + (l.actual ? " · actual" : "");
        else if (l.kind === "topup") why = "Puts back what covered going over budget last month";
        return tbl && l.id && db().byId[l.id] ? li(esc(l.name), why, right, "edit", tbl + ":" + l.id) : li(esc(l.name), why, right);
      }).join("") + "</div>");
    };
    html += sec(["in"], "Money in") + sec(["bill"], "Bills") + sec(["spend"], "Spending") + sec(["save", "topup"], "Savings");
    if (pl.shortfall > 0.004) html += card('<div class="bad" style="font-weight:700">Short by ' + M(pl.shortfall) + "</div>");
    html += '<div class="banner">Your official budget is the <b>' + esc(person().name) + ' budget</b> tab in your Google Sheet. It fills itself in from the same rules, so the app and the sheet always agree.</div>';
    return html;
  };
  function yearView(d, p, now) {
    var ys = B.year(d, p, now), max = Math.max.apply(null, ys.map(function (y) { return y.save; }).concat([1]));
    var totSave = 0, totIn = 0, totSpent = 0;
    ys.forEach(function (y) { totSave += y.save; totIn += y.in; totSpent += y.past || y.current ? y.spent : 0; });
    var bars = ys.map(function (y) { return '<div title="' + esc(y.period.name + ": " + B.money(y.save)) + '"><i class="' + (y.past ? "" : "plan") + '" style="height:' + Math.max(2, Math.round(y.save / max * 110)) + 'px"></i><span>' + esc(y.period.name.slice(0, 1)) + "</span></div>"; }).join("");
    return card('<div class="row"><h2>Saved each month</h2>' + num(M0(totSave)) + '</div><div class="bars">' + bars + '</div><p class="tiny muted" style="margin:8px 0 0">Darker bars have happened; lighter ones are the plan.</p>') +
      card('<h2>Over these 12 months</h2><div class="list" style="margin-top:6px">' + li("Coming in", "", num(M0(totIn))) + li("Saved", totIn ? Math.round(totSave / totIn * 100) + "% of what comes in" : "", num(M0(totSave))) + li("Spent so far (day to day)", "", num(M0(totSpent))) + "</div>") +
      card('<div class="list">' + ys.map(function (y) { return li(esc(y.period.name), "In " + M0(y.in) + " · bills " + M0(y.bills) + " · spending " + M0(y.spendPlan), num(M0(y.save)) + '<span class="tiny muted"> saved</span>'); }).join("") + "</div>");
  }

  // ----- Add
  SCREENS.add = function () {
    var a = S.ui.add, d = db(), p = me(), mode = a.mode || "spend";
    var buds = d.budgets.filter(function (b) { return b.person === p && b.mode !== "saving" && !(b.mode === "remainder" && /isa|lisa|saving|pension/.test((d.byId[b.account] || {}).kind || "")); });
    if (!a.budget && buds[0]) a.budget = buds[0].id;
    var accs = B.accountsOf(d, p).filter(function (x) { return /main|pot|saving|credit/.test(x.kind || "pot"); });
    if (!a.account) a.account = B.mainOf(d, p);
    var html = '<div class="seg" role="group" aria-label="What to add"><button type="button" data-a="addmode" data-v="spend" aria-pressed="' + (mode === "spend") + '">A payment</button><button type="button" data-a="addmode" data-v="bill" aria-pressed="' + (mode === "bill") + '">A bill came in</button></div>';
    html += '<div class="amount" style="margin-top:14px" aria-live="polite">£' + esc(S.ui.keys || "0") + "</div>";
    if (mode === "bill") {
      var myBills = d.bills.filter(function (b) { return b.person === p; });
      if (!a.bill && myBills[0]) a.bill = myBills[0].id;
      html += '<div class="small muted" style="text-align:center">The real amount of a bill that changes, like energy. It replaces the estimate and re-splits it.</div>';
      html += '<div style="font-weight:700;margin:12px 4px 6px">Which bill</div><div class="chips">' + myBills.map(function (b) { return '<button type="button" class="chip" data-a="addpick" data-v="bill:' + esc(b.id) + '" aria-pressed="' + (a.bill === b.id) + '">' + esc(b.name) + "</button>"; }).join("") + "</div>";
    } else {
      html += '<div style="font-weight:700;margin:12px 4px 6px">What for</div><div class="chips">' + buds.map(function (b) { return '<button type="button" class="chip" data-a="addpick" data-v="budget:' + esc(b.id) + '" aria-pressed="' + (a.budget === b.id) + '">' + esc(b.name.replace(/ \(what's left\)/, "")) + "</button>"; }).join("") + "</div>";
      html += '<div style="font-weight:700;margin:12px 4px 6px">Paid from</div><div class="chips">' + accs.map(function (x) { return '<button type="button" class="chip" data-a="addpick" data-v="account:' + esc(x.id) + '" aria-pressed="' + (a.account === x.id) + '">' + esc(x.name) + "</button>"; }).join("") + "</div>";
      var splits = d.splits;
      html += '<label class="check" style="padding-bottom:0"><input type="checkbox" data-c="addsplit"' + (a.split ? " checked" : "") + ">Split with " + esc(person(partner()).name || "partner") + "</label>";
      if (a.split && splits.length > 1) html += '<div class="chips" style="margin-top:6px">' + splits.map(function (s) { return '<button type="button" class="chip" data-a="addpick" data-v="splitid:' + esc(s.id) + '" aria-pressed="' + ((a.splitId || "half") === s.id) + '">' + esc(s.name) + "</button>"; }).join("") + "</div>";
    }
    html += '<div class="two"><label class="f">Date<input type="date" data-c="adddate" value="' + esc(a.date || todayIso()) + '"></label><label class="f">Note<input type="text" data-c="addnote" value="' + esc(a.note || "") + '" placeholder="Optional"></label></div>';
    html += '<div class="keypad">' + ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"].map(function (k) { return '<button type="button" data-a="key" data-v="' + k + '" aria-label="' + (k === "del" ? "Delete" : k === "." ? "Point" : k) + '">' + (k === "del" ? "⌫" : k) + "</button>"; }).join("") + "</div>";
    html += '<button type="button" class="btn wide" style="margin-top:12px;min-height:54px;font-size:17px" data-a="addsave">' + (mode === "bill" ? "Save the bill" : "Log it") + "</button>";
    return html;
  };

  // ----- Partner
  SCREENS.partner = function () {
    var d = db(), p = me(), q = partner(), now = todayIso();
    if (!q) return card("<p>No partner is linked yet. Add them on the people tab of your Google Sheet.</p>");
    var sm = demoOn() ? B.summary(d, q, now) : (S.data.summary || {});
    var qp = person(q), col = q === "sophie" || q === "sam" ? "#2F7D6D" : "#2E5E8C", html = "";
    var statusWord = sm.status ? sm.status.toLowerCase() : "";
    html += card('<div style="display:flex;gap:12px;align-items:center"><span class="round avatar" style="background:' + col + ';color:#fff;width:48px;height:48px;border-radius:24px">' + esc((qp.name || "?").charAt(0)) + '</span><div class="grow"><div style="font-weight:800;font-size:19px">' + esc(qp.name) + (statusWord ? " is " + esc(statusWord) : "") + '</div><div class="small muted">' + (sm.nextPay ? "Paid in " + B.diff(now, sm.nextPay) + " days (" + esc(B.nice(sm.nextPay)) + ")" : "") + "</div></div></div>" +
      (sm.safe !== undefined ? '<div class="two" style="margin-top:14px"><div class="tile" style="background:var(--bg)"><div class="n">Can spend today</div><div class="v">' + M(sm.safe) + '</div></div><div class="tile" style="background:var(--bg)"><div class="n">Saving this month</div><div class="v">' + M(sm.saved || 0) + "</div></div></div>" : "") +
      (sm.tiles ? sm.tiles.map(function (x) { return '<div style="margin-top:12px"><div class="row small"><span style="font-weight:600">' + esc(x.name.replace(/ \(what's left\)/, "")) + '</span><span class="num">' + M(x.spent) + " of " + M(x.amount) + "</span></div>" + '<div style="margin-top:5px">' + bar(x.pct, x.mode === "oneoff" ? null : x.paceMark, col) + "</div></div>"; }).join("") + '<p class="tiny muted" style="margin:12px 0 0">The black line is where they\'d expect to be by today.</p>' : '<p class="small muted">' + esc(qp.name) + " isn't sharing their budget details.</p>"));
    // between you two
    var bt = B.between(d, p, now), mo = bt.month;
    var line = bt.owedToMe > 0.004 ? esc(qp.name) + " owes you " + M(bt.owedToMe) : bt.iOwe > 0.004 ? "You owe " + esc(qp.name) + " " + M(bt.iOwe) : "You're all square";
    html += '<h2 class="h2">Between you two</h2>' + card('<div class="row"><span style="font-weight:800;font-size:18px">' + line + "</span></div>" +
      '<p class="small muted" style="margin:4px 0 0">Shared bills are split by your rules and settled by month. Split payments count straight away.</p>' +
      (mo && (mo.bills || mo.paidIn || mo.paidOut) ? '<div class="banner small">This month so far: shared bills ' + M(mo.bills) + ". " + (mo.theirShare ? esc(qp.name) + "'s share " + M(mo.theirShare) + ", paid " + M(mo.paidIn) + ". " : "") + (mo.myShare ? "Your share " + M(mo.myShare) + ", paid " + M(mo.paidOut) + "." : "") + "</div>" : "") +
      (bt.owedToMe > 0.004 ? '<button type="button" class="btn ghost sm" style="margin-top:10px" data-a="settle" data-v="in">' + esc(qp.name) + " has paid me</button>" : bt.iOwe > 0.004 ? '<button type="button" class="btn ghost sm" style="margin-top:10px" data-a="settle" data-v="out">I\'ve paid ' + esc(qp.name) + "</button>" : ""));
    B.loans(d, p, now).forEach(function (l) {
      if (l.left <= 0.004) return;
      var next = l.plan[0];
      html += card('<div class="row"><span style="font-weight:700">' + esc(l.name) + "</span>" + num(M(l.left) + " left") + '</div><div class="small muted">' + (l.lender === p ? esc(qp.name) + " pays you" : "You pay " + esc(qp.name)) + (next ? " " + M(next.amount) + " on " + esc(B.nice(next.date)) : "") + '</div><div style="margin-top:8px">' + bar(l.pct) + "</div>");
    });
    var shared = d.bills.filter(function (b) { return b.split; });
    if (shared.length) html += card('<h2>Shared bills</h2><div class="list" style="margin-top:6px">' + shared.map(function (b) {
      var amt = B.amountAt(d, b, now), parts = d.people.map(function (x) { return x.name + " " + M(B.shareOf(d, b.split, x.id, amt, b.person)); }).join(" · ");
      return li(esc(b.name), parts, num(M(amt)));
    }).join("") + "</div>");
    B.goals(d, p, now).filter(function (g) { return String((d.byId[g.id] || {}).owners || "").split(/[,\s]+/).filter(Boolean).length > 1; }).forEach(function (g) { html += goalCard(g); });
    return html;
  };

  // ----- More
  SCREENS.more = function () {
    var items = [["payday", "pay", "Payday", "Sort your pay into " + potWord(true)], ["pots", "pot", cap(potWord(true)), "What should be where"], ["bills", "cal", "Bills", "Calendar and subscriptions"], ["goals", "target", "Goals", "House, car, holidays"],
      ["lisa", "lisa", "LISA tracker", "Balance, bonus, allowance"], ["house", "house", "House", "Deposit and mortgage"], ["networth", "scale", "Net worth", "Own minus owe"], ["debts", "debt", "Debts and IOUs", "Who owes what"],
      ["insights", "spark", "Insights", "Trends and nudges"], ["gifts", "gift", "Gifts", "Christmas and birthdays"], ["settings", "gear", "Settings", "Bills, pay, budgets, themes"]];
    return '<div class="more">' + items.map(function (x) { return '<button type="button" data-a="go" data-v="' + x[0] + '"><span class="ic">' + icon(x[1], 20) + '</span><span style="font-weight:700">' + esc(x[2]) + '</span><span class="tiny muted">' + esc(x[3]) + "</span></button>"; }).join("") + "</div>";
  };

  // ----- Payday
  SCREENS.payday = function () {
    var d = db(), p = me(), now = todayIso(), per = B.periodAt(d, p, now);
    var upcoming = !(per.pay && !per.opening && B.diff(per.start, now) <= 7);
    if (upcoming) per = B.periodAt(d, p, B.today(d, p, now).nextPay);
    var pd = B.payday(d, p, per), pay = pd.pay, html = "";
    var payOcc = pay && pay.occ ? pay.occ.split("@") : null;
    html += '<section class="hero card"><div class="small" style="opacity:.92">' + (upcoming ? "Next payday: " : "Payday: ") + esc(B.nice(per.start)) + '</div><div class="big">' + (pay ? M(pay.amount) : "–") + "</div>" +
      (pay && payOcc ? '<button type="button" class="btn sm" style="background:color-mix(in srgb, var(--hero-ink) 18%, transparent);color:var(--hero-ink)" data-a="payedit" data-v="' + esc(pay.occ) + '">' + (pay.actual ? "Change the amount" : "Paid a different amount?") + "</button>" : "") +
      '<div class="small" style="opacity:.92;margin-top:8px">Change it and everything below re-sorts. What\'s left (' + esc(remainderName(pd.plan)) + ") goes up or down.</div></section>";
    var rows = pd.moves.map(function (m) {
      var key = "pay:" + per.start + ":" + m.to, done = !!d.moveKeys[key];
      return '<label class="li" style="cursor:pointer"><input type="checkbox" class="tick" data-c="paytick" data-v="' + esc(key) + "|" + esc(m.from) + "|" + esc(m.to) + "|" + m.amount + '"' + (done ? " checked" : "") + (upcoming ? " disabled" : "") + '><span class="grow"><span class="what">' + esc(B.accName(d, m.to)) + '</span><span class="why">' + esc(m.why) + "</span></span>" + num(M(m.amount)) + "</label>";
    }).join("");
    var doneN = pd.moves.filter(function (m) { return d.moveKeys["pay:" + per.start + ":" + m.to]; }).length;
    html += card('<div class="row"><h2>Move from ' + esc(B.accName(d, pd.payAccount)) + '</h2><span class="small muted">' + (upcoming ? "On payday" : doneN + " of " + pd.moves.length + " done") + '</span></div><div class="list" style="margin-top:6px">' + (rows || '<p class="muted">Nothing to move.</p>') + "</div>" +
      '<div class="row" style="padding-top:10px;border-top:1px solid var(--line2);margin-top:4px"><span>Stays in ' + esc(B.accName(d, pd.payAccount)) + "</span>" + num(M(pd.keeps)) + "</div>");
    if (pd.already.length) html += '<div class="banner small">Less to move: ' + pd.already.map(function (a) { return M(a.amount) + " is already in your " + esc(a.name); }).join(", ") + ".</div>";
    if (pd.plan.shortfall > 0.004) html += card('<div class="bad" style="font-weight:700">This pay is ' + M(pd.plan.shortfall) + " short of the plan.</div><p class=\"small muted\">Lower a budget or saving for this month in Settings.</p>");
    return html;
  };
  function remainderName(pl) { return pl.remainderBudget ? pl.remainderBudget.name.replace(/ \(what's left\)/, "") : "savings"; }

  // ----- Pots
  SCREENS.pots = function () {
    var d = db(), list = B.pots(d, me(), todayIso()), tot = list.reduce(function (s, x) { return s + x.should; }, 0);
    var html = '<section class="hero card"><div class="small" style="opacity:.92">Should be across your account and ' + esc(potWord(true)) + '</div><div class="big">' + M(tot) + '</div><div class="small" style="opacity:.92">If your To do is done. Budgie works this out from your rules and what you\'ve logged; it never sees your bank.</div></section>';
    list.forEach(function (x) {
      var acc = d.byId[x.id] || {};
      html += '<button type="button" class="card li" style="display:block;padding:14px 16px;text-align:left" data-a="potcheck" data-v="' + esc(x.id) + '"><div class="row"><span style="font-weight:700">' + esc(x.name) + (x.fallback ? ' <span class="tiny muted">covers going over</span>' : "") + "</span>" + num(M(x.should)) + "</div>" +
        (acc.purpose ? '<div class="small muted">' + esc(acc.purpose) + "</div>" : "") + (Math.abs(x.pending) > 0.004 ? '<div class="small warn">Has about ' + M(x.now) + " now: see To do</div>" : "") + "</button>";
    });
    html += '<p class="small muted" style="margin:12px 4px">Tap a ' + esc(potWord()) + " if your " + esc(person().bank || "bank") + " app shows something different, and tell Budgie what it says.</p>";
    return html;
  };

  // ----- Bills (calendar + list)
  SCREENS.bills = function () {
    var d = db(), p = me(), now = todayIso(), y = +now.slice(0, 4), m = +now.slice(5, 7) - 1 + S.ui.calOff;
    var first = new Date(y, m, 1), Y = first.getFullYear(), Mo = first.getMonth(), cal = B.calendar(d, p, Y, Mo), dim = new Date(Y, Mo + 1, 0).getDate();
    var lead = (new Date(Y, Mo, 1).getDay() + 6) % 7, cells = "";
    for (var i = 0; i < lead; i++) cells += "<span></span>";
    for (var dd = 1; dd <= dim; dd++) {
      var iso = Y + "-" + String(Mo + 1).padStart(2, "0") + "-" + String(dd).padStart(2, "0"), items = cal[iso] || [];
      var cls = (iso === now ? "today " : "") + (items.length ? "has " : "") + (items.length && items.every(function (x) { return x.sign > 0; }) ? "in" : "");
      cells += '<button type="button" class="' + cls + '" data-a="calday" data-v="' + iso + '" aria-label="' + esc(B.nice(iso) + (items.length ? ", " + items.length + " things" : "")) + '">' + dd + (items.length ? "<i></i>" : "") + "</button>";
    }
    var monthName = first.toLocaleDateString("en-GB", {month: "long", year: "numeric"});
    var html = card('<div class="row" style="align-items:center"><button type="button" class="round" data-a="cal" data-v="-1" aria-label="Earlier month">' + icon("back", 18) + '</button><b>' + esc(monthName) + '</b><button type="button" class="round" data-a="cal" data-v="1" aria-label="Later month" style="transform:scaleX(-1)">' + icon("back", 18) + "</button></div>" +
      '<div class="cal">' + ["M", "T", "W", "T", "F", "S", "S"].map(function (x) { return '<span class="h">' + x + "</span>"; }).join("") + cells + '</div><p class="tiny muted" style="margin:8px 0 0">Tap a day to see what\'s due. Green dots are money coming in.</p>');
    var mine = d.bills.filter(function (b) { return b.person === p; }), subs = 0;
    mine.forEach(function (b) { if (/sub/i.test(b.category || "")) { B.occurrences(d, b, now, B.addDays(now, 365)).forEach(function (o) { subs += o.amount; }); } });
    var nextOf = function (it) { var o = B.occurrences(d, it, now, B.addDays(now, 400))[0]; return o ? B.nice(o.date) : "no more dates"; };
    html += '<div class="row" style="margin:16px 4px 4px"><h2 style="font-size:17px">Your bills</h2><span class="tiny muted">Tap one to change it</span></div>';
    html += card('<div class="list">' + mine.map(function (b) { return li(esc(b.name) + (b.split ? ' <span class="tiny muted">shared</span>' : ""), esc(B.describe(b)) + " · next " + esc(nextOf(b)), num(M(B.amountAt(d, b, now))), "edit", "bills:" + b.id); }).join("") + "</div>" +
      (subs ? '<div class="row" style="padding-top:10px;border-top:1px solid var(--line2);font-weight:700"><span>Subscriptions over a year</span>' + num(M0(subs)) + "</div>" : ""), "flush");
    html += '<button type="button" class="btn dash" data-a="new" data-v="bills">Add a bill</button>';
    var tr = d.transfers.filter(function (t) { return t.from === p; });
    if (tr.length) html += '<h2 class="h2">You pay ' + esc(person(partner()).name || "") + "</h2>" + card('<div class="list">' + tr.map(function (t) { return li(esc(t.name), esc(B.describe(t)) + " · next " + esc(nextOf(t)), num(M(B.amountAt(d, t, now))), "edit", "transfers:" + t.id); }).join("") + "</div>", "flush");
    return html;
  };

  // ----- Goals
  function goalCard(g) {
    var extra = "";
    if (g.kind === "emergency") { var ess = essentials(); if (ess) extra = '<div class="small muted">Three months of essentials would be about ' + M0(ess * 3) + ".</div>"; }
    return '<button type="button" class="card li" style="display:block;text-align:left;padding:16px" data-a="edit" data-v="goals:' + esc(g.id) + '"><div class="row"><span style="font-weight:700">' + esc(g.name) + "</span>" + num(g.pct + "%") + '</div><div style="margin:8px 0 6px">' + bar(g.pct) + '</div><div class="row small"><span class="num" style="font-weight:600">' + M0(g.saved) + " of " + M0(g.target) + '</span><span class="muted">' + (g.by ? "by " + esc(B.nice(g.by).replace(/^\w+ \d+ /, "")) + " " + esc(String(g.by).slice(0, 4)) : "") + "</span></div>" + extra + "</button>";
  }
  function essentials() {
    var d = db(), p = me(), per = B.periodAt(d, p, todayIso()), pl = B.planFor(d, p, per), t = 0;
    pl.lines.forEach(function (l) { if (l.kind === "bill" || (l.kind === "spend" && /food|fuel|travel/i.test(l.name))) t += l.amount; });
    return B.round(t);
  }
  SCREENS.goals = function () {
    var gs = B.goals(db(), me(), todayIso());
    return (gs.length ? gs.map(goalCard).join("") : '<p class="empty">No goals yet.</p>') + '<button type="button" class="btn dash" data-a="new" data-v="goals">Add a goal</button>';
  };

  // ----- LISA
  SCREENS.lisa = function () {
    var d = db(), now = todayIso(), accs = d.accounts.filter(function (a) { return a.kind === "lisa"; }), html = "";
    if (!accs.length) return '<p class="empty">Add your Lifetime ISA under Settings, ' + esc(cap(potWord(true))) + ' (kind: LISA).</p>';
    var mineFirst = accs.sort(function (a, b) { return (a.owner === me() ? 0 : 1) - (b.owner === me() ? 0 : 1); });
    var together = 0;
    mineFirst.forEach(function (a) {
      var L = B.lisa(d, a.id, now); together += L.balance;
      var vals = L.series.map(function (x) { return x.amount; }), whose = a.owner === me() ? "Your" : esc(person(a.owner).name) + "'s";
      html += card('<div class="small muted">' + whose + " Lifetime ISA</div>" + '<div class="row" style="align-items:center"><span style="font-size:32px;font-weight:800;font-family:var(--head)">' + M0(L.balance) + "</span>" + (a.owner === me() ? '<button type="button" class="btn ghost sm" data-a="potcheck" data-v="' + esc(a.id) + '">Update</button>' : "") + "</div>" +
        (vals.some(function (v) { return v; }) ? chart(vals, 320, 130, {label: "Balance over two years"}) + '<div class="row tiny muted"><span>2 years ago</span><span>Now</span></div>' : "") +
        '<div style="margin-top:12px"><div class="row small"><span style="font-weight:600">This tax year (6 Apr to 5 Apr)</span><span class="num">' + M0(L.paidThisYear) + " of £4,000</span></div>" + '<div style="margin-top:6px">' + bar(L.paidThisYear / 40) + '</div><div class="small muted" style="margin-top:4px">About ' + M(L.bonusThisYear) + " bonus · " + M0(L.allowanceLeft) + " left you can pay in</div></div>");
    });
    if (mineFirst.length > 1) html += card('<div class="row"><span style="font-weight:700">Together</span>' + num(M0(together)) + "</div>");
    html += '<div class="banner small"><b>The rules Budgie keeps an eye on.</b> Up to £4,000 a year, plus a 25% government bonus (up to £1,000). For a first home up to £450,000. Taking money out for anything else costs 25%. The government plans to replace the LISA with a new first-time-buyer account from April 2028; existing LISAs carry on for now.</div>';
    return html;
  };

  // ----- House
  SCREENS.house = function () {
    var d = db(), now = todayIso(), g = B.goals(d, me(), now).filter(function (x) { return x.kind === "house"; })[0], raw = g ? d.byId[g.id] : null, h = S.ui.house;
    if (!g) return '<p class="empty">Add a goal with the kind "House" to plan your first home.</p><button type="button" class="btn dash" data-a="new" data-v="goals">Add a house goal</button>';
    var price = h.price || +raw.price || 250000, depPct = h.dep || 0, rate = h.rate || 4.5, term = h.term || 30;
    var deposit = depPct ? price * depPct / 100 : Math.max(price * 0.05, g.target - 5000), fees = 5000, need = deposit + fees, borrow = Math.max(0, price - deposit);
    var r = rate / 1200, n = term * 12, monthly = r ? borrow * r / (1 - Math.pow(1 + r, -n)) : borrow / n;
    var monthlyIn = 0; d.budgets.forEach(function (b) { if (b.mode === "saving" && String(raw.accounts || "").indexOf(b.account) >= 0) monthlyIn += B.amountAt(d, b, now) * ((d.byId[b.account] || {}).kind === "lisa" ? 1.25 : 1); });
    var monthsTo = monthlyIn > 0 ? Math.max(0, Math.ceil((need - g.saved) / monthlyIn)) : null, ready = monthsTo !== null ? new Date(new Date().getFullYear(), new Date().getMonth() + monthsTo, 1).toLocaleDateString("en-GB", {month: "short", year: "numeric"}) : "";
    var ltv = Math.round(borrow / price * 100);
    var chips = function (list, cur, act, fmt) { return '<div class="chips" style="margin-top:6px">' + list.map(function (v) { return '<button type="button" class="chip" data-a="' + act + '" data-v="' + v + '" aria-pressed="' + (v === cur) + '">' + fmt(v) + "</button>"; }).join("") + "</div>"; };
    var html = card('<div class="small muted">Your first home' + (g.parts.length > 1 ? ", together" : "") + '</div><div style="font-size:24px;font-weight:800;font-family:var(--head)">' + (ready ? "Ready around " + esc(ready) : M0(g.saved) + " saved") + "</div>" +
      '<div style="margin:10px 0 6px">' + bar(need ? g.saved / need * 100 : 0) + '</div><div class="small">' + M0(g.saved) + " saved of " + M0(need) + " needed</div>" +
      (g.parts.length ? '<div class="small muted">' + g.parts.map(function (x) { return esc(x.owner === me() ? "Your " : person(x.owner).name + "'s ") + esc(x.name) + " " + M0(x.amount); }).join(" · ") + "</div>" : "") +
      (monthlyIn ? '<div class="small muted">Going in each month: about ' + M0(monthlyIn) + " including the LISA bonus</div>" : ""));
    html += card("<h2>Try the numbers</h2>" + '<div class="small muted" style="margin-top:8px">House price</div>' + chips([200000, 250000, 300000, 350000], price, "hprice", function (v) { return "£" + v / 1000 + "k"; }) +
      '<div class="small muted" style="margin-top:12px">Deposit</div>' + chips([0, 10, 15, 25, 40], depPct, "hdep", function (v) { return v ? v + "%" : "Your goal"; }) +
      '<div class="two"><label class="f">Interest rate %<input type="number" step="0.1" inputmode="decimal" data-c="hrate" value="' + rate + '"></label><label class="f">Years<input type="number" inputmode="numeric" data-c="hterm" value="' + term + '"></label></div>' +
      '<div class="list" style="margin-top:10px">' + li("Deposit", Math.round(deposit / price * 100) + "% of the price", num(M0(deposit))) + li("Fees and moving", "Survey, solicitor, moving van", num(M0(fees))) + li("You need", "", num(M0(need))) +
      li("You borrow", ltv + "% loan to value" + (ltv <= 60 ? ": the cheapest rates" : ltv <= 75 ? ": good rates" : ltv <= 85 ? "" : ": fewer, pricier deals"), num(M0(borrow))) + li("Mortgage each month", rate + "% over " + term + " years", num(M0(monthly))) +
      li("Can you use your LISA?", price <= 450000 ? "Yes: the home is under £450,000" : "No: LISAs only work for homes up to £450,000", num(price <= 450000 ? "Yes" : "No", price <= 450000 ? "good" : "bad")) + "</div>" +
      '<p class="tiny muted" style="margin:10px 0 0">Estimates only. A mortgage broker will give you the real figures.</p>');
    html += '<div class="banner small"><b>Once you have a mortgage</b>, this becomes a mortgage tracker: balance left, overpayments, when your fixed rate ends, and how much of the house you own.</div>';
    return html;
  };

  // ----- Net worth
  SCREENS.networth = function () {
    var d = db(), p = me(), now = todayIso(), nw = B.netWorth(d, p, now), vals = [];
    for (var i = 11; i >= 0; i--) { var dt = new Date(); dt.setMonth(dt.getMonth() - i, 1); var iso = i ? dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0") + "-01" : now; if (iso >= B.startOf(d, p)) vals.push(B.netWorth(d, p, iso).total); }
    var own = nw.rows.filter(function (r) { return !r.owe; }), owe = nw.rows.filter(function (r) { return r.owe; });
    return card('<div class="small muted">Everything you own, minus what you owe</div><div style="font-size:34px;font-weight:800;font-family:var(--head)">' + M0(nw.total) + "</div>" + (vals.length > 1 ? chart(vals, 320, 110, {label: "Net worth over the year"}) : "")) +
      card('<div class="row"><h2>You own</h2>' + num(M0(nw.own)) + '</div><div class="list" style="margin-top:6px">' + own.map(function (r) { return li(esc(r.name), "", num(M0(r.amount))); }).join("") + "</div>") +
      (owe.length ? card('<div class="row"><h2>You owe</h2>' + num(M0(nw.owe)) + '</div><div class="list" style="margin-top:6px">' + owe.map(function (r) { return li(esc(r.name), "", num(M0(-r.amount))); }).join("") + "</div>") : "");
  };

  // ----- Debts
  SCREENS.debts = function () {
    var d = db(), p = me(), now = todayIso(), html = "", ls = B.loans(d, p, now);
    ls.forEach(function (l) {
      var who = l.lender === p ? esc(person(l.borrower).name) + " owes you" : "You owe " + esc(person(l.lender).name);
      html += '<button type="button" class="card li" style="display:block;text-align:left;padding:16px" data-a="edit" data-v="loans:' + esc(l.id) + '"><div class="row"><span style="font-weight:700">' + esc(l.name) + "</span>" + num(M(l.left)) + '</div><div class="small muted">' + who + " · " + M(l.paid) + " paid so far</div>" + '<div style="margin:8px 0">' + bar(l.pct) + "</div>" +
        l.plan.slice(0, 4).map(function (r) { return '<div class="row small" style="padding:4px 0"><span>' + esc(B.nice(r.date)) + "</span>" + num(M(r.amount)) + "</div>"; }).join("") + "</button>";
    });
    B.accountsOf(d, p).filter(function (a) { return a.kind === "credit"; }).forEach(function (a) { var v = B.balances(d, now)[a.id] || 0; html += card('<div class="row"><span style="font-weight:700">' + esc(a.name) + "</span>" + num(M(-v)) + '</div><div class="small muted">' + esc(a.purpose || "") + "</div>"); });
    return (html || '<p class="empty">No debts or IOUs. Nice.</p>') + '<button type="button" class="btn dash" data-a="new" data-v="loans">Add money owed between you</button>';
  };

  // ----- Insights
  SCREENS.insights = function () {
    var d = db(), p = me(), now = todayIso(), per = B.periodAt(d, p, now), pers = [per], html = "";
    for (var i = 0; i < 5; i++) { var pv = B.prevPeriod(d, p, pers[0]); if (!pv || pv.start >= pers[0].start || pv.next <= B.startOf(d, p)) break; pers.unshift(pv); }
    var buds = d.budgets.filter(function (b) { return b.person === p && b.mode !== "saving"; });
    var focus = buds.filter(function (b) { return /food/i.test(b.name); })[0] || buds[0];
    if (focus) {
      var vals = pers.map(function (pk) { var s = B.budgetState(d, p, pk)[focus.id]; return s ? s.spent : 0; }), max = Math.max.apply(null, vals.concat([1]));
      html += card("<h2>" + esc(focus.name) + ' each month</h2><div class="bars" style="height:150px">' + vals.map(function (v, i) { return '<div><span class="num" style="font-size:11px">' + M0(v) + '</span><i class="' + (i === vals.length - 1 ? "" : "plan") + '" style="height:' + Math.max(2, Math.round(v / max * 100)) + 'px"></i><span>' + esc(pers[i].name.slice(0, 3)) + "</span></div>"; }).join("") + "</div>");
    }
    var tips = [];
    var st = B.budgetState(d, p, per), dayNo = B.diff(per.start, now) + 1, days = B.diff(per.start, per.next);
    buds.forEach(function (b) {
      var s = st[b.id]; if (!s || !s.avail) return;
      var prev = pers.slice(0, -1).map(function (pk) { var x = B.budgetState(d, p, pk)[b.id]; return x ? x.spent : 0; }).filter(function (v) { return v > 0; });
      var avg = prev.length ? prev.reduce(function (a, c) { return a + c; }, 0) / prev.length : 0, proj = s.spent / Math.max(1, dayNo) * days;
      if (avg && proj > avg * 1.15 && s.spent > 20) tips.push({t: esc(b.name.replace(/ \(what's left\)/, "")) + " is running high", d: "On course for about " + M0(proj) + " this month; your usual is " + M0(avg) + "."});
      else if (avg && proj < avg * 0.85 && dayNo > 7) tips.push({t: esc(b.name.replace(/ \(what's left\)/, "")) + " is lower than usual", d: "On course for about " + M0(proj) + " against your usual " + M0(avg) + ". Nice."});
    });
    var spentDays = {}; d.transactions.forEach(function (x) { if (x.person === p && x.date >= per.start && x.date <= now) spentDays[x.date] = 1; });
    var noSpend = Math.max(0, dayNo - Object.keys(spentDays).length);
    tips.push({t: noSpend + " no-spend day" + (noSpend === 1 ? "" : "s") + " this month", d: "Days you didn't log any spending."});
    var subs = 0, subNames = []; d.bills.forEach(function (b) { if (b.person === p && /sub/i.test(b.category || "")) { var y = 0; B.occurrences(d, b, now, B.addDays(now, 365)).forEach(function (o) { y += o.amount; }); subs += y; subNames.push([b.name, y]); } });
    if (subs) { subNames.sort(function (a, b) { return b[1] - a[1]; }); tips.push({t: "Subscriptions cost " + M0(subs) + " a year", d: esc(subNames[0][0]) + " is the biggest at " + M0(subNames[0][1]) + "."}); }
    var pl = B.planFor(d, p, per); if (pl.totals.in) tips.push({t: "You're saving " + Math.round(pl.totals.save / pl.totals.in * 100) + "% of what comes in", d: M0(pl.totals.save) + " this month."});
    html += tips.map(function (x) { return card('<div style="font-weight:700">' + x.t + '</div><div class="small muted">' + x.d + "</div>"); }).join("");
    return html;
  };

  // ----- Gifts
  SCREENS.gifts = function () {
    var d = db(), gs = (tables().gifts || []).filter(function (g) { return g.person === me() && !g.deleted; }), by = {}, html = "";
    gs.forEach(function (g) { (by[g.occasion || "Other"] = by[g.occasion || "Other"] || []).push(g); });
    Object.keys(by).forEach(function (occ) {
      var list = by[occ], plan = 0, spent = 0; list.forEach(function (g) { plan += +g.limit || 0; if (g.bought === true || g.bought === "TRUE" || g.bought === "true") spent += +g.cost || +g.limit || 0; });
      html += '<h2 class="h2">' + esc(occ) + ' <span class="small muted" style="font-weight:500">' + M0(spent) + " of " + M0(plan) + "</span></h2>" + card('<div class="list">' + list.map(function (g) { var bought = g.bought === true || /^true$/i.test(String(g.bought)); return li(esc(g.name) + (bought ? ' <span class="tiny good">bought</span>' : ""), esc(g.idea || "") + (g.date ? " · " + esc(B.nice(B.parseDate(g.date))) : ""), num(M0(bought ? (+g.cost || +g.limit || 0) : (+g.limit || 0))), "edit", "gifts:" + g.id); }).join("") + "</div>", "flush");
    });
    return (html || '<p class="empty">No gift ideas yet. Only you can see your list, so surprises stay surprises.</p>') + '<button type="button" class="btn dash" data-a="new" data-v="gifts">Add a gift idea</button>';
  };

  // ----- Settings
  SCREENS.settings = function () {
    var w = cap(potWord(true)), groups = [
      ["You", [["list:income", "Pay and money coming in", "Paydays, pay rises, one-offs"], ["account", "Your account", (person().name || "") + " · " + (person().bank || "")]]],
      ["Your money", [["bills", "Bills and subscriptions", "Add, change or stop a bill"], ["list:budgets", "Budgets", "Food, fun and the rest"], ["list:accounts", w, "What each one is for"], ["goals", "Goals", "House, car, holidays"], ["gifts", "Gifts", "Ideas and spending"]]],
      ["Together", [["sharing", "Partner and sharing", "What " + (person(partner()).name || "your partner") + " can see"], ["list:splits", "How you split things", "For example 2 parts to 1"], ["list:transfers", "Regular payments to " + (person(partner()).name || "partner"), "Like your rent share"], ["debts", "Money owed between you", "Furniture and the like"]]],
      ["App", [["themes", "Themes", themeLabel()], ["toggle:easy", "Easy read", isEasy() ? "On: simpler screens in an easy-to-read font" : "Simpler screens in an easy-to-read font"], ["toggle:hide", "Hide amounts", S.prefs.hide ? "On: tap the eye to peek" : "Cover numbers with £••••"], ["toggle:demo", "Show and tell", demoOn() ? "On: sample data" : "Show the app off with made-up money"], ["sync", "Google Sheet and sync", demoOn() ? "Not used in Show and tell" : syncLabel()], ["importcsv", "Import a bank statement", "Add payments from a CSV file"]]]
    ];
    return groups.map(function (g) {
      return '<div class="secthead">' + esc(g[0]) + "</div>" + card('<div class="list">' + g[1].map(function (it) {
        if (/^toggle:/.test(it[0])) { var k = it[0].slice(7), on = k === "easy" ? isEasy() : k === "hide" ? S.prefs.hide : demoOn(); return '<label class="li check" style="padding:12px 0"><span class="grow"><span class="what">' + esc(it[1]) + '</span><span class="why">' + esc(it[2]) + '</span></span><input type="checkbox" data-c="toggle" data-v="' + k + '"' + (on ? " checked" : "") + "></label>"; }
        return li(esc(it[1]), esc(it[2]), "", "go", it[0]);
      }).join("") + "</div>", "flush");
    }).join("") + '<p class="tiny muted" style="text-align:center;margin:18px 0">Budgie ' + APP_VERSION + " · engine " + B.VERSION + " · Google Calendar coming soon</p>";
  };
  function themeLabel() { var sp = TH.SPECIAL[S.prefs.special]; return sp ? sp.name : (S.prefs.mode === "dark" ? "Dark" : S.prefs.mode === "light" ? "Light" : "Matches your phone") + ", " + ((TH.COLOURS[S.prefs.colour] || {}).name || "standard colour"); }
  function syncLabel() { return S.lastError ? "Not synced: " + S.lastError : S.lastSync ? "Synced " + ago(S.lastSync) : "Connected"; }
  function ago(t) { var s = Math.round((Date.now() - t) / 1000); return s < 60 ? "just now" : s < 3600 ? Math.round(s / 60) + " min ago" : Math.round(s / 3600) + " h ago"; }

  SCREENS.themes = function () {
    var p = S.prefs, html = card('<h2>Light or dark</h2><div class="seg" style="margin-top:10px" role="group">' + [["light", "Light"], ["dark", "Dark"], ["system", "Match phone"]].map(function (m) { return '<button type="button" data-a="tmode" data-v="' + m[0] + '" aria-pressed="' + (p.mode === m[0] && !p.special) + '">' + m[1] + "</button>"; }).join("") + "</div>" +
      '<h2 style="margin-top:16px">Colour</h2><div class="swatches">' + Object.keys(TH.COLOURS).map(function (k) { var c = TH.COLOURS[k]; return '<button type="button" data-a="tcolour" data-v="' + k + '" aria-label="' + c.name + '" aria-pressed="' + (p.colour === k && !p.special) + '" style="background:' + c.light + '"></button>'; }).join("") + "</div>");
    html += '<h2 class="h2">Special themes</h2>' + Object.keys(TH.SPECIAL).map(function (k) { var t = TH.SPECIAL[k]; return '<button type="button" class="theme-card" data-a="tspecial" data-v="' + k + '" aria-pressed="' + (p.special === k) + '"><span class="sw" style="background:' + t.vars.hero + ";border:3px solid " + t.vars.accent + '"></span><span class="grow"><span class="what" style="font-family:' + t.vars.head + '">' + esc(t.name) + '</span><span class="why">' + esc(t.note) + "</span></span></button>"; }).join("") +
      (p.special ? '<button type="button" class="btn ghost wide" style="margin-top:10px" data-a="tspecial" data-v="">Back to the standard look</button>' : "");
    html += card('<h2>Text size</h2><div class="seg" style="margin-top:10px">' + [["small", "Small"], ["normal", "Normal"], ["large", "Large"], ["larger", "Larger"]].map(function (s) { return '<button type="button" data-a="tsize" data-v="' + s[0] + '" aria-pressed="' + ((p.size || "normal") === s[0]) + '">' + s[1] + "</button>"; }).join("") + "</div>" +
      '<label class="li check" style="margin-top:6px"><span class="grow"><span class="what">Easy read</span><span class="why">The Lexend font, simpler screens, fewer extra numbers</span></span><input type="checkbox" data-c="toggle" data-v="easy"' + (isEasy() ? " checked" : "") + "></label>");
    return html;
  };

  SCREENS.sharing = function () {
    var keys = [["totals", "How much is left", "Your can-spend-today and what you're saving"], ["cats", "Your budgets", "Food, fun and the rest, against plan"], ["goals", "Your own goals", "Progress on goals that are just yours"], ["payments", "Each payment", "Every item you log, with notes"]];
    return '<p class="small muted" style="margin:0 4px 10px">Shared bills, split payments, money between you and joint goals are always shared. Gift lists never are.</p>' + card('<div class="list">' + keys.map(function (k) {
      var on = /^(true|yes|on|1)$/i.test(String(getSetting("share." + k[0], k[0] === "payments" ? "false" : "true")));
      return '<label class="li check"><span class="grow"><span class="what">' + k[1] + '</span><span class="why">' + k[2] + '</span></span><input type="checkbox" data-c="share" data-v="' + k[0] + '"' + (on ? " checked" : "") + "></label>";
    }).join("") + "</div>", "flush");
  };

  SCREENS.sync = function () {
    if (demoOn()) return card("<p>Show and tell is on, so nothing is synced. Turn it off in Settings to go back to your own data.</p>");
    var c = S.cfg || {};
    return card('<div class="list">' + li("Status", esc(syncLabel()), "") + li("Waiting to sync", S.data.queue.length + " change" + (S.data.queue.length === 1 ? "" : "s"), "") + li("Signed in as", esc(person().name || "?"), "") + "</div>" +
      '<div class="two" style="margin-top:10px"><button type="button" class="btn" data-a="syncnow">Sync now</button><button type="button" class="btn ghost" data-a="syncfull">Full refresh</button></div>') +
      '<div class="banner small">Your data lives in the <b>Budgie data</b> Google Sheet. Each tab is a table you can read, sort or back up. Your budget tab fills itself in. This phone keeps a copy so the app works offline.</div>' +
      card('<h2>Move to another phone</h2><p class="small muted">Open your connect link on the new phone. Keep it private: it lets anyone with it see your budget.</p><button type="button" class="btn danger sm" data-a="disconnect">Disconnect this phone</button>');
  };

  SCREENS.account = function () {
    var p = person();
    return card('<div class="list">' + li("Name", esc(p.name), "") + li("Bank", esc(p.bank || ""), "") + li("Calls them", esc(cap(potWord(true))), "") + li("Partner", esc(person(partner()).name || "None"), "") + "</div>") + '<p class="small muted" style="margin:10px 4px">Change these on the people tab of your Google Sheet.</p>';
  };

  // ----- generic lists and editors
  var LISTS = {
    income: {title: "Pay and money coming in", filter: function (r) { return r.person === me(); }, row: function (r) { return [r.name + (r.isPay ? " (payday)" : ""), B.describe(r), M(B.amountAt(db(), r, todayIso()))]; }, add: "Add money coming in"},
    budgets: {title: "Budgets", filter: function (r) { return r.person === me(); }, row: function (r) { return [r.name, ({daily: "Builds up each day", weekly: "Paced week by week", oneoff: "For one-offs", saving: "Saved on payday", remainder: "Gets whatever is left"})[r.mode || "daily"] + " · " + B.accName(db(), r.account), r.mode === "remainder" ? "What's left" : M(B.amountAt(db(), r, todayIso()))]; }, add: "Add a budget"},
    accounts: {title: "Accounts and " + "pots", filter: function (r) { return r.owner === me(); }, row: function (r) { return [r.name + (r.fallback ? " (covers going over)" : ""), ({main: "Main account", pot: "Pot or Space", saving: "Savings", isa: "ISA", lisa: "Lifetime ISA", pension: "Pension", credit: "Credit or overdraft"})[r.kind || "pot"] + (r.purpose ? " · " + r.purpose : ""), ""]; }, add: "Add an account"},
    splits: {title: "How you split things", filter: function () { return true; }, row: function (r) { return [r.name, describeShares(r.shares), ""]; }, add: "Add a split"},
    transfers: {title: "Regular payments", filter: function (r) { return r.from === me(); }, row: function (r) { return [r.name, B.describe(r) + " · to " + person(r.to).name, M(B.amountAt(db(), r, todayIso()))]; }, add: "Add a regular payment"}
  };
  function describeShares(s) {
    var d = db(), names = function (id) { return person(id).name || id; }, txt = String(s || "");
    var fixed = txt.match(/([a-z]+)\s*=\s*([\d.]+)/i); if (fixed) return names(fixed[1].toLowerCase()) + " pays " + B.money(+fixed[2]) + ", the rest by the other";
    var parts = []; txt.replace(/([a-z]+)\s*:\s*([\d.]+)/gi, function (_, a, b) { parts.push(names(a.toLowerCase()) + " " + b); }); return parts.length ? parts.join(" : ") + " parts" : "Half each";
  }
  SCREENS.list = function (p) {
    var L = LISTS[p.table], rows = (db()[p.table] || []).filter(L.filter);
    S.view.p.title = L.title.replace("pots", potWord(true));
    return card('<div class="list">' + (rows.length ? rows.map(function (r) { var x = L.row(r); return li(esc(x[0]), esc(x[1]), x[2] ? num(x[2]) : "", "edit", p.table + ":" + r.id); }).join("") : '<p class="muted">Nothing here yet.</p>') + "</div>", "flush") + '<button type="button" class="btn dash" data-a="new" data-v="' + p.table + '">' + esc(L.add) + "</button>";
  };

  var SCHED = function () { return [{k: "unit", t: "how"}, {k: "start", t: "date", l: "Starts (or the first date)"}, {k: "end", t: "date", l: "Ends (leave empty for never)"}]; };
  var FORMS = {
    bills: {title: "Bill", fields: function () { return [{k: "name", t: "text", l: "Name"}, {k: "amount", t: "money", l: "Amount"}].concat(SCHED()).concat([{k: "account", t: "account", l: "Comes out of"}, {k: "category", t: "select", l: "Type", o: [["home", "Home and flat bills"], ["subscription", "Subscription"], ["phone", "Phone"], ["car", "Car"], ["health", "Health"], ["work", "Work and fees"], ["insurance", "Insurance"], ["other", "Other"]]}, {k: "split", t: "split", l: "Shared with your partner?"}, {k: "variable", t: "check", l: "The amount changes each time (like energy)"}, {k: "notes", t: "text", l: "Notes"}]); }, owner: "person"},
    income: {title: "Money coming in", fields: function () { return [{k: "name", t: "text", l: "Name"}, {k: "amount", t: "money", l: "Amount (after tax)"}].concat(SCHED()).concat([{k: "account", t: "account", l: "Goes into"}, {k: "isPay", t: "check", l: "This is my pay (it sets my pay periods)"}, {k: "notes", t: "text", l: "Notes"}]); }, owner: "person"},
    budgets: {title: "Budget", fields: function () { return [{k: "name", t: "text", l: "Name"}, {k: "amount", t: "money", l: "Amount each pay period (leave empty for whatever is left)"}, {k: "mode", t: "select", l: "How it works", o: [["daily", "Day to day: builds up each day"], ["weekly", "Weekly: paced week by week (good for food shops)"], ["oneoff", "One-offs: no daily pace"], ["saving", "Saving: moved on payday"], ["remainder", "Whatever is left after everything else"]]}, {k: "account", t: "account", l: "Kept in", all: true}, {k: "carry", t: "check", l: "Carry anything unspent into next month"}, {k: "start", t: "date", l: "Starts (optional)"}, {k: "end", t: "date", l: "Ends (optional)"}]; }, owner: "person"},
    accounts: {title: "Account", fields: function () { return [{k: "name", t: "text", l: "Name"}, {k: "kind", t: "select", l: "Kind", o: [["main", "Main account"], ["pot", "Pot or Space"], ["saving", "Savings pot"], ["isa", "ISA"], ["lisa", "Lifetime ISA"], ["pension", "Pension"], ["credit", "Credit card, Flex or overdraft"]]}, {k: "purpose", t: "text", l: "What it's for"}, {k: "fallback", t: "check", l: "Covers going over budget (only one should)"}, {k: "order", t: "number", l: "Order on screen"}]; }, owner: "owner"},
    goals: {title: "Goal", fields: function () { return [{k: "name", t: "text", l: "Name"}, {k: "target", t: "money", l: "Target"}, {k: "due", t: "date", l: "Target date (optional)"}, {k: "kind", t: "select", l: "Kind", o: [["savings", "Saving for something"], ["house", "House deposit"], ["emergency", "Emergency fund"], ["car", "Car"], ["holiday", "Holiday"], ["other", "Other"]]}, {k: "accounts", t: "accounts", l: "Which accounts count towards it"}, {k: "extra", t: "money", l: "Plus money kept elsewhere (optional)"}, {k: "owners", t: "owners", l: "Whose goal"}, {k: "price", t: "money", l: "House price you're aiming for (house goals)"}, {k: "notes", t: "text", l: "Notes"}]; }, owner: "owners"},
    splits: {title: "Split", fields: function () { return [{k: "name", t: "text", l: "Name (for example Flat bills)"}, {k: "shares", t: "shares", l: "How it's shared"}]; }, owner: null},
    transfers: {title: "Regular payment", fields: function () { return [{k: "name", t: "text", l: "Name (for example Rent share)"}, {k: "amount", t: "money", l: "Amount"}].concat(SCHED()).concat([{k: "fromAccount", t: "account", l: "From your"}, {k: "toAccount", t: "account", l: "Into their", owner: partner()}, {k: "notes", t: "text", l: "Notes"}]); }, owner: "from"},
    loans: {title: "Money owed", fields: function () { return [{k: "name", t: "text", l: "What for"}, {k: "amount", t: "money", l: "Total"}, {k: "direction", t: "select", l: "Who owes who", o: [["in", person(partner()).name + " owes me"], ["out", "I owe " + person(partner()).name]]}, {k: "date", t: "date", l: "Date"}, {k: "account", t: "account", l: "Paid from (optional)"}, {k: "repay", t: "money", l: "Paid back each month"}, {k: "repayFrom", t: "date", l: "First repayment"}, {k: "repayDay", t: "number", l: "Day of the month"}, {k: "notes", t: "text", l: "Notes"}]; }, owner: "loan"},
    gifts: {title: "Gift", fields: function () { return [{k: "name", t: "text", l: "Who for"}, {k: "idea", t: "text", l: "Idea"}, {k: "occasion", t: "text", l: "Occasion (for example Christmas)"}, {k: "date", t: "date", l: "When"}, {k: "limit", t: "money", l: "Spend up to"}, {k: "bought", t: "check", l: "Bought"}, {k: "cost", t: "money", l: "What it cost"}, {k: "notes", t: "text", l: "Notes"}]; }, owner: "person"}
  };
  var EDIT = {};
  function openEditor(table, id) {
    var row = id ? Object.assign({}, (db()[table] || []).filter(function (r) { return r.id === id; })[0] || (tables()[table] || []).filter(function (r) { return r.id === id; })[0] || {}) : {};
    if (table === "loans" && row.id) row.direction = row.lender === me() ? "in" : "out";
    EDIT = {table: table, id: id, row: row, orig: JSON.parse(JSON.stringify(row))};
    go("edit", {title: (id ? "Change " : "New ") + FORMS[table].title.toLowerCase()});
  }
  SCREENS.edit = function () {
    var F = FORMS[EDIT.table], r = EDIT.row, html = "";
    F.fields().forEach(function (f) { html += field(f, r); });
    var canStop = EDIT.id && /bills|income|transfers|budgets/.test(EDIT.table);
    html += '<button type="button" class="btn wide" style="margin-top:18px" data-a="editsave">Save</button>';
    if (EDIT.id) html += '<div class="two" style="margin-top:10px">' + (canStop ? '<button type="button" class="btn line" data-a="editstop">Stop from today</button>' : "") + '<button type="button" class="btn danger" data-a="editdelete">Delete</button></div>';
    return card(html);
  };
  function field(f, r) {
    var v = r[f.k] === undefined || r[f.k] === null ? "" : r[f.k], id = "fe-" + f.k, L = '<label class="f" for="' + id + '">' + esc(f.l || "") + "</label>";
    var input = function (type, extra) { return '<label class="f">' + esc(f.l) + '<input id="' + id + '" type="' + type + '" data-f="' + f.k + '" value="' + esc(v) + '"' + (extra || "") + "></label>"; };
    switch (f.t) {
      case "text": return input("text");
      case "number": return input("number", ' inputmode="numeric"');
      case "money": return input("text", ' inputmode="decimal" placeholder="£"');
      case "date": return input("date");
      case "check": return '<label class="check"><input type="checkbox" data-f="' + f.k + '"' + (v === true || /^true$/i.test(String(v)) ? " checked" : "") + ">" + esc(f.l) + "</label>";
      case "select": return '<label class="f">' + esc(f.l) + '<select data-f="' + f.k + '">' + f.o.map(function (o) { return '<option value="' + o[0] + '"' + (String(v || f.o[0][0]) === o[0] ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select></label>";
      case "account": return '<label class="f">' + esc(f.l) + '<select data-f="' + f.k + '"><option value="">Main account</option>' + accOptions(v, f.owner || me(), f.all ? null : /main|pot|saving|credit|isa|lisa|pension/) + "</select></label>";
      case "accounts": var sel = String(v).split(/[,\s]+/); return '<div class="f" style="font-size:13px;font-weight:600;color:var(--muted);margin-top:12px">' + esc(f.l) + "</div>" + db().accounts.map(function (a) { return '<label class="check" style="padding:6px 0"><input type="checkbox" data-fm="' + f.k + '" value="' + esc(a.id) + '"' + (sel.indexOf(a.id) >= 0 ? " checked" : "") + ">" + esc((a.owner === me() ? "" : person(a.owner).name + "'s ") + a.name) + "</label>"; }).join("");
      case "owners": var both = String(v || me()).split(/[,\s]+/).filter(Boolean).length > 1; return '<label class="f">' + esc(f.l) + '<select data-f="owners"><option value="' + me() + '">Just mine</option><option value="' + me() + ", " + partner() + '"' + (both ? " selected" : "") + ">Ours together</option></select></label>";
      case "split": return '<label class="f">' + esc(f.l) + '<select data-f="split"><option value="">No, it\'s just mine</option>' + db().splits.map(function (s) { return '<option value="' + esc(s.id) + '"' + (v === s.id ? " selected" : "") + ">" + esc(s.name + ": " + describeShares(s.shares)) + "</option>"; }).join("") + "</select></label>";
      case "shares":
        var ppl = db().people, fixed = /=/.test(v), vals = {}; String(v).replace(/([a-z]+)\s*[:=]\s*([\d.]+)/gi, function (_, a, b) { vals[a.toLowerCase()] = b; });
        return '<label class="f">How<select data-sh="mode"><option value="parts">In parts (for example 2 to 1)</option><option value="fixed"' + (fixed ? " selected" : "") + ">One of you pays a fixed amount</option></select></label>" +
          '<div class="two">' + ppl.map(function (x) { return '<label class="f">' + esc(x.name) + '<input type="text" inputmode="decimal" data-sh="' + esc(x.id) + '" value="' + esc(vals[x.id] || "") + '" placeholder="' + (fixed ? "£ or empty" : "parts") + '"></label>'; }).join("") + "</div>";
      case "how":
        var unit = r.unit || "month", every = +r.every || 1, how = unit === "month" && every === 3 ? "quarter" : unit === "week" ? "week" : unit;
        var days = ""; for (var i = 1; i <= 31; i++) days += '<option value="' + i + '"' + (String(r.on) === String(i) ? " selected" : "") + ">" + ordinal(i) + "</option>";
        var specials = ["last", "last working day", "first working day", "last friday", "last thursday", "first monday"].map(function (o) { return '<option value="' + o + '"' + (String(r.on).toLowerCase() === o ? " selected" : "") + ">The " + o + "</option>"; }).join("");
        return '<label class="f">How often<select data-f="how"><option value="month"' + (how === "month" ? " selected" : "") + '>Every month</option><option value="quarter"' + (how === "quarter" ? " selected" : "") + '>Every 3 months</option><option value="week"' + (how === "week" ? " selected" : "") + '>Every few weeks</option><option value="year"' + (how === "year" ? " selected" : "") + '>Every year</option><option value="once"' + (how === "once" ? " selected" : "") + '>Just once</option><option value="dates"' + (how === "dates" ? " selected" : "") + ">On set dates</option></select></label>" +
          (how === "month" || how === "quarter" ? '<label class="f">On<select data-f="on">' + days + specials + "</select></label>" : "") +
          (how === "week" ? '<label class="f">Every how many weeks<input type="number" inputmode="numeric" data-f="every" value="' + every + '"></label>' : "") +
          (how === "dates" ? '<label class="f">Dates (one per line)<textarea data-f="dates">' + esc(String(r.dates || "").split(/[,;]\s*/).join("\n")) + "</textarea></label>" : "") +
          (how !== "dates" && how !== "once" ? '<label class="f">If it lands on a weekend or bank holiday<select data-f="shift"><option value="">It stays on that day</option><option value="next working day"' + (/next/.test(r.shift || "") ? " selected" : "") + '>It moves to the next working day</option><option value="previous working day"' + (/prev/.test(r.shift || "") ? " selected" : "") + ">It moves to the working day before</option></select></label>" : "");
    }
    return "";
  }
  function ordinal(n) { return n + (n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"); }
  function readForm() {
    var r = EDIT.row, root = $("#main");
    root.querySelectorAll("[data-f]").forEach(function (el) {
      var k = el.dataset.f, v = el.type === "checkbox" ? el.checked : el.value;
      if (k === "how") { r.unit = v === "quarter" ? "month" : v; if (v === "quarter") r.every = 3; else if (v !== "week") r.every = ""; return; }
      if (k === "dates") v = v.split(/\n+/).map(function (x) { return B.parseDate(x.trim()) || x.trim(); }).filter(Boolean).join(", ");
      r[k] = v;
    });
    var multi = {}; root.querySelectorAll("[data-fm]").forEach(function (el) { multi[el.dataset.fm] = multi[el.dataset.fm] || []; if (el.checked) multi[el.dataset.fm].push(el.value); });
    Object.keys(multi).forEach(function (k) { r[k] = multi[k].join(", "); });
    var sh = root.querySelector('[data-sh="mode"]');
    if (sh) { var fixed = sh.value === "fixed", bits = []; root.querySelectorAll("[data-sh]").forEach(function (el) { if (el.dataset.sh !== "mode" && el.value.trim()) bits.push(el.dataset.sh + (fixed ? "=" : ":") + el.value.trim().replace(/[£,]/g, "")); }); r.shares = bits.join(", "); }
    ["amount", "target", "extra", "limit", "cost", "repay", "price"].forEach(function (k) { if (r[k] !== undefined && r[k] !== "") r[k] = +String(r[k]).replace(/[£,\s]/g, "") || 0; });
    return r;
  }
  function saveEditor() {
    var t = EDIT.table, r = readForm(), F = FORMS[t], now = todayIso();
    if (!r.name && t !== "splits") { toast("Give it a name first"); return; }
    if (!EDIT.id) r.id = newId(t.slice(0, 3));
    if (F.owner === "person") r.person = r.person || me();
    if (F.owner === "owner") r.owner = r.owner || me();
    if (F.owner === "owners") r.owners = r.owners || me();
    if (F.owner === "from") { r.from = me(); r.to = partner(); }
    if (t === "loans") { if (r.direction === "out") { r.lender = partner(); r.borrower = me(); } else { r.lender = me(); r.borrower = partner(); } delete r.direction; }
    if (/bills|income|transfers/.test(t) && !r.start) r.start = now;
    if (/bills|income|transfers/.test(t) && !r.on && r.unit === "month") r.on = String(+r.start.slice(8, 10));
    // a new amount on something that's been running: keep history, change from today
    var amountChanged = EDIT.id && /bills|income|transfers|budgets/.test(t) && +EDIT.orig.amount !== +r.amount && EDIT.orig.amount !== "" && (EDIT.orig.start || "2000-01-01") < now;
    var finish = function (fromToday) {
      if (fromToday) { var newAmt = r.amount; r.amount = EDIT.orig.amount; put("amounts", {id: newId("amt"), item: r.id, start: now, amount: newAmt}, true); }
      put(t, r, true); toast("Saved" + (fromToday ? ": the new amount counts from today" : "")); back();
    };
    if (amountChanged) {
      openSheet('<h2>From when?</h2><p class="muted">You changed it from ' + B.money(EDIT.orig.amount) + " to " + B.money(r.amount) + '.</p><button type="button" class="btn wide" data-a="amtwhen" data-v="today">From today (earlier months keep ' + B.money(EDIT.orig.amount) + ')</button><button type="button" class="btn ghost wide" style="margin-top:10px" data-a="amtwhen" data-v="always">Always (it was a mistake)</button>');
      S.ui.amtFinish = finish; return;
    }
    finish(false);
  }

  // ----- import a bank statement
  SCREENS.importcsv = function () {
    var im = S.ui.imp, html = card('<p class="small muted" style="margin-top:0">Export a CSV from your ' + esc(person().bank || "bank") + ' app, then choose it here. Budgie skips anything you\'ve already logged and any bill it already knows about.</p><label class="f">CSV file<input type="file" accept=".csv,text/csv" data-c="csvfile"></label><label class="f">Which account is it from<select data-c="csvacc">' + accOptions((im && im.account) || B.mainOf(db(), me()), me(), /main|pot|credit/) + "</select></label>");
    if (im && im.rows) {
      var buds = db().budgets.filter(function (b) { return b.person === me() && b.mode !== "saving"; });
      html += card('<div class="row"><h2>' + im.rows.length + " new payment" + (im.rows.length === 1 ? "" : "s") + '</h2><span class="small muted">' + im.skipped + " already in</span></div>" + '<div class="list" style="margin-top:6px">' + im.rows.map(function (r, i) {
        return '<div class="li" style="flex-wrap:wrap"><input type="checkbox" class="tick" data-c="impon" data-v="' + i + '"' + (r.on ? " checked" : "") + ' aria-label="Include"><span class="grow"><span class="what">' + esc(r.name) + '</span><span class="why">' + esc(B.nice(r.date)) + "</span></span>" + num(M(r.amount)) + '<select data-c="impbud" data-v="' + i + '" style="width:100%;min-height:40px;border-radius:10px;border:1px solid var(--line);background:var(--card);margin-left:36px">' + buds.map(function (b) { return '<option value="' + b.id + '"' + (b.id === r.budget ? " selected" : "") + ">" + esc(b.name) + "</option>"; }).join("") + "</select></div>";
      }).join("") + '</div><button type="button" class="btn wide" style="margin-top:12px" data-a="impsave">Add the ticked ones</button>');
    }
    return html;
  };
  function parseCsv(text) {
    var rows = [], row = [], cur = "", q = false;
    for (var i = 0; i < text.length; i++) { var c = text[i]; if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; } else if (c === '"') q = true; else if (c === ",") { row.push(cur); cur = ""; } else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cur); rows.push(row); row = []; cur = ""; } else cur += c; }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (x) { return x.trim(); }); });
  }
  function readStatement(text, account) {
    var rows = parseCsv(text), head = (rows.shift() || []).map(function (h) { return h.trim().toLowerCase(); });
    var col = function (re) { return head.findIndex(function (h) { return re.test(h); }); };
    var cD = col(/^date$|transaction date/), cA = col(/^amount|amount \(gbp\)|^value/), cN = col(/^name$|counter ?party|description|merchant|payee/);
    if (cD < 0 || cA < 0) throw new Error("Couldn't find the date and amount columns in that file");
    var d = db(), p = me(), out = [], skipped = 0, buds = d.budgets.filter(function (b) { return b.person === p; });
    var guess = function (name) { var n = name.toLowerCase(), pick = function (re) { var b = buds.filter(function (x) { return re.test(x.name); })[0]; return b && b.id; }; return (/tesco|aldi|lidl|sainsbury|asda|morrisons|co-?op|waitrose|iceland|m&s|greggs/.test(n) && pick(/food/i)) || (/shell|bp |esso|texaco|fuel|petrol/.test(n) && pick(/fuel|car/i)) || (/uber|trainline|bus|rail|tfl/.test(n) && pick(/travel/i)) || (/deliveroo|just eat|uber eats|cinema|netflix/.test(n) && pick(/fun|entertain/i)) || (buds.filter(function (b) { return b.mode !== "saving"; })[0] || {}).id; };
    rows.forEach(function (r) {
      var date = B.parseDate(r[cD]), amt = +String(r[cA]).replace(/[£,\s]/g, ""); if (!date || !(amt < 0)) return;
      amt = B.round(-amt); var name = cN >= 0 ? r[cN] : "Payment";
      var dup = d.transactions.some(function (x) { return x.person === p && Math.abs((+x.amount || 0) - amt) < 0.005 && Math.abs(B.diff(x.date, date)) <= 1; }) ||
        d.bills.some(function (b) { return b.person === p && B.occurrences(d, b, B.addDays(date, -3), B.addDays(date, 4)).some(function (o) { return Math.abs(o.amount - amt) < 0.5; }); });
      if (dup) { skipped++; return; }
      out.push({date: date, amount: amt, name: name, budget: guess(name), on: true});
    });
    return {rows: out, skipped: skipped, account: account};
  }

  // ----- the occurrence sheet (Coming up, calendar)
  function occSheet(key) {
    var c = last.coming[key]; if (!c) return;
    var it = db().byId[c.item], orig = key.split(/[@+]/)[1] || c.date, mine = canEditItem(c), html = "<h2>" + esc(c.name) + '</h2><p class="muted" style="margin:4px 0 10px">' + esc(B.nice(c.date)) + " · " + B.money(c.amount) + (c.account ? " · " + esc(c.account) : "") + "</p>";
    if (c.table === "loans") {
      var l = db().byId[c.item];
      html += '<button type="button" class="btn wide" data-a="loanpaid" data-v="' + esc(key) + '">' + (l.lender === me() ? "It's been paid to me" : "I've paid it") + "</button>";
    } else if (mine) {
      html += '<div class="list">' + li("It didn't happen", "Just this one; the rest carry on", "", "occdo", "skip|" + key) + li("It was a different amount", "Just this one", "", "occdo", "amount|" + key) + li("It's on a different day", "Just this one", "", "occdo", "move|" + key) +
        li("Change the " + (c.table === "income" ? "income" : c.table === "transfers" ? "regular payment" : "bill"), "Amount, dates, where it comes from", "", "occdo", "edit|" + key) + li("Stop it from today", "No more after today", "", "occdo", "stop|" + key) + "</div>";
    } else html += '<p class="small muted">This one belongs to ' + esc(person((it || {}).person || (it || {}).from).name) + ", so only they can change it.</p>";
    S.ui.occ = {key: key, c: c, orig: orig, it: it};
    openSheet(html + '<button type="button" class="btn ghost wide" style="margin-top:12px" data-a="sheetclose">Close</button>');
  }
  function occDo(kind) {
    var o = S.ui.occ, c = o.c, id = "x-" + c.item + "-" + o.orig;
    if (kind === "skip") { put("exceptions", {id: id + "-skip", item: c.item, date: o.orig, action: "skip"}); closeSheet(); toast(c.name + " on " + B.nice(c.date) + " won't count", {t: "exceptions", ids: [id + "-skip"]}); return; }
    if (kind === "amount") { openSheet("<h2>" + esc(c.name) + '</h2><label class="f">What it really was<input type="text" inputmode="decimal" id="occAmt" value="' + c.amount + '"></label><button type="button" class="btn wide" style="margin-top:12px" data-a="occsave" data-v="amount">Save</button>'); return; }
    if (kind === "move") { openSheet("<h2>" + esc(c.name) + '</h2><label class="f">New date<input type="date" id="occDate" value="' + c.date + '"></label><button type="button" class="btn wide" style="margin-top:12px" data-a="occsave" data-v="move">Save</button>'); return; }
    if (kind === "edit") { closeSheet(true); openEditor(c.table, c.item); return; }
    if (kind === "stop") { var r = Object.assign({}, db().byId[c.item]); var row = (tables()[c.table] || []).filter(function (x) { return x.id === c.item; })[0]; put(c.table, Object.assign({}, row, {end: B.addDays(todayIso(), 0)})); closeSheet(); toast(c.name + " stopped"); }
  }
  function calDay(iso) {
    var items = B.calendar(db(), me(), +iso.slice(0, 4), +iso.slice(5, 7) - 1)[iso] || [];
    items.forEach(function (c) { last.coming[c.key] = c; });
    openSheet("<h2>" + esc(B.nice(iso)) + "</h2>" + (items.length ? '<div class="list" style="margin-top:8px">' + items.map(function (c) { return li(esc(c.name), esc(c.account || ""), num((c.sign > 0 ? "+" : "−") + M(c.amount), c.sign > 0 ? "good" : ""), "occ", c.key); }).join("") + "</div>" : '<p class="muted">Nothing due.</p>') + '<button type="button" class="btn ghost wide" style="margin-top:12px" data-a="sheetclose">Close</button>');
  }

  // ---------- actions ----------
  var ACT = {
    tab: function (v) { go(v); }, go: function (v) { if (/^list:/.test(v)) go("list", {table: v.slice(5)}); else go(v); }, back: back,
    sheetbg: function (v, el, e) { if (e.target === el) closeSheet(); }, sheetclose: function () { closeSheet(); },
    reveal: function () { S.ui.reveal = !S.ui.reveal; render(); },
    who: function () {
      if (demoOn()) { ACT.demoinfo(); return; }
      openSheet("<h2>" + esc(person().name) + '</h2><p class="muted">Signed in on this phone. ' + esc(syncLabel()) + '</p><button type="button" class="btn ghost wide" data-a="sheetgo" data-v="settings">Settings</button><button type="button" class="btn ghost wide" style="margin-top:10px" data-a="sheetgo" data-v="sync">Sync and backup</button>');
    },
    sheetgo: function (v) { closeSheet(true); go(v); },
    demoinfo: function () { openSheet('<h2>Show and tell</h2><p class="muted">Everything here is made up. Switch who you\'re looking at, or turn it off to go back to your own money.</p><div class="two"><button type="button" class="btn ghost" data-a="demoas" data-v="alex">See Alex</button><button type="button" class="btn ghost" data-a="demoas" data-v="sam">See Sam</button></div><button type="button" class="btn wide" style="margin-top:10px" data-a="demo" data-v="off">Turn off Show and tell</button>'); },
    demoas: function (v) { S.demo.me = v; dirty(); closeSheet(true); S.prefs.easy = null; go("today"); },
    demo: function (v) { setDemo(v === "on"); closeSheet(true); go("today"); },
    connect: function () { var v = ($("#connectLink") || {}).value || ""; connectFrom(v); },
    moneyview: function (v) { S.ui.money = v; render(); }, month: function (v) { S.ui.monthOff += +v; render(); }, cal: function (v) { S.ui.calOff += +v; render(); },
    calday: function (v) { calDay(v); }, occ: function (v) { occSheet(v); }, occskip: function (v) { occSheet(v); occDo("skip"); }, occdo: function (v) { var k = v.split("|"); occDo(k[0]); },
    occsave: function (v) {
      var o = S.ui.occ, c = o.c, id = "x-" + c.item + "-" + o.orig;
      if (v === "amount") { var a = +String(($("#occAmt") || {}).value || "").replace(/[£,\s]/g, ""); if (!(a >= 0)) return; put("exceptions", {id: id + "-amount", item: c.item, date: o.orig, action: "amount", amount: a}); }
      if (v === "move") { var nd = ($("#occDate") || {}).value; if (!nd) return; put("exceptions", {id: id + "-move", item: c.item, date: o.orig, action: "move", newDate: nd}); }
      closeSheet(); toast("Saved. Your budget has updated.");
    },
    loanpaid: function (v) {
      var c = last.coming[v], l = db().byId[c.item];
      put("settlements", {id: newId("set"), date: todayIso(), from: l.borrower, to: l.lender, amount: c.amount, loan: l.id, key: v, note: l.name}); closeSheet(); toast("Marked as paid");
    },
    tick: function (v) { tickItem(last.todo[+v]); },
    settle: function (v) {
      var bt = B.between(db(), me(), todayIso()), q = partner();
      if (v === "in") put("settlements", {id: newId("set"), date: todayIso(), from: q, to: me(), amount: bt.owedToMe, note: "Settled up"});
      else put("settlements", {id: newId("set"), date: todayIso(), from: me(), to: q, amount: bt.iOwe, note: "Settled up"});
      toast("All square");
    },
    payedit: function (v) {
      var bits = v.split("@"), inc = db().byId[bits[0]], cur = (B.occurrences(db(), inc, bits[1], B.addDays(bits[1], 1))[0] || {}).amount || inc.amount;
      S.ui.payOcc = {item: bits[0], date: bits[1]};
      openSheet('<h2>What did you get paid?</h2><p class="muted">Check your payslip or ' + esc(person().bank || "bank") + ' app. Everything re-sorts around it.</p><label class="f">Amount<input type="text" inputmode="decimal" id="payAmt" value="' + cur + '"></label><button type="button" class="btn wide" style="margin-top:12px" data-a="paysave">Save</button>');
    },
    paysave: function () {
      var a = +String(($("#payAmt") || {}).value || "").replace(/[£,\s]/g, ""), o = S.ui.payOcc; if (!(a > 0)) return;
      put("exceptions", {id: "x-" + o.item + "-" + o.date + "-amount", item: o.item, date: o.date, action: "amount", amount: a}); closeSheet(); toast("Pay set to " + B.money(a) + ". Everything has re-sorted.");
    },
    potcheck: function (v) { var a = db().byId[v]; S.ui.potCheck = v; openSheet("<h2>" + esc(a.name) + '</h2><p class="muted">What does your ' + esc(person().bank || "bank") + ' app show right now? Budgie starts again from this.</p><label class="f">Balance<input type="text" inputmode="decimal" id="potBal" placeholder="£"></label><button type="button" class="btn wide" style="margin-top:12px" data-a="potsave">Save</button>'); },
    potsave: function () { var a = +String(($("#potBal") || {}).value || "").replace(/[£,\s]/g, ""); if (isNaN(a) || ($("#potBal") || {}).value === "") return; put("valuations", {id: newId("val"), account: S.ui.potCheck, date: todayIso(), amount: a}); closeSheet(); toast("Thanks. Budgie has caught up."); },
    edit: function (v) { var k = v.split(":"); openEditor(k[0], k[1]); }, "new": function (v) { openEditor(v, null); },
    editsave: function () { saveEditor(); },
    amtwhen: function (v) { closeSheet(true); if (S.ui.amtFinish) S.ui.amtFinish(v === "today"); },
    editstop: function () { var r = Object.assign({}, EDIT.orig, {end: todayIso()}); put(EDIT.table, r, true); toast("Stopped from today"); back(); },
    editdelete: function () { openSheet('<h2>Delete this?</h2><p class="muted">It will stop counting everywhere, including past months. To keep the past, use "Stop from today" instead.</p><button type="button" class="btn danger wide" data-a="editdelete2">Delete</button><button type="button" class="btn ghost wide" style="margin-top:10px" data-a="sheetclose">Keep it</button>'); },
    editdelete2: function () { closeSheet(true); del(EDIT.table, EDIT.id); toast("Deleted"); back(); },
    addmode: function (v) { S.ui.add.mode = v; render(); },
    addpick: function (v) { var k = v.split(":"); S.ui.add[k[0]] = k[1]; render(); },
    key: function (v) { var cur = S.ui.keys; if (v === "del") cur = cur.slice(0, -1); else if (v === ".") { if (cur.indexOf(".") < 0) cur = (cur || "0") + "."; } else { if (/\.\d\d$/.test(cur) || cur.length > 8) return; cur = (cur === "0" ? "" : cur) + v; } S.ui.keys = cur; render(); },
    addsave: function () {
      var a = S.ui.add, amt = +S.ui.keys; if (!(amt > 0)) { toast("Type the amount first"); return; }
      var date = a.date || todayIso();
      if (a.mode === "bill") {
        var b = db().byId[a.bill]; if (!b) return;
        var occ = B.occurrences(db(), b, B.addDays(date, -25), B.addDays(date, 26)).sort(function (x, y) { return Math.abs(B.diff(x.date, date)) - Math.abs(B.diff(y.date, date)); })[0];
        if (!occ) { toast("That bill isn't due near that date"); return; }
        var orig = occ.key.split(/[@+]/)[1];
        put("exceptions", {id: "x-" + b.id + "-" + orig + "-amount", item: b.id, date: orig, action: "amount", amount: amt});
        toast(b.name + " saved as " + B.money(amt) + (b.split ? " and re-split" : ""));
      } else {
        var row = put("transactions", {id: newId("t"), date: date, person: me(), amount: amt, budget: a.budget, account: a.account || B.mainOf(db(), me()), split: a.split ? (a.splitId || "half") : "", note: a.note || "", source: "app"}, true);
        toast("Logged " + B.money(amt), {t: "transactions", ids: [row.id]});
      }
      S.ui.keys = ""; S.ui.add = {mode: a.mode, budget: a.budget, account: a.account}; go("today");
    },
    undo: function () { var u = S.ui.undo; if (!u) return; u.ids.forEach(function (id) { del(u.t, id); }); $("#toast").innerHTML = ""; S.ui.undo = null; },
    syncnow: function () { sync(false); }, syncfull: function () { sync(true); },
    disconnect: function () { openSheet('<h2>Disconnect this phone?</h2><p class="muted">Your data stays safe in the Google Sheet. You\'ll need your connect link to come back.</p><button type="button" class="btn danger wide" data-a="disconnect2">Disconnect</button>'); },
    disconnect2: function () { S.cfg = null; LS.set("budgie.cfg", null); S.data = {tables: {}, since: 0, me: "", summary: null, queue: []}; store.set("data", S.data); dirty(); closeSheet(true); go("today"); },
    tmode: function (v) { S.prefs.mode = v; S.prefs.special = ""; themeSaved(); }, tcolour: function (v) { S.prefs.colour = v; S.prefs.special = ""; themeSaved(); },
    tspecial: function (v) { S.prefs.special = v; themeSaved(); }, tsize: function (v) { S.prefs.size = v; themeSaved(); },
    hprice: function (v) { S.ui.house.price = +v; render(); }, hdep: function (v) { S.ui.house.dep = +v; render(); },
    impsave: function () {
      var im = S.ui.imp, n = 0; im.rows.forEach(function (r) { if (!r.on) return; put("transactions", {id: newId("t"), date: r.date, person: me(), amount: r.amount, budget: r.budget, account: im.account, note: r.name, source: "import"}, true); n++; });
      S.ui.imp = null; toast("Added " + n + " payment" + (n === 1 ? "" : "s")); go("today");
    }
  };
  function themeSaved() { S.prefs._local = true; savePrefs(); applyTheme(); if (!demoOn() && me()) { setting("theme.mode", S.prefs.mode); setting("theme.colour", S.prefs.colour); setting("theme.special", S.prefs.special); } render(); }
  function tickItem(it) {
    if (!it) return;
    var now = todayIso(), ids = [];
    if (it.type === "move") it.keys.forEach(function (k) { ids.push(put("moves", {id: newId("mv"), date: now, person: me(), from: it.from, to: it.to, amount: k.amount, key: k.key}, true).id); });
    else if (it.type === "loan") ids.push(put("settlements", {id: newId("set"), date: now, from: it.borrower, to: it.lender, amount: it.amount, loan: it.loan, key: it.key}, true).id);
    else if (it.type === "settle") ids.push(put("settlements", {id: newId("set"), date: now, from: it.from, to: it.to, amount: it.amount, key: it.key, note: "Settled up"}, true).id);
    else if (it.type === "warn") ids.push(put("moves", {id: newId("mv"), date: now, person: me(), amount: 0, key: it.key, note: "dismissed"}, true).id);
    toast("Done", {t: it.type === "loan" || it.type === "settle" ? "settlements" : "moves", ids: ids});
    render();
  }

  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-a]"); if (!el) return;
    var fn = ACT[el.dataset.a]; if (!fn) return;
    if (el.tagName === "A") e.preventDefault();
    fn(el.dataset.v, el, e);
  });
  document.addEventListener("change", function (e) {
    var el = e.target, c = el.dataset && el.dataset.c; if (!c) return;
    var v = el.dataset.v;
    if (c === "tick") { tickItem(last.todo[+v]); return; }
    if (c === "paytick") { var k = v.split("|"); if (el.checked) put("moves", {id: newId("mv"), date: todayIso(), person: me(), from: k[1], to: k[2], amount: +k[3], key: k[0]}); else { (db().moves || []).filter(function (m) { return m.key === k[0]; }).forEach(function (m) { del("moves", m.id); }); } return; }
    if (c === "toggle") {
      if (v === "easy") { S.prefs.easy = el.checked; savePrefs(); if (!demoOn() && me()) setting("easy", el.checked); applyTheme(); render(); }
      if (v === "hide") { S.prefs.hide = el.checked; S.ui.reveal = false; savePrefs(); render(); }
      if (v === "demo") { setDemo(el.checked); go("today"); }
      return;
    }
    if (c === "share") { setting("share." + v, el.checked); render(); return; }
    if (c === "addsplit") { S.ui.add.split = el.checked; render(); return; }
    if (c === "adddate") { S.ui.add.date = el.value; return; }
    if (c === "addnote") { S.ui.add.note = el.value; return; }
    if (c === "hrate") { S.ui.house.rate = +el.value || 4.5; render(); return; }
    if (c === "hterm") { S.ui.house.term = +el.value || 30; render(); return; }
    if (c === "csvacc") { S.ui.imp = Object.assign(S.ui.imp || {}, {account: el.value}); return; }
    if (c === "csvfile") {
      var f = el.files && el.files[0]; if (!f) return;
      f.text().then(function (txt) { try { S.ui.imp = readStatement(txt, ($('[data-c="csvacc"]') || {}).value || B.mainOf(db(), me())); } catch (err) { toast(err.message); } render(); });
      return;
    }
    if (c === "impon") { S.ui.imp.rows[+v].on = el.checked; return; }
    if (c === "impbud") { S.ui.imp.rows[+v].budget = el.value; return; }
    if (el.dataset.f === "how") { readForm(); render(); }
  });
  // the "how often" control re-draws the form so the right questions show
  document.addEventListener("input", function (e) { if (e.target.dataset && e.target.dataset.c === "addnote") S.ui.add.note = e.target.value; });

  // swipe a Coming up row to reveal its buttons
  var sw = null;
  document.addEventListener("touchstart", function (e) { var f = e.target.closest(".swipe .face"); if (!f || !f.parentNode.querySelector(".acts")) return; sw = {f: f, x: e.touches[0].clientX, y: e.touches[0].clientY, dx: 0, open: f.style.transform && f.style.transform !== "translateX(0px)"}; }, {passive: true});
  document.addEventListener("touchmove", function (e) { if (!sw) return; var dx = e.touches[0].clientX - sw.x, dy = e.touches[0].clientY - sw.y; if (Math.abs(dy) > Math.abs(dx) && !sw.moved) { sw = null; return; } sw.moved = true; sw.dx = Math.max(-168, Math.min(0, dx + (sw.open ? -168 : 0))); sw.f.style.transition = "none"; sw.f.style.transform = "translateX(" + sw.dx + "px)"; }, {passive: true});
  document.addEventListener("touchend", function () { if (!sw) return; var f = sw.f; f.style.transition = ""; var openIt = sw.moved ? sw.dx < -60 : false; f.style.transform = "translateX(" + (openIt ? -168 : 0) + "px)"; if (sw.moved) { f.dataset.swiped = "1"; setTimeout(function () { delete f.dataset.swiped; }, 350); } sw = null; });
  document.addEventListener("click", function (e) { var f = e.target.closest(".swipe .face"); if (f && f.dataset.swiped) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);

  // ---------- start ----------
  function setDemo(on) {
    S.prefs.demo = on; S.prefs.easy = null; savePrefs();
    if (on) S.demo = {tables: window.BudgieDemo.make(todayIso()), me: "alex"};
    dirty(); applyTheme();
  }
  function connectFrom(text) {
    var m = String(text || "").match(/#connect=([A-Za-z0-9_\-=]+)/); if (!m) { S.lastError = "That doesn't look like a connect link"; render(); return false; }
    try { var b64 = m[1].replace(/-/g, "+").replace(/_/g, "/"); var j = JSON.parse(decodeURIComponent(escape(atob(b64 + "===".slice((b64.length + 3) % 4))))); if (!j.u || !j.k) throw 0; S.cfg = {u: j.u, k: j.k}; LS.set("budgie.cfg", S.cfg); }
    catch (e) { S.lastError = "That connect link didn't work. Copy it again from your sheet."; render(); return false; }
    S.data = {tables: {}, since: 0, me: "", summary: null, queue: []}; dirty(); S.lastError = "";
    if (demoOn()) setDemo(false);
    try { history.replaceState(null, "", location.pathname); } catch (e) {}
    $("#main").innerHTML = '<p class="empty">Connecting to your sheet…</p>';
    sync(true).then(function () { if (S.data.me) toast("Connected. Hi " + person().name + "!"); go("today", null, true); });
    return true;
  }
  async function start() {
    await store.open();
    var saved = await store.get("data"); if (saved && saved.tables) S.data = Object.assign(S.data, saved);
    if (S.prefs.demo) setDemo(true);
    if (location.hash.indexOf("#connect=") >= 0 && connectFrom(location.hash)) return;
    try { history.replaceState({s: "today"}, ""); } catch (e) {}
    render();
    sync(false);
    setInterval(function () { if (document.visibilityState === "visible") sync(false); }, 60000);
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") { sync(false); render(); } });
    window.addEventListener("online", function () { sync(false); });
    if (window.matchMedia) matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(function () {});
  }
  window.BudgieApp = {S: S, db: db, render: render, go: go, sync: sync, setDemo: setDemo};
  start();
})();
