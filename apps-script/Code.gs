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
  meta: ["key", "value"]
};
var HELP = {
  people: "One row per person.", accounts: "Every bank account, pot, Space, ISA and LISA. kind: main, pot, saving, isa, lisa, pension, credit. fallback = TRUE on the one pot that covers going over budget.",
  income: "Money that comes in on a schedule. isPay = TRUE for your salary (it sets your pay periods).", bills: "Money that goes out on a schedule. split: a row id from splits if you share it.",
  budgets: "mode: daily, weekly, oneoff, saving or remainder (gets whatever is left).", splits: "shares: \"ethan:2, sophie:1\" for parts, or \"sophie=375\" for a fixed amount.",
  transfers: "One of you paying the other on a schedule, like a rent share.", transactions: "Every payment you log.", moves: "Pot moves you ticked off in the app.",
  settlements: "One-off payments between you two. loan: a row id from loans if it repays one.", loans: "Money one of you owes the other. repay: amount each month from repayFrom.",
  goals: "owners: who it belongs to. accounts: which accounts count towards it.", valuations: "A balance you checked. Everything after its date is worked out.",
  amounts: "A price or pay change for a bill, income or budget, from the start date.", exceptions: "A change to one date: skip, move (newDate) or amount (what it really was).",
  settings: "Settings for each person.", gifts: "Gift ideas and what you bought. Only you see your own list.", meta: "Housekeeping."
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
function doGet(e) { return handle_((e && e.parameter) || {}); }
function doPost(e) {
  var body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || "{}"); } catch (x) {}
  return handle_(body);
}
function handle_(b) {
  var lock = LockService.getScriptLock();
  try {
    var me = whoIs_(b.key);
    if (b.action === "ping") return json_({ok: true, person: me});
    var applied = [];
    if (b.ops && b.ops.length) { lock.waitLock(25000); applied = applyOps_(me, b.ops); SpreadsheetApp.flush(); lock.releaseLock(); }
    var out = sync_(me, b.since || "", !!b.full);
    out.applied = applied;
    if (applied.length) { try { maybeRefreshViews_(); } catch (x) { out.viewError = String(x); } }
    return json_(out);
  } catch (err) {
    try { lock.releaseLock(); } catch (x) {}
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
function strip_(r) { var o = {}; for (var k in r) if (k !== "_row") o[k] = r[k]; return o; }
function setMeta_(k, v) { var t = readTable_("meta"), row = t.rows.filter(function (r) { return r.key === k; })[0]; if (row) t.sheet.getRange(row._row, 2).setValue(v); else t.sheet.appendRow([k, v]); CACHE_.meta = null; }

// ---------- who may see and change what ----------
function owner_(t, r) {
  switch (t) {
    case "accounts": return [r.owner];
    case "income": case "bills": case "budgets": case "transactions": case "moves": case "settings": case "gifts": return [r.person];
    case "transfers": case "settlements": return [r.from, r.to];
    case "loans": return [r.lender, r.borrower];
    case "goals": return String(r.owners || "").split(/[,\s]+/);
    case "valuations": var a = byId_("accounts", r.account); return a ? [a.owner] : [];
    case "amounts": case "exceptions": var it = itemOwner_(r.item); return it;
    default: return null; // people, splits, meta: shared
  }
}
function byId_(t, id) { return readTable_(t).rows.filter(function (r) { return r.id === id; })[0] || null; }
function itemOwner_(id) {
  var tabs = ["income", "bills", "budgets", "transfers", "loans"];
  for (var i = 0; i < tabs.length; i++) { var r = byId_(tabs[i], id); if (r) return owner_(tabs[i], r); }
  return [];
}
function canSee_(me, t, r, sharing) {
  if (t === "meta") return true;
  var o = owner_(t, r); if (o === null || o.indexOf(me) >= 0) return true;
  // the partner's own things: names and shared items only
  if (t === "accounts" || t === "people") return true;
  if (t === "transactions") return !!r.split || sharing.payments;
  if (t === "settings") return /^share\.|^theme|^colour/.test(String(r.key));
  if (t === "bills") return !!r.split || sharing.payments;
  if (t === "valuations") { var a = byId_("accounts", r.account); return sharing.payments || (a && /lisa/.test(a.kind)); }
  if (t === "income" || t === "budgets") return sharing.payments;
  if (t === "amounts" || t === "exceptions") return true;
  return false;
}

// ---------- writing ----------
function applyOps_(me, ops) {
  var now = Date.now(), done = [];
  ops.forEach(function (op) {
    var t = op.table; if (!SCHEMA[t] || t === "meta") throw new Error("Unknown table " + t);
    var tab = readTable_(t), sh = tab.sheet || ensureTab_(ss_(), t);
    var id = op.id || (op.row && op.row.id); if (!id) throw new Error("Missing id");
    var existing = tab.rows.filter(function (r) { return r.id === id; })[0];
    var row = existing ? strip_(existing) : {};
    if (op.op === "delete") { if (!existing) return; row.deleted = true; }
    else { var src = op.row || op.fields || {}; for (var k in src) if (k !== "updated" && k !== "by") row[k] = src[k]; row.id = id; }
    var who = owner_(t, row);
    if (who !== null && who.indexOf(me) < 0) throw new Error("You can't change that (" + t + ")");
    if (existing) { var ow = owner_(t, existing); if (ow !== null && ow.indexOf(me) < 0) throw new Error("You can't change that (" + t + ")"); }
    row.updated = now; row.by = me;
    var head = tab.head.length ? tab.head : SCHEMA[t].concat(COMMON);
    Object.keys(row).forEach(function (k) { if (head.indexOf(k) < 0 && (SCHEMA[t].indexOf(k) >= 0 || COMMON.indexOf(k) >= 0)) { sh.getRange(1, head.length + 1).setValue(k); head.push(k); } });
    var line = head.map(function (h) { var v = row[h]; return v === undefined || v === null ? "" : v; });
    if (existing) sh.getRange(existing._row, 1, 1, line.length).setValues([line]);
    else sh.appendRow(line);
    CACHE_[t] = null;
    done.push({table: t, id: id});
  });
  return done;
}

// ---------- sync ----------
function sync_(me, since, full) {
  var tables = allTables_(), sharingOf = function (p) { var s = {}; tables.settings.forEach(function (r) { if (r.person === p && /^share\./.test(r.key)) s[r.key.slice(6)] = /^(true|yes|on|1)$/i.test(String(r.value)); }); return s; };
  var partner = (tables.people.filter(function (p) { return p.id === me; })[0] || {}).partner || "";
  var sharing = sharingOf(partner), rows = {}, count = 0;
  Object.keys(tables).forEach(function (t) {
    rows[t] = tables[t].filter(function (r) { return (full || !since || (+r.updated || 0) > +since - 5000 || t === "meta") && canSee_(me, t, r, sharing); });
    count += rows[t].length;
  });
  var today = Utilities.formatDate(new Date(), tz_(), "yyyy-MM-dd"), summary = null;
  if (partner) { try { summary = Budgie.summary(Budgie.load(tables, today), partner, today); } catch (x) { summary = {error: String(x)}; } }
  return {ok: true, person: me, now: Date.now(), today: today, full: full || !since, rows: rows, count: count, partnerSummary: summary, engine: Budgie.VERSION, schema: SCHEMA_VERSION};
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
function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("refreshBudgetTabs").timeBased().everyHours(1).create();
  Logger.log("The budget tabs now refresh every hour, and a minute after any change from the app.");
}
