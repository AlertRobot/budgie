/* Budgie engine: works everything out from the rules in the Budgie data sheet.
   The same file runs in the phone app and in Apps Script, so they always agree.
   Dates are "YYYY-MM-DD" strings. Money is pounds (numbers). No side effects. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Budgie = factory();
})(this, function () {
  "use strict";
  var VERSION = "1.1.0";

  // ---------- dates ----------
  function D(s) { var p = String(s).split("-"); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); }
  function S(d) { return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function isIso(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")); }
  function addDays(s, n) { var d = D(s); d.setUTCDate(d.getUTCDate() + n); return S(d); }
  function ymd(y, m, d) { return S(new Date(Date.UTC(y, m, d))); }       // m is 0-based and may overflow
  function daysIn(y, m) { return new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); }
  function dow(s) { return D(s).getUTCDay(); }                              // 0 Sunday
  function diff(a, b) { return Math.round((D(b) - D(a)) / 86400000); }      // b - a in days
  function minS(a, b) { return a < b ? a : b; }
  function maxS(a, b) { return a > b ? a : b; }
  var MON = {jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11};
  var WD = {sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6};
  function parseDate(x) {
    if (x === null || x === undefined || x === "") return "";
    if (x instanceof Date) return S(new Date(Date.UTC(x.getFullYear(), x.getMonth(), x.getDate())));
    var s = String(x).trim();
    if (isIso(s)) return s;
    var m = s.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})$/); if (m) return ymd(+m[3], +m[2] - 1, +m[1]);
    m = s.match(/^(?:[a-z]+,?\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3})[a-z]*\.?\s+(\d{4})$/i); if (m && MON[m[2].toLowerCase()] !== undefined) return ymd(+m[3], MON[m[2].toLowerCase()], +m[1]);
    return "";
  }

  // ---------- UK (England and Wales) bank holidays ----------
  var bhCache = {};
  function easter(y) {
    var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
      g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
      l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
    return ymd(y, mo - 1, da);
  }
  function nthWeekday(y, m, wd, n) { // n = 1..5, or -1 for last
    if (n > 0) { var first = ymd(y, m, 1), off = (wd - dow(first) + 7) % 7; var d = 1 + off + (n - 1) * 7; return d <= daysIn(y, m) ? ymd(y, m, d) : ""; }
    var last = ymd(y, m, daysIn(y, m)); return addDays(last, -((dow(last) - wd + 7) % 7));
  }
  function bankHolidays(y) {
    if (bhCache[y]) return bhCache[y];
    var set = {}, add = function (s) { set[s] = true; };
    var ny = ymd(y, 0, 1); add(dow(ny) === 6 ? addDays(ny, 2) : dow(ny) === 0 ? addDays(ny, 1) : ny);
    var e = easter(y); add(addDays(e, -2)); add(addDays(e, 1));
    add(nthWeekday(y, 4, 1, 1)); add(nthWeekday(y, 4, 1, -1)); add(nthWeekday(y, 7, 1, -1));
    var xm = ymd(y, 11, 25), bx = ymd(y, 11, 26), wx = dow(xm);
    if (wx === 6) { add(ymd(y, 11, 27)); add(ymd(y, 11, 28)); }
    else if (wx === 0) { add(bx); add(ymd(y, 11, 27)); }
    else if (wx === 5) { add(xm); add(ymd(y, 11, 28)); }
    else { add(xm); add(bx); }
    bhCache[y] = set; return set;
  }
  function isWorkingDay(s) { var w = dow(s); return w !== 0 && w !== 6 && !bankHolidays(+s.slice(0, 4))[s]; }
  function shiftDay(s, how) {
    how = String(how || "").toLowerCase();
    if (!how || isWorkingDay(s)) return s;
    var step = /prev|before|earlier/.test(how) ? -1 : /next|after|later/.test(how) ? 1 : 0;
    if (!step) return s;
    var d = s; while (!isWorkingDay(d)) d = addDays(d, step); return d;
  }

  // ---------- schedules ----------
  // "15", "last", "last working day", "last friday", "1st monday", "first working day"
  function dayInMonth(y, m, on, fallbackDay) {
    var t = String(on === undefined || on === null || on === "" ? fallbackDay : on).toLowerCase().trim();
    var n = parseInt(t, 10), dim = daysIn(y, m);
    if (/^\d+(st|nd|rd|th)?$/.test(t)) return ymd(y, m, Math.min(n, dim));
    if (t === "last" || t === "last day") return ymd(y, m, dim);
    if (/last working/.test(t)) { var d = ymd(y, m, dim); while (!isWorkingDay(d)) d = addDays(d, -1); return d; }
    if (/first working/.test(t)) { var f = ymd(y, m, 1); while (!isWorkingDay(f)) f = addDays(f, 1); return f; }
    var mm = t.match(/^(last|first|1st|second|2nd|third|3rd|fourth|4th)\s+([a-z]{3})/);
    if (mm && WD[mm[2]] !== undefined) {
      var k = {last: -1, first: 1, "1st": 1, second: 2, "2nd": 2, third: 3, "3rd": 3, fourth: 4, "4th": 4}[mm[1]];
      return nthWeekday(y, m, WD[mm[2]], k);
    }
    return ymd(y, m, Math.min(isNaN(n) ? 1 : n, dim));
  }
  // raw dates an item is scheduled on, in [from, to)
  function scheduleDates(it, from, to) {
    var out = [], unit = String(it.unit || "month").toLowerCase(), every = Math.max(1, +it.every || 1);
    var start = it.start || from, end = it.end || "";
    var stop = end ? minS(addDays(end, 1), to) : to;
    var push = function (d) { if (d && d >= from && d < stop && d >= start) out.push(d); };
    if (unit === "once") push(start);
    else if (unit === "dates") String(it.dates || "").split(/[,;\n]+/).map(parseDate).filter(Boolean).forEach(push);
    else if (unit === "day" || unit === "days") { var k0 = Math.max(0, Math.floor(diff(start, from) / every)); for (var d = addDays(start, k0 * every); d < stop; d = addDays(d, every)) push(d); }
    else if (unit === "week" || unit === "weeks") {
      var step = 7 * every, k = Math.max(0, Math.floor(diff(start, from) / step));
      for (var w = addDays(start, k * step); w < stop; w = addDays(w, step)) push(w);
    } else if (unit === "year" || unit === "years") {
      var sy = +start.slice(0, 4), smo = +start.slice(5, 7) - 1;
      for (var y = Math.max(sy, +from.slice(0, 4) - 1); y <= +to.slice(0, 4); y++) if ((y - sy) % every === 0) push(dayInMonth(y, smo, it.on, +start.slice(8, 10)));
    } else { // month
      var y0 = +start.slice(0, 4), m0 = +start.slice(5, 7) - 1, fy = +from.slice(0, 4), fm = +from.slice(5, 7) - 1;
      var idx = Math.max(0, (fy - y0) * 12 + (fm - m0) - 1), limit = (+to.slice(0, 4) - y0) * 12 + (+to.slice(5, 7) - 1 - m0) + 1;
      idx = idx - (idx % every);
      for (; idx <= limit; idx += every) { var yy = y0 + Math.floor((m0 + idx) / 12), mo = (m0 + idx) % 12; push(dayInMonth(yy, mo, it.on, +start.slice(8, 10))); }
    }
    return out.map(function (d) { return shiftDay(d, it.shift); }).filter(function (d, i, a) { return a.indexOf(d) === i; }).sort();
  }
  // the amount an item has on a date, using dated changes from the amounts table
  function amountAt(db, it, date) {
    var best = null;
    (db.byItem.amounts[it.id] || []).forEach(function (a) { if (a.start && a.start <= date && (!best || a.start >= best.start)) best = a; });
    return best ? best.amount : (+it.amount || 0);
  }
  // occurrences with exceptions applied: [{key, item, orig, date, amount, changed}]
  function occurrences(db, it, from, to) { return it.id ? memo(db, "occ|" + it.id + "|" + from + "|" + to, function () { return occ0(db, it, from, to); }) : occ0(db, it, from, to); }
  function occ0(db, it, from, to) {
    var raw = scheduleDates(it, addDays(from, -45), addDays(to, 45)), ex = db.byItem.exceptions[it.id] || [], out = [];
    raw.forEach(function (orig) {
      var o = {key: it.id + "@" + orig, item: it, orig: orig, date: orig, amount: amountAt(db, it, orig), changed: false, skipped: false};
      ex.forEach(function (x) {
        if (x.date !== orig) return;
        var a = String(x.action || "").toLowerCase();
        if (a === "skip") o.skipped = true;
        if (a === "move" && x.newDate) { o.date = x.newDate; o.changed = true; }
        if ((a === "amount" || a === "actual") && x.amount !== "" && x.amount !== null && !isNaN(+x.amount)) { o.amount = +x.amount; o.changed = true; o.actual = true; }
      });
      if (!o.skipped && o.date >= from && o.date < to) out.push(o);
    });
    // extra one-off occurrences added as exceptions ("add")
    ex.forEach(function (x) { if (String(x.action).toLowerCase() === "add" && x.newDate >= from && x.newDate < to) out.push({key: it.id + "+" + x.newDate, item: it, orig: x.newDate, date: x.newDate, amount: x.amount !== "" ? +x.amount : amountAt(db, it, x.newDate), changed: true}); });
    return out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  }

  // results are cached per loaded data set (the data never changes after load)
  // a value asked for while it's still being worked out (the first tracked month looking back) gets the fallback
  var BUSY = {};
  function memo(db, key, fn, fallback) {
    var c = db._c; if (!c) return fn();
    if (Object.prototype.hasOwnProperty.call(c, key)) return c[key] === BUSY ? (typeof fallback === "function" ? fallback() : fallback) : c[key];
    c[key] = BUSY; try { c[key] = fn(); } catch (e) { delete c[key]; throw e; } return c[key];
  }

  // ---------- loading ----------
  var NUM = ["amount", "every", "order", "target", "repay", "newAmount", "extra", "price", "limit", "cost"];
  var DATE = ["start", "end", "date", "newDate", "due", "repayFrom"];
  var BOOL = ["deleted", "isPay", "fallback", "carry", "variable", "bought"];
  function toBool(v) { return v === true || /^(true|yes|y|1)$/i.test(String(v || "").trim()); }
  function clean(row) {
    var r = {};
    Object.keys(row).forEach(function (k) {
      var v = row[k];
      if (NUM.indexOf(k) >= 0) r[k] = v === "" || v === null || v === undefined ? "" : (typeof v === "number" ? v : +String(v).replace(/[£,\s]/g, "") || 0);
      else if (DATE.indexOf(k) >= 0) r[k] = parseDate(v);
      else if (BOOL.indexOf(k) >= 0) r[k] = toBool(v);
      else r[k] = v === null || v === undefined ? "" : (typeof v === "string" ? v.trim() : v);
    });
    return r;
  }
  var TABLES = ["people", "accounts", "income", "bills", "budgets", "splits", "transfers", "transactions", "moves", "settlements", "loans", "goals", "valuations", "amounts", "exceptions", "settings", "gifts", "meta"];
  // today (optional): money already in pots only counts for periods that have started
  function load(tables, today) {
    var db = {byItem: {amounts: {}, exceptions: {}}, byId: {}, _c: {}, today: today || ""};
    TABLES.forEach(function (t) { db[t] = (tables[t] || []).map(clean).filter(function (r) { return !r.deleted && (t === "meta" || t === "settings" || r.id); }); });
    db.amounts.forEach(function (a) { (db.byItem.amounts[a.item] = db.byItem.amounts[a.item] || []).push(a); });
    db.exceptions.forEach(function (x) { (db.byItem.exceptions[x.item] = db.byItem.exceptions[x.item] || []).push(x); });
    db.accounts.sort(function (a, b) { return (+a.order || 99) - (+b.order || 99); });
    ["accounts", "income", "bills", "budgets", "splits", "transfers", "loans", "goals", "people"].forEach(function (t) { db[t].forEach(function (r) { db.byId[r.id] = r; }); });
    db.set = {};
    db.settings.forEach(function (s) { var p = s.person || "all"; (db.set[p] = db.set[p] || {})[s.key] = s.value; });
    db.moveKeys = {};
    db.moves.forEach(function (m) { if (m.key) db.moveKeys[m.key] = (db.moveKeys[m.key] || 0) + (+m.amount || 0) + 1e-9; });
    db.settleKeys = {};
    db.settlements.forEach(function (s) { if (s.key) db.settleKeys[s.key] = true; });
    return db;
  }
  function setting(db, person, key, dflt) { var v = (db.set[person] || {})[key]; if (v === undefined || v === "") v = (db.set.all || {})[key]; return v === undefined || v === "" ? dflt : v; }
  function person(db, id) { return db.byId[id] || {id: id, name: id}; }
  function partnerOf(db, p) { var me = person(db, p); if (me.partner) return me.partner; var o = db.people.filter(function (x) { return x.id !== p; })[0]; return o ? o.id : ""; }
  function accountsOf(db, p) { return db.accounts.filter(function (a) { return a.owner === p; }); }
  function mainOf(db, p) { var a = accountsOf(db, p); return (a.filter(function (x) { return x.kind === "main"; })[0] || a[0] || {id: p + "-main"}).id; }
  function fallbackOf(db, p) { var a = accountsOf(db, p).filter(function (x) { return x.fallback; })[0]; return a ? a.id : ""; }
  function accName(db, id) { var a = db.byId[id]; return a ? a.name : (id || ""); }
  function startOf(db, p) { return setting(db, p, "start", "2026-10-26"); }
  var round = function (n) { return Math.round((+n || 0) * 100) / 100; };

  // ---------- splits ----------
  // "ethan:2, sophie:1" (parts) or "sophie=375" (fixed amount; anyone else shares the rest)
  function shareOf(db, splitId, who, amount, payer) {
    if (!splitId) return who === payer ? amount : 0;
    var sp = db.byId[splitId], txt = sp ? sp.shares : (splitId === "half" ? "" : splitId);
    var people = db.people.map(function (x) { return x.id; });
    if (!txt || /^half$/i.test(txt)) return people.indexOf(who) >= 0 ? amount / Math.max(1, people.length) : 0;
    var fixed = {}, parts = {}, rest = amount;
    String(txt).split(/[,;]+/).forEach(function (bit) {
      var m = bit.trim().match(/^([a-z0-9_-]+)\s*([:=])\s*([\d.]+)$/i); if (!m) return;
      if (m[2] === "=") { fixed[m[1].toLowerCase()] = +m[3]; } else parts[m[1].toLowerCase()] = +m[3];
    });
    Object.keys(fixed).forEach(function (k) { fixed[k] = Math.min(fixed[k], Math.max(0, rest)); rest -= fixed[k]; });
    if (fixed[who] !== undefined) return fixed[who];
    var others = people.filter(function (x) { return fixed[x] === undefined; }), tot = 0;
    others.forEach(function (x) { tot += parts[x] !== undefined ? parts[x] : (Object.keys(parts).length ? 0 : 1); });
    var mine = parts[who] !== undefined ? parts[who] : (Object.keys(parts).length ? 0 : 1);
    return tot ? rest * mine / tot : 0;
  }

  // ---------- pay periods ----------
  function payDates(db, p, from, to) {
    var out = [];
    db.income.filter(function (i) { return i.person === p && i.isPay; }).forEach(function (i) { occurrences(db, i, from, to).forEach(function (o) { out.push(o.date); }); });
    return out.filter(function (d, i, a) { return a.indexOf(d) === i; }).sort();
  }
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function periodName(start, next) { var mid = addDays(start, Math.min(14, Math.floor(diff(start, next) / 2))); return MONTHS[+mid.slice(5, 7) - 1] + " " + mid.slice(0, 4); }
  // pay periods covering [from, to): [{start, next, name, pay}]
  function periods(db, p, from, to) { return memo(db, "per|" + p + "|" + from + "|" + to, function () { return per0(db, p, from, to); }); }
  function per0(db, p, from, to) {
    var st = startOf(db, p), pays = payDates(db, p, addDays(from, -70), addDays(to, 70)), out = [];
    var before = pays.filter(function (d) { return d <= from; }), first = before.length ? before[before.length - 1] : "";
    var list = (first ? [first] : []).concat(pays.filter(function (d) { return d > from; }));
    if (!first) {
      var s0 = st <= from ? st : ymd(+from.slice(0, 4), +from.slice(5, 7) - 1, 1);
      list.unshift(s0);
    }
    for (var i = 0; i < list.length - 1; i++) { if (list[i] >= to) break; out.push({start: list[i], next: list[i + 1], name: periodName(list[i], list[i + 1]), pay: pays.indexOf(list[i]) >= 0, opening: list[i] <= st && st < list[i + 1]}); }
    if (!out.length) { var n = list[list.length - 1] || from; out.push({start: n, next: addDays(n, 30), name: periodName(n, addDays(n, 30)), pay: pays.indexOf(n) >= 0}); }
    return out;
  }
  function periodAt(db, p, date) { var ps = periods(db, p, date, addDays(date, 1)); return ps[ps.length - 1]; }
  function prevPeriod(db, p, per) { return periodAt(db, p, addDays(per.start, -1)); }
  function nextPeriod(db, p, per) { return periodAt(db, p, per.next); }

  // ---------- spending ----------
  function budgetsOf(db, p, per) {
    return db.budgets.filter(function (b) { return b.person === p && (!b.start || b.start < per.next) && (!b.end || b.end >= per.start); });
  }
  function sameBudget(db, b, txn) {
    if (txn.budget === b.id) return true;
    var tb = db.byId[txn.budget];
    return !!tb && tb.person !== b.person && String(tb.name).toLowerCase() === String(b.name).toLowerCase();
  }
  // my share of a logged payment
  function myShare(db, p, txn) { return shareOf(db, txn.split, p, +txn.amount || 0, txn.person); }
  // running totals per budget, so adding up a month is two lookups however many years of payments there are
  function spendIndex(db, p, b) {
    return memo(db, "si|" + p + "|" + b.id, function () {
      var list = db.transactions.filter(function (x) { return sameBudget(db, b, x); }).map(function (x) { return [x.date, myShare(db, p, x)]; }).filter(function (x) { return x[1]; }).sort(function (a, c) { return a[0] < c[0] ? -1 : a[0] > c[0] ? 1 : 0; });
      var dates = [], cum = [0]; list.forEach(function (x, i) { dates.push(x[0]); cum.push(cum[i] + x[1]); });
      return {dates: dates, cum: cum};
    });
  }
  function lowerBound(a, v) { var lo = 0, hi = a.length; while (lo < hi) { var m = (lo + hi) >> 1; if (a[m] < v) lo = m + 1; else hi = m; } return lo; }
  function spentOn(db, p, b, from, to) { var ix = spendIndex(db, p, b); return round(ix.cum[lowerBound(ix.dates, to)] - ix.cum[lowerBound(ix.dates, from)]); }
  // budget amount for a period, prorated for the first period after tracking starts
  function budgetAmount(db, b, per) {
    // the first part-period can start from what's really in the pots: settings "opening.<budget id>"
    if (per.opening) { var o = setting(db, b.person, "opening." + b.id, ""); if (o !== "" && !isNaN(+o)) return round(+o); }
    var a = amountAt(db, b, per.start), st = startOf(db, b.person);
    // the first part-period, when tracking starts: only the days that are left (a short stub counts against a typical month)
    if (per.start <= st && st < per.next) a = a * diff(st, per.next) / Math.max(28, diff(per.start, per.next));
    return round(a);
  }
  var SPEND = {daily: 1, weekly: 1, oneoff: 1, remainder: 1};
  function savingKind(db, acc) { return /saving|isa|lisa|pension/.test((db.byId[acc] || {}).kind || ""); }
  function isSpend(db, b) { var m = b.mode || "daily"; return !!SPEND[m] && !(m === "remainder" && savingKind(db, b.account)); }
  // carry-over and overspend per budget, walking periods from tracking start
  function budgetState(db, p, per) { return memo(db, "bs|" + p + "|" + per.start, function () { return bs0(db, p, per); }, {}); }
  // one pay period at a time, building on the one before
  function bs0(db, p, per) {
    var st = startOf(db, p), res = {};
    if (per.next <= st) return res;
    var pv = per.start > st ? prevPeriod(db, p, per) : null, prev = pv && pv.start < per.start ? budgetState(db, p, pv) : {};
    var plan = planFor(db, p, per);
    budgetsOf(db, p, per).forEach(function (b) {
      if (!isSpend(db, b)) return;
      var amt = b.mode === "remainder" ? plan.remainder : budgetAmount(db, b, per);
      // only budgets marked carry keep what's unspent (up to one month's worth); "whatever is left" never piles up
      var carryIn = b.carry === true && b.mode !== "oneoff" && b.mode !== "remainder" ? ((prev[b.id] || {}).carryOut || 0) : 0;
      var spent = spentOn(db, p, b, maxS(per.start, st), per.next);
      var avail = amt + carryIn, over = Math.max(0, spent - avail);
      res[b.id] = {budget: b, period: per, amount: amt, carryIn: round(carryIn), spent: spent, avail: round(avail), left: round(avail - spent), over: round(over), carryOut: round(Math.min(Math.max(0, avail - spent), Math.max(amt, budgetAmount(db, b, {start: per.next, next: addDays(per.next, 30)})))), current: true};
    });
    return res;
  }
  function overIn(db, p, per) {
    var st = startOf(db, p); if (per.next <= st) return 0;
    var s = budgetState(db, p, per), t = 0;
    Object.keys(s).forEach(function (k) { if (s[k].period.start === per.start) t += s[k].over; });
    return round(t);
  }

  // ---------- the plan for one pay period ----------
  // lines: {kind: in|bill|spend|save|topup|remainder, name, amount, account, date, id}
  function planFor(db, p, per, noTopup) { return memo(db, "plan|" + p + "|" + per.start + "|" + per.next + "|" + (noTopup ? 1 : 0), function () { return plan0(db, p, per, noTopup); }, function () { return planFor(db, p, per, true); }); }
  function plan0(db, p, per, noTopup) {
    var lines = [], partner = partnerOf(db, p), main = mainOf(db, p), st = startOf(db, p), from = per.start, to = per.next;
    var live = function (d) { return d >= st; };
    db.income.filter(function (i) { return i.person === p; }).forEach(function (i) {
      occurrences(db, i, from, to).forEach(function (o) {
        if (!live(o.date)) return;
        lines.push({kind: "in", name: i.name, amount: o.amount, account: i.account || main, date: o.date, id: i.id, occ: o.key, isPay: i.isPay, actual: !!o.actual});
        // money paid straight into a savings account (parents topping up a LISA) is saved, not spendable
        if (i.account && i.account !== main && savingKind(db, i.account)) lines.push({kind: "save", name: i.name, amount: o.amount, account: i.account, date: o.date, id: i.id, direct: true});
      });
    });
    db.transfers.forEach(function (t) {
      occurrences(db, t, from, to).forEach(function (o) {
        if (!live(o.date)) return;
        if (t.to === p) lines.push({kind: "in", name: person(db, t.from).name + ": " + (t.name || t.purpose || "transfer"), amount: o.amount, account: t.toAccount || main, date: o.date, id: t.id, occ: o.key});
        if (t.from === p) lines.push({kind: "bill", name: (t.name || t.purpose || "Transfer") + " (to " + person(db, t.to).name + ")", amount: o.amount, account: t.fromAccount || main, date: o.date, id: t.id, occ: o.key, transfer: true});
      });
    });
    db.bills.filter(function (b) { return b.person === p; }).forEach(function (b) { occurrences(db, b, from, to).forEach(function (o) { if (live(o.date)) lines.push({kind: "bill", name: b.name, amount: o.amount, account: b.account || main, date: o.date, id: b.id, occ: o.key, category: b.category, split: b.split}); }); });
    db.loans.forEach(function (l) {
      loanPlan(db, l).forEach(function (r) {
        if (r.date < from || r.date >= to || !live(r.date)) return;
        if (l.borrower === p) lines.push({kind: "bill", name: "Pay " + person(db, l.lender).name + " back: " + l.name, amount: r.amount, account: main, date: r.date, id: l.id, loan: true});
        if (l.lender === p) lines.push({kind: "in", name: person(db, l.borrower).name + " pays back: " + l.name, amount: r.amount, account: l.account || main, date: r.date, id: l.id, loan: true});
      });
    });
    if (per.opening) {
      var ob = balances(db, addDays(st, -1)), opening = 0;
      accountsOf(db, p).forEach(function (a) { if (a.kind === "main" || (a.kind === "pot" && !a.fallback)) opening += ob[a.id] || 0; });
      if (opening) lines.push({kind: "in", name: "In your account and " + (person(db, p).potWord || "pot") + "s when you started", amount: round(opening), account: main, date: st, id: "opening"});
    }
    var bud = budgetsOf(db, p, per), remainder = null;
    bud.forEach(function (b) {
      if (b.mode === "remainder") { remainder = b; return; }
      if (per.opening && b.mode === "saving") return;   // the opening part-period runs on the balances you started with
      var amt = budgetAmount(db, b, per); if (!amt) return;
      lines.push({kind: b.mode === "saving" ? "save" : "spend", name: b.name, amount: amt, account: b.account || main, id: b.id, mode: b.mode || "daily"});
    });
    if (!noTopup) {
      var fb = fallbackOf(db, p), top = fb ? overIn(db, p, prevPeriod(db, p, per)) : 0;
      if (top > 0.004) lines.push({kind: "topup", name: "Top up " + accName(db, fb), amount: top, account: fb, id: "topup"});
    }
    // money already sitting in a pot when the period starts (bills came in cheaper, a pot topped up early) counts
    // towards that pot's needs; a pot that ended short gets caught up. Only once the period has started.
    if (!per.opening && addDays(from, -1) >= st && (!db.today || from <= addDays(db.today, 1))) {
      var dayBefore = addDays(from, -1), bal = Object.assign({}, balances(db, dayBefore)), pv = prevPeriod(db, p, per), bst = pv && pv.start < from ? budgetState(db, p, pv) : {};
      // moves still on the To do count as done, so a forgotten tick doesn't ask for the money twice
      var pendMove = function (from2, to2, amt) { if (bal[from2] !== undefined) bal[from2] = round(bal[from2] - amt); if (bal[to2] !== undefined) bal[to2] = round(bal[to2] + amt); };
      periods(db, p, st, from).forEach(function (pk) {
        if (pk.start >= from) return;
        if (pk.pay && !pk.opening) payday(db, p, pk).moves.forEach(function (m) { if (!db.moveKeys["pay:" + pk.start + ":" + m.to]) pendMove(m.from, m.to, m.amount); });
        reimbursements(db, p, pk, minS(dayBefore, addDays(pk.next, -1))).forEach(function (g) { var left = round(g.amount - (db.moveKeys[g.key] || 0)); if (left > 0.004) pendMove(g.from, g.to, left); });
      });
      accountsOf(db, p).forEach(function (a) {
        if (a.kind !== "pot" || a.fallback) return;
        var keep = 0; Object.keys(bst).forEach(function (k) { if ((bst[k].budget.account || main) === a.id) keep += bst[k].carryOut; });
        var needs = 0; lines.forEach(function (l) { if (l.kind !== "in" && l.account === a.id) needs += l.amount; });
        var spare = round((bal[a.id] || 0) - keep);
        if (spare > 0.004 && needs > 0.004) lines.push({kind: "in", name: "Already in " + a.name, amount: round(Math.min(spare, needs)), account: a.id, id: "already", already: true});
        else if (spare < -0.004) lines.push({kind: "bill", name: "Catch up " + a.name, amount: round(-spare), account: a.id, id: "catchup", catchup: true});
      });
    }
    var tin = 0, tout = 0;
    lines.forEach(function (l) { if (l.kind === "in") tin += l.amount; else tout += l.amount; });
    var left = round(tin - tout);
    if (per.opening && remainder && savingKind(db, remainder.account)) left = 0;
    var res = {period: per, lines: lines, totalIn: round(tin), totalOut: round(tout), remainder: Math.max(0, round(left)), shortfall: left < 0 ? round(-left) : 0, remainderBudget: remainder, opening: !!per.opening};
    if (remainder) lines.push({kind: remainder.account && (db.byId[remainder.account] || {}).kind !== "main" && /saving|isa|lisa|pension/.test((db.byId[remainder.account] || {}).kind) ? "save" : "spend", name: remainder.name, amount: res.remainder, account: remainder.account || main, id: remainder.id, mode: "remainder", remainder: true});
    var sum = function (k) { var t = 0; lines.forEach(function (l) { if (l.kind === k) t += l.amount; }); return round(t); };
    res.totals = {in: sum("in"), bills: sum("bill"), spend: sum("spend"), save: round(sum("save") + sum("topup"))};
    return res;
  }

  // ---------- loans ----------
  function loanPaid(db, l, upTo) {
    var t = 0; db.settlements.forEach(function (s) { if (s.loan === l.id && (!upTo || s.date <= upTo)) t += +s.amount || 0; }); return round(t);
  }
  // planned repayments: repay amount on repayDay each month from repayFrom until cleared; settled ones marked
  function loanPlan(db, l) {
    var out = [], left = +l.amount || 0, paid = loanPaid(db, l), rp = +l.repay || 0;
    if (!rp || !l.repayFrom) return out;
    var dates = scheduleDates({unit: "month", on: l.repayDay || +l.repayFrom.slice(8, 10), start: l.repayFrom}, l.repayFrom, addDays(l.repayFrom, 3660));
    var credit = paid;
    for (var i = 0; i < dates.length && left > 0.004; i++) {
      var a = Math.min(rp, left), covered = Math.min(a, credit); credit -= covered; left -= a;
      out.push({date: dates[i], amount: round(a), paid: covered >= a - 0.004, key: "loan:" + l.id + ":" + dates[i]});
    }
    return out;
  }

  // ---------- money flows and balances ----------
  // every flow in or out of an account in (after, upTo]: {date, account, amount (+ in / - out), what}
  function flows(db, after, upTo) { return memo(db, "fl|" + after + "|" + upTo, function () { return fl0(db, after, upTo); }); }
  function fl0(db, after, upTo) {
    var out = [], push = function (date, acc, amt, what, src) { if (acc && date > after && date <= upTo && amt) out.push({date: date, account: acc, amount: round(amt), what: what, src: src}); };
    var from = addDays(after, 1), to = addDays(upTo, 1);
    db.income.forEach(function (i) { occurrences(db, i, from, to).forEach(function (o) { if (o.date >= startOf(db, i.person)) push(o.date, i.account || mainOf(db, i.person), o.amount, i.name, o.key); }); });
    db.bills.forEach(function (b) { occurrences(db, b, from, to).forEach(function (o) { if (o.date >= startOf(db, b.person)) push(o.date, b.account || mainOf(db, b.person), -o.amount, b.name, o.key); }); });
    db.transfers.forEach(function (t) { occurrences(db, t, from, to).forEach(function (o) { if (o.date >= startOf(db, t.from)) { push(o.date, t.fromAccount || mainOf(db, t.from), -o.amount, t.name, o.key); push(o.date, t.toAccount || mainOf(db, t.to), o.amount, t.name, o.key); } }); });
    db.transactions.forEach(function (x) { push(x.date, x.account || mainOf(db, x.person), -(+x.amount || 0), x.note || x.budget, x.id); });
    db.moves.forEach(function (m) { if (m.from) push(m.date, m.from, -(+m.amount || 0), "move", m.id); if (m.to) push(m.date, m.to, +m.amount || 0, "move", m.id); });
    db.settlements.forEach(function (s) { push(s.date, s.fromAccount || mainOf(db, s.from), -(+s.amount || 0), s.note || "payment", s.id); push(s.date, s.toAccount || mainOf(db, s.to), +s.amount || 0, s.note || "payment", s.id); });
    db.loans.forEach(function (l) { if (l.account) push(l.date, l.account, -(+l.amount || 0), l.name, l.id); });
    return out;
  }
  // tracked balance of every account on a date: last checked balance plus everything since
  // every movement of money from the earliest tracking start to a few years ahead, sorted once
  function allFlows(db) {
    return memo(db, "allfl", function () {
      var earliest = "9999";
      db.accounts.forEach(function (a) { var st = startOf(db, a.owner); if (st < earliest) earliest = st; });
      db.valuations.forEach(function (v) { if (v.date < earliest) earliest = v.date; });
      var horizon = addDays(db.today || maxS(earliest, "2026-01-01"), 1100);
      db.transactions.forEach(function (x) { if (x.date > horizon) horizon = x.date; });
      var list = flows(db, addDays(earliest, -1), horizon).slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
      return {from: earliest, to: horizon, list: list, dates: list.map(function (f) { return f.date; })};
    });
  }
  // tracked balance of every account at the end of a date: last checked balance plus everything since
  // (flows on a valuation's own date are already in it)
  function balances(db, date) { return memo(db, "bal|" + date, function () { return bal0(db, date); }); }
  function bal0(db, date) {
    var res = {}, base = {}, vdate = {};
    db.accounts.forEach(function (a) { res[a.id] = 0; base[a.id] = addDays(startOf(db, a.owner), -1); });
    db.valuations.forEach(function (v) { if (v.date <= date && res[v.account] !== undefined && v.date >= (vdate[v.account] || "")) { vdate[v.account] = v.date; res[v.account] = +v.amount || 0; base[v.account] = v.date; } });
    var af = allFlows(db), list = af.list;
    if (date > af.to) list = flows(db, addDays(af.from, -1), date);
    var end = date > af.to ? list.length : lowerBound(af.dates, addDays(date, 1));
    for (var i = 0; i < end; i++) { var f = list[i]; if (res[f.account] !== undefined && f.date > base[f.account] && f.date <= date) res[f.account] = round(res[f.account] + f.amount); }
    return res;
  }

  // moves needed because something was paid from the wrong place, or went over budget, in one pay period
  // (amounts before anything already ticked off)
  function reimbursements(db, p, pk, today) {
    return memo(db, "rb|" + p + "|" + pk.start + "|" + today, function () {
      var main = mainOf(db, p), fb = fallbackOf(db, p), st = startOf(db, p), out = [];
      budgetsOf(db, p, pk).forEach(function (b) {
        if (!isSpend(db, b)) return;
        var home = b.account || main, amt = b.mode === "remainder" ? planFor(db, p, pk).remainder : budgetAmount(db, b, pk);
        var mineB = memo(db, "txb|" + b.id, function () { return db.transactions.filter(function (x) { return x.budget === b.id; }).sort(function (a, c) { return a.date < c.date ? -1 : a.date > c.date ? 1 : 0; }); });
        var lo = lowerBound(mineB.map(function (x) { return x.date; }), maxS(pk.start, st));
        var list = []; for (var i = lo; i < mineB.length && mineB[i].date < pk.next && mineB[i].date <= today; i++) if (mineB[i].person === p) list.push(mineB[i]);
        if (!list.length) return;
        var own = function (x) { return (x.account || main) === home; }, left = amt + ((budgetState(db, p, pk)[b.id] || {}).carryIn || 0);
        list.filter(own).forEach(function (x) { left -= myShare(db, p, x); });
        // one combined move per pot and reason, so ten small shops make one To do item
        var agg = {}, bump = function (key, from, to, a, kind) { if (!(a > 0.004)) return; var g = agg[key] = agg[key] || {key: key, from: from, to: to, amount: 0, kind: kind, name: b.name.toLowerCase()}; g.amount += a; };
        if (left < 0 && home === main && fb) bump("cover:" + b.id + ":" + pk.start + ":" + main, fb, main, -left, "over");
        left = Math.max(0, left);
        list.filter(function (x) { return !own(x); }).forEach(function (x) {
          var payer = x.account || main, a = +x.amount || 0, give = Math.min(a, left); left -= give;
          bump("back:" + b.id + ":" + pk.start + ":" + payer, home, payer, give, "back");
          if (fb && payer !== fb) bump("cover:" + b.id + ":" + pk.start + ":" + payer, fb, payer, a - give, "over");
        });
        Object.keys(agg).forEach(function (k) { agg[k].amount = round(agg[k].amount); out.push(agg[k]); });
      });
      return out;
    });
  }

  // ---------- To do ----------
  // returns pending moves and reminders for a person today
  function todo(db, p, today) {
    var per = periodAt(db, p, today), main = mainOf(db, p), fb = fallbackOf(db, p), st = startOf(db, p);
    var bal = balances(db, today), items = [], pend = {};
    var avail = function (a) { return round((bal[a] || 0) + (pend[a] || 0)); };
    var plan = function (key, from, to, amount, what, why, extra) {
      amount = round(amount); if (!(amount > 0.004) || from === to) return;
      if (extra && extra.partial) { amount = round(amount - (db.moveKeys[key] || 0)); if (!(amount > 0.004)) return; what = "Move " + money(amount) + " from " + accName(db, from) + " to " + accName(db, to); }
      else if (db.moveKeys[key]) return;
      var it = {key: key, type: "move", from: from, to: to, fromName: accName(db, from), toName: accName(db, to), amount: amount, what: what, why: why, short: false};
      for (var k in extra) it[k] = extra[k];
      if (avail(from) < amount - 0.004) it.short = round(amount - Math.max(0, avail(from)));
      pend[from] = (pend[from] || 0) - amount; pend[to] = (pend[to] || 0) + amount;
      items.push(it);
    };
    // 1. payday: sort the pay into pots (current period, from payday for 7 days)
    if (per.pay && !per.opening) {
      payday(db, p, per).moves.forEach(function (m) { plan("pay:" + per.start + ":" + m.to, m.from, m.to, m.amount, "Payday: move " + money(m.amount) + " to " + accName(db, m.to), m.why, {payday: true}); });
    }
    // 2. paid from the wrong place, or over budget (all periods since tracking started)
    periods(db, p, st, addDays(today, 1)).forEach(function (pk) {
      reimbursements(db, p, pk, today).forEach(function (g) {
        if (g.kind === "back") plan(g.key, g.from, g.to, g.amount, "", "You paid for " + g.name + " from " + accName(db, g.to) + ".", {partial: true, names: [g.name]});
        else plan(g.key, g.from, g.to, g.amount, "", "You went over your " + g.name + " budget" + (g.to === main ? "" : " paying from " + accName(db, g.to)) + ". Your next pay tops the " + accName(db, g.from) + " back up.", {partial: true, over: true, names: [g.name]});
      });
    });
    // the same move from older months or other budgets becomes one item (ticking it saves each part)
    var grouped = [], at = {}, joinNames = function (a) { a = a.filter(function (x, i) { return a.indexOf(x) === i; }); return a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]; };
    items.forEach(function (it) {
      it.keys = [{key: it.key, amount: it.amount}];
      if (it.type !== "move" || it.payday || !it.names) { grouped.push(it); return; }
      var g = it.from + ">" + it.to + (it.over ? "!" : "");
      if (at[g] === undefined) { at[g] = grouped.length; grouped.push(it); return; }
      var x = grouped[at[g]]; x.amount = round(x.amount + it.amount); x.keys.push({key: it.key, amount: it.amount}); x.names = x.names.concat(it.names);
      x.short = it.short || x.short; x.what = "Move " + money(x.amount) + " from " + x.fromName + " to " + x.toName;
      x.why = x.over ? "You went over your " + joinNames(x.names) + " budget" + (x.names.length > 1 ? "s" : "") + (x.to === main ? "" : " paying from " + x.toName) + ". Your next pay tops the " + x.fromName + " back up."
        : "You paid for " + joinNames(x.names) + " from " + x.toName + ".";
    });
    items = grouped;
    // 3. a pot that will run short before payday
    var flowsAhead = flows(db, today, addDays(per.next, -1));
    var run = {}; Object.keys(bal).forEach(function (a) { run[a] = avail(a); });
    var warned = {};
    flowsAhead.sort(function (a, c) { return a.date < c.date ? -1 : 1; }).forEach(function (f) {
      if (run[f.account] === undefined || (db.byId[f.account] || {}).owner !== p) return;
      run[f.account] = round(run[f.account] + f.amount);
      if (run[f.account] < -0.004 && f.account !== main && !warned[f.account]) {
        warned[f.account] = true;
        var need = round(-run[f.account]);
        // the main account if it will have the money by then, else the fallback pot; only shown once the money is actually there
        var src = (run[main] || 0) - need >= -0.004 ? main : (fb && fb !== f.account && (run[fb] || 0) - need >= -0.004 ? fb : "");
        if (src && avail(src) - need >= -0.004) {
          plan("fill:" + f.account + ":" + f.date, src, f.account, need, "Move " + money(need) + " from " + accName(db, src) + " to " + accName(db, f.account), f.what + " on " + nice(f.date) + " needs it.", {fill: true});
          run[src] = round(run[src] - need); run[f.account] = 0;
        } else if (!src) {
          items.push({key: "short:" + f.account + ":" + f.date, type: "warn", amount: need, what: accName(db, f.account) + " will be " + money(need) + " short", why: f.what + " on " + nice(f.date) + ", and there isn't enough spare money to cover it yet."});
          run[f.account] = 0;
        }
      }
    });
    // 4. loan repayments due
    db.loans.forEach(function (l) {
      if (l.lender !== p && l.borrower !== p) return;
      loanPlan(db, l).forEach(function (r) {
        if (r.paid || r.date > today || db.settleKeys[r.key]) return;
        items.push({key: r.key, type: "loan", loan: l.id, amount: r.amount, date: r.date, lender: l.lender, borrower: l.borrower,
          what: l.borrower === p ? "Pay " + person(db, l.lender).name + " " + money(r.amount) : person(db, l.borrower).name + " pays you " + money(r.amount),
          why: l.name + (r.date < today ? " (was due " + nice(r.date) + ")" : " · due today")});
      });
    });
    // 5. split payments between you two
    var bt = between(db, p, today);
    if (bt.owedToMe > 0.004) items.push({key: "split:" + today, type: "settle", amount: bt.owedToMe, what: person(db, bt.partner).name + " owes you " + money(bt.owedToMe), why: "For shared bills and split payments. Tick when it arrives.", from: bt.partner, to: p});
    if (bt.iOwe > 0.004) items.push({key: "split:" + today, type: "settle", amount: bt.iOwe, what: "Pay " + person(db, bt.partner).name + " " + money(bt.iOwe), why: "For shared bills and split payments.", from: p, to: bt.partner, info: true});
    return items;
  }

  // ---------- payday sort ----------
  function payday(db, p, per) {
    var pl = planFor(db, p, per), main = mainOf(db, p), need = {}, why = {};
    var payAcc = (pl.lines.filter(function (l) { return l.isPay; })[0] || {}).account || main;
    pl.lines.forEach(function (l) {
      if (l.kind === "in") { if (l.account !== payAcc && !l.isPay) { need[l.account] = (need[l.account] || 0) - l.amount; } return; }
      if (l.catchup) (why[l.account] = why[l.account] || []).push("catching up " + money(l.amount));
      if (l.account === payAcc) return;
      need[l.account] = (need[l.account] || 0) + l.amount;
      if (!l.catchup) (why[l.account] = why[l.account] || []).push(l.name);
    });
    var already = pl.lines.filter(function (l) { return l.already; }).map(function (l) { return {account: l.account, name: accName(db, l.account), amount: l.amount}; });
    var moves = [];
    accountsOf(db, p).concat(db.accounts.filter(function (a) { return a.owner !== p; })).forEach(function (a) {
      var n = round(need[a.id] || 0); if (n > 0.004) moves.push({from: payAcc, to: a.id, amount: n, why: (why[a.id] || []).join(", ")});
    });
    var pay = pl.lines.filter(function (l) { return l.isPay; })[0] || null;
    var landed = 0; pl.lines.forEach(function (l) { if (l.kind === "in" && l.account === payAcc) landed += l.amount; });
    return {period: per, pay: pay, payAccount: payAcc, moves: moves, already: already, plan: pl, keeps: round(landed - moves.reduce(function (t, m) { return t + m.amount; }, 0))};
  }

  // ---------- between partners ----------
  // shared bills and the regular transfers that pay for them are settled by completed calendar month,
  // so a rent share sent on the 13th for rent on the 15th never shows as owed; split payments count straight away
  function between(db, p, today) {
    var q = partnerOf(db, p), owed = 0; // + means q owes p
    var st = maxS(startOf(db, p), startOf(db, q)), monthStart = today.slice(0, 8) + "01", month = {bills: 0, myShare: 0, theirShare: 0, paidIn: 0, paidOut: 0};
    db.transactions.forEach(function (x) {
      if (!x.split || x.date > today || x.date < st) return;
      if (x.person === p) owed += shareOf(db, x.split, q, +x.amount, x.person);
      if (x.person === q) owed -= shareOf(db, x.split, p, +x.amount, x.person);
    });
    db.bills.forEach(function (b) {
      if (!b.split || (b.person !== p && b.person !== q)) return;
      occurrences(db, b, st, addDays(today, 1)).forEach(function (o) {
        var theirs = shareOf(db, b.split, b.person === p ? q : p, o.amount, b.person), sign = b.person === p ? 1 : -1;
        if (o.date < monthStart) owed += sign * theirs;
        else { month.bills += o.amount; if (b.person === p) month.theirShare += theirs; else month.myShare += theirs; }
      });
    });
    db.transfers.forEach(function (t) {
      occurrences(db, t, st, addDays(today, 1)).forEach(function (o) {
        var sign = t.from === q && t.to === p ? -1 : t.from === p && t.to === q ? 1 : 0; if (!sign) return;
        if (o.date < monthStart) owed += sign * o.amount;
        else if (sign < 0) month.paidIn += o.amount; else month.paidOut += o.amount;
      });
    });
    db.settlements.forEach(function (s) {
      if (s.loan || s.date > today || s.date < st) return;
      if (s.from === q && s.to === p) owed -= +s.amount;
      if (s.from === p && s.to === q) owed += +s.amount;
    });
    owed = round(owed);
    Object.keys(month).forEach(function (k) { month[k] = round(month[k]); });
    return {partner: q, owedToMe: owed > 0 ? owed : 0, iOwe: owed < 0 ? -owed : 0, net: owed, month: month};
  }

  // ---------- today ----------
  function today(db, p, date) {
    var per = periodAt(db, p, date), daysLeft = Math.max(1, diff(date, per.next)), plan = planFor(db, p, per);
    var stt = budgetState(db, p, per), bal = balances(db, date), tiles = [], safe = 0, status = "On track";
    var from0 = maxS(per.start, startOf(db, p)), dayNo = diff(from0, date) + 1, days = Math.max(1, diff(from0, per.next));
    budgetsOf(db, p, per).forEach(function (b) {
      var s = stt[b.id]; if (!s || !s.current) return;
      var mode = b.mode || "daily", tile = {id: b.id, name: b.name, mode: mode, amount: s.avail, spent: s.spent, left: s.left, over: s.over, pct: s.avail > 0 ? Math.min(100, Math.round(s.spent / s.avail * 100)) : (s.spent > 0 ? 100 : 0)};
      if (mode === "daily" || mode === "remainder") {
        var paceAmt = s.avail * dayNo / days; tile.day = round(Math.max(0, s.left) / daysLeft); tile.pace = round(paceAmt - s.spent); safe += tile.day;
      } else if (mode === "weekly") {
        var week = s.avail * 7 / days, weeksIn = Math.ceil(dayNo / 7), allowed = Math.min(s.avail, week * weeksIn);
        tile.week = round(week); tile.weekLeft = round(Math.max(0, allowed - s.spent)); tile.pace = round(allowed - s.spent);
        var dLeftWeek = 7 - ((dayNo - 1) % 7); tile.day = round(Math.min(tile.weekLeft / dLeftWeek, Math.max(0, s.left) / daysLeft * 7 / dLeftWeek)); safe += round(Math.max(0, s.left) / daysLeft);
      } else { tile.day = null; tile.pace = round(s.left); }
      tile.paceMark = Math.round(Math.min(1, dayNo / days) * 100);
      if (tile.pace < -0.5 && mode !== "oneoff") status = "A bit ahead";
      if (s.left < -0.004) status = "Over budget";
      tiles.push(tile);
    });
    var cash = 0, main = mainOf(db, p);
    // cap by money actually there (spending accounts minus what's still due before payday)
    var spendAccs = {}; tiles.forEach(function (t) { var b = db.byId[t.id]; if (t.day !== null) spendAccs[b.account || main] = true; });
    var committed = 0; flows(db, date, addDays(per.next, -1)).forEach(function (f) { if (spendAccs[f.account]) committed += f.amount; });
    Object.keys(spendAccs).forEach(function (a) { cash += bal[a] || 0; });
    var cashFree = round(Math.max(0, cash + committed));
    var cap = round(cashFree / daysLeft);
    if (safe > cap) { safe = cap; status = cashFree <= 0 ? "No spare cash" : status; }
    var nxt = payDates(db, p, addDays(date, 1), addDays(date, 70))[0] || per.next;
    return {date: date, period: per, plan: plan, daysLeft: daysLeft, safe: round(safe), status: status, tiles: tiles, cashFree: cashFree, nextPay: nxt,
      nextPayAmount: (planFor(db, p, periodAt(db, p, nxt)).lines.filter(function (l) { return l.isPay; })[0] || {}).amount || 0,
      todo: todo(db, p, date), coming: coming(db, p, date, 14)};
  }
  function coming(db, p, date, days) {
    var to = addDays(date, days + 1), out = [], from = addDays(date, 1);
    var add = function (o, kind, name, amount, account, sign) { out.push({date: o.date, key: o.key, item: o.item.id, table: kind, name: name, amount: round(amount), sign: sign, account: accName(db, account), changed: o.changed}); };
    db.bills.forEach(function (b) { if (b.person === p) occurrences(db, b, from, to).forEach(function (o) { add(o, "bills", b.name, o.amount, b.account, -1); }); });
    db.income.forEach(function (i) { if (i.person === p) occurrences(db, i, from, to).forEach(function (o) { add(o, "income", i.isPay ? "Payday" : i.name, o.amount, i.account, 1); }); });
    db.transfers.forEach(function (t) {
      if (t.from === p || t.to === p) occurrences(db, t, from, to).forEach(function (o) { add(o, "transfers", t.from === p ? (t.name || "Transfer") + " to " + person(db, t.to).name : person(db, t.from).name + ": " + (t.name || "transfer"), o.amount, t.from === p ? t.fromAccount : t.toAccount, t.from === p ? -1 : 1); });
    });
    db.loans.forEach(function (l) { loanPlan(db, l).forEach(function (r) { if (r.paid || r.date < from || r.date >= to) return; if (l.borrower === p) out.push({date: r.date, key: r.key, item: l.id, table: "loans", name: "Pay " + person(db, l.lender).name + " back", amount: r.amount, sign: -1, account: accName(db, mainOf(db, p))}); if (l.lender === p) out.push({date: r.date, key: r.key, item: l.id, table: "loans", name: person(db, l.borrower).name + " pays you back", amount: r.amount, sign: 1, account: accName(db, l.account || mainOf(db, p))}); }); });
    return out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  }
  // everything due on each day of a month, for the calendar
  function calendar(db, p, year, month) {
    var from = ymd(year, month, 1), to = ymd(year, month + 1, 1), days = {};
    var all = coming(db, p, addDays(from, -1), diff(from, to) - 1);
    all.forEach(function (c) { (days[c.date] = days[c.date] || []).push(c); });
    return days;
  }

  // ---------- pots view ----------
  function pots(db, p, date) {
    var bal = balances(db, date), items = todo(db, p, date), pend = {};
    items.forEach(function (t) { if (t.type === "move") { pend[t.from] = (pend[t.from] || 0) - t.amount; pend[t.to] = (pend[t.to] || 0) + t.amount; } });
    return accountsOf(db, p).filter(function (a) { return /main|pot|saving/.test(a.kind || "pot"); }).map(function (a) {
      return {id: a.id, name: a.name, kind: a.kind, purpose: a.purpose, now: round(bal[a.id] || 0), should: round((bal[a.id] || 0) + (pend[a.id] || 0)), pending: round(pend[a.id] || 0), fallback: !!a.fallback};
    });
  }

  // ---------- months and the year ----------
  function monthView(db, p, per) {
    var pl = planFor(db, p, per), st = budgetState(db, p, per);
    var spentFor = function (l) { var s = st[l.id]; return s && s.period.start === per.start ? s : null; };
    return {period: per, plan: pl, lines: pl.lines.map(function (l) { var s = (l.kind === "spend") ? spentFor(l) : null; return Object.assign({}, l, s ? {spent: s.spent, avail: s.avail, left: s.left} : {}); })};
  }
  function year(db, p, date) {
    var cur = periodAt(db, p, date), list = [], per = cur;
    for (var i = 0; i < 6; i++) { var pv = prevPeriod(db, p, per); if (!pv || pv.start >= per.start || pv.next <= startOf(db, p)) break; per = pv; }
    for (var k = 0; k < 12; k++) {
      var pl = planFor(db, p, per), st = budgetState(db, p, per), spent = 0;
      Object.keys(st).forEach(function (id) { if (st[id].period.start === per.start) spent += st[id].spent; });
      list.push({period: per, in: pl.totals.in, bills: pl.totals.bills, spendPlan: pl.totals.spend, spent: round(spent), save: pl.totals.save, past: per.next <= date, current: per.start === cur.start});
      per = nextPeriod(db, p, per);
    }
    return list;
  }

  // ---------- goals, LISA, net worth ----------
  function accountValue(db, accId, date) { return round(balances(db, date)[accId] || 0); }
  function goals(db, p, date) {
    var bal = balances(db, date);
    return db.goals.filter(function (g) { return String(g.owners || p).split(/[,\s]+/).indexOf(p) >= 0; }).map(function (g) {
      var saved = +g.extra || 0, parts = [];
      String(g.accounts || "").split(/[,\s]+/).filter(Boolean).forEach(function (a) { var v = round(bal[a] || 0); saved += v; parts.push({account: a, name: accName(db, a), owner: (db.byId[a] || {}).owner, amount: v}); });
      var target = +g.target || 0;
      return {id: g.id, name: g.name, kind: g.kind, target: target, saved: round(saved), pct: target ? Math.min(100, Math.round(saved / target * 100)) : 0, by: g.by, parts: parts, notes: g.notes};
    });
  }
  function taxYearStart(date) { var y = +date.slice(0, 4); var s = ymd(y, 3, 6); return date >= s ? s : ymd(y - 1, 3, 6); }
  function lisa(db, accId, date) {
    var tys = taxYearStart(date), paid = 0, all = 0;
    flows(db, "2000-01-01", date).forEach(function (f) { if (f.account === accId && f.amount > 0 && f.src && !/^val/.test(f.src)) { if (f.date >= tys) paid += f.amount; all += f.amount; } });
    paid = round(Math.min(paid, 1e9));
    var bal = accountValue(db, accId, date), bonus = round(Math.min(1000, paid * 0.25));
    var series = [], first = "9999";
    db.valuations.forEach(function (v) { if (v.account === accId && v.date < first) first = v.date; });
    var acc = db.byId[accId]; if (first === "9999" && acc) first = startOf(db, acc.owner);
    for (var i = 23; i >= 0; i--) { var d = ymd(+date.slice(0, 4), +date.slice(5, 7) - 1 - i, 1); if (i === 0) d = date; if (d >= first) series.push({date: d, amount: accountValue(db, accId, d)}); }
    // paid in before Budgie started tracking (from the person's Moneybox app), so the £4,000 limit is right
    var before = acc ? +setting(db, acc.owner, "lisa.paidBefore." + accId, 0) || 0 : 0;
    if (before && tys <= startOf(db, acc.owner)) paid = round(paid + before);
    bonus = round(Math.min(1000, paid * 0.25));
    // what's still planned to go in before the tax year ends: savings on each payday and money paid straight in
    var tyEnd = addDays(ymd(+tys.slice(0, 4) + 1, 3, 6), -1), planned = 0, owner = acc ? acc.owner : "";
    if (owner) {
      db.budgets.forEach(function (b) {
        if (b.person !== owner || b.mode !== "saving" || b.account !== accId) return;
        payDates(db, owner, addDays(date, 1), addDays(tyEnd, 1)).forEach(function (d) { if ((!b.start || d >= b.start) && (!b.end || d <= b.end)) planned += amountAt(db, b, d); });
      });
      db.income.forEach(function (i) { if (i.account === accId) occurrences(db, i, addDays(date, 1), addDays(tyEnd, 1)).forEach(function (o) { planned += o.amount; }); });
    }
    var onCourse = round(paid + planned);
    return {account: accId, name: accName(db, accId), balance: bal, paidThisYear: paid, paidBefore: before, allowanceLeft: round(Math.max(0, 4000 - paid)), bonusThisYear: bonus, taxYearStart: tys, taxYearEnd: tyEnd,
      planned: round(planned), onCourse: onCourse, overBy: round(Math.max(0, onCourse - 4000)), series: series};
  }

  // ---------- things to check ----------
  // settings rows "check:<id>" hold {t: what to check, a: action, v: what it opens}; "done" once confirmed
  function checks(db, p) {
    var s = db.set[p] || {}, out = [];
    Object.keys(s).forEach(function (k) {
      if (!/^check:/.test(k) || !s[k] || /^done$/i.test(String(s[k]))) return;
      var c; try { c = JSON.parse(s[k]); } catch (e) { c = {t: String(s[k])}; }
      out.push({id: k.slice(6), key: k, text: c.t || "", action: c.a || "", value: c.v || "", order: +c.o || 50});
    });
    return out.sort(function (a, b) { return a.order - b.order; });
  }
  function netWorth(db, p, date) {
    var bal = balances(db, date), own = 0, owe = 0, rows = [];
    accountsOf(db, p).forEach(function (a) { var v = round(bal[a.id] || 0); if (a.kind === "credit") { owe += -v; rows.push({name: a.name, amount: v, owe: true}); } else { own += v; rows.push({name: a.name, amount: v}); } });
    db.loans.forEach(function (l) {
      var left = round((+l.amount || 0) - loanPaid(db, l, date)); if (left <= 0) return;
      if (l.lender === p) { own += left; rows.push({name: person(db, l.borrower).name + " owes you: " + l.name, amount: left}); }
      if (l.borrower === p) { owe += left; rows.push({name: "You owe " + person(db, l.lender).name + ": " + l.name, amount: -left, owe: true}); }
    });
    return {own: round(own), owe: round(owe), total: round(own - owe), rows: rows};
  }
  function loans(db, p, date) {
    return db.loans.filter(function (l) { return l.lender === p || l.borrower === p; }).map(function (l) {
      var paid = loanPaid(db, l, date), left = round((+l.amount || 0) - paid);
      return {id: l.id, name: l.name, lender: l.lender, borrower: l.borrower, amount: +l.amount || 0, paid: paid, left: left, pct: l.amount ? Math.round(paid / l.amount * 100) : 0, plan: loanPlan(db, l).filter(function (r) { return !r.paid; })};
    });
  }

  // ---------- partner summary (what the other person sees) ----------
  function summary(db, p, date) {
    var t = today(db, p, date), share = function (k, d) { var v = setting(db, p, "share." + k, d); return v === true || /^(true|yes|on|1)$/i.test(String(v)); };
    var out = {person: p, name: person(db, p).name, status: t.status, nextPay: t.nextPay, period: t.period};
    if (share("totals", true)) { out.safe = t.safe; out.saved = t.plan.totals.save; }
    if (share("cats", true)) out.tiles = t.tiles.map(function (x) { return {name: x.name, spent: x.spent, amount: x.amount, pct: x.pct, paceMark: x.paceMark, mode: x.mode}; });
    if (share("goals", true)) out.goals = goals(db, p, date).filter(function (g) { return String((db.byId[g.id] || {}).owners || "").split(/[,\s]+/).length < 2; });
    return out;
  }

  // ---------- helpers for display ----------
  function money(n) { var v = Math.abs(+n || 0), s = v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ","); return (n < -0.004 ? "-£" : "£") + s; }
  var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  function nice(s) { if (!isIso(s)) return ""; return DAYS[dow(s)] + " " + (+s.slice(8, 10)) + " " + MONTHS[+s.slice(5, 7) - 1]; }
  function describe(it) {
    var u = String(it.unit || "month").toLowerCase(), e = +it.every || 1, on = String(it.on || (it.start ? +it.start.slice(8, 10) : "")).toLowerCase();
    var ord = function (n) { n = +n; return n + (n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"); };
    var onTxt = /^\d+$/.test(on) ? "on the " + ord(on) : on ? "on the " + on : "";
    if (u === "once") return "Once, " + nice(it.start);
    if (u === "dates") return "On set dates";
    if (u === "week" || u === "weeks") return e === 1 ? "Every week" : "Every " + e + " weeks";
    if (u === "year" || u === "years") return "Every year, " + (it.start ? (+it.start.slice(8, 10)) + " " + MONTHS[+it.start.slice(5, 7) - 1] : "");
    return (e === 1 ? "Every month " : e === 3 ? "Every 3 months " : "Every " + e + " months ") + onTxt;
  }

  return {
    VERSION: VERSION, TABLES: TABLES,
    load: load, occurrences: occurrences, scheduleDates: scheduleDates, isWorkingDay: isWorkingDay, bankHolidays: bankHolidays,
    periods: periods, periodAt: periodAt, prevPeriod: prevPeriod, nextPeriod: nextPeriod, planFor: planFor, payday: payday,
    budgetState: budgetState, balances: balances, flows: flows, todo: todo, between: between, today: today, coming: coming,
    calendar: calendar, pots: pots, monthView: monthView, year: year, goals: goals, lisa: lisa, checks: checks, netWorth: netWorth, loans: loans,
    summary: summary, shareOf: shareOf, amountAt: amountAt, setting: setting, partnerOf: partnerOf, mainOf: mainOf, fallbackOf: fallbackOf,
    accountsOf: accountsOf, accName: accName, person: person, startOf: startOf,
    money: money, nice: nice, describe: describe, addDays: addDays, diff: diff, parseDate: parseDate, isIso: isIso, round: round
  };
});
