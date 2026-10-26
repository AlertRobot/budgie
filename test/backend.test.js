// Run with: node test/backend.test.js
const makeEnv = require("./fake-gas.js"), fixture = require("./fixture.js");
let fails = 0, passes = 0;
const near = (name, got, want) => ok(name, Math.abs(got - want) < 0.011, {got, want});
const ok = (name, cond, extra) => { cond ? passes++ : fails++; if (!cond) console.log("FAIL", name, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ""); };
const env = makeEnv(), c = env.ctx;
const call = (body) => JSON.parse(c.handle_(body).text);

// set up the tabs and load the household
c.setup();
const fx = fixture();
Object.keys(fx).forEach(t => {
  if (!env.sheets[t]) return;
  const sh = env.sheets[t], head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  fx[t].forEach(r => sh.appendRow(head.map(h => r[h] === undefined ? "" : r[h])));
});
c.CACHE_ = {};
// keys are made for people present at setup: run again now people exist
c.setup();
const kE = env.props.KEY_ethan, kS = env.props.KEY_sophie;
ok("keys for both", kE && kS && kE !== kS);
ok("wrong key refused", call({key: "nope"}).ok === false);

// first sync: full copy
const s1 = call({key: kE});
ok("sync ok", s1.ok, s1);
ok("Ethan sees his accounts", s1.rows.accounts.some(a => a.id === "e-main"));
ok("dates come back as dates", s1.rows.valuations[0].date === "2026-10-26", s1.rows.valuations[0]);
ok("partner summary worked out on the server", s1.partnerSummary && s1.partnerSummary.name === "Sophie", s1.partnerSummary);

// Ethan logs a payment; Sophie logs a private one and a split one
const r1 = call({key: kE, since: s1.now, ops: [{op: "put", table: "transactions", row: {id: "app-1", date: "2026-10-27", person: "ethan", amount: 12.5, budget: "e-food-b", account: "e-main"}}]});
ok("Ethan's payment saved", r1.ok && r1.applied.length === 1, r1);
ok("only changes come back", r1.rows.transactions.length === 1 && r1.rows.accounts.length < 3, r1.rows && r1.rows.accounts);
const r2 = call({key: kS, ops: [
  {op: "put", table: "transactions", row: {id: "app-2", date: "2026-10-27", person: "sophie", amount: 9, budget: "s-food", account: "s-main"}},
  {op: "put", table: "transactions", row: {id: "app-3", date: "2026-10-27", person: "sophie", amount: 20, budget: "s-food", account: "s-main", split: "half"}}
]});
ok("Sophie's payments saved", r2.ok && r2.applied.length === 2, r2);
// sending the same thing twice only saves it once
call({key: kS, ops: [{op: "put", table: "transactions", row: {id: "app-2", date: "2026-10-27", person: "sophie", amount: 9, budget: "s-food", account: "s-main"}}]});
c.CACHE_ = {};
ok("no duplicates", c.readTable_("transactions").rows.filter(r => r.id === "app-2").length === 1);

// privacy: Ethan sees Sophie's split payment but not her private one
c.CACHE_ = {};
const s2 = call({key: kE, full: true});
const ids = s2.rows.transactions.map(t => t.id);
ok("split payment shared", ids.includes("app-3"), ids);
ok("private payment hidden", !ids.includes("app-2"), ids);
// ...unless she shares each payment
call({key: kS, ops: [{op: "put", table: "settings", row: {id: "sophie:share.payments", person: "sophie", key: "share.payments", value: "true"}}]});
c.CACHE_ = {};
ok("shared when she turns it on", call({key: kE, full: true}).rows.transactions.some(t => t.id === "app-2"));

// nobody can change the other's things
const bad = call({key: kE, ops: [{op: "put", table: "transactions", row: {id: "app-2", person: "ethan", amount: 1}}]});
ok("can't overwrite Sophie's payment", bad.ok && bad.rejected.length === 1 && bad.rejected[0].id === "app-2" && !bad.applied.length, bad);
const bad2 = call({key: kE, ops: [{op: "put", table: "budgets", row: {id: "x", person: "sophie", name: "Sneaky", amount: 1}}]});
ok("can't add to Sophie's budget", bad2.ok && bad2.rejected.length === 1, bad2);

// deleting keeps the row, marked deleted
call({key: kE, ops: [{op: "delete", table: "transactions", id: "app-1"}]});
c.CACHE_ = {};
const row = c.readTable_("transactions").rows.find(r => r.id === "app-1");
ok("soft delete", row && row.deleted === true, row);

// budget tabs
c.CACHE_ = {};
c.refreshBudgetTabs();
ok("budget tabs written", env.sheets["Ethan budget"] && env.sheets["Sophie budget"] && env.sheets["Ethan budget"]._s.cells.length > 10);
const eb = env.sheets["Ethan budget"]._s.cells.map(r => r[0]);
ok("budget tab has sections", ["Money in", "Bills", "Spending", "Savings"].every(x => eb.includes(x)), eb);

// connect links
c.WEB_APP_URL = "https://script.google.com/macros/s/TEST/exec";
c.connectLinks();
ok("connect links made", env.logs.filter(l => /#connect=/.test(l)).length === 2, env.logs);

// ================= review fixes (1.3.0) =================
const B = require("../engine.js");
// a fresh sheet with the test household (mut changes the household first)
const fresh = (mut) => {
  const env = makeEnv(), c = env.ctx; c.setup(); const fx = fixture(); if (mut) mut(fx);
  Object.keys(fx).forEach(t => { const sh = env.sheets[t]; if (!sh) return; const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]; fx[t].forEach(r => sh.appendRow(head.map(h => r[h] === undefined ? "" : r[h]))); });
  c.CACHE_ = {}; c.setup();
  const call = (b) => { c.CACHE_ = {}; return JSON.parse(c.handle_(b).text); };
  return {env, c, call, kE: env.props.KEY_ethan, kS: env.props.KEY_sophie};
};
const wait = (ms) => { const t = Date.now(); while (Date.now() - t < ms) {} };
// a phone that keeps its tables and merges like the app
const phone = (F, k) => { const P = {T: {}, since: 0}; P.sync = (ops) => { const j = F.call({key: k, since: P.since, full: !P.since, ops}); if (!j.ok) return j; if (j.full) P.T = {}; Object.keys(j.rows).forEach(t => { P.T[t] = P.T[t] || []; j.rows[t].forEach(r => { const i = P.T[t].findIndex(x => (t === "meta" ? x.key === r.key : x.id === r.id)); if (i >= 0) P.T[t][i] = r; else P.T[t].push(r); }); }); P.since = j.now; return j; }; return P; };

// #2 nobody can make themselves their own partner, or change who anyone's partner is
{
  const F = fresh(t => t.transactions.push({id: "s-private", date: "2026-10-27", person: "sophie", amount: 55, budget: "s-food", account: "s-main"}));
  const r = F.call({key: F.kE, ops: [{op: "put", table: "people", row: {id: "ethan", partner: "ethan"}}, {op: "put", table: "settings", row: {id: "ethan:share.payments", person: "ethan", key: "share.payments", value: "true"}}, {op: "put", table: "people", row: {id: "sophie", name: "Hacked"}}, {op: "put", table: "people", row: {id: "ethan", colour: "teal"}}]});
  ok("#2 partner change refused", r.ok && r.rejected.map(x => x.i).join() === "0,2", r.rejected);
  ok("#2 own name or colour still fine", r.applied.some(x => x.table === "people" && x.id === "ethan"), r.applied);
  const s = F.call({key: F.kE, full: true});
  ok("#2 Sophie's private payment stays private", !s.rows.transactions.some(x => x.id === "s-private") && !s.rows.income.some(x => x.person === "sophie"));
  // even if the sheet names him as his own partner, he gets nothing extra
  const sh = F.env.sheets.people, head = sh._s.cells[0]; sh._s.cells.find(x => x[0] === "ethan")[head.indexOf("partner")] = "ethan";
  const s2 = F.call({key: F.kE, full: true});
  ok("#2 self as partner gives nothing and no summary", !s2.rows.transactions.some(x => x.id === "s-private") && s2.partnerSummary === null, s2.partnerSummary);
}

// #3 actual pay, pay rises and private bill changes aren't sent to the partner
{
  const F = fresh(t => {
    t.exceptions.push({id: "x-actual", item: "s-pay", date: "2026-11-27", action: "amount", amount: 1729.28}, {id: "x-split", item: "e-flat", date: "2026-11-01", action: "amount", amount: 480});
    t.amounts.push({id: "a-rise", item: "s-pay", start: "2027-04-01", amount: 2400}, {id: "a-lisa", item: "s-lisa-b", start: "2027-01-01", amount: 300});
    t.accounts.push({id: "s-lisa", owner: "sophie", name: "LISA", kind: "lisa"}); t.budgets.push({id: "s-lisa-b", person: "sophie", name: "LISA", amount: 250, mode: "saving", account: "s-lisa"});
  });
  const s = F.call({key: F.kE, full: true});
  ok("#3 Sophie's actual pay hidden", !s.rows.exceptions.some(x => x.id === "x-actual"), s.rows.exceptions);
  ok("#3 Sophie's pay rise hidden", !s.rows.amounts.some(x => x.id === "a-rise"), s.rows.amounts);
  ok("#3 a change to a shared bill is shared", s.rows.exceptions.some(x => x.id === "x-split"));
  ok("#3 her LISA saving and its changes are shared (house goal)", s.rows.budgets.some(x => x.id === "s-lisa-b") && s.rows.amounts.some(x => x.id === "a-lisa"));
  const own = F.call({key: F.kS, full: true});
  ok("#3 Sophie still sees her own", own.rows.exceptions.some(x => x.id === "x-actual") && own.rows.amounts.some(x => x.id === "a-rise"));
}

// #4 a refused change doesn't hold up the rest
{
  const F = fresh(t => t.transactions.push({id: "s-private", date: "2026-10-27", person: "sophie", amount: 55, budget: "s-food", account: "s-main"}));
  const ops = [{op: "put", table: "transactions", row: {id: "q1", date: "2026-10-28", person: "ethan", amount: 1, budget: "e-fun"}}, {op: "delete", table: "transactions", id: "s-private"},
    {op: "put", table: "transactions", row: {id: "q3", date: "2026-10-28", person: "ethan", amount: 3, budget: "e-fun"}}, {op: "put", table: "nope", row: {id: "z"}}, {op: "put", table: "prices", row: {id: "p", fund: "X", price: 1}}, {op: "put", table: "transactions", row: {}}];
  const r = F.call({key: F.kE, since: Date.now(), ops});
  ok("#4 ok with the refused ones listed", r.ok && JSON.stringify(r.rejected.map(x => [x.i, x.table, x.id])) === JSON.stringify([[1, "transactions", "s-private"], [3, "nope", "z"], [4, "prices", "p"], [5, "transactions", ""]]), r.rejected);
  ok("#4 the rest saved", r.applied.map(x => x.id).join() === "q1,q3", r.applied);
  F.c.CACHE_ = {}; ok("#4 in the sheet", F.c.readTable_("transactions").rows.filter(x => /^q/.test(x.id)).length === 2);
  ok("#4 wrong key is still a failure", F.call({key: "nope"}).ok === false);
}

// #5 the response says which engine it runs
{ const F = fresh(); ok("#5 engine version", F.call({key: F.kE}).engine === "1.3.0" && B.VERSION === "1.3.0"); }

// #16 the partner's split payment matches your budget on your own phone; partner start date and LISA moves arrive
{
  const F = fresh(t => {
    t.settings.find(s => s.person === "sophie").value = "2026-10-20";
    t.transactions.push({id: "e-split", date: "2026-10-27", person: "ethan", amount: 40, budget: "e-food-b", account: "e-food", split: "half"});
    t.moves.push({id: "e-lisa-mv", date: "2026-10-29", person: "ethan", from: "e-main", to: "e-lisa", amount: 333, key: "pay:2026-10-29:e-lisa"}, {id: "e-other-mv", date: "2026-10-29", person: "ethan", from: "e-main", to: "e-food", amount: 200, key: "pay:2026-10-29:e-food"});
  });
  const S = phone(F, F.kS); S.sync(); const E = phone(F, F.kE); E.sync();
  const food = B.today(B.load(S.T, "2026-10-28"), "sophie", "2026-10-28").tiles.find(t => t.name === "Food");
  ok("#16 Sophie's phone counts her half of Ethan's split shop", food && food.spent === 20, food);
  const stub = S.T.budgets.find(b => b.id === "e-food-b");
  ok("#16 Ethan's budget arrives as a name only", stub && stub.hidden && stub.amount === undefined && stub.account === undefined, stub);
  ok("#16 Ethan's phone knows when Sophie started", B.startOf(B.load(E.T), "sophie") === "2026-10-20");
  ok("#16 Ethan's LISA moves are shared, his other moves aren't", S.T.moves.some(m => m.id === "e-lisa-mv") && !S.T.moves.some(m => m.id === "e-other-mv"));
}

// #17 rows that become visible or private, and edits typed into the sheet, reach the other phone
{
  const F = fresh(); const E = phone(F, F.kE); E.sync();
  F.call({key: F.kS, ops: [{op: "put", table: "transactions", row: {id: "old-priv", date: "2026-10-27", person: "sophie", amount: 9, budget: "s-food", account: "s-main"}}, {op: "put", table: "transactions", row: {id: "sx", date: "2026-10-27", person: "sophie", amount: 60, budget: "s-food", account: "s-main", split: "half"}}]});
  wait(5100); E.sync();
  ok("#17 split arrives, private doesn't", E.T.transactions.some(x => x.id === "sx" && !x.deleted) && !E.T.transactions.some(x => x.id === "old-priv" && !x.deleted));
  near("#17 Ethan owes his half", B.between(B.load(E.T, "2026-10-28"), "ethan", "2026-10-28").iOwe, 30);
  F.call({key: F.kS, ops: [{op: "put", table: "transactions", row: {id: "sx", split: ""}}]});
  E.sync();
  near("#17 split taken off: Ethan's phone agrees nothing is owed", B.between(B.load(E.T, "2026-10-28"), "ethan", "2026-10-28").iOwe, 0);
  ok("#17 the row is gone from his phone", !B.load(E.T).transactions.some(x => x.id === "sx"));
  F.call({key: F.kS, ops: [{op: "put", table: "settings", row: {id: "sophie:share.payments", person: "sophie", key: "share.payments", value: "true"}}]});
  const j = E.sync();
  ok("#17 sharing on: older private rows arrive", j.full === true && B.load(E.T).transactions.some(x => x.id === "old-priv"));
  F.call({key: F.kS, ops: [{op: "put", table: "settings", row: {id: "sophie:share.payments", person: "sophie", key: "share.payments", value: "false"}}]});
  E.sync();
  ok("#17 sharing off: they leave his phone", !B.load(E.T).transactions.some(x => x.id === "old-priv"));
  // typed straight into the sheet
  const sh = F.env.sheets.transactions, head = sh._s.cells[0], ri = sh._s.cells.findIndex(x => x[0] === "sx");
  sh._s.cells[ri][head.indexOf("amount")] = 80; sh._s.cells[ri][head.indexOf("split")] = "half";
  F.c.CACHE_ = {}; F.c.onEdit({range: {getSheet: () => sh, getRow: () => ri + 1, getLastRow: () => ri + 1, getColumn: () => head.indexOf("amount") + 1, getLastColumn: () => head.indexOf("split") + 1}});
  E.sync();
  ok("#17 a sheet edit reaches the phone", (B.load(E.T).transactions.find(x => x.id === "sx") || {}).amount === 80, E.T.transactions.find(x => x.id === "sx"));
  ok("#17 and says who", sh._s.cells[ri][head.indexOf("by")] === "sheet");
}

// #18 a batch of changes doesn't read the whole tab again for each one
{
  const F = fresh(t => { for (let i = 0; i < 3000; i++) t.transactions.push({id: "old" + i, date: "2026-10-27", person: "ethan", amount: 1, budget: "e-fun", account: "e-main"}); });
  F.env.props.VIEWS_AT = String(Date.now());   // the budget tabs were just refreshed (that reads every tab, once a minute)
  let reads = 0; const sh = F.env.sheets.transactions, orig = sh.getDataRange; sh.getDataRange = () => { reads++; return orig(); };
  const ops = []; for (let i = 0; i < 40; i++) ops.push({op: "put", table: "transactions", row: {id: "n" + i, date: "2026-10-28", person: "ethan", amount: 2, budget: "e-fun", account: "e-main"}});
  ops.push({op: "put", table: "transactions", row: {id: "n3", amount: 5}});
  const r = F.call({key: F.kE, since: Date.now(), ops});
  ok("#18 one read of the tab for 41 changes", r.ok && r.applied.length === 41 && reads === 1, reads);
  F.c.CACHE_ = {}; const rows = F.c.readTable_("transactions").rows;
  ok("#18 and every change is in the sheet", rows.filter(x => /^n\d+$/.test(x.id)).length === 40 && rows.find(x => x.id === "n3").amount === 5 && rows.find(x => x.id === "n3").date === "2026-10-28");
  ok("#18 the reply has the new rows", r.rows.transactions.filter(x => /^n\d+$/.test(x.id)).length === 40, r.rows.transactions.length);
  // the partner summary is worked out once per change, not on every poll
  const s1 = F.call({key: F.kE}); const cached = Object.keys(F.env.cache).length; const s2 = F.call({key: F.kE});
  ok("#18 partner summary kept between polls", cached === 1 && JSON.stringify(s1.partnerSummary) === JSON.stringify(s2.partnerSummary) && Object.keys(F.env.cache).length === 1);
}

// #23 hardening: formulas stay text, no keys in URLs
{
  const F = fresh();
  F.call({key: F.kE, ops: [{op: "put", table: "transactions", row: {id: "fx", date: "2026-10-28", person: "ethan", amount: 2, budget: "e-fun", note: "=IMPORTDATA(\"https://x\")"}}, {op: "put", table: "transactions", row: {id: "neg", date: "2026-10-28", person: "ethan", amount: "-20", budget: "e-fun", note: "-20"}}]});
  F.c.CACHE_ = {}; const rows = F.c.readTable_("transactions").rows;
  ok("#23 a formula is kept as text", rows.find(x => x.id === "fx").note === "=IMPORTDATA(\"https://x\")" && JSON.stringify(F.env.sheets.transactions._s.cells).indexOf("'=IMPORT") < 0);
  ok("#23 a negative number is still a number", rows.find(x => x.id === "neg").note === "-20");
  const g = JSON.parse(F.c.doGet({parameter: {key: F.kE}}).text);
  ok("#23 GET gives no data", g.ok && !g.rows && !g.person);
}

// prices: everyone sees them, nobody writes them from the app
{
  const F = fresh(t => { t.prices = [{id: "pr1", fund: "GB00BJS8SJ34", date: "2026-10-26", price: 1234.5, source: "fidelity"}]; });
  ok("prices tab made", !!F.env.sheets.prices);
  const s = F.call({key: F.kS, full: true});
  ok("prices sent to everyone", s.rows.prices.length === 1 && s.rows.prices[0].price === 1234.5);
}

// triggers: installTriggers keeps the prices trigger
{
  const F = fresh(); F.env.triggers.push({getHandlerFunction: () => "updatePrices"}); F.c.installTriggers(); F.c.installTriggers();
  const names = F.env.triggers.map(t => t.getHandlerFunction()).sort();
  ok("installTriggers keeps the daily prices trigger", JSON.stringify(names) === JSON.stringify(["refreshBudgetTabs", "updatePrices"]), names);
}

// #5 the one-file backend (apps-script/Budgie.gs, made by migrate/build.js) must be built from the current files
{
  const fs = require("fs"), path = require("path"), dir = path.join(__dirname, ".."), bundle = path.join(dir, "apps-script/Budgie.gs");
  if (fs.existsSync(bundle)) {
    const b = fs.readFileSync(bundle, "utf8"), parts = ["engine.js", "apps-script/Code.gs", "apps-script/Prices.gs"].filter(f => fs.existsSync(path.join(dir, f)));
    const stale = parts.filter(f => b.indexOf(fs.readFileSync(path.join(dir, f), "utf8")) < 0);
    ok("#5 Budgie.gs is up to date (run node migrate/build.js)", !stale.length, stale);
  }
}
console.log(fails ? fails + " failed, " + passes + " passed" : "All " + passes + " passed");
process.exit(fails ? 1 : 0);
