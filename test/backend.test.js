// Run with: node test/backend.test.js
const makeEnv = require("./fake-gas.js"), fixture = require("./fixture.js");
let fails = 0, passes = 0;
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
ok("can't overwrite Sophie's payment", bad.ok === false, bad);
const bad2 = call({key: kE, ops: [{op: "put", table: "budgets", row: {id: "x", person: "sophie", name: "Sneaky", amount: 1}}]});
ok("can't add to Sophie's budget", bad2.ok === false, bad2);

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

console.log(fails ? fails + " failed, " + passes + " passed" : "All " + passes + " passed");
process.exit(fails ? 1 : 0);
