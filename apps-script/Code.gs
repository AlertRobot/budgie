/**
 * Budgie: the backend for the "Budgie data" Google Sheet.
 * Engine.gs (the same engine.js the app uses) must sit beside this file.
 *
 * Setup (once):
 *   1. In the sheet: Extensions > Apps Script. Paste this into Code.gs and engine.js into a file called Engine.gs. Save.
 *   2. Run "setup". Allow access when Google asks. It makes every tab and a key for each person.
 *   3. Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone. Deploy and copy the URL.
 *   4. Paste the URL into WEB_APP_URL below, save, run "connectLinks". Open each link on that person's phone.
 *
 * Keys live only in this script's properties. Run "newKey" with a name to change someone's key.
 */
var WEB_APP_URL = "";
var APP_URL = "https://alertrobot.github.io/budgie/";
var SCHEMA_VERSION = 1;
var COMMON = ["deleted", "updated", "by"];
var SCHEMA = {
  people: ["id", "name", "bank", "potWord", "partner", "colour"],
  accounts: ["id", "owner", "name", "kind", "purpose", "fallback", "order"],
  income: ["id", "person", "name", "amount", "account", "isPay", "unit", "every", "on", "shift", "start", "end", "dates", "notes"],
  bills: ["id", "person", "name", "category", "amount", "account", "split", "variable", "unit", "every", "on", "shift", "start", "end", "dates", "notes"],
  budgets: ["id", "person", "name", "amount", "mode", "account", "carry", "start", "end", "notes"],
  splits: ["id", "name", "shares", "notes"],
  transfers: ["id", "from", "to", "name", "amount", "fromAccount", "toAccount", "purpose", "unit", "every", "on", "shift", "start", "end", "dates", "notes"],
  transactions: ["id", "date", "person", "amount", "budget", "account", "split", "note", "source"],
  moves: ["id", "date", "person", "from", "to", "amount", "key", "note"],
  settlements: ["id", "date", "from", "to", "amount", "fromAccount", "toAccount", "loan", "key", "note"],
  loans: ["id", "lender", "borrower", "name", "amount", "date", "account", "repay", "repayFrom", "repayDay", "notes"],
  goals: ["id", "owners", "name", "target", "due", "accounts", "kind", "extra", "price", "notes"],
  valuations: ["id", "account", "date", "amount", "note"],
  amounts: ["id", "item", "start", "amount", "note"],
  exceptions: ["id", "item", "date", "action", "newDate", "amount", "note"],
  settings: ["id", "person", "key", "value"],
  gifts: ["id", "person", "name", "idea", "occasion", "date", "limit", "cost", "bought", "notes"],
  prices: ["id", "fund", "date", "price", "source"],
  meta: ["key", "value"]
};
// tables only this script writes: the app can read them but never change them
var SERVER_ONLY = {meta: true, prices: true};
var HELP = {
  people: "One row per person.", accounts: "Every bank account, pot, Space, ISA and LISA. kind: main, pot, saving, isa, lisa, pension, credit. fallback = TRUE on the one pot that covers going over budget.",
  income: "Money that comes in on a schedule. isPay = TRUE for your salary (it sets your pay periods).", bills: "Money that goes out on a schedule. split: a row id from splits if you share it.",
  budgets: "mode: daily, weekly, oneoff, saving or remainder (gets whatever is left).", splits: "shares: \"ethan:2, sophie:1\" for parts, or \"sophie=375\" for a fixed amount.",
  transfers: "One of you paying the other on a schedule, like a rent share.", transactions: "Every payment you log.", moves: "Pot moves you ticked off in the app.",
  settlements: "One-off payments between you two. loan: a row id from loans if it repays one.", loans: "Money one of you owes the other. repay: amount each month from repayFrom.",
  goals: "owners: who it belongs to. accounts: which accounts count towards it.", valuations: "A balance you checked. Everything after its date is worked out.",
  amounts: "A price or pay change for a bill, income or budget, from the start date.", exceptions: "A change to one date: skip, move (newDate) or amount (what it really was).",
  settings: "Settings for each person.", gifts: "Gift ideas and what you bought. Only you see your own list.", prices: "Fund prices for the LISA tracker, filled in by the script.", meta: "Housekeeping."
};

// ---------- setup ----------
function setup() {
  var ss = ss_();
  if (/^Untitled/.test(ss.getName())) ss.rename("Budgie data");
  try { ss.setSpreadsheetTimeZone("Europe/London"); } catch (x) {}
  Object.keys(SCHEMA).forEach(function (t) { ensureTab_(ss, t); });
  var props = PropertiesService.getScriptProperties();
  readTable_("people").rows.forEach(function (p) { if (!props.getProperty("KEY_" + p.id)) props.setProperty("KEY_" + p.id, makeKey_()); });
  setMeta_("schemaVersion", SCHEMA_VERSION);
  var blank = ss.getSheetByName("Sheet1"); if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);
  Logger.log("Tabs ready. People with keys: " + readTable_("people").rows.map(function (p) { return p.id; }).join(", "));
  Logger.log("Next: Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone), paste the URL into WEB_APP_URL, run connectLinks.");
}
function connectLinks() {
  var url = WEB_APP_URL || ScriptApp.getService().getUrl() || "";
  if (!/\/exec$/.test(url)) throw new Error("Paste your Web app URL (ending /exec) into WEB_APP_URL at the top, save, and run again.");
  var props = PropertiesService.getScriptProperties();
  readTable_("people").rows.forEach(function (p) {
    var k = props.getProperty("KEY_" + p.id); if (!k) return;
    Logger.log(p.name + ": " + APP_URL + "#connect=" + Utilities.base64EncodeWebSafe(JSON.stringify({u: url, k: k})));
  });
}
function newKey(personId) {
  if (!personId) throw new Error("Run newKey from another function, e.g. newKey('sophie').");
  PropertiesService.getScriptProperties().setProperty("KEY_" + personId, makeKey_());
  Logger.log("New key made for " + personId + ". Run connectLinks and reconnect that phone.");
}
function makeKey_() { return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ""); }
function ensureTab_(ss, t) {
  var cols = SCHEMA[t].concat(t === "meta" ? [] : COMMON), sh = ss.getSheetByName(t);
  if (!sh) { sh = ss.insertSheet(t); sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight("bold").setBackground("#E3ECF5"); sh.setFrozenRows(1); sh.getRange(1, 1).setNote(HELP[t] || ""); return sh; }
  var head = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map(String);
  cols.forEach(function (c) { if (head.indexOf(c) < 0) { sh.getRange(1, head.length + 1).setValue(c).setFontWeight("bold").setBackground("#E3ECF5"); head.push(c); } });
  return sh;
}

// ---------- web ----------
// keys only travel in POST bodies, never in a URL (where they'd end up in logs and history)
function doGet(e) { return json_({ok: true, app: "Budgie", note: "The app talks to this with POST."}); }
function doPost(e) {
  var body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || "{}"); } catch (x) {}
  return handle_(body);
}
// ok:false only when the whole request fails (wrong key, the sheet busy). Changes that can't be saved come back
// in rejected [{i, table, id, error}] (i = position in the batch); every other change was saved.
function handle_(b) {
  var lock = LockService.getScriptLock(), locked = false;
  try {
    var me = whoIs_(b.key);
    if (b.action === "ping") return json_({ok: true, person: me});
    var applied = [], rejected = [], snap;
    // reads take the lock too, so a sync never sees half of another phone's batch and skips the rest;
    // the lock covers writing and taking a copy of the tables, the working out happens after it's released
    lock.waitLock(25000); locked = true;
    try {
      if (Array.isArray(b.ops) && b.ops.length) { var res = applyOps_(me, b.ops); applied = res.applied; rejected = res.rejected; if (applied.length) SpreadsheetApp.flush(); }
      snap = snapshot_();
    } finally { lock.releaseLock(); locked = false; }
    var out = sync_(me, b.since || "", !!b.full, snap);
    out.applied = applied; out.rejected = rejected;
    if (applied.length) { try { maybeRefreshViews_(); } catch (x) { out.viewError = String(x); } }
    return json_(out);
  } catch (err) {
    if (locked) { try { lock.releaseLock(); } catch (x) {} }
    return json_({ok: false, error: String(err && err.message || err)});
  }
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function whoIs_(k) {
  if (!k) throw new Error("No app key");
  var all = PropertiesService.getScriptProperties().getProperties();
  for (var name in all) if (/^KEY_/.test(name) && all[name] === String(k)) return name.slice(4);
  throw new Error("Wrong app key");
}

// ---------- reading ----------
var SS_ = null, TZ_ = null, CACHE_ = {};
function ss_() { if (!SS_) SS_ = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("SHEET_ID")); return SS_; }
function tz_() { if (!TZ_) TZ_ = ss_().getSpreadsheetTimeZone() || "Europe/London"; return TZ_; }
function out_(v) { return v instanceof Date ? Utilities.formatDate(v, tz_(), "yyyy-MM-dd") : v; }
function readTable_(t) {
  if (CACHE_[t]) return CACHE_[t];
  var sh = ss_().getSheetByName(t); if (!sh) return {head: [], rows: [], sheet: null};
  var vals = sh.getDataRange().getValues(), head = (vals[0] || []).map(String), rows = [];
  for (var r = 1; r < vals.length; r++) {
    var o = {_row: r + 1}, any = false;
    for (var c = 0; c < head.length; c++) { if (!head[c]) continue; var v = out_(vals[r][c]); o[head[c]] = v; if (v !== "" && v !== null) any = true; }
    if (any) rows.push(o);
  }
  CACHE_[t] = {head: head, rows: rows, sheet: sh}; return CACHE_[t];
}
function allTables_() { var t = {}; Object.keys(SCHEMA).forEach(function (k) { t[k] = readTable_(k).rows.map(strip_); }); return t; }
// rows by id, built once per read of a tab (the first row wins if an id is ever repeated)
function index_(t) { var tab = readTable_(t); if (!tab.idx) { tab.idx = {}; tab.rows.forEach(function (r) { if (r.id !== undefined && r.id !== "" && !tab.idx[r.id]) tab.idx[r.id] = r; }); } return tab.idx; }
function strip_(r) { var o = {}; for (var k in r) if (k !== "_row") o[k] = r[k]; return o; }
function setMeta_(k, v) { var t = readTable_("meta"), row = t.rows.filter(function (r) { return r.key === k; })[0]; if (row) t.sheet.getRange(row._row, 2).setValue(v); else t.sheet.appendRow([k, v]); CACHE_.meta = null; }

// ---------- who may see and change what ----------
function owner_(t, r) {
  switch (t) {
    case "people": return [r.id];
    case "accounts": return [r.owner];
    case "income": case "bills": case "budgets": case "transactions": case "moves": case "settings": case "gifts": return [r.person];
    case "transfers": case "settlements": return [r.from, r.to];
    case "loans": return [r.lender, r.borrower];
    case "goals": return String(r.owners || "").split(/[,\s]+/);
    case "valuations": var a = byId_("accounts", r.account); return a ? [a.owner] : [];
    case "amounts": case "exceptions": var it = itemOwner_(r.item); return it;
    default: return null; // splits, prices, meta: shared
  }
}
function byId_(t, id) { return index_(t)[id] || null; }
var ITEM_TABS_ = ["income", "bills", "budgets", "transfers", "loans"];
function findItem_(id) {
  for (var i = 0; i < ITEM_TABS_.length; i++) { var r = byId_(ITEM_TABS_[i], id); if (r) return {t: ITEM_TABS_[i], row: r}; }
  return null;
}
function itemOwner_(id) { var it = findItem_(id); return it ? owner_(it.t, it.row) : []; }
function isLisa_(accId) { var a = accId ? byId_("accounts", accId) : null; return !!a && /lisa/.test(String(a.kind)); }
function canSee_(me, t, r, sharing) {
  if (t === "meta" || t === "prices") return true;
  var o = owner_(t, r); if (o === null || o.indexOf(me) >= 0) return true;
  // the partner's own things: names, shared items, and their LISA (it counts towards the house)
  if (t === "accounts" || t === "people") return true;
  if (t === "transactions") return !!r.split || !!sharing.payments;
  if (t === "settings") return /^(share\.|theme|colour|start$|lisa\.)/.test(String(r.key));
  if (t === "bills") return !!r.split || !!sharing.payments;
  if (t === "valuations") return !!sharing.payments || isLisa_(r.account);
  if (t === "income" || t === "budgets") return !!sharing.payments || isLisa_(r.account);
  if (t === "moves") return isLisa_(r.to) || isLisa_(r.from);
  // a price change or a one-off change is only as visible as the thing it changes (an actual pay, a private bill)
  if (t === "amounts" || t === "exceptions") { var it = findItem_(r.item); return !!it && canSee_(me, it.t, it.row, sharing); }
  return false;
}

// ---------- writing ----------
// each change is saved or refused on its own, so one refused change never holds up the rest
function applyOps_(me, ops) {
  var now = Date.now(), applied = [], rejected = [];
  ops.forEach(function (op, i) {
    var t = op && op.table, id = op && (op.id || (op.row && op.row.id));
    try { applyOne_(me, op || {}, now); applied.push({table: t, id: id}); }
    catch (e) { rejected.push({i: i, table: t || "", id: id || "", error: String(e && e.message || e)}); }
  });
  return {applied: applied, rejected: rejected};
}
// text that a sheet would read as a formula is stored as plain text
function cell_(v) {
  if (v === undefined || v === null) return "";
  if (typeof v === "string" && /^[=+\-@]/.test(v) && !/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(v)) return "'" + v;
  return v;
}
function applyOne_(me, op, now) {
  var t = op.table;
  if (!SCHEMA[t]) throw new Error("Unknown table " + t);
  if (SERVER_ONLY[t]) throw new Error("The sheet fills in " + t + " itself");
  var id = op.id || (op.row && op.row.id); if (!id) throw new Error("Missing id");
  var tab = readTable_(t), sh = tab.sheet || ensureTab_(ss_(), t);
  var existing = byId_(t, id);
  var row = existing ? strip_(existing) : {};
  if (op.op === "delete") { if (!existing) return; row.deleted = true; }
  else { var src = op.row || op.fields || {}; for (var k in src) if (k !== "updated" && k !== "by" && k !== "_row") row[k] = src[k]; row.id = id; }
  // people are set up in the sheet; you can change your own name or colour, never who your partner is
  if (t === "people") {
    if (!existing) throw new Error("People are added in the sheet");
    if (op.op === "delete") throw new Error("You can't delete a person");
    if (String(row.partner || "") !== String(existing.partner || "")) throw new Error("Partners are set in the sheet");
  }
  var who = owner_(t, row);
  if (who !== null && who.indexOf(me) < 0) throw new Error("You can't change that (" + t + ")");
  if (existing) { var ow = owner_(t, existing); if (ow !== null && ow.indexOf(me) < 0) throw new Error("You can't change that (" + t + ")"); }
  row.updated = now; row.by = me;
  var head = tab.head.length ? tab.head : SCHEMA[t].concat(COMMON);
  Object.keys(row).forEach(function (k) { if (head.indexOf(k) < 0 && (SCHEMA[t].indexOf(k) >= 0 || COMMON.indexOf(k) >= 0)) { sh.getRange(1, head.length + 1).setValue(k); head.push(k); } });
  tab.head = head;
  var line = head.map(function (h) { return cell_(row[h]); });
  // keep the copy of the tab in step, rather than reading the whole tab again after every change
  if (existing) {
    sh.getRange(existing._row, 1, 1, line.length).setValues([line]);
    Object.keys(row).forEach(function (k) { existing[k] = row[k]; });
  } else {
    sh.appendRow(line);
    var added = {_row: sh.getLastRow()}; Object.keys(row).forEach(function (k) { added[k] = row[k]; });
    tab.rows.push(added); if (tab.idx) tab.idx[id] = added;
  }
}

// ---------- sync ----------
// a copy of every tab, and the time it was taken (before reading, so nothing written after it is missed)
function snapshot_() { var at = Date.now(); return {at: at, tables: allTables_()}; }
// tables where one row can stop being visible on its own (a split taken off, a budget moved off a LISA)
var HIDE_ROWS_ = {transactions: true, bills: true, budgets: true, income: true, moves: true, amounts: true, exceptions: true};
function sync_(me, since, full, snap) {
  snap = snap || snapshot_();
  var at = snap.at, tables = snap.tables, recent = function (r) { return (+r.updated || 0) > +since - 5000; };
  var sharingOf = function (p) { var s = {}; tables.settings.forEach(function (r) { if (r.person === p && /^share\./.test(r.key)) s[r.key.slice(6)] = /^(true|yes|on|1)$/i.test(String(r.value)); }); return s; };
  var personRow = function (id) { return tables.people.filter(function (p) { return p.id === id; })[0] || null; };
  // your partner is whoever your row names, as long as their row names you back (and it isn't you)
  var partner = (personRow(me) || {}).partner || "", pr = personRow(partner);
  if (!partner || partner === me || !pr || pr.partner !== me) partner = "";
  var sharing = partner ? sharingOf(partner) : {};
  full = full || !since;
  // what your partner shares, who is whose partner, or what kind an account is changed: send everything again,
  // so rows that just became visible arrive and rows that just became private go
  if (!full && (tables.settings.some(function (r) { return r.person === partner && /^share\./.test(r.key) && recent(r); }) || tables.people.some(recent) || tables.accounts.some(recent))) full = true;
  var rows = {}, count = 0, needStub = {};
  Object.keys(tables).forEach(function (t) {
    rows[t] = [];
    tables[t].forEach(function (r) {
      if (!(full || recent(r) || t === "meta")) return;
      if (canSee_(me, t, r, sharing)) {
        rows[t].push(r);
        // your partner's split payment names their budget, so the app can match it to yours ("Food")
        if (t === "transactions" && r.person !== me && r.budget) needStub[r.budget] = true;
      } else if (!full && HIDE_ROWS_[t]) rows[t].push({id: r.id, deleted: true});   // it may have been visible before
    });
  });
  // the partner's budgets you can't see, cut down to what matching needs
  var sent = {}; rows.budgets.forEach(function (r) { if (!r.deleted) sent[r.id] = true; });
  rows.budgets = rows.budgets.filter(function (r) { return !(r.deleted && needStub[r.id]); });
  tables.budgets.forEach(function (b) { if (needStub[b.id] && !sent[b.id]) rows.budgets.push({id: b.id, person: b.person, name: b.name, hidden: true, updated: b.updated, deleted: b.deleted}); });
  Object.keys(rows).forEach(function (t) { count += rows[t].length; });
  var today = Utilities.formatDate(new Date(), tz_(), "yyyy-MM-dd"), summary = null;
  if (partner) summary = partnerSummary_(tables, partner, today);
  return {ok: true, person: me, now: at, today: today, full: full, rows: rows, count: count, partnerSummary: summary, engine: Budgie.VERSION, schema: SCHEMA_VERSION};
}
// worked out once per change and day, then kept for a few hours (each phone asks every minute)
function partnerSummary_(tables, partner, today) {
  var latest = 0; Object.keys(tables).forEach(function (t) { tables[t].forEach(function (r) { var u = +r.updated || 0; if (u > latest) latest = u; }); });
  var key = "sum:" + Budgie.VERSION + ":" + partner + ":" + today + ":" + latest, cache = null;
  try { cache = typeof CacheService !== "undefined" ? CacheService.getScriptCache() : null; var hit = cache && cache.get(key); if (hit) return JSON.parse(hit); } catch (x) { cache = null; }
  var summary;
  try { summary = Budgie.summary(Budgie.load(tables, today), partner, today); } catch (x) { return {error: String(x)}; }
  try { if (cache) cache.put(key, JSON.stringify(summary), 21600); } catch (x) {}
  return summary;
}

// edits typed straight into the sheet get a new "updated" time, so phones pick them up on their next sync
// (a simple trigger: Apps Script runs it by itself, nothing to install)
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    var sh = e.range.getSheet(), t = sh.getName(); if (!SCHEMA[t] || t === "meta") return;
    var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String), uc = head.indexOf("updated") + 1, bc = head.indexOf("by") + 1;
    if (!uc) return;
    var r0 = Math.max(2, e.range.getRow()), r1 = e.range.getLastRow(); if (r1 < r0) return;
    if (e.range.getColumn() >= uc && e.range.getLastColumn() <= uc) return;   // only the updated column itself
    var now = Date.now(), times = [], who = [];
    for (var r = r0; r <= r1; r++) { times.push([now]); who.push(["sheet"]); }
    sh.getRange(r0, uc, times.length, 1).setValues(times);
    if (bc && !(e.range.getColumn() <= bc && e.range.getLastColumn() >= bc)) sh.getRange(r0, bc, who.length, 1).setValues(who);
  } catch (x) {}
}

// ---------- the official budget tabs ("Ethan budget", "Sophie budget") ----------
function maybeRefreshViews_() {
  var props = PropertiesService.getScriptProperties(), last = +props.getProperty("VIEWS_AT") || 0;
  if (Date.now() - last < 60000) return;
  refreshBudgetTabs(); props.setProperty("VIEWS_AT", String(Date.now()));
}
function refreshBudgetTabs() {
  CACHE_ = {};
  var today = Utilities.formatDate(new Date(), tz_(), "yyyy-MM-dd"), db = Budgie.load(allTables_(), today), ss = ss_();
  db.people.forEach(function (p) {
    var name = p.name + " budget", sh = ss.getSheetByName(name) || ss.insertSheet(name, 0);
    var cur = Budgie.periodAt(db, p.id, today), list = [cur], per = cur;
    for (var i = 0; i < 5; i++) { per = Budgie.nextPeriod(db, p.id, per); list.push(per); }
    var views = list.map(function (pk) { return Budgie.monthView(db, p.id, pk); });
    var head = ["", ].concat(list.map(function (pk) { return pk.name; }));
    var out = [[p.name + "'s budget (worked out by Budgie, don't type here)"].concat(list.map(function () { return ""; })), head,
      ["Starts"].concat(list.map(function (pk) { return Budgie.nice(pk.start); })), ["Next payday"].concat(list.map(function (pk) { return Budgie.nice(pk.next); }))];
    var sections = [["in", "Money in"], ["bill", "Bills"], ["spend", "Spending"], ["save", "Savings"], ["topup", "Top-ups"]];
    sections.forEach(function (sec) {
      var names = [];
      views.forEach(function (v) { v.lines.forEach(function (l) { if (l.kind === sec[0] && names.indexOf(l.name) < 0) names.push(l.name); }); });
      if (!names.length) return;
      out.push([""].concat(list.map(function () { return ""; })), [sec[1]].concat(list.map(function () { return ""; })));
      names.forEach(function (n) {
        out.push([n].concat(views.map(function (v) { var t = 0; v.lines.forEach(function (l) { if (l.kind === sec[0] && l.name === n) t += l.amount; }); return Budgie.round(t); })));
        if (sec[0] === "spend") out.push(["   spent so far"].concat(views.map(function (v) { var l = v.lines.filter(function (x) { return x.kind === "spend" && x.name === n; })[0]; return l && l.spent !== undefined ? l.spent : ""; })));
      });
      out.push(["Total " + sec[1].toLowerCase()].concat(views.map(function (v) { var t = 0; v.lines.forEach(function (l) { if (l.kind === sec[0]) t += l.amount; }); return Budgie.round(t); })));
    });
    out.push([""].concat(list.map(function () { return ""; })), ["Short of money"].concat(views.map(function (v) { return v.plan.shortfall || ""; })));
    out.push(["", "Updated " + Utilities.formatDate(new Date(), tz_(), "d MMM yyyy HH:mm")].concat(list.slice(1).map(function () { return ""; })));
    sh.clear(); sh.getRange(1, 1, out.length, out[0].length).setValues(out);
    sh.getRange(1, 1).setFontWeight("bold").setFontSize(13); sh.getRange(2, 1, 1, out[0].length).setFontWeight("bold");
    sh.getRange(3, 2, out.length - 2, out[0].length - 1).setNumberFormat("£#,##0.00;-£#,##0.00;-");
    sh.getRange(3, 2, 2, out[0].length - 1).setNumberFormat("@");
    out.forEach(function (r, i) { if (/^(Money in|Bills|Spending|Savings|Top-ups)$/.test(r[0]) || /^Total /.test(r[0])) sh.getRange(i + 1, 1, 1, r.length).setFontWeight("bold"); if (/^   spent/.test(r[0])) sh.getRange(i + 1, 1, 1, r.length).setFontColor("#566273"); });
    sh.setColumnWidth(1, 260); sh.setFrozenColumns(1); sh.setFrozenRows(2);
    sh.getRange(1, 1, out.length, out[0].length).protect().setWarningOnly(true);
  });
}
// replaces only its own trigger, so the daily fund prices trigger (Prices.gs) keeps running
function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === "refreshBudgetTabs") ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("refreshBudgetTabs").timeBased().everyHours(1).create();
  Logger.log("The budget tabs now refresh every hour, and a minute after any change from the app.");
}
